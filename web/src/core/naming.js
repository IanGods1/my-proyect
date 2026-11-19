// Nombre automático de grupos y reutilización de modelos ya registrados.
import { normalize } from './text.js';
import { OTHER, canonical, detect } from './brands.js';
import { VARIANT_FULL } from './variants.js';

/**
 * "Case grupo iPhone 13/iPhone 14", "Vidrio 9D grupo Samsung A54/A55".
 * Se antepone la marca solo si todos los modelos son de la misma marca y no se nota en los nombres.
 */
export function defaultGroupName(type, variant, models) {
  const prefix = type === 'CASE' ? 'Case grupo' : `${VARIANT_FULL[variant] ?? VARIANT_FULL.NORMAL} grupo`;
  const brands = [...new Set(models.map((m) => canonical(m.brand) || detect(m.name)))];
  const brand = brands.length === 1 ? brands[0] : null;
  const hidden = brand && brand !== OTHER && models.some((m) => detect(m.name) !== brand);
  return `${prefix} ${hidden ? brand + ' ' : ''}${models.map((m) => m.name).join('/')}`;
}

/**
 * 1) Mismo nombre ("iphone13" -> "iPhone 13").
 * 2) Con una marca elegida: si lo escrito es el final del nombre de UN solo modelo de esa marca
 *    ("A54" con Samsung -> "Galaxy A54"). Si hay más de uno, no se adivina.
 */
export function resolveModel(typed, brand, known) {
  const n = normalize(typed);
  if (!n) return null;
  const exact = known.find((k) => normalize(k.name) === n);
  if (exact) return exact;
  const b = canonical(brand);
  if (!b || n.length < 2) return null;
  const candidates = known.filter((k) => k.brand === b && normalize(k.name).endsWith(n));
  return candidates.length === 1 ? candidates[0] : null;
}
