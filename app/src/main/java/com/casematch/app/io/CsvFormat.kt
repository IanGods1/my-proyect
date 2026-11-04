package com.casematch.app.io

/** Lectura y escritura de CSV (acepta separador coma, punto y coma o tabulación). */
object CsvFormat {

    fun parse(input: String): List<List<String>> {
        val text = input.removePrefix("﻿")
        val delimiter = detectDelimiter(text)
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val field = StringBuilder()
        var inQuotes = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < text.length && text[i + 1] == '"') {
                        field.append('"'); i++
                    } else {
                        inQuotes = false
                    }
                } else {
                    field.append(c)
                }
            } else {
                when (c) {
                    '"' -> inQuotes = true
                    delimiter -> { row.add(field.toString()); field.clear() }
                    '\r' -> {}
                    '\n' -> {
                        row.add(field.toString()); field.clear()
                        rows.add(row); row = mutableListOf()
                    }
                    else -> field.append(c)
                }
            }
            i++
        }
        if (field.isNotEmpty() || row.isNotEmpty()) {
            row.add(field.toString())
            rows.add(row)
        }
        return rows.filter { r -> r.any { it.isNotBlank() } }
    }

    /** Elige el separador más frecuente en la primera línea (fuera de comillas). */
    private fun detectDelimiter(text: String): Char {
        val counts = mutableMapOf(',' to 0, ';' to 0, '\t' to 0)
        var inQuotes = false
        for (c in text) {
            if (c == '"') inQuotes = !inQuotes
            if (!inQuotes && c == '\n') break
            if (!inQuotes && c in counts) counts[c] = counts.getValue(c) + 1
        }
        val best = counts.maxByOrNull { it.value }!!
        return if (best.value == 0) ',' else best.key
    }

    fun write(rows: List<List<String>>, delimiter: Char = ','): String {
        val sb = StringBuilder("﻿") // BOM: Excel reconoce los acentos (UTF-8)
        for (r in rows) {
            sb.append(r.joinToString(delimiter.toString()) { escape(it, delimiter) })
            sb.append("\r\n")
        }
        return sb.toString()
    }

    private fun escape(value: String, delimiter: Char): String {
        val needsQuotes = value.any { it == delimiter || it == '"' || it == '\n' || it == '\r' }
        return if (needsQuotes) "\"" + value.replace("\"", "\"\"") + "\"" else value
    }
}
