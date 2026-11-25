import { firebaseConfig, firebaseConfigured } from './firebase-config.js';
import { clearQuestionProgressForReload } from './progress-state.mjs?v=20261125-refresh-and-preview-fix-01';

const FIREBASE_VERSION = '13.4.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const STORAGE_KEYS = {
  progress: 'querypath-progress-v2',
  gamification: 'querypath-gamification-v1',
  selectedQuestion: 'querypath-selected-question-v1',
  sharedSqlDraft: 'codebolt-sql-shared-editor-v1',
  legacySqlDrafts: 'codebolt-sql-question-drafts-v1',
  bookmarks: 'querypath-bookmarks-v1',
  profile: 'querypath-profile-v1'
};
const CACHE_PREFIX = 'querypath-account-cache-v1:';
const GUEST_MIGRATED_KEY = 'querypath-guest-progress-migrated-v1';
let services = null;
let accountUser = null;
let initialized = false;
let initializationPromise = null;
let confirmationResult = null;
let recaptchaVerifier = null;
let cloudWriteQueue = Promise.resolve();

const emptySnapshot = () => ({ progress: {}, gamification: {}, selectedQuestionId: '', bookmarks: [], profile: {} });
const parseJson = (value, fallback) => {
  try { const parsed = JSON.parse(value || 'null'); return parsed ?? fallback; } catch { return fallback; }
};

function readLocalSnapshot() {
  return {
    progress: parseJson(localStorage.getItem(STORAGE_KEYS.progress), {}),
    gamification: parseJson(localStorage.getItem(STORAGE_KEYS.gamification), {}),
    selectedQuestionId: localStorage.getItem(STORAGE_KEYS.selectedQuestion) || '',
    bookmarks: parseJson(localStorage.getItem(STORAGE_KEYS.bookmarks), []),
    profile: parseJson(localStorage.getItem(STORAGE_KEYS.profile), {})
  };
}

function writeLocalSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : emptySnapshot();
  try {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(safe.progress && typeof safe.progress === 'object' ? safe.progress : {}));
    localStorage.setItem(STORAGE_KEYS.gamification, JSON.stringify(safe.gamification && typeof safe.gamification === 'object' ? safe.gamification : {}));
    if (safe.selectedQuestionId) localStorage.setItem(STORAGE_KEYS.selectedQuestion, String(safe.selectedQuestionId));
    else localStorage.removeItem(STORAGE_KEYS.selectedQuestion);
    localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(Array.isArray(safe.bookmarks) ? safe.bookmarks : []));
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(safe.profile && typeof safe.profile === 'object' ? safe.profile : {}));
  } catch (error) {
    console.warn('Codeora account data could not be written to this browser.', error);
  }
}

function cacheSnapshot(uid, snapshot = readLocalSnapshot()) {
  try { localStorage.setItem(`${CACHE_PREFIX}${uid}`, JSON.stringify(snapshot)); } catch (error) {
    console.warn('Codeora could not cache the signed-in learner record.', error);
  }
}

function initializeServices() {
  if (services) return Promise.resolve(services);
  if (!firebaseConfigured) return Promise.resolve(null);
  if (!initializationPromise) {
    initializationPromise = Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`)
    ]).then(([appModule, authModule, firestoreModule]) => {
      const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const db = firestoreModule.getFirestore(app);
      services = { appModule, authModule, firestoreModule, app, auth, db };
      return services;
    });
  }
  return initializationPromise;
}

async function waitForInitialAuthState(auth, onAuthStateChanged) {
  return new Promise((resolve, reject) => {
    let unsubscribe = null;
    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (unsubscribe) unsubscribe();
      resolve(user || null);
    }, reject);
  });
}

async function readCloudSnapshot(uid) {
  const { firestoreModule, db } = services;
  const reference = firestoreModule.doc(db, 'users', uid, 'querypath', 'progress');
  const result = await firestoreModule.getDoc(reference);
  return result.exists() ? result.data() : null;
}

async function writeCloudSnapshot(uid, snapshot) {
  const { firestoreModule, db } = services;
  const reference = firestoreModule.doc(db, 'users', uid, 'querypath', 'progress');
  await firestoreModule.setDoc(reference, {
    progress: snapshot.progress || {},
    gamification: snapshot.gamification || {},
    selectedQuestionId: snapshot.selectedQuestionId || '',
    bookmarks: Array.isArray(snapshot.bookmarks) ? snapshot.bookmarks : [],
    profile: snapshot.profile || {},
    updatedAt: firestoreModule.serverTimestamp()
  }, { merge: true });
}

async function hydrateUserData(user) {
  const uid = user.uid;
  const remote = await readCloudSnapshot(uid);
  let snapshot;
  if (remote) {
    snapshot = {
      ...emptySnapshot(),
      progress: remote.progress && typeof remote.progress === 'object' ? remote.progress : {},
      gamification: remote.gamification && typeof remote.gamification === 'object' ? remote.gamification : {},
      selectedQuestionId: typeof remote.selectedQuestionId === 'string' ? remote.selectedQuestionId : '',
      bookmarks: Array.isArray(remote.bookmarks) ? remote.bookmarks : [],
      profile: remote.profile && typeof remote.profile === 'object' ? remote.profile : {}
    };
  } else {
    const cached = parseJson(localStorage.getItem(`${CACHE_PREFIX}${uid}`), null);
    if (cached) snapshot = { ...emptySnapshot(), ...cached };
    else if (localStorage.getItem(GUEST_MIGRATED_KEY) !== '1') {
      // On the first-ever account sign-in, migrate this browser's existing guest progress once.
      snapshot = readLocalSnapshot();
      localStorage.setItem(GUEST_MIGRATED_KEY, '1');
    } else snapshot = emptySnapshot();
    await writeCloudSnapshot(uid, snapshot);
  }
  writeLocalSnapshot(snapshot);
  cacheSnapshot(uid, snapshot);
  accountUser = user;
  return snapshot;
}

export async function initializeAccount() {
  if (initialized) return { configured: firebaseConfigured, user: accountUser, error: null };
  if (!firebaseConfigured) {
    initialized = true;
    return { configured: false, user: null, error: null };
  }
  try {
    const ready = await initializeServices();
    const user = await waitForInitialAuthState(ready.auth, ready.authModule.onAuthStateChanged);
    accountUser = user;
    let dataError = null;
    if (user) {
      try { await hydrateUserData(user); }
      catch (error) { dataError = error; console.warn('Codeora signed in, but cloud progress could not be loaded. Check Firestore setup and rules.', error); }
    }
    initialized = true;
    return { configured: true, user, error: dataError };
  } catch (error) {
    initialized = true;
    console.error('Codeora Firebase authentication could not initialize:', error);
    return { configured: true, user: null, error };
  }
}

export function getAccountUser() { return accountUser; }
export function isFirebaseConfigured() { return firebaseConfigured; }

/**
 * On browser refresh, question completion is intentionally session-only.
 * Keep XP, streaks, bookmarks and profile data, but clear every solved/attempted
 * SQL question locally and in Firestore so cloud hydration cannot restore ticks.
 */
export async function clearQuestionProgressOnReload() {
  const snapshot = clearQuestionProgressForReload(readLocalSnapshot());
  writeLocalSnapshot(snapshot);
  // A browser refresh starts a clean SQL practice session. Keep account rewards,
  // bookmarks and profile, but do not restore the previous shared editor answer.
  try {
    localStorage.removeItem(STORAGE_KEYS.sharedSqlDraft);
    localStorage.removeItem(STORAGE_KEYS.legacySqlDrafts);
  } catch (error) {
    console.warn('The previous SQL editor draft could not be cleared.', error);
  }
  if (accountUser) {
    cacheSnapshot(accountUser.uid, snapshot);
    if (services) {
      // Queue the reset after any pending account save so an older snapshot
      // cannot overwrite the freshly-cleared question progress.
      const write = () => writeCloudSnapshot(accountUser.uid, snapshot);
      cloudWriteQueue = cloudWriteQueue.then(write, write);
      try {
        await cloudWriteQueue;
      } catch (error) {
        console.warn('Question progress was cleared locally, but cloud reset failed.', error);
      }
    }
  }
  return snapshot;
}

export async function saveAccountState() {
  if (!accountUser || !services) return false;
  const uid = accountUser.uid;
  const snapshot = readLocalSnapshot();
  cacheSnapshot(uid, snapshot);
  const write = () => writeCloudSnapshot(uid, snapshot);
  cloudWriteQueue = cloudWriteQueue.then(write, write);
  try {
    await cloudWriteQueue;
    return true;
  } catch (error) {
    console.warn('Codeora cloud progress sync failed. The local copy is still saved.', error);
    return false;
  }
}

export async function signInWithProvider(providerName) {
  const ready = await initializeServices();
  if (!ready) throw new Error('Firebase is not configured yet. Add your Firebase web config in firebase-config.js first.');
  let provider;
  if (providerName === 'google') provider = new ready.authModule.GoogleAuthProvider();
  else if (providerName === 'facebook') provider = new ready.authModule.FacebookAuthProvider();
  else if (providerName === 'github') provider = new ready.authModule.GithubAuthProvider();
  else throw new Error('This sign-in provider is not supported.');
  if (providerName === 'google') provider.setCustomParameters({ prompt: 'select_account' });
  const result = await ready.authModule.signInWithPopup(ready.auth, provider);
  accountUser = result.user;
  initialized = false;
  return result.user;
}

export async function signInWithEmail(email, password, createAccount = false) {
  const ready = await initializeServices();
  if (!ready) throw new Error('Firebase is not configured yet. Add your Firebase web config in firebase-config.js first.');
  const result = createAccount
    ? await ready.authModule.createUserWithEmailAndPassword(ready.auth, email, password)
    : await ready.authModule.signInWithEmailAndPassword(ready.auth, email, password);
  accountUser = result.user;
  initialized = false;
  return result.user;
}

export async function sendPasswordReset(email) {
  const ready = await initializeServices();
  if (!ready) throw new Error('Firebase is not configured yet.');
  return ready.authModule.sendPasswordResetEmail(ready.auth, email);
}

export async function sendPhoneOtp(phoneNumber, recaptchaElement) {
  const ready = await initializeServices();
  if (!ready) throw new Error('Firebase is not configured yet.');
  if (recaptchaVerifier) {
    try { await recaptchaVerifier.clear(); } catch {}
    recaptchaVerifier = null;
  }
  recaptchaVerifier = new ready.authModule.RecaptchaVerifier(ready.auth, recaptchaElement, { size: 'normal' });
  await recaptchaVerifier.render();
  confirmationResult = await ready.authModule.signInWithPhoneNumber(ready.auth, phoneNumber, recaptchaVerifier);
  return true;
}

export async function verifyPhoneOtp(code) {
  if (!confirmationResult) throw new Error('Send the verification code to your phone first.');
  const result = await confirmationResult.confirm(code);
  accountUser = result.user;
  initialized = false;
  confirmationResult = null;
  return result.user;
}

export async function signOutAccount() {
  const ready = await initializeServices();
  if (!ready) return;
  if (accountUser) cacheSnapshot(accountUser.uid, readLocalSnapshot());
  await ready.authModule.signOut(ready.auth);
  accountUser = null;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  initialized = false;
}
