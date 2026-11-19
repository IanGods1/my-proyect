// Convierte una tabla (de CSV o Excel) en filas de importación.
// Columnas: tipo, grupo, modelo, nota (y opcionales: marca, variante).
import { normalize, clean } from './text.js';
import { parseType, parseVariant } from './variants.js';

export const HEADER = ['tipo', 'grupo', 'modelo', 'nota', 'marca', 'variante'];

const aliases = {
  tipo: ['tipo', 'type', 'categoria'],
  grupo: ['grupo', 'group', 'nombregrupo', 'nombredelgrupo'],
  modelo: ['modelo', 'model', 'modelos', 'telefono', 'celular'],
  nota: ['nota', 'notas', 'note', 'observacion', 'observaciones', 'comentario'],
  marca: ['marca', 'brand', 'fabricante'],
  variante: ['variante', 'variant', 'clase', 'subtipo', 'tipodevidrio', 'clasedevidrio'],
};

/** @returns {{rows: Array<{type: string|null, group: string, model: string, note: string, brand: string, variant: string}>, errors: string[]}} */
export function parseTable(table) {
  const rows = table.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (rows.length === 0) return { rows: [], errors: ['El archivo está vacío'] };

  const first = rows[0].map((c) => normalize(c));
  const hasHeader = first.some((c) => aliases.tipo.includes(c) || aliases.modelo.includes(c));

  const index = { tipo: 0, grupo: 1, modelo: 2, nota: 3, marca: 4, variante: 5 };
  if (hasHeader) {
    for (const key of Object.keys(index)) index[key] = first.findIndex((c) => aliases[key].includes(c));
    if (index.modelo === -1) return { rows: [], errors: ['No se encontró la columna "modelo" en el encabezado'] };
  }

  const result = [];
  const errors = [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const firstLine = hasHeader ? 2 : 1;
  dataRows.forEach((r, i) => {
    const line = firstLine + i;
    const cell = (key) => {
      const idx = index[key];
      return idx >= 0 && idx < r.length ? clean(r[idx]) : '';
    };
    const typeText = cell('tipo');
    const group = cell('grupo');
    const model = cell('modelo');
    const note = cell('nota');
    const brand = cell('marca');
    const variantText = cell('variante');

    if (!model) {
      if (typeText || group) errors.push(`Fila ${line}: falta el modelo`);
      return;
    }
    if (!group) {
      // Fila sin grupo: solo registra el modelo.
      result.push({ type: null, group: '', model, note: '', brand, variant: 'NORMAL' });
      return;
    }
    const type = parseType(typeText);
    if (!type) {
      errors.push(
        typeText === ''
          ? `Fila ${line}: falta el tipo (Case o Vidrio templado)`
          : `Fila ${line}: tipo desconocido "${typeText}" (usa Case o Vidrio templado)`,
      );
      return;
    }
    const variant = type === 'GLASS' ? (parseVariant(variantText) ?? parseVariant(typeText) ?? 'NORMAL') : 'NORMAL';
    result.push({ type, group, model, note, brand, variant });
  });
  return { rows: result, errors };
}
