package com.casematch.app.util

/**
 * Búsqueda tolerante de modelos.
 *
 * Encuentra resultados aunque se escriba incompleto, sin mayúsculas o sin espacios:
 * "ip13", "iphone 13" e "IPHONE13" encuentran "iPhone 13".
 *
 * Orden de relevancia: coincidencia exacta, empieza por, contiene, y por último
 * "letras en orden" (ej. "ip13" dentro de "iphone13"). Los números escritos deben
 * coincidir con el inicio de un número del modelo, así "ip13" no encuentra "iPhone 15".
 */
object ModelSearch {

    fun <T> search(
        items: List<T>,
        query: String,
        name: (T) -> String,
        brand: (T) -> String,
        limit: Int = 50,
    ): List<T> {
        val q = TextNormalizer.normalize(query)
        if (q.isEmpty()) return emptyList()
        return items
            .mapNotNull { item ->
                val n = TextNormalizer.normalize(name(item))
                val withBrand = TextNormalizer.normalize(brand(item)) + n
                val s = maxOf(score(q, n), score(q, withBrand) - 5)
                if (s < 0) null else Triple(item, s, n.length)
            }
            .sortedWith(
                compareByDescending<Triple<T, Int, Int>> { it.second }
                    .thenBy { it.third }
                    .thenBy { name(it.first).lowercase() }
            )
            .take(limit)
            .map { it.first }
    }

    /** Puntaje de coincidencia de [q] dentro de [target] (ambos normalizados). -1 = no coincide. */
    fun score(q: String, target: String): Int {
        if (q.isEmpty() || target.isEmpty()) return -1
        if (!numbersCompatible(q, target)) return -1
        return when {
            target == q -> 1000
            target.startsWith(q) -> 800
            target.contains(q) -> 600
            else -> {
                val span = subsequenceSpan(q, target)
                if (span < 0) -1 else (400 - span).coerceAtLeast(1)
            }
        }
    }

    /** Cada número escrito en la búsqueda debe ser el inicio de algún número del modelo. */
    private fun numbersCompatible(q: String, target: String): Boolean {
        val qNums = numberRegex.findAll(q).map { it.value }.toList()
        if (qNums.isEmpty()) return true
        val tNums = numberRegex.findAll(target).map { it.value }.toList()
        return qNums.all { qn -> tNums.any { it.startsWith(qn) } }
    }

    /** Longitud del tramo de [target] que contiene las letras de [q] en orden, o -1. */
    private fun subsequenceSpan(q: String, target: String): Int {
        var qi = 0
        var start = -1
        for (ti in target.indices) {
            if (target[ti] == q[qi]) {
                if (start < 0) start = ti
                qi++
                if (qi == q.length) return ti - start + 1
            }
        }
        return -1
    }

    private val numberRegex = Regex("[0-9]+")
}
