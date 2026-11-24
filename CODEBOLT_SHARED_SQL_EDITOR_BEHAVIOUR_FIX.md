# CodeBolt — Shared SQL Editor Behaviour Fix

## Corrected behaviour

- The practice screen uses one shared SQL query editor across all questions.
- When an answer passes and the app auto-advances, the editor retains the exact SQL text from the previous question.
- The app does not clear, replace, or load a different question-specific query automatically.
- The learner must manually select and delete the previous SQL before entering the next answer.
- The shared editor value is saved under `codebolt-sql-shared-editor-v1` so the same in-progress text survives ordinary question navigation and reloads.
- Existing per-question draft values are read only once as a migration fallback when no shared editor value exists.
- The question prompt / answer checking continues to change with the selected question; only the SQL textarea content remains shared.

## UI feedback

When a new unanswered question opens while the editor contains SQL, a reminder says that the previous SQL remains in the shared editor and must be deleted manually before writing the next answer.

## Files changed

- `app.js` — shared editor persistence and question navigation behaviour.
- `sql-practice-flow.mjs` — shared-editor draft helpers.
- `practice.html` — cache-busting version for the updated app module.
- `tests/sql-practice-flow.test.mjs` — shared-editor retention regression tests.
- `tests/sql-question-audit.test.py` — UI contract assertions updated for shared editor behaviour.

## Verification

Passed:
- JavaScript syntax checks for `app.js` and `sql-practice-flow.mjs`.
- SQL practice flow tests (semicolon gate, progression order, shared-editor retention and manual deletion semantics).
- SQL answer checker tests.
- Progress state tests.
- Python question audit: 95/95 reference solutions.
- SQL question audit: 100/100 reference solutions plus all 9 SQL regression tests.

No live browser end-to-end test was performed in this update.
