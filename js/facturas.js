/* ============================================================
   Lectura de facturas con inteligencia artificial (Claude, de Anthropic)
   - La llave (API key) se guarda SOLO en este teléfono (localStorage),
     nunca en la nube ni en GitHub. Solo la usan los administradores.
   - La foto se reduce de tamaño antes de enviarla (más rápido y barato).
   ============================================================ */
import Anthropic from '../lib/anthropic.js';

const MODELO = 'claude-opus-5-5';
const LADO_MAXIMO = 1600; // píxeles del lado más largo de la foto

function crearCliente(llave) {
  // La llave vive solo en el teléfono del administrador (ver arriba)
  return new Anthropic({ apiKey: llave, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/** Revisa que la llave funcione (no gasta saldo). */
export async function probarLlave(llave) {
  await crearCliente(llave).models.retrieve(MODELO);
}

/** Reduce la foto y la convierte a JPEG en base64. */
export async function prepararFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((resolver, rechazar) => {
      const i = new Image();
      i.onload = () => resolver(i);
      i.onerror = () => rechazar(new Error('foto-invalida'));
      i.src = url;
    });
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

const anulable = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] });

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['esFactura', 'proveedor', 'fecha', 'lineas', 'advertencias'],
  properties: {
    esFactura: { type: 'boolean' },
    proveedor: anulable('string'),
    fecha: anulable('string'),
    lineas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['descripcion', 'nombre', 'cantidad', 'unidadesPorPaquete', 'totalLinea', 'costoUnitario', 'productoId', 'categoriaId', 'confianza', 'nota'],
        properties: {
          descripcion: { type: 'string' },
          nombre: { type: 'string' },
          cantidad: anulable('number'),
          unidadesPorPaquete: anulable('number'),
          totalLinea: anulable('number'),
          costoUnitario: anulable('number'),
          productoId: anulable('string'),
          categoriaId: anulable('string'),
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
          nota: anulable('string'),
        },
      },
    },
    advertencias: { type: 'array', items: { type: 'string' } },
  },
};

const INSTRUCCIONES = `Eres el asistente de una abarrotería en Guatemala. Recibes la foto de una factura, recibo o nota de entrega de un proveedor y extraes los productos comprados para registrar su PRECIO DE COSTO por unidad.

Reglas:
- Si la imagen no es una factura o recibo de compra, devuelve esFactura=false y lineas vacías.
- Una línea por cada producto. No incluyas subtotales, totales, impuestos, fletes, descuentos generales ni datos del cliente. Si hay un descuento por producto, aplícalo al costo y menciónalo en "nota".
- "descripcion": el texto del producto tal como aparece en la factura.
- "nombre": un nombre claro en español con marca, presentación y tamaño, por ejemplo "Coca-Cola 600 ml" o "Frijol negro Ducal 400 g". Si la línea corresponde a un producto existente, usa el nombre del producto existente.
- "cantidad": cuántas unidades o paquetes se compraron, según la factura.
- "unidadesPorPaquete": si se compra por fardo, caja, docena, paquete o display (ej. "x12", "24/1", "caja 6 u"), cuántas unidades individuales trae cada uno; si se compra por unidad, 1; si no se sabe, null.
- "totalLinea": el total en quetzales de esa línea, tal como aparece.
- "costoUnitario": lo que cuesta UNA unidad individual para vender en la tienda, en quetzales, con impuestos incluidos como se pagaron. Calcúlalo así: precio por paquete ÷ unidadesPorPaquete (o totalLinea ÷ unidades totales). Redondea a 2 decimales. Si no puedes calcularlo, null.
- "productoId": el id del producto de la lista de productos registrados SOLO si estás seguro de que es el mismo producto (misma marca, presentación y tamaño). Las abreviaturas de la factura y los alias guardados ayudan. Si dudas, null: es mejor crear uno nuevo que confundir productos.
- "categoriaId": el id de la categoría más adecuada de la lista de categorías, o null si ninguna sirve.
- "confianza": "alta" si leíste todo claro; "media" si adivinaste algo; "baja" si la línea es difícil de leer o el costo por unidad es dudoso. Explica la duda en "nota" (en español, corto).
- "proveedor": el nombre del proveedor o tienda que vende. "fecha": la fecha de la factura como aparece, o null.
- "advertencias": problemas generales en español (foto borrosa, factura cortada, líneas ilegibles).
- No inventes productos ni precios que no estén en la imagen.`;

function textoDeListas(productos, categorias) {
  const lineasProductos = productos
    .map((p) => {
      const alias = Array.isArray(p.aliasFactura) && p.aliasFactura.length ? ` | alias: ${p.aliasFactura.slice(-5).join(' ; ')}` : '';
      return `${p.id} | ${p.nombre}${alias}`;
    })
    .join('\n');
  const lineasCategorias = categorias.map((c) => `${c.id} | ${c.nombre}`).join('\n');
  return `CATEGORÍAS (id | nombre):\n${lineasCategorias || '(ninguna)'}\n\nPRODUCTOS REGISTRADOS (id | nombre | alias en facturas anteriores):\n${lineasProductos || '(ninguno todavía)'}`;
}

/** Errores en palabras sencillas. */
export function mensajeErrorIA(e) {
  if (e instanceof Anthropic.APIUserAbortError) return null; // cancelado por la persona
  if (e instanceof Anthropic.AuthenticationError) return 'La llave de la inteligencia artificial no es válida. Revísela en Ajustes.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'La llave no tiene permiso para usar este servicio. Revise su cuenta de Anthropic.';
  if (e instanceof Anthropic.RateLimitError) return 'Se enviaron muchas facturas seguidas. Espere un minuto e intente de nuevo.';
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit|balance|saldo/i.test(e.message || '')) return 'Su cuenta de Anthropic no tiene saldo. Recárguela en console.anthropic.com → Billing.';
    return 'No se pudo leer la foto. Intente con otra foto más clara.';
  }
  if (e instanceof Anthropic.APIConnectionError) return 'No hay internet. Para leer facturas se necesita conexión.';
  if (e instanceof Anthropic.InternalServerError) return 'El servicio está ocupado en este momento. Intente de nuevo en unos minutos.';
  if (e instanceof Anthropic.APIError) return `Error del servicio (${e.status}). Intente de nuevo.`;
  if (e && e.message === 'foto-invalida') return 'No se pudo abrir la foto. Intente con otra.';
  if (e && e.message === 'respuesta-invalida') return 'No se pudo entender la factura. Intente con una foto más clara.';
  if (e && e.message === 'rechazado') return 'El servicio no pudo procesar esta imagen. Intente con otra foto.';
  return 'Ocurrió un error: ' + ((e && e.message) || e);
}

/**
 * Lee la factura y devuelve { esFactura, proveedor, fecha, lineas[], advertencias[] }.
 * signal: para cancelar desde la pantalla.
 */
export async function leerFactura(llave, fotoBase64, { productos, categorias }, signal) {
  const cliente = crearCliente(llave);
  const stream = cliente.beta.messages.stream({
    model: MODELO,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    system: INSTRUCCIONES,
    messages: [{
      role: 'user',
      content: [
        // La lista de productos cambia poco: se guarda en caché unos minutos (más barato si lee varias facturas seguidas)
        { type: 'text', text: textoDeListas(productos, categorias), cache_control: { type: 'ephemeral' } },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fotoBase64 } },
        { type: 'text', text: 'Extrae los productos de esta factura.' },
      ],
    }],
  }, { signal });
  const respuesta = await stream.finalMessage();

  if (respuesta.stop_reason === 'refusal') throw new Error('rechazado');
  const texto = respuesta.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (_) {
    throw new Error('respuesta-invalida');
  }
  if (!datos || !Array.isArray(datos.lineas)) throw new Error('respuesta-invalida');
  if (respuesta.stop_reason === 'max_tokens') {
    datos.advertencias = [...(datos.advertencias || []), 'La factura es muy larga: puede que falten productos al final.'];
  }
  // Solo ids que existen de verdad
  const idsProductos = new Set(productos.map((p) => p.id));
  const idsCategorias = new Set(categorias.map((c) => c.id));
  datos.lineas = datos.lineas.map((l) => ({
    ...l,
    productoId: idsProductos.has(l.productoId) ? l.productoId : null,
    categoriaId: idsCategorias.has(l.categoriaId) ? l.categoriaId : null,
    costoUnitario: typeof l.costoUnitario === 'number' && l.costoUnitario >= 0 ? Math.round(l.costoUnitario * 100) / 100 : null,
  }));
  return datos;
}
