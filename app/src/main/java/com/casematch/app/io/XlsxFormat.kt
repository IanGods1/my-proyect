package com.casematch.app.io

import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Lector/escritor mínimo de archivos Excel (.xlsx) sin librerías externas.
 * Lee la primera hoja del libro. No soporta el formato antiguo .xls.
 */
object XlsxFormat {

    fun isXlsx(bytes: ByteArray): Boolean =
        bytes.size > 4 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()

    /** Formato antiguo de Excel (.xls, OLE2). */
    fun isLegacyXls(bytes: ByteArray): Boolean =
        bytes.size > 8 && bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte() &&
            bytes[2] == 0x11.toByte() && bytes[3] == 0xE0.toByte()

    fun read(bytes: ByteArray): List<List<String>> {
        val entries = unzip(bytes)
        val sharedStrings = entries["xl/sharedStrings.xml"]?.let { parseSharedStrings(it) } ?: emptyList()
        val sheetPath = firstSheetPath(entries)
            ?: throw IllegalArgumentException("El archivo Excel no contiene hojas")
        return parseSheet(entries.getValue(sheetPath), sharedStrings)
    }

    private fun unzip(bytes: ByteArray): Map<String, ByteArray> {
        val out = mutableMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (!entry.isDirectory && (entry.name.endsWith(".xml") || entry.name.endsWith(".rels"))) {
                    out[entry.name.removePrefix("/")] = zip.readBytes()
                }
            }
        }
        return out
    }

    /** Busca la primera hoja según workbook.xml; si no puede, toma la primera hoja por nombre. */
    private fun firstSheetPath(entries: Map<String, ByteArray>): String? {
        try {
            val workbook = entries["xl/workbook.xml"]
            val rels = entries["xl/_rels/workbook.xml.rels"]
            if (workbook != null && rels != null) {
                var relId: String? = null
                parse(workbook) { p ->
                    if (relId == null && p.eventType == XmlPullParser.START_TAG && local(p.name) == "sheet") {
                        relId = attr(p, "id")
                    }
                }
                var target: String? = null
                parse(rels) { p ->
                    if (p.eventType == XmlPullParser.START_TAG && local(p.name) == "Relationship" &&
                        attr(p, "Id") == relId
                    ) target = attr(p, "Target")
                }
                target?.let { t ->
                    val path = if (t.startsWith("/")) t.removePrefix("/") else "xl/$t"
                    if (entries.containsKey(path)) return path
                }
            }
        } catch (_: Exception) {
            // Se usa el método alternativo.
        }
        return entries.keys
            .filter { it.startsWith("xl/worksheets/") && it.endsWith(".xml") }
            .minWithOrNull(compareBy({ it.length }, { it }))
    }

    private fun parseSharedStrings(xml: ByteArray): List<String> {
        val list = mutableListOf<String>()
        val current = StringBuilder()
        var inSi = false
        var inT = false
        var inPhonetic = false
        parse(xml) { p ->
            when (p.eventType) {
                XmlPullParser.START_TAG -> when (local(p.name)) {
                    "si" -> { inSi = true; current.clear() }
                    "t" -> inT = true
                    "rPh" -> inPhonetic = true
                }
                XmlPullParser.END_TAG -> when (local(p.name)) {
                    "si" -> { inSi = false; list.add(current.toString()) }
                    "t" -> inT = false
                    "rPh" -> inPhonetic = false
                }
                XmlPullParser.TEXT -> if (inSi && inT && !inPhonetic) current.append(p.text)
            }
        }
        return list
    }

    private fun parseSheet(xml: ByteArray, shared: List<String>): List<List<String>> {
        val rows = sortedMapOf<Int, MutableMap<Int, String>>()
        var rowIndex = -1
        var nextCol = 0
        var cellCol = 0
        var cellType: String? = null
        val value = StringBuilder()
        var collecting = false
        var hasValue = false

        parse(xml) { p ->
            when (p.eventType) {
                XmlPullParser.START_TAG -> when (local(p.name)) {
                    "row" -> {
                        rowIndex = attr(p, "r")?.toIntOrNull()?.minus(1) ?: (rowIndex + 1)
                        nextCol = 0
                    }
                    "c" -> {
                        cellCol = attr(p, "r")?.let { columnIndex(it) } ?: nextCol
                        nextCol = cellCol + 1
                        cellType = attr(p, "t")
                        value.clear()
                        hasValue = false
                    }
                    "v", "t" -> { collecting = true; hasValue = true }
                }
                XmlPullParser.END_TAG -> when (local(p.name)) {
                    "v", "t" -> collecting = false
                    "c" -> if (hasValue) {
                        val raw = value.toString()
                        val text = when (cellType) {
                            "s" -> raw.trim().toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
                            "inlineStr", "str" -> raw
                            "b" -> if (raw.trim() == "1") "VERDADERO" else "FALSO"
                            "e" -> ""
                            else -> formatNumber(raw)
                        }
                        if (rowIndex >= 0) rows.getOrPut(rowIndex) { mutableMapOf() }[cellCol] = text
                    }
                }
                XmlPullParser.TEXT -> if (collecting) value.append(p.text)
            }
        }

        return rows.values.map { cells ->
            val max = cells.keys.maxOrNull() ?: -1
            (0..max).map { cells[it] ?: "" }
        }
    }

    /** "13.0" -> "13" para que los números se vean como en Excel. */
    private fun formatNumber(raw: String): String {
        val t = raw.trim()
        val d = t.toDoubleOrNull() ?: return t
        return if (d == Math.floor(d) && !d.isInfinite() && kotlin.math.abs(d) < 1e15) d.toLong().toString() else t
    }

    /** "B12" -> 1 */
    private fun columnIndex(ref: String): Int {
        var n = 0
        for (ch in ref) {
            if (ch.isLetter()) n = n * 26 + (ch.uppercaseChar() - 'A' + 1) else break
        }
        return n - 1
    }

    private fun local(name: String?): String = name?.substringAfter(':') ?: ""

    private fun attr(p: XmlPullParser, localName: String): String? {
        for (i in 0 until p.attributeCount) {
            if (local(p.getAttributeName(i)) == localName) return p.getAttributeValue(i)
        }
        return null
    }

    private inline fun parse(xml: ByteArray, onEvent: (XmlPullParser) -> Unit) {
        val factory = XmlPullParserFactory.newInstance()
        factory.isNamespaceAware = false
        val p = factory.newPullParser()
        p.setInput(ByteArrayInputStream(xml), "UTF-8")
        var event = p.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            onEvent(p)
            event = p.next()
        }
    }

    // ---------------------------------------------------------------- Escritura

    fun write(rows: List<List<String>>, sheetName: String = "Datos"): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { zip ->
            fun add(name: String, content: String) {
                zip.putNextEntry(ZipEntry(name))
                zip.write(content.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
            add(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"""
            )
            add(
                "_rels/.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""
            )
            add(
                "xl/workbook.xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>"""
            )
            add(
                "xl/_rels/workbook.xml.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""
            )
            val sheet = StringBuilder()
            sheet.append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>""")
            sheet.append("""<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>""")
            rows.forEachIndexed { r, row ->
                sheet.append("<row r=\"${r + 1}\">")
                row.forEachIndexed { c, v ->
                    if (v.isNotEmpty()) {
                        sheet.append("<c r=\"${columnName(c)}${r + 1}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                        sheet.append(escape(v))
                        sheet.append("</t></is></c>")
                    }
                }
                sheet.append("</row>")
            }
            sheet.append("</sheetData></worksheet>")
            add("xl/worksheets/sheet1.xml", sheet.toString())
        }
        return out.toByteArray()
    }

    private fun columnName(index: Int): String {
        var n = index + 1
        val sb = StringBuilder()
        while (n > 0) {
            val rem = (n - 1) % 26
            sb.insert(0, ('A' + rem))
            n = (n - 1) / 26
        }
        return sb.toString()
    }

    private fun escape(s: String): String = buildString {
        for (ch in s) {
            when (ch) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                else -> if (ch >= ' ' || ch == '\n' || ch == '\t') append(ch)
            }
        }
    }
}
