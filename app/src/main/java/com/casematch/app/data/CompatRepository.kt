package com.casematch.app.data

import androidx.room.withTransaction
import com.casematch.app.io.ImportRow
import com.casematch.app.io.TableImporter
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant
import com.casematch.app.model.ModelInput
import com.casematch.app.util.BrandDetector
import com.casematch.app.util.GroupNaming
import com.casematch.app.util.TextNormalizer
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ImportSummary(val newGroups: Int, val newModels: Int, val newLinks: Int)

/** Único punto de acceso a los datos. Devuelve mensajes de error en español (o null si todo salió bien). */
class CompatRepository(private val db: AppDatabase) {
    private val dao = db.dao()

    /**
     * Evita que una sincronización con la nube y un cambio del administrador se mezclen.
     * No es reentrante: [onDataChanged] se llama con el bloqueo tomado y no debe volver a tomarlo.
     */
    val writeLock = Mutex()

    /** Se llama (con [writeLock] tomado) después de cada cambio hecho por el administrador. */
    var onDataChanged: (suspend () -> Unit)? = null

    private suspend fun <T> mutate(block: suspend () -> T): T = writeLock.withLock {
        val result = block()
        onDataChanged?.invoke()
        result
    }

    fun observeModels(): Flow<List<PhoneModel>> = dao.observeModels()
    fun observeModel(id: Long): Flow<PhoneModel?> = dao.observeModel(id)
    fun observeGroups(): Flow<List<GroupWithModels>> = dao.observeGroupsWithModels()
    fun observeGroupsForModel(modelId: Long): Flow<List<GroupWithModels>> = dao.observeGroupsForModel(modelId)
    fun observeModelCount(): Flow<Int> = dao.observeModelCount()
    fun observeGroupCount(): Flow<Int> = dao.observeGroupCount()
    suspend fun getGroup(id: Long): GroupWithModels? = dao.getGroupWithModels(id)

    // ---------------------------------------------------------------- Modelos

    /**
     * Busca el modelo por su clave normalizada; si no existe, lo crea. Devuelve (modelo, ¿nuevo?).
     * [overrideBrand]: true (importación) cambia la marca de un modelo ya registrado si el archivo
     * trae otra; false (formulario) solo la completa cuando el modelo estaba en "Otras".
     */
    private suspend fun getOrCreateModel(
        rawName: String,
        rawBrand: String?,
        overrideBrand: Boolean = true,
    ): Pair<PhoneModel, Boolean> {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        val brand = rawBrand?.let { BrandDetector.canonical(it) }.orEmpty()
        val existing = dao.findModelByNormalized(normalized)
        if (existing != null) {
            val canChange = overrideBrand || existing.brand == BrandDetector.OTHER
            if (brand.isNotEmpty() && brand != existing.brand && canChange) {
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

    suspend fun addModel(rawName: String, rawBrand: String): String? = mutate {
        addModelInternal(rawName, rawBrand)
    }

    private suspend fun addModelInternal(rawName: String, rawBrand: String): String? {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        if (normalized.isEmpty()) return "Escribe el nombre del modelo"
        dao.findModelByNormalized(normalized)?.let { return "El modelo \"${it.name}\" ya está registrado" }
        val brand = BrandDetector.canonical(rawBrand).ifEmpty { BrandDetector.detect(name) }
        dao.insertModel(PhoneModel(name = name, brand = brand, normalized = normalized))
        return null
    }

    suspend fun updateModel(id: Long, rawName: String, rawBrand: String): String? = mutate {
        updateModelInternal(id, rawName, rawBrand)
    }

    private suspend fun updateModelInternal(id: Long, rawName: String, rawBrand: String): String? {
        val name = TextNormalizer.clean(rawName)
        val normalized = TextNormalizer.normalize(name)
        if (normalized.isEmpty()) return "Escribe el nombre del modelo"
        val other = dao.findModelByNormalized(normalized)
        if (other != null && other.id != id) return "Ya existe el modelo \"${other.name}\""
        val brand = BrandDetector.canonical(rawBrand).ifEmpty { BrandDetector.detect(name) }
        dao.updateModel(PhoneModel(id = id, name = name, brand = brand, normalized = normalized))
        return null
    }

    suspend fun deleteModel(id: Long): Unit = mutate {
        db.withTransaction {
            dao.deleteRefsForModel(id)
            dao.deleteModelRow(id)
        }
    }

    // ---------------------------------------------------------------- Grupos

    suspend fun saveGroup(
        id: Long?,
        type: GroupType,
        variant: GroupVariant,
        rawName: String,
        rawNote: String,
        models: List<ModelInput>,
    ): String? = mutate { saveGroupInternal(id, type, variant, rawName, rawNote, models) }

    private suspend fun saveGroupInternal(
        id: Long?,
        type: GroupType,
        variant: GroupVariant,
        rawName: String,
        rawNote: String,
        modelInputs: List<ModelInput>,
    ): String? {
        // Solo el vidrio templado tiene clase (Normal, 9D, Privacy).
        val groupVariant = if (type == GroupType.GLASS) variant else GroupVariant.NORMAL
        val models = modelInputs
            .map { ModelInput(TextNormalizer.clean(it.name), BrandDetector.canonical(it.brand)) }
            .filter { TextNormalizer.normalize(it.name).isNotEmpty() }
            .distinctBy { TextNormalizer.normalize(it.name) }
        if (models.isEmpty()) return "Agrega al menos un modelo al grupo"
        val name = TextNormalizer.clean(rawName).ifEmpty { GroupNaming.defaultName(type, groupVariant, models) }
        val note = rawNote.trim()

        return db.withTransaction {
            val duplicate = dao.findGroup(type, groupVariant, name)
            if (duplicate != null && duplicate.id != id) {
                val kind = if (type == GroupType.GLASS) groupVariant.fullLabel else type.label
                return@withTransaction "Ya existe un grupo de $kind llamado \"$name\""
            }
            val groupId = if (id == null) {
                dao.insertGroup(CompatGroup(type = type, variant = groupVariant, name = name, note = note))
            } else {
                dao.updateGroup(CompatGroup(id = id, type = type, variant = groupVariant, name = name, note = note))
                id
            }
            dao.deleteRefsForGroup(groupId)
            for (m in models) {
                val model = getOrCreateModel(m.name, m.brand.ifEmpty { null }, overrideBrand = false).first
                dao.insertRef(GroupModelCrossRef(groupId = groupId, modelId = model.id))
            }
            null
        }
    }

    suspend fun deleteGroup(id: Long): Unit = mutate {
        db.withTransaction {
            dao.deleteRefsForGroup(id)
            dao.deleteGroupRow(id)
        }
    }

    // ---------------------------------------------------------------- Importar / exportar

    suspend fun import(rows: List<ImportRow>, replaceAll: Boolean): ImportSummary = mutate {
        importInternal(rows, replaceAll)
    }

    private suspend fun importInternal(rows: List<ImportRow>, replaceAll: Boolean): ImportSummary = db.withTransaction {
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

            val key = type.name + "|" + row.variant.name + "|" + TextNormalizer.normalize(row.group)
            var groupId = groupIds[key]
            if (groupId == null) {
                val existing = dao.findGroup(type, row.variant, row.group)
                groupId = if (existing != null) {
                    existing.id
                } else {
                    newGroups++
                    dao.insertGroup(CompatGroup(type = type, variant = row.variant, name = row.group, note = ""))
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
                val variant = if (g.group.type == GroupType.GLASS) g.group.variant.label else ""
                table += listOf(g.group.type.label, g.group.name, m.name, g.group.note, m.brand, variant)
                usedModelIds += m.id
            }
        }
        // Modelos que no pertenecen a ningún grupo (para que el respaldo esté completo).
        for (m in dao.getModels()) {
            if (m.id !in usedModelIds) table += listOf("", "", m.name, "", m.brand, "")
        }
        return table
    }

    // ---------------------------------------------------------------- Datos de ejemplo

    /** Carga los datos de ejemplo. No se considera un cambio del administrador (no se sube a la nube). */
    suspend fun seedSampleDataIfEmpty(): Unit = writeLock.withLock {
        if (dao.countGroups() > 0) return@withLock
        saveGroupInternal(
            id = null,
            type = GroupType.CASE,
            variant = GroupVariant.NORMAL,
            rawName = "Case grupo iPhone 13/14/15",
            rawNote = "La cámara del 15 queda un poco justa",
            modelInputs = listOf("iPhone 13", "iPhone 14", "iPhone 15").map { ModelInput(it) },
        )
        saveGroupInternal(
            id = null,
            type = GroupType.GLASS,
            variant = GroupVariant.NORMAL,
            rawName = "Vidrio grupo iPhone 12/12 Pro/13/13 Pro/14",
            rawNote = "Pantalla de 6,1\". Verificar el recorte de la cámara frontal antes de vender.",
            modelInputs = listOf("iPhone 12", "iPhone 12 Pro", "iPhone 13", "iPhone 13 Pro", "iPhone 14").map { ModelInput(it) },
        )
        Unit
    }

    // ---------------------------------------------------------------- Copia en la nube

    /** Todos los datos locales en el formato de Firestore. */
    suspend fun localSnapshot(): CloudSnapshot {
        val models = dao.getModels().associate { m ->
            m.id.toString() to CloudSnapshot.modelFields(m.name, m.brand, m.normalized)
        }
        val refsByGroup = dao.getRefs().groupBy({ it.groupId }, { it.modelId.toString() })
        val groups = dao.getGroups().associate { g ->
            g.id.toString() to CloudSnapshot.groupFields(g.type.name, g.variant.name, g.name, g.note, refsByGroup[g.id].orEmpty())
        }
        return CloudSnapshot(models, groups)
    }

    /**
     * Reemplaza todos los datos locales por los de la nube.
     * Debe llamarse con [writeLock] tomado.
     */
    suspend fun replaceAllWithCloud(snapshot: CloudSnapshot): Unit = db.withTransaction {
        dao.clearRefs()
        dao.clearGroups()
        dao.clearModels()
        dao.insertModels(
            snapshot.models.mapNotNull { (id, f) ->
                val longId = id.toLongOrNull() ?: return@mapNotNull null
                val name = f["name"] as? String ?: return@mapNotNull null
                val normalized = (f["normalized"] as? String).orEmpty().ifEmpty { TextNormalizer.normalize(name) }
                PhoneModel(
                    id = longId,
                    name = name,
                    brand = (f["brand"] as? String).orEmpty().ifEmpty { BrandDetector.detect(name) },
                    normalized = normalized,
                )
            }
        )
        val existingModelIds = dao.getModels().map { it.id }.toSet()
        val groups = snapshot.groups.mapNotNull { (id, f) ->
            val longId = id.toLongOrNull() ?: return@mapNotNull null
            val type = GroupType.entries.firstOrNull { it.name == f["type"] } ?: GroupType.CASE
            val variant = GroupVariant.entries.firstOrNull { it.name == f["variant"] } ?: GroupVariant.NORMAL
            CompatGroup(
                id = longId,
                type = type,
                variant = variant,
                name = f["name"] as? String ?: "",
                note = f["note"] as? String ?: "",
            )
        }
        dao.insertGroups(groups)
        val refs = snapshot.groups.flatMap { (id, f) ->
            val groupId = id.toLongOrNull() ?: return@flatMap emptyList<GroupModelCrossRef>()
            (f["models"] as? List<*>).orEmpty()
                .mapNotNull { it?.toString()?.toLongOrNull() }
                .filter { it in existingModelIds }
                .map { GroupModelCrossRef(groupId = groupId, modelId = it) }
        }
        dao.insertRefs(refs)
    }
}
