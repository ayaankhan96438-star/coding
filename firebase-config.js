/**
 * Codeora Firebase web configuration.
 * Replace the placeholder values with the config from Firebase Console > Project settings > Your apps.
 * Firebase web config is public; never put a service-account private key in this file.
 */
export const firebaseConfig = {
  apiKey: 'PASTE_FIREBASE_API_KEY_HERE',
  authDomain: 'YOUR_FIREBASE_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_FIREBASE_PROJECT_ID',
  appId: 'PASTE_FIREBASE_APP_ID_HERE'
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PASTE_') &&
  firebaseConfig.authDomain && !firebaseConfig.authDomain.includes('YOUR_') &&
  firebaseConfig.projectId && !firebaseConfig.projectId.includes('YOUR_') &&
  firebaseConfig.appId && !firebaseConfig.appId.includes('PASTE_')
);
