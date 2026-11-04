package com.casematch.app.ui.screens.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.PhoneModel
import com.casematch.app.util.ModelSearch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn

class HomeViewModel(repository: CompatRepository) : ViewModel() {

    var query by mutableStateOf("")
        private set

    fun onQueryChange(value: String) {
        query = value
    }

    /** Sugerencias que se actualizan mientras se escribe. */
    val suggestions: StateFlow<List<PhoneModel>> =
        combine(snapshotFlow { query }, repository.observeModels()) { q, models ->
            ModelSearch.search(models, q, { it.name }, { it.brand }, limit = 30)
        }
            .flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val modelCount: StateFlow<Int> = repository.observeModelCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val groupCount: StateFlow<Int> = repository.observeGroupCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}
