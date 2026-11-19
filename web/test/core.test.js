import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/core/text.js';
import { detect, canonical, compareBrands, OTHER } from '../src/core/brands.js';
import { searchModels, naturalCompare } from '../src/core/search.js';
import { parseType, parseVariant } from '../src/core/variants.js';
import { defaultGroupName, resolveModel } from '../src/core/naming.js';
import { parseCsv, writeCsv } from '../src/core/csv.js';
import { parseTable } from '../src/core/importer.js';
import { derive } from '../src/core/passwords.js';

const models = [
  ['iPhone 13', 'Apple'], ['iPhone 13 Pro', 'Apple'], ['iPhone 14', 'Apple'], ['iPhone 15', 'Apple'],
  ['Galaxy A54', 'Samsung'], ['Galaxy A15', 'Samsung'], ['Galaxy S23', 'Samsung'], ['Galaxy S23+', 'Samsung'],
  ['Redmi Note 12', 'Xiaomi'],
].map(([name, brand]) => ({ name, brand }));
const find = (q) => searchModels(models, q).map((m) => m.name);

test('normalizar', () => {
  assert.equal(normalize('iPhone 13'), 'iphone13');
  assert.equal(normalize('IPHONE13'), 'iphone13');
  assert.equal(normalize('Galaxy S23+'), 'galaxys23plus');
  assert.equal(normalize('Vídrio  templado'), 'vidriotemplado');
});

test('búsqueda tolerante', () => {
  for (const q of ['ip13', 'iphone 13', 'IPHONE13', 'iphone13']) assert.equal(find(q)[0], 'iPhone 13', q);
  assert.deepEqual(find('ip13'), ['iPhone 13', 'iPhone 13 Pro']);
  assert.deepEqual(find('a5'), ['Galaxy A54']);
  assert.equal(find('samsung a54')[0], 'Galaxy A54');
  assert.equal(find('note12')[0], 'Redmi Note 12');
  assert.equal(find('s23')[0], 'Galaxy S23');
  assert.deepEqual(find(''), []);
});

test('marcas', () => {
  assert.equal(detect('iPhone 15'), 'Apple');
  assert.equal(detect('Galaxy A54'), 'Samsung');
  assert.equal(detect('Redmi Note 12'), 'Xiaomi');
  assert.equal(detect('Mi 11 Lite'), 'Xiaomi');
  assert.equal(detect('Moto G84'), 'Motorola');
  assert.equal(detect('Teléfono X'), OTHER);
  assert.equal(canonical('apple'), 'Apple');
  assert.equal(canonical('  nueva marca '), 'Nueva marca');
  assert.deepEqual(
    ['Otras', 'Huawei', 'Motorola', 'Apple', 'Xiaomi', 'Samsung'].sort(compareBrands),
    ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Huawei', 'Otras'],
  );
});

test('orden natural', () => {
  assert.deepEqual(['iPhone 13', 'iPhone 9', 'iPhone 11'].sort(naturalCompare), ['iPhone 9', 'iPhone 11', 'iPhone 13']);
});

test('tipo y clase de vidrio', () => {
  assert.equal(parseVariant('9D'), 'D9');
  assert.equal(parseVariant('Vidrio 9d'), 'D9');
  assert.equal(parseVariant('privacy'), 'PRIVACY');
  assert.equal(parseVariant('Vidrio privado'), 'PRIVACY');
  assert.equal(parseVariant('Privacidad'), 'PRIVACY');
  assert.equal(parseVariant('Vidrio normal'), 'NORMAL');
  assert.equal(parseVariant('Vidrio templado'), null);
  assert.equal(parseType('9D'), 'GLASS');
  assert.equal(parseType('Vidrio privacy'), 'GLASS');
  assert.equal(parseType('Funda'), 'CASE');
  assert.equal(parseType('algo'), null);
});

test('nombres automáticos', () => {
  const m = (...n) => n.map((name) => ({ name, brand: '' }));
  assert.equal(defaultGroupName('CASE', 'NORMAL', m('iPhone 13', 'iPhone 14')), 'Case grupo iPhone 13/iPhone 14');
  assert.equal(defaultGroupName('GLASS', 'D9', m('iPhone 13')), 'Vidrio 9D grupo iPhone 13');
  assert.equal(
    defaultGroupName('CASE', 'NORMAL', [{ name: 'A54', brand: 'Samsung' }, { name: 'A55', brand: 'samsung' }]),
    'Case grupo Samsung A54/A55',
  );
  assert.equal(
    defaultGroupName('CASE', 'NORMAL', [{ name: 'A54', brand: 'Samsung' }, { name: 'Y20', brand: 'Vivo' }]),
    'Case grupo A54/Y20',
  );
});

test('reutilizar modelos al escribir', () => {
  const known = [
    { name: 'Galaxy A54', brand: 'Samsung' }, { name: 'Galaxy A54 5G', brand: 'Samsung' },
    { name: 'iPhone 13', brand: 'Apple' }, { name: 'iPhone 13 Pro', brand: 'Apple' }, { name: 'A10', brand: 'Otras' },
  ];
  assert.equal(resolveModel('IPHONE13', '', known).name, 'iPhone 13');
  assert.equal(resolveModel('A54', 'Samsung', known).name, 'Galaxy A54');
  assert.equal(resolveModel('13', 'apple', known).name, 'iPhone 13');
  assert.equal(resolveModel('A54', '', known), null);
  assert.equal(resolveModel('A54', 'Xiaomi', known), null);
  assert.equal(resolveModel('a10', 'Samsung', known).brand, 'Otras');
  assert.equal(resolveModel('4', 'Samsung', known), null);
});

test('CSV: ida y vuelta, punto y coma', () => {
  const rows = [['tipo', 'grupo', 'modelo', 'nota'], ['Case', 'Grupo, 1', 'iPhone 13', 'dice "justo"']];
  assert.deepEqual(parseCsv(writeCsv(rows)), rows);
  assert.deepEqual(parseCsv('tipo;grupo;modelo;nota\r\nvidrio;G1;Galaxy A54;\r\n')[1], ['vidrio', 'G1', 'Galaxy A54', '']);
});

test('importar tabla', () => {
  const r = parseTable([
    ['Modelo', 'Tipo', 'Grupo', 'Nota'],
    ['iPhone 13', 'Funda', 'G1', 'x'],
    ['iPhone 14', 'vidrio templado', 'G2', ''],
    ['iPhone 15', 'algo', 'G3', ''],
    ['Moto G84', '', '', ''],
  ]);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].type, 'CASE');
  assert.equal(r.rows[1].type, 'GLASS');
  assert.equal(r.rows[2].type, null);
  assert.equal(r.errors.length, 1);
  assert.equal(parseTable([['Case', 'G1', 'iPhone 13', 'nota']]).rows[0].model, 'iPhone 13');
});

test('importar con variante', () => {
  const r = parseTable([
    ['tipo', 'grupo', 'modelo', 'nota', 'marca', 'variante'],
    ['Vidrio templado', 'G1', 'Galaxy A54', '', 'Samsung', '9D'],
    ['Vidrio privacy', 'G2', 'Galaxy A54', '', '', ''],
    ['Vidrio templado', 'G3', 'Galaxy A54', '', '', ''],
    ['Case', 'G4', 'Galaxy A54', '', '', '9D'],
  ]).rows;
  assert.deepEqual(r.map((x) => x.variant), ['D9', 'PRIVACY', 'NORMAL', 'NORMAL']);
  assert.equal(r[0].brand, 'Samsung');
  // archivos de la versión anterior (sin columna variante)
  assert.equal(parseTable([['tipo', 'grupo', 'modelo', 'nota'], ['vidrio', 'G', 'iPhone 13', '']]).rows[0].variant, 'NORMAL');
});

// Valores calculados con Java (PBKDF2WithHmacSHA256), que es lo que usa la app Android.
test('clave de trabajador idéntica a la de la app Android', async () => {
  const salt = '00112233445566778899aabbccddeeff';
  assert.equal(await derive('clave123', salt, 60000), 'c7fb50dbd816b76cf8a9716aa81cc6569ef1ab87695c0c07deca89172b96aee1');
  assert.equal(await derive('contraseña ñandú 😀 123', salt, 60000), 'f5e22300ae987734db2c6bf9daab4f6a84b42f329b1e01f5e9087675721ced39');
});
