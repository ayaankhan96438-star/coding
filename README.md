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


## Empty SQL editor and course reset

- Lesson SQL editors now open empty so learners write the complete query themselves.
- The SQL Playground editor also starts empty.
- The practice header includes a dedicated **Reset progress** action with a confirmation step.
- Confirming clears all solved/attempted question states and XP locally, syncs the reset snapshot to the signed-in learner's Firestore record, and returns practice to Lesson 1 / Question 1.
- A normal browser refresh still preserves progress; learners can deliberately clear it with **Reset progress**.
