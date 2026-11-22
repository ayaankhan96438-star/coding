const $ = (selector) => document.querySelector(selector);
const status = $('#login-status');
const setStatus = (message, type = '') => {
  if (!status) return;
  status.textContent = message;
  status.className = `login-status${type ? ` ${type}` : ''}`;
};
const explainError = (error) => {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-email': 'Enter a valid email address.',
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
    'auth/invalid-verification-code': 'That verification code is incorrect.'
  };
  return messages[code] || error?.message || 'Sign-in could not be completed. Check your Firebase provider settings and try again.';
};

const ready = await (window.QueryPathAccountReady || Promise.resolve(null));
const account = window.QueryPathAccount;
const accountState = ready || window.QueryPathAccountState || {};
const googleButton = $('#google-login');
const facebookButton = $('#facebook-login');
const githubButton = $('#github-login');
const emailForm = $('#email-login-form');
const phoneForm = $('#phone-login-form');
const verifyForm = $('#phone-verify-form');
const createToggle = $('#create-account-toggle');
let createMode = false;

if (accountState.user) {
  $('#signed-in-panel').hidden = false;
  $('#signed-in-name').textContent = accountState.user.displayName || accountState.user.email || accountState.user.phoneNumber || 'Codeora learner';
  emailForm.hidden = true;
  $('.login-methods').hidden = true;
  phoneForm.hidden = true;
  verifyForm.hidden = true;
  setStatus(`Signed in as ${accountState.user.email || accountState.user.phoneNumber || accountState.user.displayName || 'Codeora learner'}.`, 'success');
}

if (!accountState.configured) {
  setStatus('Login screen is ready, but Firebase is not connected yet. Add your project details in firebase-config.js and follow FIREBASE_SETUP.md to activate sign-in.', 'notice');
  [googleButton, facebookButton, githubButton, ...emailForm.querySelectorAll('button, input'), ...phoneForm.querySelectorAll('button, input')].forEach((control) => { control.disabled = true; });
} else if (accountState.error) {
  setStatus(`Firebase could not start: ${explainError(accountState.error)}`, 'error');
} else if (!accountState.user) {
  setStatus('Sign in or create an account to keep your progress with you on every device.');
}

function runBusy(button, action) {
  return async (event) => {
    event?.preventDefault?.();
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Please wait…';
    try {
      await action();
      setStatus('Signed in successfully. Opening your learning space…', 'success');
      window.location.href = 'practice.html';
    } catch (error) {
      setStatus(explainError(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  };
}

if (accountState.configured && account && !accountState.error) {
  googleButton.addEventListener('click', runBusy(googleButton, () => account.signInWithProvider('google')));
  facebookButton.addEventListener('click', runBusy(facebookButton, () => account.signInWithProvider('facebook')));
  githubButton.addEventListener('click', runBusy(githubButton, () => account.signInWithProvider('github')));

  createToggle.addEventListener('click', () => {
    createMode = !createMode;
    createToggle.textContent = createMode ? 'Already have an account? Sign in' : 'New here? Create account';
    $('#email-submit').textContent = createMode ? 'Create account' : 'Sign in with email';
    $('#login-heading').textContent = createMode ? 'Create your account' : 'Welcome back';
    $('#login-subtitle').textContent = createMode ? 'Create an account to save your learning journey.' : 'Pick up your learning exactly where you left off.';
  });

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#email-submit');
    button.disabled = true;
    const original = button.textContent;
    button.textContent = createMode ? 'Creating…' : 'Signing in…';
    try {
      await account.signInWithEmail($('#email-address').value.trim(), $('#email-password').value, createMode);
      setStatus('Account ready. Opening your learning space…', 'success');
      window.location.href = 'practice.html';
    } catch (error) { setStatus(explainError(error), 'error'); }
    finally { button.disabled = false; button.textContent = original; }
  });

  $('#forgot-password').addEventListener('click', async () => {
    const email = $('#email-address').value.trim();
    if (!email) { setStatus('Enter your email address first, then choose Forgot password.', 'notice'); $('#email-address').focus(); return; }
    try { await account.sendPasswordReset(email); setStatus('Password reset email sent. Check your inbox.', 'success'); }
    catch (error) { setStatus(explainError(error), 'error'); }
  });

  phoneForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#phone-send-code'); button.disabled = true;
    try {
      await account.sendPhoneOtp($('#phone-number').value.trim(), $('#recaptcha-container'));
      verifyForm.hidden = false;
      setStatus('Verification code sent. Enter the 6-digit code from your SMS.', 'success');
    } catch (error) { setStatus(explainError(error), 'error'); }
    finally { button.disabled = false; }
  });
  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('#phone-verify-code'); button.disabled = true;
    try {
      await account.verifyPhoneOtp($('#phone-code').value.trim());
      setStatus('Phone verified. Opening your learning space…', 'success');
      window.location.href = 'practice.html';
    } catch (error) { setStatus(explainError(error), 'error'); }
    finally { button.disabled = false; }
  });
}

$('#signed-out-continue')?.addEventListener('click', () => { window.location.href = 'practice.html'; });
$('#login-signout')?.addEventListener('click', async () => {
  const button = $('#login-signout'); button.disabled = true; button.textContent = 'Signing out…';
  try { await account.signOutAccount(); window.location.href = 'login.html?signedout=1'; }
  catch (error) { setStatus(explainError(error), 'error'); button.disabled = false; button.textContent = 'Sign out'; }
});
