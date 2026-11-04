package com.casematch.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [PhoneModel::class, CompatGroup::class, GroupModelCrossRef::class],
    version = 2,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun dao(): CompatDao

    companion object {
        /**
         * Versión 1 -> 2: agrega la clase de vidrio (Normal, 9D, Privacy) a los grupos.
         * Los datos existentes se conservan; los grupos que ya había quedan como "Normal".
         */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `groups` ADD COLUMN `variant` TEXT NOT NULL DEFAULT 'NORMAL'")
            }
        }

        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "casematch.db")
                .addMigrations(MIGRATION_1_2)
                .build()
    }
}
