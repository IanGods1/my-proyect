package com.casematch.app.ui.screens.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.auth.AuthManager
import kotlinx.coroutines.launch

class LoginViewModel(private val auth: AuthManager) : ViewModel() {
    var password by mutableStateOf("")
    var error by mutableStateOf<String?>(null)
        private set
    var busy by mutableStateOf(false)
        private set

    fun lockSeconds(): Int = auth.remainingLockSeconds()

    fun login() {
        if (busy) return
        viewModelScope.launch {
            busy = true
            error = null
            val result = auth.login(password)
            busy = false
            if (result == null) password = "" else error = result
        }
    }
}

class SetupViewModel(private val auth: AuthManager) : ViewModel() {
    var adminPassword by mutableStateOf("")
    var adminConfirm by mutableStateOf("")
    var workerPassword by mutableStateOf("")
    var workerConfirm by mutableStateOf("")
    var error by mutableStateOf<String?>(null)
        private set
    var busy by mutableStateOf(false)
        private set

    fun create() {
        if (busy) return
        val validation = AuthManager.validateNew(adminPassword, adminConfirm)?.let { "Administrador: $it" }
            ?: AuthManager.validateNew(workerPassword, workerConfirm)?.let { "Trabajador: $it" }
            ?: if (adminPassword == workerPassword) "Las dos contraseñas deben ser distintas" else null
        if (validation != null) {
            error = validation
            return
        }
        viewModelScope.launch {
            busy = true
            error = auth.setup(adminPassword, workerPassword)
            busy = false
        }
    }
}
