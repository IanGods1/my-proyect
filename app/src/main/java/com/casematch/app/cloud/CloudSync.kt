package com.casematch.app.cloud

import android.content.SharedPreferences
import com.casematch.app.data.CloudSnapshot
import com.casematch.app.data.CompatRepository
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicLong

/**
 * Mantiene la base local (Room) como copia de Firestore.
 *
 * - Todos: escuchan los cambios de la nube y los copian a la base local, así la búsqueda
 *   funciona sin internet con la última copia recibida.
 * - Administrador: cada cambio local se compara con lo que hay en la nube y se suben solo
 *   las diferencias. Sin internet, Firestore guarda los cambios y los sube al reconectar.
 */
class CloudSync(
    private val repository: CompatRepository,
    private val backend: CloudBackend,
    private val prefs: SharedPreferences,
    private val scope: CoroutineScope,
) {
    private var modelsListener: ListenerRegistration? = null
    private var groupsListener: ListenerRegistration? = null

    @Volatile private var remoteModels: Map<String, Map<String, Any?>>? = null
    @Volatile private var remoteGroups: Map<String, Map<String, Any?>>? = null

    /** Lo que creemos que hay en la nube (para calcular qué subir). */
    @Volatile private var known: CloudSnapshot = CloudSnapshot.EMPTY

    /** Solo el administrador conectado sube cambios. */
    @Volatile private var uploadsEnabled = false

    /** Cuenta las subidas: una copia de la nube recibida antes de una subida ya está vieja. */
    private val uploadCounter = AtomicLong()

    /** Se llama si la nube rechaza la lectura (por ejemplo, cambió la contraseña de trabajador). */
    var onPermissionDenied: (() -> Unit)? = null

    private val _status = MutableStateFlow("")
    val status: StateFlow<String> = _status

    val isRunning: Boolean get() = modelsListener != null

    init {
        repository.onDataChanged = { onLocalChange() }
    }

    // ---------------------------------------------------------------- Inicio / fin

    /**
     * Administrador: primera sincronización.
     * - Si la nube está vacía (primera vez) o hay cambios locales sin subir, se sube lo del teléfono.
     * - Si no, se descarga lo de la nube (por ejemplo, en un teléfono nuevo).
     * Devuelve false si no hay conexión (se reintenta la próxima vez que se abra la app).
     */
    suspend fun startAsAdmin(): Boolean {
        stop()
        val (remote, fromCache) = try {
            backend.fetchAll()
        } catch (e: Exception) {
            _status.value = if (e.isNoConnection()) "Sin conexión: se sincronizará al volver internet" else "Error: ${e.message}"
            return false
        }
        if (fromCache && !syncedOnce) {
            _status.value = "Sin conexión: se sincronizará al volver internet"
            return false
        }
        if (!fromCache) syncedOnce = true

        repository.writeLock.withLock {
            known = remote
            uploadsEnabled = true
            if (localChangesPending || remote.isEmpty()) {
                upload()
                localChangesPending = false
            } else if (repository.localSnapshot() != remote) {
                repository.replaceAllWithCloud(remote)
            }
        }
        listen()
        _status.value = "Conectado a la nube"
        return true
    }

    /** Trabajador: solo recibe los datos. */
    fun startAsWorker() {
        stop()
        listen()
    }

    fun stop() {
        modelsListener?.remove()
        groupsListener?.remove()
        modelsListener = null
        groupsListener = null
        remoteModels = null
        remoteGroups = null
        uploadsEnabled = false
    }

    // ---------------------------------------------------------------- Nube -> teléfono

    private fun listen() {
        modelsListener = backend.listenModels { data, fromCache, error ->
            onRemote(data, fromCache, error) { remoteModels = it }
        }
        groupsListener = backend.listenGroups { data, fromCache, error ->
            onRemote(data, fromCache, error) { remoteGroups = it }
        }
    }

    private fun onRemote(
        data: Map<String, Map<String, Any?>>?,
        fromCache: Boolean,
        error: Exception?,
        store: (Map<String, Map<String, Any?>>) -> Unit,
    ) {
        if (error != null) {
            if (error.isPermissionDenied()) onPermissionDenied?.invoke()
            _status.value = "Error de sincronización: ${error.message}"
            return
        }
        if (data == null) return
        // Sin haber hablado nunca con el servidor, una copia vacía no es confiable.
        if (fromCache && !syncedOnce) return
        if (!fromCache) syncedOnce = true
        store(data)
        val uploadsAtReceipt = uploadCounter.get()
        scope.launch {
            repository.writeLock.withLock {
                if (uploadCounter.get() != uploadsAtReceipt) return@withLock // llegará una copia más nueva
                val models = remoteModels ?: return@withLock
                val groups = remoteGroups ?: return@withLock
                val remote = CloudSnapshot(models, groups)
                known = remote
                if (repository.localSnapshot() != remote) repository.replaceAllWithCloud(remote)
                if (!fromCache) _status.value = "Sincronizado"
            }
        }
    }

    // ---------------------------------------------------------------- Teléfono -> nube

    /** Llamado por el repositorio (con el bloqueo tomado) después de cada cambio del administrador. */
    private suspend fun onLocalChange() {
        if (uploadsEnabled) upload() else localChangesPending = true
    }

    /** Sube solo las diferencias entre la base local y [known]. Debe llamarse con el bloqueo tomado. */
    private suspend fun upload() {
        val local = repository.localSnapshot()
        val writes = buildList<CloudWrite> {
            diff(CloudBackend.MODELS, local.models, known.models)
            diff(CloudBackend.GROUPS, local.groups, known.groups)
        }
        if (writes.isEmpty()) return
        uploadCounter.incrementAndGet()
        known = local
        backend.write(writes) { e ->
            _status.value = "No se pudo subir a la nube: ${e.message}"
        }
    }

    private fun MutableList<CloudWrite>.diff(
        collection: String,
        local: Map<String, Map<String, Any?>>,
        remote: Map<String, Map<String, Any?>>,
    ) {
        for ((id, fields) in local) if (remote[id] != fields) add(CloudWrite(collection, id, fields))
        for (id in remote.keys) if (id !in local) add(CloudWrite(collection, id, null))
    }

    // ---------------------------------------------------------------- Preferencias

    private var syncedOnce: Boolean
        get() = prefs.getBoolean("cloud_synced_once", false)
        set(v) = prefs.edit().putBoolean("cloud_synced_once", v).apply()

    private var localChangesPending: Boolean
        get() = prefs.getBoolean("cloud_local_pending", false)
        set(v) = prefs.edit().putBoolean("cloud_local_pending", v).apply()
}
