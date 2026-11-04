package com.casematch.app

import com.casematch.app.io.CsvFormat
import com.casematch.app.io.TableImporter
import com.casematch.app.model.GroupType
import com.casematch.app.util.BrandDetector
import com.casematch.app.util.ModelSearch
import com.casematch.app.util.TextNormalizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchAndImportTest {

    private data class M(val name: String, val brand: String)

    private val models = listOf(
        M("iPhone 13", "Apple"), M("iPhone 13 Pro", "Apple"), M("iPhone 14", "Apple"),
        M("iPhone 15", "Apple"), M("Galaxy A54", "Samsung"), M("Galaxy A15", "Samsung"),
        M("Galaxy S23", "Samsung"), M("Galaxy S23+", "Samsung"), M("Redmi Note 12", "Xiaomi"),
    )

    private fun find(q: String) = ModelSearch.search(models, q, { it.name }, { it.brand }).map { it.name }

    @Test fun normalize() {
        assertEquals("iphone13", TextNormalizer.normalize("iPhone 13"))
        assertEquals("iphone13", TextNormalizer.normalize("IPHONE13"))
        assertEquals("galaxys23plus", TextNormalizer.normalize("Galaxy S23+"))
        assertEquals("vidriotemplado", TextNormalizer.normalize("Vídrio  templado"))
    }

    @Test fun searchVariants() {
        for (q in listOf("ip13", "iphone 13", "IPHONE13", "iphone13")) {
            assertEquals("query $q", "iPhone 13", find(q).first())
        }
        assertTrue(find("ip13").none { it == "iPhone 15" || it == "iPhone 14" })
        assertEquals(listOf("iPhone 13", "iPhone 13 Pro"), find("ip13"))
    }

    @Test fun searchNumbersAndBrand() {
        assertEquals(listOf("Galaxy A54"), find("a5"))
        assertEquals("Galaxy A54", find("samsung a54").first())
        assertEquals("Redmi Note 12", find("note12").first())
        assertEquals("Galaxy S23", find("s23").first())
        assertTrue(find("").isEmpty())
    }

    @Test fun brands() {
        assertEquals("Apple", BrandDetector.detect("iPhone 15"))
        assertEquals("Samsung", BrandDetector.detect("Galaxy A54"))
        assertEquals("Xiaomi", BrandDetector.detect("Redmi Note 12"))
        assertEquals("Xiaomi", BrandDetector.detect("Mi 11 Lite"))
        assertEquals("Motorola", BrandDetector.detect("Moto G84"))
        assertEquals(BrandDetector.OTHER, BrandDetector.detect("Teléfono X"))
        assertEquals("Apple", BrandDetector.canonical("apple"))
        val sorted = listOf("Otras", "Huawei", "Motorola", "Apple", "Xiaomi", "Samsung").sortedWith(BrandDetector.brandComparator)
        assertEquals(listOf("Apple", "Samsung", "Xiaomi", "Motorola", "Huawei", "Otras"), sorted)
    }

    @Test fun csvRoundTripAndSemicolon() {
        val rows = listOf(listOf("tipo", "grupo", "modelo", "nota"), listOf("Case", "Grupo, 1", "iPhone 13", "dice \"justo\""))
        assertEquals(rows, CsvFormat.parse(CsvFormat.write(rows)))
        val semi = "tipo;grupo;modelo;nota\r\nvidrio;G1;Galaxy A54;\r\n"
        assertEquals(listOf("vidrio", "G1", "Galaxy A54", ""), CsvFormat.parse(semi)[1])
    }

    @Test fun tableImport() {
        val table = listOf(
            listOf("Modelo", "Tipo", "Grupo", "Nota"),
            listOf("iPhone 13", "Funda", "G1", "x"),
            listOf("iPhone 14", "vidrio templado", "G2", ""),
            listOf("iPhone 15", "algo", "G3", ""),
            listOf("Moto G84", "", "", ""),
        )
        val r = TableImporter.parse(table)
        assertEquals(3, r.rows.size)
        assertEquals(GroupType.CASE, r.rows[0].type)
        assertEquals("iPhone 13", r.rows[0].model)
        assertEquals(GroupType.GLASS, r.rows[1].type)
        assertEquals(null, r.rows[2].type)
        assertEquals(1, r.errors.size)

        val noHeader = TableImporter.parse(listOf(listOf("Case", "G1", "iPhone 13", "nota")))
        assertEquals("iPhone 13", noHeader.rows.single().model)
    }
}
