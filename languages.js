(() => {
  'use strict';

  const STORAGE_KEY = 'codeora.languages.workspace.v1';
  const VERSION = 1;
  const $ = (id) => document.getElementById(id);
  const extLanguage = { py: 'python', html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript' };
  const languageLabels = { python: 'Python', html: 'HTML', css: 'CSS', javascript: 'JavaScript' };
  const codeMirrorModes = { python: 'python', html: 'htmlmixed', css: 'css', javascript: 'javascript' };

  const starterFiles = {
    'index.html': `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My first Codeora project</title>\n  <link rel="stylesheet" href="style.css">\n  <script src="script.js" defer></script>\n</head>\n<body>\n  <main class="card">\n    <p class="eyebrow">MY FIRST PROJECT</p>\n    <h1>Hello, Codeora!</h1>\n    <p>Change this HTML, style it with CSS, and add behavior with JavaScript.</p>\n    <button id="hello-button">Click to try it</button>\n    <p id="message" aria-live="polite"></p>\n  </main>\n</body>\n</html>\n`,
    'style.css': `:root {\n  font-family: Arial, sans-serif;\n  color: #24364b;\n  background: #f2f6fb;\n}\n\nbody {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  margin: 0;\n}\n\n.card {\n  width: min(88%, 440px);\n  padding: 32px;\n  border: 1px solid #dce5ef;\n  border-radius: 12px;\n  background: white;\n}\n\n.eyebrow { color: #1769dc; font-size: 11px; letter-spacing: .14em; }\nbutton { padding: 10px 15px; border: 0; border-radius: 6px; background: #1769dc; color: white; cursor: pointer; }\n`,
    'script.js': `const button = document.querySelector('#hello-button');\nconst message = document.querySelector('#message');\n\nbutton.addEventListener('click', () => {\n  message.textContent = 'Your HTML, CSS and JavaScript are connected!';\n  console.log('Hello from Codeora');\n});\n`,
    'main.py': `# Your first Python program\nprint("Hello, Codeora!")\n\nname = "Learner"\nprint(f"Welcome, {name}!")\n`,
    'package.json': ` {\n  "name": "codeora-project",\n  "private": true,\n  "version": "1.0.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite --host 0.0.0.0",\n    "build": "vite build",\n    "preview": "vite preview"\n  },\n  "devDependencies": {\n    "vite": "^7.0.0"\n  }\n}\n`.trimStart(),
    'README.md': `# Codeora Project\n\nA starter project for HTML, CSS, JavaScript and Python practice.\n\n## Run this project on your laptop\n\n1. Open this folder in VS Code.\n2. Install Node.js (npm is included with Node.js).\n3. Open the VS Code terminal in this folder.\n4. Run \`npm install\`.\n5. Run \`npm run dev\` and open the local URL shown in the terminal.\n\nPython is run separately with \`python main.py\` after installing Python.\n`,
    '.gitignore': `node_modules/\ndist/\n.venv/\n__pycache__/\n.env\n`,
    '.vscode/extensions.json': ` {\n  "recommendations": [\n    "ms-python.python",\n    "ms-python.vscode-pylance",\n    "esbenp.prettier-vscode"\n  ]\n}\n`.trimStart()
  };

  const practiceTasks = {
    python: { title: 'Print your first message', description: 'Write Python code that prints “Hello, Codeora!” in the output panel.', expected: 'Hello, Codeora!', starter: 'print("Hello, Codeora!")', level: 'BEGINNER · PYTHON' },
    html: { title: 'Create a page heading', description: 'Write a small HTML page with one heading and a paragraph about something you like.', expected: 'A heading and a paragraph on the preview', starter: '<!doctype html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>My page</title></head>\n<body>\n  <h1>My favourite thing</h1>\n  <p>Write a short introduction here.</p>\n</body>\n</html>', level: 'BEGINNER · HTML' },
    css: { title: 'Style a simple card', description: 'Write CSS to give a card a background, spacing, rounded corners and a readable font.', expected: 'A styled white card in the preview', starter: '.card {\n  padding: 24px;\n  border-radius: 10px;\n  background: white;\n  color: #24364b;\n}', level: 'BEGINNER · CSS' },
    javascript: { title: 'Change text with JavaScript', description: 'Select an element and change its text when a button is clicked.', expected: 'Button click changes the message', starter: `document.querySelector('#message').textContent = 'I wrote JavaScript!';\nconsole.log('Hello, Codeora');`, level: 'BEGINNER · JAVASCRIPT' }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function detectLanguage(path) {
    const ext = String(path).split('.').pop().toLowerCase();
    return extLanguage[ext] || 'javascript';
  }
  function defaultState() {
    return {
      version: VERSION,
      files: clone(starterFiles),
      folders: ['.vscode'],
      activeFile: 'main.py',
      language: 'python',
      mode: 'project',
      outputTab: 'preview'
    };
  }
  function normalizeState(candidate) {
    if (!candidate || candidate.version !== VERSION || !candidate.files || typeof candidate.files !== 'object') return defaultState();
    const files = {};
    Object.entries(candidate.files).forEach(([path, content]) => {
      if (typeof path === 'string' && typeof content === 'string' && !path.startsWith('/') && !path.split('/').includes('..')) files[path] = content;
    });
    if (!Object.keys(files).length) return defaultState();
    const activeFile = files[candidate.activeFile] !== undefined ? candidate.activeFile : Object.keys(files)[0];
    const language = languageLabels[candidate.language] ? candidate.language : detectLanguage(activeFile);
    return {
      version: VERSION,
      files,
      folders: Array.isArray(candidate.folders) ? candidate.folders.filter((folder) => typeof folder === 'string' && !folder.startsWith('/') && !folder.split('/').includes('..')) : [],
      activeFile,
      language,
      mode: candidate.mode === 'practice' ? 'practice' : 'project',
      outputTab: candidate.outputTab === 'console' ? 'console' : 'preview'
    };
  }
  function loadState() {
    try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch { return defaultState(); }
  }

  let state = loadState();
  let editor = null;
  let activeDirectoryHandle = null;
  let pyodidePromise = null;
  let pyodideInstance = null;
  let dirty = false;
  let consoleLines = [];
  let isRendering = false;

  function setStatus(message, isError = false) {
    $('save-state').textContent = message;
    $('save-state').style.color = isError ? '#b6534a' : '#778391';
  }
  function saveBrowserState() {
    try {
      if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      dirty = false;
      $('tab-unsaved').hidden = true;
      setStatus('Saved in browser');
    } catch (error) {
      setStatus('Browser storage is full', true);
      console.warn('Codeora workspace could not be saved locally:', error);
    }
  }
  function markDirty() {
    dirty = true;
    $('tab-unsaved').hidden = false;
    setStatus('Unsaved changes');
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStatus('Saved in browser'); $('tab-unsaved').hidden = true; }
    catch { /* the explicit Save button will report storage errors */ }
  }
  function fileIcon(path) {
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'py') return ['py-dot', '●'];
    if (ext === 'html' || ext === 'htm') return ['html-dot', '●'];
    if (ext === 'css') return ['css-dot', '●'];
    if (ext === 'js' || ext === 'mjs') return ['js-dot', '●'];
    return ['md-dot', '◇'];
  }
  function foldersFromFiles() {
    const paths = new Set(state.folders || []);
    Object.keys(state.files).forEach((path) => {
      const pieces = path.split('/');
      pieces.pop();
      let prefix = '';
      pieces.forEach((piece) => { prefix = prefix ? `${prefix}/${piece}` : piece; paths.add(prefix); });
    });
    return [...paths].sort((a, b) => a.localeCompare(b));
  }
  function renderTree() {
    const tree = $('file-tree');
    tree.replaceChildren();
    const folders = foldersFromFiles();
    const root = document.createElement('div');
    const rootBtn = document.createElement('button');
    rootBtn.type = 'button'; rootBtn.className = 'tree-folder-label'; rootBtn.innerHTML = '<span>▾</span><span>▰</span><span>CODEORA-PROJECT</span>';
    root.append(rootBtn);
    const contents = document.createElement('div'); contents.className = 'tree-folder-children';
    const folderNodes = new Map();
    folders.sort((a,b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).forEach((folderPath) => {
      const wrapper = document.createElement('div'); wrapper.className = 'tree-folder'; wrapper.dataset.path = folderPath;
      const label = document.createElement('button'); label.type = 'button'; label.className = 'tree-folder-label'; label.innerHTML = '<span>▾</span><span>▱</span><span></span>'; label.lastElementChild.textContent = folderPath.split('/').pop();
      const kids = document.createElement('div'); kids.className = 'tree-folder-children';
      label.addEventListener('click', () => { kids.hidden = !kids.hidden; label.firstElementChild.textContent = kids.hidden ? '▸' : '▾'; });
      wrapper.append(label, kids);
      const parentPath = folderPath.includes('/') ? folderPath.slice(0, folderPath.lastIndexOf('/')) : '';
      (folderNodes.get(parentPath)?.kids || contents).append(wrapper);
      folderNodes.set(folderPath, { wrapper, kids });
    });
    Object.keys(state.files).sort((a,b) => a.localeCompare(b)).forEach((path) => {
      if (folders.includes(path)) return;
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const target = folderNodes.get(parentPath)?.kids || contents;
      const [dotClass, glyph] = fileIcon(path);
      const button = document.createElement('button'); button.type = 'button'; button.className = `file-item${path === state.activeFile ? ' active' : ''}`; button.setAttribute('role', 'treeitem'); button.setAttribute('aria-selected', String(path === state.activeFile));
      const icon = document.createElement('span'); icon.className = `file-icon ${dotClass}`; icon.textContent = glyph;
      const name = document.createElement('span'); name.className = 'file-name'; name.textContent = path.split('/').pop();
      button.append(icon, name); button.title = path;
      button.addEventListener('click', () => openFile(path));
      target.append(button);
    });
    root.append(contents); tree.append(root);
  }
  function setMode(mode) {
    state.mode = mode === 'practice' ? 'practice' : 'project';
    document.querySelectorAll('.mode-button').forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    $('practice-panel').hidden = state.mode !== 'practice';
    $('project-panel').hidden = state.mode !== 'project';
    $('studio-layout').classList.toggle('practice-mode', state.mode === 'practice');
    $('project-root-name').textContent = state.mode === 'practice' ? 'PRACTICE FILES' : 'CODEORA-PROJECT';
    updatePracticeCard();
    saveBrowserState();
  }
  function setOutputTab(tab) {
    state.outputTab = tab === 'console' ? 'console' : 'preview';
    document.querySelectorAll('[data-output-tab]').forEach((button) => button.classList.toggle('active', button.dataset.outputTab === state.outputTab));
    $('preview-wrap').hidden = state.outputTab !== 'preview';
    $('console-wrap').hidden = state.outputTab !== 'console';
    saveBrowserState();
  }
  function updatePracticeCard() {
    const task = practiceTasks[state.language] || practiceTasks.python;
    $('practice-level').textContent = task.level;
    $('practice-task-title').textContent = task.title;
    $('practice-task-description').textContent = task.description;
    $('expected-output').textContent = task.expected;
    $('language-picker').value = state.language;
    $('editor-language-label').textContent = languageLabels[state.language];
  }
  function updateFileUI() {
    const path = state.activeFile;
    $('active-file-name').textContent = path.split('/').pop();
    $('editor-breadcrumb').textContent = `codeora-project / ${path}`;
    $('editor-language-label').textContent = languageLabels[state.language] || 'Code';
    const [dotClass] = fileIcon(path);
    $('active-file-tab').querySelector('.file-type-dot').className = `file-type-dot ${dotClass}`;
    $('language-picker').value = state.language;
    $('cursor-position').textContent = editor ? `Ln ${editor.getCursor().line + 1}, Col ${editor.getCursor().ch + 1}` : 'Ln 1, Col 1';
    $('delete-file-btn').disabled = Object.keys(state.files).length <= 1;
    renderTree();
    updatePracticeCard();
  }
  function getEditorValue() { return editor ? editor.getValue() : $('code-editor').value; }
  function setEditorValue(value) {
    if (editor) { editor.setValue(value); editor.clearHistory(); }
    else $('code-editor').value = value;
  }
  function openFile(path) {
    if (!(path in state.files)) return;
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    state.activeFile = path;
    state.language = detectLanguage(path);
    setEditorValue(state.files[path]);
    editor?.setOption('mode', codeMirrorModes[state.language] || 'text/plain');
    updateFileUI();
    saveBrowserState();
  }
  function changeLanguage(language) {
    if (!languageLabels[language]) return;
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    state.language = language;
    const ext = { python: '.py', html: '.html', css: '.css', javascript: '.js' }[language];
    const found = Object.keys(state.files).find((path) => path.toLowerCase().endsWith(ext));
    if (found) state.activeFile = found;
    else {
      const newPath = { python: 'main.py', html: 'index.html', css: 'style.css', javascript: 'script.js' }[language];
      state.files[newPath] = '';
      state.activeFile = newPath;
    }
    setEditorValue(state.files[state.activeFile]);
    editor?.setOption('mode', codeMirrorModes[language]);
    updateFileUI(); saveBrowserState();
  }
  function addFile() {
    const path = prompt('New file path (example: src/app.js):', 'src/new-file.js');
    if (!path) return;
    const clean = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.split('/').some((part) => !part || part === '..') || clean in state.files) { alert('Please enter a valid, unused file path.'); return; }
    state.files[clean] = '';
    const pieces = clean.split('/'); pieces.pop();
    let prefix = ''; pieces.forEach((piece) => { prefix = prefix ? `${prefix}/${piece}` : piece; if (!state.folders.includes(prefix)) state.folders.push(prefix); });
    openFile(clean);
  }
  function addFolder() {
    const path = prompt('New folder path (example: src/components):', 'src/components');
    if (!path) return;
    const clean = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!clean || clean.split('/').some((part) => !part || part === '..')) { alert('Please enter a valid folder path.'); return; }
    if (!state.folders.includes(clean)) state.folders.push(clean);
    let prefix = ''; clean.split('/').forEach((piece) => { prefix = prefix ? `${prefix}/${piece}` : piece; if (!state.folders.includes(prefix)) state.folders.push(prefix); });
    renderTree(); saveBrowserState();
  }
  function deleteCurrentFile() {
    if (Object.keys(state.files).length <= 1) return;
    const path = state.activeFile;
    if (!confirm(`Delete ${path}? This cannot be undone.`)) return;
    delete state.files[path];
    state.activeFile = Object.keys(state.files).sort()[0];
    state.language = detectLanguage(state.activeFile);
    setEditorValue(state.files[state.activeFile]);
    editor?.setOption('mode', codeMirrorModes[state.language]);
    updateFileUI(); saveBrowserState();
  }
  function appendConsole(value, kind = 'log') {
    const text = typeof value === 'string' ? value : (() => { try { return JSON.stringify(value, null, 2); } catch { return String(value); } })();
    consoleLines.push({ text, kind });
    $('console-output').textContent = consoleLines.map((line) => line.text).join('\n') || 'No output.';
    setOutputTab('console');
  }
  function clearConsole() { consoleLines = []; $('console-output').textContent = 'Console cleared.'; }
  function findProjectFile(names) {
    return names.map((name) => state.files[name]).find((content) => typeof content === 'string') || '';
  }
  function escapeScript(code) { return String(code).replace(/<\/script/gi, '<\\/script'); }
  function makePreviewDocument() {
    let html = state.language === 'html' && /\.html?$/i.test(state.activeFile) ? getEditorValue() : (state.files['index.html'] || findProjectFile(Object.keys(state.files).filter((path) => path.toLowerCase().endsWith('.html'))));
    if (!html.trim()) html = '<!doctype html><html><head><meta charset="UTF-8"></head><body><h1>Start building your page</h1></body></html>';
    const css = state.language === 'css' && state.activeFile.endsWith('.css') ? getEditorValue() : findProjectFile(['style.css', 'src/style.css', 'styles.css']);
    const js = state.language === 'javascript' && /\.m?js$/i.test(state.activeFile) ? getEditorValue() : findProjectFile(['script.js', 'src/script.js', 'main.js']);
    html = html.replace(/<link\b[^>]*href=["'][^"']+\.css[^"']*["'][^>]*>/gi, '');
    html = html.replace(/<script\b[^>]*src=["'][^"']+\.m?js[^"']*["'][^>]*><\/script>/gi, '');
    const styleBlock = `<style>\n${css}\n</style>`;
    const bridge = `const __send=(kind,args)=>parent.postMessage({source:'codeora-preview',kind,args:Array.from(args||[]).map(v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch(e){return String(v)}})},'*');\n['log','info','warn','error'].forEach(k=>{const old=console[k];console[k]=(...args)=>{__send(k,args);old.apply(console,args)}});\nwindow.addEventListener('error',e=>__send('error',[e.message+' at line '+e.lineno]));`;
    const scriptBlock = `<script>\n${escapeScript(bridge)}\n${escapeScript(js)}\n<\/script>`;
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${styleBlock}</head>`); else html = `${styleBlock}${html}`;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${scriptBlock}</body>`); else html += scriptBlock;
    return html;
  }
  function runPreview() {
    clearConsole();
    $('console-output').textContent = 'Starting preview…';
    $('live-preview').srcdoc = makePreviewDocument();
    setOutputTab('preview');
    setStatus('Preview updated');
  }
  window.addEventListener('message', (event) => {
    if (event.source !== $('live-preview').contentWindow || event.data?.source !== 'codeora-preview') return;
    const args = Array.isArray(event.data.args) ? event.data.args.join(' ') : '';
    appendConsole(args, event.data.kind || 'log');
  });

  async function ensurePyodide() {
    if (pyodideInstance) return pyodideInstance;
    if (window.loadPyodide && !pyodidePromise) {
      pyodidePromise = window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' });
    }
    if (!window.loadPyodide && !pyodidePromise) {
      pyodidePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js';
        script.onload = () => window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' }).then(resolve, reject);
        script.onerror = () => reject(new Error('Python runtime could not load. Connect to the internet and try again.'));
        document.head.append(script);
      });
    }
    pyodideInstance = await pyodidePromise;
    return pyodideInstance;
  }
  async function runPython() {
    clearConsole(); appendConsole('Loading Python runtime…');
    $('runtime-status').textContent = 'Loading Python runtime';
    try {
      const pyodide = await ensurePyodide();
      clearConsole();
      pyodide.setStdout({ batched: (message) => appendConsole(message) });
      pyodide.setStderr({ batched: (message) => appendConsole(message, 'error') });
      await pyodide.runPythonAsync(getEditorValue());
      $('runtime-status').textContent = 'Python ready · browser runtime';
      setOutputTab('console'); setStatus('Python finished');
    } catch (error) {
      appendConsole(error?.message || String(error), 'error');
      $('runtime-status').textContent = 'Python runtime needs internet';
      setOutputTab('console'); setStatus('Python run failed', true);
    }
  }
  function runCode() {
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    saveBrowserState();
    if (state.language === 'python' || state.activeFile.endsWith('.py')) runPython();
    else runPreview();
  }

  function createFileHandle(rootHandle, relativePath, create) {
    const pieces = relativePath.split('/').filter(Boolean);
    const fileName = pieces.pop();
    return pieces.reduce((promise, folder) => promise.then((handle) => handle.getDirectoryHandle(folder, { create })), Promise.resolve(rootHandle))
      .then((directory) => directory.getFileHandle(fileName, { create }));
  }
  async function saveToHandle(rootHandle) {
    for (const [path, content] of Object.entries(state.files)) {
      const fileHandle = await createFileHandle(rootHandle, path, true);
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    }
  }
  async function saveToLaptop() {
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    saveBrowserState();
    if (!window.showDirectoryPicker) {
      alert('Folder saving is not supported in this browser. Open Codeora in Chrome or Edge on localhost/HTTPS, or use Download project.');
      return;
    }
    try {
      if (!activeDirectoryHandle) {
        const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
        activeDirectoryHandle = await parent.getDirectoryHandle('codeora-project', { create: true });
      }
      const permission = await activeDirectoryHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted' && await activeDirectoryHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Folder permission was not granted.');
      await saveToHandle(activeDirectoryHandle);
      $('runtime-status').textContent = 'Saved to laptop folder';
      setStatus('Saved to codeora-project');
      alert('Project saved to the codeora-project folder. You can open that folder in VS Code.');
    } catch (error) {
      if (error.name !== 'AbortError') { setStatus(error.message || 'Folder save failed', true); alert(error.message || 'Could not save the project folder.'); }
    }
  }
  async function readDirectory(directory, prefix = '') {
    for await (const [name, handle] of directory.entries()) {
      if (['node_modules', '.git', 'dist', '.venv', '__pycache__'].includes(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        state.folders.push(path);
        await readDirectory(handle, path);
      } else if (handle.kind === 'file' && state.files && Object.keys(state.files).length < 160) {
        const file = await handle.getFile();
        if (file.size > 1024 * 1024) continue;
        try { state.files[path] = await file.text(); } catch { /* binary files are not editable here */ }
      }
    }
  }
  async function openFolder() {
    if (!window.showDirectoryPicker) { alert('Folder access needs Chrome or Edge on localhost/HTTPS.'); return; }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.files = {}; state.folders = [];
      await readDirectory(handle);
      if (!Object.keys(state.files).length) { state = defaultState(); }
      activeDirectoryHandle = handle;
      state.activeFile = Object.keys(state.files).sort().find((path) => /index\.html$/i.test(path)) || Object.keys(state.files).sort()[0];
      state.language = detectLanguage(state.activeFile);
      setEditorValue(state.files[state.activeFile]);
      editor?.setOption('mode', codeMirrorModes[state.language]);
      updateFileUI(); saveBrowserState();
      $('project-root-name').textContent = 'OPENED FOLDER';
      $('runtime-status').textContent = 'Folder opened';
    } catch (error) {
      if (error.name !== 'AbortError') alert(error.message || 'Could not open this folder.');
    }
  }
  async function downloadProject() {
    if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
    saveBrowserState();
    if (window.JSZip) {
      const zip = new window.JSZip();
      Object.entries(state.files).forEach(([path, content]) => zip.file(path, content));
      (state.folders || []).forEach((folder) => zip.folder(folder));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'codeora-project.zip'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus('Project ZIP downloaded');
      return;
    }
    let count = 0;
    Object.entries(state.files).forEach(([path, content]) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = path.replaceAll('/', '__'); anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); count += 1;
    });
    alert(`${count} project files are being downloaded separately. For a folder-preserving ZIP, connect to the internet and retry.`);
  }
  function handleTerminal(command) {
    const value = command.trim();
    const lower = value.toLowerCase();
    const output = $('terminal-output');
    const write = (text) => { output.textContent += `\n${text}`; output.scrollTop = output.scrollHeight; };
    write(`$ ${value}`);
    if (!value) return;
    if (lower === 'help') write('Available: help, ls, pwd, clear, run, npm init -y.\nPython/JavaScript run from the Run button. Save the folder to use real npm in your laptop terminal.');
    else if (lower === 'clear') output.textContent = '';
    else if (lower === 'pwd') write('/codeora-project');
    else if (lower === 'ls' || lower === 'dir') write(Object.keys(state.files).sort().join('   ') || '(empty folder)');
    else if (lower === 'run') runCode();
    else if (lower === 'npm init -y') {
      if (!state.files['package.json']) { state.files['package.json'] = JSON.stringify({ name: 'codeora-project', version: '1.0.0', private: true, scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' } }, null, 2); write('Created package.json in the Codeora workspace.'); }
      else write('package.json already exists in this project.');
      openFile('package.json');
    }
    else if (lower.startsWith('npm install')) write('A real npm/Node.js process cannot run inside this browser-only editor. Use Save to laptop, open the folder in VS Code, then run npm install in its terminal.');
    else if (lower.startsWith('python ') || lower.startsWith('python3 ') || lower.startsWith('node ')) write('Use the Run button to execute the current Python or JavaScript file in the browser runtime.');
    else write(`Command not available in the browser terminal: ${value}\nType help for supported workspace commands.`);
  }

  function initializeEditor() {
    const textarea = $('code-editor');
    textarea.value = state.files[state.activeFile] || '';
    if (window.CodeMirror) {
      editor = window.CodeMirror.fromTextArea(textarea, {
        mode: codeMirrorModes[state.language],
        lineNumbers: true,
        lineWrapping: false,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        autoCloseBrackets: true,
        matchBrackets: true,
        viewportMargin: 20,
        extraKeys: { 'Ctrl-S': () => saveToLaptop(), 'Cmd-S': () => saveToLaptop() }
      });
      editor.on('change', markDirty);
      editor.on('cursorActivity', () => { const cursor = editor.getCursor(); $('cursor-position').textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`; });
    } else {
      textarea.addEventListener('input', markDirty);
      textarea.addEventListener('keyup', () => $('cursor-position').textContent = `Ln ${textarea.value.slice(0, textarea.selectionStart).split('\n').length}, Col ${textarea.selectionStart - textarea.value.lastIndexOf('\n', textarea.selectionStart - 1)}`);
      setStatus('Basic editor · syntax colors require internet');
    }
  }
  function indentCode() {
    if (editor) {
      const selections = editor.listSelections();
      editor.operation(() => selections.forEach((selection) => {
        const first = Math.min(selection.anchor.line, selection.head.line);
        const last = Math.max(selection.anchor.line, selection.head.line);
        for (let line = first; line <= last; line += 1) editor.indentLine(line, 'add');
      }));
    } else {
      const area = $('code-editor');
      const start = area.selectionStart; area.setRangeText('    ', start, start, 'end'); markDirty();
    }
  }

  function bindEvents() {
    $('language-picker').addEventListener('change', (event) => changeLanguage(event.target.value));
    document.querySelectorAll('.mode-button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    document.querySelectorAll('[data-output-tab]').forEach((button) => button.addEventListener('click', () => setOutputTab(button.dataset.outputTab)));
    document.querySelectorAll('[data-language-shortcut]').forEach((button) => button.addEventListener('click', () => changeLanguage(button.dataset.languageShortcut)));
    $('run-code-btn').addEventListener('click', runCode);
    $('save-folder-btn').addEventListener('click', saveToLaptop);
    $('editor-save-btn').addEventListener('click', saveToLaptop);
    $('open-folder-btn').addEventListener('click', openFolder);
    $('new-file-btn').addEventListener('click', addFile);
    $('new-folder-btn').addEventListener('click', addFolder);
    $('explorer-new-file').addEventListener('click', addFile);
    $('explorer-new-folder').addEventListener('click', addFolder);
    $('download-project-btn').addEventListener('click', downloadProject);
    $('delete-file-btn').addEventListener('click', deleteCurrentFile);
    $('format-code-btn').addEventListener('click', indentCode);
    $('insert-practice-starter').addEventListener('click', () => {
      setEditorValue(practiceTasks[state.language].starter);
      if (editor) editor.focus(); else $('code-editor').focus();
      markDirty();
    });
    $('clear-console-btn').addEventListener('click', clearConsole);
    $('terminal-toggle').addEventListener('click', () => {
      const body = $('terminal-body'); body.hidden = !body.hidden;
      $('terminal-toggle').setAttribute('aria-expanded', String(!body.hidden));
      $('terminal-toggle').lastElementChild.textContent = body.hidden ? '⌄' : '⌃';
    });
    $('terminal-form').addEventListener('submit', (event) => {
      event.preventDefault(); const input = $('terminal-input'); handleTerminal(input.value); input.value = '';
    });
    window.addEventListener('beforeunload', () => {
      if (editor && state.activeFile) state.files[state.activeFile] = editor.getValue();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* browser storage may be unavailable */ }
    });
  }

  initializeEditor();
  bindEvents();
  updateFileUI();
  setMode(state.mode);
  setOutputTab(state.outputTab);
  saveBrowserState();
})();
