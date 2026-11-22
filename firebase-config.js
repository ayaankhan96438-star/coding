/**
 * Codeora Firebase web configuration.
 * These browser config values identify the Firebase web app; do not put a
 * service-account private key or Admin SDK credentials in frontend files.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDBdtw_ZQuLqI9Mv24lYA9YuuppKMCHBsw',
  authDomain: 'codeora-8d289.firebaseapp.com',
  projectId: 'codeora-8d289',
  storageBucket: 'codeora-8d289.firebasestorage.app',
  messagingSenderId: '235162291084',
  appId: '1:235162291084:web:1aec3cbd694f39a9e224a9',
  measurementId: 'G-0YJ7LJC5B1'
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);
