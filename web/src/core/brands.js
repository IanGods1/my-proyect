// Detección y orden de marcas.
import { normalize, clean } from './text.js';

export const OTHER = 'Otras';

/** [marca, prefijos (normalizados) con los que suelen empezar sus modelos] */
const rules = [
  ['Apple', ['apple', 'iphone', 'ipad']],
  ['Samsung', ['samsung', 'galaxy']],
  ['Xiaomi', ['xiaomi', 'redmi', 'poco']],
  ['Motorola', ['motorola', 'moto']],
  ['Huawei', ['huawei']],
  ['Honor', ['honor']],
  ['Google', ['google', 'pixel']],
  ['OnePlus', ['oneplus']],
  ['Oppo', ['oppo']],
  ['Realme', ['realme']],
  ['Vivo', ['vivo']],
  ['Nokia', ['nokia']],
  ['Sony', ['sony', 'xperia']],
  ['LG', ['lg']],
  ['ZTE', ['zte', 'blade']],
  ['Infinix', ['infinix']],
  ['Tecno', ['tecno']],
  ['Alcatel', ['alcatel']],
  ['TCL', ['tcl']],
  ['Nothing', ['nothing']],
];

const preferredOrder = ['Apple', 'Samsung', 'Xiaomi', 'Motorola'];

export const knownBrands = rules.map((r) => r[0]);

export function detect(modelName) {
  const n = normalize(modelName);
  for (const [brand, prefixes] of rules) {
    if (prefixes.some((p) => n.startsWith(p))) return brand;
  }
  // "Mi 11", "Mi Note 10"... (Xiaomi) solo si "Mi" es una palabra aparte.
  if (/^mi\s/i.test(String(modelName ?? '').trim())) return 'Xiaomi';
  return OTHER;
}

/** Marca con su escritura habitual ("apple" -> "Apple"). */
export function canonical(brand) {
  const c = clean(brand);
  if (!c) return '';
  const n = normalize(c);
  const known = rules.find((r) => normalize(r[0]) === n);
  if (known) return known[0];
  if (n === normalize(OTHER)) return OTHER;
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Apple, Samsung, Xiaomi, Motorola, luego alfabético y "Otras" al final. */
export function compareBrands(a, b) {
  const rank = (x) => {
    const i = preferredOrder.indexOf(x);
    if (i >= 0) return i;
    return x === OTHER ? Number.MAX_SAFE_INTEGER : preferredOrder.length;
  };
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  return a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
}
