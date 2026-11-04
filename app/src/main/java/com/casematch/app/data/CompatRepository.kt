package com.casematch.app.data

import androidx.room.withTransaction
import com.casematch.app.io.ImportRow
import com.casematch.app.io.TableImporter
import com.casematch.app.model.GroupType
import com.casematch.app.util.BrandDetector
import com.casematch.app.util.TextNormalizer
import kotlinx.coroutines.flow.Flow

data class ImportSummary(val newGroups: Int, val newModels: Int, val newLinks: Int)

/** Único punto de acceso a los datos. Devuelve mensajes de error en español (o null si todo salió bien). */
class CompatRepository(private val db: AppDatabase) {
    private val dao = db.dao()

    fun observeModels(): Flow<List<PhoneModel>> = dao.observeModels()
    fun observeModel(id: Long): Flow<PhoneModel?> = dao.observeModel(id)
    fun observeGroups(): Flow<List<GroupWithModels>> = dao.observeGroupsWithModels()
    fun observeGroupsForModel(modelId: Long): Flow<List<GroupWithModels>> = dao.observeGroupsForModel(modelId)
    fun observeModelCount(): Flow<Int> = dao.observeModelCount()
    fun observeGroupCount(): Flow<Int> = dao.observeGroupCount()
    suspend fun getGroup(id: Long): GroupWithModels? = dao.getGroupWithModels(id)

    // ---------------------------------------------------------------- Modelos

    /** Busca el modelo por su clave normalizada; si no existe, lo crea. Devuelve (modelo, ¿nuevo?). */
    private suspend fun getOrCreateModel(rawName: String, rawBrand: String?): Pair<PhoneModel, Boolean> {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        val brand = rawBrand?.let { BrandDetector.canonical(it) }.orEmpty()
        val existing = dao.findModelByNormalized(normalized)
        if (existing != null) {
            if (brand.isNotEmpty() && brand != existing.brand) {
                val updated = existing.copy(brand = brand)
                dao.updateModel(updated)
                return updated to false
            }
            return existing to false
        }
        val model = PhoneModel(
            name = name,
            brand = brand.ifEmpty { BrandDetector.detect(name) },
            normalized = normalized,
        )
        val id = dao.insertModel(model)
        return model.copy(id = id) to true
    }

    suspend fun addModel(rawName: String, rawBrand: String): String? {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        if (normalized.isEmpty()) return "Escribe el nombre del modelo"
        dao.findModelByNormalized(normalized)?.let { return "El modelo \"${it.name}\" ya está registrado" }
        val brand = BrandDetector.canonical(rawBrand).ifEmpty { BrandDetector.detect(name) }
        dao.insertModel(PhoneModel(name = name, brand = brand, normalized = normalized))
        return null
    }

    suspend fun updateModel(id: Long, rawName: String, rawBrand: String): String? {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        if (normalized.isEmpty()) return "Escribe el nombre del modelo"
        val other = dao.findModelByNormalized(normalized)
        if (other != null && other.id != id) return "Ya existe el modelo \"${other.name}\""
        val brand = BrandDetector.canonical(rawBrand).ifEmpty { BrandDetector.detect(name) }
        dao.updateModel(PhoneModel(id = id, name = name, brand = brand, normalized = normalized))
        return null
    }

    suspend fun deleteModel(id: Long) = db.withTransaction {
        dao.deleteRefsForModel(id)
        dao.deleteModelRow(id)
    }

    // ---------------------------------------------------------------- Grupos

    suspend fun saveGroup(
        id: Long?,
        type: GroupType,
        rawName: String,
        rawNote: String,
        modelNames: List<String>,
    ): String? {
        val models = modelNames.map { TextNormalizer.clean(it) }
            .filter { TextNormalizer.normalize(it).isNotEmpty() }
            .distinctBy { TextNormalizer.normalize(it) }
        if (models.isEmpty()) return "Agrega al menos un modelo al grupo"
        val name = TextNormalizer.clean(rawName).ifEmpty { defaultGroupName(type, models) }
        val note = rawNote.trim()

        return db.withTransaction {
            val duplicate = dao.findGroup(type, name)
            if (duplicate != null && duplicate.id != id) {
                return@withTransaction "Ya existe un grupo de ${type.label} llamado \"$name\""
            }
            val groupId = if (id == null) {
                dao.insertGroup(CompatGroup(type = type, name = name, note = note))
            } else {
                dao.updateGroup(CompatGroup(id = id, type = type, name = name, note = note))
                id
            }
            dao.deleteRefsForGroup(groupId)
            for (m in models) {
                val model = getOrCreateModel(m, null).first
                dao.insertRef(GroupModelCrossRef(groupId = groupId, modelId = model.id))
            }
            null
        }
    }

    suspend fun deleteGroup(id: Long) = db.withTransaction {
        dao.deleteRefsForGroup(id)
        dao.deleteGroupRow(id)
    }

    // ---------------------------------------------------------------- Importar / exportar

    suspend fun import(rows: List<ImportRow>, replaceAll: Boolean): ImportSummary = db.withTransaction {
        if (replaceAll) {
            dao.clearRefs()
            dao.clearGroups()
            dao.clearModels()
        }
        var newGroups = 0
        var newModels = 0
        var newLinks = 0
        val groupIds = mutableMapOf<String, Long>()
        val notedGroups = mutableSetOf<Long>()

        for (row in rows) {
            val (model, created) = getOrCreateModel(row.model, row.brand.ifBlank { null })
            if (created) newModels++
            val type = row.type ?: continue
            if (row.group.isBlank()) continue

            val key = type.name + "|" + TextNormalizer.normalize(row.group)
            var groupId = groupIds[key]
            if (groupId == null) {
                val existing = dao.findGroup(type, row.group)
                groupId = if (existing != null) {
                    existing.id
                } else {
                    newGroups++
                    dao.insertGroup(CompatGroup(type = type, name = row.group, note = ""))
                }
                groupIds[key] = groupId
            }
            // La primera nota no vacía del archivo para cada grupo reemplaza la nota guardada.
            if (row.note.isNotBlank() && groupId !in notedGroups) {
                dao.getGroupWithModels(groupId)?.group?.let { dao.updateGroup(it.copy(note = row.note)) }
                notedGroups += groupId
            }
            if (dao.insertRef(GroupModelCrossRef(groupId = groupId, modelId = model.id)) != -1L) newLinks++
        }
        ImportSummary(newGroups, newModels, newLinks)
    }

    /** Tabla con todos los datos: encabezado + una fila por cada modelo de cada grupo. */
    suspend fun exportTable(): List<List<String>> {
        val table = mutableListOf(TableImporter.HEADER)
        val groups = dao.getGroupsWithModels()
        val usedModelIds = mutableSetOf<Long>()
        for (g in groups) {
            for (m in g.models.sortedBy { it.name.lowercase() }) {
                table += listOf(g.group.type.label, g.group.name, m.name, g.group.note, m.brand)
                usedModelIds += m.id
            }
        }
        // Modelos que no pertenecen a ningún grupo (para que el respaldo esté completo).
        for (m in dao.getModels()) {
            if (m.id !in usedModelIds) table += listOf("", "", m.name, "", m.brand)
        }
        return table
    }

    // ---------------------------------------------------------------- Datos de ejemplo

    suspend fun seedSampleDataIfEmpty() {
        if (dao.countGroups() > 0) return
        saveGroup(
            id = null,
            type = GroupType.CASE,
            rawName = "Case grupo iPhone 13/14/15",
            rawNote = "La cámara del 15 queda un poco justa",
            modelNames = listOf("iPhone 13", "iPhone 14", "iPhone 15"),
        )
        saveGroup(
            id = null,
            type = GroupType.GLASS,
            rawName = "Vidrio grupo iPhone 12/12 Pro/13/13 Pro/14",
            rawNote = "Pantalla de 6,1\". Verificar el recorte de la cámara frontal antes de vender.",
            modelNames = listOf("iPhone 12", "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro", "iPhone 14"),
        )
    }

    companion object {
        fun defaultGroupName(type: GroupType, models: List<String>): String =
            (if (type == GroupType.CASE) "Case grupo " else "Vidrio grupo ") + models.joinToString("/")
    }
}
