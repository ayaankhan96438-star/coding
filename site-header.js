/* CodeBolt minimal shared header. Plain script; account-bootstrap.js runs after this file. */
(() => {
  'use strict';

  const mount = document.getElementById('site-header');
  if (!mount || mount.dataset.ready === 'true') return;

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const track = document.body.dataset.track === 'languages' ? 'languages' : 'sql';
  const isPython = file === 'python.html' || file === 'python-bookmarks.html';
  const showSqlTopicButton = Boolean(document.getElementById('interactive-topics'));

  mount.innerHTML = `
    <header class="site-unified-header course-header">
      <div class="site-header-brand">
        <a class="site-header-logo" href="index.html" aria-label="CodeBolt home">
          <img src="codeora-logo.svg" alt="" width="36" height="36">
          <span class="site-brand-copy">
            <strong>codebolt</strong>
            <small>Learn. Code. Build.</small>
          </span>
        </a>
        <nav class="site-track-links" aria-label="Learning tracks">
          <a class="track-link${track === 'sql' ? ' is-active' : ''}" href="index.html"${track === 'sql' ? ' aria-current="page"' : ''}>SQL</a>
          <a class="track-link${track === 'languages' ? ' is-active' : ''}" href="python.html"${track === 'languages' ? ' aria-current="page"' : ''}>Languages</a>
        </nav>
      </div>
      <div class="site-header-actions">
        ${showSqlTopicButton ? `<button type="button" id="tutorial-toggle" class="site-topic-toggle" data-action="toggle-tutorial" aria-controls="interactive-topics" aria-expanded="false"><span aria-hidden="true">▤</span> All topics</button>` : ''}
        <a class="site-account-link" data-account-link href="login.html">Sign up</a>
      </div>
    </header>`;

  if (isPython) {
    const logo = mount.querySelector('.site-header-logo');
    if (logo) logo.setAttribute('aria-label', 'CodeBolt home');
  }

  mount.dataset.ready = 'true';
})();
