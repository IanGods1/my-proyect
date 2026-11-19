// Configuración (solo administrador): contraseñas, estado de la nube, tema y cerrar sesión.
import { h, icon, appBar, bigButton, passwordField, openDialog, confirmDialog, toast } from './dom.js';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '../auth.js';

const THEMES = [
  ['system', 'Según el sistema'],
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
];

export function SettingsScreen(app) {
  const root = h('div', { class: 'screen' });
  let busy = false;

  /** Pide (opcionalmente) la contraseña actual y la nueva dos veces. */
  function passwordDialog({ title, askCurrent, confirmText, onSubmit }) {
    const v = { current: '', next: '', confirm: '' };
    const error = h('p', { class: 'error-text', role: 'alert' });
    const submit = () => {
      error.textContent =
        (askCurrent && !v.current && 'Escribe tu contraseña actual') ||
        validateNewPassword(v.next, v.confirm) ||
        (askCurrent && v.next === v.current && 'La nueva contraseña debe ser distinta de la actual') ||
        '';
      if (!error.textContent) {
        close();
        onSubmit(v.current, v.next);
      }
    };
    const close = openDialog({
      title,
      body: [
        askCurrent ? passwordField({ label: 'Contraseña actual', onInput: (x) => (v.current = x), autofocus: true }).el : null,
        passwordField({ label: 'Nueva contraseña', onInput: (x) => (v.next = x), autofocus: !askCurrent }).el,
        passwordField({ label: 'Repite la nueva contraseña', onInput: (x) => (v.confirm = x), onEnter: submit }).el,
        h('p', { class: 'muted small' }, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`),
        error,
      ],
      actions: [{ label: 'Cancelar' }, { label: confirmText, onClick: () => submit() }],
    });
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    const res = await action();
    busy = false;
    toast(res.message, 6000);
  }

  const changeWorker = () =>
    passwordDialog({
      title: 'Nueva contraseña de trabajador',
      askCurrent: false,
      confirmText: 'Continuar',
      onSubmit: async (_c, next) => {
        const ok = await confirmDialog({
          title: 'Cambiar contraseña de trabajador',
          text: 'Se cerrará la sesión en todos los teléfonos de trabajadores. ¿Continuar?',
          confirmText: 'Continuar',
        });
        if (ok) run(() => app.auth.changeWorkerPassword(next));
      },
    });

  const changeAdmin = () =>
    passwordDialog({
      title: 'Cambiar mi contraseña de administrador',
      askCurrent: true,
      confirmText: 'Cambiar',
      onSubmit: (current, next) => run(() => app.auth.changeAdminPassword(current, next)),
    });

  const logout = async () => {
    const ok = await confirmDialog({
      title: 'Cerrar sesión',
      text: 'La app volverá a pedir la contraseña en este dispositivo. Tus datos no se borran.',
      confirmText: 'Cerrar sesión',
    });
    if (ok) app.auth.logoutAdmin();
  };

  function render() {
    const theme = app.theme.get();
    root.replaceChildren(
      appBar({ title: 'Configuración', onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        h('div', { class: 'section-title big' }, 'Contraseñas'),
        bigButton('Cambiar contraseña de trabajador', changeWorker, { icon: 'lock' }),
        h('p', { class: 'muted small' }, 'Úsalo cuando un trabajador deja de trabajar contigo: todos los trabajadores tendrán que escribir la nueva contraseña.'),
        bigButton('Cambiar mi contraseña de administrador', changeAdmin, { icon: 'lock', outline: true }),

        h('div', { class: 'section-title big' }, 'Datos en la nube'),
        h(
          'div',
          { class: 'card', style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('div', { class: 'bold' }, navigator.onLine ? 'Conectado a Firebase' : 'Sin conexión con la nube'),
          h('div', null, navigator.onLine ? 'Los cambios que hagas se suben solos y los trabajadores los reciben en sus teléfonos.' : 'Se usa la copia guardada en este dispositivo. Los cambios se subirán cuando vuelva internet.'),
        ),
        h('p', { class: 'muted small' }, 'Usa un solo dispositivo como administrador a la vez para evitar cambios cruzados.'),

        h('div', { class: 'section-title big' }, 'Tema'),
        h(
          'div',
          { class: 'card' },
          THEMES.map(([value, label]) =>
            h('button', { class: 'radio-row', type: 'button', onclick: () => (app.theme.set(value), render()) }, h('span', { class: `dot${theme === value ? ' on' : ''}` }), label),
          ),
        ),

        h('div', { class: 'section-title big' }, 'Sesión'),
        bigButton('Cerrar sesión', logout, { danger: true }),
        h('p', { class: 'muted small center' }, 'Guastaccesorio web · versión 2.1'),
      ),
    );
  }

  render();
  return { el: root };
}
