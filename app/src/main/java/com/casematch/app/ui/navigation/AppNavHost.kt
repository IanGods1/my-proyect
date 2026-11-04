package com.casematch.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.casematch.app.ThemeMode
import com.casematch.app.data.CompatRepository
import com.casematch.app.model.GroupType
import com.casematch.app.ui.screens.admin.AdminScreen
import com.casematch.app.ui.screens.group.GroupEditScreen
import com.casematch.app.ui.screens.home.HomeScreen
import com.casematch.app.ui.screens.models.ModelsScreen
import com.casematch.app.ui.screens.result.ResultScreen

private object Routes {
    const val HOME = "home"
    const val MODELS = "models"
    const val ADMIN = "admin"
    const val ADMIN_MODELS = "admin_models"
    const val RESULT = "result/{modelId}"
    const val GROUP = "group/{groupId}?type={type}"

    fun result(modelId: Long) = "result/$modelId"
    fun group(groupId: Long?, type: GroupType? = null) =
        "group/${groupId ?: -1L}" + (type?.let { "?type=${it.name}" } ?: "")
}

@Composable
fun AppNavHost(
    repository: CompatRepository,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
) {
    val nav = rememberNavController()
    val back: () -> Unit = { nav.popBackStack() }

    NavHost(navController = nav, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                repository = repository,
                themeMode = themeMode,
                onThemeModeChange = onThemeModeChange,
                onOpenModel = { nav.navigate(Routes.result(it)) },
                onOpenModels = { nav.navigate(Routes.MODELS) },
                onOpenAdmin = { nav.navigate(Routes.ADMIN) },
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
                onEditGroup = { nav.navigate(Routes.group(it)) },
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
                onNewGroup = { type -> nav.navigate(Routes.group(null, type)) },
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
            ),
        ) { entry ->
            val groupId = entry.arguments?.getLong("groupId") ?: -1L
            val type = entry.arguments?.getString("type")
                ?.let { t -> GroupType.entries.firstOrNull { it.name == t } }
            GroupEditScreen(
                groupId = groupId.takeIf { it > 0 },
                initialType = type ?: GroupType.CASE,
                repository = repository,
                onDone = back,
            )
        }
    }
}
