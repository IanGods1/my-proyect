package com.casematch.app.model

import com.casematch.app.util.TextNormalizer

/** Tipo de grupo de compatibilidad. */
enum class GroupType(val label: String) {
    CASE("Case"),
    GLASS("Vidrio templado");

    companion object {
        /**
         * Interpreta el texto de la columna "tipo" de un archivo importado.
         * Acepta variantes como "case", "funda", "vidrio", "Vidrio templado", "mica", "glass".
         */
        fun parse(text: String): GroupType? {
            val n = TextNormalizer.normalize(text)
            if (n.isEmpty()) return null
            val glassWords = listOf("vidrio", "templado", "mica", "glass", "protector", "cristal")
            val caseWords = listOf("case", "funda", "carcasa", "cover", "estuche")
            return when {
                glassWords.any { n.contains(it) } -> GLASS
                caseWords.any { n.contains(it) } -> CASE
                else -> entries.firstOrNull { TextNormalizer.normalize(it.name) == n }
            }
        }
    }
}
