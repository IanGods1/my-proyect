// Clave derivada de la contraseña de trabajador: PBKDF2-HMAC-SHA256, 256 bits, en hexadecimal.
// Es idéntica a la de la app Android (PBKDF2WithHmacSHA256), así que un trabajador puede entrar
// desde la web o desde la app con la misma contraseña.

export const DEFAULT_ITERATIONS = 60000;

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

export function newSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derive(password, saltHex, iterations = DEFAULT_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}
