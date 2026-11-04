package com.casematch.app.auth

import android.content.SharedPreferences
import com.casematch.app.cloud.CloudBackend
import com.casematch.app.cloud.CloudSync
import com.casematch.app.cloud.isNoConnection
import com.casematch.app.cloud.isPermissionDenied
import com.casematch.app.cloud.isTooManyRequests
import com.casematch.app.cloud.isWrongPassword
import com.casematch.app.util.PasswordHasher
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext

enum class Role { ADMIN, WORKER }

sealed interface AuthState {
    data object Loading : AuthState
    /** Primer uso: todavía no hay contraseñas. */
    data object NeedsSetup : AuthState
    data class NeedsInternet(val message: String) : AuthState
    data class LoggedOut(val message: String? = null) : AuthState
    data class LoggedIn(val role: Role) : AuthState
}

/** Resultado de una acción de Configuración: mensaje para mostrar y si salió bien. */
data class ActionResult(val ok: Boolean, val message: String)

/**
 * Sesiones con contraseña (sin usuario ni correo).
 *
 * - La sesión queda guardada en el teléfono: no se vuelve a pedir la contraseña al abrir la app.
 * - Trabajador: no puede cerrar sesión. Su sesión se cierra sola cuando el administrador cambia
 *   la contraseña de trabajador (se detecta al abrir la app o al instante si hay internet).
 * - Sin internet se sigue usando la última sesión válida.
 */
class AuthManager(
    private val prefs: SharedPreferences,
    private val backend: CloudBackend?,
    private val sync: CloudSync?,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    /** false si la app se compiló sin google-services.json (todo queda solo en este teléfono). */
    val cloudConfigured: Boolean get() = backend != null
    val adminConnectedToCloud: Boolean get() = backend?.isAdminSignedIn == true
    val syncStatus: StateFlow<String> = sync?.status ?: MutableStateFlow("")

    /**
     * true si el administrador está conectado pero en la nube todavía no existe la contraseña
     * de trabajador (pasa si las contraseñas se crearon antes de configurar Firebase).
     */
    private val _workerPasswordMissingInCloud = MutableStateFlow(false)
    val workerPasswordMissingInCloud: StateFlow<Boolean> = _workerPasswordMissingInCloud.asStateFlow()

    private val limiter = LoginLimiter(object : LoginLimiter.Store {
        override var failedAttempts: Int
            get() = prefs.getInt(KEY_FAILS, 0)
            set(v) = prefs.edit().putInt(KEY_FAILS, v).apply()
        override var lockedUntil: Long
            get() = prefs.getLong(KEY_LOCKED_UNTIL, 0L)
            set(v) = prefs.edit().putLong(KEY_LOCKED_UNTIL, v).apply()
    })

    private var configListener: ListenerRegistration? = null
    private val foregroundLock = Mutex()

    init {
        sync?.onPermissionDenied = { scope.launch { checkWorkerPasswordChanged() } }
    }

    // ---------------------------------------------------------------- Inicio

    suspend fun initialize() {
        val savedRole = role
        if (savedRole != null) {
            _state.value = AuthState.LoggedIn(savedRole)
            onAppForeground()
            return
        }
        // Este teléfono ya tiene contraseñas creadas.
        if (adminHash != null || (backend == null && workerHash != null)) {
            _state.value = AuthState.LoggedOut(pendingMessage)
            return
        }
        val b = backend
        if (b == null) {
            _state.value = AuthState.NeedsSetup
            return
        }
        _state.value = try {
            if (b.fetchConfig(serverOnly = true) != null) AuthState.LoggedOut(pendingMessage) else AuthState.NeedsSetup
        } catch (e: Exception) {
            AuthState.NeedsInternet(
                if (e.isNoConnection()) "Conéctate a internet para abrir Guastaccesorio por primera vez."
                else "No se pudo conectar con la nube: ${e.message}"
            )
        }
    }

    fun retry() {
        scope.launch {
            _state.value = AuthState.Loading
            initialize()
        }
    }

    /** Se llama cada vez que se abre la app (y al iniciar sesión). */
    fun onAppForeground() {
        scope.launch {
            if (!foregroundLock.tryLock()) return@launch
            try {
                when (role) {
                    Role.ADMIN -> {
                        val b = backend
                        if (b != null && b.isAdminSignedIn) {
                            runCatching { b.fetchConfig(serverOnly = true) }
                                .onSuccess { _workerPasswordMissingInCloud.value = it == null }
                            if (sync?.isRunning != true) sync?.startAsAdmin()
                        }
                    }
                    Role.WORKER -> startWorkerWatch()
                    null -> Unit
                }
            } finally {
                foregroundLock.unlock()
            }
        }
    }

    private suspend fun startWorkerWatch() {
        val b = backend ?: return
        if (configListener == null) {
            // Aviso instantáneo si cambia la contraseña mientras la app está abierta.
            configListener = b.listenConfig { config ->
                if (role == Role.WORKER && config.workerVersion != workerVersion) {
                    scope.launch { logoutWorkerPasswordChanged() }
                }
            }
        }
        if (sync?.isRunning != true) sync?.startAsWorker()
        checkWorkerPasswordChanged()
    }

    /** Revisa en Firebase si la contraseña de trabajador cambió. Sin internet no hace nada. */
    private suspend fun checkWorkerPasswordChanged() {
        val b = backend ?: return
        if (role != Role.WORKER) return
        val config = try {
            b.fetchConfig(serverOnly = true)
        } catch (e: Exception) {
            return
        }
        if (config != null && config.workerVersion != workerVersion) logoutWorkerPasswordChanged()
    }

    private fun logoutWorkerPasswordChanged() {
        if (role != Role.WORKER) return
        configListener?.remove()
        configListener = null
        sync?.stop()
        role = null
        pendingMessage = PASSWORD_CHANGED_MESSAGE
        _state.value = AuthState.LoggedOut(PASSWORD_CHANGED_MESSAGE)
    }

    // ---------------------------------------------------------------- Primer uso

    suspend fun setup(adminPassword: String, workerPassword: String): String? {
        val b = backend
        if (b == null) {
            adminHash = hash(adminPassword)
            workerHash = hash(workerPassword)
            completeLogin(Role.ADMIN)
            return null
        }
        return try {
            if (b.fetchConfig(serverOnly = true) != null) {
                _state.value = AuthState.LoggedOut("Las contraseñas ya fueron creadas. Ingresa con tu contraseña.")
                return null
            }
            b.createOrSignInAdmin(adminPassword)
            val salt = PasswordHasher.newSalt()
            val token = derive(workerPassword, salt, PasswordHasher.DEFAULT_ITERATIONS)
            b.writeInitialConfig(token, salt, PasswordHasher.DEFAULT_ITERATIONS)
            adminHash = hash(adminPassword)
            workerHash = hash(workerPassword)
            completeLogin(Role.ADMIN)
            null
        } catch (e: Exception) {
            if (e.isWrongPassword()) {
                _state.value = AuthState.LoggedOut("Ya existe un administrador. Ingresa con tu contraseña.")
                null
            } else {
                cloudErrorMessage(e)
            }
        }
    }

    // ---------------------------------------------------------------- Ingreso

    fun remainingLockSeconds(): Int = limiter.remainingLockSeconds()

    /** Devuelve null si entró, o el mensaje de error. */
    suspend fun login(password: String): String? {
        val locked = limiter.remainingLockSeconds()
        if (locked > 0) return "Demasiados intentos. Espera $locked segundos."
        if (password.isEmpty()) return "Escribe la contraseña"

        // 1) Contraseña de administrador guardada en este teléfono (funciona sin internet).
        if (verify(password, adminHash)) {
            backend?.let { b -> if (!b.isAdminSignedIn) runCatching { signInAdminCreatingIfNeeded(b, password) } }
            completeLogin(Role.ADMIN)
            return null
        }

        val b = backend
        if (b == null) {
            if (verify(password, workerHash)) {
                completeLogin(Role.WORKER)
                return null
            }
            return wrongPassword()
        }

        // 2) Comprobar en la nube: primero como trabajador, después como administrador.
        return try {
            val config = b.fetchConfig(serverOnly = true)
            if (config == null) {
                _state.value = AuthState.NeedsSetup
                return null
            }
            val token = derive(password, config.workerSalt, config.iterations)
            val isWorker = try {
                b.startWorkerSession(token)
                true
            } catch (e: Exception) {
                if (e.isPermissionDenied()) false else throw e
            }
            if (isWorker) {
                workerVersion = config.workerVersion
                completeLogin(Role.WORKER)
                return null
            }
            try {
                b.signInAdmin(password)
            } catch (e: Exception) {
                if (e.isWrongPassword()) return wrongPassword()
                throw e
            }
            adminHash = hash(password)
            completeLogin(Role.ADMIN)
            null
        } catch (e: Exception) {
            if (e.isNoConnection()) "Sin conexión a internet. Conéctate para entrar." else cloudErrorMessage(e)
        }
    }

    private fun wrongPassword(): String =
        if (limiter.registerFailure()) "Contraseña incorrecta. Demasiados intentos: espera 1 minuto."
        else "Contraseña incorrecta"

    private fun completeLogin(newRole: Role) {
        limiter.registerSuccess()
        role = newRole
        pendingMessage = null
        _state.value = AuthState.LoggedIn(newRole)
        onAppForeground()
    }

    // ---------------------------------------------------------------- Configuración (administrador)

    /** Solo el administrador puede cerrar sesión. */
    fun logoutAdmin() {
        if (role != Role.ADMIN) return
        sync?.stop()
        backend?.signOut()
        role = null
        _state.value = AuthState.LoggedOut()
    }

    suspend fun changeWorkerPassword(newPassword: String): ActionResult {
        if (role != Role.ADMIN) return ActionResult(false, "Solo el administrador puede cambiar contraseñas")
        if (verify(newPassword, adminHash)) {
            return ActionResult(false, "Debe ser distinta de la contraseña de administrador")
        }
        val b = backend
        if (b == null) {
            workerHash = hash(newPassword)
            return ActionResult(true, "Contraseña de trabajador cambiada")
        }
        if (!b.isAdminSignedIn) {
            return ActionResult(false, "No estás conectado a la nube. Toca \"Conectar con la nube\" e inténtalo de nuevo.")
        }
        return try {
            val salt = PasswordHasher.newSalt()
            val token = derive(newPassword, salt, PasswordHasher.DEFAULT_ITERATIONS)
            val confirmed = b.changeWorkerPassword(token, salt, PasswordHasher.DEFAULT_ITERATIONS)
            workerHash = hash(newPassword)
            _workerPasswordMissingInCloud.value = false
            ActionResult(
                true,
                if (confirmed) "Contraseña cambiada. Se cerró la sesión en todos los teléfonos de trabajadores."
                else "Sin internet: el cambio se aplicará en cuanto este teléfono se conecte.",
            )
        } catch (e: Exception) {
            ActionResult(false, cloudErrorMessage(e))
        }
    }

    suspend fun changeAdminPassword(current: String, newPassword: String): ActionResult {
        if (role != Role.ADMIN) return ActionResult(false, "Solo el administrador puede cambiar contraseñas")
        val stored = adminHash
        if (stored != null && !verify(current, stored)) {
            return ActionResult(false, "La contraseña actual no es correcta")
        }
        if (verify(newPassword, workerHash)) {
            return ActionResult(false, "Debe ser distinta de la contraseña de trabajador")
        }
        val b = backend
        return try {
            b?.changeAdminPassword(current, newPassword)
            adminHash = hash(newPassword)
            if (b != null && sync?.isRunning != true) onAppForeground()
            ActionResult(true, "Contraseña de administrador cambiada")
        } catch (e: Exception) {
            ActionResult(
                false,
                when {
                    e.isNoConnection() -> "Necesitas internet para cambiar la contraseña de administrador"
                    e.isWrongPassword() -> "La contraseña actual no es correcta"
                    else -> cloudErrorMessage(e)
                },
            )
        }
    }

    /**
     * Entra a la cuenta de administrador de Firebase. Si en la nube todavía no hay nada
     * (las contraseñas se crearon antes de configurar Firebase), crea la cuenta.
     * Solo se llama después de comprobar la contraseña con el hash local.
     */
    private suspend fun signInAdminCreatingIfNeeded(b: CloudBackend, password: String) {
        if (b.fetchConfig(serverOnly = true) == null) {
            b.createOrSignInAdmin(password)
            _workerPasswordMissingInCloud.value = true
        } else {
            b.signInAdmin(password)
        }
    }

    /** Vuelve a conectar al administrador con la nube (si entró sin internet). */
    suspend fun connectAdminToCloud(password: String): ActionResult {
        val b = backend ?: return ActionResult(false, "La nube no está configurada")
        val stored = adminHash
        if (stored != null && !verify(password, stored)) return ActionResult(false, "Contraseña incorrecta")
        return try {
            if (stored != null) signInAdminCreatingIfNeeded(b, password) else b.signInAdmin(password)
            adminHash = hash(password)
            val started = sync?.startAsAdmin() ?: false
            ActionResult(
                true,
                when {
                    _workerPasswordMissingInCloud.value ->
                        "Conectado. Ahora toca \"Cambiar contraseña de trabajador\" para crearla en la nube."
                    started -> "Conectado a la nube"
                    else -> "Sesión iniciada. Se sincronizará al volver internet."
                },
            )
        } catch (e: Exception) {
            ActionResult(
                false,
                when {
                    e.isWrongPassword() -> "Contraseña incorrecta"
                    e.isNoConnection() -> "Sin conexión a internet"
                    else -> cloudErrorMessage(e)
                },
            )
        }
    }

    /** Fuerza una sincronización completa (administrador). */
    suspend fun syncNow(): ActionResult {
        if (backend == null) return ActionResult(false, "La nube no está configurada")
        if (!adminConnectedToCloud) return ActionResult(false, "No estás conectado a la nube")
        val ok = sync?.startAsAdmin() ?: false
        return ActionResult(ok, if (ok) "Datos sincronizados" else "Sin conexión: se sincronizará al volver internet")
    }

    private fun cloudErrorMessage(e: Exception): String = when {
        e.isNoConnection() -> "Sin conexión a internet. Conéctate e inténtalo de nuevo."
        e.isTooManyRequests() -> "Demasiados intentos. Espera unos minutos."
        e is FirebaseAuthWeakPasswordException -> "La contraseña es muy débil. Usa al menos 6 caracteres."
        e is FirebaseAuthException && e.errorCode == "ERROR_OPERATION_NOT_ALLOWED" ->
            "En Firebase, activa los métodos \"Correo electrónico/contraseña\" y \"Anónimo\" (ver README)."
        e.isPermissionDenied() -> "Firebase rechazó la operación. Revisa que publicaste las reglas de Firestore (ver README)."
        else -> "Error: ${e.message ?: e.javaClass.simpleName}"
    }

    // ---------------------------------------------------------------- Hash (en segundo plano: es lento a propósito)

    private suspend fun hash(password: String) =
        withContext(Dispatchers.Default) { PasswordHasher.hashForStorage(password) }

    private suspend fun verify(password: String, stored: String?) =
        stored != null && withContext(Dispatchers.Default) { PasswordHasher.verify(password, stored) }

    private suspend fun derive(password: String, salt: String, iterations: Int) =
        withContext(Dispatchers.Default) { PasswordHasher.derive(password, salt, iterations) }

    // ---------------------------------------------------------------- Datos guardados en el teléfono

    private var role: Role?
        get() = prefs.getString(KEY_ROLE, null)?.let { r -> Role.entries.firstOrNull { it.name == r } }
        set(v) {
            prefs.edit().putString(KEY_ROLE, v?.name).commit()
        }

    private var adminHash: String?
        get() = prefs.getString(KEY_ADMIN_HASH, null)
        set(v) = prefs.edit().putString(KEY_ADMIN_HASH, v).apply()

    private var workerHash: String?
        get() = prefs.getString(KEY_WORKER_HASH, null)
        set(v) = prefs.edit().putString(KEY_WORKER_HASH, v).apply()

    private var workerVersion: Long
        get() = prefs.getLong(KEY_WORKER_VERSION, -1L)
        set(v) = prefs.edit().putLong(KEY_WORKER_VERSION, v).apply()

    private var pendingMessage: String?
        get() = prefs.getString(KEY_PENDING_MESSAGE, null)
        set(v) = prefs.edit().putString(KEY_PENDING_MESSAGE, v).apply()

    companion object {
        const val MIN_PASSWORD_LENGTH = 6
        const val PASSWORD_CHANGED_MESSAGE = "La contraseña cambió. Pide la nueva al administrador"

        private const val KEY_ROLE = "session_role"
        private const val KEY_ADMIN_HASH = "admin_password_hash"
        private const val KEY_WORKER_HASH = "worker_password_hash"
        private const val KEY_WORKER_VERSION = "worker_password_version"
        private const val KEY_PENDING_MESSAGE = "login_message"
        private const val KEY_FAILS = "login_failed_attempts"
        private const val KEY_LOCKED_UNTIL = "login_locked_until"

        /** Valida una contraseña nueva escrita dos veces. Devuelve el error o null. */
        fun validateNew(password: String, confirmation: String): String? = when {
            password.length < MIN_PASSWORD_LENGTH -> "La contraseña debe tener al menos $MIN_PASSWORD_LENGTH caracteres"
            password != confirmation -> "Las contraseñas no coinciden"
            else -> null
        }
    }
}
