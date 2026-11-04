package com.casematch.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import com.casematch.app.model.GroupType
import kotlinx.coroutines.flow.Flow

@Dao
interface CompatDao {

    // ---------------------------------------------------------------- Modelos

    @Query("SELECT * FROM models ORDER BY name COLLATE NOCASE")
    fun observeModels(): Flow<List<PhoneModel>>

    @Query("SELECT * FROM models ORDER BY brand COLLATE NOCASE, name COLLATE NOCASE")
    suspend fun getModels(): List<PhoneModel>

    @Query("SELECT * FROM models WHERE id = :id")
    fun observeModel(id: Long): Flow<PhoneModel?>

    @Query("SELECT * FROM models WHERE normalized = :normalized LIMIT 1")
    suspend fun findModelByNormalized(normalized: String): PhoneModel?

    @Query("SELECT COUNT(*) FROM models")
    fun observeModelCount(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertModel(model: PhoneModel): Long

    @Update
    suspend fun updateModel(model: PhoneModel)

    @Query("DELETE FROM models WHERE id = :id")
    suspend fun deleteModelRow(id: Long)

    @Query("DELETE FROM group_models WHERE modelId = :modelId")
    suspend fun deleteRefsForModel(modelId: Long)

    // ---------------------------------------------------------------- Grupos

    @Transaction
    @Query("SELECT * FROM groups ORDER BY name COLLATE NOCASE")
    fun observeGroupsWithModels(): Flow<List<GroupWithModels>>

    @Transaction
    @Query("SELECT * FROM groups ORDER BY type, name COLLATE NOCASE")
    suspend fun getGroupsWithModels(): List<GroupWithModels>

    @Transaction
    @Query("SELECT * FROM groups WHERE id = :id")
    suspend fun getGroupWithModels(id: Long): GroupWithModels?

    /** Grupos (case y vidrio) en los que aparece el modelo indicado. */
    @Transaction
    @Query(
        "SELECT groups.* FROM groups INNER JOIN group_models ON group_models.groupId = groups.id " +
            "WHERE group_models.modelId = :modelId ORDER BY groups.name COLLATE NOCASE"
    )
    fun observeGroupsForModel(modelId: Long): Flow<List<GroupWithModels>>

    @Query("SELECT * FROM groups WHERE type = :type AND name = :name COLLATE NOCASE LIMIT 1")
    suspend fun findGroup(type: GroupType, name: String): CompatGroup?

    @Query("SELECT COUNT(*) FROM groups")
    fun observeGroupCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM groups")
    suspend fun countGroups(): Int

    @Insert
    suspend fun insertGroup(group: CompatGroup): Long

    @Update
    suspend fun updateGroup(group: CompatGroup)

    @Query("DELETE FROM groups WHERE id = :id")
    suspend fun deleteGroupRow(id: Long)

    @Query("DELETE FROM group_models WHERE groupId = :groupId")
    suspend fun deleteRefsForGroup(groupId: Long)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertRef(ref: GroupModelCrossRef): Long

    // ---------------------------------------------------------------- Borrado total

    @Query("DELETE FROM group_models")
    suspend fun clearRefs()

    @Query("DELETE FROM groups")
    suspend fun clearGroups()

    @Query("DELETE FROM models")
    suspend fun clearModels()
}
