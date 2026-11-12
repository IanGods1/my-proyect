# 🛒 Abarroterías San Vicenta

App para el teléfono que lleva el control de precios de los productos de la abarrotería.
Sirve para escanear códigos de barras, guardar precios de venta y de costo, anotar el proveedor
y ordenar todo por categorías. **Funciona sin internet** y los datos quedan guardados en el teléfono.

---

## ¿Qué tipo de app es?

Es una **app web instalable (PWA)**. Se abre una sola vez desde una dirección de internet y luego
se **instala en la pantalla de inicio** como cualquier otra app: tiene su propio ícono, se abre a
pantalla completa y funciona sin internet. No hace falta la Play Store ni la App Store, y sirve
en **Android y en iPhone**.

---

## 📲 Instalación paso a paso

La cámara del teléfono solo funciona si la app se abre desde una dirección segura (`https://`).
La forma gratuita más sencilla es publicarla con **GitHub Pages**.

### Paso 1: Publicar la app (una sola vez, desde una computadora o el teléfono)

1. Entre a su repositorio en GitHub: `github.com/IanGods1/my-proyect`.
2. Asegúrese de que el código esté en la rama **`main`** (si está en otra rama, haga el
   *Pull request* y dele **Merge**).
3. Vaya a **Settings** (Configuración) → **Pages** (en el menú izquierdo).
4. En **Source** elija **Deploy from a branch**.
5. En **Branch** elija **`main`** y la carpeta **`/ (root)`**. Presione **Save**.
6. Espere 1 o 2 minutos y recargue la página. Arriba aparecerá la dirección de su app, algo como:
   **`https://iangods1.github.io/my-proyect/`**

> 💡 GitHub Pages gratis requiere que el repositorio sea **público**. Si prefiere mantenerlo privado,
> otra opción gratis es [Netlify Drop](https://app.netlify.com/drop): arrastre ahí la carpeta del
> proyecto y le dará una dirección `https://` lista para usar.

### Paso 2A: Instalar en Android (Chrome)

1. Abra **Chrome** en el teléfono y entre a la dirección del Paso 1.
2. Toque el menú **⋮** (arriba a la derecha).
3. Toque **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.
4. Confirme con **Instalar**. Aparecerá el ícono **San Vicenta** en su pantalla.

### Paso 2B: Instalar en iPhone (Safari)

1. Abra **Safari** (debe ser Safari) y entre a la dirección del Paso 1.
2. Toque el botón **Compartir** (el cuadrito con la flecha hacia arriba).
3. Baje y toque **"Agregar a pantalla de inicio"**.
4. Toque **Agregar**.

### Paso 3: Primer uso

1. Abra la app desde el ícono nuevo.
2. Toque **📷 Escanear código**. El teléfono le pedirá permiso para usar la cámara: toque **Permitir**.
3. ¡Listo! Desde ahora la app abre aunque no tenga internet.

---

## 🧾 Cómo usar la app

### 📷 Escanear (pantalla principal)
- Toque **Escanear código** y apunte la cámara al código de barras. Al leerlo, el teléfono vibra/suena.
  - **Si el producto es nuevo**, se abre el formulario con el código ya escrito: llene nombre,
    precios, proveedor y categoría, y toque **💾 Guardar**.
  - **Si ya existe**, se muestran sus datos (precio de venta, costo, ganancia, proveedor…)
    con botones para **Editar** o **Eliminar**.
- **¿No se puede escanear?** Escriba el código en la casilla y toque **Buscar**.
- **Agregar producto sin escanear**: para productos que no tienen código (por ejemplo, a granel).

### 📝 Datos de cada producto
| Campo | Descripción |
|---|---|
| Código de barras | Se llena solo al escanear; también se puede escribir o escanear con el botón 📷 |
| Nombre | Obligatorio |
| Precio de venta | Obligatorio, en quetzales (Q). Puede usar punto o coma: `12.50` o `12,50` |
| Precio de costo | A cómo le sale. La app calcula su **ganancia** y el % automáticamente |
| Lugar de compra | Proveedor o tienda. La app le sugiere los que ya escribió antes |
| Categoría | Elija una de la lista, o "➕ Crear nueva categoría…" ahí mismo |

La app no deja registrar dos productos con el mismo código, y le avisa si el costo es mayor que el precio de venta.

### 📋 Productos
- Lista de todos los productos con **nombre, precio de venta y categoría**, en orden alfabético.
- **Buscador**: escriba parte del nombre o del código; los resultados aparecen mientras escribe
  (no importan mayúsculas ni tildes: "lacteo" encuentra "Lácteo").
- **Filtrar por categoría**: toque los botones de arriba (Todas, Bebidas, Lácteos…).
- Toque un producto para ver todos sus datos. ✏️ para editar, 🗑️ para eliminar.
- Botón azul **＋** para agregar un producto.

### 🏷️ Categorías
- Vienen creadas: Bebidas, Lácteos, Snacks, Limpieza y Granos básicos.
- **Agregar**: escriba el nombre arriba y toque **Agregar**.
- ✏️ **Cambiar nombre** y 🗑️ **Eliminar**. Al eliminar una categoría, sus productos **no se borran**:
  quedan como "Sin categoría".
- Toque una categoría para ver solo sus productos.

### 💾 Respaldo
Los datos se guardan en el teléfono y **no se borran al cerrar la app**. Pero si cambia de teléfono,
desinstala la app o borra los datos del navegador, se pierden. Por eso:
- **Guardar respaldo**: crea un archivo con todos sus productos. Puede enviárselo por WhatsApp
  o guardarlo en Google Drive.
- **Cargar respaldo**: en el teléfono nuevo, abra la app, toque **Cargar respaldo** y elija el archivo.

> ⚠️ Recomendación: guarde un respaldo cada semana.

---

## ❓ Problemas comunes

| Problema | Solución |
|---|---|
| La cámara no abre | Revise que entró por la dirección `https://`. En Chrome: candado 🔒 junto a la dirección → Permisos → Cámara → Permitir. En iPhone: Ajustes → Safari → Cámara → Permitir. |
| No lee el código | Acerque o aleje un poco el teléfono, use buena luz y mantenga el código derecho dentro del recuadro. Si no se puede, escríbalo a mano. |
| Hice cambios al código de la app y no se ven | Suba el número de `VERSION` en `sw.js`, publique, y cierre y abra la app dos veces. |

---

## 🛠️ Para programadores

Sin dependencias ni compilación: HTML, CSS y JavaScript puro.

```
index.html             Pantallas de la app
css/styles.css         Tema oscuro (negro + azul marino)
js/app.js              Lógica: datos, escáner, búsqueda, categorías, respaldo
sw.js                  Service worker: guarda la app para usarla sin internet
manifest.webmanifest   Nombre, ícono y colores para instalarla
lib/zxing.min.js       Lector de códigos de barras ZXing (licencia en lib/ZXING-LICENSE)
icons/                 Íconos de la app
```

- **Datos**: `localStorage` (clave `abarroterias_san_vicenta_v1`), con `navigator.storage.persist()`
  para que el navegador no los borre automáticamente.
- **Escáner**: usa el lector nativo del teléfono (`BarcodeDetector`) si existe; si no (por ejemplo en
  iPhone), usa ZXing incluido en la app, así funciona sin internet. Lee EAN-13, EAN-8, UPC-A,
  UPC-E, Code 128, Code 39, Code 93, ITF, Codabar y QR.
- **Probar en la computadora**: en la carpeta del proyecto ejecute `python3 -m http.server 8000`
  y abra `http://localhost:8000`.
