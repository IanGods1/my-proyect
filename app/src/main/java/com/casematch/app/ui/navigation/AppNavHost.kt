package com.casematch.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.casematch.app.ThemeMode
import com.casematch.app.auth.AuthManager
import com.casematch.app.auth.Role
import com.casematch.app.data.CompatRepository
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import com.casematch.app.ui.screens.admin.AdminScreen
import com.casematch.app.ui.screens.group.GroupEditScreen
import com.casematch.app.ui.screens.home.HomeScreen
import com.casematch.app.ui.screens.models.ModelsScreen
import com.casematch.app.ui.screens.result.ResultScreen
import com.casematch.app.ui.screens.settings.SettingsScreen

private object Routes {
    const val HOME = "home"
    const val MODELS = "models"
    const val ADMIN = "admin"
    const val ADMIN_MODELS = "admin_models"
    const val SETTINGS = "settings"
    const val RESULT = "result/{modelId}"
    const val GROUP = "group/{groupId}?type={type}&variant={variant}"

    fun result(modelId: Long) = "result/$modelId"
    fun group(groupId: Long?, type: GroupType? = null, variant: GroupVariant? = null): String {
        val args = listOfNotNull(type?.let { "type=${it.name}" }, variant?.let { "variant=${it.name}" })
        return "group/${groupId ?: -1L}" + if (args.isEmpty()) "" else "?" + args.joinToString("&")
    }
}

/**
 * Navegación. Las pantallas de administración (grupos, modelos, importar/exportar y
 * configuración) solo se registran para el ADMINISTRADOR: el trabajador no puede llegar a ellas.
 */
@Composable
fun AppNavHost(
    repository: CompatRepository,
    auth: AuthManager,
    role: Role,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
) {
    val nav = rememberNavController()
    val back: () -> Unit = { nav.popBackStack() }
    val isAdmin = role == Role.ADMIN

    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                repository = repository,
                isAdmin = isAdmin,
                onOpenModel = { nav.navigate(Routes.result(it)) },
                onOpenModels = { nav.navigate(Routes.MODELS) },
                onOpenAdmin = { nav.navigate(Routes.ADMIN) },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(
            Routes.RESULT,
            arguments = listOf(navArgument("modelId") { type = NavType.LongType }),
        ) { entry ->
            val modelId = entry.arguments?.getLong("modelId") ?: -1L
            ResultScreen(
                modelId = modelId,
                repository = repository,
                onBack = back,
                onOpenModel = { nav.navigate(Routes.result(it)) },
                onEditGroup = if (isAdmin) ({ id: Long -> nav.navigate(Routes.group(id)) }) else null,
            )
        }
        composable(Routes.MODELS) {
            ModelsScreen(
                repository = repository,
                adminMode = false,
                onBack = back,
                onOpenModel = { nav.navigate(Routes.result(it)) },
            )
        }
        if (!isAdmin) return@NavHost

        // ------------------------------------------------ Solo administrador
        composable(Routes.SETTINGS) {
            SettingsScreen(
                auth = auth,
                themeMode = themeMode,
                onThemeModeChange = onThemeModeChange,
                onBack = back,
            )
        }
        composable(Routes.ADMIN_MODELS) {
            ModelsScreen(
                repository = repository,
                adminMode = true,
                onBack = back,
                onOpenModel = { nav.navigate(Routes.result(it)) },
            )
        }
        composable(Routes.ADMIN) {
            AdminScreen(
                repository = repository,
                onBack = back,
                onNewGroup = { type, variant -> nav.navigate(Routes.group(null, type, variant)) },
                onEditGroup = { nav.navigate(Routes.group(it)) },
                onManageModels = { nav.navigate(Routes.ADMIN_MODELS) },
            )
        }
        composable(
            Routes.GROUP,
            arguments = listOf(
                navArgument("groupId") { type = NavType.LongType },
                navArgument("type") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
                navArgument("variant") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                },
            ),
        ) { entry ->
            val groupId = entry.arguments?.getLong("groupId") ?: -1L
            val type = entry.arguments?.getString("type")
                ?.let { t -> GroupType.entries.firstOrNull { it.name == t } }
            val variant = entry.arguments?.getString("variant")
                ?.let { v -> GroupVariant.entries.firstOrNull { it.name == v } }
            GroupEditScreen(
                groupId = groupId.takeIf { it > 0 },
                initialType = type ?: GroupType.CASE,
                initialVariant = variant ?: GroupVariant.NORMAL,
                repository = repository,
                onDone = back,
            )
        }
    }
}
