/* ============================================================
   Abarroterías VC — Control de precios
   - Administradores: control total (productos, categorías, usuarios).
   - Trabajadores: solo escanean, buscan y ven precios.
   - Los datos se guardan en Firebase (nube) y se comparten entre
     teléfonos. Cada teléfono guarda una copia para usarla sin internet.
   ============================================================ */
import * as fb from '../lib/firebase.js';
import { Escaner } from './escaner.js';

/* ---------------- Configuración de Firebase ---------------- */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDf63TILKbmu-_sDY2wu9lF5fW5Jca2YaE',
  authDomain: 'abarroterias-san-vicenta.firebaseapp.com',
  projectId: 'abarroterias-san-vicenta',
  storageBucket: 'abarroterias-san-vicenta.firebasestorage.app',
  messagingSenderId: '1002896029601',
  appId: '1:1002896029601:web:0b33bee0d9926439197de0',
};
// Los usuarios entran con un nombre (ej. "maria"); por dentro Firebase usa un correo interno.
const DOMINIO_CORREO = 'sanvicenta.app';

// Solo para pruebas en computadora: abrir con ?emulador
const USAR_EMULADOR = new URLSearchParams(location.search).has('emulador');
const CONFIG = USAR_EMULADOR ? { ...FIREBASE_CONFIG, projectId: 'demo-san-vicenta', apiKey: 'demo' } : FIREBASE_CONFIG;

const appFirebase = fb.initializeApp(CONFIG);
const auth = fb.initializeAuth(appFirebase, {
  persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence],
});
let db;
try {
  db = fb.initializeFirestore(appFirebase, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('Sin copia local de datos', e);
  db = fb.initializeFirestore(appFirebase, {});
}
if (USAR_EMULADOR) {
  fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

/** Segunda conexión, solo para crear cuentas sin cerrar la sesión del administrador. */
let authSecundaria = null;
function obtenerAuthSecundaria() {
  if (!authSecundaria) {
    const app2 = fb.initializeApp(CONFIG, 'secundaria');
    authSecundaria = fb.initializeAuth(app2, { persistence: fb.inMemoryPersistence });
    if (USAR_EMULADOR) fb.connectAuthEmulator(authSecundaria, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return authSecundaria;
}

/* Sucursales: cada una tiene su propia lista de productos y categorías en
   sucursales/{sucursal}/productos y sucursales/{sucursal}/categorias */
const SUCURSALES_INICIALES = [{ id: 'guastatoya', nombre: 'Guastatoya', orden: 1 }, { id: 'nebaj', nombre: 'Nebaj', orden: 2 }];
const CLAVE_SUCURSAL = 'abarroterias_vc_sucursal'; // última sucursal elegida por un administrador en este teléfono
let sucursalActual = 'guastatoya';
const RUTAS_DE_SUCURSAL = ['productos', 'categorias'];
const enSucursal = (ruta) => (RUTAS_DE_SUCURSAL.includes(ruta[0]) ? ['sucursales', sucursalActual, ...ruta] : ruta);
const refDoc = (...ruta) => fb.doc(db, ...enSucursal(ruta));
const refColeccion = (nombre) => fb.collection(db, ...enSucursal([nombre]));

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);
/** Ícono de línea del juego de íconos de index.html (#i-nombre). */
const ico = (nombre, clase = '') => `<svg class="ico${clase ? ' ' + clase : ''}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const formatoQ = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function q(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return 'Q ' + formatoQ.format(n);
}

/** Quita tildes y pasa a minúsculas para buscar sin importar acentos. */
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function limpiarCodigo(codigo) {
  return String(codigo ?? '').replace(/\s+/g, '').trim();
}

/** Convierte "12,50" o "12.50" en número. Devuelve null si está vacío y NaN si es inválido. */
function leerPrecio(texto) {
  const t = String(texto ?? '').trim().replace(/\s/g, '').replace(/^Q/i, '').replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(t)) return NaN;
  return Math.round(parseFloat(t) * 100) / 100;
}

/** Nombre de usuario: minúsculas, sin tildes ni espacios. */
function normalizarUsuario(texto) {
  return normalizar(texto).replace(/\s+/g, '');
}
const USUARIO_VALIDO = /^[a-z0-9._]{3,20}$/;

function correoPara(usuario, version = 0) {
  return version ? `${usuario}.${version}@${DOMINIO_CORREO}` : `${usuario}@${DOMINIO_CORREO}`;
}

function aviso(mensaje) {
  const el = $('#aviso');
  el.textContent = mensaje;
  el.classList.add('visible');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => el.classList.remove('visible'), 2400);
}

function mensajeError(e) {
  const c = (e && e.code) || '';
  if (c.includes('permission-denied')) return 'No tiene permiso para hacer esto.';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (c === 'auth/network-request-failed' || c === 'unavailable' || c.includes('offline')) {
    return 'No hay internet. Revise su conexión e intente de nuevo.';
  }
  if (c === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
  if (c === 'auth/requires-recent-login') return 'Por seguridad, cierre sesión, vuelva a entrar e intente de nuevo.';
  if (e && /offline/i.test(e.message || '')) return 'No hay internet. Revise su conexión e intente de nuevo.';
  return 'Ocurrió un error: ' + ((e && e.message) || e);
}

/**
 * Guarda en la nube sin esperar: si no hay internet, el cambio queda en el
 * teléfono y se sube solo cuando vuelva la señal.
 */
function enNube(promesa, titulo = 'No se pudo guardar') {
  promesa.catch((e) => {
    console.error(e);
    alerta(titulo, mensajeError(e));
  });
}

/* ---------------- Datos ---------------- */
const CATEGORIAS_INICIALES = ['Bebidas', 'Lácteos', 'Snacks', 'Limpieza', 'Granos básicos'];
const CLAVE_DATOS_ANTERIORES = 'abarroterias_san_vicenta_v1'; // versión sin nube (solo en el teléfono)
const CLAVE_MIGRADO = 'abarroterias_san_vicenta_migrado';

const datos = { categorias: [], productos: [], usuarios: [], sucursales: [] };
const cargado = { productos: false, categorias: false };

const categoriaPorId = (id) => datos.categorias.find((c) => c.id === id);
const nombreCategoria = (id) => categoriaPorId(id)?.nombre || 'Sin categoría';
const productoPorId = (id) => datos.productos.find((p) => p.id === id);

/**
 * Busca un producto por código. También prueba las variantes UPC-A (12 dígitos)
 * y EAN-13 (13 dígitos con 0 adelante), porque algunas cámaras leen el mismo
 * código de las dos formas.
 */
function productoPorCodigo(codigo, excluirId) {
  const c = limpiarCodigo(codigo);
  if (!c) return null;
  const variantes = new Set([c]);
  if (/^\d{12}$/.test(c)) variantes.add('0' + c);
  if (/^0\d{12}$/.test(c)) variantes.add(c.slice(1));
  return datos.productos.find((p) => p.id !== excluirId && variantes.has(p.codigo)) || null;
}

function ordenarPorNombre(lista) {
  return lista.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
}

/** Pone o reemplaza un elemento en la lista local (antes de que responda la nube). */
function ponerLocal(lista, elemento) {
  const i = lista.findIndex((x) => x.id === elemento.id);
  if (i >= 0) lista[i] = { ...lista[i], ...elemento };
  else lista.push(elemento);
}

/** Escribe muchos documentos en grupos de 400 (límite de Firebase: 500). */
async function escribirEnGrupos(operaciones) {
  for (let i = 0; i < operaciones.length; i += 400) {
    const lote = fb.writeBatch(db);
    operaciones.slice(i, i + 400).forEach((op) => op(lote));
    await lote.commit();
  }
}

/* ---------------- Sesión ---------------- */
let sesion = null; // { uid, nombre, usuario, rol }
const esAdmin = () => sesion?.rol === 'admin';
let suscripciones = [];
let suscripcionUsuario = null;
let rolElegido = null; // botón que tocó al entrar (admin / trabajador)
let creandoPrimerAdmin = false;
let accesoPendiente = null; // { rol, error } para mostrar después de cerrar sesión
let appIniciada = false;

function quitarSuscripciones() {
  suscripciones.forEach((u) => u());
  suscripciones = [];
}

fb.onAuthStateChanged(auth, (usuario) => {
  if (suscripcionUsuario) { suscripcionUsuario(); suscripcionUsuario = null; }
  quitarSuscripciones();
  if (!usuario) {
    sesion = null;
    appIniciada = false;
    mostrarAcceso();
    return;
  }
  // Escuchar los datos de la persona: si la desactivan, se cierra su sesión al momento
  suscripcionUsuario = fb.onSnapshot(refDoc('usuarios', usuario.uid), { includeMetadataChanges: true }, (snap) => {
    if (!snap.exists()) {
      if (creandoPrimerAdmin || snap.metadata.fromCache) return; // esperar a la nube
      cerrarSesion({ error: 'Este usuario no está registrado en la app.' });
      return;
    }
    // Esperar a que la nube confirme (ej. recién creado el administrador principal)
    if (snap.metadata.hasPendingWrites) return;
    const u = snap.data();
    if (!u.activo) {
      cerrarSesion({
        error: u.reemplazadoPor
          ? 'Su contraseña fue cambiada. Entre con la contraseña nueva.'
          : 'Su usuario fue desactivado. Hable con el administrador.',
      });
      return;
    }
    if (rolElegido && u.rol !== rolElegido) {
      const correcto = u.rol === 'admin' ? 'Administrador' : 'Trabajador';
      cerrarSesion({ rol: rolElegido, error: `Este usuario es ${correcto}. Regrese y toque "${correcto}".` });
      return;
    }
    rolElegido = null;
    const rolAnterior = sesion?.rol;
    const sucursalAnterior = sesion?.sucursalId;
    sesion = { uid: usuario.uid, email: usuario.email, nombre: u.nombre, usuario: u.usuario, rol: u.rol, sucursalId: u.sucursalId || 'guastatoya' };
    // Trabajadores: siempre en su sucursal. Administradores: la última que eligieron en este teléfono.
    if (sesion.rol !== 'admin') sucursalActual = sesion.sucursalId;
    else if (!appIniciada || rolAnterior !== 'admin') {
      try { sucursalActual = localStorage.getItem(CLAVE_SUCURSAL) || 'guastatoya'; } catch (_) { sucursalActual = 'guastatoya'; }
    }
    if (!appIniciada) iniciarSesionEnApp();
    else if (rolAnterior !== sesion.rol) { aviso('Su tipo de usuario cambió'); reiniciarApp(); }
    else if (sesion.rol !== 'admin' && sucursalAnterior !== sesion.sucursalId) { aviso('Le cambiaron de sucursal'); reiniciarApp(); }
    else actualizarChipUsuario();
  }, (error) => {
    console.error(error);
    if (error.code === 'permission-denied') cerrarSesion({ error: 'Este usuario no tiene acceso.' });
  });
});

async function cerrarSesion(pendiente = null) {
  accesoPendiente = pendiente;
  rolElegido = null;
  try { await fb.signOut(auth); } catch (e) { console.error(e); }
}

function actualizarChipUsuario() {
  if (!sesion) return;
  // Administradores: la sucursal (se toca para cambiarla). Trabajadores: su nombre (no ven la sucursal).
  $('#chip-usuario').innerHTML = esAdmin()
    ? ico('ubicacion') + esc(nombreSucursal()) + ico('abajo', 'chip-flecha')
    : ico('usuario') + esc(String(sesion.nombre).split(' ')[0]);
  $('#chip-usuario').classList.toggle('chip-sucursal', esAdmin());
  document.body.classList.toggle('rol-admin', esAdmin());
  document.body.classList.toggle('rol-trabajador', !esAdmin());
}

function iniciarSesionEnApp() {
  appIniciada = true;
  document.body.classList.remove('sin-sesion');
  $('#pantalla-cargando').classList.add('oculto');
  $('#pantalla-acceso').classList.add('oculto');
  actualizarChipUsuario();
  suscribirDatos();
  history.replaceState({ vista: 'escanear' }, '');
  mostrar({ vista: 'escanear' });
  if (esAdmin()) prepararSucursales().then(() => setTimeout(ofrecerMigracion, 1500));
}

function reiniciarApp() {
  quitarSuscripciones();
  actualizarChipUsuario();
  suscribirDatos();
  irAPestana('escanear');
}

function suscribirDatos() {
  cargado.productos = false;
  cargado.categorias = false;
  datos.usuarios = [];
  escuchar('productos', (snap) => {
    datos.productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cargado.productos = true;
  });
  escuchar('categorias', (snap) => {
    datos.categorias = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cargado.categorias = true;
  });
  escuchar('sucursales', (snap) => {
    datos.sucursales = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
    actualizarChipUsuario();
  });
  if (esAdmin()) {
    escuchar('usuarios', (snap) => {
      datos.usuarios = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    });
  }
}

/** Escucha una colección en tiempo real; si la nube la rechaza (ej. permisos recién dados), reintenta. */
function escuchar(coleccion, alRecibir, intento = 0) {
  const uidActual = sesion?.uid;
  let quitar = null;
  const quitarEste = () => { if (quitar) quitar(); };
  suscripciones.push(quitarEste);
  quitar = fb.onSnapshot(refColeccion(coleccion), (snap) => {
    intento = 0;
    alRecibir(snap);
    refrescarVista();
  }, (e) => {
    console.warn(`No se pudo leer ${coleccion}`, e.code);
    quitar = null;
    if (sesion?.uid !== uidActual || !suscripciones.includes(quitarEste)) return;
    if (intento < 5) setTimeout(() => {
      if (sesion?.uid !== uidActual || !suscripciones.includes(quitarEste)) return;
      suscripciones = suscripciones.filter((x) => x !== quitarEste);
      escuchar(coleccion, alRecibir, intento + 1);
    }, 2000 * (intento + 1));
    else if (e.code === 'permission-denied') aviso('Sin permiso para ver los datos');
  });
}

/** Vuelve a dibujar la pantalla actual cuando llegan datos nuevos (menos el formulario). */
function refrescarVista() {
  const estado = history.state || {};
  if (!sesion || estado.escaner) return;
  if (estado.vista === 'formulario') { llenarSelectCategorias($('#f-categoria').value); return; }
  if (estado.vista === 'factura') return; // no borrar lo que está revisando
  mostrar(estado, { sinScroll: true });
}

/* ---------------- Sucursales ---------------- */
function nombreSucursal(id = sucursalActual) {
  const s = datos.sucursales.find((x) => x.id === id) || SUCURSALES_INICIALES.find((x) => x.id === id);
  return s ? s.nombre : id;
}

/**
 * La primera vez que un administrador abre esta versión: crea Guastatoya y Nebaj,
 * pasa los productos que ya había a Guastatoya y copia las categorías a las dos.
 * Los datos de antes no se borran (quedan de respaldo).
 */
async function prepararSucursales() {
  try {
    const conf = await fb.getDoc(fb.doc(db, 'config', 'sucursales'));
    if (conf.exists() || conf.metadata.fromCache) return; // ya está hecho, o sin internet (se intenta después)
    const [prods, cats] = await Promise.all([
      fb.getDocs(fb.collection(db, 'productos')),
      fb.getDocs(fb.collection(db, 'categorias')),
    ]);
    if (prods.metadata.fromCache || cats.metadata.fromCache) return;
    aviso('Preparando sucursales…');
    const ahora = new Date().toISOString();
    const categorias = cats.docs.length
      ? cats.docs.map((d) => ({ id: d.id, nombre: d.data().nombre }))
      : CATEGORIAS_INICIALES.map((nombre) => ({ id: fb.doc(fb.collection(db, 'categorias')).id, nombre }));
    const ops = SUCURSALES_INICIALES.map((s) => (l) => l.set(fb.doc(db, 'sucursales', s.id), { nombre: s.nombre, orden: s.orden, creado: ahora }));
    prods.docs.forEach((d) => ops.push((l) => l.set(fb.doc(db, 'sucursales', 'guastatoya', 'productos', d.id), d.data())));
    SUCURSALES_INICIALES.forEach((s) => categorias.forEach((c) =>
      ops.push((l) => l.set(fb.doc(db, 'sucursales', s.id, 'categorias', c.id), { nombre: c.nombre }))));
    ops.push((l) => l.set(fb.doc(db, 'config', 'sucursales'), { migrado: true, fecha: ahora, productosPasados: prods.size }));
    await escribirEnGrupos(ops);
    aviso(prods.size ? `${prods.size} productos pasaron a Guastatoya` : 'Sucursales listas');
  } catch (e) {
    console.error(e);
    const causa = e && String(e.code || '').includes('permission-denied')
      ? 'Faltan las reglas de seguridad nuevas en Firebase (Firestore → Reglas → pegar y Publicar).'
      : mensajeError(e);
    alerta('No se pudieron preparar las sucursales', causa + ' Se intentará de nuevo la próxima vez que abra la app.');
  }
}

/** Solo administradores: ver y trabajar con otra sucursal. */
function cambiarSucursal(id) {
  if (!esAdmin() || id === sucursalActual) return;
  sucursalActual = id;
  try { localStorage.setItem(CLAVE_SUCURSAL, id); } catch (_) { /* nada */ }
  quitarSuscripciones();
  datos.productos = [];
  datos.categorias = [];
  filtroCategoria = 'todas';
  suscribirDatos();
  actualizarChipUsuario();
  aviso(`Sucursal: ${nombreSucursal(id)}`);
  const vista = (history.state || {}).vista;
  irAPestana(PESTANAS.includes(vista) ? vista : 'escanear');
}

async function elegirSucursal() {
  if (!esAdmin()) return;
  const lista = datos.sucursales.length ? datos.sucursales : SUCURSALES_INICIALES;
  const id = await modal({
    titulo: 'Cambiar de sucursal',
    html: `<p>Cada sucursal tiene sus propios productos y precios.</p>
      <div class="lista-sucursales">${lista.map((s) => `
        <button type="button" class="opcion-sucursal ${s.id === sucursalActual ? 'activa' : ''}" data-suc="${esc(s.id)}">
          ${ico('ubicacion')}<span>${esc(s.nombre)}</span>${s.id === sucursalActual ? ico('guardar', 'marca') : ''}
        </button>`).join('')}</div>`,
    botones: [{ texto: 'Cerrar', clase: 'btn-secundario', valor: null }],
    alAbrir: (cerrar) => {
      $$('#modal-cuerpo [data-suc]').forEach((b) => b.addEventListener('click', () => cerrar(b.dataset.suc)));
    },
  });
  if (id) cambiarSucursal(id);
}

function renderSucursales() {
  const lista = datos.sucursales.length ? datos.sucursales : SUCURSALES_INICIALES;
  $('#lista-sucursales').innerHTML = lista.map((s) => `
    <li class="item ${s.id === sucursalActual ? 'sucursal-actual' : ''}">
      <div class="item-info" data-suc="${esc(s.id)}">
        <div class="item-nombre">${ico('ubicacion')} ${esc(s.nombre)}</div>
        <div class="item-sub">${s.id === sucursalActual ? 'Está viendo esta sucursal' : 'Toque para cambiarse a esta sucursal'}</div>
      </div>
    </li>`).join('');
}

async function agregarSucursal() {
  const nombre = (await pedirTexto('Nueva sucursal', '', 'Ej. Sanarate') || '').trim().replace(/\s+/g, ' ');
  if (!nombre) return;
  const id = normalizar(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) return;
  if (datos.sucursales.some((s) => s.id === id || normalizar(s.nombre) === normalizar(nombre))) {
    alerta('Sucursal repetida', `Ya existe una sucursal llamada "${nombre}".`);
    return;
  }
  // La sucursal nueva empieza sin productos y con las mismas categorías que la actual
  const ops = [(l) => l.set(fb.doc(db, 'sucursales', id), { nombre, orden: datos.sucursales.length + 1, creado: new Date().toISOString() })];
  datos.categorias.forEach((c) => ops.push((l) => l.set(fb.doc(db, 'sucursales', id, 'categorias', c.id), { nombre: c.nombre })));
  try {
    await escribirEnGrupos(ops);
    aviso(`Sucursal "${nombre}" creada`);
  } catch (e) {
    console.error(e);
    alerta('No se pudo crear la sucursal', mensajeError(e));
  }
}

/** Para elegir la sucursal de un trabajador. */
function opcionesDeSucursal(seleccion) {
  const lista = datos.sucursales.length ? datos.sucursales : SUCURSALES_INICIALES;
  return lista.map((s) => `<option value="${esc(s.id)}" ${s.id === seleccion ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('');
}

/* ---------------- Pantalla de acceso ---------------- */
async function mostrarAcceso() {
  document.body.classList.add('sin-sesion');
  document.body.classList.remove('rol-admin', 'rol-trabajador');
  $('#pantalla-cargando').classList.add('oculto');
  $('#pantalla-acceso').classList.remove('oculto');
  cerrarModal();
  Escaner.detener();
  $('#escaner').classList.add('oculto');

  const pendiente = accesoPendiente;
  accesoPendiente = null;
  if (pendiente && pendiente.rol) {
    mostrarPasoAcceso('login', pendiente.rol);
    $('#login-error').textContent = pendiente.error || '';
    return;
  }
  mostrarPasoAcceso('elegir');
  if (pendiente && pendiente.error) alerta('Sesión cerrada', pendiente.error);

  // ¿Es la primera vez? (todavía no hay administrador principal)
  try {
    const inicial = await fb.getDoc(refDoc('config', 'inicial'));
    if (!inicial.exists() && !sesion) mostrarPasoAcceso('primer-admin');
  } catch (e) {
    console.warn('No se pudo revisar la configuración inicial', e);
  }
}

function mostrarPasoAcceso(paso, rol) {
  $('#acceso-elegir').classList.toggle('oculto', paso !== 'elegir');
  $('#form-login').classList.toggle('oculto', paso !== 'login');
  $('#form-primer-admin').classList.toggle('oculto', paso !== 'primer-admin');
  if (paso === 'login') {
    $('#form-login').dataset.rol = rol;
    $('#login-titulo').innerHTML = rol === 'admin' ? ico('corona') + ' Entrar como Administrador' : ico('usuario') + ' Entrar como Trabajador';
    $('#login-error').textContent = '';
    $('#login-clave').value = '';
    setTimeout(() => $('#login-usuario').focus(), 100);
  }
}

async function iniciarSesion(e) {
  e.preventDefault();
  const rol = $('#form-login').dataset.rol;
  const usuario = normalizarUsuario($('#login-usuario').value);
  const clave = $('#login-clave').value;
  const error = (msg) => { $('#login-error').textContent = msg; };
  if (!usuario) return error('Escriba su usuario.');
  if (!clave) return error('Escriba su contraseña.');

  const boton = $('#form-login button[type=submit]');
  boton.disabled = true;
  boton.textContent = 'Entrando…';
  try {
    const acceso = await fb.getDoc(refDoc('acceso', usuario));
    if (!acceso.exists()) return error('Ese usuario no existe. Revise cómo lo escribió.');
    rolElegido = rol;
    await fb.signInWithEmailAndPassword(auth, acceso.data().email, clave);
  } catch (err) {
    rolElegido = null;
    console.error(err);
    error(mensajeError(err));
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
}

async function crearPrimerAdmin(e) {
  e.preventDefault();
  const nombre = $('#pa-nombre').value.trim().replace(/\s+/g, ' ');
  const usuario = normalizarUsuario($('#pa-usuario').value);
  const clave = $('#pa-clave').value;
  const error = (msg) => { $('#pa-error').textContent = msg; };
  if (!nombre) return error('Escriba su nombre.');
  if (!USUARIO_VALIDO.test(usuario)) return error('El usuario debe tener de 3 a 20 letras o números, sin espacios.');
  if (clave.length < 6) return error('La contraseña debe tener al menos 6 caracteres.');
  if (clave !== $('#pa-clave2').value) return error('Las contraseñas no coinciden.');

  const boton = $('#form-primer-admin button[type=submit]');
  boton.disabled = true;
  boton.textContent = 'Creando…';
  creandoPrimerAdmin = true;
  try {
    const email = correoPara(usuario);
    const cred = await fb.createUserWithEmailAndPassword(auth, email, clave);
    const uid = cred.user.uid;
    const lote = fb.writeBatch(db);
    lote.set(refDoc('usuarios', uid), { nombre, usuario, rol: 'admin', activo: true, creado: new Date().toISOString() });
    lote.set(refDoc('acceso', usuario), { email, uid });
    lote.set(refDoc('config', 'inicial'), { uid, fecha: new Date().toISOString() });
    await lote.commit();
    creandoPrimerAdmin = false;
    // Las sucursales y sus categorías iniciales las crea prepararSucursales() al entrar
  } catch (err) {
    console.error(err);
    error(err.code === 'auth/email-already-in-use' ? 'Ese usuario ya existe. Elija otro.' : mensajeError(err));
    if (auth.currentUser) await cerrarSesion();
  } finally {
    creandoPrimerAdmin = false;
    boton.disabled = false;
    boton.textContent = 'Crear y entrar';
  }
}

/* ---------------- Ventanas emergentes ---------------- */
const MANTENER_ABIERTA = Symbol('mantener');
let cerrarModalActual = null;

/**
 * Muestra una ventana con botones. Cada botón puede tener:
 * - valor: lo que devuelve al tocarlo
 * - accion: función (puede ser async); si devuelve MANTENER_ABIERTA, la ventana sigue abierta
 */
function modal({ titulo, html = '', botones, alAbrir }) {
  cerrarModal();
  return new Promise((resolver) => {
    const caja = $('#modal');
    $('#modal-titulo').textContent = titulo;
    $('#modal-cuerpo').innerHTML = html;
    const cont = $('#modal-botones');
    cont.innerHTML = '';
    const cerrar = (valor) => {
      caja.classList.add('oculto');
      cerrarModalActual = null;
      resolver(valor);
    };
    cerrarModalActual = () => cerrar(null);
    botones.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.clase || 'btn-secundario');
      btn.textContent = b.texto;
      btn.addEventListener('click', async () => {
        if (!b.accion) return cerrar(b.valor);
        const botonesModal = $$('#modal-botones .btn');
        botonesModal.forEach((x) => { x.disabled = true; });
        try {
          const r = await b.accion();
          if (r !== MANTENER_ABIERTA) cerrar(r);
        } finally {
          botonesModal.forEach((x) => { x.disabled = false; });
        }
      });
      cont.appendChild(btn);
    });
    // Si hay casillas para escribir, la ventana va arriba (el teclado del teléfono no la tapa)
    caja.classList.toggle('con-teclado', !!$('#modal-cuerpo').querySelector('input:not([type=checkbox]), textarea'));
    caja.classList.remove('oculto');
    if (alAbrir) alAbrir(cerrar);
  });
}

function cerrarModal() {
  if (cerrarModalActual) cerrarModalActual();
}

function alerta(titulo, mensaje) {
  return modal({ titulo, html: `<p>${esc(mensaje)}</p>`, botones: [{ texto: 'Entendido', clase: 'btn-primario', valor: true }] });
}

function confirmar(titulo, mensaje, textoSi = 'Sí', peligro = false) {
  return modal({
    titulo,
    html: `<p>${esc(mensaje)}</p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: false },
      { texto: textoSi, clase: peligro ? 'btn-peligro' : 'btn-primario', valor: true },
    ],
  });
}

function pedirTexto(titulo, valorInicial = '', placeholder = '') {
  return modal({
    titulo,
    html: `<input id="modal-input" class="input" type="text" maxlength="40" placeholder="${esc(placeholder)}" value="${esc(valorInicial)}">`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      { texto: 'Guardar', clase: 'btn-primario', accion: () => $('#modal-input').value.trim() },
    ],
    alAbrir: (cerrar) => {
      const input = $('#modal-input');
      input.focus();
      input.select();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cerrar(input.value.trim()); }
      });
    },
  });
}

/* ---------------- Escáner ---------------- */
/**
 * Abre la cámara.
 * - reemplazar = true: al leer, la pantalla del escáner se reemplaza por la siguiente (ej. detalle).
 * - reemplazar = false: al leer, se regresa a la pantalla anterior (ej. formulario).
 */
async function abrirEscaner(alLeer, { reemplazar = false } = {}) {
  const pantalla = $('#escaner');
  pantalla.classList.remove('oculto');
  history.pushState({ ...(history.state || {}), escaner: true }, '');
  Escaner.conHistorial = true;

  try {
    await Escaner.iniciar((codigo) => {
      pantalla.classList.add('oculto');
      if (reemplazar) {
        Escaner.conHistorial = false;
        alLeer(codigo);
      } else {
        salirDelEscanerEnHistorial();
        alLeer(codigo);
      }
    });
  } catch (error) {
    const yaCancelado = pantalla.classList.contains('oculto');
    cerrarEscaner();
    if (yaCancelado) return;
    let mensaje = 'No se pudo abrir la cámara. Escriba el código a mano.';
    if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
      mensaje = 'No hay permiso para usar la cámara. Actívelo en la configuración del navegador (permisos del sitio → Cámara) o escriba el código a mano.';
    } else if (error && error.name === 'NotFoundError') {
      mensaje = 'No se encontró una cámara en este teléfono. Escriba el código a mano.';
    } else if (error && error.message === 'sin-soporte') {
      mensaje = 'La cámara solo funciona si la app se abre desde una dirección segura (https://). Escriba el código a mano.';
    }
    alerta('Cámara no disponible', mensaje);
  }
}

let ignorarSiguientePop = false;
function salirDelEscanerEnHistorial() {
  if (Escaner.conHistorial) {
    Escaner.conHistorial = false;
    ignorarSiguientePop = true;
    history.back();
  }
}

function cerrarEscaner() {
  Escaner.detener();
  $('#escaner').classList.add('oculto');
  salirDelEscanerEnHistorial();
}

/* ---------------- Navegación ---------------- */
const TITULOS = {
  escanear: 'Escanear producto',
  productos: 'Lista de productos',
  categorias: 'Categorías',
  ajustes: 'Ajustes',
  detalle: 'Datos del producto',
  noregistrado: 'Producto no registrado',
  factura: 'Revisar factura',
  inventario: 'Inventario',
  formulario: 'Producto',
};
const PESTANAS = ['escanear', 'productos', 'inventario', 'categorias', 'ajustes'];
const SOLO_ADMIN = ['categorias', 'formulario', 'factura'];
let pestanaActual = 'escanear';

/** modo: 'push' (nueva pantalla), 'replace' (sustituye la actual) */
function navegar(estado, modo = 'push') {
  if (modo === 'push') history.pushState(estado, '');
  else history.replaceState(estado, '');
  mostrar(estado);
}

function irAPestana(vista) {
  // Las pestañas no se acumulan en el historial
  history.replaceState({ vista }, '');
  mostrar({ vista });
}

function mostrar(estado, { sinScroll = false } = {}) {
  if (!sesion) return;
  let vista = estado?.vista || 'escanear';
  if (SOLO_ADMIN.includes(vista) && !esAdmin()) vista = 'productos';
  if (vista === 'detalle' && cargado.productos && !productoPorId(estado.id)) vista = 'productos';
  if (vista === 'formulario' && estado.id && cargado.productos && !productoPorId(estado.id)) vista = 'productos';

  const seccion = vista === 'noregistrado' ? 'detalle' : vista;
  $$('.vista').forEach((v) => v.classList.add('oculto'));
  $('#vista-' + seccion).classList.remove('oculto');

  const esPestana = PESTANAS.includes(vista);
  if (esPestana) pestanaActual = vista;
  $$('.nav-btn').forEach((b) => b.classList.toggle('activo', b.dataset.vista === pestanaActual));
  $('#btn-atras').classList.toggle('oculto', esPestana);

  let titulo = TITULOS[vista];
  if (vista === 'formulario') titulo = estado.id ? 'Editar producto' : 'Nuevo producto';
  $('#titulo-vista').textContent = titulo;

  switch (vista) {
    case 'escanear': renderEscanear(); break;
    case 'productos': renderProductos(); break;
    case 'categorias': renderCategorias(); break;
    case 'ajustes': renderAjustes(); break;
    case 'detalle': renderDetalle(estado.id); break;
    case 'noregistrado': renderNoRegistrado(estado.codigo); break;
    case 'formulario': renderFormulario(estado); break;
    case 'factura': renderFactura(); break;
    case 'inventario': renderInventario(); break;
  }
  if (!sinScroll) window.scrollTo(0, 0);
}

window.addEventListener('popstate', (e) => {
  if (ignorarSiguientePop) { ignorarSiguientePop = false; return; }
  // Botón "atrás" del teléfono mientras la cámara está abierta
  if (!$('#escaner').classList.contains('oculto')) {
    Escaner.conHistorial = false;
    Escaner.detener();
    $('#escaner').classList.add('oculto');
    return;
  }
  cerrarModal();
  mostrar(e.state || { vista: pestanaActual });
});

/* ---------------- Pantalla: Escanear ---------------- */
function abrirCodigo(codigo, modo = 'push') {
  codigo = limpiarCodigo(codigo);
  if (!codigo) return;
  const existente = productoPorCodigo(codigo);
  if (existente) {
    navegar({ vista: 'detalle', id: existente.id }, modo);
  } else if (esAdmin()) {
    navegar({ vista: 'formulario', codigo }, modo);
    aviso('Producto nuevo: regístrelo');
  } else {
    navegar({ vista: 'noregistrado', codigo }, modo);
  }
}

function renderEscanear() {
  const total = datos.productos.length;
  const sinCosto = datos.productos.filter((p) => p.precioCosto === null || p.precioCosto === undefined).length;
  $('#resumen').innerHTML = !cargado.productos ? '<div class="resumen-item" style="grid-column:1/-1"><span>Cargando productos…</span></div>' : `
    <div class="resumen-item"><strong>${total}</strong><span>productos</span></div>
    <div class="resumen-item"><strong>${datos.categorias.length}</strong><span>categorías</span></div>
    ${sinCosto && esAdmin() ? `<div class="resumen-item" style="grid-column:1/-1"><span>${ico('alerta')} ${sinCosto} producto(s) sin precio de costo</span></div>` : ''}
  `;
}

/* ---------------- Pantalla: Lista de productos ---------------- */
let filtroCategoria = 'todas'; // 'todas' | 'sin' | id de categoría

function renderFiltros() {
  const hayHuerfanos = datos.productos.some((p) => !categoriaPorId(p.categoriaId));
  if (filtroCategoria !== 'todas' && filtroCategoria !== 'sin' && !categoriaPorId(filtroCategoria)) filtroCategoria = 'todas';
  if (filtroCategoria === 'sin' && !hayHuerfanos) filtroCategoria = 'todas';

  const chips = [{ id: 'todas', nombre: 'Todas' }, ...ordenarPorNombre([...datos.categorias])];
  if (hayHuerfanos) chips.push({ id: 'sin', nombre: 'Sin categoría' });
  $('#filtro-categorias').innerHTML = chips
    .map((c) => `<button class="chip ${c.id === filtroCategoria ? 'activo' : ''}" data-cat="${esc(c.id)}">${esc(c.nombre)}</button>`)
    .join('');
}

let modoBusqueda = 'nombre'; // 'nombre' | 'precio'

const NUMERO_PRECIO = '(\\d+(?:\\.\\d{0,2})?|\\.\\d{1,2})';
const PRECIO_SOLO = new RegExp(`^${NUMERO_PRECIO}$`);
const PRECIO_RANGO = new RegExp(`^${NUMERO_PRECIO}\\s*(?:-|a|hasta)\\s*${NUMERO_PRECIO}$`);

/**
 * Convierte lo escrito en el buscador de precio en un rango [mínimo, máximo]:
 * "8" → Q8.00 a Q8.99 · "8.50" → exacto · "5-10" o "5 a 10" → Q5.00 a Q10.00.
 * Devuelve null si no es un precio válido.
 */
function rangoDePrecio(texto) {
  const t = String(texto || '').toLowerCase().replace(/q/g, '').replace(/\s+/g, ' ').trim().replace(/,/g, '.');
  if (!t) return null;
  const rango = t.match(PRECIO_RANGO);
  if (rango) {
    let min = parseFloat(rango[1]);
    let max = parseFloat(rango[2]);
    if (min > max) [min, max] = [max, min];
    return [min, max];
  }
  const solo = t.match(PRECIO_SOLO);
  if (!solo) return null;
  const n = parseFloat(solo[1]);
  if (/\.\d/.test(solo[1])) return [n, n]; // con centavos: precio exacto
  return [n, n + 0.99];                    // sin centavos: todo ese quetzal
}

function productosFiltrados() {
  const escrito = $('#buscar').value;
  const enCategoria = (p) => {
    if (filtroCategoria === 'sin') return !categoriaPorId(p.categoriaId);
    if (filtroCategoria !== 'todas') return p.categoriaId === filtroCategoria;
    return true;
  };

  if (modoBusqueda === 'precio') {
    const rango = rangoDePrecio(escrito);
    const lista = datos.productos.filter((p) => enCategoria(p) && (!rango ||
      (typeof p.precioVenta === 'number' && p.precioVenta >= rango[0] - 0.001 && p.precioVenta <= rango[1] + 0.001)));
    // De menor a mayor precio
    return ordenarPorNombre(lista).sort((a, b) => (a.precioVenta ?? 0) - (b.precioVenta ?? 0));
  }

  const texto = normalizar(escrito);
  const textoCodigo = limpiarCodigo(escrito);
  return ordenarPorNombre(datos.productos.filter((p) => {
    if (!enCategoria(p)) return false;
    if (!texto) return true;
    return normalizar(p.nombre).includes(texto) || (textoCodigo && (p.codigo || '').includes(textoCodigo));
  }));
}

function cambiarModoBusqueda(modo) {
  if (modo === modoBusqueda) return;
  modoBusqueda = modo;
  $$('.selector-opcion').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
  const input = $('#buscar');
  input.value = '';
  input.placeholder = modo === 'precio' ? 'Precio, ej. 8.50 o 5-10' : 'Buscar por nombre o código';
  input.inputMode = modo === 'precio' ? 'decimal' : 'text';
  $('#ayuda-precio').classList.toggle('oculto', modo !== 'precio');
  renderListaProductos();
  input.focus();
}

function renderListaProductos() {
  if (!cargado.productos) {
    $('#conteo-productos').textContent = '';
    $('#lista-productos').innerHTML = '<li class="vacio">Cargando productos…</li>';
    return;
  }
  const lista = productosFiltrados();
  const total = datos.productos.length;
  $('#conteo-productos').textContent = total
    ? `Mostrando ${lista.length} de ${total} producto${total === 1 ? '' : 's'}`
    : '';

  if (!total) {
    $('#lista-productos').innerHTML = esAdmin()
      ? `<li class="vacio">Todavía no hay productos.<br>
          <button class="btn btn-primario" data-accion="ir-escanear">${ico('escanear')}Escanear el primero</button></li>`
      : '<li class="vacio">Todavía no hay productos registrados.</li>';
    return;
  }
  if (modoBusqueda === 'precio' && $('#buscar').value.trim() && !rangoDePrecio($('#buscar').value)) {
    $('#lista-productos').innerHTML = '<li class="vacio">Escriba solo el precio, por ejemplo <strong>8.50</strong> o <strong>5-10</strong>.</li>';
    return;
  }
  if (!lista.length) {
    $('#lista-productos').innerHTML = modoBusqueda === 'precio'
      ? '<li class="vacio">No hay productos con ese precio de venta.</li>'
      : '<li class="vacio">No se encontraron productos.</li>';
    return;
  }
  const acciones = (p) => (esAdmin() ? `
      <div class="item-acciones">
        <button class="btn-icono-peq" data-accion="editar" data-id="${p.id}" aria-label="Editar">${ico('editar')}</button>
        <button class="btn-icono-peq peligro" data-accion="eliminar" data-id="${p.id}" aria-label="Eliminar">${ico('eliminar')}</button>
      </div>` : '');
  $('#lista-productos').innerHTML = lista.map((p) => `
    <li class="item">
      <div class="item-info" data-accion="ver" data-id="${p.id}">
        <div class="item-nombre">${esc(p.nombre)}</div>
        <div class="item-sub"><span class="etiqueta-cat">${esc(nombreCategoria(p.categoriaId))}</span></div>
        <div class="item-precio">${q(p.precioVenta)}</div>
      </div>${acciones(p)}
    </li>`).join('');
}

function renderProductos() {
  renderFiltros();
  renderListaProductos();
}

async function eliminarProducto(id) {
  const p = productoPorId(id);
  if (!p || !esAdmin()) return false;
  const ok = await confirmar('Eliminar producto', `¿Seguro que desea eliminar "${p.nombre}"? Se borrará para todos los usuarios.`, 'Eliminar', true);
  if (!ok) return false;
  datos.productos = datos.productos.filter((x) => x.id !== id);
  enNube(fb.deleteDoc(refDoc('productos', id)), 'No se pudo eliminar');
  aviso('Producto eliminado');
  return true;
}

/* ---------------- Pantalla: Detalle ---------------- */
function textoGanancia(venta, costo) {
  if (venta === null || venta === undefined || costo === null || costo === undefined || Number.isNaN(venta) || Number.isNaN(costo)) return null;
  const ganancia = Math.round((venta - costo) * 100) / 100;
  const porcentaje = costo > 0 ? Math.round((ganancia / costo) * 1000) / 10 : null;
  return { ganancia, porcentaje };
}

function renderDetalle(id) {
  const p = productoPorId(id);
  if (!p) {
    $('#vista-detalle').innerHTML = '<p class="vacio">Cargando…</p>';
    return;
  }
  const g = textoGanancia(p.precioVenta, p.precioCosto);
  const fecha = p.actualizado ? new Date(p.actualizado).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const quien = p.actualizadoPor ? ` (${esc(p.actualizadoPor)})` : '';
  $('#vista-detalle').innerHTML = `
    <div class="tarjeta">
      <div class="detalle-cabecera">
        <div class="detalle-nombre">${esc(p.nombre)}</div>
        <div class="detalle-precio">${q(p.precioVenta)}</div>
        <span class="etiqueta-cat">${esc(nombreCategoria(p.categoriaId))}</span>
      </div>
    </div>
    <div class="tarjeta">
      <div class="detalle-fila"><span>Código</span><span>${esc(p.codigo || 'Sin código')}</span></div>
      <div class="detalle-fila"><span>Precio de venta</span><span>${q(p.precioVenta)}</span></div>
      <div class="detalle-fila"><span>Precio de costo</span><span>${q(p.precioCosto)}</span></div>
      <div class="detalle-fila"><span>Ganancia</span><span class="${g ? (g.ganancia >= 0 ? 'positivo' : 'negativo') : ''}">${g ? q(g.ganancia) + (g.porcentaje !== null ? ` (${g.porcentaje}%)` : '') : '—'}</span></div>
      <div class="detalle-fila"><span>Lugar de compra</span><span>${esc(p.lugarCompra || '—')}</span></div>
      <div class="detalle-fila"><span>Categoría</span><span>${esc(nombreCategoria(p.categoriaId))}</span></div>
      <div class="detalle-fila"><span>Última modificación</span><span>${esc(fecha)}${quien}</span></div>
    </div>
    ${esAdmin() ? `
    <div class="botones-fila">
      <button class="btn btn-primario btn-grande" id="d-editar">${ico('editar')}Editar</button>
      <button class="btn btn-peligro btn-grande" id="d-eliminar">${ico('eliminar')}Eliminar</button>
    </div>` : ''}
    <button class="btn btn-secundario btn-bloque btn-grande" id="d-escanear">${ico('escanear')}Escanear otro</button>
  `;
  if (esAdmin()) {
    $('#d-editar').onclick = () => navegar({ vista: 'formulario', id: p.id });
    $('#d-eliminar').onclick = async () => {
      if (await eliminarProducto(p.id)) history.back();
    };
  }
  $('#d-escanear').onclick = () => abrirEscaner((codigo) => abrirCodigo(codigo, 'replace'), { reemplazar: true });
}

/** Lo que ve un trabajador al escanear un producto que no existe. */
function renderNoRegistrado(codigo) {
  $('#vista-detalle').innerHTML = `
    <div class="tarjeta no-registrado">
      <div class="grande">${ico('buscar')}</div>
      <h2>Producto no registrado</h2>
      <p class="texto-suave">Este código todavía no está en la lista de precios:</p>
      <div class="codigo-grande">${esc(codigo || '')}</div>
      <p><strong>Avise al administrador</strong> para que lo registre.</p>
    </div>
    <button class="btn btn-primario btn-bloque btn-grande" id="nr-escanear">${ico('escanear')}Escanear otro</button>
  `;
  $('#nr-escanear').onclick = () => abrirEscaner((c) => abrirCodigo(c, 'replace'), { reemplazar: true });
}

/* ---------------- Pantalla: Formulario (solo administradores) ---------------- */
let formularioEstado = null;

function llenarSelectCategorias(seleccion) {
  const opciones = ordenarPorNombre([...datos.categorias])
    .map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  $('#f-categoria').innerHTML = `<option value="">Sin categoría</option>${opciones}<option value="__nueva">+ Crear nueva categoría…</option>`;
  $('#f-categoria').value = categoriaPorId(seleccion) ? seleccion : '';
  $('#f-categoria').dataset.anterior = $('#f-categoria').value;
}

function llenarLugares() {
  const lugares = [...new Set(datos.productos.map((p) => (p.lugarCompra || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  $('#lista-lugares').innerHTML = lugares.map((l) => `<option value="${esc(l)}"></option>`).join('');
}

function renderFormulario(estado) {
  formularioEstado = estado;
  const p = estado.id ? productoPorId(estado.id) : null;
  const precio = (n) => (n === null || n === undefined ? '' : Number(n).toFixed(2));

  $('#f-codigo').value = p ? (p.codigo || '') : (estado.codigo || '');
  $('#f-nombre').value = p ? p.nombre : '';
  $('#f-venta').value = p ? precio(p.precioVenta) : '';
  $('#f-costo').value = p ? precio(p.precioCosto) : '';
  $('#f-lugar').value = p ? (p.lugarCompra || '') : '';
  llenarSelectCategorias(p ? p.categoriaId : (filtroCategoria !== 'todas' ? filtroCategoria : ''));
  llenarLugares();
  $('#f-error').textContent = '';
  actualizarGanancia();
  // Código nuevo escaneado: ofrecer ponérselo a un producto que entró por factura (sin código)
  const sinCodigo = ordenarPorNombre(datos.productos.filter((x) => !x.codigo));
  const ofrecerVincular = !p && estado.codigo && sinCodigo.length > 0;
  $('#f-vincular').classList.toggle('oculto', !ofrecerVincular);
  if (ofrecerVincular) {
    $('#f-vincular-producto').innerHTML = '<option value="">— Elija el producto —</option>' +
      sinCodigo.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)} · ${q(x.precioVenta)}</option>`).join('');
  }
  // Si ya viene el código, enfocar el nombre
  setTimeout(() => (($('#f-codigo').value && !p && !ofrecerVincular) ? $('#f-nombre') : null)?.focus(), 150);
}

/** Le pone el código escaneado a un producto que no tenía (entró por factura). */
function vincularCodigo() {
  const id = $('#f-vincular-producto').value;
  const codigo = limpiarCodigo($('#f-codigo').value);
  const p = productoPorId(id);
  if (!p) { $('#f-error').textContent = 'Elija un producto de la lista.'; return; }
  if (!codigo) { $('#f-error').textContent = 'Falta el código de barras.'; return; }
  const otro = productoPorCodigo(codigo, id);
  if (otro) { $('#f-error').textContent = `Ese código ya está registrado en "${otro.nombre}".`; return; }
  const cambios = { codigo, actualizado: new Date().toISOString(), actualizadoPor: sesion.nombre };
  ponerLocal(datos.productos, { id, ...cambios });
  enNube(fb.updateDoc(refDoc('productos', id), cambios));
  aviso('Código asignado ✔');
  navegar({ vista: 'detalle', id }, 'replace');
}

function actualizarGanancia() {
  const venta = leerPrecio($('#f-venta').value);
  const costo = leerPrecio($('#f-costo').value);
  const g = textoGanancia(venta, costo);
  const el = $('#f-ganancia');
  if (!g) { el.textContent = ''; el.className = 'ganancia'; return; }
  el.textContent = `Ganancia por unidad: ${q(g.ganancia)}${g.porcentaje !== null ? ` (${g.porcentaje}% sobre el costo)` : ''}`;
  el.className = 'ganancia ' + (g.ganancia >= 0 ? 'positivo' : 'negativo');
}

async function guardarFormulario(e) {
  e.preventDefault();
  if (!esAdmin()) return;
  const error = (msg, campo) => {
    $('#f-error').textContent = msg;
    if (campo) $(campo).focus();
  };

  const codigo = limpiarCodigo($('#f-codigo').value);
  const nombre = $('#f-nombre').value.trim().replace(/\s+/g, ' ');
  const venta = leerPrecio($('#f-venta').value);
  const costo = leerPrecio($('#f-costo').value);
  const lugar = $('#f-lugar').value.trim();
  let categoriaId = $('#f-categoria').value;
  if (categoriaId === '__nueva') categoriaId = '';

  if (!nombre) return error('Escriba el nombre del producto.', '#f-nombre');
  if (venta === null) return error('Escriba el precio de venta.', '#f-venta');
  if (Number.isNaN(venta)) return error('El precio de venta no es válido. Ejemplo: 12.50', '#f-venta');
  if (Number.isNaN(costo)) return error('El precio de costo no es válido. Ejemplo: 9.75', '#f-costo');

  const idActual = formularioEstado.id || null;
  const repetido = productoPorCodigo(codigo, idActual);
  if (repetido) return error(`Ese código ya está registrado en "${repetido.nombre}".`, '#f-codigo');

  if (costo !== null && costo > venta) {
    const seguir = await confirmar('Revise los precios', `El precio de costo (${q(costo)}) es mayor que el de venta (${q(venta)}). Perdería dinero con este producto. ¿Guardar de todos modos?`, 'Guardar');
    if (!seguir) return;
  }

  const registro = {
    codigo,
    nombre,
    precioVenta: venta,
    precioCosto: costo,
    lugarCompra: lugar,
    categoriaId: categoriaId || null,
    actualizado: new Date().toISOString(),
    actualizadoPor: sesion.nombre,
  };

  if (idActual) {
    ponerLocal(datos.productos, { id: idActual, ...registro });
    enNube(fb.updateDoc(refDoc('productos', idActual), registro));
    aviso(navigator.onLine ? 'Cambios guardados ✔' : 'Guardado. Se subirá cuando haya internet');
    history.back();
  } else {
    const ref = fb.doc(refColeccion('productos'));
    const nuevo = { ...registro, creado: registro.actualizado };
    ponerLocal(datos.productos, { id: ref.id, ...nuevo });
    enNube(fb.setDoc(ref, nuevo));
    aviso(navigator.onLine ? 'Producto guardado ✔' : 'Guardado. Se subirá cuando haya internet');
    navegar({ vista: 'detalle', id: ref.id }, 'replace');
  }
}

/* ---------------- Pantalla: Categorías (solo administradores) ---------------- */
function nombreCategoriaRepetido(nombre, excluirId) {
  const n = normalizar(nombre);
  return datos.categorias.some((c) => c.id !== excluirId && normalizar(c.nombre) === n);
}

function crearCategoria(nombre) {
  nombre = (nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre || !esAdmin()) return null;
  if (nombreCategoriaRepetido(nombre)) {
    alerta('Categoría repetida', `Ya existe una categoría llamada "${nombre}".`);
    return null;
  }
  const ref = fb.doc(refColeccion('categorias'));
  const cat = { id: ref.id, nombre };
  ponerLocal(datos.categorias, cat);
  enNube(fb.setDoc(ref, { nombre }));
  aviso('Categoría creada');
  return cat;
}

function renderCategorias() {
  const cats = ordenarPorNombre([...datos.categorias]);
  if (!cats.length) {
    $('#lista-categorias').innerHTML = `<li class="vacio">${cargado.categorias ? 'No hay categorías. Agregue una arriba.' : 'Cargando…'}</li>`;
    return;
  }
  $('#lista-categorias').innerHTML = cats.map((c) => {
    const n = datos.productos.filter((p) => p.categoriaId === c.id).length;
    return `
      <li class="item">
        <div class="item-info" data-accion="filtrar" data-id="${c.id}">
          <div class="item-nombre">${esc(c.nombre)}</div>
          <div class="item-sub">${n} producto${n === 1 ? '' : 's'}</div>
        </div>
        <div class="item-acciones">
          <button class="btn-icono-peq" data-accion="editar" data-id="${c.id}" aria-label="Editar">${ico('editar')}</button>
          <button class="btn-icono-peq peligro" data-accion="eliminar" data-id="${c.id}" aria-label="Eliminar">${ico('eliminar')}</button>
        </div>
      </li>`;
  }).join('');
}

async function editarCategoria(id) {
  const c = categoriaPorId(id);
  if (!c) return;
  let nombre = await pedirTexto('Cambiar nombre', c.nombre, 'Nombre de la categoría');
  if (!nombre || nombre === c.nombre) return;
  nombre = nombre.replace(/\s+/g, ' ');
  if (nombreCategoriaRepetido(nombre, id)) return alerta('Categoría repetida', `Ya existe una categoría llamada "${nombre}".`);
  ponerLocal(datos.categorias, { id, nombre });
  enNube(fb.updateDoc(refDoc('categorias', id), { nombre }));
  aviso('Categoría actualizada');
  renderCategorias();
}

async function eliminarCategoria(id) {
  const c = categoriaPorId(id);
  if (!c) return;
  const afectados = datos.productos.filter((p) => p.categoriaId === id);
  const mensaje = afectados.length
    ? `La categoría "${c.nombre}" tiene ${afectados.length} producto(s). Los productos NO se borrarán, quedarán como "Sin categoría". ¿Continuar?`
    : `¿Eliminar la categoría "${c.nombre}"?`;
  if (!(await confirmar('Eliminar categoría', mensaje, 'Eliminar', true))) return;
  datos.categorias = datos.categorias.filter((x) => x.id !== id);
  afectados.forEach((p) => { p.categoriaId = null; });
  const ops = afectados.map((p) => (l) => l.update(refDoc('productos', p.id), { categoriaId: null }));
  ops.push((l) => l.delete(refDoc('categorias', id)));
  enNube(escribirEnGrupos(ops), 'No se pudo eliminar');
  aviso('Categoría eliminada');
  renderCategorias();
}

/* ---------------- Color de la app ---------------- */
const CLAVE_TEMA = 'abarroterias_vc_tema'; // (el mismo nombre se usa en index.html)
const TEMAS = [
  { id: 'azul', nombre: 'Azul', c1: '#4a86ff', c2: '#2459e6', fondo: '#050a18' },
  { id: 'morado', nombre: 'Morado', c1: '#a07bff', c2: '#6d28d9', fondo: '#07040f' },
  { id: 'verde', nombre: 'Verde', c1: '#2fcf6f', c2: '#15803d', fondo: '#020a06' },
  { id: 'turquesa', nombre: 'Turquesa', c1: '#22c9b5', c2: '#0f766e', fondo: '#020b0b' },
  { id: 'vino', nombre: 'Vino', c1: '#f43f5e', c2: '#be123c', fondo: '#0f0306' },
  { id: 'naranja', nombre: 'Naranja', c1: '#fb8a3c', c2: '#c2410c', fondo: '#0f0703' },
  { id: 'rosa', nombre: 'Rosa', c1: '#f472b6', c2: '#be185d', fondo: '#0f030a' },
  { id: 'grafito', nombre: 'Grafito', c1: '#7c8ba1', c2: '#475569', fondo: '#050607' },
];
const temaActual = () => {
  try { return localStorage.getItem(CLAVE_TEMA) || 'azul'; } catch (_) { return 'azul'; }
};

function aplicarTema(id) {
  const t = TEMAS.find((x) => x.id === id) || TEMAS[0];
  if (t.id === 'azul') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.fondo);
}

function renderTemas() {
  const actual = temaActual();
  $('#lista-temas').innerHTML = TEMAS.map((t) => `
    <button type="button" class="tema ${t.id === actual ? 'activo' : ''}" data-tema="${t.id}" aria-label="Color ${t.nombre}">
      <span class="tema-muestra" style="background: linear-gradient(135deg, ${t.c1}, ${t.c2})">${t.id === actual ? ico('guardar') : ''}</span>
      ${t.nombre}
    </button>`).join('');
}

function elegirTema(id) {
  try { localStorage.setItem(CLAVE_TEMA, id); } catch (_) { /* nada */ }
  aplicarTema(id);
  renderTemas();
  aviso(`Color: ${(TEMAS.find((x) => x.id === id) || TEMAS[0]).nombre}`);
}

/* ---------------- Pantalla: Ajustes ---------------- */
function renderAjustes() {
  renderTemas();
  $('#info-cuenta').innerHTML = `${esc(sesion.nombre)} · usuario <strong>${esc(sesion.usuario)}</strong><br>
    <span class="etiqueta-rol ${sesion.rol}">${esAdmin() ? ico('corona') + ' Administrador' : ico('usuario') + ' Trabajador'}</span>`;
  $('#info-datos').innerHTML = `${esAdmin() ? `Sucursal ${esc(nombreSucursal())}: ` : ''}${datos.productos.length} productos y ${datos.categorias.length} categorías en la nube.<br>
    ${navigator.onLine ? ico('conectado', 'verde') + ' Conectado: los cambios se comparten al momento.' : ico('sin-internet', 'amarillo') + ' Sin internet: los cambios se subirán cuando vuelva la señal.'}`;
  if (esAdmin()) {
    renderSucursales();
    renderUsuarios();
    renderEstadoLlave();
  }
}

function renderUsuarios() {
  const lista = datos.usuarios
    .filter((u) => !u.reemplazadoPor)
    .sort((a, b) => (b.activo - a.activo) || (a.rol === b.rol ? 0 : a.rol === 'admin' ? -1 : 1) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  if (!lista.length) {
    $('#lista-usuarios').innerHTML = '<li class="vacio">Cargando…</li>';
    return;
  }
  $('#lista-usuarios').innerHTML = lista.map((u) => {
    const etiqueta = !u.activo
      ? '<span class="etiqueta-rol inactivo">Desactivado</span>'
      : `<span class="etiqueta-rol ${u.rol}">${u.rol === 'admin' ? ico('corona') + ' Administrador' : ico('usuario') + ' Trabajador'}</span>`;
    const sucursal = u.rol === 'admin' ? '' : ` · <span class="etiqueta-sucursal">${ico('ubicacion')} ${esc(nombreSucursal(u.sucursalId || 'guastatoya'))}</span>`;
    const yo = u.uid === sesion.uid ? ' (usted)' : '';
    return `
      <li class="item ${u.activo ? '' : 'inactivo'}">
        <div class="item-info" data-accion="usuario" data-id="${u.uid}">
          <div class="item-nombre">${esc(u.nombre)}${yo}</div>
          <div class="item-sub">usuario: ${esc(u.usuario)} · ${etiqueta}${sucursal}</div>
        </div>
        ${u.uid === sesion.uid ? '' : `<button class="btn-icono-peq" data-accion="usuario" data-id="${u.uid}" aria-label="Opciones">${ico('opciones')}</button>`}
      </li>`;
  }).join('');
}

/** Crea la cuenta en Firebase con una conexión aparte, para no cerrar la sesión del administrador. */
async function crearCuenta(usuario, clave) {
  const a2 = obtenerAuthSecundaria();
  for (let version = 0; version < 5; version++) {
    const email = correoPara(usuario, version ? Date.now().toString(36) : 0);
    try {
      const cred = await fb.createUserWithEmailAndPassword(a2, email, clave);
      await fb.signOut(a2);
      return { uid: cred.user.uid, email };
    } catch (e) {
      if (e.code !== 'auth/email-already-in-use') throw e;
    }
  }
  throw new Error('No se pudo crear la cuenta');
}

function camposClave(prefijo) {
  return `
    <label class="etiqueta" for="${prefijo}-clave">Contraseña (mínimo 6 caracteres)</label>
    <input id="${prefijo}-clave" class="input" type="password" autocomplete="new-password">
    <label class="etiqueta" for="${prefijo}-clave2">Repita la contraseña</label>
    <input id="${prefijo}-clave2" class="input" type="password" autocomplete="new-password">`;
}

function leerClaveNueva(prefijo, error) {
  const clave = $(`#${prefijo}-clave`).value;
  if (clave.length < 6) { error('La contraseña debe tener al menos 6 caracteres.'); return null; }
  if (clave !== $(`#${prefijo}-clave2`).value) { error('Las contraseñas no coinciden.'); return null; }
  return clave;
}

async function nuevoUsuario() {
  await modal({
    titulo: 'Agregar usuario',
    html: `
      <label class="etiqueta" for="nu-rol">Tipo de usuario</label>
      <select id="nu-rol" class="input">
        <option value="trabajador">Trabajador (solo ve y escanea)</option>
        <option value="admin">Administrador (control total)</option>
      </select>
      <div id="nu-sucursal-caja">
        <label class="etiqueta" for="nu-sucursal">Sucursal donde trabaja</label>
        <select id="nu-sucursal" class="input">${opcionesDeSucursal(sucursalActual)}</select>
      </div>
      <label class="etiqueta" for="nu-nombre">Nombre</label>
      <input id="nu-nombre" class="input" type="text" maxlength="40" placeholder="Ej. María López">
      <label class="etiqueta" for="nu-usuario">Usuario (para entrar)</label>
      <input id="nu-usuario" class="input" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" placeholder="Ej. maria">
      ${camposClave('nu')}
      <p id="nu-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: 'Crear',
        clase: 'btn-primario',
        accion: async () => {
          const error = (m) => { $('#nu-error').textContent = m; return MANTENER_ABIERTA; };
          const rol = $('#nu-rol').value;
          const sucursalId = $('#nu-sucursal').value;
          const nombre = $('#nu-nombre').value.trim().replace(/\s+/g, ' ');
          const usuario = normalizarUsuario($('#nu-usuario').value);
          if (!nombre) return error('Escriba el nombre.');
          if (!USUARIO_VALIDO.test(usuario)) return error('El usuario debe tener de 3 a 20 letras o números, sin espacios.');
          let mensaje = null;
          const clave = leerClaveNueva('nu', (m) => { mensaje = m; });
          if (!clave) return error(mensaje);
          $('#nu-error').textContent = 'Creando…';
          try {
            const existe = await fb.getDoc(refDoc('acceso', usuario));
            if (existe.exists()) return error('Ese usuario ya existe. Elija otro.');
            const { uid, email } = await crearCuenta(usuario, clave);
            const lote = fb.writeBatch(db);
            const datosUsuario = { nombre, usuario, rol, activo: true, creado: new Date().toISOString() };
            if (rol === 'trabajador') datosUsuario.sucursalId = sucursalId;
            lote.set(refDoc('usuarios', uid), datosUsuario);
            lote.set(refDoc('acceso', usuario), { email, uid });
            await lote.commit();
            aviso(`Usuario "${usuario}" creado ✔`);
            return true;
          } catch (e) {
            console.error(e);
            return error(mensajeError(e));
          }
        },
      },
    ],
    alAbrir: () => {
      // La sucursal solo se pide para trabajadores (los administradores ven todas)
      const verSucursal = () => $('#nu-sucursal-caja').classList.toggle('oculto', $('#nu-rol').value !== 'trabajador');
      $('#nu-rol').addEventListener('change', verSucursal);
      verSucursal();
      $('#nu-nombre').focus();
    },
  });
}

async function opcionesUsuario(uid) {
  const u = datos.usuarios.find((x) => x.uid === uid);
  if (!u || uid === sesion.uid) return;
  const otroRol = u.rol === 'admin' ? 'trabajador' : 'admin';
  const eleccion = await modal({
    titulo: u.nombre,
    html: `<p>Usuario: <strong>${esc(u.usuario)}</strong></p>
      <div class="acceso-paso">
        <button class="btn btn-secundario btn-bloque" data-op="clave">${ico('llave')}Cambiar contraseña</button>
        ${u.activo && u.rol === 'trabajador' ? `<button class="btn btn-secundario btn-bloque" data-op="sucursal">${ico('ubicacion')}Cambiar sucursal (ahora: ${esc(nombreSucursal(u.sucursalId || 'guastatoya'))})</button>` : ''}
        ${u.activo ? `<button class="btn btn-secundario btn-bloque" data-op="rol">${otroRol === 'admin' ? ico('corona') + 'Hacer administrador' : ico('usuario') + 'Hacer trabajador'}</button>` : ''}
        <button class="btn ${u.activo ? 'btn-peligro' : 'btn-exito'} btn-bloque" data-op="activo">${u.activo ? ico('bloquear') + 'Desactivar (ya no podrá entrar)' : ico('guardar') + 'Activar de nuevo'}</button>
      </div>`,
    botones: [{ texto: 'Cerrar', clase: 'btn-contorno', valor: null }],
    alAbrir: (cerrar) => {
      $$('#modal-cuerpo [data-op]').forEach((b) => b.addEventListener('click', () => cerrar(b.dataset.op)));
    },
  });
  if (eleccion === 'clave') cambiarClaveDe(u);
  else if (eleccion === 'sucursal') cambiarSucursalDe(u);
  else if (eleccion === 'rol') {
    const texto = otroRol === 'admin'
      ? `¿Hacer administrador a ${u.nombre}? Podrá cambiar precios, borrar productos y manejar usuarios.`
      : `¿Hacer trabajador a ${u.nombre}? Solo podrá ver y escanear.`;
    if (await confirmar('Cambiar tipo de usuario', texto, 'Sí, cambiar')) {
      // Al volverse trabajador queda en la sucursal que tenía (o la que el administrador está viendo)
      const cambios = otroRol === 'trabajador' ? { rol: otroRol, sucursalId: u.sucursalId || sucursalActual } : { rol: otroRol };
      enNube(fb.updateDoc(refDoc('usuarios', uid), cambios));
      aviso('Tipo de usuario cambiado');
    }
  } else if (eleccion === 'activo') {
    if (u.activo && !(await confirmar('Desactivar usuario', `${u.nombre} ya no podrá entrar a la app. Si tiene la app abierta, se le cerrará la sesión.`, 'Desactivar', true))) return;
    enNube(fb.updateDoc(refDoc('usuarios', uid), { activo: !u.activo }));
    aviso(u.activo ? 'Usuario desactivado' : 'Usuario activado');
  }
}

async function cambiarSucursalDe(u) {
  const id = await modal({
    titulo: `Sucursal de ${u.nombre}`,
    html: `<p>${esc(u.nombre)} solo verá los productos y precios de la sucursal que elija.</p>
      <label class="etiqueta" for="cs-sucursal">Sucursal</label>
      <select id="cs-sucursal" class="input">${opcionesDeSucursal(u.sucursalId || 'guastatoya')}</select>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      { texto: 'Guardar', clase: 'btn-primario', accion: () => $('#cs-sucursal').value },
    ],
  });
  if (!id || id === (u.sucursalId || 'guastatoya')) return;
  enNube(fb.updateDoc(refDoc('usuarios', u.uid), { sucursalId: id }));
  aviso(`${u.nombre} ahora está en ${nombreSucursal(id)}`);
}

/**
 * Cambiar la contraseña de otra persona (plan gratis de Firebase):
 * se crea una cuenta nueva con la contraseña nueva y la anterior queda desactivada.
 * Para la persona es igual: entra con el mismo usuario y la contraseña nueva.
 */
async function cambiarClaveDe(u) {
  await modal({
    titulo: `Nueva contraseña para ${u.nombre}`,
    html: `<p>Usuario: <strong>${esc(u.usuario)}</strong>. Si tiene la app abierta, deberá entrar de nuevo con la contraseña nueva.</p>
      ${camposClave('cc')}<p id="cc-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: 'Guardar',
        clase: 'btn-primario',
        accion: async () => {
          const error = (m) => { $('#cc-error').textContent = m; return MANTENER_ABIERTA; };
          let mensaje = null;
          const clave = leerClaveNueva('cc', (m) => { mensaje = m; });
          if (!clave) return error(mensaje);
          $('#cc-error').textContent = 'Guardando…';
          try {
            const { uid, email } = await crearCuenta(u.usuario, clave);
            const lote = fb.writeBatch(db);
            lote.set(refDoc('usuarios', uid), {
              nombre: u.nombre, usuario: u.usuario, rol: u.rol, activo: u.activo,
              ...(u.sucursalId ? { sucursalId: u.sucursalId } : {}),
              creado: new Date().toISOString(), reemplazaA: u.uid,
            });
            lote.update(refDoc('usuarios', u.uid), { activo: false, reemplazadoPor: uid });
            lote.set(refDoc('acceso', u.usuario), { email, uid });
            await lote.commit();
            aviso('Contraseña cambiada ✔');
            return true;
          } catch (e) {
            console.error(e);
            return error(mensajeError(e));
          }
        },
      },
    ],
    alAbrir: () => $('#cc-clave').focus(),
  });
}

async function cambiarMiClave() {
  await modal({
    titulo: 'Cambiar mi contraseña',
    html: `
      <label class="etiqueta" for="mc-actual">Contraseña actual</label>
      <input id="mc-actual" class="input" type="password" autocomplete="current-password">
      ${camposClave('mc')}<p id="mc-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: 'Guardar',
        clase: 'btn-primario',
        accion: async () => {
          const error = (m) => { $('#mc-error').textContent = m; return MANTENER_ABIERTA; };
          const actual = $('#mc-actual').value;
          if (!actual) return error('Escriba su contraseña actual.');
          let mensaje = null;
          const clave = leerClaveNueva('mc', (m) => { mensaje = m; });
          if (!clave) return error(mensaje);
          $('#mc-error').textContent = 'Guardando…';
          try {
            const credencial = fb.EmailAuthProvider.credential(auth.currentUser.email, actual);
            await fb.reauthenticateWithCredential(auth.currentUser, credencial);
            await fb.updatePassword(auth.currentUser, clave);
            aviso('Contraseña cambiada ✔');
            return true;
          } catch (e) {
            console.error(e);
            const c = e.code || '';
            if (c === 'auth/invalid-credential' || c === 'auth/wrong-password') return error('La contraseña actual no es correcta.');
            return error(mensajeError(e));
          }
        },
      },
    ],
    alAbrir: () => $('#mc-actual').focus(),
  });
}

/* ---------------- Facturas con foto (solo administradores) ---------------- */
const MARGEN_SUGERIDO = 0.25; // precio de venta sugerido para productos nuevos: costo + 25 %
const CLAVE_LLAVE_IA = 'abarroterias_san_vicenta_llave_ia'; // la llave queda SOLO en este teléfono

const llaveIA = {
  leer: () => { try { return localStorage.getItem(CLAVE_LLAVE_IA) || ''; } catch (_) { return ''; } },
  guardar: (llave) => localStorage.setItem(CLAVE_LLAVE_IA, llave),
  borrar: () => localStorage.removeItem(CLAVE_LLAVE_IA),
};

let moduloFacturas = null;
async function cargarModuloFacturas() {
  if (!moduloFacturas) moduloFacturas = await import('./facturas.js');
  return moduloFacturas;
}

let facturaActual = null; // { proveedor, fecha, advertencias, lineas[] }

const precioTexto = (n) => (n === null || n === undefined || Number.isNaN(n) ? '' : Number(n).toFixed(2));
function ventaSugerida(costo) {
  if (costo === null || costo === undefined || Number.isNaN(costo)) return null;
  return Math.ceil(costo * (1 + MARGEN_SUGERIDO) * 4) / 4; // redondeado hacia arriba a Q0.25
}

function renderEstadoLlave() {
  const llave = llaveIA.leer();
  $('#estado-llave-ia').textContent = llave
    ? `Llave guardada en este teléfono (termina en …${llave.slice(-4)}).`
    : 'Este teléfono todavía no tiene llave.';
  $('#btn-llave-ia').innerHTML = ico('llave') + (llave ? 'Cambiar o quitar llave' : 'Poner llave');
  $('#estado-llave-ia').classList.toggle('verde', !!llave);
}

async function configurarLlave() {
  const hayLlave = !!llaveIA.leer();
  const botones = [{ texto: 'Cancelar', clase: 'btn-secundario', valor: null }];
  if (hayLlave) {
    botones.push({ texto: 'Quitar llave', clase: 'btn-peligro', valor: 'quitar' });
  }
  botones.push({
    texto: 'Guardar',
    clase: 'btn-primario',
    accion: async () => {
      const error = (m) => { $('#llave-error').textContent = m; return MANTENER_ABIERTA; };
      const llave = $('#llave-input').value.trim();
      if (!llave) return error('Pegue la llave.');
      $('#llave-error').textContent = 'Revisando la llave…';
      try {
        const m = await cargarModuloFacturas();
        await m.probarLlave(llave);
      } catch (e) {
        const m = await cargarModuloFacturas();
        return error(m.mensajeErrorIA(e) || 'No se pudo revisar la llave.');
      }
      llaveIA.guardar(llave);
      return 'guardada';
    },
  });
  const r = await modal({
    titulo: 'Llave para leer facturas',
    html: `
      <p>Cómo conseguirla:</p>
      <ol class="pasos">
        <li>Entre a <strong>console.anthropic.com</strong> y cree su cuenta.</li>
        <li>En <strong>Billing</strong>, cargue saldo (por ejemplo USD 5).</li>
        <li>En <strong>API keys</strong>, toque <strong>Create key</strong> y copie la llave (empieza con <code>sk-ant-</code>).</li>
      </ol>
      <label class="etiqueta" for="llave-input">Pegue la llave aquí</label>
      <input id="llave-input" class="input" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sk-ant-…">
      <p id="llave-error" class="error" role="alert"></p>`,
    botones,
    alAbrir: () => $('#llave-input').focus(),
  });
  if (r === 'guardada') aviso('Llave guardada en este teléfono ✔');
  if (r === 'quitar' && await confirmar('Quitar llave', 'Este teléfono ya no podrá leer facturas hasta que ponga una llave de nuevo.', 'Quitar', true)) {
    llaveIA.borrar();
    aviso('Llave quitada');
  }
  renderEstadoLlave();
}

function escanearFactura() {
  if (!llaveIA.leer()) {
    confirmar('Falta la llave',
      'Para leer facturas con foto primero hay que poner la llave de la inteligencia artificial en Ajustes → Lectura de facturas.',
      'Ir a Ajustes').then((ir) => { if (ir) irAPestana('ajustes'); });
    return;
  }
  if (!navigator.onLine) {
    alerta('Sin internet', 'Para leer facturas se necesita internet. Lo demás de la app sí funciona sin señal.');
    return;
  }
  cargarModuloFacturas().catch(() => {}); // ir cargándolo mientras toma la foto
  $('#foto-factura').click();
}

async function procesarFactura(archivo) {
  const control = new AbortController();
  let terminado = false;
  modal({
    titulo: 'Leyendo la factura…',
    html: '<div class="cargando" aria-hidden="true"></div><p class="centrado">Esto tarda de 20 a 60 segundos.<br>No cierre la app.</p>',
    botones: [{ texto: 'Cancelar', clase: 'btn-contorno', valor: 'cancelar' }],
  }).then((v) => { if (!terminado && v === 'cancelar') control.abort(); });

  let m = null;
  try {
    m = await cargarModuloFacturas();
    const foto = await m.prepararFoto(archivo);
    if (control.signal.aborted) return;
    const resultado = await m.leerFactura(llaveIA.leer(), foto, { productos: datos.productos, categorias: datos.categorias }, control.signal);
    terminado = true;
    cerrarModal();
    if (!resultado.esFactura || !resultado.lineas.length) {
      alerta('No se encontraron productos', resultado.esFactura
        ? 'No se pudo leer ningún producto. Intente con una foto más clara, derecha y con buena luz.'
        : 'La foto no parece una factura o recibo de compra.');
      return;
    }
    facturaActual = armarFactura(resultado);
    navegar({ vista: 'factura' });
  } catch (e) {
    terminado = true;
    cerrarModal();
    if (control.signal.aborted) return;
    console.error(e);
    const mensaje = m ? m.mensajeErrorIA(e) : mensajeError(e);
    if (mensaje) alerta('No se pudo leer la factura', mensaje);
  }
}

function armarFactura(r) {
  return {
    proveedor: r.proveedor || '',
    fecha: r.fecha || '',
    advertencias: r.advertencias || [],
    lineas: r.lineas.map((l) => ({
      descripcion: l.descripcion || '',
      incluir: true,
      productoId: l.productoId && productoPorId(l.productoId) ? l.productoId : '',
      nombre: l.nombre || l.descripcion || '',
      costo: precioTexto(l.costoUnitario),
      venta: precioTexto(ventaSugerida(l.costoUnitario)),
      ventaEditada: false,
      categoriaId: l.categoriaId || '',
      cantidad: l.cantidad,
      unidadesPorPaquete: l.unidadesPorPaquete,
      totalLinea: l.totalLinea,
      confianza: l.confianza,
      nota: l.nota,
    })),
  };
}

function renderLineaFactura(l, i) {
  const existente = l.productoId ? productoPorId(l.productoId) : null;
  const opcionesProductos = ordenarPorNombre([...datos.productos])
    .map((p) => `<option value="${esc(p.id)}" ${p.id === l.productoId ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('');
  const opcionesCategorias = ordenarPorNombre([...datos.categorias])
    .map((c) => `<option value="${esc(c.id)}" ${c.id === l.categoriaId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');
  const insignia = { alta: '', media: '<span class="insignia media">Revisar</span>', baja: `<span class="insignia baja">${ico('alerta')} Revisar bien</span>` }[l.confianza] || '';
  const detalle = [
    l.cantidad ? `Cantidad: ${l.cantidad}` : '',
    l.unidadesPorPaquete > 1 ? `${l.unidadesPorPaquete} u por paquete` : '',
    typeof l.totalLinea === 'number' ? `Total: ${q(l.totalLinea)}` : '',
  ].filter(Boolean).join(' · ');
  let antes = '';
  if (existente) {
    const nuevo = leerPrecio(l.costo);
    const viejo = existente.precioCosto;
    let flecha = '';
    if (typeof viejo === 'number' && typeof nuevo === 'number' && !Number.isNaN(nuevo)) {
      if (nuevo > viejo + 0.004) flecha = ' <span class="negativo">▲ subió</span>';
      else if (nuevo < viejo - 0.004) flecha = ' <span class="positivo">▼ bajó</span>';
      else flecha = ' (igual)';
    }
    antes = `<p class="pequeno texto-suave">Antes: ${q(viejo)}${flecha}</p>`;
  }
  return `
    <li class="tarjeta linea-factura ${l.incluir ? '' : 'excluida'}" data-i="${i}">
      <label class="fila-check">
        <input type="checkbox" data-campo="incluir" ${l.incluir ? 'checked' : ''}>
        <span>Incluir</span> ${insignia}
      </label>
      <p class="pequeno texto-suave">Factura: “${esc(l.descripcion)}”${detalle ? '<br>' + esc(detalle) : ''}</p>
      <label class="etiqueta">Producto</label>
      <select class="input" data-campo="productoId">
        <option value="" ${l.productoId ? '' : 'selected'}>🆕 Producto nuevo</option>
        ${opcionesProductos}
      </select>
      ${existente ? '' : `
        <label class="etiqueta">Nombre</label>
        <input class="input" type="text" maxlength="80" data-campo="nombre" value="${esc(l.nombre)}">`}
      <div class="dos-columnas">
        <div>
          <label class="etiqueta">Costo por unidad</label>
          <div class="input-moneda"><span>Q</span><input class="input" type="text" inputmode="decimal" data-campo="costo" value="${esc(l.costo)}"></div>
          ${antes}
        </div>
        <div>
          <label class="etiqueta">Precio de venta</label>
          ${existente
            ? `<p class="valor-fijo">${q(existente.precioVenta)}</p><p class="pequeno texto-suave">No se cambia</p>`
            : `<div class="input-moneda"><span>Q</span><input class="input" type="text" inputmode="decimal" data-campo="venta" value="${esc(l.venta)}"></div>
               <p class="pequeno texto-suave">Sugerido (+${Math.round(MARGEN_SUGERIDO * 100)} %)</p>`}
        </div>
      </div>
      ${existente ? '' : `
        <label class="etiqueta">Categoría</label>
        <select class="input" data-campo="categoriaId">
          <option value="">Sin categoría</option>${opcionesCategorias}
        </select>`}
      ${l.nota ? `<p class="nota">${ico('nota')} ${esc(l.nota)}</p>` : ''}
    </li>`;
}

function renderFactura() {
  if (!facturaActual) { irAPestana('escanear'); return; }
  const f = facturaActual;
  $('#vista-factura').innerHTML = `
    <div class="tarjeta">
      <label class="etiqueta" for="fa-proveedor">Proveedor / lugar de compra</label>
      <input id="fa-proveedor" class="input" type="text" maxlength="60" data-campo="proveedor" value="${esc(f.proveedor)}">
      ${f.fecha ? `<p class="texto-suave">Fecha de la factura: ${esc(f.fecha)}</p>` : ''}
      <p id="fa-resumen" class="texto-suave"></p>
      ${f.advertencias.map((a) => `<p class="advertencia">${ico('alerta')} ${esc(a)}</p>`).join('')}
      <p class="pequeno texto-suave">Revise cada producto antes de guardar. Puede corregir cualquier dato o quitar la ✓ de "Incluir".</p>
    </div>
    <ul class="lista" id="fa-lineas">${f.lineas.map(renderLineaFactura).join('')}</ul>
    <p id="fa-error" class="error" role="alert"></p>
    <button id="fa-guardar" class="btn btn-primario btn-bloque btn-grande">${ico('guardar')}Guardar</button>
    <button id="fa-cancelar" class="btn btn-contorno btn-bloque">Descartar factura</button>`;
  actualizarResumenFactura();
}

function actualizarResumenFactura() {
  const incluidas = facturaActual.lineas.filter((l) => l.incluir);
  const existentes = incluidas.filter((l) => l.productoId).length;
  const nuevos = incluidas.length - existentes;
  $('#fa-resumen').textContent = `${facturaActual.lineas.length} productos leídos · ${existentes} ya registrados (se actualiza su costo) · ${nuevos} nuevos`;
  $('#fa-guardar').innerHTML = `${ico('guardar')}Guardar ${incluidas.length} producto${incluidas.length === 1 ? '' : 's'}`;
}

function alCambiarFactura(e) {
  const el = e.target.closest('[data-campo]');
  if (!el || !facturaActual) return;
  const campo = el.dataset.campo;
  if (campo === 'proveedor') { facturaActual.proveedor = el.value; return; }
  const li = el.closest('[data-i]');
  const i = Number(li.dataset.i);
  const l = facturaActual.lineas[i];
  if (campo === 'incluir') {
    l.incluir = el.checked;
    li.classList.toggle('excluida', !l.incluir);
    actualizarResumenFactura();
  } else if (campo === 'productoId') {
    if (e.type !== 'change' || l.productoId === el.value) return;
    l.productoId = el.value;
    li.outerHTML = renderLineaFactura(l, i);
    actualizarResumenFactura();
  } else if (campo === 'costo') {
    l.costo = el.value;
    if (!l.ventaEditada) {
      l.venta = precioTexto(ventaSugerida(leerPrecio(l.costo)));
      const venta = li.querySelector('[data-campo="venta"]');
      if (venta) venta.value = l.venta;
    }
  } else if (campo === 'venta') {
    l.venta = el.value;
    l.ventaEditada = true;
  } else if (campo === 'nombre' || campo === 'categoriaId') {
    l[campo] = el.value;
  }
}

function guardarFactura() {
  if (!facturaActual || !esAdmin()) return;
  const error = (msg, i) => {
    $('#fa-error').textContent = msg;
    const li = i === undefined ? null : $(`#fa-lineas [data-i="${i}"]`);
    (li || $('#fa-error')).scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const proveedor = facturaActual.proveedor.trim();
  const ahora = new Date().toISOString();
  const ops = [];
  let guardados = 0;

  // Primero revisar todo, después guardar
  const revisadas = [];
  for (const [i, l] of facturaActual.lineas.entries()) {
    if (!l.incluir) continue;
    const costo = leerPrecio(l.costo);
    const nombreMostrado = l.productoId ? productoPorId(l.productoId)?.nombre : l.nombre;
    if (costo === null || Number.isNaN(costo)) return error(`Revise el costo de "${nombreMostrado || l.descripcion}". Ejemplo: 7.50`, i);
    if (l.productoId) {
      if (!productoPorId(l.productoId)) return error('Uno de los productos elegidos ya no existe. Elija otro.', i);
      revisadas.push({ l, costo });
    } else {
      const nombre = l.nombre.trim().replace(/\s+/g, ' ');
      if (!nombre) return error(`Escriba el nombre del producto “${l.descripcion}”.`, i);
      let venta = leerPrecio(l.venta);
      if (Number.isNaN(venta)) return error(`Revise el precio de venta de "${nombre}". Ejemplo: 9.50`, i);
      if (venta === null) venta = ventaSugerida(costo);
      revisadas.push({ l, costo, nombre, venta });
    }
  }
  if (!revisadas.length) return error('No hay productos marcados para guardar.');

  for (const { l, costo, nombre, venta } of revisadas) {
    if (l.productoId) {
      const p = productoPorId(l.productoId);
      const alias = [...new Set([...(Array.isArray(p.aliasFactura) ? p.aliasFactura : []), l.descripcion].filter(Boolean))].slice(-10);
      const cambios = { precioCosto: costo, aliasFactura: alias, actualizado: ahora, actualizadoPor: sesion.nombre };
      if (proveedor) cambios.lugarCompra = proveedor;
      ponerLocal(datos.productos, { id: p.id, ...cambios });
      ops.push((lote) => lote.update(refDoc('productos', p.id), cambios));
    } else {
      const ref = fb.doc(refColeccion('productos'));
      const nuevo = {
        codigo: '', nombre, precioVenta: venta, precioCosto: costo, lugarCompra: proveedor,
        categoriaId: l.categoriaId || null, aliasFactura: l.descripcion ? [l.descripcion] : [],
        creado: ahora, actualizado: ahora, actualizadoPor: sesion.nombre,
      };
      ponerLocal(datos.productos, { id: ref.id, ...nuevo });
      ops.push((lote) => lote.set(ref, nuevo));
    }
    guardados++;
  }
  enNube(escribirEnGrupos(ops));
  facturaActual = null;
  aviso(`${guardados} producto${guardados === 1 ? '' : 's'} guardado${guardados === 1 ? '' : 's'} ✔`);
  irAPestana('productos');
}

async function cancelarFactura() {
  if (await confirmar('Descartar factura', 'No se guardará nada de esta factura.', 'Descartar', true)) {
    facturaActual = null;
    irAPestana('escanear');
  }
}

/* ---------------- Inventario (administradores y trabajadores) ---------------- */
// La hoja se guarda en el teléfono después de cada cambio: si se cierra la app
// o se apaga el teléfono, sigue donde quedó.
const CLAVE_INVENTARIO = 'abarroterias_vc_inventario';

let inventario = null; // { inicio, negocio, quien, lineas: [{ productoId, codigo, nombre, costo, cantidad, manual }] }

function cargarInventario() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_INVENTARIO) || 'null');
    if (d && Array.isArray(d.lineas)) inventario = d;
  } catch (_) { /* sin inventario guardado */ }
}

function guardarInventario() {
  try {
    if (inventario) localStorage.setItem(CLAVE_INVENTARIO, JSON.stringify(inventario));
    else localStorage.removeItem(CLAVE_INVENTARIO);
  } catch (e) {
    console.error(e);
    alerta('No se pudo guardar', 'El teléfono no tiene espacio para guardar la hoja de inventario.');
  }
}

const redondear2 = (n) => Math.round(n * 100) / 100;
const totalDeLinea = (l) => redondear2(l.cantidad * l.costo);
const totalInventario = () => redondear2(inventario.lineas.reduce((s, l) => s + totalDeLinea(l), 0));
const unidadesInventario = () => Math.round(inventario.lineas.reduce((s, l) => s + l.cantidad, 0) * 1000) / 1000;
const textoCantidad = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** Cantidad contada: entero o con decimales (ej. 2.5 libras). null si está vacío, NaN si no es válida. */
function leerCantidad(texto) {
  const t = String(texto ?? '').trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return NaN;
  return parseFloat(t);
}

function fechaInventario() {
  const f = new Date(inventario.inicio);
  return f.toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' +
    f.toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' });
}

/** Letra tipo ticket (Share Tech Mono, incluida en la app en fonts/). */
const LETRA_TICKET = '"Share Tech Mono"';
const cargarLetraTicket = () => (document.fonts ? document.fonts.load(`27px ${LETRA_TICKET}`).catch(() => {}) : Promise.resolve());

function renderInventario(resaltar = -1) {
  cargarLetraTicket(); // lista antes de dibujar el PDF
  const v = $('#vista-inventario');
  if (!inventario) {
    v.innerHTML = `
      <div class="tarjeta inv-inicio">
        ${ico('inventario', 'inv-icono-grande')}
        <h2>Hacer inventario</h2>
        <p class="texto-suave">Escanee o busque cada producto, escriba cuántos hay y la app suma el total
          con el precio de costo. Al terminar lo envía por WhatsApp.</p>
        <button class="btn btn-primario btn-bloque btn-grande" data-inv="nuevo">${ico('mas')}Nuevo inventario</button>
      </div>`;
    return;
  }
  // La hoja se empezó en otra sucursal (los productos y costos son de allá)
  if (inventario.sucursalId && inventario.sucursalId !== sucursalActual) {
    const otra = nombreSucursal(inventario.sucursalId);
    v.innerHTML = `
      <div class="tarjeta inv-inicio">
        ${ico('ubicacion', 'inv-icono-grande')}
        <h2>Hoja de ${esc(otra)}</h2>
        <p class="texto-suave">Esta hoja de inventario se empezó en la sucursal <strong>${esc(otra)}</strong>
          (${inventario.lineas.length} producto${inventario.lineas.length === 1 ? '' : 's'}).
          ${esAdmin() ? 'Para seguir contando, cámbiese a esa sucursal.' : 'Termínela o bórrela para empezar una nueva.'}</p>
        ${esAdmin() ? `<button class="btn btn-primario btn-bloque btn-compacto" data-inv="ir-sucursal">${ico('ubicacion')}Ir a ${esc(otra)}</button>` : ''}
        <button class="btn-enlace" data-inv="terminar">${ico('eliminar')}Terminar y borrar hoja</button>
      </div>`;
    return;
  }
  const filas = inventario.lineas.map((l, i) => `
    <div class="hoja-fila ${i === resaltar ? 'resaltada' : ''}" data-inv="editar" data-i="${i}">
      <div class="hoja-producto">
        <span class="hoja-nombre">${esc(l.nombre)}${l.manual ? ' <span class="hoja-marca">no registrado</span>' : ''}</span>
        <small>${textoCantidad(l.cantidad)} × ${q(l.costo)}</small>
      </div>
      <div class="hoja-monto">${q(totalDeLinea(l))}</div>
    </div>`).join('');
  v.innerHTML = `
    <div class="inv-acciones-arriba">
      <button class="btn btn-primario btn-compacto" data-inv="enviar">${ico('compartir')}Enviar por WhatsApp</button>
      <button class="btn-enlace" data-inv="terminar">${ico('eliminar')}Terminar y borrar hoja</button>
    </div>
    <div class="hoja">
      <div class="hoja-encabezado">
        <button type="button" class="hoja-negocio" data-inv="negocio" aria-label="Cambiar nombre del negocio">${esc(negocioInventario().toUpperCase())}${ico('editar', 'hoja-editar')}</button>
        <div class="hoja-sub">Inventario · ${esc(fechaInventario())}</div>
        <div class="hoja-sub">Contó: ${esc(inventario.quien || '')}</div>
      </div>
      <div class="hoja-columnas"><span>Producto · cantidad × costo</span><span>Total</span></div>
      ${filas || '<p class="hoja-vacia">Escanee o busque un producto para empezar.</p>'}
      <div class="hoja-total"><span>TOTAL</span><strong>${q(totalInventario())}</strong></div>
      <p class="hoja-pie">${inventario.lineas.length} producto${inventario.lineas.length === 1 ? '' : 's'} · ${textoCantidad(unidadesInventario())} unidades
        ${inventario.lineas.length ? '<br>Toque un producto para corregir la cantidad o quitarlo.' : ''}</p>
    </div>
    <div class="botones-fila">
      <button class="btn btn-primario btn-grande" data-inv="escanear">${ico('escanear')}Escanear</button>
      <button class="btn btn-secundario btn-grande" data-inv="buscar">${ico('buscar')}Buscar</button>
    </div>`;
  if (resaltar >= 0) {
    const fila = v.querySelector(`.hoja-fila[data-i="${resaltar}"]`);
    if (fila) fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function alTocarInventario(e) {
  const el = e.target.closest('[data-inv]');
  if (!el) return;
  const accion = el.dataset.inv;
  if (accion === 'nuevo') nuevoInventario();
  else if (accion === 'ir-sucursal') cambiarSucursal(inventario.sucursalId);
  else if (accion === 'negocio') cambiarNegocioInventario();
  else if (accion === 'escanear') escanearParaInventario();
  else if (accion === 'buscar') buscarParaInventario();
  else if (accion === 'editar') editarLineaInventario(Number(el.dataset.i));
  else if (accion === 'enviar') enviarInventario();
  else if (accion === 'terminar') terminarInventario();
}

const CLAVE_ULTIMO_NEGOCIO = 'abarroterias_vc_ultimo_negocio';
const negocioInventario = () => (inventario && inventario.negocio) || 'Abarroterías VC';

/** Pide el nombre del negocio (recuerda el último que se usó). */
async function pedirNombreNegocio(titulo, textoBoton, valor) {
  return modal({
    titulo,
    html: `
      <label class="etiqueta" for="inv-negocio">¿De qué negocio es el inventario?</label>
      <input id="inv-negocio" class="input" type="text" maxlength="40" value="${esc(valor)}" placeholder="Ej. Abarroterías VC">
      <p id="inv-negocio-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: textoBoton,
        clase: 'btn-primario',
        accion: () => {
          const nombre = $('#inv-negocio').value.trim().replace(/\s+/g, ' ');
          if (!nombre) { $('#inv-negocio-error').textContent = 'Escriba el nombre del negocio.'; return MANTENER_ABIERTA; }
          return nombre;
        },
      },
    ],
    alAbrir: () => { enterEnviaModal(); $('#inv-negocio').select(); },
  });
}

const claveNegocio = () => `${CLAVE_ULTIMO_NEGOCIO}_${sucursalActual}`; // recuerda el nombre por sucursal

async function nuevoInventario() {
  let ultimo = `Abarroterías VC ${nombreSucursal()}`;
  try { ultimo = localStorage.getItem(claveNegocio()) || ultimo; } catch (_) { /* nada */ }
  const negocio = await pedirNombreNegocio('Nuevo inventario', 'Empezar', ultimo);
  if (!negocio) return;
  try { localStorage.setItem(claveNegocio(), negocio); } catch (_) { /* nada */ }
  inventario = { inicio: new Date().toISOString(), negocio, sucursalId: sucursalActual, quien: sesion.nombre, lineas: [] };
  guardarInventario();
  renderInventario();
}

async function cambiarNegocioInventario() {
  const negocio = await pedirNombreNegocio('Nombre del negocio', 'Guardar', negocioInventario());
  if (!negocio) return;
  inventario.negocio = negocio;
  try { localStorage.setItem(claveNegocio(), negocio); } catch (_) { /* nada */ }
  guardarInventario();
  renderInventario();
}

/** Suma a la hoja. Si el producto ya estaba (está en dos lados de la tienda), suma la cantidad. */
function agregarAlInventario(datosLinea, cantidad) {
  let i = datosLinea.productoId ? inventario.lineas.findIndex((l) => l.productoId === datosLinea.productoId) : -1;
  if (i >= 0) {
    const l = inventario.lineas[i];
    l.cantidad = Math.round((l.cantidad + cantidad) * 1000) / 1000;
    aviso(`Ya estaba: ahora son ${textoCantidad(l.cantidad)}`);
  } else {
    inventario.lineas.push({ ...datosLinea, cantidad });
    i = inventario.lineas.length - 1;
    aviso(`Agregado: ${textoCantidad(cantidad)} × ${datosLinea.nombre}`);
  }
  guardarInventario();
  renderInventario(i);
}

/** Al pulsar Enter en un campo, toca el botón principal de la ventana. */
function enterEnviaModal() {
  $$('#modal-cuerpo .input').forEach((input) => input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $$('#modal-botones .btn-primario').pop()?.click(); }
  }));
}

/** Muestra el precio de costo y pide la cantidad. */
async function contarProducto(p) {
  const yaContado = inventario.lineas.find((l) => l.productoId === p.id);
  const sinCosto = typeof p.precioCosto !== 'number' && !yaContado;
  const r = await modal({
    titulo: p.nombre,
    html: `
      ${sinCosto ? `
        <p class="texto-suave">Este producto no tiene precio de costo.</p>
        <label class="etiqueta" for="inv-costo">Precio de costo</label>
        <div class="input-moneda"><span>Q</span><input id="inv-costo" class="input" type="text" inputmode="decimal" placeholder="0.00"></div>
        ${esAdmin() ? '<label class="fila-check inv-check"><input type="checkbox" id="inv-guardar-costo" checked><span>Guardar este costo en el producto</span></label>' : ''}`
      : `<div class="inv-costo-grande">${q(yaContado ? yaContado.costo : p.precioCosto)}</div>
         <p class="texto-suave centrado">precio de costo</p>`}
      ${yaContado ? `<p class="inv-ya-contado">Ya contó <strong>${textoCantidad(yaContado.cantidad)}</strong>. Lo que escriba se sumará.</p>` : ''}
      <label class="etiqueta" for="inv-cantidad">¿Cuántos hay?</label>
      <input id="inv-cantidad" class="input input-cantidad" type="text" inputmode="decimal" placeholder="0" autocomplete="off">
      <p id="inv-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: 'Agregar',
        clase: 'btn-primario',
        accion: () => {
          const error = (m) => { $('#inv-error').textContent = m; return MANTENER_ABIERTA; };
          let costo = yaContado ? yaContado.costo : p.precioCosto;
          if (sinCosto) {
            costo = leerPrecio($('#inv-costo').value);
            if (costo === null || Number.isNaN(costo)) return error('Escriba el precio de costo. Ejemplo: 7.50');
          }
          const cantidad = leerCantidad($('#inv-cantidad').value);
          if (cantidad === null) return error('Escriba cuántos hay.');
          if (Number.isNaN(cantidad)) return error('La cantidad no es válida. Ejemplo: 12 o 2.5');
          return { costo, cantidad, guardarCosto: sinCosto && esAdmin() && $('#inv-guardar-costo')?.checked };
        },
      },
    ],
    alAbrir: () => { enterEnviaModal(); ($(sinCosto ? '#inv-costo' : '#inv-cantidad')).focus(); },
  });
  if (!r) return;
  if (r.guardarCosto) {
    const cambios = { precioCosto: r.costo, actualizado: new Date().toISOString(), actualizadoPor: sesion.nombre };
    ponerLocal(datos.productos, { id: p.id, ...cambios });
    enNube(fb.updateDoc(refDoc('productos', p.id), cambios));
  }
  agregarAlInventario({ productoId: p.id, codigo: p.codigo || '', nombre: p.nombre, costo: r.costo, manual: false }, r.cantidad);
}

/**
 * Producto que no está en la lista:
 * - administrador: lo registra en la lista de productos y lo cuenta;
 * - trabajador: lo agrega a la hoja marcado "no registrado" (el administrador lo registra después).
 */
async function productoNuevoEnInventario(codigo = '') {
  const admin = esAdmin();
  const r = await modal({
    titulo: admin ? 'Registrar producto' : 'Producto no registrado',
    html: `
      ${codigo ? `<p class="texto-suave">Código: <strong>${esc(codigo)}</strong></p>` : ''}
      <p class="texto-suave">${admin
        ? 'Este producto no está en la lista. Regístrelo y se agrega a la hoja.'
        : 'Este producto no está en la lista. Agréguelo a la hoja; el administrador lo registrará después.'}</p>
      <label class="etiqueta" for="inv-n-nombre">Nombre del producto</label>
      <input id="inv-n-nombre" class="input" type="text" maxlength="80" placeholder="Ej. Galletas María 200 g">
      <div class="dos-columnas">
        <div>
          <label class="etiqueta" for="inv-n-costo">Precio de costo</label>
          <div class="input-moneda"><span>Q</span><input id="inv-n-costo" class="input" type="text" inputmode="decimal" placeholder="0.00"></div>
        </div>
        ${admin ? `<div>
          <label class="etiqueta" for="inv-n-venta">Precio de venta</label>
          <div class="input-moneda"><span>Q</span><input id="inv-n-venta" class="input" type="text" inputmode="decimal" placeholder="Sugerido"></div>
        </div>` : '<div></div>'}
      </div>
      <label class="etiqueta" for="inv-n-cantidad">¿Cuántos hay?</label>
      <input id="inv-n-cantidad" class="input input-cantidad" type="text" inputmode="decimal" placeholder="0" autocomplete="off">
      <p id="inv-n-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: admin ? 'Registrar' : 'Agregar',
        clase: 'btn-primario',
        accion: () => {
          const error = (m) => { $('#inv-n-error').textContent = m; return MANTENER_ABIERTA; };
          const nombre = $('#inv-n-nombre').value.trim().replace(/\s+/g, ' ');
          if (!nombre) return error('Escriba el nombre del producto.');
          const costo = leerPrecio($('#inv-n-costo').value);
          if (costo === null || Number.isNaN(costo)) return error('Escriba el precio de costo. Ejemplo: 7.50');
          let venta = null;
          if (admin) {
            venta = leerPrecio($('#inv-n-venta').value);
            if (Number.isNaN(venta)) return error('El precio de venta no es válido. Ejemplo: 9.50');
            if (venta === null) venta = ventaSugerida(costo);
          }
          const cantidad = leerCantidad($('#inv-n-cantidad').value);
          if (cantidad === null) return error('Escriba cuántos hay.');
          if (Number.isNaN(cantidad)) return error('La cantidad no es válida. Ejemplo: 12 o 2.5');
          return { nombre, costo, venta, cantidad };
        },
      },
    ],
    alAbrir: () => { enterEnviaModal(); $('#inv-n-nombre').focus(); },
  });
  if (!r) return;
  if (admin) {
    const ahora = new Date().toISOString();
    const ref = fb.doc(refColeccion('productos'));
    const nuevo = {
      codigo, nombre: r.nombre, precioVenta: r.venta, precioCosto: r.costo, lugarCompra: '', categoriaId: null,
      creado: ahora, actualizado: ahora, actualizadoPor: sesion.nombre,
    };
    ponerLocal(datos.productos, { id: ref.id, ...nuevo });
    enNube(fb.setDoc(ref, nuevo));
    agregarAlInventario({ productoId: ref.id, codigo, nombre: r.nombre, costo: r.costo, manual: false }, r.cantidad);
  } else {
    agregarAlInventario({ productoId: null, codigo, nombre: r.nombre, costo: r.costo, manual: true }, r.cantidad);
  }
}

function escanearParaInventario() {
  abrirEscaner((codigo) => {
    const p = productoPorCodigo(codigo);
    if (p) contarProducto(p);
    else productoNuevoEnInventario(codigo);
  });
}

async function buscarParaInventario() {
  const resultados = (texto) => {
    const t = normalizar(texto);
    const c = limpiarCodigo(texto);
    const lista = ordenarPorNombre(datos.productos.filter((p) => !t ||
      normalizar(p.nombre).includes(t) || (c && (p.codigo || '').includes(c)))).slice(0, 40);
    if (!lista.length) return '<p class="texto-suave centrado">No se encontraron productos.</p>';
    return lista.map((p) => `
      <button type="button" class="inv-resultado" data-id="${esc(p.id)}">
        <span>${esc(p.nombre)}</span>
        <span class="inv-resultado-costo">${typeof p.precioCosto === 'number' ? q(p.precioCosto) : 'sin costo'}</span>
      </button>`).join('');
  };
  const elegido = await modal({
    titulo: 'Buscar producto',
    html: `
      <div class="buscador">
        ${ico('buscar', 'buscador-icono')}
        <input id="inv-buscar" class="input" type="search" placeholder="Nombre o código" autocomplete="off">
      </div>
      <div id="inv-resultados" class="inv-resultados">${resultados('')}</div>
      <button type="button" class="btn btn-contorno btn-bloque" data-nuevo>${ico('mas')}No está en la lista</button>`,
    botones: [{ texto: 'Cerrar', clase: 'btn-secundario', valor: null }],
    alAbrir: (cerrar) => {
      const input = $('#inv-buscar');
      input.addEventListener('input', () => { $('#inv-resultados').innerHTML = resultados(input.value); });
      $('#inv-resultados').addEventListener('click', (e) => {
        const b = e.target.closest('[data-id]');
        if (b) cerrar(b.dataset.id);
      });
      $('#modal-cuerpo [data-nuevo]').addEventListener('click', () => cerrar('__nuevo'));
      input.focus();
    },
  });
  if (!elegido) return;
  if (elegido === '__nuevo') productoNuevoEnInventario('');
  else {
    const p = productoPorId(elegido);
    if (p) contarProducto(p);
  }
}

async function editarLineaInventario(i) {
  const l = inventario.lineas[i];
  if (!l) return;
  const r = await modal({
    titulo: l.nombre,
    html: `
      ${l.manual ? `
        <label class="etiqueta" for="inv-e-nombre">Nombre</label>
        <input id="inv-e-nombre" class="input" type="text" maxlength="80" value="${esc(l.nombre)}">
        <label class="etiqueta" for="inv-e-costo">Precio de costo</label>
        <div class="input-moneda"><span>Q</span><input id="inv-e-costo" class="input" type="text" inputmode="decimal" value="${esc(precioTexto(l.costo))}"></div>`
      : `<p class="texto-suave">Precio de costo: <strong>${q(l.costo)}</strong></p>`}
      <label class="etiqueta" for="inv-e-cantidad">Cantidad</label>
      <input id="inv-e-cantidad" class="input input-cantidad" type="text" inputmode="decimal" value="${esc(textoCantidad(l.cantidad))}" autocomplete="off">
      <p id="inv-e-error" class="error" role="alert"></p>`,
    botones: [
      { texto: 'Cancelar', clase: 'btn-secundario', valor: null },
      {
        texto: 'Guardar',
        clase: 'btn-primario',
        accion: () => {
          const error = (m) => { $('#inv-e-error').textContent = m; return MANTENER_ABIERTA; };
          const cantidad = leerCantidad($('#inv-e-cantidad').value);
          if (cantidad === null || Number.isNaN(cantidad)) return error('Escriba una cantidad válida. Ejemplo: 12 o 2.5');
          const cambios = { cantidad };
          if (l.manual) {
            const nombre = $('#inv-e-nombre').value.trim().replace(/\s+/g, ' ');
            const costo = leerPrecio($('#inv-e-costo').value);
            if (!nombre) return error('Escriba el nombre.');
            if (costo === null || Number.isNaN(costo)) return error('Escriba el precio de costo. Ejemplo: 7.50');
            Object.assign(cambios, { nombre, costo });
          }
          return { accion: 'guardar', cambios };
        },
      },
      { texto: 'Quitar de la hoja', clase: 'btn-quitar', valor: { accion: 'quitar' } },
    ],
    alAbrir: () => { enterEnviaModal(); $('#inv-e-cantidad').select(); },
  });
  if (!r) return;
  if (r.accion === 'guardar') {
    Object.assign(l, r.cambios);
    guardarInventario();
    aviso('Corregido');
    renderInventario(i);
  } else if (r.accion === 'quitar' && await confirmar('Quitar producto', `¿Quitar "${l.nombre}" de la hoja?`, 'Quitar', true)) {
    inventario.lineas.splice(i, 1);
    guardarInventario();
    aviso('Quitado de la hoja');
    renderInventario();
  }
}

async function terminarInventario() {
  const ok = await confirmar('Terminar inventario',
    inventario.lineas.length
      ? 'Se borrará la hoja de este teléfono. ¿Ya la envió por WhatsApp?'
      : '¿Borrar esta hoja de inventario?',
    'Sí, borrar', true);
  if (!ok) return;
  inventario = null;
  guardarInventario();
  renderInventario();
}

/* ---- Ticket en PDF (como los de supermercado) ---- */
const TICKET_ANCHO = 864;        // píxeles (80 mm de papel)
const TICKET_ALTO_MAXIMO = 9000; // si es más largo, sigue en otra página del PDF
const TICKET_PAPEL_MM = 80;

/** Arma las filas del ticket: texto de ancho fijo, como una impresora de supermercado. */
function filasTicket(columnas) {
  const filas = [];
  const mayus = (t) => String(t).toUpperCase();
  const dinero = (n) => formatoQ.format(n);
  const linea = (car) => ({ t: car.repeat(columnas) });
  const ambos = (izq, der, cols = columnas) => {
    const espacio = cols - der.length - 1;
    const i = izq.length > espacio ? izq.slice(0, espacio - 1) + '…' : izq;
    return i + ' '.repeat(cols - i.length - der.length) + der;
  };
  const partir = (texto, cols) => {
    const palabras = texto.split(' ');
    const salida = [];
    let actual = '';
    for (const p of palabras) {
      if ((actual + ' ' + p).trim().length <= cols) actual = (actual + ' ' + p).trim();
      else {
        if (actual) salida.push(actual);
        actual = p.length > cols ? p.slice(0, cols) : p;
      }
    }
    if (actual) salida.push(actual);
    return salida;
  };
  const f = new Date(inventario.inicio);
  const fecha = f.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = f.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false });
  const codigo = 'INV-' + f.toISOString().slice(0, 16).replace(/[-:T]/g, '');

  partir(mayus(negocioInventario()), Math.floor(columnas / 1.6)).forEach((t) => filas.push({ t, centro: true, tam: 1.6, negrita: true }));
  filas.push({ t: 'INVENTARIO DE MERCADERÍA', centro: true });
  filas.push({ t: '(PRECIOS DE COSTO)', centro: true });
  filas.push({ t: '', alto: 0.5 });
  filas.push(linea('-'));
  filas.push({ t: ambos(`FECHA: ${fecha}`, `HORA: ${hora}`) });
  filas.push({ t: `CONTÓ: ${mayus(inventario.quien || '')}` });
  filas.push({ t: `No.: ${codigo}` });
  filas.push(linea('-'));
  filas.push({ t: ambos('DESCRIPCIÓN', 'TOTAL'), negrita: true });
  filas.push({ t: ambos('  CANT x COSTO', ''), negrita: true });
  filas.push(linea('-'));
  inventario.lineas.forEach((l) => {
    partir(mayus(l.nombre) + (l.manual ? ' *' : ''), columnas).forEach((t) => filas.push({ t }));
    filas.push({ t: ambos(`  ${textoCantidad(l.cantidad)} x ${dinero(l.costo)}`, dinero(totalDeLinea(l))) });
  });
  filas.push(linea('-'));
  filas.push({ t: ambos('PRODUCTOS:', String(inventario.lineas.length)) });
  filas.push({ t: ambos('UNIDADES:', textoCantidad(unidadesInventario())) });
  filas.push(linea('='));
  filas.push({ izq: 'TOTAL', der: 'Q ' + dinero(totalInventario()), tam: 1.6, negrita: true });
  filas.push(linea('='));
  if (inventario.lineas.some((l) => l.manual)) {
    filas.push({ t: '* PRODUCTO NO REGISTRADO EN LA APP' });
  }
  filas.push({ t: '', alto: 0.6 });
  filas.push({ t: '*** FIN DEL INVENTARIO ***', centro: true, negrita: true });
  filas.push({ t: '', alto: 0.4 });
  filas.push({ barras: codigo });
  filas.push({ t: codigo, centro: true, tam: 0.85 });
  return filas;
}

/** Dibuja el ticket en una o varias páginas (canvas). */
function dibujarTicket() {
  const W = TICKET_ANCHO;
  const BORDE = 22;           // fondo gris alrededor del papel
  const MARGEN = 34;          // margen dentro del papel
  const TAM = 27;             // tamaño de letra normal
  const ALTO_LINEA = 38;
  const fuente = (tam, negrita) => `${negrita ? 700 : 400} ${Math.round(tam)}px ${LETRA_TICKET}, "Courier New", Courier, monospace`;
  const medida = document.createElement('canvas').getContext('2d');
  medida.font = fuente(TAM, true);
  const anchoLetra = medida.measureText('M').width;
  const columnas = Math.floor((W - 2 * BORDE - 2 * MARGEN) / anchoLetra);
  const filas = filasTicket(columnas);
  const altoDe = (fila) => (fila.barras ? 90 : ALTO_LINEA * (fila.alto ?? (fila.tam || 1)));

  // Repartir filas en páginas
  const paginas = [[]];
  let alto = 0;
  filas.forEach((fila) => {
    if (alto + altoDe(fila) > TICKET_ALTO_MAXIMO - 140 && paginas[paginas.length - 1].length) { paginas.push([]); alto = 0; }
    paginas[paginas.length - 1].push(fila);
    alto += altoDe(fila);
  });

  return paginas.map((filasPagina, n) => {
    const primera = n === 0;
    const ultima = n === paginas.length - 1;
    const extraArriba = primera ? 0 : ALTO_LINEA * 1.5;
    const H = Math.ceil(2 * BORDE + 50 + extraArriba + filasPagina.reduce((s, f) => s + altoDe(f), 0) + 40);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext('2d');
    // Fondo gris y papel con cortes en zigzag (como ticket arrancado)
    c.fillStyle = '#e4e6ea';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fffefa';
    c.beginPath();
    const diente = 14;
    c.moveTo(BORDE, BORDE + (primera ? diente : 0));
    for (let x = BORDE; x < W - BORDE; x += diente * 2) {
      c.lineTo(x + diente, primera ? BORDE : BORDE);
      c.lineTo(Math.min(x + diente * 2, W - BORDE), BORDE + (primera ? diente : 0));
    }
    c.lineTo(W - BORDE, H - BORDE - (ultima ? diente : 0));
    for (let x = W - BORDE; x > BORDE; x -= diente * 2) {
      c.lineTo(x - diente, H - BORDE);
      c.lineTo(Math.max(x - diente * 2, BORDE), H - BORDE - (ultima ? diente : 0));
    }
    c.closePath();
    c.shadowColor = 'rgba(0,0,0,0.18)';
    c.shadowBlur = 12;
    c.fill();
    c.shadowBlur = 0;

    let y = BORDE + 46;
    c.fillStyle = '#1b1b1b';
    c.textBaseline = 'alphabetic';
    if (!primera) {
      c.font = fuente(TAM * 0.9, true);
      c.textAlign = 'center';
      c.fillText(`${negocioInventario().toUpperCase()} · CONTINUACIÓN (PÁG. ${n + 1})`, W / 2, y);
      y += ALTO_LINEA * 1.5;
    }
    filasPagina.forEach((fila) => {
      if (fila.barras) {
        // Código de barras decorativo (como los tickets)
        let x = W / 2 - 220;
        const semilla = fila.barras.split('').map((ch) => ch.charCodeAt(0));
        for (let k = 0; x < W / 2 + 220; k++) {
          const ancho = 2 + (semilla[k % semilla.length] + k) % 4;
          if (k % 2 === 0) c.fillRect(x, y - 30, ancho, 70);
          x += ancho;
        }
        y += 90;
        return;
      }
      const tam = fila.tam || 1;
      c.font = fuente(TAM * tam, fila.negrita);
      if (fila.izq !== undefined) {
        // Texto a la izquierda y monto pegado al borde derecho (TOTAL)
        c.textAlign = 'left';
        c.fillText(fila.izq, BORDE + MARGEN, y);
        c.textAlign = 'right';
        c.fillText(fila.der, BORDE + MARGEN + columnas * anchoLetra, y);
      } else if (fila.centro) { c.textAlign = 'center'; c.fillText(fila.t, W / 2, y); }
      else {
        // Ancho fijo: cada letra en su columna (como impresora)
        c.textAlign = 'left';
        const paso = anchoLetra * tam;
        const x0 = BORDE + MARGEN;
        [...fila.t].forEach((ch, k) => { if (ch !== ' ') c.fillText(ch, x0 + k * paso, y); });
      }
      y += altoDe(fila);
    });
    return canvas;
  });
}

/** Imagen JPEG en bytes, sin esperas (el iPhone pide compartir justo después del toque). */
function canvasAJpeg(canvas) {
  const binario = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
  const bytes = new Uint8Array(binario.length);
  for (let k = 0; k < binario.length; k++) bytes[k] = binario.charCodeAt(k);
  return bytes;
}

/** Arma un PDF sencillo: una página por imagen, de 80 mm de ancho (como papel de ticket). */
function crearPdf(paginas) {
  const cod = new TextEncoder();
  const partes = [];
  let largo = 0;
  const posiciones = [];
  const poner = (x) => { const b = typeof x === 'string' ? cod.encode(x) : x; partes.push(b); largo += b.length; };
  const objeto = (n, ...contenido) => { posiciones[n] = largo; poner(`${n} 0 obj\n`); contenido.forEach(poner); poner('\nendobj\n'); };
  const anchoPt = (TICKET_PAPEL_MM / 25.4) * 72;
  const total = 2 + paginas.length * 3;

  poner('%PDF-1.4\n');
  poner(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const hijos = paginas.map((_, k) => `${3 + k * 3} 0 R`).join(' ');
  objeto(2, `<< /Type /Pages /Kids [${hijos}] /Count ${paginas.length} >>`);
  paginas.forEach((pg, k) => {
    const nPag = 3 + k * 3;
    const altoPt = (pg.alto * anchoPt) / pg.ancho;
    const w = anchoPt.toFixed(2);
    const h = altoPt.toFixed(2);
    objeto(nPag, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${k} ${nPag + 1} 0 R >> >> /Contents ${nPag + 2} 0 R >>`);
    objeto(nPag + 1, `<< /Type /XObject /Subtype /Image /Width ${pg.ancho} /Height ${pg.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`, pg.jpeg, '\nendstream');
    const dibujo = `q ${w} 0 0 ${h} 0 0 cm /Im${k} Do Q`;
    objeto(nPag + 2, `<< /Length ${dibujo.length} >>\nstream\n${dibujo}\nendstream`);
  });
  const inicioXref = largo;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) xref += `${String(posiciones[n]).padStart(10, '0')} 00000 n \n`;
  poner(xref);
  poner(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  return new Blob(partes, { type: 'application/pdf' });
}

async function enviarInventario() {
  if (!inventario.lineas.length) {
    alerta('Hoja vacía', 'Agregue al menos un producto antes de enviar.');
    return;
  }
  // La letra ya se cargó al abrir el inventario; si no, se espera (casi nunca pasa)
  if (document.fonts && !document.fonts.check(`27px ${LETRA_TICKET}`)) await cargarLetraTicket();
  const paginas = dibujarTicket().map((canvas) => ({ jpeg: canvasAJpeg(canvas), ancho: canvas.width, alto: canvas.height }));
  const pdf = crearPdf(paginas);
  const nombreArchivo = `inventario-${normalizar(negocioInventario()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date(inventario.inicio).toISOString().slice(0, 10)}.pdf`;
  const archivo = new File([pdf], nombreArchivo, { type: 'application/pdf' });
  const titulo = `Inventario ${negocioInventario()} · Total: ${q(totalInventario())}`;
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cerró el menú sin enviar
      console.warn('No se pudo compartir', e);
    }
  }
  // Si el teléfono no puede compartir archivos: se descarga el PDF
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  aviso('PDF descargado: envíelo por WhatsApp');
}

cargarInventario();

/* ---------------- Respaldo ---------------- */
async function exportarRespaldo() {
  const contenido = JSON.stringify({
    app: 'abarroterias-san-vicenta', version: 3, fecha: new Date().toISOString(), sucursal: nombreSucursal(),
    categorias: datos.categorias, productos: datos.productos,
  }, null, 2);
  const hoy = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `respaldo-${sucursalActual}-${hoy}.json`;
  const archivo = new File([contenido], nombreArchivo, { type: 'application/json' });

  // En el teléfono se puede compartir directo (WhatsApp, Drive, correo…)
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Respaldo Abarroterías VC' });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  aviso('Respaldo descargado');
}

/** Revisa y limpia los datos de un respaldo (o de la versión anterior de la app). */
function limpiarRespaldo(d) {
  if (!d || !Array.isArray(d.productos) || !Array.isArray(d.categorias)) throw new Error('formato');
  const idValido = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
  const categorias = d.categorias
    .filter((c) => c && idValido(String(c.id)) && typeof c.nombre === 'string' && c.nombre.trim())
    .map((c) => ({ id: String(c.id), nombre: c.nombre.trim() }));
  const productos = d.productos
    .filter((p) => p && typeof p.nombre === 'string' && p.nombre.trim() && typeof p.precioVenta === 'number')
    .map((p) => ({
      id: idValido(String(p.id)) ? String(p.id) : fb.doc(refColeccion('productos')).id,
      codigo: limpiarCodigo(p.codigo),
      nombre: p.nombre.trim(),
      precioVenta: p.precioVenta,
      precioCosto: typeof p.precioCosto === 'number' ? p.precioCosto : null,
      lugarCompra: String(p.lugarCompra || ''),
      categoriaId: p.categoriaId ? String(p.categoriaId) : null,
      creado: p.creado || null,
      actualizado: p.actualizado || null,
      actualizadoPor: p.actualizadoPor || null,
      aliasFactura: Array.isArray(p.aliasFactura) ? p.aliasFactura.filter((a) => typeof a === 'string').slice(-10) : [],
    }));
  return { categorias, productos };
}

/** Sube a la nube productos y categorías (agrega o actualiza; no borra los demás). */
async function subirDatos({ categorias, productos }) {
  const ops = [
    ...categorias.map((c) => (l) => l.set(refDoc('categorias', c.id), { nombre: c.nombre })),
    ...productos.map(({ id, ...p }) => (l) => l.set(refDoc('productos', id), p)),
  ];
  await escribirEnGrupos(ops);
}

async function importarRespaldo(archivo) {
  let contenido;
  try {
    contenido = limpiarRespaldo(JSON.parse(await archivo.text()));
  } catch (_) {
    alerta('Archivo no válido', 'Ese archivo no es un respaldo de Abarroterías VC.');
    return;
  }
  const ok = await confirmar('Cargar respaldo',
    `El archivo tiene ${contenido.productos.length} productos y ${contenido.categorias.length} categorías. Se agregarán a la sucursal ${nombreSucursal()} (los que ya existen se actualizan con los datos del archivo). ¿Continuar?`,
    'Cargar');
  if (!ok) return;
  aviso('Subiendo respaldo…');
  try {
    await subirDatos(contenido);
    aviso('Respaldo cargado ✔');
  } catch (e) {
    console.error(e);
    alerta('No se pudo cargar', mensajeError(e));
  }
}

/** Datos guardados en el teléfono por la versión anterior de la app (sin nube). */
function leerDatosAnteriores() {
  try {
    if (localStorage.getItem(CLAVE_MIGRADO)) return null;
    const d = JSON.parse(localStorage.getItem(CLAVE_DATOS_ANTERIORES) || 'null');
    if (!d || !Array.isArray(d.productos) || !d.productos.length) return null;
    return limpiarRespaldo(d);
  } catch (_) {
    return null;
  }
}

let migracionOfrecida = false;
async function ofrecerMigracion() {
  if (migracionOfrecida || !esAdmin()) return;
  const anteriores = leerDatosAnteriores();
  if (!anteriores) return;
  migracionOfrecida = true;
  const ok = await confirmar('Productos guardados en este teléfono',
    `Este teléfono tiene ${anteriores.productos.length} productos de la versión anterior de la app. ¿Subirlos a la nube para que todos los vean?`,
    'Subir a la nube');
  if (!ok) return;
  aviso('Subiendo productos…');
  try {
    await subirDatos(anteriores);
    localStorage.setItem(CLAVE_MIGRADO, new Date().toISOString());
    aviso(`${anteriores.productos.length} productos subidos ✔`);
  } catch (e) {
    console.error(e);
    alerta('No se pudieron subir', mensajeError(e) + ' Se lo preguntaré de nuevo la próxima vez.');
    migracionOfrecida = false;
  }
}

/* ---------------- Eventos ---------------- */
function conectarEventos() {
  // Acceso
  $$('#acceso-elegir [data-rol]').forEach((b) => b.addEventListener('click', () => mostrarPasoAcceso('login', b.dataset.rol)));
  $('#login-regresar').addEventListener('click', () => mostrarPasoAcceso('elegir'));
  $('#form-login').addEventListener('submit', iniciarSesion);
  $('#form-primer-admin').addEventListener('submit', crearPrimerAdmin);

  // Navegación inferior
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => irAPestana(b.dataset.vista)));
  $('#btn-atras').addEventListener('click', () => history.back());

  // Escanear
  $('#btn-escanear').addEventListener('click', () =>
    abrirEscaner((codigo) => abrirCodigo(codigo, 'replace'), { reemplazar: true }));
  $('#btn-cerrar-escaner').addEventListener('click', cerrarEscaner);
  $('#form-codigo-manual').addEventListener('submit', (e) => {
    e.preventDefault();
    const codigo = limpiarCodigo($('#codigo-manual').value);
    if (!codigo) { $('#codigo-manual').focus(); return; }
    $('#codigo-manual').value = '';
    $('#codigo-manual').blur();
    abrirCodigo(codigo);
  });
  $('#btn-nuevo-sin-codigo').addEventListener('click', () => navegar({ vista: 'formulario' }));
  $('#btn-factura').addEventListener('click', escanearFactura);
  $('#foto-factura').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (archivo) procesarFactura(archivo);
  });
  $('#btn-llave-ia').addEventListener('click', configurarLlave);
  $('#f-vincular-btn').addEventListener('click', vincularCodigo);
  $('#vista-inventario').addEventListener('click', alTocarInventario);
  $('#lista-temas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tema]');
    if (b) elegirTema(b.dataset.tema);
  });
  // Sucursales (solo administradores)
  $('#chip-usuario').addEventListener('click', () => { if (esAdmin()) elegirSucursal(); });
  $('#btn-nueva-sucursal').addEventListener('click', agregarSucursal);
  $('#lista-sucursales').addEventListener('click', (e) => {
    const el = e.target.closest('[data-suc]');
    if (el) cambiarSucursal(el.dataset.suc);
  });
  $('#vista-factura').addEventListener('input', alCambiarFactura);
  $('#vista-factura').addEventListener('change', alCambiarFactura);
  $('#vista-factura').addEventListener('click', (e) => {
    if (e.target.closest('#fa-guardar')) guardarFactura();
    else if (e.target.closest('#fa-cancelar')) cancelarFactura();
  });

  // Lista de productos
  $('#buscar').addEventListener('input', renderListaProductos);
  $$('.selector-opcion').forEach((b) => b.addEventListener('click', () => cambiarModoBusqueda(b.dataset.modo)));
  $('#filtro-categorias').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filtroCategoria = chip.dataset.cat;
    renderProductos();
  });
  $('#lista-productos').addEventListener('click', async (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el) return;
    const { accion, id } = el.dataset;
    if (accion === 'ver') navegar({ vista: 'detalle', id });
    else if (accion === 'editar') navegar({ vista: 'formulario', id });
    else if (accion === 'eliminar') { if (await eliminarProducto(id)) renderProductos(); }
    else if (accion === 'ir-escanear') irAPestana('escanear');
  });
  $('#btn-agregar-producto').addEventListener('click', () => navegar({ vista: 'formulario' }));

  // Formulario
  $('#form-producto').addEventListener('submit', guardarFormulario);
  $('#f-cancelar').addEventListener('click', () => history.back());
  $('#f-venta').addEventListener('input', actualizarGanancia);
  $('#f-costo').addEventListener('input', actualizarGanancia);
  $('#f-escanear').addEventListener('click', () =>
    abrirEscaner((codigo) => {
      $('#f-codigo').value = codigo;
      const otro = productoPorCodigo(codigo, formularioEstado && formularioEstado.id);
      $('#f-error').textContent = otro ? `Ese código ya está registrado en "${otro.nombre}".` : '';
    }));
  $('#f-categoria').addEventListener('change', async (e) => {
    const select = e.target;
    if (select.value !== '__nueva') { select.dataset.anterior = select.value; return; }
    const nombre = await pedirTexto('Nueva categoría', '', 'Ej. Panadería');
    const cat = nombre ? crearCategoria(nombre) : null;
    llenarSelectCategorias(cat ? cat.id : select.dataset.anterior);
  });

  // Categorías
  $('#form-nueva-categoria').addEventListener('submit', (e) => {
    e.preventDefault();
    if (crearCategoria($('#nueva-categoria').value)) {
      $('#nueva-categoria').value = '';
      renderCategorias();
    }
  });
  $('#lista-categorias').addEventListener('click', (e) => {
    const el = e.target.closest('[data-accion]');
    if (!el) return;
    const { accion, id } = el.dataset;
    if (accion === 'editar') editarCategoria(id);
    else if (accion === 'eliminar') eliminarCategoria(id);
    else if (accion === 'filtrar') { filtroCategoria = id; $('#buscar').value = ''; irAPestana('productos'); }
  });

  // Ajustes
  $('#btn-mi-clave').addEventListener('click', cambiarMiClave);
  $('#btn-salir').addEventListener('click', async () => {
    if (await confirmar('Cerrar sesión', '¿Desea salir? Para volver a entrar necesitará su usuario y contraseña.', 'Salir')) cerrarSesion();
  });
  $('#btn-nuevo-usuario').addEventListener('click', nuevoUsuario);
  $('#lista-usuarios').addEventListener('click', (e) => {
    const el = e.target.closest('[data-accion="usuario"]');
    if (el) opcionesUsuario(el.dataset.id);
  });
  $('#btn-exportar').addEventListener('click', exportarRespaldo);
  $('#btn-importar').addEventListener('click', () => $('#archivo-importar').click());
  $('#archivo-importar').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (archivo) importarRespaldo(archivo);
  });

  // Espacio que deja libre el teclado del teléfono (para que las ventanas no queden tapadas)
  if (window.visualViewport) {
    const ajustarAlTeclado = () => {
      const vv = window.visualViewport;
      document.documentElement.style.setProperty('--alto-visible', `${Math.round(vv.height)}px`);
      document.documentElement.style.setProperty('--arriba-visible', `${Math.round(vv.offsetTop)}px`);
    };
    window.visualViewport.addEventListener('resize', ajustarAlTeclado);
    window.visualViewport.addEventListener('scroll', ajustarAlTeclado);
    ajustarAlTeclado();
  }

  // Aviso de sin internet
  const actualizarConexion = () => {
    $('#banda-sin-internet').classList.toggle('oculto', navigator.onLine);
    if (sesion && (history.state || {}).vista === 'ajustes') renderAjustes();
  };
  window.addEventListener('online', actualizarConexion);
  window.addEventListener('offline', actualizarConexion);
  actualizarConexion();
}

/* ---------------- Funcionamiento sin internet ---------------- */
function registrarServiceWorker() {
  if (USAR_EMULADOR) return;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    // Si ya había una versión instalada y llega una nueva, la app se recarga sola con la nueva
    // (la primera instalación no recarga: no había versión anterior)
    let controlador = navigator.serviceWorker.controller;
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const habiaVersion = !!controlador;
      controlador = navigator.serviceWorker.controller;
      if (!habiaVersion || recargando) return;
      recargando = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((registro) => {
      // El iPhone deja la app abierta en memoria: al volver a ella, revisar si hay versión nueva
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registro.update().catch(() => {});
      });
    }).catch((e) => console.warn('Service worker no registrado', e));
  }
}

/** Pide al navegador que no borre la copia local de los datos. */
async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (_) { /* no es crítico */ }
}

aplicarTema(temaActual());
conectarEventos();
registrarServiceWorker();
pedirAlmacenamientoPersistente();
