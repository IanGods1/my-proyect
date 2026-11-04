package com.casematch.app.ui.screens.models

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.util.BrandDetector
import com.casematch.app.util.ModelSearch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class BrandSection(val brand: String, val models: List<PhoneModel>)

class ModelsViewModel(private val repository: CompatRepository) : ViewModel() {

    var filter by mutableStateOf("")
        private set

    fun onFilterChange(value: String) {
        filter = value
    }

    /** Modelos agrupados por marca: Apple, Samsung, Xiaomi, Motorola, luego el resto. */
    val sections: StateFlow<List<BrandSection>?> =
        combine(snapshotFlow { filter }, repository.observeModels()) { f, models ->
            val visible = if (f.isBlank()) models
            else ModelSearch.search(models, f, { it.name }, { it.brand }, limit = Int.MAX_VALUE)
            visible.groupBy { it.brand.ifBlank { BrandDetector.OTHER } }
                .toSortedMap(BrandDetector.brandComparator)
                .map { (brand, list) -> BrandSection(brand, list.sortedWith(modelOrder)) }
        }
            .flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    var message by mutableStateOf<String?>(null)
        private set

    fun clearMessage() {
        message = null
    }

    /** Guarda (crea si [id] es null). Llama a [onSuccess] solo si se guardó sin errores. */
    fun save(id: Long?, name: String, brand: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            val error = if (id == null) repository.addModel(name, brand) else repository.updateModel(id, name, brand)
            if (error == null) {
                message = if (id == null) "Modelo agregado" else "Modelo actualizado"
                onSuccess()
            } else {
                message = error
            }
        }
    }

    fun delete(model: PhoneModel) {
        viewModelScope.launch {
            repository.deleteModel(model.id)
            message = "\"${model.name}\" eliminado"
        }
    }

    private companion object {
        /** Orden natural: "iPhone 9" antes que "iPhone 13". */
        val modelOrder: Comparator<PhoneModel> = Comparator { a, b -> naturalCompare(a.name, b.name) }

        fun naturalCompare(a: String, b: String): Int {
            val re = Regex("\\d+|\\D+")
            val pa = re.findAll(a.lowercase()).map { it.value }.toList()
            val pb = re.findAll(b.lowercase()).map { it.value }.toList()
            for (i in 0 until minOf(pa.size, pb.size)) {
                val x = pa[i]
                val y = pb[i]
                val c = if (x[0].isDigit() && y[0].isDigit()) {
                    x.trimStart('0').length.compareTo(y.trimStart('0').length).takeIf { it != 0 }
                        ?: x.trimStart('0').compareTo(y.trimStart('0'))
                } else {
                    x.compareTo(y)
                }
                if (c != 0) return c
            }
            return pa.size.compareTo(pb.size)
        }
    }
}
