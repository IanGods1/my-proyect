package com.casematch.app.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.ThemeMode
import com.casematch.app.auth.AuthManager
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.BigButton
import com.casematch.app.ui.components.ConfirmDialog
import com.casematch.app.ui.components.PasswordField

private enum class Dialog { WORKER, WORKER_CONFIRM, ADMIN, CONNECT, LOGOUT }

/** Configuración: solo la ve el administrador. */
@Composable
fun SettingsScreen(
    auth: AuthManager,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onBack: () -> Unit,
) {
    val vm: SettingsViewModel = viewModel { SettingsViewModel(auth) }
    val syncStatus by auth.syncStatus.collectAsStateWithLifecycle()
    val workerPasswordMissing by auth.workerPasswordMissingInCloud.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var dialog by remember { mutableStateOf<Dialog?>(null) }
    var pendingWorkerPassword by remember { mutableStateOf("") }

    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it, withDismissAction = true, duration = SnackbarDuration.Long)
            vm.clearMessage()
        }
    }

    Scaffold(
        topBar = { AppTopBar(title = "Configuración", onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())

            // ---- Contraseñas
            SectionTitle("Contraseñas")
            if (workerPasswordMissing) {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                    colors = androidx.compose.material3.CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                ) {
                    Text(
                        "Falta crear la contraseña de trabajador en la nube. Toca \"Cambiar contraseña de trabajador\" " +
                            "para que tus empleados puedan entrar.",
                        modifier = Modifier.padding(16.dp),
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
            }
            BigButton(
                text = "Cambiar contraseña de trabajador",
                icon = Icons.Filled.Person,
                enabled = !vm.busy,
                onClick = { dialog = Dialog.WORKER },
            )
            Text(
                "Úsalo cuando un trabajador deja de trabajar contigo: todos los trabajadores tendrán que escribir la nueva contraseña.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            BigButton(
                text = "Cambiar mi contraseña de administrador",
                icon = Icons.Filled.Lock,
                outlined = true,
                enabled = !vm.busy,
                onClick = { dialog = Dialog.ADMIN },
            )

            // ---- Nube
            Spacer(Modifier.height(8.dp))
            SectionTitle("Datos en la nube")
            // `refresh` fuerza a releer el estado de conexión después de cada acción.
            val connected = vm.refresh.let { auth.adminConnectedToCloud }
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        when {
                            !auth.cloudConfigured -> "Nube no configurada"
                            connected -> "Conectado a Firebase"
                            else -> "Sin conexión con la nube"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        when {
                            !auth.cloudConfigured ->
                                "Los datos y las contraseñas se guardan solo en este teléfono. Para compartirlos con los trabajadores, configura Firebase (ver README)."
                            connected ->
                                "Los cambios que hagas se suben solos y los trabajadores los reciben en sus teléfonos."
                            else ->
                                "Entraste sin internet. Toca \"Conectar con la nube\" para subir tus cambios."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (auth.cloudConfigured && syncStatus.isNotBlank()) {
                        Text(
                            "Estado: $syncStatus",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (auth.cloudConfigured) {
                if (connected) {
                    BigButton(
                        text = "Sincronizar ahora",
                        icon = Icons.Filled.Refresh,
                        outlined = true,
                        enabled = !vm.busy,
                        onClick = vm::syncNow,
                    )
                } else {
                    BigButton(
                        text = "Conectar con la nube",
                        icon = Icons.Filled.Refresh,
                        enabled = !vm.busy,
                        onClick = { dialog = Dialog.CONNECT },
                    )
                }
            }

            // ---- Tema
            Spacer(Modifier.height(8.dp))
            SectionTitle("Tema")
            Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(vertical = 4.dp)) {
                    ThemeMode.entries.forEach { mode ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .selectable(
                                    selected = mode == themeMode,
                                    onClick = { onThemeModeChange(mode) },
                                    role = Role.RadioButton,
                                )
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = mode == themeMode, onClick = null)
                            Text(mode.label, modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp), style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }

            // ---- Sesión
            Spacer(Modifier.height(8.dp))
            SectionTitle("Sesión")
            BigButton(
                text = "Cerrar sesión",
                icon = Icons.AutoMirrored.Filled.ExitToApp,
                isDestructive = true,
                onClick = { dialog = Dialog.LOGOUT },
            )
            Spacer(Modifier.height(24.dp))
        }
    }

    when (dialog) {
        Dialog.WORKER -> NewPasswordDialog(
            title = "Nueva contraseña de trabajador",
            askCurrent = false,
            confirmText = "Continuar",
            onDismiss = { dialog = null },
            onConfirm = { _, new ->
                pendingWorkerPassword = new
                dialog = Dialog.WORKER_CONFIRM
            },
        )
        Dialog.WORKER_CONFIRM -> ConfirmDialog(
            title = "Cambiar contraseña de trabajador",
            text = "Se cerrará la sesión en todos los teléfonos de trabajadores. ¿Continuar?",
            confirmText = "Continuar",
            onConfirm = {
                dialog = null
                vm.changeWorkerPassword(pendingWorkerPassword) {}
                pendingWorkerPassword = ""
            },
            onDismiss = {
                dialog = null
                pendingWorkerPassword = ""
            },
        )
        Dialog.ADMIN -> NewPasswordDialog(
            title = "Cambiar mi contraseña de administrador",
            askCurrent = true,
            confirmText = "Cambiar",
            onDismiss = { dialog = null },
            onConfirm = { current, new ->
                dialog = null
                vm.changeAdminPassword(current, new) {}
            },
        )
        Dialog.CONNECT -> ConnectDialog(
            onDismiss = { dialog = null },
            onConfirm = { password ->
                dialog = null
                vm.connectToCloud(password) {}
            },
        )
        Dialog.LOGOUT -> ConfirmDialog(
            title = "Cerrar sesión",
            text = "La app volverá a pedir la contraseña en este teléfono. Tus datos no se borran.",
            confirmText = "Cerrar sesión",
            onConfirm = {
                dialog = null
                auth.logoutAdmin()
            },
            onDismiss = { dialog = null },
        )
        null -> Unit
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
}

/** Pide (opcionalmente) la contraseña actual y la nueva dos veces. */
@Composable
private fun NewPasswordDialog(
    title: String,
    askCurrent: Boolean,
    confirmText: String,
    onDismiss: () -> Unit,
    onConfirm: (current: String, new: String) -> Unit,
) {
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val submit = {
        error = when {
            askCurrent && current.isEmpty() -> "Escribe tu contraseña actual"
            else -> AuthManager.validateNew(new, confirm)
                ?: if (askCurrent && new == current) "La nueva contraseña debe ser distinta de la actual" else null
        }
        if (error == null) onConfirm(current, new)
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (askCurrent) PasswordField(current, { current = it }, "Contraseña actual")
                PasswordField(new, { new = it }, "Nueva contraseña")
                PasswordField(confirm, { confirm = it }, "Repite la nueva contraseña", imeAction = ImeAction.Done, onDone = submit)
                Text(
                    "Mínimo ${AuthManager.MIN_PASSWORD_LENGTH} caracteres.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleMedium) }
            }
        },
        confirmButton = {
            TextButton(onClick = submit) { Text(confirmText, style = MaterialTheme.typography.labelLarge) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", style = MaterialTheme.typography.labelLarge) }
        },
    )
}

@Composable
private fun ConnectDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var password by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Conectar con la nube") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Escribe tu contraseña de administrador.", style = MaterialTheme.typography.bodyLarge)
                PasswordField(password, { password = it }, "Contraseña de administrador", imeAction = ImeAction.Done, onDone = {
                    if (password.isNotEmpty()) onConfirm(password)
                })
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(password) }, enabled = password.isNotEmpty()) {
                Text("Conectar", style = MaterialTheme.typography.labelLarge)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", style = MaterialTheme.typography.labelLarge) }
        },
    )
}
