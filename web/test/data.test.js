import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsx, writeXlsx, isXlsx, isLegacyXls } from '../src/core/xlsx.js';
import {
  emptyData, makeDraft, diffData, saveGroup, deleteGroup, deleteModel, addModel, updateModel,
  importRows, compatibilityFor, othersOf, exportTable, modelsByBrand, parseGroupDoc, parseModelDoc,
} from '../src/core/data.js';
import { parseTable } from '../src/core/importer.js';
import { Store } from '../src/core/store.js';

const run = (data, fn) => {
  const d = makeDraft(data);
  const r = fn(d) ?? {};
  return { data: d.data, result: r };
};
const names = (data, ids) => ids.map((id) => data.models[id].name);

// ---------------------------------------------------------------- Excel

test('xlsx: ida y vuelta con caracteres especiales', () => {
  const rows = [['tipo', 'grupo', 'modelo', 'nota'], ['Case', 'G <1> & ñ "x"', 'iPhone 13', ''], ['', '', 'Moto G84', 'x']];
  const bytes = writeXlsx(rows);
  assert.ok(isXlsx(bytes));
  assert.deepEqual(readXlsx(bytes), [['tipo', 'grupo', 'modelo', 'nota'], ['Case', 'G <1> & ñ "x"', 'iPhone 13'], ['', '', 'Moto G84', 'x']]);
});

test('xlsx: archivo real hecho con otra herramienta (textos compartidos, números, celdas lejanas)', () => {
  const t = readXlsx(new Uint8Array(readFileSync(new URL('./fixtures/real.xlsx', import.meta.url))));
  assert.deepEqual(t, [['tipo', 'grupo', 'modelo', 'nota'], ['Case', 'Grupo A', 'iPhone 13', 'justo'], ['Vidrio', 'Grupo B', '13'], ['', '', '', '', '', 'lejos']]);
  assert.equal(isLegacyXls(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0, 0])), true);
});

// ---------------------------------------------------------------- Grupos

test('guardar grupo: crea modelos y es bidireccional', () => {
  const { data } = run(emptyData(), (d) =>
    saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: '', note: 'justa', models: ['iPhone 13', 'iPhone 14', 'iPhone 15'].map((name) => ({ name, brand: '' })) }),
  );
  assert.equal(Object.keys(data.models).length, 3);
  const g = Object.values(data.groups)[0];
  assert.equal(g.name, 'Case grupo iPhone 13/iPhone 14/iPhone 15');
  const id13 = Object.values(data.models).find((m) => m.name === 'iPhone 13').id;
  const id15 = Object.values(data.models).find((m) => m.name === 'iPhone 15').id;
  assert.deepEqual(names(data, compatibilityFor(data, id13).CASE[0].others.map((m) => m.id)), ['iPhone 14', 'iPhone 15']);
  assert.deepEqual(compatibilityFor(data, id15).CASE[0].others.map((m) => m.name), ['iPhone 13', 'iPhone 14']);
  assert.equal(compatibilityFor(data, id13).CASE[0].note, 'justa');
  assert.deepEqual(compatibilityFor(data, id13).GLASS, []);
});

test('clases de vidrio: cada una es un grupo distinto', () => {
  let data = emptyData();
  const add = (variant, ms, name = '') => {
    const r = run(data, (d) => saveGroup(d, { type: 'GLASS', variant, name, note: '', models: ms.map((n) => ({ name: n, brand: 'Apple' })) }));
    assert.equal(r.result.error, undefined);
    data = r.data;
  };
  add('NORMAL', ['iPhone 13', 'iPhone 14']);
  add('D9', ['iPhone 13', 'iPhone 14', 'iPhone 15']);
  add('PRIVACY', ['iPhone 13', 'iPhone 15']);
  const id = Object.values(data.models).find((m) => m.name === 'iPhone 13').id;
  const glass = compatibilityFor(data, id).GLASS;
  const by = (v) => othersOf(glass.filter((g) => g.variant === v)).map((m) => m.name);
  assert.deepEqual(by('NORMAL'), ['iPhone 14']);
  assert.deepEqual(by('D9'), ['iPhone 14', 'iPhone 15']);
  assert.deepEqual(by('PRIVACY'), ['iPhone 15']);
  assert.deepEqual(Object.values(data.groups).map((g) => g.name).sort(), [
    'Vidrio 9D grupo iPhone 13/iPhone 14/iPhone 15', 'Vidrio normal grupo iPhone 13/iPhone 14', 'Vidrio privacy grupo iPhone 13/iPhone 15',
  ]);
  // mismo nombre y misma clase: error; misma nombre en otra clase: permitido
  const dup = run(data, (d) => saveGroup(d, { type: 'GLASS', variant: 'D9', name: 'Vidrio 9D grupo iPhone 13/iPhone 14/iPhone 15', note: '', models: [{ name: 'X', brand: '' }] }));
  assert.match(dup.result.error, /Ya existe un grupo de Vidrio 9D/);
  const other = run(data, (d) => saveGroup(d, { type: 'GLASS', variant: 'PRIVACY', name: 'Vidrio 9D grupo iPhone 13/iPhone 14/iPhone 15', note: '', models: [{ name: 'X', brand: '' }] }));
  assert.equal(other.result.error, undefined);
});

test('un case siempre queda como clase NORMAL', () => {
  const { data } = run(emptyData(), (d) => saveGroup(d, { type: 'CASE', variant: 'D9', name: 'c', note: '', models: [{ name: 'a54', brand: '' }] }));
  assert.equal(Object.values(data.groups)[0].variant, 'NORMAL');
});

test('marca elegida en el formulario', () => {
  let data = emptyData();
  data = run(data, (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: '', note: '', models: [{ name: 'A54', brand: 'samsung' }, { name: 'A55', brand: 'Samsung' }] })).data;
  assert.deepEqual(Object.values(data.models).map((m) => m.brand), ['Samsung', 'Samsung']);
  assert.equal(Object.values(data.groups)[0].name, 'Case grupo Samsung A54/A55');
  // sin marca elegida: se deduce del nombre
  data = run(data, (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: 'otro', note: '', models: [{ name: 'iPhone 8', brand: '' }, { name: 'Zeta', brand: '' }] })).data;
  const byName = Object.fromEntries(Object.values(data.models).map((m) => [m.name, m.brand]));
  assert.equal(byName['iPhone 8'], 'Apple');
  assert.equal(byName['Zeta'], 'Otras');
  // un modelo registrado en "Otras" toma la marca elegida, pero uno con marca no cambia
  data = run(data, (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: 'tercero', note: '', models: [{ name: 'Zeta', brand: 'Vivo' }, { name: 'iPhone 8', brand: 'Samsung' }] })).data;
  const after = Object.fromEntries(Object.values(data.models).map((m) => [m.name, m.brand]));
  assert.equal(after['Zeta'], 'Vivo');
  assert.equal(after['iPhone 8'], 'Apple');
});

test('modelos: agregar, renombrar, borrar (se quita de los grupos)', () => {
  let data = run(emptyData(), (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: 'g', note: '', models: [{ name: 'A54', brand: 'Samsung' }, { name: 'A55', brand: 'Samsung' }] })).data;
  assert.match(run(data, (d) => addModel(d, 'a 54', '')).result.error, /ya está registrado/);
  assert.match(run(data, (d) => addModel(d, '  ', '')).result.error, /Escribe/);
  const id54 = Object.values(data.models).find((m) => m.name === 'A54').id;
  data = run(data, (d) => updateModel(d, id54, 'Galaxy A54', 'Samsung')).data;
  assert.equal(data.models[id54].name, 'Galaxy A54');
  assert.equal(data.models[id54].normalized, 'galaxya54');
  assert.match(run(data, (d) => updateModel(d, id54, 'a55', '')).result.error, /Ya existe/);
  data = run(data, (d) => deleteModel(d, id54)).data;
  assert.equal(data.models[id54], undefined);
  assert.equal(Object.values(data.groups)[0].models.includes(id54), false);
  data = run(data, (d) => deleteGroup(d, Object.keys(data.groups)[0])).data;
  assert.equal(Object.keys(data.groups).length, 0);
  assert.equal(Object.keys(data.models).length, 1); // los modelos siguen registrados
});

test('ids numéricos que continúan después del mayor (compatibles con Android)', () => {
  let data = emptyData();
  data.models = { 5: { id: '5', name: 'iPhone 13', brand: 'Apple', normalized: 'iphone13' } };
  data.groups = { 9: { id: '9', type: 'CASE', variant: 'NORMAL', name: 'g', note: '', models: ['5'] } };
  const r = run(data, (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: 'h', note: '', models: [{ name: 'iPhone 14', brand: '' }] }));
  assert.deepEqual(Object.keys(r.data.models).sort(), ['5', '6']);
  assert.deepEqual(Object.keys(r.data.groups).sort(), ['10', '9']);
});

// ---------------------------------------------------------------- Importar / exportar

test('importar y exportar son inversos (con clases de vidrio y marca)', () => {
  const csvRows = parseTable([
    ['tipo', 'grupo', 'modelo', 'nota', 'marca', 'variante'],
    ['Case', 'Case Samsung', 'A54', 'nota 1', 'Samsung', ''],
    ['Case', 'Case Samsung', 'A55', '', 'Samsung', ''],
    ['Vidrio templado', 'Vidrio 9D', 'A54', '', 'Samsung', '9D'],
    ['', '', 'Moto G84', '', '', ''],
  ]).rows;
  const r = run(emptyData(), (d) => importRows(d, csvRows));
  assert.deepEqual(r.result, { newGroups: 2, newModels: 3, newLinks: 3 });
  assert.equal(Object.values(r.data.groups).find((g) => g.name === 'Case Samsung').note, 'nota 1');
  const table = exportTable(r.data);
  assert.deepEqual(table[0], ['tipo', 'grupo', 'modelo', 'nota', 'marca', 'variante']);
  assert.equal(table.length, 1 + 3 + 1); // 3 enlaces + 1 modelo sin grupo
  assert.ok(table.some((row) => row[0] === 'Vidrio templado' && row[5] === '9D'));
  // volver a importar lo exportado no duplica nada
  const again = run(r.data, (d) => importRows(d, parseTable(table).rows));
  assert.deepEqual(again.result, { newGroups: 0, newModels: 0, newLinks: 0 });
  assert.deepEqual(diffData(r.data, again.data), []);
});

test('importar reemplazando todo', () => {
  const store = new Store({ commit: async () => {} });
  store.data = run(emptyData(), (d) => saveGroup(d, { type: 'CASE', variant: 'NORMAL', name: 'viejo', note: '', models: [{ name: 'Viejo', brand: '' }] })).data;
  const rows = parseTable([['Case', 'Nuevo', 'iPhone 13', '']]).rows;
  store.apply((d) => importRows(d, rows), { replace: true });
  assert.deepEqual(Object.values(store.data.models).map((m) => m.name), ['iPhone 13']);
  assert.deepEqual(Object.values(store.data.groups).map((g) => g.name), ['Nuevo']);
});

// ---------------------------------------------------------------- Nube

test('diff: solo se suben las diferencias', () => {
  const a = run(emptyData(), (d) => saveGroup(d, { type: 'GLASS', variant: 'D9', name: 'g', note: 'n', models: [{ name: 'iPhone 13', brand: '' }, { name: 'iPhone 14', brand: '' }] })).data;
  assert.deepEqual(diffData(a, a), []);
  const writes = diffData(emptyData(), a);
  assert.equal(writes.length, 3);
  const group = writes.find((w) => w.col === 'groups').doc;
  assert.deepEqual(group, { type: 'GLASS', variant: 'D9', name: 'g', note: 'n', models: ['1', '2'] });
  const b = structuredClone(a);
  delete b.groups[Object.keys(b.groups)[0]];
  assert.deepEqual(diffData(a, b).map((w) => [w.col, w.doc]), [['groups', null]]);
});

test('documentos antiguos sin variante se leen como NORMAL (datos de la versión anterior)', () => {
  assert.equal(parseGroupDoc('1', { type: 'GLASS', name: 'x', note: '', models: [1, 2] }).variant, 'NORMAL');
  assert.deepEqual(parseGroupDoc('1', { type: 'GLASS', name: 'x', models: [1, 2] }).models, ['1', '2']);
  assert.equal(parseModelDoc('1', { name: 'iPhone 13', brand: '', normalized: 'iphone13' }).brand, 'Apple');
});

test('lista por marca ordenada', () => {
  const ms = ['iPhone 13', 'iPhone 9', 'Galaxy A54', 'Teléfono X', 'Moto G84', 'Redmi 12'].map((name, i) => ({
    id: String(i), name, brand: ['Apple', 'Apple', 'Samsung', 'Otras', 'Motorola', 'Xiaomi'][i], normalized: name,
  }));
  const grouped = modelsByBrand(ms);
  assert.deepEqual(grouped.map((g) => g.brand), ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Otras']);
  assert.deepEqual(grouped[0].models.map((m) => m.name), ['iPhone 9', 'iPhone 13']);
});
