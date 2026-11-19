// Copia local de los datos + escritura de cambios. Observable: la interfaz se actualiza sola.
import { emptyData, makeDraft, diffData, parseModelDoc, parseGroupDoc } from './data.js';

export class Store {
  /** @param {{commit: (writes: Array) => Promise<void>}} backend */
  constructor(backend) {
    this.backend = backend;
    this.data = emptyData();
    this.loaded = { models: false, groups: false };
    this.listeners = new Set();
    /** Se llama si la nube rechaza o no puede guardar un cambio. */
    this.onWriteError = null;
  }

  get ready() {
    return this.loaded.models && this.loaded.groups;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn();
  }

  /** Reemplaza los modelos con el último estado recibido de la nube. */
  setModels(docs) {
    const models = {};
    for (const [id, d] of Object.entries(docs)) models[id] = parseModelDoc(id, d);
    this.data = { ...this.data, models };
    this.loaded.models = true;
    this.emit();
  }

  setGroups(docs) {
    const groups = {};
    for (const [id, d] of Object.entries(docs)) groups[id] = parseGroupDoc(id, d);
    this.data = { ...this.data, groups };
    this.loaded.groups = true;
    this.emit();
  }

  reset() {
    this.data = emptyData();
    this.loaded = { models: false, groups: false };
    this.emit();
  }

  /**
   * Aplica un cambio: `mutate(draft)` modifica una copia; luego se suben solo las diferencias.
   * Devuelve lo que devuelva `mutate` (si trae `error`, no se guarda nada).
   * replace: parte de datos vacíos (para "Reemplazar todo" al importar).
   */
  apply(mutate, { replace = false } = {}) {
    const draft = makeDraft(replace ? emptyData() : this.data);
    const result = mutate(draft) ?? {};
    if (result.error) return result;
    const writes = diffData(this.data, draft.data);
    if (writes.length > 0) {
      this.data = draft.data;
      this.emit();
      Promise.resolve(this.backend.commit(writes)).catch((e) => this.onWriteError?.(e));
    }
    return result;
  }
}
