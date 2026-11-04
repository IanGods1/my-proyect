# Guastaccesorio

Aplicación Android para consultar qué modelos de teléfono comparten el mismo **case** (funda) y el mismo **vidrio templado**.

Buscas un modelo (por ejemplo "iPhone 13") y la app te muestra, en dos pestañas, qué otros modelos usan el mismo case y cuáles el mismo vidrio.

- Android 8.0 o superior
- Acceso con contraseña: **administrador** (tú) y **trabajador** (tus empleados)
- Datos compartidos en la nube (Firebase), con copia en cada teléfono para buscar sin internet
- Kotlin + Jetpack Compose, modo claro y oscuro, todo en español

> Antes se llamaba **CaseMatch**. La actualización conserva los datos que ya tenías (ver [Actualizar sin perder datos](#actualizar-sin-perder-datos)).

---

## Funciones

| Pantalla | Administrador | Trabajador |
|---|---|---|
| **Buscar** (inicio): sugerencias mientras escribes. `ip13`, `iphone 13` e `IPHONE13` encuentran "iPhone 13". | ✓ | ✓ |
| **Resultado**: pestañas **Case** y **Vidrio templado** con los modelos compatibles y la nota de cada grupo. Si no hay datos: "Sin compatibilidades registradas". | ✓ (con botón editar) | ✓ (solo ver) |
| **Lista de modelos**: todos los modelos agrupados por marca (Apple, Samsung, Xiaomi, Motorola y luego el resto). | ✓ | ✓ |
| **Administrar datos**: crear, editar y eliminar grupos; importar y exportar. | ✓ | — oculto |
| **Administrar modelos**: agregar, renombrar, cambiar marca y eliminar modelos. | ✓ | — oculto |
| **Configuración**: cambiar contraseñas, estado de la nube, tema, cerrar sesión. | ✓ | — oculto |

El trabajador no ve ningún botón de agregar, editar, eliminar, importar, exportar ni configuración: no están ocultos solo en pantalla, esas pantallas ni siquiera existen en su sesión. Además, las reglas de Firebase impiden que un trabajador escriba datos aunque lo intente por otro medio.

### Contraseñas y sesiones

- **Primer uso:** la primera vez que se abre la app (y no hay contraseñas creadas) se piden la contraseña de **administrador** y la de **trabajador**, cada una dos veces. Mínimo 6 caracteres; deben ser distintas.
- **Ingreso:** un solo campo de contraseña y el botón **Entrar**. Según la contraseña escrita, la app entra como administrador o como trabajador.
- **Contraseña incorrecta:** muestra "Contraseña incorrecta". Después de **5 intentos fallidos** se bloquea durante **1 minuto** (también si cierras la app).
- **Sesión permanente:** después de entrar, la app no vuelve a pedir la contraseña aunque la cierres, reinicies el teléfono o pasen días.
- **Trabajador:** no tiene botón de cerrar sesión. Su sesión se cierra solo cuando el administrador cambia la contraseña de trabajador. La app lo revisa en Firebase cada vez que se abre (y al instante si está abierta con internet) y muestra: *"La contraseña cambió. Pide la nueva al administrador"*. Sin internet sigue funcionando con la última sesión válida, y se cierra en cuanto el teléfono se conecte.
- **Administrador:** tiene **Cerrar sesión** en Configuración, por si alguien más usa tu teléfono.
- **Cuando un trabajador se va:** Configuración → **Cambiar contraseña de trabajador** → escribe la nueva dos veces → confirma *"Se cerrará la sesión en todos los teléfonos de trabajadores. ¿Continuar?"*. Pasa la nueva contraseña solo a quienes siguen trabajando contigo.
- **Cambiar tu contraseña:** Configuración → **Cambiar mi contraseña de administrador** → contraseña actual y la nueva dos veces (necesita internet).

Las contraseñas nunca se guardan en texto plano:
- En el teléfono se guarda solo un *hash* PBKDF2-SHA256 con sal aleatoria.
- En la nube, la contraseña de administrador la protege Firebase Authentication. La de trabajador se guarda como una clave PBKDF2 en un documento que solo el administrador puede leer.

### Datos compartidos en la nube

- Lo que agregas o cambias como administrador se sube a Firebase (Firestore) y les llega a los trabajadores.
- Cada teléfono guarda una copia local, así que la búsqueda funciona **sin internet**. Los cambios hechos sin conexión se suben cuando vuelve internet.
- La primera vez que entras como administrador con Firebase configurado, la app **sube a la nube los datos que ya tenías** en el teléfono.
- Usa **un solo teléfono como administrador**. Puedes entrar como administrador en otro teléfono (descarga los datos de la nube), pero si editas en dos teléfonos a la vez sin internet, puede ganar el último que se conecte.

Si la app se compila **sin** configurar Firebase, funciona igual pero todo queda solo en ese teléfono: la pantalla de Configuración muestra "Nube no configurada".

### Grupos de compatibilidad (no pares)

Cada grupo tiene un tipo (Case o Vidrio templado), un nombre, una lista de modelos y una nota opcional. Todos los modelos de un grupo son compatibles entre sí, así que funciona en ambos sentidos: si el iPhone 13 está en el mismo grupo que el iPhone 14, al buscar cualquiera de los dos aparece el otro.

### Importar y exportar (administrador)

**Importar** acepta **CSV** o **Excel (.xlsx)** con estas columnas:

| tipo | grupo | modelo | nota |
|---|---|---|---|
| Case | Case grupo iPhone 13/14/15 | iPhone 13 | La cámara del 15 queda un poco justa |
| Case | Case grupo iPhone 13/14/15 | iPhone 14 | |
| Vidrio templado | Vidrio grupo A54/A55 | Galaxy A54 | |

- Una fila por modelo. Las filas con el mismo tipo y grupo forman un grupo.
- **tipo**: `Case` o `Vidrio templado` (también acepta "funda", "vidrio", "mica", "glass"…). La **nota** basta con escribirla en una fila del grupo.
- Columna opcional **marca**. Con encabezados, las columnas pueden ir en cualquier orden. Separador coma o punto y coma.
- Al importar eliges **Agregar a los datos actuales** o **Reemplazar todo**. El formato antiguo `.xls` no está soportado.

Hay un ejemplo en [`docs/ejemplo_importacion.csv`](docs/ejemplo_importacion.csv). **Exportar** guarda todo en CSV o Excel con el mismo formato, así que el respaldo se puede volver a importar.

---

## Configurar Firebase (paso a paso)

Firebase es el servicio gratuito de Google que guarda los datos compartidos. El plan gratis (**Spark**) alcanza de sobra: no hace falta poner tarjeta de crédito. Necesitas una cuenta de Google y una computadora. Te tomará unos 15 minutos.

### 1. Crear el proyecto

1. Entra a <https://console.firebase.google.com> e inicia sesión con tu cuenta de Google.
2. Toca **Crear un proyecto** (o "Agregar proyecto").
3. Nombre: `Guastaccesorio` → **Continuar**.
4. Google Analytics: puedes **desactivarlo** (no se usa) → **Crear proyecto**. Espera y toca **Continuar**.

### 2. Registrar la app Android

1. En la página principal del proyecto, toca el ícono de **Android** (el robot verde), o ⚙️ **Configuración del proyecto → Tus apps → Agregar app → Android**.
2. **Nombre del paquete de Android:** escribe exactamente

   ```
   com.casematch.app
   ```

   Es el identificador interno de la app. Se mantiene el de la versión anterior para que la actualización **no borre tus datos**. Si escribes otro, la app no se conectará.
3. **Sobrenombre de la app:** `Guastaccesorio`. El campo **SHA-1** déjalo vacío.
4. Toca **Registrar app**.
5. Toca **Descargar google-services.json** y guarda el archivo (queda en tu carpeta de Descargas). **Lo vas a necesitar en el paso 5.**
6. Los pasos siguientes del asistente ("Agregar el SDK"…) no hacen falta: toca **Siguiente** / **Continuar a la consola** hasta salir.

### 3. Activar el ingreso (Authentication)

1. En el menú de la izquierda: **Compilación (Build) → Authentication → Comenzar**.
2. En la pestaña **Método de acceso (Sign-in method)**:
   - Toca **Correo electrónico/contraseña** → activa **solo el primer interruptor** ("Correo electrónico/contraseña") → **Guardar**.
   - Toca **Agregar proveedor nuevo → Anónimo** → actívalo → **Guardar**.

No tienes que crear usuarios: la app crea sola la cuenta de administrador cuando creas las contraseñas. El trabajador entra como "anónimo" con la contraseña de trabajador.

### 4. Crear la base de datos (Firestore) y sus reglas de seguridad

1. Menú de la izquierda: **Compilación (Build) → Firestore Database → Crear base de datos**.
2. Ubicación: elige la más cercana (por ejemplo `southamerica-east1` o `nam5 (United States)`) → **Siguiente**.
3. Elige **Iniciar en modo de producción** → **Crear**.
4. Cuando aparezca la base de datos, abre la pestaña **Reglas**.
5. **Borra todo** lo que hay en el editor y pega el contenido completo del archivo [`firestore.rules`](firestore.rules) de este repositorio. En GitHub, abre el archivo y usa el botón de copiar.
6. Toca **Publicar**.

Estas reglas hacen que **solo el administrador pueda escribir** y que el trabajador solo pueda leer mientras su contraseña sea la vigente.

### 5. Conectar la app con Firebase

La app necesita el archivo `google-services.json` del paso 2 al compilarse. Elige una opción:

**Opción A (recomendada): si compilas con GitHub Actions**

1. En GitHub, entra al repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. **Name:** `GOOGLE_SERVICES_JSON`
3. **Secret:** abre `google-services.json` con el Bloc de notas (clic derecho → Abrir con → Bloc de notas), selecciona todo (Ctrl+A), copia y pega aquí.
4. Toca **Add secret**.
5. Vuelve a compilar: pestaña **Actions** → abre la última ejecución de **Compilar APK** → **Re-run jobs → Re-run all jobs**. Cualquier cambio nuevo que subas también compila con Firebase.

En el registro de la compilación, el paso "Configuración de Firebase" debe decir *"Firebase: configurado desde el secreto GOOGLE_SERVICES_JSON"*.

**Opción B: si compilas con Android Studio**

Copia `google-services.json` dentro de la carpeta `app/` del proyecto (junto a `app/build.gradle.kts`) y compila normalmente.

### 6. Comprobar que funciona

1. Instala el APK nuevo en **tu** teléfono primero (ver abajo) y crea las dos contraseñas.
2. Entra a **Configuración**: en "Datos en la nube" debe decir **Conectado a Firebase**.
3. En la consola de Firebase → Firestore Database → **Datos**, deben aparecer las colecciones `models`, `groups`, `public`, `private`.
4. Recién entonces instala la app en los teléfonos de tus trabajadores y entra con la contraseña de trabajador. **Necesitan internet la primera vez.**

> **Importante:** configura tu teléfono (paso 1) **antes** que los de los trabajadores. Mientras no existan contraseñas en la nube, el primer teléfono que abra la app es el que las crea.

> **Si ya habías creado las contraseñas antes de configurar Firebase:** después de instalar el APK con Firebase, entra a Configuración → **Conectar con la nube** (con tu contraseña de administrador) y luego **Cambiar contraseña de trabajador** para crearla en la nube. La app te lo recuerda con un aviso.

---

## Actualizar sin perder datos

La versión nueva usa el **mismo identificador de paquete** (`com.casematch.app`), la **misma base de datos** y la **misma clave de firma** (`app/casematch.jks`) que CaseMatch. Por eso se instala **encima** de la anterior y conserva todos tus grupos y modelos.

1. **Por las dudas, haz un respaldo** en la app vieja: Administrar datos → Exportar → CSV. Guárdalo en Drive o envíatelo.
2. Obtén el APK nuevo (ver abajo). Se llama `Guastaccesorio-release.apk`.
3. Ábrelo en el teléfono y toca **Actualizar** / **Instalar**. **No desinstales** la app anterior: desinstalar borra los datos.
4. Abre **Guastaccesorio** (el ícono ahora tiene ese nombre). Como todavía no hay contraseñas, te pedirá crear la de administrador y la de trabajador.
5. Listo: tus datos siguen ahí y, con Firebase configurado, se suben a la nube.

Si Android dice *"La app no está instalada"* o *"conflicto con un paquete existente"*, el APK está firmado con otra clave: no desinstales; revisa que lo compilaste desde este repositorio.

---

## Cómo obtener el APK e instalarlo

### Opción A: descargar el APK desde GitHub (sin instalar nada)

El flujo de GitHub Actions (`.github/workflows/build-apk.yml`) compila la app cada vez que se suben cambios.

1. En GitHub, entra al repositorio → pestaña **Actions**.
2. Abre la ejecución más reciente de **Compilar APK** con ✓ verde.
3. Abajo, en **Artifacts**, descarga **Guastaccesorio-apk** (un `.zip`).
4. Descomprímelo: usa `release/Guastaccesorio-release.apk` (recomendado).
5. Pásalo al teléfono (cable USB, Google Drive, WhatsApp a ti mismo…) e instálalo.

### Opción B: compilar con Android Studio

1. Instala [Android Studio](https://developer.android.com/studio) (Ladybug 2024.2 o más reciente).
2. Descarga el código (en GitHub: **Code → Download ZIP**) y descomprímelo.
3. Copia `google-services.json` en la carpeta `app/` (ver Firebase, paso 5).
4. Android Studio: **File → Open** → la carpeta del proyecto. Espera a que termine de sincronizar (la primera vez tarda varios minutos; acepta instalar el SDK 35 si lo pide).
5. **Build → Build App Bundle(s) / APK(s) → Build APK(s)** → **locate**. El archivo es `app/build/outputs/apk/debug/Guastaccesorio-debug.apk`. Para la versión liviana usa **Build → Generate Signed App Bundle / APK** o la terminal (opción C).

### Opción C: compilar desde la terminal

Requisitos: JDK 17 y el Android SDK. Crea `local.properties` en la raíz con la ruta del SDK, por ejemplo `sdk.dir=C\:\\Users\\TU_USUARIO\\AppData\\Local\\Android\\Sdk` (Windows) o `sdk.dir=/Users/TU_USUARIO/Library/Android/sdk` (macOS). Luego:

```bash
./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
```

El APK queda en `app/build/outputs/apk/release/Guastaccesorio-release.apk`. Tests: `./gradlew testDebugUnitTest`.

### Instalar en el teléfono

1. Abre el `.apk` desde la app **Archivos** (o desde la notificación de descarga).
2. Si Android avisa que las apps desconocidas están bloqueadas: **Configuración** → activa **Permitir de esta fuente**.
3. Vuelve y toca **Instalar** (o **Actualizar**). Si Play Protect avisa, elige **Instalar de todas formas** (es normal fuera de Play Store).

Por cable: activa **Depuración USB** en Opciones de desarrollador y ejecuta `adb install -r Guastaccesorio-release.apk` (`-r` = reemplazar conservando datos).

> La clave de firma `app/casematch.jks` está incluida en el proyecto para que todos los APK tengan la misma firma y se actualicen sin perder datos. Es pública: sirve para uso personal; si algún día publicas en Play Store, crea una clave propia y privada.

---

## Estructura del proyecto

```
firestore.rules                  Reglas de seguridad para pegar en Firebase
app/src/main/java/com/casematch/app/
├── CaseMatchApp.kt              Inicio: base local, Firebase, sesión, datos de ejemplo
├── MainActivity.kt              Elige pantalla según la sesión (primer uso / ingreso / app)
├── auth/
│   ├── AuthManager.kt           Contraseñas, roles, sesión permanente, cambio de contraseñas
│   └── LoginLimiter.kt          Bloqueo de 1 minuto tras 5 intentos fallidos
├── cloud/
│   ├── CloudBackend.kt          Acceso a Firebase (Authentication + Firestore)
│   └── CloudSync.kt             Sincroniza la copia local con la nube
├── data/
│   ├── Entities.kt, CompatDao.kt, AppDatabase.kt   Base local (Room)
│   ├── CompatRepository.kt      Guardar/editar/eliminar, importar/exportar
│   └── CloudSnapshot.kt         Formato de los datos en la nube
├── model/GroupType.kt           Tipo: Case o Vidrio templado
├── util/                        Búsqueda, normalización, marcas, hash de contraseñas
├── io/                          CSV y Excel (.xlsx)
└── ui/
    ├── theme/, components/      Colores, botones grandes, campos de contraseña
    ├── navigation/AppNavHost.kt Pantallas según el rol (las de administrador no existen para el trabajador)
    └── screens/
        ├── auth/                Primer uso, ingreso, "sin internet"
        ├── home/                Buscador
        ├── result/              Pestañas Case / Vidrio templado
        ├── models/              Lista por marca (y administración de modelos)
        ├── admin/               Grupos, importar y exportar
        ├── group/               Formulario de grupo
        └── settings/            Configuración (solo administrador)
```

Internamente el código conserva el nombre "casematch" (paquete `com.casematch.app`, base `casematch.db`): cambiarlo haría que Android la trate como otra app y se perderían los datos.
