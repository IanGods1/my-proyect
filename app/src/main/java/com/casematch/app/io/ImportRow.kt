package com.casematch.app.io

import com.casematch.app.model.GroupType
import com.casematch.app.util.TextNormalizer

/** Una fila de datos importada (tipo, grupo, modelo, nota y opcionalmente marca). */
data class ImportRow(
    val type: GroupType?,
    val group: String,
    val model: String,
    val note: String,
    val brand: String,
)

data class ParsedImport(
    val rows: List<ImportRow>,
    val errors: List<String>,
)

/**
 * Convierte una tabla (de CSV o Excel) en filas de importación.
 * Columnas: tipo, grupo, modelo, nota (y opcional: marca).
 * Si la primera fila tiene encabezados, las columnas se reconocen por nombre en cualquier orden.
 */
object TableImporter {
    val HEADER = listOf("tipo", "grupo", "modelo", "nota", "marca")

    private val aliases = mapOf(
        "tipo" to listOf("tipo", "type", "categoria"),
        "grupo" to listOf("grupo", "group", "nombregrupo", "nombredelgrupo"),
        "modelo" to listOf("modelo", "model", "modelos", "telefono", "celular"),
        "nota" to listOf("nota", "notas", "note", "observacion", "observaciones", "comentario"),
        "marca" to listOf("marca", "brand", "fabricante"),
    )

    fun parse(table: List<List<String>>): ParsedImport {
        val rows = table.filter { r -> r.any { it.isNotBlank() } }
        if (rows.isEmpty()) return ParsedImport(emptyList(), listOf("El archivo está vacío"))

        val first = rows.first().map { TextNormalizer.normalize(it) }
        val hasHeader = first.any { cell -> aliases.getValue("tipo").contains(cell) || aliases.getValue("modelo").contains(cell) }

        val index = mutableMapOf("tipo" to 0, "grupo" to 1, "modelo" to 2, "nota" to 3, "marca" to 4)
        if (hasHeader) {
            for (key in index.keys.toList()) {
                index[key] = first.indexOfFirst { aliases.getValue(key).contains(it) }
            }
            if (index["modelo"] == -1) {
                return ParsedImport(emptyList(), listOf("No se encontró la columna \"modelo\" en el encabezado"))
            }
        }

        val result = mutableListOf<ImportRow>()
        val errors = mutableListOf<String>()
        val dataRows = if (hasHeader) rows.drop(1) else rows
        val firstLine = if (hasHeader) 2 else 1
        dataRows.forEachIndexed { i, r ->
            val line = firstLine + i
            fun cell(key: String): String {
                val idx = index.getValue(key)
                return if (idx in r.indices) TextNormalizer.clean(r[idx]) else ""
            }
            val typeText = cell("tipo")
            val group = cell("grupo")
            val model = cell("modelo")
            val note = cell("nota")
            val brand = cell("marca")

            if (model.isEmpty()) {
                if (typeText.isNotEmpty() || group.isNotEmpty()) errors += "Fila $line: falta el modelo"
                return@forEachIndexed
            }
            if (group.isEmpty()) {
                // Fila sin grupo: solo registra el modelo.
                result += ImportRow(null, "", model, "", brand)
                return@forEachIndexed
            }
            val type = GroupType.parse(typeText)
            if (type == null) {
                errors += if (typeText.isEmpty()) "Fila $line: falta el tipo (Case o Vidrio templado)"
                else "Fila $line: tipo desconocido \"$typeText\" (usa Case o Vidrio templado)"
                return@forEachIndexed
            }
            result += ImportRow(type, group, model, note, brand)
        }
        return ParsedImport(result, errors)
    }
}
