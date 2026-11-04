package com.casematch.app.ui.screens.admin

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.GroupWithModels
import com.casematch.app.io.ParsedImport
import com.casematch.app.model.GroupType
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.BigButton
import com.casematch.app.ui.components.ConfirmDialog
import com.casematch.app.ui.components.EmptyState
import java.time.LocalDate

@Composable
fun AdminScreen(
    repository: CompatRepository,
    onBack: () -> Unit,
    onNewGroup: (GroupType) -> Unit,
    onEditGroup: (Long) -> Unit,
    onManageModels: () -> Unit,
) {
    val vm: AdminViewModel = viewModel { AdminViewModel(repository) }
    val groups by vm.groups.collectAsStateWithLifecycle()
    val resolver = LocalContext.current.contentResolver
    val snackbar = remember { SnackbarHostState() }

    // Filtro: null = todos.
    var filterName by rememberSaveable { mutableStateOf<String?>(null) }
    val filter = filterName?.let { GroupType.valueOf(it) }
    var deleting by remember { mutableStateOf<GroupWithModels?>(null) }
    var showNewGroupDialog by remember { mutableStateOf(false) }
    var showExportDialog by remember { mutableStateOf(false) }

    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.readImportFile(resolver, uri)
    }
    val exportCsvLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(ExportFormat.CSV.mime)
    ) { uri -> if (uri != null) vm.export(resolver, uri, ExportFormat.CSV) }
    val exportXlsxLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(ExportFormat.XLSX.mime)
    ) { uri -> if (uri != null) vm.export(resolver, uri, ExportFormat.XLSX) }

    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it, withDismissAction = true, duration = SnackbarDuration.Long)
            vm.clearMessage()
        }
    }

    Scaffold(
        topBar = { AppTopBar(title = "Administrar datos", onBack = onBack) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth())

            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    BigButton(
                        text = "Nuevo grupo de compatibilidad",
                        icon = Icons.Filled.Add,
                        onClick = { showNewGroupDialog = true },
                    )
                }
                item {
                    BigButton(
                        text = "Administrar modelos",
                        icon = Icons.AutoMirrored.Filled.List,
                        outlined = true,
                        onClick = onManageModels,
                    )
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BigButton(
                            text = "Importar",
                            outlined = true,
                            enabled = !vm.busy,
                            modifier = Modifier.weight(1f),
                            onClick = { importLauncher.launch(arrayOf("*/*")) },
                        )
                        BigButton(
                            text = "Exportar",
                            outlined = true,
                            enabled = !vm.busy,
                            modifier = Modifier.weight(1f),
                            onClick = { showExportDialog = true },
                        )
                    }
                }
                item {
                    Text(
                        "Importar: archivo CSV o Excel (.xlsx) con columnas tipo, grupo, modelo, nota.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                item {
                    Spacer(Modifier.height(8.dp))
                    Text("Grupos registrados", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                        FilterChip(
                            selected = filter == null,
                            onClick = { filterName = null },
                            label = { Text("Todos") },
                        )
                        GroupType.entries.forEach { t ->
                            FilterChip(
                                selected = filter == t,
                                onClick = { filterName = t.name },
                                label = { Text(t.label) },
                            )
                        }
                    }
                }

                val list = groups
                when {
                    list == null -> item {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                    else -> {
                        val visible = list.filter { filter == null || it.group.type == filter }
                        if (visible.isEmpty()) {
                            item { EmptyState("No hay grupos registrados") }
                        }
                        items(visible, key = { it.group.id }) { g ->
                            GroupItem(
                                group = g,
                                onClick = { onEditGroup(g.group.id) },
                                onDelete = { deleting = g },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showNewGroupDialog) {
        AlertDialog(
            onDismissRequest = { showNewGroupDialog = false },
            title = { Text("¿Qué tipo de grupo?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    GroupType.entries.forEach { t ->
                        BigButton(text = t.label, onClick = {
                            showNewGroupDialog = false
                            onNewGroup(t)
                        })
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showNewGroupDialog = false }) { Text("Cancelar") } },
        )
    }

    if (showExportDialog) {
        AlertDialog(
            onDismissRequest = { showExportDialog = false },
            title = { Text("Exportar respaldo") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Guarda todos los grupos y modelos en un archivo.", style = MaterialTheme.typography.bodyLarge)
                    ExportFormat.entries.forEach { f ->
                        BigButton(text = f.label, outlined = f != ExportFormat.CSV, onClick = {
                            showExportDialog = false
                            val fileName = "guastaccesorio_respaldo_${LocalDate.now()}.${f.extension}"
                            when (f) {
                                ExportFormat.CSV -> exportCsvLauncher.launch(fileName)
                                ExportFormat.XLSX -> exportXlsxLauncher.launch(fileName)
                            }
                        })
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showExportDialog = false }) { Text("Cancelar") } },
        )
    }

    vm.pendingImport?.let { parsed ->
        ImportConfirmDialog(
            parsed = parsed,
            onAdd = { vm.confirmImport(replaceAll = false) },
            onReplace = { vm.confirmImport(replaceAll = true) },
            onDismiss = vm::cancelImport,
        )
    }

    deleting?.let { g ->
        ConfirmDialog(
            title = "Eliminar grupo",
            text = "¿Eliminar el grupo \"${g.group.name}\"? Los modelos seguirán registrados.",
            onConfirm = {
                vm.deleteGroup(g)
                deleting = null
            },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun GroupItem(group: GroupWithModels, onClick: () -> Unit, onDelete: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Surface(
                    color = if (group.group.type == GroupType.CASE) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(8.dp),
                ) {
                    Text(
                        group.group.type.label,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
                Text(group.group.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    group.models.sortedBy { it.name.lowercase() }.joinToString(", ") { it.name }
                        .ifEmpty { "(sin modelos)" },
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (group.group.note.isNotBlank()) {
                    Text(
                        "Nota: ${group.group.note}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = "Eliminar grupo", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun ImportConfirmDialog(
    parsed: ParsedImport,
    onAdd: () -> Unit,
    onReplace: () -> Unit,
    onDismiss: () -> Unit,
) {
    var confirmReplace by remember { mutableStateOf(false) }
    if (confirmReplace) {
        ConfirmDialog(
            title = "Reemplazar todo",
            text = "Se borrarán TODOS los grupos y modelos actuales y se cargarán los del archivo. ¿Continuar?",
            confirmText = "Reemplazar",
            onConfirm = onReplace,
            onDismiss = { confirmReplace = false },
        )
        return
    }
    val groupCount = parsed.rows.filter { it.type != null }.map { it.type to it.group.lowercase() }.distinct().size
    val modelCount = parsed.rows.map { it.model.lowercase() }.distinct().size
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Importar datos") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "Se encontraron ${parsed.rows.size} filas válidas: $groupCount grupos y $modelCount modelos.",
                    style = MaterialTheme.typography.bodyLarge,
                )
                if (parsed.errors.isNotEmpty()) {
                    HorizontalDivider()
                    Text(
                        "${parsed.errors.size} filas con errores se omitirán:",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    parsed.errors.take(5).forEach { Text("• $it", style = MaterialTheme.typography.bodyMedium) }
                    if (parsed.errors.size > 5) Text("…y ${parsed.errors.size - 5} más", style = MaterialTheme.typography.bodyMedium)
                }
                HorizontalDivider()
                BigButton(text = "Agregar a los datos actuales", onClick = onAdd)
                BigButton(text = "Reemplazar todo", outlined = true, onClick = { confirmReplace = true })
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
