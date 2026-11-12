/* ============================================================
   Abarroterías San Vicenta — Control de precios
   Toda la información se guarda en el teléfono (localStorage),
   así que la app funciona sin internet.
   ============================================================ */
'use strict';

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

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function aviso(mensaje) {
  const el = $('#aviso');
  el.textContent = mensaje;
  el.classList.add('visible');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => el.classList.remove('visible'), 2200);
}

/* ---------------- Datos (guardados en el teléfono) ---------------- */
const CLAVE_DATOS = 'abarroterias_san_vicenta_v1';
const CATEGORIAS_INICIALES = ['Bebidas', 'Lácteos', 'Snacks', 'Limpieza', 'Granos básicos'];

let datos = { categorias: [], productos: [] };

function cargarDatos() {
  try {
    const guardado = localStorage.getItem(CLAVE_DATOS);
    if (guardado) {
      const d = JSON.parse(guardado);
      datos.categorias = Array.isArray(d.categorias) ? d.categorias : [];
      datos.productos = Array.isArray(d.productos) ? d.productos : [];
      return;
    }
  } catch (e) {
    console.error('No se pudieron leer los datos', e);
  }
  // Primera vez que se abre la app
  datos.categorias = CATEGORIAS_INICIALES.map((nombre) => ({ id: nuevoId(), nombre }));
  datos.productos = [];
  guardarDatos();
}

function guardarDatos() {
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
    return true;
  } catch (e) {
    console.error(e);
    alerta('No se pudo guardar', 'El teléfono no tiene espacio o el navegador bloqueó el guardado.');
    return false;
  }
}

/** Pide al navegador que no borre los datos automáticamente. */
async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const ya = await navigator.storage.persisted();
      if (!ya) await navigator.storage.persist();
    }
  } catch (_) { /* no es crítico */ }
}

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
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

/* ---------------- Ventanas emergentes ---------------- */
function modal({ titulo, html = '', botones, alAbrir }) {
  return new Promise((resolver) => {
    const caja = $('#modal');
    $('#modal-titulo').textContent = titulo;
    $('#modal-cuerpo').innerHTML = html;
    const cont = $('#modal-botones');
    cont.innerHTML = '';
    const cerrar = (valor) => {
      caja.classList.add('oculto');
      resolver(valor);
    };
    botones.forEach((b) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.clase || 'btn-secundario');
      btn.textContent = b.texto;
      btn.addEventListener('click', () => cerrar(typeof b.valor === 'function' ? b.valor() : b.valor));
      cont.appendChild(btn);
    });
    caja.classList.remove('oculto');
    if (alAbrir) alAbrir(cerrar);
  });
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
      { texto: 'Guardar', clase: 'btn-primario', valor: () => $('#modal-input').value.trim() },
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

/* ---------------- Escáner de código de barras ---------------- */
const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];

const Escaner = {
  activo: false,
  stream: null,
  lectorZXing: null,
  temporizador: null,
  conHistorial: false,

  async iniciar(alLeer) {
    this.activo = true;
    const video = $('#video');
    $('#escaner-mensaje').textContent = 'Apunte la cámara al código de barras';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('sin-soporte');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (!this.activo) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;

    const avisarLectura = (codigo) => {
      if (!this.activo) return;
      this.detener();
      sonidoLectura();
      alLeer(limpiarCodigo(codigo));
    };

    // 1) Detector nativo del teléfono (rápido, disponible en Android/Chrome)
    const detector = await crearDetectorNativo();
    if (detector) {
      video.srcObject = stream;
      await video.play();
      const buscar = async () => {
        if (!this.activo) return;
        try {
          if (video.readyState >= 2) {
            const resultados = await detector.detect(video);
            if (resultados.length && resultados[0].rawValue) return avisarLectura(resultados[0].rawValue);
          }
        } catch (_) { /* seguir intentando */ }
        this.temporizador = setTimeout(buscar, 150);
      };
      buscar();
      return;
    }

    // 2) Lector ZXing incluido en la app (funciona en iPhone y sin internet)
    if (!window.ZXing) throw new Error('sin-lector');
    const Z = window.ZXing;
    const pistas = new Map();
    pistas.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
      Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_93, Z.BarcodeFormat.ITF,
      Z.BarcodeFormat.CODABAR, Z.BarcodeFormat.QR_CODE,
    ]);
    this.lectorZXing = new Z.BrowserMultiFormatReader(pistas, 200);
    await this.lectorZXing.decodeFromStream(stream, video, (resultado) => {
      if (resultado) avisarLectura(resultado.getText());
    });
  },

  detener() {
    this.activo = false;
    clearTimeout(this.temporizador);
    if (this.lectorZXing) {
      try { this.lectorZXing.reset(); } catch (_) { /* nada */ }
      this.lectorZXing = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    const video = $('#video');
    video.pause();
    video.srcObject = null;
  },
};

async function crearDetectorNativo() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats();
    const formatos = FORMATOS_NATIVOS.filter((f) => soportados.includes(f));
    if (!formatos.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats: formatos });
  } catch (_) {
    return null;
  }
}

function sonidoLectura() {
  try { if (navigator.vibrate) navigator.vibrate(120); } catch (_) { /* nada */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = sonidoLectura.ctx || (sonidoLectura.ctx = new Ctx());
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 1400;
    vol.gain.value = 0.15;
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (_) { /* nada */ }
}

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
    const yaCancelado = $('#escaner').classList.contains('oculto');
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
  respaldo: 'Respaldo',
  detalle: 'Datos del producto',
  formulario: 'Producto',
};
const PESTANAS = ['escanear', 'productos', 'categorias', 'respaldo'];
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

function mostrar(estado) {
  let vista = estado?.vista || 'escanear';
  if (vista === 'detalle' && !productoPorId(estado.id)) vista = 'productos';
  if (vista === 'formulario' && estado.id && !productoPorId(estado.id)) vista = 'productos';

  $$('.vista').forEach((v) => v.classList.add('oculto'));
  $('#vista-' + vista).classList.remove('oculto');

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
    case 'respaldo': renderRespaldo(); break;
    case 'detalle': renderDetalle(estado.id); break;
    case 'formulario': renderFormulario(estado); break;
  }
  window.scrollTo(0, 0);
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
  // Botón "atrás" con una ventana emergente abierta: solo se cierra
  if (!$('#modal').classList.contains('oculto')) {
    $('#modal').classList.add('oculto');
  }
  mostrar(e.state || { vista: pestanaActual });
});

/* ---------------- Pantalla: Escanear ---------------- */
function abrirCodigo(codigo, modo = 'push') {
  codigo = limpiarCodigo(codigo);
  if (!codigo) return;
  const existente = productoPorCodigo(codigo);
  if (existente) {
    navegar({ vista: 'detalle', id: existente.id }, modo);
  } else {
    navegar({ vista: 'formulario', codigo }, modo);
    aviso('Producto nuevo: regístrelo');
  }
}

function renderEscanear() {
  const total = datos.productos.length;
  const sinCosto = datos.productos.filter((p) => p.precioCosto === null || p.precioCosto === undefined).length;
  $('#resumen').innerHTML = `
    <div class="resumen-item"><strong>${total}</strong><span>productos</span></div>
    <div class="resumen-item"><strong>${datos.categorias.length}</strong><span>categorías</span></div>
    ${sinCosto ? `<div class="resumen-item" style="grid-column:1/-1"><span>⚠️ ${sinCosto} producto(s) sin precio de costo</span></div>` : ''}
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

function productosFiltrados() {
  const texto = normalizar($('#buscar').value);
  const textoCodigo = limpiarCodigo($('#buscar').value);
  return ordenarPorNombre(datos.productos.filter((p) => {
    if (filtroCategoria === 'sin' && categoriaPorId(p.categoriaId)) return false;
    if (filtroCategoria !== 'todas' && filtroCategoria !== 'sin' && p.categoriaId !== filtroCategoria) return false;
    if (!texto) return true;
    return normalizar(p.nombre).includes(texto) || (textoCodigo && (p.codigo || '').includes(textoCodigo));
  }));
}

function renderListaProductos() {
  const lista = productosFiltrados();
  const total = datos.productos.length;
  $('#conteo-productos').textContent = total
    ? `Mostrando ${lista.length} de ${total} producto${total === 1 ? '' : 's'}`
    : '';

  if (!total) {
    $('#lista-productos').innerHTML = `
      <li class="vacio">Todavía no hay productos.<br>
        <button class="btn btn-primario" data-accion="ir-escanear">📷 Escanear el primero</button>
      </li>`;
    return;
  }
  if (!lista.length) {
    $('#lista-productos').innerHTML = '<li class="vacio">No se encontraron productos.</li>';
    return;
  }
  $('#lista-productos').innerHTML = lista.map((p) => `
    <li class="item">
      <div class="item-info" data-accion="ver" data-id="${p.id}">
        <div class="item-nombre">${esc(p.nombre)}</div>
        <div class="item-sub"><span class="etiqueta-cat">${esc(nombreCategoria(p.categoriaId))}</span></div>
        <div class="item-precio">${q(p.precioVenta)}</div>
      </div>
      <div class="item-acciones">
        <button class="btn-icono-peq" data-accion="editar" data-id="${p.id}" aria-label="Editar">✏️</button>
        <button class="btn-icono-peq peligro" data-accion="eliminar" data-id="${p.id}" aria-label="Eliminar">🗑️</button>
      </div>
    </li>`).join('');
}

function renderProductos() {
  renderFiltros();
  renderListaProductos();
}

async function eliminarProducto(id) {
  const p = productoPorId(id);
  if (!p) return false;
  const ok = await confirmar('Eliminar producto', `¿Seguro que desea eliminar "${p.nombre}"? Esta acción no se puede deshacer.`, 'Eliminar', true);
  if (!ok) return false;
  datos.productos = datos.productos.filter((x) => x.id !== id);
  guardarDatos();
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
  const g = textoGanancia(p.precioVenta, p.precioCosto);
  const fecha = p.actualizado ? new Date(p.actualizado).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
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
      <div class="detalle-fila"><span>Última modificación</span><span>${esc(fecha)}</span></div>
    </div>
    <div class="botones-fila">
      <button class="btn btn-primario btn-grande" id="d-editar">✏️ Editar</button>
      <button class="btn btn-peligro btn-grande" id="d-eliminar">🗑️ Eliminar</button>
    </div>
    <button class="btn btn-secundario btn-bloque btn-grande" id="d-escanear">📷 Escanear otro</button>
  `;
  $('#d-editar').onclick = () => navegar({ vista: 'formulario', id: p.id });
  $('#d-eliminar').onclick = async () => {
    if (await eliminarProducto(p.id)) history.back();
  };
  $('#d-escanear').onclick = () => abrirEscaner((codigo) => abrirCodigo(codigo, 'replace'), { reemplazar: true });
}

/* ---------------- Pantalla: Formulario ---------------- */
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
  const precio = (n) => (n === null || n === undefined ? '' : n.toFixed(2));

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
  };

  if (idActual) {
    const p = productoPorId(idActual);
    Object.assign(p, registro);
    if (!guardarDatos()) return;
    aviso('Cambios guardados ✔');
    history.back();
  } else {
    const nuevo = { id: nuevoId(), creado: registro.actualizado, ...registro };
    datos.productos.push(nuevo);
    if (!guardarDatos()) return;
    aviso('Producto guardado ✔');
    navegar({ vista: 'detalle', id: nuevo.id }, 'replace');
  }
}

/* ---------------- Pantalla: Categorías ---------------- */
function nombreCategoriaRepetido(nombre, excluirId) {
  const n = normalizar(nombre);
  return datos.categorias.some((c) => c.id !== excluirId && normalizar(c.nombre) === n);
}

function crearCategoria(nombre) {
  nombre = (nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre) return null;
  if (nombreCategoriaRepetido(nombre)) {
    alerta('Categoría repetida', `Ya existe una categoría llamada "${nombre}".`);
    return null;
  }
  const cat = { id: nuevoId(), nombre };
  datos.categorias.push(cat);
  guardarDatos();
  aviso('Categoría creada');
  return cat;
}

function renderCategorias() {
  const cats = ordenarPorNombre([...datos.categorias]);
  if (!cats.length) {
    $('#lista-categorias').innerHTML = '<li class="vacio">No hay categorías. Agregue una arriba.</li>';
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
  const nombre = await pedirTexto('Cambiar nombre', c.nombre, 'Nombre de la categoría');
  if (!nombre || nombre === c.nombre) return;
  if (nombreCategoriaRepetido(nombre, id)) return alerta('Categoría repetida', `Ya existe una categoría llamada "${nombre}".`);
  c.nombre = nombre.replace(/\s+/g, ' ');
  guardarDatos();
  aviso('Categoría actualizada');
  renderCategorias();
}

async function eliminarCategoria(id) {
  const c = categoriaPorId(id);
  if (!c) return;
  const n = datos.productos.filter((p) => p.categoriaId === id).length;
  const mensaje = n
    ? `La categoría "${c.nombre}" tiene ${n} producto(s). Los productos NO se borrarán, quedarán como "Sin categoría". ¿Continuar?`
    : `¿Eliminar la categoría "${c.nombre}"?`;
  if (!(await confirmar('Eliminar categoría', mensaje, 'Eliminar', true))) return;
  datos.categorias = datos.categorias.filter((x) => x.id !== id);
  datos.productos.forEach((p) => { if (p.categoriaId === id) p.categoriaId = null; });
  guardarDatos();
  aviso('Categoría eliminada');
  renderCategorias();
}

/* ---------------- Pantalla: Respaldo ---------------- */
async function renderRespaldo() {
  let persistente = '';
  try {
    if (navigator.storage && navigator.storage.persisted) {
      persistente = (await navigator.storage.persisted())
        ? '✅ El teléfono protege estos datos para que no se borren solos.'
        : 'ℹ️ Recomendación: instale la app en la pantalla de inicio y guarde respaldos seguido.';
    }
  } catch (_) { /* nada */ }
  $('#info-datos').innerHTML = `${datos.productos.length} productos y ${datos.categorias.length} categorías guardados en este teléfono.<br>${persistente}`;
}

async function exportarRespaldo() {
  const contenido = JSON.stringify({ app: 'abarroterias-san-vicenta', version: 1, fecha: new Date().toISOString(), ...datos }, null, 2);
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

async function importarRespaldo(archivo) {
  try {
    const d = JSON.parse(await archivo.text());
    if (!Array.isArray(d.productos) || !Array.isArray(d.categorias)) throw new Error('formato');
    const productos = d.productos
      .filter((p) => p && typeof p.nombre === 'string' && typeof p.precioVenta === 'number')
      .map((p) => ({
        id: String(p.id || nuevoId()),
        codigo: limpiarCodigo(p.codigo),
        nombre: p.nombre,
        precioVenta: p.precioVenta,
        precioCosto: typeof p.precioCosto === 'number' ? p.precioCosto : null,
        lugarCompra: String(p.lugarCompra || ''),
        categoriaId: p.categoriaId ? String(p.categoriaId) : null,
        creado: p.creado || null,
        actualizado: p.actualizado || null,
      }));
    const categorias = d.categorias
      .filter((c) => c && c.id && typeof c.nombre === 'string')
      .map((c) => ({ id: String(c.id), nombre: c.nombre }));

    const ok = await confirmar('Cargar respaldo',
      `El archivo tiene ${productos.length} productos y ${categorias.length} categorías. Esto REEMPLAZARÁ los datos actuales de este teléfono. ¿Continuar?`,
      'Reemplazar', true);
    if (!ok) return;
    datos = { categorias, productos };
    guardarDatos();
    aviso('Respaldo cargado ✔');
    renderRespaldo();
  } catch (_) {
    alerta('Archivo no válido', 'Ese archivo no es un respaldo de Abarroterías San Vicenta.');
  }
}

/* ---------------- Eventos ---------------- */
function conectarEventos() {
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

  // Respaldo
  $('#btn-exportar').addEventListener('click', exportarRespaldo);
  $('#btn-importar').addEventListener('click', () => $('#archivo-importar').click());
  $('#archivo-importar').addEventListener('change', (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (archivo) importarRespaldo(archivo);
  });

  // Si otra pestaña del navegador cambia los datos, recargarlos
  window.addEventListener('storage', (e) => {
    if (e.key === CLAVE_DATOS) { cargarDatos(); mostrar(history.state); }
  });
}

/* ---------------- Funcionamiento sin internet ---------------- */
function registrarServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
  }
}

/* ---------------- Inicio ---------------- */
function iniciar() {
  cargarDatos();
  conectarEventos();
  pedirAlmacenamientoPersistente();
  registrarServiceWorker();
  history.replaceState({ vista: 'escanear' }, '');
  mostrar({ vista: 'escanear' });
}

document.addEventListener('DOMContentLoaded', iniciar);
