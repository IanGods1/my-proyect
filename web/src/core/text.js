// Normalización de texto: "iPhone 13" -> "iphone13", "Galaxy S23+" -> "galaxys23plus".

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

/** Sin espacios al inicio, final ni repetidos. */
export function clean(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}
