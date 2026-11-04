package com.casematch.app.util

import java.text.Normalizer
import java.util.Locale

object TextNormalizer {
    /**
     * Convierte un texto a una clave de comparación: minúsculas, sin acentos,
     * sin espacios ni símbolos. "+" se convierte en "plus" para no confundir
     * "Galaxy S23+" con "Galaxy S23".
     *
     * Ejemplos: "iPhone 13" -> "iphone13", "IPHONE13" -> "iphone13".
     */
    fun normalize(text: String): String {
        val lower = text.lowercase(Locale.ROOT).replace("+", "plus")
        val decomposed = Normalizer.normalize(lower, Normalizer.Form.NFD)
        val sb = StringBuilder(decomposed.length)
        for (c in decomposed) {
            if (c in 'a'..'z' || c in '0'..'9') sb.append(c)
        }
        return sb.toString()
    }

    /** Limpia un texto para mostrarlo: sin espacios extra al inicio, final o repetidos. */
    fun clean(text: String): String = text.trim().replace(Regex("\\s+"), " ")
}
