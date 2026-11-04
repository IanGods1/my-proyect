package com.casematch.app.ui.screens.admin

import android.content.ContentResolver
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.casematch.app.data.CompatRepository
import com.casematch.app.data.GroupWithModels
import com.casematch.app.io.CsvFormat
import com.casematch.app.io.ParsedImport
import com.casematch.app.io.TableImporter
import com.casematch.app.io.XlsxFormat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class ExportFormat(val mime: String, val extension: String, val label: String) {
    CSV("text/csv", "csv", "CSV"),
    XLSX("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx", "Excel (.xlsx)"),
}

class AdminViewModel(private val repository: CompatRepository) : ViewModel() {

    val groups: StateFlow<List<GroupWithModels>?> = repository.observeGroups()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    var message by mutableStateOf<String?>(null)
        private set

    /** Archivo leído y listo para confirmar la importación. */
    var pendingImport by mutableStateOf<ParsedImport?>(null)
        private set

    var busy by mutableStateOf(false)
        private set

    fun clearMessage() {
        message = null
    }

    fun deleteGroup(group: GroupWithModels) {
        viewModelScope.launch {
            repository.deleteGroup(group.group.id)
            message = "Grupo \"${group.group.name}\" eliminado"
        }
    }

    fun readImportFile(resolver: ContentResolver, uri: Uri) {
        viewModelScope.launch {
            busy = true
            try {
                val parsed = withContext(Dispatchers.IO) {
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: throw IllegalStateException("No se pudo abrir el archivo")
                    val table = when {
                        XlsxFormat.isLegacyXls(bytes) -> throw IllegalArgumentException(
                            "Formato .xls antiguo no soportado. En Excel usa \"Guardar como\" .xlsx o .csv"
                        )
                        XlsxFormat.isXlsx(bytes) -> XlsxFormat.read(bytes)
                        else -> CsvFormat.parse(bytes.toString(Charsets.UTF_8))
                    }
                    TableImporter.parse(table)
                }
                if (parsed.rows.isEmpty()) {
                    message = "No se encontraron datos para importar" +
                        (parsed.errors.firstOrNull()?.let { ". $it" } ?: "")
                } else {
                    pendingImport = parsed
                }
            } catch (e: Exception) {
                message = "Error al leer el archivo: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                busy = false
            }
        }
    }

    fun cancelImport() {
        pendingImport = null
    }

    fun confirmImport(replaceAll: Boolean) {
        val parsed = pendingImport ?: return
        pendingImport = null
        viewModelScope.launch {
            busy = true
            try {
                val s = repository.import(parsed.rows, replaceAll)
                message = "Importación completa: ${s.newGroups} grupos nuevos, ${s.newModels} modelos nuevos, " +
                    "${s.newLinks} compatibilidades agregadas"
            } catch (e: Exception) {
                message = "Error al importar: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                busy = false
            }
        }
    }

    fun export(resolver: ContentResolver, uri: Uri, format: ExportFormat) {
        viewModelScope.launch {
            busy = true
            try {
                val table = repository.exportTable()
                withContext(Dispatchers.IO) {
                    val bytes = when (format) {
                        ExportFormat.CSV -> CsvFormat.write(table).toByteArray(Charsets.UTF_8)
                        ExportFormat.XLSX -> XlsxFormat.write(table, "CaseMatch")
                    }
                    resolver.openOutputStream(uri, "wt")?.use { it.write(bytes) }
                        ?: throw IllegalStateException("No se pudo crear el archivo")
                }
                message = "Respaldo guardado (${table.size - 1} filas)"
            } catch (e: Exception) {
                message = "Error al exportar: ${e.message ?: e.javaClass.simpleName}"
            } finally {
                busy = false
            }
        }
    }
}
