package com.casematch.app.ui.screens.group

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.model.GroupType
import com.casematch.app.util.ModelSearch
import com.casematch.app.util.TextNormalizer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class GroupEditViewModel(
    private val groupId: Long?,
    initialType: GroupType,
    private val repository: CompatRepository,
) : ViewModel() {

    val isNew = groupId == null

    var type by mutableStateOf(initialType)
    var name by mutableStateOf("")
    var note by mutableStateOf("")
    var modelInput by mutableStateOf("")
    val models = mutableStateListOf<String>()

    var loading by mutableStateOf(groupId != null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var finished by mutableStateOf(false)
        private set

    val allModels: StateFlow<List<PhoneModel>> = repository.observeModels()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init {
        if (groupId != null) {
            viewModelScope.launch {
                val g = repository.getGroup(groupId)
                if (g != null) {
                    type = g.group.type
                    name = g.group.name
                    note = g.group.note
                    models.clear()
                    models.addAll(g.models.map { it.name }.sortedBy { it.lowercase() })
                } else {
                    error = "El grupo ya no existe"
                }
                loading = false
            }
        }
    }

    /** Sugerencias de modelos ya registrados para el texto que se está escribiendo. */
    fun suggestions(all: List<PhoneModel>): List<PhoneModel> {
        val current = models.map { TextNormalizer.normalize(it) }.toSet()
        return ModelSearch.search(all, modelInput, { it.name }, { it.brand }, limit = 10)
            .filter { TextNormalizer.normalize(it.name) !in current }
            .take(5)
    }

    /**
     * Agrega el/los modelo(s) escritos. Se pueden escribir varios separados por coma,
     * punto y coma o salto de línea: "iPhone 13, iPhone 14".
     */
    fun addFromInput(text: String = modelInput) {
        val parts = text.split(',', ';', '\n').map { TextNormalizer.clean(it) }.filter { it.isNotEmpty() }
        val known = allModels.value.associateBy { it.normalized }
        for (p in parts) {
            val n = TextNormalizer.normalize(p)
            if (n.isEmpty() || models.any { TextNormalizer.normalize(it) == n }) continue
            // Si el modelo ya existe se usa su nombre registrado (ej. "IPHONE 13" -> "iPhone 13").
            models.add(known[n]?.name ?: p)
        }
        modelInput = ""
        error = null
    }

    fun removeModel(name: String) {
        models.remove(name)
    }

    fun save() {
        if (modelInput.isNotBlank()) addFromInput()
        viewModelScope.launch {
            val result = repository.saveGroup(groupId, type, name, note, models.toList())
            if (result == null) finished = true else error = result
        }
    }

    fun delete() {
        val id = groupId ?: return
        viewModelScope.launch {
            repository.deleteGroup(id)
            finished = true
        }
    }
}
