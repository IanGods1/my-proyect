package com.casematch.app.data

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Junction
import androidx.room.PrimaryKey
import androidx.room.Relation
import androidx.room.TypeConverter
import com.casematch.app.model.GroupType
import com.casematch.app.model.GroupVariant

/** Modelo de teléfono. [normalized] es la clave de búsqueda única ("iPhone 13" -> "iphone13"). */
@Entity(tableName = "models", indices = [Index(value = ["normalized"], unique = true)])
data class PhoneModel(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val brand: String,
    val normalized: String,
)

/** Grupo de compatibilidad: todos sus modelos comparten el mismo case o el mismo vidrio. */
@Entity(tableName = "groups")
data class CompatGroup(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: GroupType,
    val name: String,
    val note: String = "",
    /** Clase de vidrio (Normal, 9D, Privacy). En los grupos de Case siempre es NORMAL. */
    val variant: GroupVariant = GroupVariant.NORMAL,
)

/** Relación grupo <-> modelo. Al guardarse como grupo, la compatibilidad funciona en ambos sentidos. */
@Entity(
    tableName = "group_models",
    primaryKeys = ["groupId", "modelId"],
    foreignKeys = [
        ForeignKey(entity = CompatGroup::class, parentColumns = ["id"], childColumns = ["groupId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = PhoneModel::class, parentColumns = ["id"], childColumns = ["modelId"], onDelete = ForeignKey.CASCADE),
    ],
    indices = [Index("modelId")],
)
data class GroupModelCrossRef(
    val groupId: Long,
    val modelId: Long,
)

data class GroupWithModels(
    @Embedded val group: CompatGroup,
    @Relation(
        parentColumn = "id",
        entityColumn = "id",
        associateBy = Junction(GroupModelCrossRef::class, parentColumn = "groupId", entityColumn = "modelId"),
    )
    val models: List<PhoneModel>,
)

class Converters {
    @TypeConverter
    fun fromType(type: GroupType): String = type.name

    @TypeConverter
    fun toType(value: String): GroupType = GroupType.entries.firstOrNull { it.name == value } ?: GroupType.CASE

    @TypeConverter
    fun fromVariant(variant: GroupVariant): String = variant.name

    @TypeConverter
    fun toVariant(value: String): GroupVariant = GroupVariant.entries.firstOrNull { it.name == value } ?: GroupVariant.NORMAL
}
