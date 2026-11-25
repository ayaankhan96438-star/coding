# CodeBolt SQL Preview Performance Fix

## Scope
Only the SQL result-preview speed and flicker behaviour were changed.

## Changes
- Single, read-only `SELECT ...;` previews execute synchronously against the already-loaded SQL.js database.
- The preview debounce is 20 ms (rather than 350 ms).
- Incomplete SQL keeps the last successful preview visible; the source table returns only when the learner clears the editor.
- Re-rendering a question preserves the current query preview instead of painting the full source table over it.
- On automatic question navigation, the retained shared SQL is re-applied to the newly loaded task database before any source-table fallback is shown.
- DML/DDL and multi-statement previews use a fast isolated SQL.js snapshot from the live database export, avoiding full database re-seeding and keeping the active task database safe.

## Files changed
- `public/app.js`
- `public/database.js`
- `tests/sql-question-audit.test.py`

## Verification
- `node --check public/app.js`
- `node --check public/database.js`
- `npm test` (5/5 suites passed)
- `npm run test:python` (10 SQL audit tests and 95 Python reference-solution tests passed)

A browser-based timing benchmark was not run in this environment. The 20 ms debounce is configured, and simple SELECT execution no longer rebuilds or reseeds the database on each input.
