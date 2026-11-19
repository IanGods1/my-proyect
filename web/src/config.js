// Configuración pública de Firebase (identifica tu proyecto; no contiene contraseñas).
//
// IMPORTANTE: estos valores salen de google-services.json (app Android). Si al entrar aparece
// "La clave de Firebase no permite usar la web", registra la app web en Firebase
// (Configuración del proyecto > Tus apps > Agregar app > Web) y reemplaza este objeto por el
// `firebaseConfig` que te muestra. Ver README, sección "Versión web".
export const firebaseConfig = {
  apiKey: 'AIzaSyAz35ggEJj4L3SM1PCfIpKk3c0tThHHRZc',
  authDomain: 'guastaccesorio-1c7b0.firebaseapp.com',
  projectId: 'guastaccesorio-1c7b0',
  storageBucket: 'guastaccesorio-1c7b0.firebasestorage.app',
  messagingSenderId: '743621945744',
};

/** Correo interno de la cuenta de administrador. Debe coincidir con firestore.rules. */
export const ADMIN_EMAIL = 'admin@guastaccesorio.app';
