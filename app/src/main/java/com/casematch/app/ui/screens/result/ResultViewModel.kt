package com.casematch.app.ui.screens.result

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.GroupWithModels
import com.casematch.app.data.PhoneModel
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Grupo visto desde el modelo buscado: los "otros" modelos son los compatibles. */
data class CompatibilityGroup(
    val groupId: Long,
    val name: String,
    val note: String,
    val variant: GroupVariant,
    val others: List<PhoneModel>,
)

data class ResultState(
    val loading: Boolean = true,
    val byType: Map<GroupType, List<CompatibilityGroup>> = emptyMap(),
) {
    fun groups(type: GroupType): List<CompatibilityGroup> = byType[type].orEmpty()

    /** Grupos de vidrio templado de una clase (Normal, 9D o Privacy). */
    fun glassGroups(variant: GroupVariant): List<CompatibilityGroup> =
        groups(GroupType.GLASS).filter { it.variant == variant }

    /** Modelos compatibles de varios grupos, sin repetir. */
    fun othersOf(groups: List<CompatibilityGroup>): List<PhoneModel> =
        groups.flatMap { it.others }.distinctBy { it.id }.sortedBy { it.name.lowercase() }

    /** Todos los modelos compatibles de ese tipo, sin repetir. */
    fun allOthers(type: GroupType): List<PhoneModel> = othersOf(groups(type))
}

class ResultViewModel(private val modelId: Long, repository: CompatRepository) : ViewModel() {

    val model: StateFlow<PhoneModel?> = repository.observeModel(modelId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val state: StateFlow<ResultState> = repository.observeGroupsForModel(modelId)
        .map { groups -> ResultState(loading = false, byType = toCompatibility(groups)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ResultState())

    private fun toCompatibility(groups: List<GroupWithModels>): Map<GroupType, List<CompatibilityGroup>> =
        groups.groupBy { it.group.type }.mapValues { (_, list) ->
            list.map { g ->
                CompatibilityGroup(
                    groupId = g.group.id,
                    name = g.group.name,
                    note = g.group.note,
                    variant = g.group.variant,
                    others = g.models.filter { it.id != modelId }.sortedBy { it.name.lowercase() },
                )
            }
        }
}
