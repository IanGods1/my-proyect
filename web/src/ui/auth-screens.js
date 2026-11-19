// Pantallas de acceso: primer uso (crear contraseñas), ingreso con un solo campo y "sin internet".
import { h, icon, passwordField, bigButton } from './dom.js';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '../auth.js';

const shell = (...children) => h('div', { class: 'screen' }, h('main', { class: 'auth' }, ...children));

export function LoadingScreen() {
  return { el: shell(h('div', { class: 'spinner', 'aria-label': 'Cargando' })) };
}

/** Un solo campo de contraseña y el botón "Entrar". */
export function LoginScreen(app, message) {
  let password = '';
  let busy = false;
  let timer = null;

  const errorEl = h('p', { class: 'error-text center', role: 'alert' });
  const lockEl = h('p', { class: 'error-text center' });
  const enter = bigButton('Entrar', () => submit());
  const field = passwordField({
    label: 'Contraseña',
    autofocus: true,
    onInput: (v) => {
      password = v;
      refresh();
    },
    onEnter: () => submit(),
  });

  function refresh() {
    const locked = app.auth.remainingLockSeconds();
    lockEl.textContent = locked > 0 ? `Bloqueado: intenta de nuevo en ${locked} segundos` : '';
    enter.disabled = busy || locked > 0 || password.length === 0;
    enter.textContent = busy ? 'Entrando…' : 'Entrar';
    if (locked > 0 && !timer) timer = setInterval(refresh, 1000);
    if (locked === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function submit() {
    if (busy || enter.disabled) return;
    busy = true;
    errorEl.textContent = '';
    refresh();
    const error = await app.auth.login(password);
    busy = false;
    if (error) {
      errorEl.textContent = error;
      field.input.focus();
      field.input.select();
    }
    refresh();
  }

  refresh();
  return {
    el: shell(
      h('div', { class: 'lock' }, icon('lock', 56)),
      h('h1', null, 'Guastaccesorio'),
      h('p', { class: 'center muted' }, 'Escribe tu contraseña para entrar'),
      message ? h('div', { class: 'banner' }, message) : null,
      field.el,
      errorEl,
      lockEl,
      enter,
    ),
    dispose: () => timer && clearInterval(timer),
  };
}

/** Primer uso: crear la contraseña de administrador y la de trabajador. */
export function SetupScreen(app) {
  const v = { admin: '', adminConfirm: '', worker: '', workerConfirm: '' };
  let busy = false;
  const errorEl = h('p', { class: 'error-text center', role: 'alert' });
  const create = bigButton('Crear contraseñas', () => submit());

  const f = (label, key, extra = {}) => passwordField({ label, onInput: (x) => (v[key] = x), ...extra });

  async function submit() {
    if (busy) return;
    const problem =
      (validateNewPassword(v.admin, v.adminConfirm) && `Administrador: ${validateNewPassword(v.admin, v.adminConfirm)}`) ||
      (validateNewPassword(v.worker, v.workerConfirm) && `Trabajador: ${validateNewPassword(v.worker, v.workerConfirm)}`) ||
      (v.admin === v.worker && 'Las dos contraseñas deben ser distintas') ||
      null;
    if (problem) {
      errorEl.textContent = problem;
      return;
    }
    busy = true;
    errorEl.textContent = '';
    create.disabled = true;
    create.textContent = 'Creando…';
    const error = await app.auth.setup(v.admin, v.worker);
    busy = false;
    create.disabled = false;
    create.textContent = 'Crear contraseñas';
    if (error) errorEl.textContent = error;
  }

  return {
    el: shell(
      h('h1', null, 'Bienvenido a Guastaccesorio'),
      h('p', { class: 'center' }, `Crea las dos contraseñas de la app. Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`),
      h('div', { class: 'section-title' }, 'Contraseña de ADMINISTRADOR'),
      h('p', { class: 'muted small' }, 'Solo para ti. Permite agregar, editar, importar, exportar y cambiar contraseñas.'),
      f('Contraseña de administrador', 'admin').el,
      f('Repite la contraseña de administrador', 'adminConfirm').el,
      h('div', { class: 'section-title' }, 'Contraseña de TRABAJADOR'),
      h('p', { class: 'muted small' }, 'La que compartes con tus empleados. Solo permite buscar y ver compatibilidades.'),
      f('Contraseña de trabajador', 'worker').el,
      f('Repite la contraseña de trabajador', 'workerConfirm', { onEnter: submit }).el,
      errorEl,
      create,
    ),
  };
}

export function NeedsInternetScreen(app, message) {
  return {
    el: shell(
      h('div', { class: 'lock' }, icon('warning', 56)),
      h('h1', null, 'Guastaccesorio'),
      h('p', { class: 'center bold' }, message),
      bigButton('Reintentar', () => app.auth.retry()),
    ),
  };
}
