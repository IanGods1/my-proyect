// Resultado de un modelo: pestañas Case / Vidrio templado (con las clases Normal, 9D y Privacy).
import { h, clear, icon, appBar, emptyState, noteBox, choiceRow } from './dom.js';
import { compatibilityFor, othersOf } from '../core/data.js';
import { VARIANTS, VARIANT_LABEL, VARIANT_FULL, TYPE_LABEL } from '../core/variants.js';

const lower1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function ResultScreen(app, modelId) {
  const isAdmin = app.auth.role === 'ADMIN';
  let tab = 'CASE';
  let variantChoice = null; // null = la primera clase que tenga datos

  const root = h('div', { class: 'screen' });

  function render() {
    const { data, ready } = { data: app.store.data, ready: app.store.ready };
    const model = data.models[modelId];
    const compat = compatibilityFor(data, modelId);

    const glassCount = (v) => othersOf(compat.GLASS.filter((g) => g.variant === v)).length;
    const variant = variantChoice ?? VARIANTS.find((v) => glassCount(v) > 0) ?? 'NORMAL';

    const groups = tab === 'GLASS' ? compat.GLASS.filter((g) => g.variant === variant) : compat.CASE;
    const others = othersOf(groups);
    const tabCount = (t) => othersOf(compat[t]).length;

    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist' },
      ['CASE', 'GLASS'].map((t) =>
        h(
          'button',
          { class: `tab${tab === t ? ' on' : ''}`, type: 'button', role: 'tab', onclick: () => ((tab = t), render()) },
          tabCount(t) > 0 ? `${TYPE_LABEL[t]} (${tabCount(t)})` : TYPE_LABEL[t],
        ),
      ),
    );

    let variants = null;
    if (tab === 'GLASS' && ready && model) {
      variants = choiceRow({
        options: VARIANTS.map((v) => ({ value: v, label: VARIANT_LABEL[v] })),
        get: () => variant,
        onSelect: (v) => {
          variantChoice = v;
          render();
        },
        sublabel: (v) => {
          const n = glassCount(v);
          return n === 0 ? 'sin datos' : n === 1 ? '1 modelo' : `${n} modelos`;
        },
      }).el;
    }

    let content;
    if (!ready) content = h('div', { class: 'spinner', 'aria-label': 'Cargando' });
    else if (!model) content = emptyState('Este modelo ya no existe');
    else if (others.length === 0) {
      content = emptyState(
        'Sin compatibilidades registradas',
        tab === 'CASE' ? 'No hay otros modelos que usen el mismo case.' : `No hay otros modelos que usen el mismo ${lower1(VARIANT_FULL[variant])}.`,
      );
    } else {
      content = h(
        'div',
        { class: 'stack' },
        h('div', { class: 'section-title big' }, tab === 'CASE' ? 'El mismo case le queda a:' : `El mismo ${lower1(VARIANT_FULL[variant])} le queda a:`),
        groups
          .filter((g) => g.others.length > 0)
          .map((g) =>
            h(
              'div',
              { class: 'card variant' },
              h(
                'div',
                { class: 'group-head' },
                h('div', { class: 'grow' }, g.name),
                isAdmin ? h('button', { class: 'icon-btn', style: { color: 'var(--primary)' }, type: 'button', 'aria-label': 'Editar grupo', onclick: () => app.router.go(`/group/${g.id}`) }, icon('edit')) : h('div', { style: { height: '12px' } }),
              ),
              g.others.map((m) =>
                h(
                  'button',
                  { class: 'list-item', type: 'button', onclick: () => app.router.go(`/m/${m.id}`) },
                  h('div', { class: 'grow' }, h('div', { class: 'li-title' }, m.name), h('div', { class: 'li-sub' }, m.brand)),
                  icon('chevron'),
                ),
              ),
              g.note ? noteBox(g.note) : null,
            ),
          ),
      );
    }

    clear(
      root,
      appBar({ title: model?.name ?? 'Modelo', subtitle: model?.brand, onBack: () => app.router.back('/') }),
      tabs,
      h('main', { class: 'content' }, variants, content),
    );
  }

  render();
  return { el: root, update: render };
}
