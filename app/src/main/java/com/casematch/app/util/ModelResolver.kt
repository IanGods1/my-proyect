package com.casematch.app.util

/**
 * Al escribir un modelo en el formulario, busca si ya está registrado para reutilizarlo
 * en lugar de crear uno duplicado.
 */
object ModelResolver {
    data class Known(val name: String, val brand: String)

    /**
     * 1) Mismo nombre (sin importar mayúsculas, espacios o símbolos): "iphone13" -> "iPhone 13".
     * 2) Con una marca elegida: si lo escrito es el final del nombre de UN solo modelo de esa
     *    marca ("A54" con Samsung -> "Galaxy A54"). Si hay más de uno, no se adivina.
     */
    fun resolve(typed: String, brand: String, known: List<Known>): Known? {
        val n = TextNormalizer.normalize(typed)
        if (n.isEmpty()) return null
        known.firstOrNull { TextNormalizer.normalize(it.name) == n }?.let { return it }

        val b = BrandDetector.canonical(brand)
        if (b.isEmpty() || n.length < 2) return null
        return known.filter { it.brand == b && TextNormalizer.normalize(it.name).endsWith(n) }.singleOrNull()
    }
}
