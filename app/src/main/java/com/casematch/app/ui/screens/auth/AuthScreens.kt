package com.casematch.app.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.auth.AuthManager
import com.casematch.app.ui.components.BigButton
import com.casematch.app.ui.components.PasswordField
import kotlinx.coroutines.delay

/** Pantalla con un solo campo de contraseña y el botón "Entrar". */
@Composable
fun LoginScreen(auth: AuthManager, message: String?) {
    val vm: LoginViewModel = viewModel { LoginViewModel(auth) }

    // Cuenta regresiva del bloqueo por intentos fallidos.
    var lockSeconds by remember { mutableIntStateOf(vm.lockSeconds()) }
    LaunchedEffect(vm.error) {
        lockSeconds = vm.lockSeconds()
        while (lockSeconds > 0) {
            delay(1_000)
            lockSeconds = vm.lockSeconds()
        }
    }

    AuthLayout {
        Icon(
            Icons.Filled.Lock,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.primary,
        )
        Title("Guastaccesorio")
        Text(
            "Escribe tu contraseña para entrar",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (message != null) Banner(message)

        PasswordField(
            value = vm.password,
            onValueChange = { vm.password = it },
            label = "Contraseña",
            imeAction = ImeAction.Done,
            onDone = { if (lockSeconds == 0) vm.login() },
            enabled = !vm.busy,
        )
        vm.error?.let { ErrorText(it) }
        if (lockSeconds > 0) ErrorText("Bloqueado: intenta de nuevo en $lockSeconds segundos")

        if (vm.busy) {
            CircularProgressIndicator()
        } else {
            BigButton(text = "Entrar", onClick = vm::login, enabled = lockSeconds == 0 && vm.password.isNotEmpty())
        }
    }
}

/** Primer uso: crear la contraseña de administrador y la de trabajador. */
@Composable
fun SetupScreen(auth: AuthManager) {
    val vm: SetupViewModel = viewModel { SetupViewModel(auth) }
    AuthLayout {
        Title("Bienvenido a Guastaccesorio")
        Text(
            "Crea las dos contraseñas de la app. Mínimo ${AuthManager.MIN_PASSWORD_LENGTH} caracteres.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )

        SectionTitle("Contraseña de ADMINISTRADOR")
        Text(
            "Solo para ti. Permite agregar, editar, importar, exportar y cambiar contraseñas.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        PasswordField(vm.adminPassword, { vm.adminPassword = it }, "Contraseña de administrador", enabled = !vm.busy)
        PasswordField(vm.adminConfirm, { vm.adminConfirm = it }, "Repite la contraseña de administrador", enabled = !vm.busy)

        SectionTitle("Contraseña de TRABAJADOR")
        Text(
            "La que compartes con tus empleados. Solo permite buscar y ver compatibilidades.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        PasswordField(vm.workerPassword, { vm.workerPassword = it }, "Contraseña de trabajador", enabled = !vm.busy)
        PasswordField(
            vm.workerConfirm,
            { vm.workerConfirm = it },
            "Repite la contraseña de trabajador",
            imeAction = ImeAction.Done,
            onDone = vm::create,
            enabled = !vm.busy,
        )

        vm.error?.let { ErrorText(it) }
        if (vm.busy) CircularProgressIndicator() else BigButton(text = "Crear contraseñas", onClick = vm::create)
    }
}

@Composable
fun NeedsInternetScreen(message: String, onRetry: () -> Unit) {
    AuthLayout {
        Icon(
            Icons.Filled.Warning,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.error,
        )
        Title("Guastaccesorio")
        Text(message, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        BigButton(text = "Reintentar", onClick = onRetry)
    }
}

// ---------------------------------------------------------------- Piezas comunes

@Composable
private fun AuthLayout(content: @Composable ColumnScope.() -> Unit) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        ) {
            Spacer(Modifier.height(16.dp))
            Column(
                Modifier.widthIn(max = 480.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                content = content,
            )
        }
    }
}

@Composable
private fun Title(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.headlineMedium,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        color = MaterialTheme.colorScheme.primary,
    )
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun ErrorText(text: String) {
    Text(
        text,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.titleMedium,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun Banner(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(text, modifier = Modifier.padding(16.dp), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
    }
}
