package com.casematch.app.ui.screens.result

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import com.casematch.app.ui.components.AppTopBar
import com.casematch.app.ui.components.ChoiceRow
import com.casematch.app.ui.components.EmptyState
import com.casematch.app.ui.components.NoteBox

@Composable
fun ResultScreen(
    modelId: Long,
    repository: CompatRepository,
    onBack: () -> Unit,
    onOpenModel: (Long) -> Unit,
    /** null para el trabajador: no ve el botón de editar. */
    onEditGroup: ((Long) -> Unit)?,
) {
    val vm: ResultViewModel = viewModel(key = "result-$modelId") { ResultViewModel(modelId, repository) }
    val model by vm.model.collectAsStateWithLifecycle()
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val types = listOf(GroupType.CASE, GroupType.GLASS)

    Scaffold(
        topBar = {
            AppTopBar(
                title = model?.name ?: "Modelo",
                subtitle = model?.brand,
                onBack = onBack,
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            TabRow(selectedTabIndex = tab) {
                types.forEachIndexed { index, type ->
                    val count = state.allOthers(type).size
                    Tab(
                        selected = tab == index,
                        onClick = { tab = index },
                        text = {
                            Text(
                                if (count > 0) "${type.label} ($count)" else type.label,
                                style = MaterialTheme.typography.titleMedium,
                            )
                        },
                        modifier = Modifier.padding(vertical = 6.dp),
                    )
                }
            }

            val type = types[tab]

            // Vidrio templado: tres opciones (Normal, 9D, Privacy). Si el trabajador todavía no
            // eligió, se muestra la primera que tenga modelos compatibles.
            var variantName by rememberSaveable { mutableStateOf<String?>(null) }
            val variant = GroupVariant.entries.firstOrNull { it.name == variantName }
                ?: GroupVariant.entries.firstOrNull { state.othersOf(state.glassGroups(it)).isNotEmpty() }
                ?: GroupVariant.NORMAL
            if (type == GroupType.GLASS && !state.loading) {
                ChoiceRow(
                    options = GroupVariant.entries.toList(),
                    selected = variant,
                    label = { it.label },
                    onSelect = { variantName = it.name },
                    sublabel = { v ->
                        val n = state.othersOf(state.glassGroups(v)).size
                        if (n == 0) "sin datos" else if (n == 1) "1 modelo" else "$n modelos"
                    },
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp),
                )
            }

            val groups = if (type == GroupType.GLASS) state.glassGroups(variant) else state.groups(type)
            val others = state.othersOf(groups)
            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                others.isEmpty() -> EmptyState(
                    text = "Sin compatibilidades registradas",
                    detail = if (type == GroupType.CASE) "No hay otros modelos que usen el mismo case."
                    else "No hay otros modelos que usen el mismo ${variant.fullLabel.replaceFirstChar { it.lowercase() }}.",
                    modifier = Modifier.padding(top = 32.dp),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item {
                        Text(
                            if (type == GroupType.CASE) "El mismo case le queda a:"
                            else "El mismo ${variant.fullLabel.replaceFirstChar { it.lowercase() }} le queda a:",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    items(groups.filter { it.others.isNotEmpty() }, key = { it.groupId }) { group ->
                        GroupCard(
                            group = group,
                            onOpenModel = onOpenModel,
                            onEdit = onEditGroup?.let { edit -> { edit(group.groupId) } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupCard(
    group: CompatibilityGroup,
    onOpenModel: (Long) -> Unit,
    onEdit: (() -> Unit)?,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(vertical = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    group.name,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (onEdit != null) {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, contentDescription = "Editar grupo")
                    }
                } else {
                    // Mantiene la misma altura de la fila sin el botón.
                    Spacer(Modifier.height(48.dp))
                }
            }
            group.others.forEachIndexed { i, m ->
                if (i > 0) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
                CompatibleModelRow(m) { onOpenModel(m.id) }
            }
            if (group.note.isNotBlank()) {
                NoteBox(group.note, Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
            }
        }
    }
}

@Composable
private fun CompatibleModelRow(model: PhoneModel, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(model.name, style = MaterialTheme.typography.titleLarge)
            Text(
                model.brand,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Ver ${model.name}")
    }
}
