package com.casematch.app

import com.casematch.app.io.TableImporter
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import com.casematch.app.model.ModelInput
import com.casematch.app.util.GroupNaming
import com.casematch.app.util.ModelResolver
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VariantAndBrandTest {

    @Test fun parseVariant() {
        assertEquals(GroupVariant.D9, GroupVariant.parse("9D"))
        assertEquals(GroupVariant.D9, GroupVariant.parse("Vidrio 9d"))
        assertEquals(GroupVariant.PRIVACY, GroupVariant.parse("privacy"))
        assertEquals(GroupVariant.PRIVACY, GroupVariant.parse("Vidrio privado"))
        assertEquals(GroupVariant.PRIVACY, GroupVariant.parse("Privacidad"))
        assertEquals(GroupVariant.NORMAL, GroupVariant.parse("Vidrio normal"))
        assertNull(GroupVariant.parse("Vidrio templado"))
        assertNull(GroupVariant.parse(""))
    }

    @Test fun typeRecognisesVariantWords() {
        assertEquals(GroupType.GLASS, GroupType.parse("9D"))
        assertEquals(GroupType.GLASS, GroupType.parse("Vidrio privacy"))
        assertEquals(GroupType.CASE, GroupType.parse("Funda"))
    }

    @Test fun importVariantColumnAndTypeText() {
        val table = listOf(
            listOf("tipo", "grupo", "modelo", "nota", "marca", "variante"),
            listOf("Vidrio templado", "G1", "Galaxy A54", "", "Samsung", "9D"),
            listOf("Vidrio privacy", "G2", "Galaxy A54", "", "", ""),
            listOf("Vidrio templado", "G3", "Galaxy A54", "", "", ""),
            listOf("Case", "G4", "Galaxy A54", "", "", "9D"),
        )
        val r = TableImporter.parse(table).rows
        assertEquals(GroupVariant.D9, r[0].variant)
        assertEquals(GroupVariant.PRIVACY, r[1].variant)
        assertEquals(GroupVariant.NORMAL, r[2].variant)
        assertEquals(GroupVariant.NORMAL, r[3].variant) // un case no tiene clase
        assertEquals("Samsung", r[0].brand)
    }

    @Test fun oldFilesWithoutVariantStillImport() {
        val r = TableImporter.parse(listOf(listOf("tipo", "grupo", "modelo", "nota"), listOf("vidrio", "G", "iPhone 13", ""))).rows
        assertEquals(GroupVariant.NORMAL, r.single().variant)
    }

    @Test fun defaultNames() {
        fun m(vararg n: String) = n.map { ModelInput(it) }
        assertEquals("Case grupo iPhone 13/iPhone 14/iPhone 15", GroupNaming.defaultName(GroupType.CASE, GroupVariant.NORMAL, m("iPhone 13", "iPhone 14", "iPhone 15")))
        assertEquals("Vidrio 9D grupo iPhone 13/iPhone 14", GroupNaming.defaultName(GroupType.GLASS, GroupVariant.D9, m("iPhone 13", "iPhone 14")))
        // "A54" no dice Samsung: se agrega la marca elegida
        assertEquals(
            "Case grupo Samsung A54/A55",
            GroupNaming.defaultName(GroupType.CASE, GroupVariant.NORMAL, listOf(ModelInput("A54", "Samsung"), ModelInput("A55", "samsung"))),
        )
        assertEquals(
            "Vidrio privacy grupo Samsung A54",
            GroupNaming.defaultName(GroupType.GLASS, GroupVariant.PRIVACY, listOf(ModelInput("A54", "Samsung"))),
        )
        // Marcas mezcladas: sin prefijo
        assertEquals(
            "Case grupo A54/Y20",
            GroupNaming.defaultName(GroupType.CASE, GroupVariant.NORMAL, listOf(ModelInput("A54", "Samsung"), ModelInput("Y20", "Vivo"))),
        )
    }

    @Test fun resolveTypedModels() {
        val known = listOf(
            ModelResolver.Known("Galaxy A54", "Samsung"),
            ModelResolver.Known("Galaxy A54 5G", "Samsung"),
            ModelResolver.Known("iPhone 13", "Apple"),
            ModelResolver.Known("iPhone 13 Pro", "Apple"),
            ModelResolver.Known("A10", "Otras"),
        )
        // Mismo nombre aunque cambie la escritura
        assertEquals("iPhone 13", ModelResolver.resolve("IPHONE13", "", known)?.name)
        // Solo el final del nombre + marca elegida
        assertEquals("Galaxy A54", ModelResolver.resolve("A54", "Samsung", known)?.name)
        assertEquals("iPhone 13", ModelResolver.resolve("13", "apple", known)?.name)
        // Sin marca no se adivina
        assertNull(ModelResolver.resolve("A54", "", known))
        // Otra marca: no se mezcla
        assertNull(ModelResolver.resolve("A54", "Xiaomi", known))
        // Un nombre ya registrado en "Otras" se reutiliza
        assertEquals("Otras", ModelResolver.resolve("a10", "Samsung", known)?.brand)
        // Un solo carácter no basta
        assertNull(ModelResolver.resolve("4", "Samsung", known))
    }
}
