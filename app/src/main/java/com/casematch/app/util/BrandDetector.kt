package com.casematch.app.util

/** Deduce la marca a partir del nombre del modelo y define el orden de las marcas. */
object BrandDetector {
    const val OTHER = "Otras"

    /** Marca -> prefijos (normalizados) con los que suelen empezar sus modelos. */
    private val rules: List<Pair<String, List<String>>> = listOf(
        "Apple" to listOf("apple", "iphone", "ipad"),
        "Samsung" to listOf("samsung", "galaxy"),
        "Xiaomi" to listOf("xiaomi", "redmi", "poco"),
        "Motorola" to listOf("motorola", "moto"),
        "Huawei" to listOf("huawei"),
        "Honor" to listOf("honor"),
        "Google" to listOf("google", "pixel"),
        "OnePlus" to listOf("oneplus"),
        "Oppo" to listOf("oppo"),
        "Realme" to listOf("realme"),
        "Vivo" to listOf("vivo"),
        "Nokia" to listOf("nokia"),
        "Sony" to listOf("sony", "xperia"),
        "LG" to listOf("lg"),
        "ZTE" to listOf("zte", "blade"),
        "Infinix" to listOf("infinix"),
        "Tecno" to listOf("tecno"),
        "Alcatel" to listOf("alcatel"),
        "TCL" to listOf("tcl"),
        "Nothing" to listOf("nothing"),
    )

    /** Marcas conocidas, para ofrecerlas como opciones rápidas. */
    val knownBrands: List<String> get() = rules.map { it.first }

    /** Orden preferido de las marcas en la lista de modelos. */
    private val preferredOrder = listOf("Apple", "Samsung", "Xiaomi", "Motorola")

    fun detect(modelName: String): String {
        val n = TextNormalizer.normalize(modelName)
        for ((brand, prefixes) in rules) {
            if (prefixes.any { n.startsWith(it) }) return brand
        }
        // "Mi 11", "Mi Note 10"... (Xiaomi) solo si "Mi" es una palabra aparte.
        if (Regex("^mi\\s", RegexOption.IGNORE_CASE).containsMatchIn(modelName.trim())) return "Xiaomi"
        return OTHER
    }

    /** Devuelve la marca con su escritura habitual ("apple" -> "Apple"). */
    fun canonical(brand: String): String {
        val clean = TextNormalizer.clean(brand)
        if (clean.isEmpty()) return ""
        val n = TextNormalizer.normalize(clean)
        rules.firstOrNull { TextNormalizer.normalize(it.first) == n }?.let { return it.first }
        if (n == TextNormalizer.normalize(OTHER)) return OTHER
        return clean.replaceFirstChar { it.uppercaseChar() }
    }

    /** Comparador de marcas: Apple, Samsung, Xiaomi, Motorola, luego alfabético y "Otras" al final. */
    val brandComparator: Comparator<String> = Comparator { a, b ->
        fun rank(x: String): Int {
            val i = preferredOrder.indexOf(x)
            return when {
                i >= 0 -> i
                x == OTHER -> Int.MAX_VALUE
                else -> preferredOrder.size
            }
        }
        val r = rank(a).compareTo(rank(b))
        if (r != 0) r else a.compareTo(b, ignoreCase = true)
    }
}
