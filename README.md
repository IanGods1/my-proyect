# CaseMatch

Aplicación Android para consultar qué modelos de teléfono comparten el mismo **case** (funda) y el mismo **vidrio templado**.

Buscas un modelo (por ejemplo "iPhone 13") y la app te muestra, en dos pestañas, qué otros modelos usan el mismo case y cuáles el mismo vidrio.

- Android 8.0 o superior
- Funciona sin internet (base de datos local Room/SQLite)
- Kotlin + Jetpack Compose, modo claro y oscuro, todo en español

---

## Funciones

| Pantalla | Qué hace |
|---|---|
| **Buscar** (inicio) | Barra de búsqueda con sugerencias mientras escribes. Tolera texto incompleto, sin mayúsculas o sin espacios: `ip13`, `iphone 13` e `IPHONE13` encuentran "iPhone 13". El menú ⋮ permite elegir el tema (sistema, claro u oscuro). |
| **Resultado** | Pestañas **Case** y **Vidrio templado** con los modelos compatibles y la nota de cada grupo. Si no hay datos: "Sin compatibilidades registradas". Tocando un modelo compatible se abre su propio resultado. |
| **Lista de modelos** | Todos los modelos, agrupados por marca (Apple, Samsung, Xiaomi, Motorola y luego el resto), con filtro. |
| **Administrar datos** | Crear, editar y eliminar grupos de compatibilidad; importar y exportar. |
| **Administrar modelos** | Agregar, renombrar, cambiar marca y eliminar modelos. |

### Cómo se guardan los datos (grupos, no pares)

Cada **grupo de compatibilidad** tiene un tipo (Case o Vidrio templado), un nombre, una lista de modelos y una nota opcional. Todos los modelos de un grupo son compatibles entre sí, así que la compatibilidad funciona en ambos sentidos: si el iPhone 13 está en el mismo grupo que el iPhone 14, al buscar cualquiera de los dos aparece el otro.

Un modelo puede estar en varios grupos (por ejemplo, un grupo de case y otro de vidrio). La marca se detecta sola a partir del nombre (iPhone → Apple, Galaxy → Samsung, Redmi/Poco → Xiaomi, Moto → Motorola…) y se puede cambiar en "Administrar modelos".

### Importar y exportar

**Importar** (Administrar datos → Importar) acepta archivos **CSV** o **Excel (.xlsx)** con estas columnas:

| tipo | grupo | modelo | nota |
|---|---|---|---|
| Case | Case grupo iPhone 13/14/15 | iPhone 13 | La cámara del 15 queda un poco justa |
| Case | Case grupo iPhone 13/14/15 | iPhone 14 | |
| Vidrio templado | Vidrio grupo A54/A55 | Galaxy A54 | |

- Una fila por modelo. Las filas con el mismo tipo y grupo forman un grupo.
- **tipo**: `Case` o `Vidrio templado` (también acepta "funda", "vidrio", "mica", "glass"…).
- **nota**: basta con escribirla en una de las filas del grupo.
- Columna opcional **marca**. Si la primera fila tiene encabezados, las columnas pueden ir en cualquier orden.
- El CSV puede estar separado por coma o por punto y coma (como lo guarda Excel en español).
- Una fila con solo **modelo** (sin grupo) registra el modelo sin compatibilidades.
- Al importar se elige **Agregar a los datos actuales** o **Reemplazar todo**.
- El formato antiguo `.xls` no está soportado: en Excel usa *Guardar como → .xlsx o .csv*.

Hay un archivo de ejemplo en [`docs/ejemplo_importacion.csv`](docs/ejemplo_importacion.csv).

**Exportar** guarda todos los datos como respaldo en CSV o Excel, con el mismo formato (más la columna marca), así que el archivo exportado se puede volver a importar.

### Datos de ejemplo

La primera vez que se abre la app se cargan dos grupos de ejemplo:

- **Case grupo iPhone 13/14/15** (iPhone 13, iPhone 14, iPhone 15) con la nota "La cámara del 15 queda un poco justa".
- **Vidrio grupo iPhone 12/12 Pro/13/13 Pro/14** (pantallas de 6,1").

Son solo para probar: revísalos y corrígelos con tus propios datos antes de usarlos para vender.

---

## Cómo obtener el APK e instalarlo

### Opción A: descargar el APK ya compilado desde GitHub (sin instalar nada)

Este repositorio tiene un flujo de GitHub Actions (`.github/workflows/build-apk.yml`) que compila la app cada vez que se suben cambios.

1. En GitHub, entra al repositorio y abre la pestaña **Actions**.
2. Abre la ejecución más reciente de **Compilar APK** que tenga un ✓ verde.
3. Al final de la página, en **Artifacts**, descarga **CaseMatch-apk** (un `.zip`).
4. Descomprímelo. Dentro está `release/app-release.apk` (más liviano, recomendado) y `debug/app-debug.apk`.
5. Pasa el APK al teléfono (cable USB, Google Drive, WhatsApp a ti mismo, etc.) y sigue los pasos de **Instalar en el teléfono**.

> Si no ves ejecuciones en Actions, puedes lanzar una a mano: Actions → Compilar APK → **Run workflow**.

### Opción B: compilar con Android Studio

1. Instala [Android Studio](https://developer.android.com/studio) (versión Ladybug 2024.2 o más reciente).
2. Descarga el código: en GitHub, botón **Code → Download ZIP**, y descomprímelo (o usa `git clone`).
3. En Android Studio: **File → Open** y elige la carpeta del proyecto (la que contiene `settings.gradle.kts`).
4. Espera a que termine la sincronización de Gradle (la primera vez descarga dependencias y tarda varios minutos). Si pide instalar el SDK 35 o aceptar licencias, acepta.
5. Menú **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
6. Al terminar aparece un aviso: haz clic en **locate**. El archivo es `app/build/outputs/apk/debug/app-debug.apk`.

También puedes instalar directamente: conecta el teléfono con depuración USB activada (ver abajo) y pulsa el botón ▶ **Run**.

### Opción C: compilar desde la terminal

Requisitos: JDK 17 y el Android SDK (el que instala Android Studio). Crea un archivo `local.properties` en la raíz con la ruta del SDK, por ejemplo:

```
sdk.dir=C\:\\Users\\TU_USUARIO\\AppData\\Local\\Android\\Sdk      # Windows
sdk.dir=/Users/TU_USUARIO/Library/Android/sdk                       # macOS
sdk.dir=/home/TU_USUARIO/Android/Sdk                                # Linux
```

Luego:

```bash
./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
```

El APK queda en `app/build/outputs/apk/release/app-release.apk`.

Para correr los tests de la búsqueda y la importación: `./gradlew testDebugUnitTest`.

### Instalar en el teléfono

1. Copia el `.apk` al teléfono y ábrelo desde la app **Archivos** (o desde la notificación de descarga).
2. Android avisará que la instalación de apps desconocidas está bloqueada: toca **Configuración** y activa **Permitir de esta fuente** para la app desde la que abriste el APK (Archivos, Chrome, Drive…).
3. Vuelve atrás y toca **Instalar**. Si Play Protect muestra un aviso, elige **Instalar de todas formas** (es normal en apps que no vienen de Play Store).
4. Abre **CaseMatch** desde el cajón de aplicaciones.

Para instalar por cable con `adb`: activa **Opciones de desarrollador** (Ajustes → Acerca del teléfono → toca 7 veces "Número de compilación"), activa **Depuración USB**, conecta el teléfono y ejecuta:

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

> **Actualizaciones:** todos los APK se firman con la misma clave (`app/casematch.jks`, incluida en el proyecto), así que una versión nueva se instala encima de la anterior y **conserva tus datos**. Igual conviene exportar un respaldo de vez en cuando. Esa clave es pública: sirve para uso personal; si algún día publicas la app en Play Store, crea una clave propia y privada.

---

## Estructura del proyecto

```
app/src/main/java/com/casematch/app/
├── CaseMatchApp.kt              Inicio de la app, datos de ejemplo, preferencia de tema
├── MainActivity.kt              Actividad única (Compose)
├── data/
│   ├── Entities.kt              Tablas: modelos, grupos y relación grupo-modelo
│   ├── CompatDao.kt             Consultas a la base de datos (Room)
│   ├── AppDatabase.kt           Base de datos local
│   └── CompatRepository.kt      Guardar/editar/eliminar, importar/exportar, datos de ejemplo
├── model/GroupType.kt           Tipo: Case o Vidrio templado
├── util/
│   ├── TextNormalizer.kt        "IPHONE 13" -> "iphone13"
│   ├── ModelSearch.kt           Búsqueda tolerante y orden de resultados
│   └── BrandDetector.kt         Detección y orden de marcas
├── io/
│   ├── CsvFormat.kt             Leer/escribir CSV
│   ├── XlsxFormat.kt            Leer/escribir Excel .xlsx (sin librerías externas)
│   └── ImportRow.kt             Interpretación de las columnas tipo/grupo/modelo/nota
└── ui/
    ├── theme/Theme.kt           Colores claro/oscuro y tamaños de texto
    ├── components/Common.kt     Botones grandes, barra superior, diálogos
    ├── navigation/AppNavHost.kt Navegación entre pantallas
    └── screens/
        ├── home/                Buscador con sugerencias
        ├── result/              Resultado con pestañas Case / Vidrio templado
        ├── models/              Lista de modelos por marca (y administración de modelos)
        ├── admin/               Grupos, importar y exportar
        └── group/               Formulario de grupo de compatibilidad
```
