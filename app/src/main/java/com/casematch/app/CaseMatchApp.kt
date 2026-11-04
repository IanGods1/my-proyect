package com.casematch.app

import android.app.Application
import android.content.Context
import com.casematch.app.auth.AuthManager
import com.casematch.app.cloud.CloudBackend
import com.casematch.app.cloud.CloudSync
import com.casematch.app.data.AppDatabase
import com.casematch.app.data.CompatRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

enum class ThemeMode(val label: String) { SYSTEM("Según el sistema"), LIGHT("Claro"), DARK("Oscuro") }

/**
 * Inicio de Guastaccesorio. (El nombre interno de la clase y del paquete se mantiene
 * "casematch" para que la actualización conserve los datos ya guardados.)
 */
class CaseMatchApp : Application() {
    lateinit var repository: CompatRepository
        private set
    lateinit var auth: AuthManager
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs by lazy { getSharedPreferences("casematch", Context.MODE_PRIVATE) }

    var themeMode: ThemeMode
        get() = ThemeMode.entries.firstOrNull { it.name == prefs.getString("theme", null) } ?: ThemeMode.SYSTEM
        set(value) = prefs.edit().putString("theme", value.name).apply()

    override fun onCreate() {
        super.onCreate()
        // Misma base de datos que la versión anterior: los datos guardados se conservan.
        repository = CompatRepository(AppDatabase.create(this))

        val backend = CloudBackend.createIfConfigured(this)
        val sync = backend?.let { CloudSync(repository, it, prefs, appScope) }
        auth = AuthManager(prefs, backend, sync, appScope)

        appScope.launch {
            // Datos de ejemplo: solo la primera vez que se abre la app.
            if (!prefs.getBoolean("seeded", false)) {
                repository.seedSampleDataIfEmpty()
                prefs.edit().putBoolean("seeded", true).apply()
            }
            auth.initialize()
        }
    }
}
