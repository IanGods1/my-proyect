package com.casematch.app.util

import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import com.casematch.app.model.ModelInput

object GroupNaming {
    /**
     * Nombre automático cuando el grupo no tiene nombre.
     * Ej.: "Case grupo iPhone 13/14/15", "Vidrio 9D grupo Samsung A54/A55".
     * Se antepone la marca solo si todos los modelos son de la misma marca y esa marca
     * no se nota en los nombres (por ejemplo "A54" no dice "Samsung", "iPhone 13" sí).
     */
    fun defaultName(type: GroupType, variant: GroupVariant, models: List<ModelInput>): String {
        val prefix = if (type == GroupType.CASE) "Case grupo" else "${variant.fullLabel} grupo"
        val brands = models
            .map { m -> BrandDetector.canonical(m.brand).ifEmpty { BrandDetector.detect(m.name) } }
            .distinct()
        val brand = brands.singleOrNull()
        val brandIsHidden = brand != null && brand != BrandDetector.OTHER &&
            models.any { BrandDetector.detect(it.name) != brand }
        val brandText = if (brandIsHidden) "$brand " else ""
        return "$prefix $brandText${models.joinToString("/") { it.name }}"
    }
}
