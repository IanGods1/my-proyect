// Utilidades para construir la interfaz sin librerías.

/** h('div', {class: 'x', onclick: fn}, 'texto', otroNodo, [lista]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el, ...children) => {
  el.replaceChildren();
  append(el, children);
  return el;
};

const PATHS = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  settings:
    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  search:
    'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  delete: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  chevron: 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
};

export function icon(name, size = 24) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="currentColor"><path d="${PATHS[name]}"/></svg>`;
  return span;
}

// ---------------------------------------------------------------- Componentes

export function appBar({ title, subtitle, onBack, actions = [] }) {
  return h(
    'header',
    { class: 'appbar' },
    onBack ? h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: onBack }, icon('back')) : null,
    h('div', { class: 'appbar-title' }, h('div', { class: 'at' }, title), subtitle ? h('div', { class: 'as' }, subtitle) : null),
    ...actions,
  );
}

export function bigButton(text, onclick, { icon: ic, outline, danger, disabled, small } = {}) {
  return h(
    'button',
    { class: `btn${outline ? ' outline' : ''}${danger ? ' danger' : ''}${small ? ' small' : ''}`, onclick, disabled: !!disabled, type: 'button' },
    ic ? icon(ic, 22) : null,
    text,
  );
}

export function emptyState(text, detail) {
  return h('div', { class: 'empty' }, icon('info', 44), h('div', { class: 'empty-t' }, text), detail ? h('div', { class: 'empty-d' }, detail) : null);
}

export function noteBox(note) {
  return h('div', { class: 'note' }, `Nota: ${note}`);
}

/** Fila de botones grandes para elegir una opción. Devuelve {el, refresh}. */
export function choiceRow({ options, get, onSelect, sublabel }) {
  const el = h('div', { class: 'choice' });
  const refresh = () => {
    clear(
      el,
      options.map((o) =>
        h(
          'button',
          { type: 'button', class: `btn choice-btn${o.value === get() ? '' : ' outline'}`, onclick: () => onSelect(o.value) },
          h('span', { class: 'cl' }, o.label),
          sublabel ? h('span', { class: 'cs' }, sublabel(o.value) ?? '') : null,
        ),
      ),
    );
  };
  refresh();
  return { el, refresh };
}

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function passwordField({ label, value = '', onInput, onEnter, autocomplete = 'off', autofocus } = {}) {
  const input = h('input', {
    class: 'input',
    type: 'password',
    value,
    autocomplete,
    autocapitalize: 'none',
    spellcheck: 'false',
    placeholder: ' ',
    oninput: (e) => onInput?.(e.target.value),
    onkeydown: (e) => {
      if (e.key === 'Enter') onEnter?.();
    },
  });
  const toggle = h('button', { type: 'button', class: 'link-btn', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
  } }, 'Mostrar');
  const el = h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-row' }, input, toggle));
  if (autofocus) queueMicrotask(() => input.focus());
  return { el, input };
}

// ---------------------------------------------------------------- Avisos y cuadros de diálogo

export function toast(message, ms = 3500) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast', role: 'status' }, message);
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Cuadro de diálogo. Devuelve una función para cerrarlo. */
export function openDialog({ title, body, actions = [], onClose }) {
  const overlay = document.getElementById('overlay');
  const close = () => {
    backdrop.remove();
    onClose?.();
  };
  const backdrop = h(
    'div',
    { class: 'backdrop', onclick: (e) => e.target === backdrop && close() },
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      title ? h('h2', { class: 'dialog-title' }, title) : null,
      h('div', { class: 'dialog-body' }, body),
      actions.length
        ? h(
            'div',
            { class: 'dialog-actions' },
            actions.map((a) =>
              h('button', { type: 'button', class: `text-btn${a.danger ? ' danger' : ''}`, onclick: () => (a.onClick ? a.onClick(close) : close()) }, a.label),
            ),
          )
        : null,
    ),
  );
  overlay.append(backdrop);
  return close;
}

export function confirmDialog({ title, text, confirmText = 'Eliminar' }) {
  return new Promise((resolve) => {
    openDialog({
      title,
      body: h('p', null, text),
      onClose: () => resolve(false),
      actions: [
        { label: 'Cancelar' },
        {
          label: confirmText,
          danger: true,
          onClick: (close) => {
            resolve(true);
            close();
          },
        },
      ],
    });
  });
}
