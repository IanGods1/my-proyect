// Lista de todos los modelos por marca. En modo administrador permite agregar, editar y eliminar modelos.
import { h, clear, icon, appBar, emptyState, openDialog, confirmDialog, toast } from './dom.js';
import { modelsByBrand, modelsList, addModel, updateModel, deleteModel } from '../core/data.js';
import { searchModels } from '../core/search.js';
import { knownBrands } from '../core/brands.js';

export function ModelsScreen(app, { admin }) {
  let filter = '';
  const list = h('div', { class: 'stack' });
  const title = appBar({ title: admin ? 'Administrar modelos' : 'Modelos registrados', onBack: () => app.router.back(admin ? '/admin' : '/') });

  const input = h('input', {
    class: 'input',
    type: 'search',
    placeholder: 'Filtrar modelos',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    oninput: (e) => {
      filter = e.target.value;
      render();
    },
  });

  function render() {
    const all = modelsList(app.store.data);
    const visible = filter.trim() ? searchModels(all, filter, Infinity) : all;
    title.querySelector('.appbar-title').replaceChildren(
      h('div', { class: 'at' }, admin ? 'Administrar modelos' : 'Modelos registrados'),
      app.store.ready ? h('div', { class: 'as' }, `${visible.length} modelos`) : null,
    );
    if (!app.store.ready) return clear(list, h('div', { class: 'spinner' }));
    if (visible.length === 0) {
      return clear(
        list,
        emptyState(filter.trim() ? 'No se encontró ningún modelo' : 'Todavía no hay modelos registrados', filter.trim() ? null : 'Agrega grupos de compatibilidad desde "Administrar datos".'),
      );
    }
    clear(
      list,
      modelsByBrand(visible).map(({ brand, models }) => [
        h('div', { class: 'brand-head' }, `${brand} (${models.length})`),
        h(
          'div',
          { class: 'card' },
          models.map((m) =>
            admin
              ? h(
                  'div',
                  { class: 'list-item' },
                  h('button', { class: 'grow link-btn', style: { textAlign: 'left', color: 'inherit', fontSize: '18px', fontWeight: 600 }, type: 'button', onclick: () => editDialog(m) }, m.name),
                  h('button', { class: 'icon-btn', style: { color: 'var(--primary)' }, type: 'button', 'aria-label': `Editar ${m.name}`, onclick: () => editDialog(m) }, icon('edit')),
                  h('button', { class: 'icon-btn', style: { color: 'var(--error)' }, type: 'button', 'aria-label': `Eliminar ${m.name}`, onclick: () => remove(m) }, icon('delete')),
                )
              : h('button', { class: 'list-item', type: 'button', onclick: () => app.router.go(`/m/${m.id}`) }, h('div', { class: 'grow li-title' }, m.name), icon('chevron')),
          ),
        ),
      ]),
    );
  }

  async function remove(m) {
    if (await confirmDialog({ title: 'Eliminar modelo', text: `¿Eliminar "${m.name}"? También se quitará de todos los grupos de compatibilidad.` })) {
      app.store.apply((d) => deleteModel(d, m.id));
      toast(`"${m.name}" eliminado`);
    }
  }

  /** Agregar (model = null) o editar un modelo. */
  function editDialog(model) {
    const name = h('input', { class: 'input', value: model?.name ?? '', placeholder: 'ej. Galaxy A54', autocapitalize: 'words', autocomplete: 'off' });
    const brand = h('input', { class: 'input', value: model?.brand ?? '', placeholder: 'Se detecta sola si la dejas vacía', autocapitalize: 'words', list: 'brand-options', autocomplete: 'off' });
    const datalist = h('datalist', { id: 'brand-options' }, knownBrands.map((b) => h('option', { value: b })));
    const error = h('p', { class: 'error-text' });
    openDialog({
      title: model ? 'Editar modelo' : 'Agregar modelo',
      body: [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Modelo'), name),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Marca'), brand, datalist),
        error,
      ],
      actions: [
        { label: 'Cancelar' },
        {
          label: 'Guardar',
          onClick: (close) => {
            const res = app.store.apply((d) => (model ? updateModel(d, model.id, name.value, brand.value) : addModel(d, name.value, brand.value)));
            if (res.error) {
              error.textContent = res.error;
              return;
            }
            toast(model ? 'Modelo actualizado' : 'Modelo agregado');
            close();
          },
        },
      ],
    });
    setTimeout(() => name.focus(), 50);
  }

  render();
  return {
    el: h(
      'div',
      { class: 'screen' },
      title,
      h('main', { class: `content${admin ? ' with-fab' : ''}` }, input, list),
      admin ? h('button', { class: 'btn fab', type: 'button', onclick: () => editDialog(null) }, icon('add', 22), 'Agregar modelo') : null,
    ),
    update: render,
  };
}
