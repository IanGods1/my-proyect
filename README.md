# 🛒 Abarroterías San Vicenta

App para el teléfono que lleva el control de precios de la abarrotería.
Sirve para escanear códigos de barras, guardar precios de venta y de costo, anotar el proveedor
y ordenar todo por categorías.

- **Administradores** 👑: control total (productos, categorías, usuarios, respaldos).
- **Trabajadores** 👤: solo **escanean, buscan y ven precios** (venta, costo y proveedor).
- **Datos compartidos**: los precios se guardan en la nube (Firebase). Si un administrador cambia
  un precio, todos los teléfonos lo ven en segundos.
- **Funciona sin internet**: cada teléfono guarda una copia de los precios. Los cambios hechos
  sin señal se suben solos cuando vuelve el internet.

Dirección de la app: **https://iangods1.github.io/my-proyect/**

---

## ⚙️ Puesta en marcha (una sola vez)

Firebase ya está creado (proyecto **abarroterias-san-vicenta**, plan gratis Spark).
Solo falta:

### 1. Pegar las reglas de seguridad en Firebase
Sin este paso la app no puede leer ni guardar nada.

1. Abra `firestore.rules` (en este repositorio) y copie **todo** el texto.
2. Entre a **console.firebase.google.com** → su proyecto → menú ☰ → **Bases de datos y almacenamiento → Firestore**.
3. Arriba, toque la pestaña **Reglas**.
4. Borre todo lo que hay y pegue el texto copiado.
5. Toque **Publicar**.

### 2. Publicar la app
Dele **Merge** al *pull request* en GitHub. En 1 o 2 minutos la app se actualiza sola en
`https://iangods1.github.io/my-proyect/`.

### 3. Crear el administrador principal
1. Abra la app (si ya la tenía instalada, ciérrela y ábrala **dos veces** para que se actualice).
2. Como es la primera vez, le pedirá **crear el administrador principal**: su nombre, un usuario
   (por ejemplo `vicenta`) y una contraseña.
3. Si en ese teléfono tenía productos guardados con la versión anterior, la app le preguntará si
   desea **subirlos a la nube**. Toque **Subir a la nube**.

> Hágalo usted primero: la primera persona que abra la app nueva será la dueña.

---

## 👥 Usuarios

### Entrar
Al abrir la app se elige **👑 Administrador** o **👤 Trabajador**, y se escribe usuario y contraseña.
La sesión queda abierta en ese teléfono hasta que se toque **Cerrar sesión** (en ⚙️ Ajustes).

### Agregar trabajadores o administradores (solo administradores)
⚙️ **Ajustes → Usuarios → ＋ Agregar usuario**: elija el tipo, escriba nombre, usuario y contraseña.
Pásele a la persona su **usuario** y **contraseña**. Puede haber varios administradores.

### Opciones de cada usuario
En ⚙️ Ajustes → Usuarios, toque a la persona:
- **🔑 Cambiar contraseña**: la persona entra con el mismo usuario y la contraseña nueva.
  Si tenía la app abierta, se le cierra la sesión.
- **👑/👤 Cambiar tipo**: convertir en administrador o en trabajador.
- **⛔ Desactivar**: ya no puede entrar (por ejemplo, si dejó de trabajar). Se le cierra la sesión
  al momento. Se puede **✅ Activar de nuevo** cuando quiera.

Cada persona puede cambiar su propia contraseña en ⚙️ **Ajustes → Cambiar mi contraseña**.

---

## 🧾 Cómo usar la app

### 📷 Escanear
- Toque **Escanear código** y apunte al código de barras (también se puede escribir a mano).
  - **Producto registrado**: se ven sus datos (precio de venta, costo, ganancia, proveedor).
  - **Producto nuevo**:
    - Administrador: se abre el formulario para registrarlo.
    - Trabajador: le sale **"Producto no registrado – avise al administrador"**.

### 📋 Productos
- Lista con nombre, precio de venta y categoría. **Buscador** por nombre o código (los resultados
  aparecen mientras escribe) y **filtro por categoría**.
- Administradores: ✏️ editar, 🗑️ eliminar y botón **＋** para agregar.

### 🏷️ Categorías (solo administradores)
Crear, cambiar nombre y eliminar. Al eliminar una categoría, sus productos quedan como "Sin categoría".

### 💾 Respaldo (solo administradores, en ⚙️ Ajustes)
Los datos ya están en la nube, pero puede guardar una copia en un archivo
(**Guardar respaldo**) y cargarla después (**Cargar respaldo**).

---

## 💰 Costo
Plan **Spark (gratis)**, sin tarjeta. Para una tienda alcanza de sobra:
50,000 lecturas y 20,000 cambios por día, y 1 GB de datos.

Cada vez que un teléfono abre la app después de más de media hora, vuelve a leer la lista de
productos (por ejemplo: 1,000 productos = 1,000 lecturas). Con 5 teléfonos abriendo la app
varias veces al día se queda dentro de lo gratis; si la tienda crece mucho, se puede revisar.

---

## ❓ Problemas comunes

| Problema | Solución |
|---|---|
| "Ese usuario no existe" | Revise cómo lo escribió (sin espacios). Pídale al administrador que lo revise en Ajustes → Usuarios. |
| "Este usuario es Trabajador" | Regrese y toque el botón correcto (Administrador o Trabajador). |
| "No hay internet" al entrar | La primera vez que se entra en un teléfono se necesita internet. Después ya funciona sin señal. |
| No se cargan los productos | Revise que las reglas de seguridad estén publicadas (Puesta en marcha, paso 1). |
| La cámara no abre | Entre por la dirección `https://`. En iPhone: Ajustes → Safari → Cámara → Permitir. |
| No veo los cambios de la app | Cierre la app y ábrala dos veces. |

---

## 🛠️ Para programadores

HTML, CSS y JavaScript sin compilación. Firebase va incluido en `lib/firebase.js`
(paquete `firebase` 12, generado con esbuild) para que la app funcione sin internet.

```
index.html             Pantallas (acceso, escanear, productos, categorías, ajustes)
css/styles.css         Tema oscuro (negro + azul marino)
js/app.js              Lógica: sesión y roles, datos en Firestore, pantallas, usuarios, respaldo
js/escaner.js          Lector de códigos (BarcodeDetector nativo o ZXing)
firestore.rules        Reglas de seguridad (pegar en la consola de Firebase)
sw.js                  Service worker: guarda la app para usarla sin internet
lib/firebase.js        Firebase (app, auth, firestore)
lib/zxing.min.js       ZXing (licencia en lib/ZXING-LICENSE)
```

**Modelo de datos (Firestore)**
- `usuarios/{uid}`: `nombre`, `usuario`, `rol` (`admin`/`trabajador`), `activo`.
- `acceso/{usuario}`: correo interno con el que se inicia sesión (`usuario@sanvicenta.app`).
- `config/inicial`: existe cuando ya se creó el administrador principal.
- `productos/{id}` y `categorias/{id}`.

**Contraseñas en el plan gratis**: el cliente no puede cambiar la contraseña de otra cuenta.
Para "cambiar la contraseña" de alguien se crea una cuenta nueva con el mismo usuario,
se actualiza `acceso/{usuario}` y la cuenta anterior queda con `activo: false`.

**Probar en la computadora** con los emuladores de Firebase:
```
firebase emulators:start --only auth,firestore --project demo-san-vicenta
python3 -m http.server 8765      # y abrir http://localhost:8765/?emulador
```
