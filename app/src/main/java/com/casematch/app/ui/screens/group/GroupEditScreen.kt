package com.casematch.app.ui.screens.group

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.CompatRepository.Companion.defaultGroupName
import com.casematch.app.model.GroupType
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.BigButton
import com.casematch.app.ui.components.ConfirmDialog

@Composable
fun GroupEditScreen(
    groupId: Long?,
    initialType: GroupType,
    repository: CompatRepository,
    onDone: () -> Unit,
) {
    val vm: GroupEditViewModel = viewModel(key = "group-${groupId ?: "new"}") {
        GroupEditViewModel(groupId, initialType, repository)
    }
    val allModels by vm.allModels.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(vm.finished) {
        if (vm.finished) onDone()
    }

    Scaffold(
        topBar = {
            AppTopBar(
                title = if (vm.isNew) "Nuevo grupo" else "Editar grupo",
                onBack = onDone,
                actions = {
                    if (!vm.isNew) {
                        IconButton(onClick = { confirmDelete = true }) {
                            Icon(Icons.Filled.Delete, contentDescription = "Eliminar grupo", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (vm.loading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ---- Tipo
            SectionTitle("Tipo")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                GroupType.entries.forEach { t ->
                    val selected = vm.type == t
                    val m = Modifier.weight(1f).heightIn(min = 60.dp)
                    val shape = RoundedCornerShape(16.dp)
                    if (selected) {
                        Button(onClick = { vm.type = t }, modifier = m, shape = shape) {
                            Text(t.label, style = MaterialTheme.typography.titleMedium)
                        }
                    } else {
                        OutlinedButton(onClick = { vm.type = t }, modifier = m, shape = shape) {
                            Text(t.label, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
            }

            // ---- Nombre
            OutlinedTextField(
                value = vm.name,
                onValueChange = { vm.name = it },
                label = { Text("Nombre del grupo") },
                placeholder = {
                    Text(
                        if (vm.models.isEmpty()) "ej. Case grupo iPhone 13/14/15"
                        else defaultGroupName(vm.type, vm.models)
                    )
                },
                supportingText = { Text("Si lo dejas vacío se genera con los modelos") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            // ---- Modelos
            SectionTitle("Modelos del grupo (${vm.models.size})")
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = vm.modelInput,
                    onValueChange = { vm.modelInput = it },
                    label = { Text("Agregar modelo") },
                    placeholder = { Text("ej. iPhone 14") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(
                        imeAction = ImeAction.Done,
                        capitalization = KeyboardCapitalization.Words,
                        autoCorrectEnabled = false,
                    ),
                    keyboardActions = KeyboardActions(onDone = { vm.addFromInput() }),
                )
                Button(
                    onClick = { vm.addFromInput() },
                    enabled = vm.modelInput.isNotBlank(),
                    modifier = Modifier.heightIn(min = 56.dp),
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Agregar")
                }
            }
            Text(
                "Puedes escribir varios separados por coma: iPhone 13, iPhone 14",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Sugerencias de modelos ya registrados
            val suggestions = if (vm.modelInput.isBlank()) emptyList() else vm.suggestions(allModels)
            if (suggestions.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column {
                        suggestions.forEachIndexed { i, m ->
                            if (i > 0) HorizontalDivider()
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { vm.addFromInput(m.name) }
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.Filled.Add, contentDescription = null)
                                Text(
                                    "${m.name}  ·  ${m.brand}",
                                    modifier = Modifier.padding(start = 12.dp),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                        }
                    }
                }
            }

            if (vm.models.isEmpty()) {
                Text(
                    "Todavía no agregaste modelos.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Card(shape = RoundedCornerShape(16.dp)) {
                    Column {
                        vm.models.forEachIndexed { i, name ->
                            if (i > 0) HorizontalDivider()
                            Row(
                                Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                                IconButton(onClick = { vm.removeModel(name) }) {
                                    Icon(Icons.Filled.Close, contentDescription = "Quitar $name")
                                }
                            }
                        }
                    }
                }
            }

            // ---- Nota
            OutlinedTextField(
                value = vm.note,
                onValueChange = { vm.note = it },
                label = { Text("Nota (opcional)") },
                placeholder = { Text("ej. La cámara del 15 queda un poco justa") },
                minLines = 2,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            )

            vm.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.titleMedium)
            }

            BigButton(text = "Guardar grupo", onClick = vm::save)
            if (!vm.isNew) {
                BigButton(text = "Eliminar grupo", isDestructive = true, onClick = { confirmDelete = true })
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (confirmDelete) {
        ConfirmDialog(
            title = "Eliminar grupo",
            text = "¿Eliminar el grupo \"${vm.name}\"? Los modelos seguirán registrados.",
            onConfirm = {
                confirmDelete = false
                vm.delete()
            },
            onDismiss = { confirmDelete = false },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}
