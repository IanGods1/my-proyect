package com.casematch.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp

/** Azul marino oscuro: color principal de Guastaccesorio. */
val Navy = Color(0xFF0A2342)
val OnNavy = Color(0xFFFFFFFF)

private val LightColors = lightColorScheme(
    primary = Navy,
    onPrimary = OnNavy,
    primaryContainer = Color(0xFFD6E0F0),
    onPrimaryContainer = Color(0xFF001A3D),
    secondary = Color(0xFF3D5A80),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFDCE5F3),
    onSecondaryContainer = Color(0xFF0D1F38),
    tertiaryContainer = Color(0xFFFFE0B2),
    onTertiaryContainer = Color(0xFF3E2600),
    background = Color(0xFFF4F6FA),
    surface = Color(0xFFF4F6FA),
    surfaceVariant = Color(0xFFE1E6EF),
    onSurfaceVariant = Color(0xFF424A57),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA9C4EE),
    onPrimary = Navy,
    primaryContainer = Color(0xFF1D3A66),
    onPrimaryContainer = Color(0xFFD6E0F0),
    secondary = Color(0xFF9DB4D6),
    onSecondary = Color(0xFF0D1F38),
    secondaryContainer = Color(0xFF243B5C),
    onSecondaryContainer = Color(0xFFDCE5F3),
    tertiaryContainer = Color(0xFF5A3D00),
    onTertiaryContainer = Color(0xFFFFE0B2),
    background = Color(0xFF07111F),
    surface = Color(0xFF07111F),
    surfaceVariant = Color(0xFF17253B),
    onSurfaceVariant = Color(0xFFC3CCDA),
)

/** Textos un poco más grandes de lo normal para que la app sea fácil de leer. */
private val AppTypography = Typography().let { t ->
    t.copy(
        bodyLarge = t.bodyLarge.copy(fontSize = 18.sp, lineHeight = 26.sp),
        bodyMedium = t.bodyMedium.copy(fontSize = 16.sp, lineHeight = 22.sp),
        titleMedium = t.titleMedium.copy(fontSize = 18.sp),
        titleLarge = t.titleLarge.copy(fontSize = 22.sp),
        labelLarge = t.labelLarge.copy(fontSize = 17.sp),
    )
}

@Composable
fun CaseMatchTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}
