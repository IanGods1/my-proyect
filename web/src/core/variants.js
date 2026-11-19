// Tipos de grupo (Case / Vidrio templado) y clases de vidrio (Normal, 9D, Privacy).
import { normalize } from './text.js';

export const TYPES = ['CASE', 'GLASS'];
export const TYPE_LABEL = { CASE: 'Case', GLASS: 'Vidrio templado' };

export const VARIANTS = ['NORMAL', 'D9', 'PRIVACY'];
export const VARIANT_LABEL = { NORMAL: 'Normal', D9: '9D', PRIVACY: 'Privacy' };
export const VARIANT_FULL = { NORMAL: 'Vidrio normal', D9: 'Vidrio 9D', PRIVACY: 'Vidrio privacy' };

/** Texto de la columna "tipo": "case", "funda", "vidrio", "Vidrio 9D", "mica", "glass"... */
export function parseType(text) {
  const n = normalize(text);
  if (!n) return null;
  const glass = ['vidrio', 'templado', 'mica', 'glass', 'protector', 'cristal', '9d', 'privacy', 'privad'];
  const kase = ['case', 'funda', 'carcasa', 'cover', 'estuche'];
  if (glass.some((w) => n.includes(w))) return 'GLASS';
  if (kase.some((w) => n.includes(w))) return 'CASE';
  return TYPES.find((t) => normalize(t) === n) ?? null;
}

/** "9D", "vidrio 9d", "privacy", "privado", "normal"... null si no reconoce ninguna clase. */
export function parseVariant(text) {
  const n = normalize(text);
  if (!n) return null;
  if (n.includes('9d')) return 'D9';
  if (['privacy', 'privad', 'privacid', 'espia'].some((w) => n.includes(w))) return 'PRIVACY';
  if (['normal', 'comun', 'simple', 'estandar'].some((w) => n.includes(w))) return 'NORMAL';
  return null;
}
