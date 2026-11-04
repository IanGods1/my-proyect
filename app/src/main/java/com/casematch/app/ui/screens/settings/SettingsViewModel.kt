package com.casematch.app.ui.screens.settings

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.auth.ActionResult
import com.casematch.app.auth.AuthManager
import kotlinx.coroutines.launch

class SettingsViewModel(val auth: AuthManager) : ViewModel() {
    var busy by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set

    /** Se incrementa cada vez que cambia el estado de conexión, para refrescar la pantalla. */
    var refresh by mutableStateOf(0)
        private set

    fun clearMessage() {
        message = null
    }

    private fun perform(onSuccess: () -> Unit = {}, action: suspend () -> ActionResult) {
        if (busy) return
        viewModelScope.launch {
            busy = true
            val result = action()
            busy = false
            message = result.message
            refresh++
            if (result.ok) onSuccess()
        }
    }

    fun changeWorkerPassword(newPassword: String, onSuccess: () -> Unit) =
        perform(onSuccess) { auth.changeWorkerPassword(newPassword) }

    fun changeAdminPassword(current: String, newPassword: String, onSuccess: () -> Unit) =
        perform(onSuccess) { auth.changeAdminPassword(current, newPassword) }

    fun connectToCloud(password: String, onSuccess: () -> Unit) =
        perform(onSuccess) { auth.connectAdminToCloud(password) }

    fun syncNow() = perform { auth.syncNow() }
}
