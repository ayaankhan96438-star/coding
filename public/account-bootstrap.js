// Starts Firebase account hydration early on every CodeBolt page.
window.QueryPathAccountReady = import('./account-core.js?v=next-session-progress-reset-01')
  .then(async (account) => {
    window.QueryPathAccount = account;
    const state = await account.initializeAccount();
    const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0];
    const isBrowserRefresh = navigationEntry?.type === 'reload';
    if (isBrowserRefresh && typeof account.clearQuestionProgressOnReload === 'function') {
      await account.clearQuestionProgressOnReload();
    }
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
      link.title = state.user ? `Signed in as ${state.user.displayName || state.user.email || state.user.phoneNumber || 'CodeBolt learner'}` : 'Sign up or sign in to sync XP, streaks, bookmarks and profile data across devices';
    });
    const accountDescription = document.getElementById('account-profile-description');
    const accountStatus = document.getElementById('account-profile-status');
    if (accountDescription && state.user) accountDescription.textContent = `Signed in as ${state.user.displayName || state.user.email || state.user.phoneNumber || 'CodeBolt learner'}. Your XP, streaks, bookmarks and profile data sync to this account. Question completion resets after a browser refresh.`;
    if (accountStatus && state.user) accountStatus.textContent = state.error
      ? `Signed in, but cloud progress is not reachable yet: ${state.error.message || 'Check Firestore setup and rules.'}`
      : `Connected account: ${state.user.email || state.user.phoneNumber || state.user.displayName || 'CodeBolt learner'}. XP, streaks, bookmarks and profile data are synced. Question completion resets after refresh.`;
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
