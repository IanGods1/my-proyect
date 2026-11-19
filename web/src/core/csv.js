// Lectura y escritura de CSV (separador coma, punto y coma o tabulación).

function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    if (!inQuotes && c === '\n') break;
    if (!inQuotes && c in counts) counts[c]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] === 0 ? ',' : best[0];
}

export function parseCsv(input) {
  const text = String(input).replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // se ignora
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function escapeField(value, delimiter) {
  const needs = [...value].some((c) => c === delimiter || c === '"' || c === '\n' || c === '\r');
  return needs ? '"' + value.replace(/"/g, '""') + '"' : value;
}

/** Con BOM UTF-8 para que Excel reconozca los acentos. */
export function writeCsv(rows, delimiter = ',') {
  return '﻿' + rows.map((r) => r.map((v) => escapeField(String(v ?? ''), delimiter)).join(delimiter)).join('\r\n') + '\r\n';
}
