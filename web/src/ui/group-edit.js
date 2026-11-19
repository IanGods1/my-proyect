// Formulario de un grupo de compatibilidad: tipo → clase de vidrio → marca → modelos → nota → nombre (opcional).
import { h, clear, icon, appBar, bigButton, choiceRow, confirmDialog, toast } from './dom.js';
import { saveGroup, deleteGroup, modelsList } from '../core/data.js';
import { TYPES, TYPE_LABEL, VARIANTS, VARIANT_LABEL } from '../core/variants.js';
import { defaultGroupName, resolveModel } from '../core/naming.js';
import { searchModels } from '../core/search.js';
import { normalize, clean } from '../core/text.js';
import { OTHER, canonical, detect, knownBrands, compareBrands } from '../core/brands.js';

export function GroupEditScreen(app, { id, type = 'CASE', variant = 'NORMAL' }) {
  const state = { type, variant, brand: '', modelInput: '', models: [], note: '', name: '' };
  let loaded = !id; // al editar, se cargan los datos del grupo cuando están disponibles
  let missing = false;
  let error = '';

  const root = h('div', { class: 'screen' });

  // ---------------------------------------------------------------- Partes de la pantalla

  const typeRow = choiceRow({
    options: TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
    get: () => state.type,
    onSelect: (t) => {
      state.type = t;
      typeRow.refresh();
      variantSection.hidden = t !== 'GLASS';
      refreshName();
    },
  });
  const variantRow = choiceRow({
    options: VARIANTS.map((v) => ({ value: v, label: VARIANT_LABEL[v] })),
    get: () => state.variant,
    onSelect: (v) => {
      state.variant = v;
      variantRow.refresh();
      refreshName();
    },
  });
  const variantSection = h('div', { class: 'stack', hidden: state.type !== 'GLASS' }, h('div', { class: 'section-title' }, 'Clase de vidrio'), variantRow.el);

  const brandInput = h('input', {
    class: 'input',
    placeholder: 'Automática (según el nombre)',
    autocapitalize: 'words',
    autocomplete: 'off',
    oninput: (e) => {
      state.brand = e.target.value;
      refreshBrandChips();
    },
  });
  const brandChips = h('div', { class: 'chips' });

  const modelInput = h('input', {
    class: 'input',
    placeholder: 'ej. A54',
    autocapitalize: 'words',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    oninput: (e) => {
      state.modelInput = e.target.value;
      refreshSuggestions();
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addFromInput();
      }
    },
  });
  const addBtn = h('button', { class: 'btn small', type: 'button', 'aria-label': 'Agregar modelo', onclick: () => addFromInput() }, icon('add', 24));
  const suggestions = h('div', { class: 'card', hidden: true });
  const modelsList_ = h('div');

  const noteInput = h('textarea', { class: 'input', rows: '2', placeholder: 'ej. La cámara del 15 queda un poco justa', oninput: (e) => (state.note = e.target.value) });
  const nameInput = h('input', {
    class: 'input',
    autocomplete: 'off',
    oninput: (e) => {
      state.name = e.target.value;
    },
  });
  const errorEl = h('p', { class: 'error-text', role: 'alert' });

  // ---------------------------------------------------------------- Lógica

  const knownModels = () => modelsList(app.store.data).map((m) => ({ name: m.name, brand: m.brand }));

  function brandOptions() {
    const fromData = modelsList(app.store.data).map((m) => m.brand);
    return [...new Set([...knownBrands, ...fromData])].filter((b) => b && b !== OTHER).sort(compareBrands);
  }

  function refreshBrandChips() {
    const current = canonical(state.brand);
    clear(brandChips, [
      h('button', { class: `chip${state.brand.trim() === '' ? ' on' : ''}`, type: 'button', onclick: () => setBrand('') }, 'Automática'),
      ...brandOptions().map((b) => h('button', { class: `chip${current === b ? ' on' : ''}`, type: 'button', onclick: () => setBrand(b) }, b)),
    ]);
  }

  function setBrand(b) {
    state.brand = b;
    brandInput.value = b;
    refreshBrandChips();
  }

  /** Agrega el/los modelo(s) escritos con la marca elegida: "A54, A55". */
  function addFromInput(text = state.modelInput) {
    const parts = String(text).split(/[,;\n]/).map(clean).filter(Boolean);
    const known = knownModels();
    const chosen = canonical(state.brand);
    for (const p of parts) {
      const match = resolveModel(p, chosen, known);
      const entry = match
        ? { name: match.name, brand: match.brand === OTHER && chosen ? chosen : match.brand }
        : { name: p, brand: chosen };
      const key = normalize(entry.name);
      if (!key || state.models.some((m) => normalize(m.name) === key)) continue;
      state.models.push(entry);
    }
    state.modelInput = '';
    modelInput.value = '';
    error = '';
    errorEl.textContent = '';
    refreshModels();
    refreshSuggestions();
    refreshName();
  }

  function refreshSuggestions() {
    const text = state.modelInput.trim();
    if (!text) return void (suggestions.hidden = true);
    const current = new Set(state.models.map((m) => normalize(m.name)));
    const found = searchModels(modelsList(app.store.data), text, 10)
      .filter((m) => !current.has(normalize(m.name)))
      .slice(0, 5);
    suggestions.hidden = found.length === 0;
    clear(
      suggestions,
      found.map((m) =>
        h('button', { class: 'list-item', type: 'button', onclick: () => addFromInput(m.name) }, icon('add'), h('span', { class: 'li-title' }, `${m.name}  ·  ${m.brand}`)),
      ),
    );
  }

  function refreshModels() {
    if (state.models.length === 0) {
      return clear(modelsList_, h('p', { class: 'muted' }, 'Todavía no agregaste modelos.'));
    }
    clear(
      modelsList_,
      h(
        'div',
        { class: 'card' },
        state.models.map((m) =>
          h(
            'div',
            { class: 'list-item' },
            h('div', { class: 'grow' }, h('div', { class: 'li-title' }, m.name), h('div', { class: 'li-sub' }, m.brand || detect(m.name))),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Quitar ${m.name}`, onclick: () => ((state.models = state.models.filter((x) => x !== m)), refreshModels(), refreshName()) }, icon('close')),
          ),
        ),
      ),
    );
  }

  function refreshName() {
    nameInput.placeholder = state.models.length === 0 ? 'Se genera solo con los modelos' : defaultGroupName(state.type, state.variant, state.models);
  }

  function save() {
    if (state.modelInput.trim()) addFromInput();
    const res = app.store.apply((d) => saveGroup(d, { id, ...state }));
    if (res.error) {
      error = res.error;
      errorEl.textContent = error;
      return;
    }
    toast('Grupo guardado');
    app.router.back('/admin');
  }

  async function remove() {
    if (await confirmDialog({ title: 'Eliminar grupo', text: `¿Eliminar el grupo "${state.name || nameInput.placeholder}"? Los modelos seguirán registrados.` })) {
      app.store.apply((d) => deleteGroup(d, id));
      toast('Grupo eliminado');
      app.router.back('/admin');
    }
  }

  // ---------------------------------------------------------------- Armado

  function build() {
    refreshBrandChips();
    refreshModels();
    refreshSuggestions();
    refreshName();
    brandInput.value = state.brand;
    noteInput.value = state.note;
    nameInput.value = state.name;
    variantSection.hidden = state.type !== 'GLASS';
    typeRow.refresh();
    variantRow.refresh();
    clear(
      root,
      appBar({
        title: id ? 'Editar grupo' : 'Nuevo grupo',
        onBack: () => app.router.back('/admin'),
        actions: id ? [h('button', { class: 'icon-btn', style: { color: 'var(--on-navy)' }, type: 'button', 'aria-label': 'Eliminar grupo', onclick: remove }, icon('delete'))] : [],
      }),
      h(
        'main',
        { class: 'content' },
        h('div', { class: 'section-title' }, 'Tipo'),
        typeRow.el,
        variantSection,
        h('div', { class: 'section-title' }, 'Marca'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Marca de los modelos que vas a agregar'), brandInput),
        brandChips,
        h('p', { class: 'field-hint' }, 'Elige la marca una vez y escribe solo los modelos (ej. A54, A55). Puedes cambiar de marca antes de agregar los siguientes.'),
        h('div', { class: 'section-title' }, `Modelos del grupo (${state.models.length})`),
        h('div', { class: 'row' }, h('label', { class: 'grow field' }, h('span', { class: 'field-label' }, 'Agregar modelo'), modelInput), addBtn),
        h('p', { class: 'field-hint' }, 'Puedes escribir varios separados por coma: A54, A55'),
        suggestions,
        modelsList_,
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota (opcional)'), noteInput),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre del grupo (opcional)'), nameInput, h('span', { class: 'field-hint' }, 'Si lo dejas vacío se genera con los modelos')),
        errorEl,
        bigButton('Guardar grupo', save),
        id ? bigButton('Eliminar grupo', remove, { danger: true }) : null,
      ),
    );
  }

  /** Al editar: carga el grupo cuando ya llegaron los datos. */
  function tryLoad() {
    if (loaded) return true;
    const g = app.store.data.groups[id];
    if (g) {
      state.type = g.type;
      state.variant = g.variant;
      state.name = g.name;
      state.note = g.note;
      state.models = g.models
        .map((mid) => app.store.data.models[mid])
        .filter(Boolean)
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((m) => ({ name: m.name, brand: m.brand }));
      loaded = true;
      return true;
    }
    missing = app.store.ready;
    return false;
  }

  function render() {
    if (tryLoad()) return void (root.firstChild ? null : build());
    clear(
      root,
      appBar({ title: 'Editar grupo', onBack: () => app.router.back('/admin') }),
      h('main', { class: 'content' }, missing ? h('p', { class: 'center bold' }, 'El grupo ya no existe') : h('div', { class: 'spinner' })),
    );
  }

  // Si el grupo se carga más tarde, se arma el formulario una sola vez.
  const update = () => {
    if (!root.querySelector('.field')) {
      if (tryLoad()) build();
      else render();
    } else {
      // Con el formulario ya armado solo se refrescan las sugerencias y las marcas (llegan datos nuevos).
      refreshBrandChips();
      refreshSuggestions();
    }
  };

  render();
  return { el: root, update };
}
