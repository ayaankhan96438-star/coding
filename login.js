const $ = (selector) => document.querySelector(selector);
const status = $('#login-status');
const setStatus = (message, type = '') => {
  if (!status) return;
  status.textContent = message;
  status.className = `login-status${type ? ` ${type}` : ''}`;
};

const explainError = (error) => {
  const code = error?.code || '';
  const message = error?.message || '';
  if (/Firebase is not configured/i.test(message)) {
    return 'Account sign-in is not connected yet. The site owner must add the Firebase web config in firebase-config.js and enable the sign-in providers in Firebase Console.';
  }
  const messages = {
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/api-key-not-valid': 'Firebase rejected the Web API key. Check that firebase-config.js matches the Codeora Web App.',
    'auth/invalid-api-key': 'Firebase rejected the Web API key. Check the API key in firebase-config.js.',
    'auth/configuration-not-found': 'Firebase Authentication is not enabled for this project. Open Firebase Console → Authentication → Get started.',
    'auth/network-request-failed': 'Network request failed. Check your internet connection and try again.',
    'auth/internal-error': 'Firebase returned an internal error. Check the enabled sign-in provider and authorized domain.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account was found with this email.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
    'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using another sign-in method. Sign in with that method first.',
    'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication settings.',
    'auth/invalid-phone-number': 'Enter the phone number in international format, such as +919876543210.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/code-expired': 'That verification code has expired. Request a new code.',
    'auth/invalid-verification-code': 'That verification code is incorrect.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication settings.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this website and try again.'
  };
  return messages[code] || message || 'Sign-in could not be completed. Check your Firebase provider settings and try again.';
};

const accountState = await (window.QueryPathAccountReady || Promise.resolve(window.QueryPathAccountState || {}));
const account = window.QueryPathAccount;
const googleButton = $('#google-login');
const facebookButton = $('#facebook-login');
const githubButton = $('#github-login');
const emailForm = $('#email-login-form');
const phoneForm = $('#phone-login-form');
const verifyForm = $('#phone-verify-form');
const createToggle = $('#create-account-toggle');
let createMode = false;

const canCallAccount = (method) => Boolean(account && typeof account[method] === 'function');
const unavailableMessage = 'The sign-in controls are ready, but Firebase is not connected. The site owner must configure firebase-config.js and enable the requested provider before real accounts can be created.';

if (accountState?.user) {
  $('#signed-in-panel').hidden = false;
  $('#signed-in-name').textContent = accountState.user.displayName || accountState.user.email || accountState.user.phoneNumber || 'Codeora learner';
  emailForm.hidden = true;
  $('.login-methods').hidden = true;
  phoneForm.hidden = true;
  verifyForm.hidden = true;
  setStatus(`Signed in as ${accountState.user.email || accountState.user.phoneNumber || accountState.user.displayName || 'Codeora learner'}.`, 'success');
} else if (!accountState?.configured) {
  // Keep the controls usable so learners can see and interact with every sign-in path.
  // Real authentication is never simulated: account-core reports the missing Firebase setup.
  setStatus(unavailableMessage, 'notice');
} else if (accountState?.error) {
  setStatus(`Firebase could not start: ${explainError(accountState.error)}`, 'error');
} else {
  setStatus('Choose a sign-in method, or create an account to save your learning progress.');
}

async function runAction(button, action, successMessage = 'Signed in successfully. Opening your learning space…') {
  const labelNode = button.querySelector('.provider-label');
  const label = labelNode ? labelNode.textContent : button.textContent;
  button.disabled = true;
  if (labelNode) labelNode.textContent = 'Please wait…';
  else button.textContent = 'Please wait…';
  try {
    if (!canCallAccount(action.method)) throw new Error(unavailableMessage);
    await action.run();
    setStatus(successMessage, 'success');
    window.location.href = 'practice.html';
  } catch (error) {
    setStatus(explainError(error), 'error');
  } finally {
    button.disabled = false;
    if (labelNode) labelNode.textContent = label;
    else button.textContent = label;
  }
}

// Provider controls always respond. Firebase configuration determines whether the
// requested real sign-in can proceed; there is no fake/local social-login success.
googleButton?.addEventListener('click', () => runAction(googleButton, {
  method: 'signInWithProvider', run: () => account.signInWithProvider('google')
}));
facebookButton?.addEventListener('click', () => runAction(facebookButton, {
  method: 'signInWithProvider', run: () => account.signInWithProvider('facebook')
}));
githubButton?.addEventListener('click', () => runAction(githubButton, {
  method: 'signInWithProvider', run: () => account.signInWithProvider('github')
}));

// Signup/sign-in mode toggle is a front-end interaction and must work even before
// the site owner connects Firebase.
createToggle?.addEventListener('click', () => {
  createMode = !createMode;
  createToggle.textContent = createMode ? 'Already have an account? Sign in' : 'New here? Create account';
  $('#email-submit').textContent = createMode ? 'Create account' : 'Sign in with email';
  $('#login-heading').textContent = createMode ? 'Create your account' : 'Welcome back';
  $('#login-subtitle').textContent = createMode
    ? 'Create an account to save your learning journey.'
    : 'Pick up your learning exactly where you left off.';
  $('#email-password').setAttribute('autocomplete', createMode ? 'new-password' : 'current-password');
  setStatus(createMode
    ? 'Enter your email and choose a password. Account creation will activate when Firebase is configured.'
    : 'Sign in with the email and password for your account.', createMode ? 'notice' : '');
});

emailForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#email-submit');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = createMode ? 'Creating…' : 'Signing in…';
  try {
    if (!canCallAccount('signInWithEmail')) throw new Error(unavailableMessage);
    await account.signInWithEmail($('#email-address').value.trim(), $('#email-password').value, createMode);
    setStatus('Account ready. Opening your learning space…', 'success');
    window.location.href = 'practice.html';
  } catch (error) {
    setStatus(explainError(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$('#forgot-password')?.addEventListener('click', async () => {
  const email = $('#email-address').value.trim();
  if (!email) {
    setStatus('Enter your email address first, then choose Forgot password.', 'notice');
    $('#email-address').focus();
    return;
  }
  try {
    if (!canCallAccount('sendPasswordReset')) throw new Error(unavailableMessage);
    await account.sendPasswordReset(email);
    setStatus('Password reset email sent. Check your inbox.', 'success');
  } catch (error) {
    setStatus(explainError(error), 'error');
  }
});

phoneForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#phone-send-code');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Sending code…';
  try {
    if (!canCallAccount('sendPhoneOtp')) throw new Error(unavailableMessage);
    await account.sendPhoneOtp($('#phone-number').value.trim(), $('#recaptcha-container'));
    verifyForm.hidden = false;
    setStatus('Verification code sent. Enter the 6-digit code from your SMS.', 'success');
  } catch (error) {
    setStatus(explainError(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

verifyForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#phone-verify-code');
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Verifying…';
  try {
    if (!canCallAccount('verifyPhoneOtp')) throw new Error(unavailableMessage);
    await account.verifyPhoneOtp($('#phone-code').value.trim());
    setStatus('Phone verified. Opening your learning space…', 'success');
    window.location.href = 'practice.html';
  } catch (error) {
    setStatus(explainError(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

$('#signed-out-continue')?.addEventListener('click', () => { window.location.href = 'practice.html'; });
$('#login-signout')?.addEventListener('click', async () => {
  const button = $('#login-signout');
  button.disabled = true;
  button.textContent = 'Signing out…';
  try {
    if (!canCallAccount('signOutAccount')) throw new Error('The account service is unavailable.');
    await account.signOutAccount();
    window.location.href = 'login.html?signedout=1';
  } catch (error) {
    setStatus(explainError(error), 'error');
    button.disabled = false;
    button.textContent = 'Sign out';
  }
});
