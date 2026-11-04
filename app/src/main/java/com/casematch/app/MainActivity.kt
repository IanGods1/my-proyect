package com.casematch.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.casematch.app.auth.AuthState
import com.casematch.app.ui.navigation.AppNavHost
import com.casematch.app.ui.screens.auth.LoginScreen
import com.casematch.app.ui.screens.auth.NeedsInternetScreen
import com.casematch.app.ui.screens.auth.SetupScreen
import com.casematch.app.ui.theme.CaseMatchTheme

class MainActivity : ComponentActivity() {
    private val app get() = application as CaseMatchApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            var themeMode by remember { mutableStateOf(app.themeMode) }
            val authState by app.auth.state.collectAsStateWithLifecycle()
            val dark = when (themeMode) {
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }
                        DisposableEffect(dark) {
                // Barra de estado con íconos claros sobre la barra superior azul marino.
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
                    navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark },
                )
                onDispose {}
            }
            CaseMatchTheme(darkTheme = dark) {
                when (val s = authState) {
                    AuthState.Loading -> Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    }
                    AuthState.NeedsSetup -> SetupScreen(app.auth)
                    is AuthState.NeedsInternet -> NeedsInternetScreen(s.message, onRetry = app.auth::retry)
                    is AuthState.LoggedOut -> LoginScreen(app.auth, s.message)
                    is AuthState.LoggedIn -> AppNavHost(
                        repository = app.repository,
                        auth = app.auth,
                        role = s.role,
                        themeMode = themeMode,
                        onThemeModeChange = {
                            themeMode = it
                            app.themeMode = it
                        },
                    )
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        // Cada vez que se abre la app: el trabajador revisa si cambió la contraseña;
        // el administrador sincroniza con la nube.
        app.auth.onAppForeground()
    }
}
