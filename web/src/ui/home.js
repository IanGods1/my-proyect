// Pantalla principal: buscador con sugerencias.
import { h, clear, icon, appBar, bigButton, emptyState } from './dom.js';
import { searchModels } from '../core/search.js';
import { modelsList } from '../core/data.js';

export function HomeScreen(app) {
  const isAdmin = app.auth.role === 'ADMIN';
  let query = '';

  const input = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Buscar modelo (ej. iPhone 13)',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': 'Buscar modelo',
    oninput: (e) => {
      query = e.target.value;
      renderBody();
    },
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      const first = searchModels(modelsList(app.store.data), query, 1)[0];
      if (first) {
        input.blur();
        app.router.go(`/m/${first.id}`);
      }
    },
  });
  const clearBtn = h('button', { class: 'icon-btn clear', type: 'button', 'aria-label': 'Borrar búsqueda', hidden: true, onclick: () => {
    query = '';
    input.value = '';
    renderBody();
    input.focus();
  } }, icon('close'));
  const body = h('div', { class: 'stack' });

  function renderBody() {
    clearBtn.hidden = query === '';
    const models = modelsList(app.store.data);
    if (query.trim() === '') {
      const nModels = models.length;
      const nGroups = Object.keys(app.store.data.groups).length;
      clear(
        body,
        h('p', { class: 'muted' }, 'Escribe un modelo para ver qué otros teléfonos usan el mismo case o el mismo vidrio templado.'),
        bigButton('Lista de modelos', () => app.router.go('/models'), { icon: 'list' }),
        isAdmin ? bigButton('Administrar datos', () => app.router.go('/admin'), { icon: 'edit', outline: true }) : null,
        isAdmin ? bigButton('Configuración', () => app.router.go('/settings'), { icon: 'settings', outline: true }) : null,
        app.store.ready
          ? h('p', { class: 'muted small' }, `${nModels} modelos registrados · ${nGroups} grupos de compatibilidad`)
          : h('p', { class: 'muted small' }, 'Cargando datos…'),
      );
      return;
    }
    const results = searchModels(models, query, 30);
    if (results.length === 0) {
      clear(
        body,
        emptyState(
          app.store.ready ? 'No se encontró ningún modelo' : 'Cargando datos…',
          app.store.ready ? (isAdmin ? 'Revisa cómo está escrito o agrégalo desde "Administrar datos".' : 'Revisa cómo está escrito.') : null,
        ),
      );
      return;
    }
    clear(
      body,
      results.map((m) =>
        h(
          'button',
          { class: 'list-item suggestion', type: 'button', onclick: () => app.router.go(`/m/${m.id}`) },
          h('div', { class: 'grow' }, h('div', { class: 'li-title' }, m.name), h('div', { class: 'li-sub' }, m.brand)),
          icon('chevron'),
        ),
      ),
    );
  }

  renderBody();
  return {
    el: h(
      'div',
      { class: 'screen' },
      appBar({
        title: 'Guastaccesorio',
        subtitle: 'Compatibilidad de cases y vidrios',
        actions: isAdmin ? [h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Configuración', onclick: () => app.router.go('/settings') }, icon('settings'))] : [],
      }),
      h('main', { class: 'content' }, h('div', { class: 'search-wrap' }, icon('search'), input, clearBtn), body),
    ),
    update: renderBody,
  };
}
