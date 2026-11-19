import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthManager, PASSWORD_CHANGED_MESSAGE, validateNewPassword, MAX_ATTEMPTS } from '../src/auth.js';
import { MemoryBackend, newCloud } from '../src/backend-memory.js';

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

/** Un "teléfono": su propio almacenamiento y sesión, compartiendo la nube con los demás. */
function phone(cloud, clock) {
  const backend = new MemoryBackend(cloud);
  const storage = new FakeStorage();
  const auth = new AuthManager(backend, storage, clock);
  return { backend, storage, auth };
}
/** Abrir otra vez la app en el mismo teléfono (mismo almacenamiento y sesión). */
const reopen = (p, clock) => ({ ...p, auth: new AuthManager(p.backend, p.storage, clock) });

async function setupCloud(cloud) {
  const admin = phone(cloud);
  await admin.auth.initialize();
  assert.equal(admin.auth.state.kind, 'needs-setup');
  assert.equal(await admin.auth.setup('admin-secreta', 'trabajo-123'), null);
  assert.deepEqual(admin.auth.state, { kind: 'logged-in', role: 'ADMIN' });
  return admin;
}

test('validar contraseñas nuevas', () => {
  assert.match(validateNewPassword('abc', 'abc'), /al menos 6/);
  assert.match(validateNewPassword('abcdef', 'abcdeg'), /no coinciden/);
  assert.equal(validateNewPassword('abcdef', 'abcdef'), null);
});

test('primer uso: se crean las dos contraseñas y el administrador queda dentro', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  assert.equal(cloud.config.workerVersion, 1);
  assert.ok(cloud.workerToken);
  assert.ok(!JSON.stringify({ ...cloud, peers: undefined }).includes('trabajo-123')); // nunca en texto plano
});

test('trabajador: contraseña incorrecta, bloqueo, ingreso y sesión permanente', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  let now = 1_000_000;
  const clock = () => now;
  const w = phone(cloud, clock);
  await w.auth.initialize();
  assert.equal(w.auth.state.kind, 'logged-out');

  for (let i = 1; i < MAX_ATTEMPTS; i++) assert.equal(await w.auth.login('mala'), 'Contraseña incorrecta');
  assert.match(await w.auth.login('mala'), /Demasiados intentos: espera 1 minuto/);
  assert.equal(w.auth.remainingLockSeconds(), 60);
  // bloqueado: ni la contraseña correcta entra
  assert.match(await w.auth.login('trabajo-123'), /Espera 60 segundos/);
  now += 61_000;
  assert.equal(w.auth.remainingLockSeconds(), 0);

  assert.equal(await w.auth.login('trabajo-123'), null);
  assert.deepEqual(w.auth.state, { kind: 'logged-in', role: 'WORKER' });

  // "cerrar y volver a abrir" / pasan los días: entra directo, sin pedir contraseña
  const again = reopen(w, clock);
  await again.auth.initialize();
  assert.deepEqual(again.auth.state, { kind: 'logged-in', role: 'WORKER' });
});

test('una contraseña de administrador entra como administrador', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  const p = phone(cloud);
  await p.auth.initialize();
  assert.equal(await p.auth.login('admin-secreta'), null);
  assert.deepEqual(p.auth.state, { kind: 'logged-in', role: 'ADMIN' });
  assert.equal((await reopenAndInit(p)).auth.state.role, 'ADMIN'); // sesión permanente
  p.auth.logoutAdmin();
  assert.equal(p.auth.state.kind, 'logged-out');
});

async function reopenAndInit(p) {
  const r = reopen(p);
  await r.auth.initialize();
  return r;
}

test('el trabajador no puede cerrar sesión ni cambiar contraseñas', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  const w = phone(cloud);
  await w.auth.initialize();
  await w.auth.login('trabajo-123');
  w.auth.logoutAdmin();
  assert.equal(w.auth.state.role, 'WORKER');
  assert.equal((await w.auth.changeWorkerPassword('nueva-clave')).ok, false);
  assert.equal((await w.auth.changeAdminPassword('x', 'nueva-clave')).ok, false);
});

test('cambiar la contraseña de trabajador cierra la sesión de todos los trabajadores', async () => {
  const cloud = newCloud();
  const admin = await setupCloud(cloud);
  const w1 = phone(cloud);
  const w2 = phone(cloud);
  for (const w of [w1, w2]) {
    await w.auth.initialize();
    assert.equal(await w.auth.login('trabajo-123'), null);
  }

  // no puede ser igual a la de administrador
  assert.equal((await admin.auth.changeWorkerPassword('admin-secreta')).ok, false);

  const r = await admin.auth.changeWorkerPassword('nueva-clave');
  assert.equal(r.ok, true);

  // con internet se cierra al instante (aviso en vivo)
  for (const w of [w1, w2]) {
    assert.deepEqual(w.auth.state, { kind: 'logged-out', message: PASSWORD_CHANGED_MESSAGE });
    assert.equal(w.auth.role, null);
  }
  // al volver a abrir sigue mostrando el mensaje
  const again = await reopenAndInit(w1);
  assert.deepEqual(again.auth.state, { kind: 'logged-out', message: PASSWORD_CHANGED_MESSAGE });
  // la contraseña vieja ya no sirve; la nueva sí
  assert.equal(await again.auth.login('trabajo-123'), 'Contraseña incorrecta');
  assert.equal(await again.auth.login('nueva-clave'), null);
  assert.equal(again.auth.state.role, 'WORKER');
  assert.equal(again.auth.pendingMessage, null);
});

test('sin internet el trabajador sigue con su sesión; al conectarse se cierra si cambió la contraseña', async () => {
  const cloud = newCloud();
  const admin = await setupCloud(cloud);
  const w = phone(cloud);
  await w.auth.initialize();
  await w.auth.login('trabajo-123');

  // el administrador cambia la contraseña mientras el teléfono del trabajador está sin internet
  w.backend.offline = true;
  w.auth.configUnsub?.(); // sin conexión no le llega el aviso en vivo
  w.auth.configUnsub = null;
  await admin.auth.changeWorkerPassword('nueva-clave');

  const offline = reopen(w);
  await offline.auth.initialize();
  assert.deepEqual(offline.auth.state, { kind: 'logged-in', role: 'WORKER' }); // usa la última sesión válida

  // vuelve internet: la próxima vez que se abre, se cierra
  offline.backend.offline = false;
  const online = reopen(w);
  await online.auth.initialize();
  assert.deepEqual(online.auth.state, { kind: 'logged-out', message: PASSWORD_CHANGED_MESSAGE });
});

test('sin internet y sin sesión: pide conectarse', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  const p = phone(cloud);
  p.backend.offline = true;
  await p.auth.initialize();
  assert.equal(p.auth.state.kind, 'needs-internet');
  p.backend.offline = false;
  await p.auth.retry();
  assert.equal(p.auth.state.kind, 'logged-out');
  p.backend.offline = true;
  assert.match(await p.auth.login('trabajo-123'), /Sin conexión/);
});

test('administrador: cambiar su contraseña', async () => {
  const cloud = newCloud();
  const admin = await setupCloud(cloud);
  assert.equal((await admin.auth.changeAdminPassword('incorrecta', 'otra-clave')).message, 'La contraseña actual no es correcta');
  assert.equal((await admin.auth.changeAdminPassword('admin-secreta', 'trabajo-123')).message, 'Debe ser distinta de la contraseña de trabajador');
  assert.equal((await admin.auth.changeAdminPassword('admin-secreta', 'otra-clave')).ok, true);
  const p = phone(cloud);
  await p.auth.initialize();
  assert.equal(await p.auth.login('admin-secreta'), 'Contraseña incorrecta');
  assert.equal(await p.auth.login('otra-clave'), null);
  assert.equal(p.auth.state.role, 'ADMIN');
});

test('segundo teléfono en el primer uso: las contraseñas ya existen', async () => {
  const cloud = newCloud();
  await setupCloud(cloud);
  const other = phone(cloud);
  await other.auth.initialize();
  assert.equal(other.auth.state.kind, 'logged-out');
});
