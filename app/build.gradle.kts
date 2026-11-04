plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

// Firebase se activa solo si existe app/google-services.json (ver README).
// Sin ese archivo la app compila igual y funciona solo con datos locales.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Nombre del archivo APK: Guastaccesorio-release.apk / Guastaccesorio-debug.apk
base {
    archivesName.set("Guastaccesorio")
}

android {
    namespace = "com.casematch.app"
    compileSdk = 35

    defaultConfig {
        // El identificador del paquete NO se cambia: si cambiara, Android la trataría como
        // otra app y no se podría instalar encima de la anterior (se perderían los datos).
        applicationId = "com.casematch.app"
        minSdk = 26 // Android 8.0
        targetSdk = 35
        versionCode = 2
        versionName = "2.0"
    }

    // Clave de firma fija incluida en el proyecto: así cada APK compilado (en tu PC o en
    // GitHub Actions) tiene la misma firma y se puede instalar encima del anterior sin
    // perder los datos. Es pública: sirve para uso personal, no para publicar en Play Store.
    signingConfigs {
        create("casematch") {
            storeFile = file("casematch.jks")
            storePassword = "casematch"
            keyAlias = "casematch"
            keyPassword = "casematch"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("casematch")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("casematch")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    debugImplementation("androidx.compose.ui:ui-tooling")

    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")

    // Firebase: base de datos compartida (Firestore) y sesiones (Authentication)
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-auth")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    testImplementation("junit:junit:4.13.2")
}
