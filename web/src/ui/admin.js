// Administrar datos: grupos de compatibilidad, importar y exportar.
import { h, clear, icon, appBar, bigButton, emptyState, openDialog, confirmDialog, toast } from './dom.js';
import { deleteGroup, importRows, exportTable } from '../core/data.js';
import { parseCsv, writeCsv } from '../core/csv.js';
import { readXlsx, writeXlsx, isXlsx, isLegacyXls } from '../core/xlsx.js';
import { parseTable } from '../core/importer.js';
import { normalize } from '../core/text.js';
import { TYPE_LABEL, VARIANTS, VARIANT_LABEL, VARIANT_FULL } from '../core/variants.js';

export function AdminScreen(app) {
  let filter = null; // null = todos, 'CASE' o 'GLASS'
  const list = h('div', { class: 'stack' });
  const chips = h('div', { class: 'chips' });
  const fileInput = h('input', {
    type: 'file',
    accept: '.csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await readImportFile(file);
    },
  });

  function renderGroups() {
    clear(
      chips,
      [[null, 'Todos'], ['CASE', 'Case'], ['GLASS', 'Vidrio templado']].map(([value, label]) =>
        h('button', { class: `chip${filter === value ? ' on' : ''}`, type: 'button', onclick: () => ((filter = value), renderGroups()) }, label),
      ),
    );
    if (!app.store.ready) return clear(list, h('div', { class: 'spinner' }));
    const data = app.store.data;
    const groups = Object.values(data.groups)
      .filter((g) => filter === null || g.type === filter)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if (groups.length === 0) return clear(list, emptyState('No hay grupos registrados'));
    clear(
      list,
      groups.map((g) =>
        h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'list-item', style: { alignItems: 'flex-start' } },
            h(
              'button',
              { class: 'grow stack', style: { border: 0, background: 'transparent', textAlign: 'left', gap: '4px', padding: 0 }, type: 'button', onclick: () => app.router.go(`/group/${g.id}`) },
              h('span', { class: `badge${g.type === 'GLASS' ? ' glass' : ''}` }, g.type === 'GLASS' ? `${TYPE_LABEL.GLASS} · ${VARIANT_LABEL[g.variant]}` : TYPE_LABEL.CASE),
              h('span', { class: 'li-title' }, g.name),
              h(
                'span',
                null,
                g.models
                  .map((id) => data.models[id]?.name)
                  .filter(Boolean)
                  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                  .join(', ') || '(sin modelos)',
              ),
              g.note ? h('span', { class: 'muted' }, `Nota: ${g.note}`) : null,
            ),
            h('button', { class: 'icon-btn', style: { color: 'var(--error)' }, type: 'button', 'aria-label': 'Eliminar grupo', onclick: () => removeGroup(g) }, icon('delete')),
          ),
        ),
      ),
    );
  }

  async function removeGroup(g) {
    if (await confirmDialog({ title: 'Eliminar grupo', text: `¿Eliminar el grupo "${g.name}"? Los modelos seguirán registrados.` })) {
      app.store.apply((d) => deleteGroup(d, g.id));
      toast(`Grupo "${g.name}" eliminado`);
    }
  }

  // ---------------------------------------------------------------- Nuevo grupo

  function newGroupDialog() {
    const go = (type, variant) => {
      close();
      app.router.go(`/group/new?type=${type}&variant=${variant}`);
    };
    const close = openDialog({
      title: '¿Qué tipo de grupo?',
      body: [
        bigButton('Case', () => go('CASE', 'NORMAL')),
        ...VARIANTS.map((v) => bigButton(VARIANT_FULL[v], () => go('GLASS', v))),
      ],
      actions: [{ label: 'Cancelar' }],
    });
  }

  // ---------------------------------------------------------------- Importar

  async function readImportFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let table;
      if (isLegacyXls(bytes)) throw new Error('Formato .xls antiguo no soportado. En Excel usa "Guardar como" .xlsx o .csv');
      if (isXlsx(bytes)) table = readXlsx(bytes);
      else table = parseCsv(new TextDecoder('utf-8').decode(bytes));
      const parsed = parseTable(table);
      if (parsed.rows.length === 0) return toast(`No se encontraron datos para importar${parsed.errors[0] ? '. ' + parsed.errors[0] : ''}`);
      confirmImport(parsed);
    } catch (e) {
      toast(`Error al leer el archivo: ${e.message}`);
    }
  }

  function confirmImport({ rows, errors }) {
    const groupCount = new Set(rows.filter((r) => r.type).map((r) => `${r.type}|${r.variant}|${normalize(r.group)}`)).size;
    const modelCount = new Set(rows.map((r) => normalize(r.model))).size;
    const doImport = async (replace) => {
      if (replace && !(await confirmDialog({ title: 'Reemplazar todo', text: 'Se borrarán TODOS los grupos y modelos actuales y se cargarán los del archivo. ¿Continuar?', confirmText: 'Reemplazar' }))) return;
      close();
      const s = app.store.apply((d) => importRows(d, rows), { replace });
      toast(`Importación completa: ${s.newGroups} grupos nuevos, ${s.newModels} modelos nuevos, ${s.newLinks} compatibilidades agregadas`, 6000);
    };
    const close = openDialog({
      title: 'Importar datos',
      body: [
        h('p', null, `Se encontraron ${rows.length} filas válidas: ${groupCount} grupos y ${modelCount} modelos.`),
        errors.length
          ? h('div', { class: 'stack' }, h('p', { class: 'error-text small' }, `${errors.length} filas con errores se omitirán:`), errors.slice(0, 5).map((e) => h('p', { class: 'small' }, `• ${e}`)), errors.length > 5 ? h('p', { class: 'small' }, `…y ${errors.length - 5} más`) : null)
          : null,
        bigButton('Agregar a los datos actuales', () => doImport(false)),
        bigButton('Reemplazar todo', () => doImport(true), { outline: true }),
      ],
      actions: [{ label: 'Cancelar' }],
    });
  }

  // ---------------------------------------------------------------- Exportar

  function exportDialog() {
    const stamp = new Date().toISOString().slice(0, 10);
    const save = (bytesOrText, mime, ext) => {
      const blob = new Blob([bytesOrText], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `guastaccesorio_respaldo_${stamp}.${ext}` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const n = exportTable(app.store.data).length - 1;
      toast(`Respaldo listo (${n} filas)`);
    };
    const close = openDialog({
      title: 'Exportar respaldo',
      body: [
        h('p', null, 'Guarda todos los grupos y modelos en un archivo.'),
        bigButton('CSV', () => (close(), save(writeCsv(exportTable(app.store.data)), 'text/csv;charset=utf-8', 'csv'))),
        bigButton('Excel (.xlsx)', () => (close(), save(writeXlsx(exportTable(app.store.data), 'Guastaccesorio'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx')), { outline: true }),
      ],
      actions: [{ label: 'Cancelar' }],
    });
  }

  renderGroups();
  return {
    el: h(
      'div',
      { class: 'screen' },
      appBar({ title: 'Administrar datos', onBack: () => app.router.back('/') }),
      h(
        'main',
        { class: 'content' },
        bigButton('Nuevo grupo de compatibilidad', newGroupDialog, { icon: 'add' }),
        bigButton('Administrar modelos', () => app.router.go('/admin/models'), { icon: 'list', outline: true }),
        h('div', { class: 'row' }, bigButton('Importar', () => fileInput.click(), { outline: true }), bigButton('Exportar', exportDialog, { outline: true })),
        h('p', { class: 'muted small' }, 'Importar: archivo CSV o Excel (.xlsx) con columnas tipo, grupo, modelo, nota (opcionales: marca, variante).'),
        fileInput,
        h('div', { class: 'section-title big' }, 'Grupos registrados'),
        chips,
        list,
      ),
    ),
    update: renderGroups,
  };
}
