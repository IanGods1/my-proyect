// Guastaccesorio (web): arranque de la aplicación.
import { firebaseConfig } from './config.js';
import { FirebaseBackend } from './backend-firebase.js';
import { MemoryBackend } from './backend-memory.js';
import { Store } from './core/store.js';
import { AuthManager } from './auth.js';
import { derive, newSalt } from './core/passwords.js';
import { Router } from './router.js';
import { toast } from './ui/dom.js';
import { LoadingScreen, LoginScreen, SetupScreen, NeedsInternetScreen } from './ui/auth-screens.js';
import { HomeScreen } from './ui/home.js';
import { ResultScreen } from './ui/result.js';
import { ModelsScreen } from './ui/models.js';
import { AdminScreen } from './ui/admin.js';
import { GroupEditScreen } from './ui/group-edit.js';
import { SettingsScreen } from './ui/settings.js';

/* global __TEST__ */

/** localStorage, o una copia en memoria si el navegador no lo permite. */
function safeStorage() {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
}
const storage = safeStorage();

const backend = __TEST__ ? new MemoryBackend() : new FirebaseBackend(firebaseConfig);
const store = new Store(backend);
const auth = new AuthManager(backend, storage);

const theme = {
  get: () => storage.getItem('gc_theme') ?? 'system',
  set(v) {
    storage.setItem('gc_theme', v);
    applyTheme();
  },
};
function applyTheme() {
  const v = theme.get();
  if (v === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
}
applyTheme();

const app = { backend, store, auth, theme, router: null };

// ---------------------------------------------------------------- Pantalla actual

const host = document.getElementById('app');
let current = null;

function show(screen) {
  current?.dispose?.();
  current = screen;
  host.replaceChildren(screen.el);
  window.scrollTo(0, 0);
}

function routeScreen({ path, query }) {
  const admin = auth.role === 'ADMIN';
  let m;
  if (path === '/') return HomeScreen(app);
  if ((m = path.match(/^\/m\/(.+)$/))) return ResultScreen(app, decodeURIComponent(m[1]));
  if (path === '/models') return ModelsScreen(app, { admin: false });
  // Pantallas de administración: no existen para el trabajador.
  if (!admin) return null;
  if (path === '/admin') return AdminScreen(app);
  if (path === '/admin/models') return ModelsScreen(app, { admin: true });
  if (path === '/settings') return SettingsScreen(app);
  if (path === '/group/new') return GroupEditScreen(app, { id: null, type: query.type === 'GLASS' ? 'GLASS' : 'CASE', variant: query.variant ?? 'NORMAL' });
  if ((m = path.match(/^\/group\/(.+)$/))) return GroupEditScreen(app, { id: decodeURIComponent(m[1]) });
  return null;
}

app.router = new Router((route) => {
  if (auth.state.kind !== 'logged-in') return;
  const screen = routeScreen(route);
  if (screen) show(screen);
  else queueMicrotask(() => app.router.replace('/'));
});

function renderAuth() {
  document.getElementById('overlay').replaceChildren();
  const s = auth.state;
  switch (s.kind) {
    case 'loading':
      return show(LoadingScreen());
    case 'needs-setup':
      return show(SetupScreen(app));
    case 'needs-internet':
      return show(NeedsInternetScreen(app, s.message));
    case 'logged-out':
      return show(LoginScreen(app, s.message));
    case 'logged-in':
      return app.router.render();
  }
}

// ---------------------------------------------------------------- Datos en la nube

let stopSync = null;
function startSync() {
  if (stopSync) return;
  stopSync = backend.listen({
    onModels: (docs) => store.setModels(docs),
    onGroups: (docs) => store.setGroups(docs),
    onError: (e) => {
      // Si la nube rechaza la lectura, puede ser que cambió la contraseña de trabajador.
      if (e.kind === 'permission-denied') auth.checkWorkerPasswordChanged();
    },
  });
}
function endSync() {
  stopSync?.();
  stopSync = null;
  store.reset();
}

store.onWriteError = (e) =>
  toast(e.kind === 'permission-denied' ? 'No tienes permiso para guardar cambios.' : `No se pudo guardar en la nube: ${e.message}`, 7000);

let lastKind = null;
auth.subscribe((state) => {
  const key = `${state.kind}:${state.role ?? ''}`;
  if (state.kind === 'logged-in') startSync();
  else endSync();
  if (key === lastKind && state.kind === 'logged-in') return;
  lastKind = key;
  renderAuth();
});

// La pantalla se actualiza sola cuando llegan datos nuevos.
let scheduled = false;
store.subscribe(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (auth.state.kind === 'logged-in') current?.update?.();
  });
});

// ---------------------------------------------------------------- Sin internet / segundo plano

const offlineBar = document.getElementById('offline');
const syncOnline = () => (offlineBar.hidden = navigator.onLine);
window.addEventListener('online', () => {
  syncOnline();
  auth.onForeground();
});
window.addEventListener('offline', syncOnline);
syncOnline();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) auth.onForeground();
});

// ---------------------------------------------------------------- Inicio

show(LoadingScreen());
auth.initialize().catch((e) => {
  show(NeedsInternetScreen(app, `No se pudo iniciar: ${e.message}`));
});

if (__TEST__) window.__app = { backend, store, auth, router: app.router, derive, newSalt };

// Instalable y con copia sin internet.
if (!__TEST__ && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
