package com.casematch.app.ui.screens.models

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.ConfirmDialog
import com.casematch.app.ui.components.EmptyState

/**
 * Lista de todos los modelos ordenados por marca.
 * En [adminMode] permite agregar, editar y eliminar modelos.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ModelsScreen(
    repository: CompatRepository,
    adminMode: Boolean,
    onBack: () -> Unit,
    onOpenModel: (Long) -> Unit,
) {
    val vm: ModelsViewModel = viewModel { ModelsViewModel(repository) }
    val sections by vm.sections.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    // null = cerrado; PhoneModel con id 0 = nuevo modelo.
    var editing by remember { mutableStateOf<PhoneModel?>(null) }
    var deleting by remember { mutableStateOf<PhoneModel?>(null) }

    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it)
            vm.clearMessage()
        }
    }

    Scaffold(
        topBar = {
            AppTopBar(
                title = if (adminMode) "Administrar modelos" else "Modelos registrados",
                subtitle = sections?.let { s -> "${s.sumOf { it.models.size }} modelos" },
                onBack = onBack,
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            if (adminMode) {
                ExtendedFloatingActionButton(
                    onClick = { editing = PhoneModel(id = 0, name = "", brand = "", normalized = "") },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("Agregar modelo") },
                )
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding()) {
            OutlinedTextField(
                value = vm.filter,
                onValueChange = vm::onFilterChange,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Filtrar modelos") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (vm.filter.isNotEmpty()) {
                        IconButton(onClick = { vm.onFilterChange("") }) {
                            Icon(Icons.Filled.Clear, contentDescription = "Borrar filtro")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(16.dp),
            )

            val list = sections
            when {
                list == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                list.isEmpty() -> EmptyState(
                    text = if (vm.filter.isBlank()) "Todavía no hay modelos registrados" else "No se encontró ningún modelo",
                    detail = if (vm.filter.isBlank()) "Agrega grupos de compatibilidad desde \"Administrar datos\"." else null,
                )
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 96.dp),
                ) {
                    list.forEach { section ->
                        stickyHeader(key = "brand-${section.brand}") {
                            Surface(color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    "${section.brand} (${section.models.size})",
                                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                        items(section.models, key = { it.id }) { model ->
                            ModelRow(
                                model = model,
                                adminMode = adminMode,
                                onClick = { if (adminMode) editing = model else onOpenModel(model.id) },
                                onEdit = { editing = model },
                                onDelete = { deleting = model },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }

    editing?.let { model ->
        ModelEditDialog(
            model = model,
            onDismiss = { editing = null },
            onSave = { name, brand ->
                vm.save(model.id.takeIf { it > 0 }, name, brand) { editing = null }
            },
        )
    }

    deleting?.let { model ->
        ConfirmDialog(
            title = "Eliminar modelo",
            text = "¿Eliminar \"${model.name}\"? También se quitará de todos los grupos de compatibilidad.",
            onConfirm = {
                vm.delete(model)
                deleting = null
            },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun ModelRow(
    model: PhoneModel,
    adminMode: Boolean,
    onClick: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            model.name,
            modifier = Modifier.weight(1f).padding(vertical = 10.dp),
            style = MaterialTheme.typography.titleMedium,
        )
        if (adminMode) {
            IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = "Editar ${model.name}") }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Eliminar ${model.name}", tint = MaterialTheme.colorScheme.error)
            }
        } else {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
    }
}

@Composable
private fun ModelEditDialog(
    model: PhoneModel,
    onDismiss: () -> Unit,
    onSave: (name: String, brand: String) -> Unit,
) {
    var name by remember { mutableStateOf(model.name) }
    var brand by remember { mutableStateOf(model.brand) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (model.id == 0L) "Agregar modelo" else "Editar modelo") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Modelo") },
                    placeholder = { Text("ej. Galaxy A54") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                )
                OutlinedTextField(
                    value = brand,
                    onValueChange = { brand = it },
                    label = { Text("Marca") },
                    placeholder = { Text("Se detecta sola si la dejas vacía") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(name, brand) }, enabled = name.isNotBlank()) {
                Text("Guardar", style = MaterialTheme.typography.labelLarge)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar", style = MaterialTheme.typography.labelLarge) }
        },
    )
}
