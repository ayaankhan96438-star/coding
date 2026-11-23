// Starts Firebase account hydration early on every CodeBolt page.
window.QueryPathAccountReady = import('./account-core.js')
  .then(async (account) => {
    window.QueryPathAccount = account;
    const state = await account.initializeAccount();
    window.QueryPathAccountState = state;
    const topNav = document.querySelector('.top-nav');
    if (topNav && !document.querySelector('[data-account-link]')) {
      const navLink = document.createElement('a');
      navLink.href = 'login.html'; navLink.textContent = 'Sign up'; navLink.setAttribute('data-account-link', '');
      topNav.append(navLink);
    }
    document.querySelectorAll('[data-account-link]').forEach((link) => {
      link.href = state.user ? 'profile.html' : 'login.html';
      link.textContent = state.user ? 'My account' : 'Sign up';
      link.classList.toggle('is-signed-in', Boolean(state.user));
      link.title = state.user ? `Signed in as ${state.user.displayName || state.user.email || state.user.phoneNumber || 'CodeBolt learner'}` : 'Sign up or sign in to save progress across devices';
    });
    const accountDescription = document.getElementById('account-profile-description');
    const accountStatus = document.getElementById('account-profile-status');
    if (accountDescription && state.user) accountDescription.textContent = `Signed in as ${state.user.displayName || state.user.email || state.user.phoneNumber || 'CodeBolt learner'}. Your learning progress syncs to this account.`;
    if (accountStatus && state.user) accountStatus.textContent = state.error
      ? `Signed in, but cloud progress is not reachable yet: ${state.error.message || 'Check Firestore setup and rules.'}`
      : `Connected account: ${state.user.email || state.user.phoneNumber || state.user.displayName || 'CodeBolt learner'}. Your course progress is synced to your account.`;
    const authLabel = document.querySelector('[data-auth-user-label]');
    if (authLabel && state.user) authLabel.textContent = state.user.displayName || state.user.email || state.user.phoneNumber || 'Signed in';
    const signOutButton = document.querySelector('[data-account-signout]');
    if (signOutButton) {
      signOutButton.hidden = !state.user;
      signOutButton.addEventListener('click', async () => {
        signOutButton.disabled = true;
        try { await account.signOutAccount(); location.href = 'login.html?signedout=1'; }
        catch (error) { signOutButton.disabled = false; alert(error.message || 'Could not sign out.'); }
      });
    }
    return state;
  })
  .catch((error) => {
    console.error('CodeBolt account setup could not start:', error);
    window.QueryPathAccountState = { configured: false, user: null, error };
    return window.QueryPathAccountState;
  });
