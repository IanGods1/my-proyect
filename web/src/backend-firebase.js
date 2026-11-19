// Acceso a Firebase (Authentication + Firestore). Misma estructura que la app Android:
//  - El administrador entra con un correo interno fijo y su contraseña (el usuario nunca lo ve).
//  - El trabajador entra como "anónimo" y registra una sesión con la clave derivada de la
//    contraseña de trabajador; las reglas de Firestore solo le dejan leer si coincide.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  doc,
  collection,
  getDocFromServer,
  onSnapshot,
  writeBatch,
  increment,
} from 'firebase/firestore';
import { ADMIN_EMAIL } from './config.js';

const TIMEOUT_MS = 20000;

/** Convierte errores de Firebase en errores con `kind` (más fáciles de tratar). */
export function mapError(e) {
  if (e?.kind) return e;
  const code = String(e?.code ?? '');
  const text = `${code} ${e?.message ?? ''}`.toLowerCase();
  let kind = 'unknown';
  if (['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(code)) kind = 'no-connection';
  else if (code === 'permission-denied') kind = 'permission-denied';
  else if (
    ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)
  )
    kind = 'wrong-password';
  else if (code === 'auth/too-many-requests') kind = 'too-many-requests';
  else if (code === 'auth/weak-password') kind = 'weak-password';
  else if (code === 'auth/operation-not-allowed') kind = 'operation-not-allowed';
  else if (code === 'auth/email-already-in-use') kind = 'email-in-use';
  else if (/api-key|blocked|referer|invalid-app-credential/.test(text)) kind = 'api-key';
  const err = new Error(e?.message ?? String(e));
  err.kind = kind;
  return err;
}

function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Sin conexión'), { kind: 'no-connection' })), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const wrap = async (fn) => {
  try {
    return await fn();
  } catch (e) {
    throw mapError(e);
  }
};

export class FirebaseBackend {
  constructor(config) {
    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    try {
      // Copia guardada en el teléfono/navegador: la búsqueda funciona sin internet.
      this.db = initializeFirestore(this.app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      this.db = initializeFirestore(this.app, { localCache: memoryLocalCache() });
    }
  }

  /** Espera a que Firebase recupere la sesión guardada en el navegador. */
  async ready() {
    await this.auth.authStateReady();
  }

  isAdminSignedIn() {
    const u = this.auth.currentUser;
    return !!u && !u.isAnonymous && (u.email ?? '').toLowerCase() === ADMIN_EMAIL;
  }

  isWorkerSignedIn() {
    const u = this.auth.currentUser;
    return !!u && u.isAnonymous;
  }

  // ---------------------------------------------------------------- Configuración

  /** Lee public/config desde el servidor. null si todavía no se crearon las contraseñas. */
  getConfig() {
    return wrap(async () => {
      const snap = await withTimeout(getDocFromServer(doc(this.db, 'public', 'config')));
      if (!snap.exists()) return null;
      const d = snap.data();
      if (typeof d.workerSalt !== 'string') return null;
      return { workerVersion: Number(d.workerVersion ?? 1), workerSalt: d.workerSalt, iterations: Number(d.iterations ?? 60000) };
    });
  }

  /** Avisa al instante si cambia la configuración (por ejemplo, la contraseña de trabajador). */
  listenConfig(callback) {
    return onSnapshot(
      doc(this.db, 'public', 'config'),
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        if (d && typeof d.workerSalt === 'string') {
          callback({ workerVersion: Number(d.workerVersion ?? 1), workerSalt: d.workerSalt, iterations: Number(d.iterations ?? 60000) });
        }
      },
      () => {},
    );
  }

  // ---------------------------------------------------------------- Administrador

  createOrSignInAdmin(password) {
    return wrap(async () => {
      try {
        await createUserWithEmailAndPassword(this.auth, ADMIN_EMAIL, password);
      } catch (e) {
        if (e?.code === 'auth/email-already-in-use') await signInWithEmailAndPassword(this.auth, ADMIN_EMAIL, password);
        else throw e;
      }
    });
  }

  signInAdmin(password) {
    return wrap(() => signInWithEmailAndPassword(this.auth, ADMIN_EMAIL, password));
  }

  /** true si `password` es la contraseña de administrador; null si no se pudo comprobar. */
  async isAdminPassword(password) {
    try {
      await signInWithEmailAndPassword(this.auth, ADMIN_EMAIL, password);
      return true;
    } catch (e) {
      const kind = mapError(e).kind;
      return kind === 'wrong-password' ? false : null;
    }
  }

  changeAdminPassword(current, next) {
    return wrap(async () => {
      const user = this.auth.currentUser;
      if (!user || !this.isAdminSignedIn()) throw Object.assign(new Error('No hay sesión de administrador'), { kind: 'not-signed-in' });
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(ADMIN_EMAIL, current));
      await updatePassword(user, next);
    });
  }

  /** Primer uso: guarda la clave de trabajador (privada) y la configuración pública. */
  writeInitialConfig(workerToken, workerSalt, iterations) {
    return wrap(async () => {
      const batch = writeBatch(this.db);
      batch.set(doc(this.db, 'private', 'worker'), { token: workerToken });
      batch.set(doc(this.db, 'public', 'config'), { setupDone: true, workerVersion: 1, workerSalt, iterations });
      await withTimeout(batch.commit());
    });
  }

  /**
   * Cambia la contraseña de trabajador y sube el número de versión: todos los teléfonos de
   * trabajadores pierden el acceso. true si el servidor confirmó; false si quedó pendiente (sin internet).
   */
  async changeWorkerPassword(workerToken, workerSalt, iterations) {
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'private', 'worker'), { token: workerToken });
    batch.set(
      doc(this.db, 'public', 'config'),
      { setupDone: true, workerVersion: increment(1), workerSalt, iterations },
      { merge: true },
    );
    try {
      await withTimeout(batch.commit());
      return true;
    } catch (e) {
      const err = mapError(e);
      if (err.kind === 'no-connection') return false;
      throw err;
    }
  }

  /** Clave de la contraseña de trabajador vigente (solo la puede leer el administrador). */
  getWorkerToken() {
    return wrap(async () => {
      const snap = await withTimeout(getDocFromServer(doc(this.db, 'private', 'worker')));
      return snap.exists() ? (snap.data().token ?? null) : null;
    });
  }

  // ---------------------------------------------------------------- Trabajador

  /** Registra la sesión del trabajador. Falla con 'permission-denied' si la contraseña no es la actual. */
  startWorkerSession(workerToken) {
    return wrap(async () => {
      let user = this.auth.currentUser;
      if (!user || !user.isAnonymous) {
        if (user) await signOut(this.auth);
        user = (await signInAnonymously(this.auth)).user;
      }
      const batch = writeBatch(this.db);
      batch.set(doc(this.db, 'sessions', user.uid), { token: workerToken });
      await withTimeout(batch.commit());
    });
  }

  signOut() {
    return signOut(this.auth);
  }

  // ---------------------------------------------------------------- Datos

  /** Escucha modelos y grupos. Los callbacks reciben {id: documento}. Devuelve una función para parar. */
  listen({ onModels, onGroups, onError }) {
    const toMap = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    const u1 = onSnapshot(collection(this.db, 'models'), (s) => onModels(toMap(s)), (e) => onError(mapError(e)));
    const u2 = onSnapshot(collection(this.db, 'groups'), (s) => onGroups(toMap(s)), (e) => onError(mapError(e)));
    return () => {
      u1();
      u2();
    };
  }

  /**
   * Envía los cambios en lotes. Sin internet quedan en cola en el navegador y se suben al
   * reconectar. La promesa se resuelve cuando el servidor confirma.
   */
  async commit(writes) {
    const chunks = [];
    for (let i = 0; i < writes.length; i += 400) chunks.push(writes.slice(i, i + 400));
    await Promise.all(
      chunks.map((chunk) => {
        const batch = writeBatch(this.db);
        for (const w of chunk) {
          const ref = doc(this.db, w.col, w.id);
          if (w.doc === null) batch.delete(ref);
          else batch.set(ref, w.doc);
        }
        return batch.commit().catch((e) => {
          throw mapError(e);
        });
      }),
    );
  }
}
