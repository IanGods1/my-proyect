// Sesiones con contraseña (sin usuario ni correo), igual que la app Android.
//  - La sesión queda guardada en el navegador: no se vuelve a pedir la contraseña.
//  - Trabajador: no puede cerrar sesión; se cierra sola cuando el administrador cambia la
//    contraseña de trabajador (se revisa al abrir y en vivo si hay internet).
//  - Sin internet se sigue usando la última sesión válida.
import { derive, newSalt, DEFAULT_ITERATIONS } from './core/passwords.js';

export const MIN_PASSWORD_LENGTH = 6;
export const PASSWORD_CHANGED_MESSAGE = 'La contraseña cambió. Pide la nueva al administrador';
export const MAX_ATTEMPTS = 5;
export const LOCK_MS = 60000;

export function validateNewPassword(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  if (password !== confirmation) return 'Las contraseñas no coinciden';
  return null;
}

/** Mensaje en español para un error de la nube. */
export function cloudErrorMessage(e) {
  switch (e?.kind) {
    case 'no-connection':
      return 'Sin conexión a internet. Conéctate e inténtalo de nuevo.';
    case 'too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.';
    case 'weak-password':
      return 'La contraseña es muy débil. Usa al menos 6 caracteres.';
    case 'operation-not-allowed':
      return 'En Firebase, activa los métodos "Correo electrónico/contraseña" y "Anónimo" (ver README).';
    case 'permission-denied':
      return 'Firebase rechazó la operación. Revisa que publicaste las reglas de Firestore (ver README).';
    case 'api-key':
      return 'La clave de Firebase no permite usar la web. Registra la app web en Firebase y pega su configuración (ver README, "Versión web").';
    default:
      return `Error: ${e?.message ?? e}`;
  }
}

export class AuthManager {
  /** @param backend FirebaseBackend o MemoryBackend @param storage localStorage */
  constructor(backend, storage = localStorage, clock = () => Date.now()) {
    this.backend = backend;
    this.storage = storage;
    this.clock = clock;
    /** { kind: 'loading' | 'needs-setup' | 'needs-internet' | 'logged-out' | 'logged-in', ... } */
    this.state = { kind: 'loading' };
    this.listeners = new Set();
    this.configUnsub = null;
    this.busyForeground = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setState(state) {
    this.state = state;
    for (const fn of [...this.listeners]) fn(state);
  }

  // ---------------------------------------------------------------- Datos guardados

  get role() {
    const r = this.storage.getItem('gc_role');
    return r === 'ADMIN' || r === 'WORKER' ? r : null;
  }
  set role(v) {
    if (v) this.storage.setItem('gc_role', v);
    else this.storage.removeItem('gc_role');
  }
  get workerVersion() {
    return Number(this.storage.getItem('gc_worker_version') ?? -1);
  }
  set workerVersion(v) {
    this.storage.setItem('gc_worker_version', String(v));
  }
  get pendingMessage() {
    return this.storage.getItem('gc_login_message');
  }
  set pendingMessage(v) {
    if (v) this.storage.setItem('gc_login_message', v);
    else this.storage.removeItem('gc_login_message');
  }

  // ---------------------------------------------------------------- Bloqueo por intentos

  remainingLockSeconds() {
    const until = Number(this.storage.getItem('gc_locked_until') ?? 0);
    const remaining = until - this.clock();
    return remaining <= 0 ? 0 : Math.ceil(remaining / 1000);
  }

  /** Cuenta un intento fallido. Devuelve true si con este intento se bloqueó. */
  registerFailure() {
    const attempts = Number(this.storage.getItem('gc_failed_attempts') ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.storage.setItem('gc_failed_attempts', '0');
      this.storage.setItem('gc_locked_until', String(this.clock() + LOCK_MS));
      return true;
    }
    this.storage.setItem('gc_failed_attempts', String(attempts));
    return false;
  }

  registerSuccess() {
    this.storage.setItem('gc_failed_attempts', '0');
    this.storage.removeItem('gc_locked_until');
  }

  // ---------------------------------------------------------------- Inicio

  async initialize() {
    await this.backend.ready();
    const saved = this.role;
    if (saved === 'ADMIN' && !this.backend.isAdminSignedIn()) this.role = null;
    if (saved === 'WORKER' && !this.backend.isWorkerSignedIn()) this.role = null;
    if (this.role) {
      this.setState({ kind: 'logged-in', role: this.role });
      this.onForeground();
      return;
    }
    try {
      const config = await this.backend.getConfig();
      this.setState(config ? { kind: 'logged-out', message: this.pendingMessage } : { kind: 'needs-setup' });
    } catch (e) {
      this.setState({
        kind: 'needs-internet',
        message:
          e.kind === 'no-connection'
            ? 'Conéctate a internet para abrir Guastaccesorio por primera vez.'
            : cloudErrorMessage(e),
      });
    }
  }

  retry() {
    this.setState({ kind: 'loading' });
    return this.initialize();
  }

  /** Se llama cada vez que se abre la página o vuelve a primer plano. */
  async onForeground() {
    if (this.role !== 'WORKER' || this.busyForeground) return;
    this.busyForeground = true;
    try {
      if (!this.configUnsub) {
        // Aviso instantáneo si cambia la contraseña mientras la página está abierta.
        this.configUnsub = this.backend.listenConfig((config) => {
          if (this.role === 'WORKER' && config.workerVersion !== this.workerVersion) this.logoutWorkerPasswordChanged();
        });
      }
      await this.checkWorkerPasswordChanged();
    } finally {
      this.busyForeground = false;
    }
  }

  /** Revisa en Firebase si la contraseña de trabajador cambió. Sin internet no hace nada. */
  async checkWorkerPasswordChanged() {
    if (this.role !== 'WORKER') return;
    let config;
    try {
      config = await this.backend.getConfig();
    } catch {
      return;
    }
    if (config && config.workerVersion !== this.workerVersion) this.logoutWorkerPasswordChanged();
  }

  logoutWorkerPasswordChanged() {
    if (this.role !== 'WORKER') return;
    this.configUnsub?.();
    this.configUnsub = null;
    this.role = null;
    this.pendingMessage = PASSWORD_CHANGED_MESSAGE;
    this.backend.signOut();
    this.setState({ kind: 'logged-out', message: PASSWORD_CHANGED_MESSAGE });
  }

  // ---------------------------------------------------------------- Primer uso

  /** Devuelve null si salió bien, o el mensaje de error. */
  async setup(adminPassword, workerPassword) {
    try {
      if (await this.backend.getConfig()) {
        this.setState({ kind: 'logged-out', message: 'Las contraseñas ya fueron creadas. Ingresa con tu contraseña.' });
        return null;
      }
      await this.backend.createOrSignInAdmin(adminPassword);
      const salt = newSalt();
      const token = await derive(workerPassword, salt, DEFAULT_ITERATIONS);
      await this.backend.writeInitialConfig(token, salt, DEFAULT_ITERATIONS);
      this.completeLogin('ADMIN');
      return null;
    } catch (e) {
      if (e.kind === 'wrong-password') {
        this.setState({ kind: 'logged-out', message: 'Ya existe un administrador. Ingresa con tu contraseña.' });
        return null;
      }
      return cloudErrorMessage(e);
    }
  }

  // ---------------------------------------------------------------- Ingreso

  /** Devuelve null si entró, o el mensaje de error. */
  async login(password) {
    const locked = this.remainingLockSeconds();
    if (locked > 0) return `Demasiados intentos. Espera ${locked} segundos.`;
    if (!password) return 'Escribe la contraseña';
    try {
      const config = await this.backend.getConfig();
      if (!config) {
        this.setState({ kind: 'needs-setup' });
        return null;
      }
      // 1) Como trabajador: la clave derivada debe coincidir con la guardada en la nube.
      const token = await derive(password, config.workerSalt, config.iterations);
      let isWorker = true;
      try {
        await this.backend.startWorkerSession(token);
      } catch (e) {
        if (e.kind === 'permission-denied') isWorker = false;
        else throw e;
      }
      if (isWorker) {
        this.workerVersion = config.workerVersion;
        this.completeLogin('WORKER');
        return null;
      }
      // 2) Como administrador.
      try {
        await this.backend.signInAdmin(password);
      } catch (e) {
        if (e.kind === 'wrong-password') return this.wrongPassword();
        throw e;
      }
      this.completeLogin('ADMIN');
      return null;
    } catch (e) {
      return e.kind === 'no-connection' ? 'Sin conexión a internet. Conéctate para entrar.' : cloudErrorMessage(e);
    }
  }

  wrongPassword() {
    return this.registerFailure() ? 'Contraseña incorrecta. Demasiados intentos: espera 1 minuto.' : 'Contraseña incorrecta';
  }

  completeLogin(role) {
    this.registerSuccess();
    this.role = role;
    this.pendingMessage = null;
    this.setState({ kind: 'logged-in', role });
    this.onForeground();
  }

  // ---------------------------------------------------------------- Configuración (administrador)

  /** Solo el administrador puede cerrar sesión. */
  logoutAdmin() {
    if (this.role !== 'ADMIN') return;
    this.backend.signOut();
    this.role = null;
    this.setState({ kind: 'logged-out', message: null });
  }

  /** @returns {Promise<{ok: boolean, message: string}>} */
  async changeWorkerPassword(newPassword) {
    if (this.role !== 'ADMIN') return { ok: false, message: 'Solo el administrador puede cambiar contraseñas' };
    if (!this.backend.isAdminSignedIn()) return { ok: false, message: 'No estás conectado como administrador. Cierra sesión y vuelve a entrar.' };
    try {
      if ((await this.backend.isAdminPassword(newPassword)) === true) {
        return { ok: false, message: 'Debe ser distinta de la contraseña de administrador' };
      }
      const salt = newSalt();
      const token = await derive(newPassword, salt, DEFAULT_ITERATIONS);
      const confirmed = await this.backend.changeWorkerPassword(token, salt, DEFAULT_ITERATIONS);
      return {
        ok: true,
        message: confirmed
          ? 'Contraseña cambiada. Se cerró la sesión en todos los teléfonos de trabajadores.'
          : 'Sin internet: el cambio se aplicará en cuanto se conecte.',
      };
    } catch (e) {
      return { ok: false, message: cloudErrorMessage(e) };
    }
  }

  async changeAdminPassword(current, newPassword) {
    if (this.role !== 'ADMIN') return { ok: false, message: 'Solo el administrador puede cambiar contraseñas' };
    try {
      // La nueva contraseña no puede ser la de trabajador (entraría como trabajador).
      const config = await this.backend.getConfig();
      const workerToken = await this.backend.getWorkerToken();
      if (config && workerToken && (await derive(newPassword, config.workerSalt, config.iterations)) === workerToken) {
        return { ok: false, message: 'Debe ser distinta de la contraseña de trabajador' };
      }
      await this.backend.changeAdminPassword(current, newPassword);
      return { ok: true, message: 'Contraseña de administrador cambiada' };
    } catch (e) {
      if (e.kind === 'no-connection') return { ok: false, message: 'Necesitas internet para cambiar la contraseña de administrador' };
      if (e.kind === 'wrong-password') return { ok: false, message: 'La contraseña actual no es correcta' };
      return { ok: false, message: cloudErrorMessage(e) };
    }
  }
}
