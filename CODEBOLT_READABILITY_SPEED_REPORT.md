# CodeBolt Readability + Runner Speed Update

## Changes
- Removed the Home, Dashboard, Lessons, Practice, Study, Tools, and My Learning items from the shared header.
- Kept CodeBolt branding, SQL/Languages track links, account link, and the SQL All topics action when the SQL workspace is present.
- Increased Python practice text sizes and contrast across page headings, descriptions, question bank, labels, controls, output, solution panel, and code editor.
- Updated the certificate page to use the same injected shared header.
- Updated the Python bookmarks page to load the current 19-topic dataset instead of assuming 42 topics.
- Changed the Python runner to initialize Pyodide in a persistent Worker as soon as the page loads and reuse that warmed runtime for subsequent Run actions.
- Moved the five-second execution timeout to begin when the Python code actually starts, not while Pyodide is downloading/initializing.
- Added cache-busting versions for the shared header, Python styles/scripts, and Python Worker.

## Verification
- JavaScript syntax checks passed for `site-header.js`, `python-practice.js`, and `python-worker.js`.
- Confirmed 19 topics and 95 questions (5 per topic), with required solution/explanation fields.
- All 95 reference solutions matched their expected outputs in local Python execution.
- Simulated Worker protocol confirmed one Pyodide initialization serves two consecutive Run requests.
- Confirmed shared header loads before `account-bootstrap.js` on the pages using both.
- ZIP integrity verified after packaging.

## Limitations
- A real-network Pyodide download and measured cold/warm browser timings were not available in this environment. Pyodide still requires internet on first load; subsequent runs reuse the already-loaded runtime.
- A headless Chromium screenshot attempt did not complete, so visual inspection in a real browser is still recommended.
