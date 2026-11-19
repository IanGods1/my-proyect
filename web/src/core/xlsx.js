// Lector/escritor mínimo de archivos Excel (.xlsx). Lee la primera hoja del libro.
// No soporta el formato antiguo .xls. Usa un analizador XML propio (sin DOM) para funcionar igual
// en el navegador y en las pruebas.
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

export function isXlsx(bytes) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
}

/** Formato antiguo de Excel (.xls, OLE2). */
export function isLegacyXls(bytes) {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

// ---------------------------------------------------------------- XML

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const local = (name) => name.slice(name.indexOf(':') + 1);

/** Recorre el XML llamando a onEvent({type: 'start'|'end'|'text', name?, attrs?, text?}). */
function walkXml(xml, onEvent) {
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      onEvent({ type: 'text', text: decodeEntities(xml.slice(i)) });
      break;
    }
    if (lt > i) onEvent({ type: 'text', text: decodeEntities(xml.slice(i, lt)) });
    if (xml.startsWith('<!--', lt)) {
      const e = xml.indexOf('-->', lt);
      i = e === -1 ? n : e + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt);
      onEvent({ type: 'text', text: xml.slice(lt + 9, e === -1 ? n : e) });
      i = e === -1 ? n : e + 3;
    } else if (xml.startsWith('<?', lt)) {
      const e = xml.indexOf('?>', lt);
      i = e === -1 ? n : e + 2;
    } else if (xml.startsWith('<!', lt)) {
      const e = xml.indexOf('>', lt);
      i = e === -1 ? n : e + 1;
    } else {
      // Fin de la etiqueta, respetando comillas dentro de los atributos.
      let j = lt + 1;
      let quote = null;
      for (; j < n; j++) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === '>') {
          break;
        }
      }
      let body = xml.slice(lt + 1, j);
      i = j + 1;
      if (body.startsWith('/')) {
        onEvent({ type: 'end', name: local(body.slice(1).trim()) });
        continue;
      }
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const nameMatch = /^\s*([^\s/>]+)/.exec(body);
      if (!nameMatch) continue;
      const attrs = {};
      const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      const rest = body.slice(nameMatch[0].length);
      let m;
      while ((m = attrRe.exec(rest))) attrs[local(m[1])] = decodeEntities(m[2] ?? m[3] ?? '');
      const name = local(nameMatch[1]);
      onEvent({ type: 'start', name, attrs });
      if (selfClose) onEvent({ type: 'end', name });
    }
  }
}

// ---------------------------------------------------------------- Lectura

function parseSharedStrings(xml) {
  const list = [];
  let current = '';
  let inSi = false;
  let inT = false;
  let inPhonetic = false;
  walkXml(xml, (ev) => {
    if (ev.type === 'start') {
      if (ev.name === 'si') {
        inSi = true;
        current = '';
      } else if (ev.name === 't') inT = true;
      else if (ev.name === 'rPh') inPhonetic = true;
    } else if (ev.type === 'end') {
      if (ev.name === 'si') {
        inSi = false;
        list.push(current);
      } else if (ev.name === 't') inT = false;
      else if (ev.name === 'rPh') inPhonetic = false;
    } else if (inSi && inT && !inPhonetic) {
      current += ev.text;
    }
  });
  return list;
}

/** "B12" -> 1 */
function columnIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    if (/[a-zA-Z]/.test(ch)) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
    else break;
  }
  return n - 1;
}

/** "13.0" -> "13" para que los números se vean como en Excel. */
function formatNumber(raw) {
  const t = raw.trim();
  const d = Number(t);
  if (t === '' || !Number.isFinite(d)) return t;
  return Number.isInteger(d) && Math.abs(d) < 1e15 ? String(d) : t;
}

function parseSheet(xml, shared) {
  const rows = new Map();
  let rowIndex = -1;
  let nextCol = 0;
  let cellCol = 0;
  let cellType = null;
  let value = '';
  let collecting = false;
  let hasValue = false;

  walkXml(xml, (ev) => {
    if (ev.type === 'start') {
      if (ev.name === 'row') {
        const r = parseInt(ev.attrs.r, 10);
        rowIndex = Number.isFinite(r) ? r - 1 : rowIndex + 1;
        nextCol = 0;
      } else if (ev.name === 'c') {
        cellCol = ev.attrs.r ? columnIndex(ev.attrs.r) : nextCol;
        nextCol = cellCol + 1;
        cellType = ev.attrs.t ?? null;
        value = '';
        hasValue = false;
      } else if (ev.name === 'v' || ev.name === 't') {
        collecting = true;
        hasValue = true;
      }
    } else if (ev.type === 'end') {
      if (ev.name === 'v' || ev.name === 't') collecting = false;
      else if (ev.name === 'c' && hasValue) {
        let text;
        if (cellType === 's') text = shared[parseInt(value.trim(), 10)] ?? '';
        else if (cellType === 'inlineStr' || cellType === 'str') text = value;
        else if (cellType === 'b') text = value.trim() === '1' ? 'VERDADERO' : 'FALSO';
        else if (cellType === 'e') text = '';
        else text = formatNumber(value);
        if (rowIndex >= 0) {
          if (!rows.has(rowIndex)) rows.set(rowIndex, new Map());
          rows.get(rowIndex).set(cellCol, text);
        }
      }
    } else if (collecting) {
      value += ev.text;
    }
  });

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, cells]) => {
      const max = Math.max(...cells.keys());
      return Array.from({ length: max + 1 }, (_, c) => cells.get(c) ?? '');
    });
}

/** Busca la primera hoja según workbook.xml; si no puede, toma la primera hoja por nombre. */
function firstSheetPath(files) {
  try {
    const workbook = files['xl/workbook.xml'];
    const rels = files['xl/_rels/workbook.xml.rels'];
    if (workbook && rels) {
      let relId = null;
      walkXml(strFromU8(workbook), (ev) => {
        if (relId === null && ev.type === 'start' && ev.name === 'sheet') relId = ev.attrs.id ?? null;
      });
      let target = null;
      walkXml(strFromU8(rels), (ev) => {
        if (ev.type === 'start' && ev.name === 'Relationship' && ev.attrs.Id === relId) target = ev.attrs.Target;
      });
      if (target) {
        const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
        if (files[path]) return path;
      }
    }
  } catch {
    // se usa el método alternativo
  }
  return (
    Object.keys(files)
      .filter((k) => k.startsWith('xl/worksheets/') && k.endsWith('.xml'))
      .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0] ?? null
  );
}

/** @param {Uint8Array} bytes @returns {string[][]} */
export function readXlsx(bytes) {
  const files = unzipSync(bytes, { filter: (f) => f.name.endsWith('.xml') || f.name.endsWith('.rels') });
  const shared = files['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(files['xl/sharedStrings.xml'])) : [];
  const sheet = firstSheetPath(files);
  if (!sheet) throw new Error('El archivo Excel no contiene hojas');
  return parseSheet(strFromU8(files[sheet]), shared);
}

// ---------------------------------------------------------------- Escritura

function escapeXml(s) {
  let out = '';
  for (const ch of s) {
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch >= ' ' || ch === '\n' || ch === '\t') out += ch;
  }
  return out;
}

function columnName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** @param {string[][]} rows @returns {Uint8Array} */
export function writeXlsx(rows, sheetName = 'Datos') {
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const sheet = [
    head,
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    ...rows.map((row, r) => {
      const cells = row
        .map((v, c) =>
          v === '' || v == null
            ? ''
            : `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(v))}</t></is></c>`,
        )
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }),
    '</sheetData></worksheet>',
  ].join('');
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  });
}
