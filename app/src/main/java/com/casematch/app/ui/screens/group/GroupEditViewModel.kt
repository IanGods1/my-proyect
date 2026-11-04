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
import com.casematch.app.model.GroupVariant
import com.casematch.app.model.ModelInput
import com.casematch.app.util.BrandDetector
import com.casematch.app.util.ModelResolver
import com.casematch.app.util.ModelSearch
import com.casematch.app.util.TextNormalizer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class GroupEditViewModel(
    private val groupId: Long?,
    initialType: GroupType,
    initialVariant: GroupVariant,
    private val repository: CompatRepository,
) : ViewModel() {

    val isNew = groupId == null

    var type by mutableStateOf(initialType)
    var variant by mutableStateOf(initialVariant)
    var name by mutableStateOf("")
    var note by mutableStateOf("")

    /** Marca de los modelos que se agreguen a continuación. Vacía = detectarla según el nombre. */
    var brand by mutableStateOf("")
    var modelInput by mutableStateOf("")
    val models = mutableStateListOf<ModelInput>()

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
                    variant = g.group.variant
                    name = g.group.name
                    note = g.group.note
                    models.clear()
                    models.addAll(g.models.sortedBy { it.name.lowercase() }.map { ModelInput(it.name, it.brand) })
                } else {
                    error = "El grupo ya no existe"
                }
                loading = false
            }
        }
    }

    /** Marcas para elegir con un toque: las conocidas y las que ya existen en tus modelos. */
    fun brandOptions(all: List<PhoneModel>): List<String> =
        (BrandDetector.knownBrands + all.map { it.brand })
            .filter { it.isNotBlank() && it != BrandDetector.OTHER }
            .distinct()
            .sortedWith(BrandDetector.brandComparator)

    /** Sugerencias de modelos ya registrados para el texto que se está escribiendo. */
    fun suggestions(all: List<PhoneModel>): List<PhoneModel> {
        val current = models.map { TextNormalizer.normalize(it.name) }.toSet()
        return ModelSearch.search(all, modelInput, { it.name }, { it.brand }, limit = 10)
            .filter { TextNormalizer.normalize(it.name) !in current }
            .take(5)
    }

    /**
     * Agrega el/los modelo(s) escritos con la marca elegida arriba. Se pueden escribir varios
     * separados por coma, punto y coma o salto de línea: "A54, A55".
     * Si el modelo ya está registrado se reutiliza (con su nombre y marca).
     */
    fun addFromInput(text: String = modelInput) {
        val parts = text.split(',', ';', '\n').map { TextNormalizer.clean(it) }.filter { it.isNotEmpty() }
        val known = allModels.value.map { ModelResolver.Known(it.name, it.brand) }
        val chosenBrand = BrandDetector.canonical(brand)
        for (p in parts) {
            val match = ModelResolver.resolve(p, chosenBrand, known)
            val entry = if (match != null) {
                // Un modelo registrado en "Otras" toma la marca elegida.
                val b = if (match.brand == BrandDetector.OTHER && chosenBrand.isNotEmpty()) chosenBrand else match.brand
                ModelInput(match.name, b)
            } else {
                ModelInput(p, chosenBrand)
            }
            val key = TextNormalizer.normalize(entry.name)
            if (key.isEmpty() || models.any { TextNormalizer.normalize(it.name) == key }) continue
            models.add(entry)
        }
        modelInput = ""
        error = null
    }

    fun removeModel(model: ModelInput) {
        models.remove(model)
    }

    fun save() {
        if (modelInput.isNotBlank()) addFromInput()
        viewModelScope.launch {
            val result = repository.saveGroup(groupId, type, variant, name, note, models.toList())
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
