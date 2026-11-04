package com.casematch.app.cloud

import android.content.Context
import com.casematch.app.data.CloudSnapshot
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.QuerySnapshot
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

/** No hubo respuesta del servidor a tiempo (sin internet o conexión muy lenta). */
class NoConnectionException : Exception("Sin conexión")

fun Throwable.isNoConnection(): Boolean =
    this is NoConnectionException ||
        this is FirebaseNetworkException ||
        (this is FirebaseFirestoreException &&
            (code == FirebaseFirestoreException.Code.UNAVAILABLE || code == FirebaseFirestoreException.Code.DEADLINE_EXCEEDED))

fun Throwable.isPermissionDenied(): Boolean =
    this is FirebaseFirestoreException && code == FirebaseFirestoreException.Code.PERMISSION_DENIED

fun Throwable.isWrongPassword(): Boolean =
    this is FirebaseAuthInvalidCredentialsException || this is FirebaseAuthInvalidUserException

fun Throwable.isTooManyRequests(): Boolean = this is FirebaseTooManyRequestsException

/** Configuración pública guardada en Firestore (public/config). No contiene contraseñas. */
data class CloudConfig(
    val workerVersion: Long,
    val workerSalt: String,
    val iterations: Int,
)

/** Una escritura pendiente en Firestore. fields == null significa borrar el documento. */
data class CloudWrite(val collection: String, val id: String, val fields: Map<String, Any?>?)

/**
 * Acceso a Firebase.
 *
 * - El administrador inicia sesión en Firebase Authentication con un correo fijo
 *   ([ADMIN_EMAIL]) y su contraseña: el usuario nunca ve ni escribe ese correo.
 * - El trabajador entra con una cuenta anónima y registra una "sesión" con la clave
 *   derivada de la contraseña de trabajador. Las reglas de Firestore solo dejan leer
 *   los datos si esa clave coincide con la actual (ver firestore.rules).
 */
class CloudBackend private constructor() {
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    val isAdminSignedIn: Boolean
        get() = auth.currentUser?.email.equals(ADMIN_EMAIL, ignoreCase = true)

    // ---------------------------------------------------------------- Configuración

    /** Lee public/config. Devuelve null si todavía no se crearon las contraseñas. */
    suspend fun fetchConfig(serverOnly: Boolean = true): CloudConfig? {
        val snap = db.document(CONFIG_DOC).get(if (serverOnly) Source.SERVER else Source.DEFAULT).awaitOrFail()
        return parseConfig(snap)
    }

    fun listenConfig(onChange: (CloudConfig) -> Unit): ListenerRegistration =
        db.document(CONFIG_DOC).addSnapshotListener { snap, error ->
            if (error == null && snap != null) parseConfig(snap)?.let(onChange)
        }

    private fun parseConfig(snap: DocumentSnapshot): CloudConfig? {
        if (!snap.exists()) return null
        val salt = snap.getString("workerSalt") ?: return null
        return CloudConfig(
            workerVersion = snap.getLong("workerVersion") ?: 1L,
            workerSalt = salt,
            iterations = (snap.getLong("iterations") ?: 60_000L).toInt(),
        )
    }

    // ---------------------------------------------------------------- Administrador

    /** Crea la cuenta del administrador (primer uso). Si ya existía, intenta entrar con la misma contraseña. */
    suspend fun createOrSignInAdmin(password: String) {
        try {
            auth.createUserWithEmailAndPassword(ADMIN_EMAIL, password).awaitOrFail()
        } catch (e: com.google.firebase.auth.FirebaseAuthUserCollisionException) {
            signInAdmin(password)
        }
    }

    suspend fun signInAdmin(password: String) {
        auth.signInWithEmailAndPassword(ADMIN_EMAIL, password).awaitOrFail()
    }

    suspend fun changeAdminPassword(current: String, new: String) {
        val user = auth.currentUser?.takeIf { isAdminSignedIn }
            ?: auth.signInWithEmailAndPassword(ADMIN_EMAIL, current).awaitOrFail().user
            ?: throw IllegalStateException("No se pudo iniciar sesión")
        user.reauthenticate(EmailAuthProvider.getCredential(ADMIN_EMAIL, current)).awaitOrFail()
        user.updatePassword(new).awaitOrFail()
    }

    /** Primer uso: guarda la clave de trabajador (privada) y la configuración pública. */
    suspend fun writeInitialConfig(workerToken: String, workerSalt: String, iterations: Int) {
        val batch = db.batch()
        batch.set(db.document(WORKER_SECRET_DOC), mapOf("token" to workerToken))
        batch.set(
            db.document(CONFIG_DOC),
            mapOf(
                "setupDone" to true,
                "workerVersion" to 1L,
                "workerSalt" to workerSalt,
                "iterations" to iterations,
            ),
        )
        batch.commit().awaitOrFail()
    }

    /**
     * Cambia la contraseña de trabajador y sube el número de versión: todos los
     * teléfonos de trabajadores pierden el acceso y vuelven a pedir contraseña.
     * Devuelve true si el servidor confirmó; false si quedó pendiente (sin internet).
     */
    suspend fun changeWorkerPassword(workerToken: String, workerSalt: String, iterations: Int): Boolean {
        val batch = db.batch()
        batch.set(db.document(WORKER_SECRET_DOC), mapOf("token" to workerToken))
        batch.set(
            db.document(CONFIG_DOC),
            mapOf(
                "setupDone" to true,
                "workerVersion" to FieldValue.increment(1),
                "workerSalt" to workerSalt,
                "iterations" to iterations,
            ),
            SetOptions.merge(),
        )
        return try {
            batch.commit().awaitOrFail()
            true
        } catch (e: Exception) {
            if (e.isNoConnection()) false else throw e
        }
    }

    // ---------------------------------------------------------------- Trabajador

    /** Registra la sesión del trabajador. Falla con PERMISSION_DENIED si la contraseña no es la actual. */
    suspend fun startWorkerSession(workerToken: String) {
        val current = auth.currentUser
        val user = if (current != null && current.isAnonymous) current
        else {
            if (current != null) auth.signOut()
            auth.signInAnonymously().awaitOrFail().user ?: throw IllegalStateException("No se pudo iniciar sesión")
        }
        db.collection("sessions").document(user.uid).set(mapOf("token" to workerToken)).awaitOrFail()
    }

    fun signOut() = auth.signOut()

    // ---------------------------------------------------------------- Datos

    /** Lee todos los modelos y grupos. El booleano indica si vienen solo de la copia local (sin internet). */
    suspend fun fetchAll(): Pair<CloudSnapshot, Boolean> {
        val models = db.collection(MODELS).get().awaitOrFail()
        val groups = db.collection(GROUPS).get().awaitOrFail()
        val snapshot = CloudSnapshot(parseModels(models), parseGroups(groups))
        return snapshot to (models.metadata.isFromCache || groups.metadata.isFromCache)
    }

    fun listenModels(onEvent: (Map<String, Map<String, Any?>>?, Boolean, Exception?) -> Unit): ListenerRegistration =
        db.collection(MODELS).addSnapshotListener(MetadataChanges.INCLUDE) { snap, error ->
            onEvent(snap?.let { parseModels(it) }, snap?.metadata?.isFromCache ?: true, error)
        }

    fun listenGroups(onEvent: (Map<String, Map<String, Any?>>?, Boolean, Exception?) -> Unit): ListenerRegistration =
        db.collection(GROUPS).addSnapshotListener(MetadataChanges.INCLUDE) { snap, error ->
            onEvent(snap?.let { parseGroups(it) }, snap?.metadata?.isFromCache ?: true, error)
        }

    private fun parseModels(snap: QuerySnapshot) =
        snap.documents.associate { it.id to CloudSnapshot.canonicalModel(it.data.orEmpty()) }

    private fun parseGroups(snap: QuerySnapshot) =
        snap.documents.associate { it.id to CloudSnapshot.canonicalGroup(it.data.orEmpty()) }

    /**
     * Envía escrituras en lotes. No espera la respuesta del servidor: sin internet quedan
     * en cola (Firestore las guarda en el teléfono) y se suben cuando vuelve la conexión.
     */
    fun write(writes: List<CloudWrite>, onError: (Exception) -> Unit) {
        writes.chunked(400).forEach { chunk ->
            val batch = db.batch()
            for (w in chunk) {
                val ref = db.collection(w.collection).document(w.id)
                if (w.fields == null) batch.delete(ref) else batch.set(ref, w.fields)
            }
            batch.commit().addOnFailureListener(onError)
        }
    }

    companion object {
        /** Correo interno de la cuenta de administrador. Debe coincidir con firestore.rules. */
        const val ADMIN_EMAIL = "admin@guastaccesorio.app"
        const val MODELS = "models"
        const val GROUPS = "groups"
        private const val CONFIG_DOC = "public/config"
        private const val WORKER_SECRET_DOC = "private/worker"
        private const val TIMEOUT_MS = 20_000L

        /** Devuelve null si la app se compiló sin google-services.json (modo solo local). */
        fun createIfConfigured(context: Context): CloudBackend? =
            if (FirebaseApp.getApps(context).isEmpty()) null else CloudBackend()

        private class Box<T>(val value: T)

        /** Espera la tarea de Firebase; si tarda demasiado se considera "sin conexión". */
        suspend fun <T> Task<T>.awaitOrFail(): T =
            (withTimeoutOrNull(TIMEOUT_MS) { Box(await()) } ?: throw NoConnectionException()).value
    }
}
