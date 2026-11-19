// Búsqueda tolerante de modelos: "ip13", "iphone 13" e "IPHONE13" encuentran "iPhone 13".
// Orden: exacta, empieza por, contiene, y por último "letras en orden". Los números
// escritos deben coincidir con el inicio de un número del modelo ("ip13" no encuentra "iPhone 15").
import { normalize } from './text.js';

const numberRegex = /[0-9]+/g;

function numbersCompatible(q, target) {
  const qNums = q.match(numberRegex) ?? [];
  if (qNums.length === 0) return true;
  const tNums = target.match(numberRegex) ?? [];
  return qNums.every((qn) => tNums.some((t) => t.startsWith(qn)));
}

/** Largo del tramo de target que contiene las letras de q en orden, o -1. */
function subsequenceSpan(q, target) {
  let qi = 0;
  let start = -1;
  for (let ti = 0; ti < target.length; ti++) {
    if (target[ti] === q[qi]) {
      if (start < 0) start = ti;
      qi++;
      if (qi === q.length) return ti - start + 1;
    }
  }
  return -1;
}

/** Puntaje de q dentro de target (ambos normalizados). -1 = no coincide. */
export function score(q, target) {
  if (!q || !target) return -1;
  if (!numbersCompatible(q, target)) return -1;
  if (target === q) return 1000;
  if (target.startsWith(q)) return 800;
  if (target.includes(q)) return 600;
  const span = subsequenceSpan(q, target);
  return span < 0 ? -1 : Math.max(400 - span, 1);
}

/** Busca en una lista de modelos {name, brand}. */
export function searchModels(models, query, limit = 50) {
  const q = normalize(query);
  if (!q) return [];
  const results = [];
  for (const m of models) {
    const n = normalize(m.name);
    const withBrand = normalize(m.brand) + n;
    const s = Math.max(score(q, n), score(q, withBrand) - 5);
    if (s >= 0) results.push({ m, s, len: n.length });
  }
  results.sort(
    (a, b) =>
      b.s - a.s ||
      a.len - b.len ||
      (a.m.name.toLowerCase() < b.m.name.toLowerCase() ? -1 : a.m.name.toLowerCase() > b.m.name.toLowerCase() ? 1 : 0),
  );
  return results.slice(0, limit).map((r) => r.m);
}

/** Orden natural: "iPhone 9" antes que "iPhone 13". */
export function naturalCompare(a, b) {
  const re = /\d+|\D+/g;
  const pa = String(a).toLowerCase().match(re) ?? [];
  const pb = String(b).toLowerCase().match(re) ?? [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    let c;
    if (/\d/.test(x[0]) && /\d/.test(y[0])) {
      const xt = x.replace(/^0+/, '');
      const yt = y.replace(/^0+/, '');
      c = xt.length - yt.length || (xt < yt ? -1 : xt > yt ? 1 : 0);
    } else {
      c = x < y ? -1 : x > y ? 1 : 0;
    }
    if (c !== 0) return c;
  }
  return pa.length - pb.length;
}
