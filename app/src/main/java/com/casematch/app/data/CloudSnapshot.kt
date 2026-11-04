package com.casematch.app.data

/**
 * Copia de todos los datos en el formato en que se guardan en Firestore.
 * Clave = id del documento (el mismo id numérico que en la base local, como texto).
 *
 * models/{id}: name, brand, normalized
 * groups/{id}: type ("CASE" | "GLASS"), name, note, models (lista de ids de modelos)
 */
data class CloudSnapshot(
    val models: Map<String, Map<String, Any?>>,
    val groups: Map<String, Map<String, Any?>>,
) {
    fun isEmpty() = models.isEmpty() && groups.isEmpty()

    companion object {
        val EMPTY = CloudSnapshot(emptyMap(), emptyMap())

        fun modelFields(name: String, brand: String, normalized: String): Map<String, Any?> =
            mapOf("name" to name, "brand" to brand, "normalized" to normalized)

        fun groupFields(type: String, name: String, note: String, modelIds: List<String>): Map<String, Any?> =
            mapOf("type" to type, "name" to name, "note" to note, "models" to modelIds.sorted())

        /** Convierte un documento leído de Firestore al formato canónico (para poder comparar). */
        fun canonicalModel(data: Map<String, Any?>): Map<String, Any?> = modelFields(
            name = data["name"] as? String ?: "",
            brand = data["brand"] as? String ?: "",
            normalized = data["normalized"] as? String ?: "",
        )

        fun canonicalGroup(data: Map<String, Any?>): Map<String, Any?> = groupFields(
            type = data["type"] as? String ?: "CASE",
            name = data["name"] as? String ?: "",
            note = data["note"] as? String ?: "",
            modelIds = (data["models"] as? List<*>)?.mapNotNull { it?.toString() } ?: emptyList(),
        )
    }
}
