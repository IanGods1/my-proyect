package com.casematch.app.model

import com.casematch.app.util.TextNormalizer

/**
 * Clase de vidrio templado. Los grupos de Case siempre usan [NORMAL] (no se muestra).
 */
enum class GroupVariant(val label: String, val fullLabel: String) {
    NORMAL("Normal", "Vidrio normal"),
    D9("9D", "Vidrio 9D"),
    PRIVACY("Privacy", "Vidrio privacy");

    companion object {
        /**
         * Interpreta un texto: "9D", "vidrio 9d", "privacy", "privado", "privacidad", "normal"...
         * Devuelve null si no reconoce ninguna clase (por ejemplo "Vidrio templado").
         */
        fun parse(text: String): GroupVariant? {
            val n = TextNormalizer.normalize(text)
            if (n.isEmpty()) return null
            return when {
                n.contains("9d") -> D9
                listOf("privacy", "privad", "privacid", "espia").any { n.contains(it) } -> PRIVACY
                listOf("normal", "comun", "simple", "estandar").any { n.contains(it) } -> NORMAL
                else -> null
            }
        }
    }
}
