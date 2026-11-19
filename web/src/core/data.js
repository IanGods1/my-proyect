// Operaciones sobre los datos (modelos y grupos), sin depender de Firebase ni del navegador.
//
// Formato (igual que la app Android y que Firestore):
//   models/{id}: { name, brand, normalized }
//   groups/{id}: { type: 'CASE'|'GLASS', variant: 'NORMAL'|'D9'|'PRIVACY', name, note, models: [ids] }
// Los ids son números en texto ("1", "2"...) para que la app Android los entienda.
import { normalize, clean } from './text.js';
import { OTHER, canonical, detect, compareBrands } from './brands.js';
import { defaultGroupName } from './naming.js';
import { VARIANT_FULL, TYPE_LABEL, VARIANT_LABEL } from './variants.js';
import { naturalCompare } from './search.js';
import { HEADER } from './importer.js';

export const emptyData = () => ({ models: {}, groups: {} });

// ---------------------------------------------------------------- Documentos

export const modelDoc = (m) => ({ name: m.name, brand: m.brand, normalized: m.normalized });
export const groupDoc = (g) => ({
  type: g.type,
  variant: g.variant,
  name: g.name,
  note: g.note,
  models: [...g.models].map(String).sort(),
});

/** Documento leído de Firestore -> formato interno (con valores por defecto para datos antiguos). */
export function parseModelDoc(id, d) {
  const name = typeof d.name === 'string' ? d.name : '';
  return { id, name, brand: typeof d.brand === 'string' && d.brand ? d.brand : detect(name), normalized: d.normalized || normalize(name) };
}
export function parseGroupDoc(id, d) {
  return {
    id,
    type: d.type === 'GLASS' ? 'GLASS' : 'CASE',
    variant: ['NORMAL', 'D9', 'PRIVACY'].includes(d.variant) ? d.variant : 'NORMAL',
    name: typeof d.name === 'string' ? d.name : '',
    note: typeof d.note === 'string' ? d.note : '',
    models: Array.isArray(d.models) ? d.models.map(String) : [],
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Cambios necesarios para pasar de `before` a `after`: [{col, id, doc | null}] (null = borrar). */
export function diffData(before, after) {
  const writes = [];
  const cols = [
    ['models', modelDoc],
    ['groups', groupDoc],
  ];
  for (const [col, toDoc] of cols) {
    for (const [id, item] of Object.entries(after[col])) {
      const prev = before[col][id];
      if (!prev || !same(toDoc(prev), toDoc(item))) writes.push({ col, id, doc: toDoc(item) });
    }
    for (const id of Object.keys(before[col])) if (!(id in after[col])) writes.push({ col, id, doc: null });
  }
  return writes;
}

// ---------------------------------------------------------------- Borrador

function nextId(map) {
  let max = 0;
  for (const k of Object.keys(map)) {
    const v = Number(k);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return String(max + 1);
}

/** Copia de trabajo de los datos con funciones para modificarla. */
export function makeDraft(data) {
  const d = JSON.parse(JSON.stringify(data));
  const byNorm = new Map(Object.values(d.models).map((m) => [m.normalized, m]));
  return {
    data: d,

    findModelByNormalized: (n) => byNorm.get(n) ?? null,

    /**
     * Busca el modelo por su clave normalizada; si no existe, lo crea.
     * overrideBrand: true (importación) cambia la marca de un modelo ya registrado;
     * false (formulario) solo la completa cuando el modelo estaba en "Otras".
     */
    getOrCreateModel(rawName, rawBrand, overrideBrand = true) {
      const name = clean(rawName);
      const normalized = normalize(name);
      const brand = rawBrand ? canonical(rawBrand) : '';
      const existing = byNorm.get(normalized);
      if (existing) {
        const canChange = overrideBrand || existing.brand === OTHER;
        if (brand && brand !== existing.brand && canChange) existing.brand = brand;
        return { model: existing, created: false };
      }
      const id = nextId(d.models);
      const model = { id, name, brand: brand || detect(name), normalized };
      d.models[id] = model;
      byNorm.set(normalized, model);
      return { model, created: true };
    },

    /** Cambia el nombre/marca de un modelo manteniendo al día el índice por nombre. */
    updateModelRecord(id, name, brand, normalized) {
      const m = d.models[id];
      byNorm.delete(m.normalized);
      m.name = name;
      m.brand = brand;
      m.normalized = normalized;
      byNorm.set(normalized, m);
    },

    removeModel(id) {
      const m = d.models[id];
      if (m) byNorm.delete(m.normalized);
      delete d.models[id];
      for (const g of Object.values(d.groups)) g.models = g.models.filter((x) => x !== id);
    },

    findGroup(type, variant, name) {
      const n = name.toLowerCase();
      return Object.values(d.groups).find((g) => g.type === type && g.variant === variant && g.name.toLowerCase() === n) ?? null;
    },

    newGroupId: () => nextId(d.groups),
  };
}

// ---------------------------------------------------------------- Modelos

export function addModel(draft, rawName, rawBrand) {
  const name = clean(rawName);
  const normalized = normalize(name);
  if (!normalized) return { error: 'Escribe el nombre del modelo' };
  const existing = draft.findModelByNormalized(normalized);
  if (existing) return { error: `El modelo "${existing.name}" ya está registrado` };
  draft.getOrCreateModel(name, canonical(rawBrand) || null);
  return {};
}

export function updateModel(draft, id, rawName, rawBrand) {
  const name = clean(rawName);
  const normalized = normalize(name);
  if (!normalized) return { error: 'Escribe el nombre del modelo' };
  const other = draft.findModelByNormalized(normalized);
  if (other && other.id !== id) return { error: `Ya existe el modelo "${other.name}"` };
  if (!draft.data.models[id]) return { error: 'El modelo ya no existe' };
  draft.updateModelRecord(id, name, canonical(rawBrand) || detect(name), normalized);
  return {};
}

export function deleteModel(draft, id) {
  draft.removeModel(id);
  return {};
}

// ---------------------------------------------------------------- Grupos

export function saveGroup(draft, { id, type, variant, name: rawName, note: rawNote, models: inputs }) {
  const groupVariant = type === 'GLASS' ? variant : 'NORMAL';
  const seen = new Set();
  const models = [];
  for (const m of inputs) {
    const name = clean(m.name);
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    models.push({ name, brand: canonical(m.brand) });
  }
  if (models.length === 0) return { error: 'Agrega al menos un modelo al grupo' };
  const name = clean(rawName) || defaultGroupName(type, groupVariant, models);
  const dup = draft.findGroup(type, groupVariant, name);
  if (dup && dup.id !== id) {
    const kind = type === 'GLASS' ? VARIANT_FULL[groupVariant] : TYPE_LABEL[type];
    return { error: `Ya existe un grupo de ${kind} llamado "${name}"` };
  }
  const groupId = id ?? draft.newGroupId();
  const ids = models.map((m) => draft.getOrCreateModel(m.name, m.brand || null, false).model.id);
  draft.data.groups[groupId] = {
    id: groupId,
    type,
    variant: groupVariant,
    name,
    note: String(rawNote ?? '').trim(),
    models: [...new Set(ids)],
  };
  return { id: groupId };
}

export function deleteGroup(draft, id) {
  delete draft.data.groups[id];
  return {};
}

// ---------------------------------------------------------------- Importar

/**
 * rows: filas de TableImporter. Devuelve {newGroups, newModels, newLinks}.
 * Para "Reemplazar todo" se parte de un borrador vacío (ver Store.apply, opción replace).
 */
export function importRows(draft, rows) {
  let newGroups = 0;
  let newModels = 0;
  let newLinks = 0;
  const groupIds = new Map();
  const noted = new Set();
  for (const row of rows) {
    const { model, created } = draft.getOrCreateModel(row.model, row.brand || null, true);
    if (created) newModels++;
    if (!row.type || !row.group.trim()) continue;
    const key = `${row.type}|${row.variant}|${normalize(row.group)}`;
    let groupId = groupIds.get(key);
    if (!groupId) {
      const existing = draft.findGroup(row.type, row.variant, row.group);
      if (existing) groupId = existing.id;
      else {
        groupId = draft.newGroupId();
        draft.data.groups[groupId] = { id: groupId, type: row.type, variant: row.variant, name: row.group, note: '', models: [] };
        newGroups++;
      }
      groupIds.set(key, groupId);
    }
    const group = draft.data.groups[groupId];
    // La primera nota no vacía del archivo para cada grupo reemplaza la nota guardada.
    if (row.note.trim() && !noted.has(groupId)) {
      group.note = row.note;
      noted.add(groupId);
    }
    if (!group.models.includes(model.id)) {
      group.models.push(model.id);
      newLinks++;
    }
  }
  return { newGroups, newModels, newLinks };
}

// ---------------------------------------------------------------- Consultas

export const modelsList = (data) => Object.values(data.models);

/** Todo el árbol de marcas: [{brand, models: [...]}] ordenado como en la app. */
export function modelsByBrand(models) {
  const map = new Map();
  for (const m of models) {
    const b = m.brand || OTHER;
    if (!map.has(b)) map.set(b, []);
    map.get(b).push(m);
  }
  return [...map.entries()]
    .sort((a, b) => compareBrands(a[0], b[0]))
    .map(([brand, list]) => ({ brand, models: list.sort((x, y) => naturalCompare(x.name, y.name)) }));
}

/**
 * Compatibilidades de un modelo, por tipo: { CASE: [grupo], GLASS: [grupo] } donde
 * cada grupo es { id, name, note, variant, others: [modelos] } (others = los demás modelos).
 */
export function compatibilityFor(data, modelId) {
  const result = { CASE: [], GLASS: [] };
  const groups = Object.values(data.groups)
    .filter((g) => g.models.includes(modelId))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  for (const g of groups) {
    const others = g.models
      .filter((id) => id !== modelId)
      .map((id) => data.models[id])
      .filter(Boolean)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    result[g.type].push({ id: g.id, name: g.name, note: g.note, variant: g.variant, others });
  }
  return result;
}

/** Modelos compatibles de varios grupos, sin repetir. */
export function othersOf(groups) {
  const seen = new Map();
  for (const g of groups) for (const m of g.others) seen.set(m.id, m);
  return [...seen.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Tabla con todos los datos: encabezado + una fila por cada modelo de cada grupo. */
export function exportTable(data) {
  const table = [HEADER];
  const used = new Set();
  const groups = Object.values(data.groups).sort(
    (a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  for (const g of groups) {
    const models = g.models
      .map((id) => data.models[id])
      .filter(Boolean)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const m of models) {
      table.push([TYPE_LABEL[g.type], g.name, m.name, g.note, m.brand, g.type === 'GLASS' ? VARIANT_LABEL[g.variant] : '']);
      used.add(m.id);
    }
  }
  for (const m of Object.values(data.models)) if (!used.has(m.id)) table.push(['', '', m.name, '', m.brand, '']);
  return table;
}
