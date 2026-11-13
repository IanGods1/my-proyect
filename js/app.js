/* ============================================================
   Abarroterías San Vicenta — Control de precios
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

const refDoc = (...ruta) => fb.doc(db, ...ruta);
const refColeccion = (nombre) => fb.collection(db, nombre);

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);
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

const datos = { categorias: [], productos: [], usuarios: [] };
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
    sesion = { uid: usuario.uid, email: usuario.email, nombre: u.nombre, usuario: u.usuario, rol: u.rol };
    if (!appIniciada) iniciarSesionEnApp();
    else if (rolAnterior !== sesion.rol) { aviso('Su tipo de usuario cambió'); reiniciarApp(); }
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
  $('#chip-usuario').textContent = (esAdmin() ? '👑 ' : '👤 ') + String(sesion.nombre).split(' ')[0];
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
  if (esAdmin()) setTimeout(ofrecerMigracion, 1500);
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
  mostrar(estado, { sinScroll: true });
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
    $('#login-titulo').textContent = rol === 'admin' ? '👑 Entrar como Administrador' : '👤 Entrar como Trabajador';
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
    // Categorías iniciales (si no hay datos anteriores en el teléfono que las traigan)
    if (!leerDatosAnteriores()) {
      const ops = CATEGORIAS_INICIALES.map((n) => (l) => l.set(fb.doc(refColeccion('categorias')), { nombre: n }));
      escribirEnGrupos(ops).catch((err) => console.error(err));
    }
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
  formulario: 'Producto',
};
const PESTANAS = ['escanear', 'productos', 'categorias', 'ajustes'];
const SOLO_ADMIN = ['categorias', 'formulario'];
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
    ${sinCosto && esAdmin() ? `<div class="resumen-item" style="grid-column:1/-1"><span>⚠️ ${sinCosto} producto(s) sin precio de costo</span></div>` : ''}
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
          <button class="btn btn-primario" data-accion="ir-escanear">📷 Escanear el primero</button></li>`
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
        <button class="btn-icono-peq" data-accion="editar" data-id="${p.id}" aria-label="Editar">✏️</button>
        <button class="btn-icono-peq peligro" data-accion="eliminar" data-id="${p.id}" aria-label="Eliminar">🗑️</button>
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
      <button class="btn btn-primario btn-grande" id="d-editar">✏️ Editar</button>
      <button class="btn btn-peligro btn-grande" id="d-eliminar">🗑️ Eliminar</button>
    </div>` : ''}
    <button class="btn btn-secundario btn-bloque btn-grande" id="d-escanear">📷 Escanear otro</button>
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
      <div class="grande">🔎</div>
      <h2>Producto no registrado</h2>
      <p class="texto-suave">Este código todavía no está en la lista de precios:</p>
      <div class="codigo-grande">${esc(codigo || '')}</div>
      <p><strong>Avise al administrador</strong> para que lo registre.</p>
    </div>
    <button class="btn btn-primario btn-bloque btn-grande" id="nr-escanear">📷 Escanear otro</button>
  `;
  $('#nr-escanear').onclick = () => abrirEscaner((c) => abrirCodigo(c, 'replace'), { reemplazar: true });
}

/* ---------------- Pantalla: Formulario (solo administradores) ---------------- */
let formularioEstado = null;

function llenarSelectCategorias(seleccion) {
  const opciones = ordenarPorNombre([...datos.categorias])
    .map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  $('#f-categoria').innerHTML = `<option value="">Sin categoría</option>${opciones}<option value="__nueva">➕ Crear nueva categoría…</option>`;
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
  // Si ya viene el código, enfocar el nombre
  setTimeout(() => (($('#f-codigo').value && !p) ? $('#f-nombre') : null)?.focus(), 150);
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
          <button class="btn-icono-peq" data-accion="editar" data-id="${c.id}" aria-label="Editar">✏️</button>
          <button class="btn-icono-peq peligro" data-accion="eliminar" data-id="${c.id}" aria-label="Eliminar">🗑️</button>
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

/* ---------------- Pantalla: Ajustes ---------------- */
function renderAjustes() {
  $('#info-cuenta').innerHTML = `${esc(sesion.nombre)} · usuario <strong>${esc(sesion.usuario)}</strong><br>
    <span class="etiqueta-rol ${sesion.rol}">${esAdmin() ? '👑 Administrador' : '👤 Trabajador'}</span>`;
  $('#info-datos').innerHTML = `${datos.productos.length} productos y ${datos.categorias.length} categorías en la nube.<br>
    ${navigator.onLine ? '🟢 Conectado: los cambios se comparten al momento.' : '📴 Sin internet: los cambios se subirán cuando vuelva la señal.'}`;
  if (esAdmin()) renderUsuarios();
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
      : `<span class="etiqueta-rol ${u.rol}">${u.rol === 'admin' ? '👑 Administrador' : '👤 Trabajador'}</span>`;
    const yo = u.uid === sesion.uid ? ' (usted)' : '';
    return `
      <li class="item ${u.activo ? '' : 'inactivo'}">
        <div class="item-info" data-accion="usuario" data-id="${u.uid}">
          <div class="item-nombre">${esc(u.nombre)}${yo}</div>
          <div class="item-sub">usuario: ${esc(u.usuario)} · ${etiqueta}</div>
        </div>
        ${u.uid === sesion.uid ? '' : `<button class="btn-icono-peq" data-accion="usuario" data-id="${u.uid}" aria-label="Opciones">⋯</button>`}
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
        <option value="trabajador">👤 Trabajador (solo ve y escanea)</option>
        <option value="admin">👑 Administrador (control total)</option>
      </select>
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
            lote.set(refDoc('usuarios', uid), { nombre, usuario, rol, activo: true, creado: new Date().toISOString() });
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
    alAbrir: () => $('#nu-nombre').focus(),
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
        <button class="btn btn-secundario btn-bloque" data-op="clave">🔑 Cambiar contraseña</button>
        ${u.activo ? `<button class="btn btn-secundario btn-bloque" data-op="rol">${otroRol === 'admin' ? '👑 Hacer administrador' : '👤 Hacer trabajador'}</button>` : ''}
        <button class="btn ${u.activo ? 'btn-peligro' : 'btn-exito'} btn-bloque" data-op="activo">${u.activo ? '⛔ Desactivar (ya no podrá entrar)' : '✅ Activar de nuevo'}</button>
      </div>`,
    botones: [{ texto: 'Cerrar', clase: 'btn-contorno', valor: null }],
    alAbrir: (cerrar) => {
      $$('#modal-cuerpo [data-op]').forEach((b) => b.addEventListener('click', () => cerrar(b.dataset.op)));
    },
  });
  if (eleccion === 'clave') cambiarClaveDe(u);
  else if (eleccion === 'rol') {
    const texto = otroRol === 'admin'
      ? `¿Hacer administrador a ${u.nombre}? Podrá cambiar precios, borrar productos y manejar usuarios.`
      : `¿Hacer trabajador a ${u.nombre}? Solo podrá ver y escanear.`;
    if (await confirmar('Cambiar tipo de usuario', texto, 'Sí, cambiar')) {
      enNube(fb.updateDoc(refDoc('usuarios', uid), { rol: otroRol }));
      aviso('Tipo de usuario cambiado');
    }
  } else if (eleccion === 'activo') {
    if (u.activo && !(await confirmar('Desactivar usuario', `${u.nombre} ya no podrá entrar a la app. Si tiene la app abierta, se le cerrará la sesión.`, 'Desactivar', true))) return;
    enNube(fb.updateDoc(refDoc('usuarios', uid), { activo: !u.activo }));
    aviso(u.activo ? 'Usuario desactivado' : 'Usuario activado');
  }
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

/* ---------------- Respaldo ---------------- */
async function exportarRespaldo() {
  const contenido = JSON.stringify({
    app: 'abarroterias-san-vicenta', version: 2, fecha: new Date().toISOString(),
    categorias: datos.categorias, productos: datos.productos,
  }, null, 2);
  const hoy = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `respaldo-san-vicenta-${hoy}.json`;
  const archivo = new File([contenido], nombreArchivo, { type: 'application/json' });

  // En el teléfono se puede compartir directo (WhatsApp, Drive, correo…)
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: 'Respaldo San Vicenta' });
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
    alerta('Archivo no válido', 'Ese archivo no es un respaldo de Abarroterías San Vicenta.');
    return;
  }
  const ok = await confirmar('Cargar respaldo',
    `El archivo tiene ${contenido.productos.length} productos y ${contenido.categorias.length} categorías. Se agregarán a la nube (los que ya existen se actualizan con los datos del archivo). ¿Continuar?`,
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
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
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

conectarEventos();
registrarServiceWorker();
pedirAlmacenamientoPersistente();
