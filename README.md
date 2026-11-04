# Tuc Tuc Guastatoya 🛺

Juego de carreras 2D con vista desde arriba para Android. Manejas un tuc tuc
de techo rojo y le das la vuelta al **Parque Central de Guastatoya, El Progreso**,
contra otros 5 tuc tucs manejados por la máquina.

> **GUASTATOYA – Ciudad con vista propia**

Hecho con **Godot 4.3** (modo 2D, renderizador *Compatibility*, ideal para
teléfonos de gama baja). Todo lo gráfico se dibuja por código y los sonidos se
generan con un script, así que el proyecto no trae imágenes pesadas y el APK es liviano.
Funciona sin internet.

## Qué trae el juego

| | |
|---|---|
| **Escenario** | Circuito alrededor del Parque Central: arbustos recortados en forma de diamante, palmeras, el **kiosco de cúpula redonda**, la **gran ceiba**, jardineras y bancas. Calles con tiendas (tortillería, abarrotería, farmacia, comedor…), ventas con toldo, carrito de helados y una manzana de casas con tinacos. Alrededor del valle, los cerros. Arco de meta con el letrero "GUASTATOYA – Ciudad con vista propia". |
| **Hora** | Día soleado o **atardecer dorado** (se encienden los faros). |
| **Sentido** | Normal o contravía. |
| **Rivales** | Don Chepe, La Chula, El Flaco, Doña Tere y Memo. |
| **Obstáculos** | Topes, perros (chuchos) que cruzan la calle, motos estacionadas, pickups estacionadas y una pickup que va circulando, baches, ventas en la acera y el carrito de helados. |
| **Objetos** | Turbo (nitro), monedas y reparación. |
| **Física** | El tuc tuc choca, rebota, derrapa (deja marcas de llanta), salta en los topes, se daña (echa humo y pierde velocidad) y se recupera. |
| **Modos** | Carrera rápida (3 vueltas), Campeonato (4 carreras con tabla de posiciones y puntos 10-8-6-5-4-3) y Contrarreloj (récord de vuelta y total). |
| **Garaje** | 9 colores para la carrocería (el techo siempre rojo) y mejoras de **motor**, **llantas** y **turbo** (5 niveles cada una) que se compran con las monedas ganadas. |
| **Sonido** | Música alegre estilo marimba, motor de dos tiempos que sube de tono con la velocidad, pito "piii-piii", derrape, choques, ladridos y más. |

### Controles

En pantalla (multitáctil):

- **◀ ▶** volante izquierda / derecha
- **ACELERAR**, **FRENO** (también reversa), **TURBO** y **PITO**
- En *Ajustes* se puede cambiar a **Inclinar el teléfono** para girar (con sensibilidad
  ajustable y opción de invertir) y activar **Acelerar automático**.
- Botón **II** o el botón "atrás" de Android para pausar.

En computadora (para probar): flechas o WASD, Espacio = turbo, H = pito, Esc = pausa.

## Instalar el APK en el teléfono

En la carpeta [`apk/`](apk/) ya vienen dos APK compilados y firmados:

| Archivo | Para qué teléfono | Tamaño |
|---|---|---|
| `TucTucGuastatoya-arm64.apk` | La mayoría de teléfonos de 2017 en adelante (64 bits). **Recomendado.** | ~23 MB |
| `TucTucGuastatoya.apk` | Universal: también teléfonos viejitos de 32 bits. Úsalo si el otro no se instala. | ~46 MB |

1. Pasa el archivo `.apk` al teléfono (cable USB, WhatsApp "a mí mismo", Google Drive o
   descargándolo directo desde GitHub en el teléfono).
2. Ábrelo desde el administrador de archivos o "Descargas".
3. Si Android lo pide, permite **"Instalar apps desconocidas"** para esa aplicación
   (Ajustes → Seguridad / Apps → Acceso especial → Instalar apps desconocidas).
4. Toca **Instalar** y luego **Abrir**. Puede aparecer un aviso de Play Protect porque la
   app no viene de la Play Store: elige *Instalar de todas formas*.

Con cable y *Depuración USB* activada también se puede hacer: `adb install -r TucTucGuastatoya-arm64.apk`

Requisitos: Android 8.0 o superior (también abre en algunos más viejos), no necesita internet
ni permisos especiales.

> Nota: si más adelante compilas tu propio APK con **otra** llave de firma, Android no deja
> instalarlo encima del anterior: desinstala primero el viejo (se pierden monedas y récords).

## Compilar el APK uno mismo

### Opción A: con el editor de Godot (lo más fácil)

1. Descarga **Godot 4.3 (estándar, no .NET)** de <https://godotengine.org/download/archive/4.3-stable/>.
2. Abre Godot → *Importar* → elige el archivo `project.godot` de esta carpeta.
3. Menú **Editor → Administrar plantillas de exportación → Descargar e instalar**.
4. Instala **Android Studio** (o solo las *command-line tools*) y desde el SDK Manager instala
   *Android SDK Platform-Tools* y *Android SDK Build-Tools*. Instala también **OpenJDK 17**.
5. En Godot: **Editor → Configuración del editor → Exportar → Android**:
   - *Android SDK Path*: la carpeta del SDK (ej. `C:\Users\TU_USUARIO\AppData\Local\Android\Sdk`).
   - *Java SDK Path*: la carpeta del JDK 17.
   - *Debug Keystore*: Godot 4.3 crea uno automáticamente (para pruebas).
6. Crea tu llave de firma para la versión final (una sola vez, guárdala bien):
   ```
   keytool -genkeypair -v -keystore tuctuc.keystore -alias tuctuc -keyalg RSA -keysize 2048 -validity 10000
   ```
7. **Proyecto → Exportar…** → elige el preset **"Android arm64 (liviano)"** o **"Android"**.
   En *Keystore → Release* pon la ruta de `tuctuc.keystore`, el alias `tuctuc` y la contraseña.
8. Clic en **Exportar proyecto**, desmarca *Exportar con depuración*, y guarda el `.apk`.

### Opción B: línea de comandos

Con Godot 4.3, las plantillas de exportación instaladas y el SDK configurado en el editor:

```bash
export GODOT_ANDROID_KEYSTORE_RELEASE_PATH=/ruta/tuctuc.keystore
export GODOT_ANDROID_KEYSTORE_RELEASE_USER=tuctuc
export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD=tu_contraseña
godot --headless --editor --quit --path .          # importa los recursos la primera vez
godot --headless --path . --export-release "Android arm64 (liviano)" build/TucTucGuastatoya-arm64.apk
godot --headless --path . --export-release "Android" build/TucTucGuastatoya.apk
```

### Opción C: GitHub Actions (sin instalar nada)

El repositorio trae el workflow [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).
En GitHub ve a **Actions → Compilar APK → Run workflow**; al terminar, descarga el artefacto
`TucTucGuastatoya-APK`. Para que todas las versiones usen la misma firma, agrega en
*Settings → Secrets and variables → Actions* los secretos `ANDROID_KEYSTORE_BASE64`
(el keystore en base64: `base64 -w0 tuctuc.keystore`), `ANDROID_KEYSTORE_ALIAS` y
`ANDROID_KEYSTORE_PASSWORD`.

## Probar en la computadora

Abre el proyecto en Godot 4.3 y presiona **F5**. Con el mouse se pueden tocar los botones
en pantalla (el ratón emula el toque). Atajos para pruebas (después de `--`):

```bash
godot --path . -- --race --mode=rapida            # directo a una carrera (rapida, campeonato, contrarreloj)
godot --path . -- --race --sunset --reverse       # al atardecer y en contravía
godot --headless --fixed-fps 60 --path . -- --race --autoplay --quit-after-race   # carrera automática de prueba
```

## Estructura del proyecto

```
project.godot              configuración (1280x720 horizontal, renderizador Compatibility)
export_presets.cfg         presets de exportación Android
scenes/main.tscn           escena principal
scripts/game.gd            estado global: monedas, mejoras, ajustes, campeonato, guardado
scripts/audio.gd           música, motor y efectos
scripts/art.gd             dibujos: tuc tuc, palmeras, arbustos diamante, ceiba, kiosco, perros, pickups…
scripts/ui/                pantallas: inicio, modos, garaje, ajustes, resultados, tabla
scripts/race/track.gd      geometría del circuito alrededor del parque
scripts/race/world.gd      escenario: parque, tiendas, calles, cerros
scripts/race/kart.gd       física del tuc tuc + inteligencia de los rivales
scripts/race/obstacle.gd   topes, baches, perros, motos, pickups, ventas, carrito de helados
scripts/race/item.gd       turbo, monedas y reparación
scripts/race/race.gd       reglas de la carrera, vueltas, posiciones, cámara, pausa
scripts/race/hud.gd        indicadores y minimapa
scripts/race/touch_controls.gd  botones táctiles e inclinación
tools/gen_audio.py         genera todos los sonidos (python3 + numpy)
assets/audio/              sonidos generados
apk/                       APK ya compilados
```

Para cambiar el recorrido, edita `CORNERS` en `scripts/race/track.gd`; los obstáculos y
objetos están en las listas `OBSTACLES` e `ITEMS` de `scripts/race/race.gd`.
