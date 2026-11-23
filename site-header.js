/* Codeora shared site header. Plain script; injects before account bootstrap runs. */
(() => {
  'use strict';

  const mount = document.getElementById('site-header');
  if (!mount || mount.dataset.ready === 'true') return;

  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const track = document.body.dataset.track === 'languages' ? 'languages' : 'sql';
  const current = (href) => file === href.toLowerCase();
  const pageLink = (href, label, extraClass = '') =>
    `<a class="${extraClass}" href="${href}"${current(href) ? ' aria-current="page"' : ''}>${label}</a>`;

  const groups = [
    {
      title: 'Study',
      pages: ['explanations.html', 'solutions.html', 'quiz.html', 'challenges.html'],
      links: [
        ['explanations.html', 'Explanations'],
        ['solutions.html', 'Solutions'],
        ['quiz.html', 'Quiz Zone'],
        ['challenges.html', 'Challenges']
      ]
    },
    {
      title: 'Tools',
      pages: ['playground.html', 'visualizer.html', 'projects.html', 'history.html', 'search.html', 'help.html'],
      links: [
        ['playground.html', 'SQL Playground'],
        ['visualizer.html', 'SQL Visualizer'],
        ['projects.html', 'Projects'],
        ['history.html', 'Query History'],
        ['search.html', 'Course Search'],
        ['help.html', 'SQL Help & Tutor']
      ]
    },
    {
      title: 'My Learning',
      pages: ['bookmarks.html', 'mistakes.html', 'rewards.html', 'profile.html', 'certificate.html', 'premium.html', 'shortcuts.html', 'python-bookmarks.html'],
      links: [
        ['bookmarks.html', 'Bookmarks'],
        ['mistakes.html', 'Mistake Notebook'],
        ['rewards.html', 'Rewards'],
        ['profile.html', 'Profile'],
        ['certificate.html', 'Certificate'],
        ['premium.html', 'Premium'],
        ['shortcuts.html', 'Keyboard Shortcuts'],
        ['python-bookmarks.html', 'Python Bookmarks']
      ]
    }
  ];

  const renderGroup = (group) => {
    const active = group.pages.includes(file);
    const links = group.links.map(([href, label]) => pageLink(href, label)).join('');
    return `<details class="nav-menu" data-active="${active}"${active ? ' open' : ''}>
      <summary>${group.title}<span class="nav-chevron" aria-hidden="true">⌄</span></summary>
      <div class="nav-dropdown">${links}</div>
    </details>`;
  };

  const showSqlTopicButton = Boolean(document.getElementById('interactive-topics'));
  const trackLinks = `
    <nav class="site-track-links" aria-label="Learning tracks">
      <a class="track-link${track === 'sql' ? ' is-active' : ''}" href="index.html"${track === 'sql' ? ' aria-current="true"' : ''}>SQL</a>
      <a class="track-link${track === 'languages' ? ' is-active' : ''}" href="python.html"${current('python.html') ? ' aria-current="page"' : (track === 'languages' ? ' aria-current="true"' : '')}>Languages</a>
    </nav>`;

  mount.innerHTML = `
    <header class="site-unified-header course-header">
      <div class="site-header-brand">
        <a class="site-header-logo" href="index.html" aria-label="Codeora home">
          <img src="codeora-logo.svg" alt="" width="36" height="36">
          <span class="site-brand-copy"><strong>codeora</strong><small>Learn. Code. Build.</small></span>
        </a>
        ${trackLinks}
      </div>
      <nav class="top-nav site-main-nav" aria-label="Main navigation">
        ${pageLink('index.html', 'Home')}
        ${pageLink('dashboard.html', 'Dashboard')}
        ${pageLink('lessons.html', 'Lessons')}
        ${pageLink('practice.html', 'Practice')}
        ${groups.map(renderGroup).join('')}
      </nav>
      <div class="site-header-actions">
        ${showSqlTopicButton ? `<button type="button" id="tutorial-toggle" class="site-topic-toggle" data-action="toggle-tutorial" aria-controls="interactive-topics" aria-expanded="false">
          <span aria-hidden="true">▤</span> All topics
        </button>` : ''}
        <a class="site-account-link" data-account-link href="login.html">Sign up</a>
      </div>
    </header>`;

  mount.dataset.ready = 'true';
})();
