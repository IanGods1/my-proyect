package com.casematch.app.ui.screens.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.ThemeMode
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.BigButton
import com.casematch.app.ui.components.EmptyState

@Composable
fun HomeScreen(
    repository: CompatRepository,
    themeMode: ThemeMode,
    onThemeModeChange: (ThemeMode) -> Unit,
    onOpenModel: (Long) -> Unit,
    onOpenModels: () -> Unit,
    onOpenAdmin: () -> Unit,
) {
    val vm: HomeViewModel = viewModel { HomeViewModel(repository) }
    val suggestions by vm.suggestions.collectAsStateWithLifecycle()
    val modelCount by vm.modelCount.collectAsStateWithLifecycle()
    val groupCount by vm.groupCount.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    var menuOpen by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            AppTopBar(
                title = "CaseMatch",
                subtitle = "Compatibilidad de cases y vidrios",
                actions = {
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "Más opciones")
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            Text(
                                "Tema",
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            ThemeMode.entries.forEach { mode ->
                                DropdownMenuItem(
                                    text = { Text(mode.label) },
                                    onClick = {
                                        onThemeModeChange(mode)
                                        menuOpen = false
                                    },
                                    trailingIcon = {
                                        if (mode == themeMode) Icon(Icons.Filled.Check, contentDescription = "Seleccionado")
                                    },
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(horizontal = 16.dp),
        ) {
            OutlinedTextField(
                value = vm.query,
                onValueChange = vm::onQueryChange,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                textStyle = MaterialTheme.typography.titleMedium,
                placeholder = { Text("Buscar modelo (ej. iPhone 13)") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (vm.query.isNotEmpty()) {
                        IconButton(onClick = { vm.onQueryChange("") }) {
                            Icon(Icons.Filled.Clear, contentDescription = "Borrar búsqueda")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
                keyboardOptions = KeyboardOptions(
                    imeAction = ImeAction.Search,
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                ),
                keyboardActions = KeyboardActions(onSearch = {
                    suggestions.firstOrNull()?.let {
                        focus.clearFocus()
                        onOpenModel(it.id)
                    }
                }),
            )

            if (vm.query.isBlank()) {
                Spacer(Modifier.height(24.dp))
                Text(
                    "Escribe un modelo para ver qué otros teléfonos usan el mismo case o el mismo vidrio templado.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(24.dp))
                BigButton(
                    text = "Lista de modelos",
                    icon = Icons.AutoMirrored.Filled.List,
                    onClick = onOpenModels,
                )
                Spacer(Modifier.height(12.dp))
                BigButton(
                    text = "Administrar datos",
                    icon = Icons.Filled.Settings,
                    outlined = true,
                    onClick = onOpenAdmin,
                )
                Spacer(Modifier.height(24.dp))
                Text(
                    "$modelCount modelos registrados · $groupCount grupos de compatibilidad",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (suggestions.isEmpty()) {
                EmptyState(
                    text = "No se encontró ningún modelo",
                    detail = "Revisa cómo está escrito o agrégalo desde \"Administrar datos\".",
                    modifier = Modifier.padding(top = 24.dp),
                )
            } else {
                LazyColumn(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(suggestions, key = { it.id }) { model ->
                        SuggestionItem(model) {
                            focus.clearFocus()
                            onOpenModel(model.id)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestionItem(model: PhoneModel, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(model.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    model.brand,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
    }
}
