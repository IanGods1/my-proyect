package com.casematch.app

import android.app.Application
import android.content.Context
import com.casematch.app.data.AppDatabase
import com.casematch.app.data.CompatRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

enum class ThemeMode(val label: String) { SYSTEM("Según el sistema"), LIGHT("Claro"), DARK("Oscuro") }

class CaseMatchApp : Application() {
    lateinit var repository: CompatRepository
        private set

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs by lazy { getSharedPreferences("casematch", Context.MODE_PRIVATE) }

    var themeMode: ThemeMode
        get() = ThemeMode.entries.firstOrNull { it.name == prefs.getString("theme", null) } ?: ThemeMode.SYSTEM
        set(value) = prefs.edit().putString("theme", value.name).apply()

    override fun onCreate() {
        super.onCreate()
        repository = CompatRepository(AppDatabase.create(this))

        // Datos de ejemplo: solo la primera vez que se abre la app.
        if (!prefs.getBoolean("seeded", false)) {
            appScope.launch {
                repository.seedSampleDataIfEmpty()
                prefs.edit().putBoolean("seeded", true).apply()
            }
        }
    }
}
