# Codeora — Interactive SQL Learning

A browser-based SQL learning course built with vanilla HTML, CSS and JavaScript. The first five beginner lessons practice SQL against one consistent `school` table with eight student records.

## Run on Kali Linux

```bash
cd /home/coding1
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Beginner lessons: school table

The first five lessons use the same simple `school` table with eight records and five columns: `id`, `student`, `teacher`, `marks`, and `class`. Every question, hint, example, answer and table preview in these lessons uses those exact fields.

Lesson 1 introduces `SELECT`; Lesson 2 practices `DISTINCT` and `LIMIT`; Lesson 3 uses `WHERE`; Lesson 4 combines simple conditions; Lesson 5 sorts student marks and names. Each lesson has five Free and five Premium questions.

## Branding

The course shell now uses the **Codeora** name and the new custom Codeora path-mark logo (`codeora-logo.svg`) in the header and browser tab.

## Existing functionality

- Interactive Tutorial remains a popover with sections and topics.
- The selected question determines which table is previewed above the SQL editor.
- Press Enter to check a query; Shift+Enter inserts a new line.
- Reset restores a clean sample database for the selected question.
- Five Free tasks must be solved to unlock the next lesson.
- Progress and XP remain stored in browser localStorage.

## Technical notes

- SQL execution uses SQL.js 1.10.3 from cdnjs, so an internet connection is needed for the engine to load.
- Premium tasks are front-end locked only. Real subscription security requires server-side authentication and entitlement checks.


## Latest interface update — 22 November 2026

- Fixed Interactive Tutorial section selection with a dedicated click handler on the persistent tutorial menu. Selecting one of the seven sections now updates the topic list without closing the menu.
- Topic selection and the tutorial close control are handled by the same menu-level event delegate, while clicks outside the menu still close it.
- Expanded the course canvas to use the full browser width. The exercise table/editor and task panel now use the available horizontal space, and the tutorial menu is wider on desktop while remaining responsive on smaller screens.
- Added a version query to the course CSS and app module URLs so browsers request the updated assets after extraction.


## Re-extracting this update without stale browser assets

This package uses a fresh cache-busting version (20261122-codeora-brand-01) on its local CSS, JavaScript and logo references. After extraction, stop any old server and open the versioned URL directly:

```bash
fuser -k 5173/tcp 2>/dev/null || true
cd /home/coding1
python3 -m http.server 5173
```

Open `http://localhost:5173/index.html?fresh=20261122-codeora-brand-01` and hard-refresh once. This avoids a previously cached `/` document reusing old asset URLs.


## Beginner sample dataset correction

The first five lessons now use one beginner-friendly `school` table with eight students and the columns `id`, `student`, `teacher`, `marks`, and `class`. The question prompts, hints, examples, expected queries, and visible table preview use those same names. The existing question IDs are preserved so saved progress remains attached to the same question positions. Other supporting tables remain for later lessons and the project tools.


## SQL and Python track navigation

The dark full-width top navigation bar has been removed. Simple, visible SQL and Python text links now sit directly below the Codeora logo and tagline on the SQL course page. SQL returns to `index.html`; Python opens the intentionally blank `python.html` placeholder. The first four Foundation lessons progress in this order: SELECT Statement → WHERE Clause → ORDER BY → DISTINCT & LIMIT. Existing question IDs and saved progress keys are preserved.


## Account sign-in and cloud progress (Firebase setup required)

Codeora now includes `login.html` with Google (including Gmail accounts), Facebook, GitHub, email/password, and phone/SMS verification flows. Authentication is wired to Firebase Authentication. A signed-in learner's progress, XP, streak, selected question, bookmarks, and profile are stored in that learner's own Cloud Firestore document. Existing local progress is imported to the first account signed in on that browser once.

**Important:** OAuth and SMS sign-in cannot work until the site owner connects a Firebase project and enables the matching sign-in providers. The included `firebase-config.js` intentionally contains placeholders, not fake credentials. See `FIREBASE_SETUP.md` and deploy `firestore.rules` before inviting learners. Google and Gmail are the same Google sign-in provider; there is no separate Gmail OAuth option.

## Question resume behavior

Correct answers remain marked as completed after refresh or reopening. The practice page resumes at the next unfinished unlocked question. If a learner has completed every free question in a lesson, the page continues to show the lesson-complete state and the next-lesson action.

## Codeora monogram update — 22 November 2026

The shared `codeora-logo.svg` asset is the selected C + O orbital monogram. It is used by the site header, sign-in page, and browser favicon through the existing shared asset references. The SVG is vector-based and scales cleanly at small and large sizes. Cache-busting references were updated so browsers fetch the new artwork.

## Original Codeora monogram asset

The selected brand mark is concept #7 from the first Codeora logo sheet: a deep-green hexagon enclosing a dark lowercase C and code symbol. The mark is extracted from the supplied concept artwork and embedded in `codeora-logo.svg`; the `DIGITAL PRODUCTS` tagline is intentionally omitted from the brand lockup.

## Login controls and Firebase activation

The login screen keeps Google, Facebook, GitHub, email/password, signup-toggle, forgot-password, and phone OTP controls interactive even before Firebase is configured. Until `firebase-config.js` contains the real Firebase Web App settings and the providers are enabled in Firebase Authentication, submissions show an explicit setup message; the site never fakes a successful login. See `FIREBASE_SETUP.md` for the one-time setup.


## Latest task reset and browser refresh behavior

- Lesson SQL editors and the SQL Playground open blank.
- The editor button is **Reset progress** and resets only the currently selected question, including that question's attempts and its one-time XP award. Other question progress remains intact.
- A real browser reload/refresh (F5 or the browser refresh button) deliberately clears all question completion and gamification progress on this device and, when signed in, writes the cleared state to the learner's Firestore progress document. Normal navigation between Codeora pages does not clear progress.
- The course header action is labelled **Lessons**.
- The reset button is bound directly after each editor render so it remains active after changing questions.


## Languages Studio (Python, HTML, CSS and JavaScript)

Open `python.html` (the navigation label is **Languages**) to use the Codeora Languages Studio. The page follows the existing SQL course colour and typography system and provides:

- A CodeMirror editor with line numbers, language modes, bracket matching, indentation and a fallback plain editor if the editor CDN is unavailable.
- Python execution in the browser through Pyodide (the first Python run downloads its runtime; an internet connection is needed for that first load).
- HTML, CSS and JavaScript together in an isolated live-preview iframe, plus a console output panel.
- Practice and Build Project modes, starter exercises, a default `codeora-project` file tree, new files/folders, and language switching.
- Browser autosave using local storage. **Save to laptop** uses the browser's File System Access API: in Chrome/Edge on `localhost` or HTTPS, choose a parent folder and Codeora writes a `codeora-project` folder with its real file/folder structure. **Open folder** imports an existing project folder. The alternative Download project action creates a ZIP when JSZip is available.
- A starter `package.json`, `.vscode/extensions.json` and README for continuing in desktop VS Code.

### Important browser/runtime boundaries

This is a browser IDE, not a full desktop VS Code installation. The browser can run Python via Pyodide and HTML/CSS/JavaScript preview, but it cannot start arbitrary local OS processes or run a real Node/npm installation inside the page. Save the project to the laptop, open it in desktop VS Code, then run `npm install` and `npm run dev` in the local terminal to install/use npm packages. The built-in terminal explains this rather than pretending to execute native commands. Folder read/write access requires an explicit user folder selection and browser permission.

## Languages Studio workspace update

- The Languages page uses a full-width bottom panel spanning the editor and project preview columns.
- Bottom panel tabs: Problems, Output, Debug Console, and Terminal.
- New Terminal creates a separate browser-workspace terminal session; Split Terminal displays two sessions side by side.
- The shell selector distinguishes the browser workspace command runner from Bash on the local laptop. A browser page cannot launch a user's OS shell; save the project and open it in VS Code to use real Bash and npm.
- The SQL landing page no longer flashes the temporary “Loading your SQL lesson…” placeholder or the tagline footer while its lesson module starts.
- The SQL Lessons shortcut is omitted from the Languages page header.
