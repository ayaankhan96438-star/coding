(() => {
  'use strict';

  const KEYS = {
    progress: 'querypath-progress-v2',
    gamification: 'querypath-gamification-v1',
    bookmarks: 'querypath-bookmarks-v1',
    profile: 'querypath-profile-v1',
    theme: 'querypath-theme-v1'
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const readJson = (key, fallback) => {
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
    catch { return fallback; }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn('Codeora could not save local data.', error); return false; }
  };
  const getBookmarks = () => {
    const value = readJson(KEYS.bookmarks, []);
    return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string'))] : [];
  };
  const getProfile = () => {
    const value = readJson(KEYS.profile, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const getProgress = () => {
    const value = readJson(KEYS.progress, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  const getGamification = () => {
    const value = readJson(KEYS.gamification, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  };
  let lessonsPromise;
  const getLessons = () => {
    if (!lessonsPromise) {
      lessonsPromise = fetch(new URL('./lessons.json', document.baseURI), { cache: 'no-store' })
        .then((response) => { if (!response.ok) throw new Error(`Could not load lessons.json (${response.status}).`); return response.json(); })
        .then((items) => {
          if (!Array.isArray(items)) throw new Error('Lesson data is not in the expected format.');
          return items;
        });
    }
    return lessonsPromise;
  };
  const allQuestions = (lessons) => lessons.flatMap((lesson, lessonIndex) => lesson.questions.map((question, questionIndex) => ({
    ...question, lessonIndex, questionIndex, lessonTitle: lesson.title, lessonSubtitle: lesson.subtitle
  })));
  const questionUrl = (question) => `practice.html?lesson=${question.lessonIndex}&question=${encodeURIComponent(question.id)}`;
  const countSolved = (lessons, progress) => allQuestions(lessons).filter((q) => progress[q.id]?.status === 'solved').length;
  const freeQuestions = (lessons) => allQuestions(lessons).filter((q) => q.free);

  function applyTheme() {
    const saved = localStorage.getItem(KEYS.theme) === 'dark' ? 'dark' : 'light';
    document.body.classList.toggle('dark-mode', saved === 'dark');
    const button = $('#theme-toggle');
    if (button) {
      button.textContent = saved === 'dark' ? '☀ Light mode' : '☾ Dark mode';
      button.setAttribute('aria-pressed', String(saved === 'dark'));
    }
  }

  function setupGlobalUi() {
    if (!$('#global-help-link')) {
      const helpLink = document.createElement('a');
      helpLink.id = 'global-help-link'; helpLink.className = 'global-help-link';
      helpLink.href = 'help.html'; helpLink.textContent = '? SQL Help';
      helpLink.setAttribute('aria-label', 'Open SQL Help and Tutor');
      document.body.append(helpLink);
    }
    const header = $('header');
    const topNav = $('.top-nav', header || document);
    if (topNav && !document.querySelector('[data-account-link]')) {
      const accountLink = document.createElement('a');
      accountLink.href = 'login.html';
      accountLink.textContent = 'Sign in';
      accountLink.setAttribute('data-account-link', '');
      accountLink.title = 'Sign in to save progress across devices';
      topNav.append(accountLink);
    }
    if (header && !$('#theme-toggle')) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'theme-toggle'; button.className = 'theme-toggle';
      button.addEventListener('click', () => {
        const next = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
        localStorage.setItem(KEYS.theme, next); applyTheme();
      });
      const progressBox = $('.progress-box', header);
      (progressBox || header).append(button);
    }
    const nav = $('.tools-nav');
    if (nav) {
      const links = [
        ['search.html', 'Search'], ['bookmarks.html', 'Bookmarks'], ['mistakes.html', 'Mistake notebook'], ['help.html', 'SQL Help'],
        ['profile.html', 'Profile'], ['certificate.html', 'Certificate'], ['premium.html', 'Premium'], ['shortcuts.html', 'Shortcuts']
      ];
      links.forEach(([href, label]) => {
        if (![...nav.querySelectorAll('a')].some((link) => link.getAttribute('href') === href)) {
          const a = document.createElement('a'); a.href = href; a.textContent = label;
          if (location.pathname.endsWith(href)) a.setAttribute('aria-current', 'page');
          nav.append(a);
        }
      });
    }
    const shortcuts = document.createElement('div');
    shortcuts.className = 'shortcut-overlay'; shortcuts.id = 'shortcut-overlay'; shortcuts.hidden = true;
    shortcuts.innerHTML = `<section class="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title"><button type="button" class="shortcut-close" aria-label="Close shortcuts">×</button><p class="eyebrow">CODEORA QUICK CONTROLS</p><h2 id="shortcut-title">Keyboard shortcuts</h2><div class="shortcut-row"><span>Run SQL in the current editor</span><kbd>Ctrl / ⌘ + Enter</kbd></div><div class="shortcut-row"><span>Submit the active lesson answer</span><kbd>Ctrl / ⌘ + Shift + Enter</kbd></div><div class="shortcut-row"><span>Open Search</span><kbd>/</kbd></div><div class="shortcut-row"><span>Open this shortcut guide</span><kbd>?</kbd></div><div class="shortcut-row"><span>Previous / next lesson question</span><kbd>Alt + ← / →</kbd></div><p class="shortcut-note">On macOS, use Command instead of Ctrl. Shortcuts are disabled while typing in normal text fields, except the SQL editor commands.</p></section>`;
    document.body.append(shortcuts);
    $('.shortcut-close', shortcuts).addEventListener('click', () => { shortcuts.hidden = true; });
    shortcuts.addEventListener('click', (event) => { if (event.target === shortcuts) shortcuts.hidden = true; });
    applyTheme();
    updateBookmarkButtons();
    if ($('#lesson')) {
      // Only react when new bookmark controls are inserted. Updating a button's
      // label creates a text node; observing that text node again caused an
      // infinite MutationObserver loop and froze the Practice page.
      const lessonRoot = $('#lesson');
      const observer = new MutationObserver((mutations) => {
        const hasNewBookmarkControl = mutations.some((mutation) =>
          Array.from(mutation.addedNodes).some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            return node.matches('[data-bookmark-id]') || Boolean(node.querySelector('[data-bookmark-id]'));
          })
        );
        if (hasNewBookmarkControl) updateBookmarkButtons();
      });
      observer.observe(lessonRoot, { childList: true, subtree: true });
    }
  }

  function updateBookmarkButtons() {
    const bookmarks = new Set(getBookmarks());
    document.querySelectorAll('[data-bookmark-id]').forEach((button) => {
      const saved = bookmarks.has(button.dataset.bookmarkId);
      button.classList.toggle('is-bookmarked', saved);
      const label = saved ? '★ Bookmarked' : '☆ Save question';
      if (button.textContent !== label) button.textContent = label;
      button.setAttribute('aria-pressed', String(saved));
    });
  }

  function toggleBookmark(id) {
    if (!id) return;
    const bookmarks = getBookmarks();
    const exists = bookmarks.includes(id);
    const next = exists ? bookmarks.filter((item) => item !== id) : [...bookmarks, id];
    if (!writeJson(KEYS.bookmarks, next)) return;
    updateBookmarkButtons();
    if (document.body.dataset.page === 'bookmarks') renderSavedPage('bookmarks');
    const status = $('#bookmark-status');
    if (status) status.textContent = exists ? 'Removed from bookmarks.' : 'Question saved to bookmarks.';
  }

  function questionCard(question, type) {
    const progress = getProgress()[question.id] || {};
    const bookmarked = getBookmarks().includes(question.id);
    const isMistake = Number(progress.wrongAttempts || 0) > 0;
    const state = progress.status === 'solved' ? 'Solved' : progress.status === 'attempted' ? 'In progress' : 'Not started';
    return `<article class="pro-question-card"><div class="pro-card-copy"><span class="eyebrow">${escapeHtml(question.lessonTitle)} · Q${question.questionIndex + 1}</span><h3>${escapeHtml(question.text)}</h3><p>${escapeHtml(question.lessonSubtitle || '')}</p><div class="pro-card-meta"><span>${state}</span>${isMistake ? `<span>${Number(progress.wrongAttempts)} wrong attempt${Number(progress.wrongAttempts) === 1 ? '' : 's'}</span>` : ''}${question.free ? '<span>Free</span>' : '<span>Premium</span>'}</div></div><div class="pro-card-actions"><a class="page-button" href="${question.free ? questionUrl(question) : 'premium.html'}">${question.free ? 'Practice →' : 'Premium track →'}</a><button type="button" class="bookmark-toggle ${bookmarked ? 'is-bookmarked' : ''}" data-bookmark-id="${escapeHtml(question.id)}" aria-pressed="${bookmarked}">${bookmarked ? '★ Bookmarked' : '☆ Save question'}</button></div></article>`;
  }

  async function renderSearchPage() {
    const input = $('#site-search'); const results = $('#search-results');
    if (!input || !results) return;
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    const mode = $('#search-scope');
    let questions = [];
    try { questions = allQuestions(await getLessons()); }
    catch (error) { results.innerHTML = `<p class="status bad">${escapeHtml(error.message)}</p>`; return; }
    const run = () => {
      const term = input.value.trim().toLocaleLowerCase();
      const scope = mode?.value || 'all';
      const matches = [];
      if (scope !== 'questions') questions.forEach((q) => {
        const haystack = `${q.lessonTitle} ${q.lessonSubtitle} ${q.concept || ''}`.toLocaleLowerCase();
        if (!term || haystack.includes(term)) matches.push({ kind: 'lesson', lesson: q.lessonIndex, title: q.lessonTitle, subtitle: q.lessonSubtitle });
      });
      if (scope !== 'lessons') questions.forEach((q) => {
        const haystack = `${q.text} ${q.lessonTitle} ${q.lessonSubtitle} ${q.hint || ''} ${q.explanation || ''}`.toLocaleLowerCase();
        if (term && haystack.includes(term)) matches.push({ kind: 'question', question: q });
      });
      const uniqueLessons = new Set();
      const filtered = matches.filter((item) => {
        if (item.kind !== 'lesson') return true;
        if (uniqueLessons.has(item.lesson)) return false;
        uniqueLessons.add(item.lesson); return true;
      });
      $('#search-count').textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
      if (!term) { results.innerHTML = '<div class="pro-empty"><b>Search the SQL course</b><p>Try “JOIN”, “GROUP BY”, “WHERE”, or a lesson topic.</p></div>'; return; }
      if (!filtered.length) { results.innerHTML = '<div class="pro-empty"><b>No results found</b><p>Try another keyword or switch the search scope.</p></div>'; return; }
      results.innerHTML = filtered.map((item) => item.kind === 'lesson'
        ? `<article class="pro-search-lesson"><div><span class="eyebrow">LESSON ${String(item.lesson + 1).padStart(2, '0')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p></div><a class="page-button" href="practice.html?lesson=${item.lesson}">Open lesson →</a></article>`
        : questionCard(item.question, 'search')).join('');
      updateBookmarkButtons();
    };
    input.addEventListener('input', run); mode?.addEventListener('change', run);
    $('#search-clear')?.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
    run();
  }

  async function renderSavedPage(type) {
    const root = $('#saved-question-list'); if (!root) return;
    let questions;
    try { questions = allQuestions(await getLessons()); }
    catch (error) { root.innerHTML = `<p class="status bad">${escapeHtml(error.message)}</p>`; return; }
    const progress = getProgress();
    const selected = type === 'mistakes'
      ? questions.filter((q) => Number(progress[q.id]?.wrongAttempts || 0) > 0)
      : questions.filter((q) => getBookmarks().includes(q.id));
    selected.sort((a, b) => type === 'mistakes'
      ? Number(progress[b.id]?.wrongAttempts || 0) - Number(progress[a.id]?.wrongAttempts || 0)
      : a.lessonIndex - b.lessonIndex || a.questionIndex - b.questionIndex);
    const count = $('#saved-count'); if (count) count.textContent = `${selected.length} question${selected.length === 1 ? '' : 's'}`;
    if (!selected.length) {
      root.innerHTML = type === 'mistakes'
        ? '<div class="pro-empty"><b>Your mistake notebook is clear.</b><p>Questions you get wrong during practice will appear here automatically, with a retry link.</p></div>'
        : '<div class="pro-empty"><b>No bookmarks yet.</b><p>Use “Save question” in SQL Practice or Search to keep difficult questions here.</p></div>';
      return;
    }
    root.innerHTML = selected.map((q) => questionCard(q, type)).join('');
    updateBookmarkButtons();
  }

  async function renderProfilePage() {
    const lessons = await getLessons(); const progress = getProgress(); const game = getGamification();
    const profile = getProfile();
    const solved = countSolved(lessons, progress); const freeTotal = freeQuestions(lessons).length;
    $('#profile-name').value = profile.name || '';
    $('#profile-email').value = profile.email || '';
    $('#profile-avatar').textContent = (profile.name || 'SQL Learner').trim().charAt(0).toUpperCase();
    $('#profile-solved').textContent = `${solved} / ${freeTotal}`;
    $('#profile-xp').textContent = `${Number(game.xp || 0).toLocaleString('en-IN')} XP`;
    $('#profile-streak').textContent = `${Number(game.streak || 0)} days`;
    $('#profile-bookmarks').textContent = String(getBookmarks().length);
    $('#profile-mistakes').textContent = String(allQuestions(lessons).filter((q) => Number(progress[q.id]?.wrongAttempts || 0) > 0).length);
    $('#profile-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('#profile-name').value.trim(); const email = $('#profile-email').value.trim();
      if (!name) { $('#profile-status').textContent = 'Please enter your display name.'; $('#profile-status').className = 'status bad'; return; }
      writeJson(KEYS.profile, { name, email, updatedAt: new Date().toISOString() });
      window.QueryPathAccount?.saveAccountState?.();
      $('#profile-avatar').textContent = name.charAt(0).toUpperCase();
      $('#profile-status').textContent = 'Profile saved on this device.'; $('#profile-status').className = 'status good';
    });
    $('#export-progress')?.addEventListener('click', exportBackup);
    $('#import-progress')?.addEventListener('change', importBackup);
  }

  function exportBackup() {
    const backup = {
      format: 'Codeora backup', version: 1, exportedAt: new Date().toISOString(),
      progress: getProgress(), gamification: getGamification(), bookmarks: getBookmarks(), profile: getProfile()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'codeora-progress-backup.json'; a.click(); URL.revokeObjectURL(url);
    const status = $('#profile-status'); if (status) { status.textContent = 'Progress backup exported.'; status.className = 'status good'; }
  }

  function importBackup(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result || ''));
        if (!['Codeora backup', 'QueryPath backup'].includes(backup.format) || backup.version !== 1 || !backup.progress || typeof backup.progress !== 'object') throw new Error('This is not a supported Codeora backup file.');
        writeJson(KEYS.progress, backup.progress);
        if (backup.gamification && typeof backup.gamification === 'object') writeJson(KEYS.gamification, backup.gamification);
        if (Array.isArray(backup.bookmarks)) writeJson(KEYS.bookmarks, backup.bookmarks);
        if (backup.profile && typeof backup.profile === 'object') writeJson(KEYS.profile, backup.profile);
        window.QueryPathAccount?.saveAccountState?.();
        $('#profile-status').textContent = 'Backup imported. Refresh the page to update all progress panels.';
        $('#profile-status').className = 'status good';
      } catch (error) {
        $('#profile-status').textContent = error.message || 'Could not read this backup.';
        $('#profile-status').className = 'status bad';
      } finally { event.target.value = ''; }
    };
    reader.onerror = () => { $('#profile-status').textContent = 'Could not read the selected file.'; $('#profile-status').className = 'status bad'; };
    reader.readAsText(file);
  }

  async function renderCertificatePage() {
    const lessons = await getLessons(); const progress = getProgress(); const free = freeQuestions(lessons);
    const completed = free.filter((q) => progress[q.id]?.status === 'solved').length;
    const unlocked = free.length > 0 && completed === free.length;
    const profile = getProfile();
    $('#certificate-progress').textContent = `${completed} / ${free.length} free questions completed`;
    $('#certificate-progress-fill').style.width = `${Math.round((completed / Math.max(free.length, 1)) * 100)}%`;
    const panel = $('#certificate-state');
    if (!unlocked) {
      panel.innerHTML = `<div class="pro-empty"><b>Certificate is not unlocked yet.</b><p>Complete all ${free.length} free course questions to unlock your Codeora SQL Foundations certificate. You have completed ${completed} so far.</p><a class="page-button" href="practice.html">Continue learning →</a></div>`;
      $('#print-certificate').disabled = true; return;
    }
    const name = profile.name?.trim() || 'SQL Learner';
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    panel.innerHTML = `<article class="certificate-paper" id="certificate-paper"><div class="certificate-frame"><p class="certificate-brand">C <span>Codeora</span></p><p class="eyebrow">CERTIFICATE OF COMPLETION</p><h2>SQL Foundations</h2><p class="certificate-award">This certificate is proudly presented to</p><h3>${escapeHtml(name)}</h3><p class="certificate-description">for successfully completing the Codeora SQL Foundations learning track, including all ${free.length} free practice questions.</p><div class="certificate-bottom"><span>ISSUED ${date}</span><span>CODEORA · LEARNING RECORD</span></div></div></article>`;
    $('#print-certificate').disabled = false;
    $('#print-certificate').addEventListener('click', () => window.print());
  }

  function setupPremiumPage() {
    document.querySelectorAll('[data-premium-action]').forEach((button) => button.addEventListener('click', () => {
      const status = $('#premium-status');
      if (status) {
        status.textContent = 'Live checkout is not connected. To accept real payments, configure a payment provider account and verify orders on a server before unlocking Premium content.';
        status.className = 'status bad';
      }
    }));
  }


  const HELP_TOPICS = [
    { keys: ['join', 'combine table', 'related table', 'two tables'], title: 'JOIN connects related tables', body: 'A JOIN combines rows from two tables using a condition that matches related columns. INNER JOIN keeps matching rows from both tables. LEFT JOIN keeps every row from the left table and fills unmatched right-side columns with NULL.', example: 'SELECT students.name, enrollments.status\nFROM students\nINNER JOIN enrollments\n  ON students.id = enrollments.student_id;', next: 'Start by identifying the primary key in one table and the matching foreign-key column in the other.' },
    { keys: ['where', 'filter', 'condition', 'specific rows'], title: 'WHERE filters rows', body: 'WHERE checks each row and keeps only rows that satisfy the condition. It is evaluated before GROUP BY, so it filters individual records rather than completed groups.', example: "SELECT name, city\nFROM students\nWHERE city = 'Delhi';", next: 'Try changing Delhi to Mumbai, then run the query again in Playground.' },
    { keys: ['group by', 'group records', 'group rows', 'per city', 'per course'], title: 'GROUP BY creates groups', body: 'GROUP BY collects rows that share the same value in one or more columns. It is commonly used with COUNT, SUM, AVG, MIN or MAX to calculate one result per group.', example: 'SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city;', next: 'Add ORDER BY student_count DESC to place the largest group first.' },
    { keys: ['having'], title: 'HAVING filters groups', body: 'HAVING is used after GROUP BY to keep or remove complete groups based on an aggregate condition. WHERE filters rows before grouping; HAVING filters groups after grouping.', example: 'SELECT city, COUNT(*) AS student_count\nFROM students\nGROUP BY city\nHAVING COUNT(*) > 1;', next: 'Compare this with WHERE city = \'Delhi\' to see the difference.' },
    { keys: ['order by', 'sort', 'ascending', 'descending'], title: 'ORDER BY sorts the result', body: 'ORDER BY sorts the rows returned by a query. ASC means ascending (the default); DESC means descending. You can sort by more than one column.', example: 'SELECT name, age\nFROM students\nORDER BY age DESC, name ASC;', next: 'Use LIMIT after ORDER BY when you only need the first few sorted rows.' },
    { keys: ['null', 'missing value', 'empty value', 'is null'], title: 'NULL means missing or unknown', body: 'NULL is not the same as zero or an empty string. Comparisons such as = NULL do not work as expected. Use IS NULL to find missing values and IS NOT NULL to find values that are present.', example: 'SELECT name, email\nFROM students\nWHERE email IS NOT NULL;', next: 'Try IS NULL and IS NOT NULL on a table that contains missing values.' },
    { keys: ['select', 'columns', 'choose column'], title: 'SELECT chooses columns', body: 'SELECT tells SQL which columns or expressions should appear in the result. Use * to request every column, or list only the columns you need.', example: 'SELECT name, age\nFROM students;', next: 'Prefer named columns over * when you know exactly which fields you need.' },
    { keys: ['from', 'table name', 'which table'], title: 'FROM chooses the source table', body: 'FROM tells SQL which table to read. The table must exist in the current database, and its name must be spelled correctly.', example: 'SELECT *\nFROM students;', next: 'Open the Database tables panel to inspect available tables and columns.' },
    { keys: ['limit', 'top rows', 'first rows'], title: 'LIMIT controls how many rows are returned', body: 'LIMIT restricts the number of rows in the result. It is useful when exploring a large table or checking a query before working with all records.', example: 'SELECT *\nFROM students\nLIMIT 5;', next: 'Combine LIMIT with ORDER BY to get the top or bottom records by a value.' },
    { keys: ['count', 'sum', 'average', 'avg', 'min(', 'max(', 'aggregate'], title: 'Aggregate functions calculate summaries', body: 'COUNT counts rows or non-NULL values, SUM adds numeric values, AVG calculates an average, and MIN / MAX return the smallest / largest value. Combine them with GROUP BY for one summary per group.', example: 'SELECT COUNT(*) AS total_students\nFROM students;', next: 'Try COUNT(*) with GROUP BY city to count students in each city.' },
    { keys: ['distinct', 'duplicate'], title: 'DISTINCT removes duplicate result rows', body: 'DISTINCT returns unique combinations of the selected columns. It does not delete records from the table; it only removes duplicate rows from the query result.', example: 'SELECT DISTINCT city\nFROM students\nORDER BY city;', next: 'Select two columns with DISTINCT to see how unique combinations are formed.' },
    { keys: ['insert', 'add row', 'new record'], title: 'INSERT adds a new row', body: 'INSERT INTO adds a record to a table. Specify the target columns and provide values in the same order. Text values should be wrapped in single quotes.', example: "INSERT INTO students (id, name, age, city, email)\nVALUES (7, 'Ira', 20, 'Jaipur', 'ira@mail.test');", next: 'Use the Playground to experiment. Reset the sample database when you want to start over.' },
    { keys: ['update', 'change value', 'edit row'], title: 'UPDATE changes existing rows', body: 'UPDATE changes column values in rows that match its WHERE condition. Without WHERE, every row in the table may be updated, so check the condition before running it.', example: "UPDATE students\nSET city = 'Jaipur'\nWHERE id = 1;", next: 'Run a SELECT with the same WHERE condition first to confirm which rows will change.' },
    { keys: ['delete', 'remove row'], title: 'DELETE removes rows', body: 'DELETE FROM removes rows that match its WHERE condition. Without WHERE, all rows are deleted from the table. Always verify the condition with SELECT first.', example: 'DELETE FROM students\nWHERE id = 6;', next: 'Use a fresh Playground database for experiments you do not want to keep.' },
    { keys: ['primary key', 'foreign key', 'relationship', 'relational'], title: 'Primary keys and foreign keys connect records', body: 'A primary key uniquely identifies a row in its table. A foreign key stores a reference to a related row in another table. JOIN conditions commonly connect these key columns.', example: 'SELECT students.name, enrollments.course_id\nFROM students\nJOIN enrollments\n  ON students.id = enrollments.student_id;', next: 'Open SQL Visualizer and choose Table relationships to see how tables connect.' },
    { keys: ['alias', 'as ', 'rename column'], title: 'Aliases give columns or tables a temporary name', body: 'AS assigns a readable label to a result column or a shorter name to a table. Aliases do not rename the original database column.', example: 'SELECT name AS student_name\nFROM students;', next: 'Use table aliases to make longer JOIN statements easier to read.' }
  ];

  function helpAnswerCard(title, summary, steps = [], example = '', next = '') {
    return `<article class="help-result-card"><div class="help-result-kicker">GUIDED EXPLANATION</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(summary)}</p>${steps.length ? `<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>` : ''}${example ? `<div class="help-example-head">TRY THIS PATTERN</div><pre><code>${escapeHtml(example)}</code></pre>` : ''}${next ? `<div class="help-next-step"><b>Next step</b><p>${escapeHtml(next)}</p></div>` : ''}</article>`;
  }

  function explainSqlError(message) {
    const error = String(message || '').trim();
    const lower = error.toLowerCase();
    if (!error) return helpAnswerCard('Paste the exact SQL error', 'Copy the full error message shown below your SQL editor and paste it here. The exact wording helps identify what needs fixing.');
    let title = 'Check the SQL error message';
    let summary = `SQLite reported: ${error}. This helper does not recognise this exact error yet. Read the message from left to right and check the table, column, value or SQL keyword it mentions.`;
    let example = '';
    let steps = ['Check the spelling of table names and column names against the Database tables panel.', 'Check commas, parentheses, quotes and the order of SQL clauses.', 'Run a smaller part of the query, then add the remaining clauses one at a time.'];
    if (lower.includes('no such table')) {
      const name = error.match(/no such table:\s*([\w.-]+)/i)?.[1] || 'table_name';
      title = `SQLite cannot find the table “${name}”`;
      summary = 'The table name in your query does not exist in the active database, or it is spelled differently.';
      example = "SELECT name\nFROM sqlite_master\nWHERE type = 'table'\nORDER BY name;";
      steps = ['Open the Database tables panel and check the exact table name.', 'Check for spelling mistakes and make sure you are using the correct database page.', 'Use the table name exactly as it appears in the schema.'];
    } else if (lower.includes('no such column')) {
      const name = error.match(/no such column:\s*([\w.-]+)/i)?.[1] || 'column_name';
      title = `SQLite cannot find the column “${name}”`;
      summary = 'The table does not contain a column with that name, or the column needs a table prefix in a JOIN.';
      example = 'PRAGMA table_info(students);\n\nSELECT name, age\nFROM students;';
      steps = ['Inspect the columns in the table with PRAGMA table_info(table_name).', 'Check the column spelling and whether it belongs to a different table.', 'When using JOIN, qualify a column with its table name, for example students.id.'];
    } else if (lower.includes('syntax error')) {
      const near = error.match(/near\s+["']?(.+?)["']?:/i)?.[1];
      title = 'There is a SQL syntax problem';
      summary = near ? `SQLite stopped near “${near}”. The issue is often just before the word or symbol mentioned in the error.` : 'SQLite could not understand part of the query. A missing comma, quote, parenthesis or clause is a common cause.';
      example = 'SELECT name, age\nFROM students\nWHERE city = \'Delhi\'\nORDER BY name;';
      steps = ['Check the line before the reported location; the mistake may be just before it.', 'Make sure SELECT columns are separated by commas.', 'Check that text uses matching single quotes and parentheses are closed.', 'Use SQL clause order: SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.'];
    } else if (lower.includes('ambiguous column name')) {
      title = 'A column name is ambiguous';
      summary = 'More than one table in your query contains the same column name. SQLite needs to know which table you mean.';
      example = 'SELECT students.id, students.name, enrollments.status\nFROM students\nJOIN enrollments\n  ON students.id = enrollments.student_id;';
      steps = ['Find the repeated column name in the joined tables.', 'Prefix it with its table name or alias, such as students.id.', 'Use the same clear prefixes in SELECT, WHERE and ORDER BY when needed.'];
    } else if (lower.includes('incomplete input')) {
      title = 'The SQL statement is incomplete';
      summary = 'The query ends before SQLite has received a complete statement. A closing parenthesis, quote, expression or clause may be missing.';
      example = "SELECT name\nFROM students\nWHERE city = 'Delhi';";
      steps = ['Check that every opening parenthesis has a closing parenthesis.', 'Check that every text quote has a matching closing quote.', 'Remove a trailing unfinished keyword such as AND, OR, JOIN or WHERE.'];
    } else if (lower.includes('unique constraint failed')) {
      title = 'A value must be unique but already exists';
      summary = 'The statement is trying to insert or update a value that duplicates a value protected by a UNIQUE or primary-key constraint.';
      example = 'SELECT *\nFROM students\nWHERE id = 1;';
      steps = ['Check whether that ID or unique value is already present.', 'Choose a new value, or update the existing row instead of inserting a duplicate.', 'Do not remove a uniqueness constraint just to hide the error.'];
    } else if (lower.includes('not null constraint failed')) {
      title = 'A required value is missing';
      summary = 'A column marked NOT NULL received a NULL or no value. Provide a valid value for that column.';
      steps = ['Identify the column named in the error.', 'Include that column in the INSERT statement and provide a value.', 'For UPDATE, set the required column to a valid value.'];
    } else if (lower.includes('datatype mismatch')) {
      title = 'A value has an incompatible data type';
      summary = 'The value or expression does not fit the expected type for the column or operation.';
      example = "SELECT *\nFROM students\nWHERE age >= 18;";
      steps = ['Check whether numeric columns are compared with numbers rather than text.', 'Check the order and number of values in INSERT statements.', 'Avoid accidental text-to-number conversions.'];
    } else if (lower.includes('no such function')) {
      title = 'SQLite does not recognise this function';
      summary = 'The function name may be misspelled or may belong to another SQL database rather than SQLite.';
      steps = ['Check the function spelling.', 'Confirm that the function is supported by SQLite.', 'For this Codeora sample database, use common SQLite functions such as COUNT, SUM, AVG, MIN, MAX and LENGTH.'];
    }
    return helpAnswerCard(title, summary, steps, example, 'Fix one issue at a time, then run the query again.');
  }

  function explainSqlQuery(sql) {
    const query = String(sql || '').trim();
    const upper = query.toUpperCase();
    if (!query) return helpAnswerCard('Paste a SQL query to explain', 'Add your SQL statement in the box. The tutor will identify common clauses and point out a few frequent mistakes.');
    const parts = [];
    const clauses = [
      ['SELECT', /\bSELECT\b[\s\S]*?(?=\bFROM\b|$)/i, 'SELECT chooses the columns or calculations to return.'],
      ['FROM', /\bFROM\b\s+[\w.]+/i, 'FROM identifies the table that supplies the rows.'],
      ['JOIN', /\b(?:INNER|LEFT|RIGHT|CROSS)?\s*JOIN\b[\s\S]*?(?=\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i, 'JOIN combines rows from related tables using an ON condition.'],
      ['WHERE', /\bWHERE\b[\s\S]*?(?=\bGROUP\s+BY\b|\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i, 'WHERE filters individual rows before grouping.'],
      ['GROUP BY', /\bGROUP\s+BY\b[\s\S]*?(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i, 'GROUP BY collects rows with matching values into groups.'],
      ['HAVING', /\bHAVING\b[\s\S]*?(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i, 'HAVING filters grouped results, often using aggregate functions.'],
      ['ORDER BY', /\bORDER\s+BY\b[\s\S]*?(?=\bLIMIT\b|$)/i, 'ORDER BY sorts the final result.'],
      ['LIMIT', /\bLIMIT\b\s+\d+/i, 'LIMIT caps the number of returned rows.']
    ];
    clauses.forEach(([name, pattern, description]) => { const match = query.match(pattern); if (match) parts.push(`${name}: ${description} Found: ${match[0].replace(/\s+/g, ' ').trim()}`); });
    if (/\bSELECT\s+\*/i.test(query)) parts.push('SELECT * returns every column. That is convenient for exploration, but listing the columns is clearer when you know what you need.');
    if (/=\s*NULL\b/i.test(query)) parts.push('Possible issue: use IS NULL instead of = NULL when checking for missing values.');
    if (/\bUPDATE\b/i.test(query) && !/\bWHERE\b/i.test(query)) parts.push('Caution: this UPDATE has no WHERE clause and may change every row in the table.');
    if (/\bDELETE\s+FROM\b/i.test(query) && !/\bWHERE\b/i.test(query)) parts.push('Caution: this DELETE has no WHERE clause and may remove every row in the table.');
    if (/\bSELECT\b/i.test(query) && !/\bFROM\b/i.test(query) && !/\bSELECT\s+(?:1|\d+|CURRENT_DATE|CURRENT_TIME)\b/i.test(query)) parts.push('Check whether a FROM clause is missing. Most table queries need SELECT … FROM table_name.');
    if (/\bCOUNT\s*\(|\bSUM\s*\(|\bAVG\s*\(|\bMIN\s*\(|\bMAX\s*\(/i.test(query)) parts.push('This query uses an aggregate function. When selecting other non-aggregated columns alongside aggregates, you will usually need GROUP BY.');
    if (!parts.length) parts.push('The tutor could not identify common SELECT clauses in this statement. It may be an INSERT, UPDATE, DELETE or a database definition statement. Check the target table, columns and conditions carefully.');
    return helpAnswerCard('Your SQL, explained', 'Here is a clause-by-clause reading of the statement you pasted.', parts, '', 'Run the statement in SQL Playground to verify its result. For data-changing statements, use a fresh sample database if you want to experiment safely.');
  }

  function answerSqlDoubt(question) {
    const text = String(question || '').trim();
    if (!text) return helpAnswerCard('Ask a question to get started', 'Try something specific, such as “What is a JOIN?”, “Why use GROUP BY?” or “How do I filter rows?”');
    const lower = text.toLowerCase();
    if (/difference|vs\.?|versus/.test(lower) && /where/.test(lower) && /having/.test(lower)) return helpAnswerCard('WHERE vs HAVING', 'WHERE filters individual rows before grouping. HAVING filters the groups created by GROUP BY.', ['Use WHERE to limit which rows enter the groups.', 'Use HAVING to keep or remove groups based on COUNT, SUM, AVG or another aggregate.'], 'SELECT city, COUNT(*)\nFROM students\nWHERE age >= 18\nGROUP BY city\nHAVING COUNT(*) > 1;');
    const topic = HELP_TOPICS.find((item) => item.keys.some((key) => lower.includes(key)));
    if (topic) return helpAnswerCard(topic.title, topic.body, ['Read the example from top to bottom.', 'Notice which table and columns are used.', 'Change one part of the example and run it to see what changes.'], topic.example, topic.next);
    if (/primary key|foreign key|relationship|relational/.test(lower)) {
      return helpAnswerCard('Keys connect database records', 'A primary key uniquely identifies one row. A foreign key stores a reference to a related row, allowing tables to be connected with JOIN.', [], 'SELECT students.name, enrollments.status\nFROM students\nJOIN enrollments\n  ON students.id = enrollments.student_id;', 'Open SQL Visualizer → Table relationships to explore the sample schema.');
    }
    return helpAnswerCard('Let’s break your doubt down', 'I could not match this to one built-in SQL topic yet. Try adding the SQL keyword or paste the exact error/query so the tutor can give a more targeted explanation.', ['Name the clause or function you are asking about, such as SELECT, JOIN, WHERE, GROUP BY or COUNT.', 'Include the exact error message if a query failed.', 'You can also open a lesson and use its “Need help?” link to bring the current question here.'], 'SELECT name\nFROM students\nWHERE city = \'Delhi\';', 'The help library is a local guided tutor, not a live generative AI service.');
  }

  async function initHelpPage() {
    const input = $('#help-input'); const answer = $('#help-answer');
    if (!input || !answer) return;
    const params = new URLSearchParams(location.search);
    const questionId = params.get('question');
    let selectedContext = null;
    if (questionId) {
      try {
        const lessons = await getLessons();
        const question = allQuestions(lessons).find((item) => item.id === questionId);
        if (question) {
          selectedContext = question;
          const context = $('#help-context');
          context.hidden = false;
          context.innerHTML = `<div><p class="eyebrow">PRACTICE QUESTION CONTEXT</p><b>${escapeHtml(question.lessonTitle)} · Question ${question.questionIndex + 1}</b><p>${escapeHtml(question.text)}</p><small>Hint: ${escapeHtml(question.hint || 'Review the lesson concept and database schema.')}</small></div><a class="page-button secondary" href="${questionUrl(question)}">Back to this question →</a>`;
          input.value = `Please explain this practice question in simple steps: ${question.text}\n\nHint: ${question.hint || ''}\n\nConcept: ${question.explanation || question.lessonSubtitle || ''}`;
          $('#help-mode').value = 'doubt';
        }
      } catch (error) {
        answer.innerHTML = helpAnswerCard('Could not load the question context', error.message || 'Please try opening the help page again.');
      }
    }
    const ask = () => {
      const value = input.value.trim();
      if (!value) { answer.innerHTML = helpAnswerCard('Add your question or SQL first', 'Type a concept doubt, paste the exact error, or enter a query you want explained.'); input.focus(); return; }
      const mode = $('#help-mode').value;
      if (mode === 'error') answer.innerHTML = explainSqlError(value);
      else if (mode === 'query') answer.innerHTML = explainSqlQuery(value);
      else if (mode === 'doubt' && selectedContext) answer.innerHTML = helpAnswerCard('Let’s break down this practice question', selectedContext.explanation || selectedContext.text, ['First identify what the question asks you to return or change.', 'Look at the table and column names in the Database tables panel.', selectedContext.hint || 'Build the query one clause at a time, then run it.', 'Compare the output with the expected result before submitting.'], selectedContext.example || '', 'Try the question in the SQL editor, then return here with any error message you see.');
      else if (mode === 'doubt') answer.innerHTML = answerSqlDoubt(value);
      else if (/\b(?:no such table|no such column|syntax error|ambiguous column|incomplete input|constraint failed|datatype mismatch|no such function)\b/i.test(value)) answer.innerHTML = explainSqlError(value);
      else if (/\b(?:select|from|where|join|group\s+by|order\s+by|insert\s+into|update\s+\w+|delete\s+from|create\s+table)\b/i.test(value)) answer.innerHTML = explainSqlQuery(value);
      else answer.innerHTML = answerSqlDoubt(value);
      answer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    $('#help-ask').addEventListener('click', ask);
    $('#help-clear').addEventListener('click', () => { input.value = ''; answer.innerHTML = '<div class="help-empty"><span>?</span><b>Your explanation will appear here.</b><p>Start with a question or choose one of the topics below.</p></div>'; input.focus(); });
    input.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') ask(); });
    document.querySelectorAll('[data-help-prompt]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.helpPrompt || ''; $('#help-mode').value = 'doubt'; ask(); }));
    if (params.has('error')) { input.value = params.get('error'); $('#help-mode').value = 'error'; ask(); }
    else if (params.has('sql')) { input.value = params.get('sql'); $('#help-mode').value = 'query'; }
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      const overlay = $('#shortcut-overlay');
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === 'Escape' && overlay && !overlay.hidden) { overlay.hidden = true; return; }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey && $('#submit-button')) { $('#submit-button').click(); return; }
        const run = $('#run-button') || $('#playground-run') || $('#project-run') || $('#challenge-submit');
        if (run && !run.disabled) run.click();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) {
        if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && document.body.dataset.page === 'practice') {
          event.preventDefault();
          const button = $(`[data-action="${event.key === 'ArrowLeft' ? 'previous-question' : 'next-question'}"]`);
          button?.click();
        }
        return;
      }
      if (event.key === '?') { event.preventDefault(); if (overlay) overlay.hidden = false; }
      else if (event.key === '/') {
        event.preventDefault();
        if ($('#site-search')) $('#site-search').focus();
        else location.href = 'search.html';
      }
    });
  }

  async function initPage() {
    if (window.QueryPathAccountReady) await window.QueryPathAccountReady;
    const page = document.body.dataset.page;
    try {
      if (page === 'search') await renderSearchPage();
      else if (page === 'bookmarks') await renderSavedPage('bookmarks');
      else if (page === 'mistakes') await renderSavedPage('mistakes');
      else if (page === 'profile') await renderProfilePage();
      else if (page === 'certificate') await renderCertificatePage();
      else if (page === 'premium') setupPremiumPage();
      else if (page === 'help') await initHelpPage();
    } catch (error) {
      const target = $('#professional-error');
      if (target) { target.hidden = false; target.textContent = error.message || 'This page could not load.'; }
      console.error('Codeora professional feature error:', error);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-bookmark-id]');
    if (button) { event.preventDefault(); toggleBookmark(button.dataset.bookmarkId); }
  });
  setupGlobalUi();
  setupKeyboardShortcuts();
  initPage();
})();
