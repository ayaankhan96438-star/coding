# CodeBolt course navigation update

## Changes

- Every SQL lesson and topic can be opened directly; completing previous lessons is not required. Premium restrictions remain attached to individual questions.
- The practice page records the active lesson and topic in the URL. A browser refresh returns to the first available question in that same topic while retaining solved progress, XP, streaks, and badges.
- Basic SQL query topics are ordered: SELECT Statement, WHERE Clause, LIKE Operator, ORDER BY, DISTINCT & LIMIT. BETWEEN & IN remains in Foundation · Filtering & Conditions.
- The Continue button advances to the next topic without requiring all questions in the current topic to be solved. The Lessons menu remains available for direct navigation.

## Verification

- `node --check app.js`
- `node tests/lesson-navigation.test.mjs`
- `node tests/sql-practice-flow.test.mjs`
- `node tests/progress-state.test.mjs`
- `node tests/sql-answer-checker.test.mjs`
- `python tests/sql-question-audit.test.py` (100 SQL reference solutions; 9 tests)
- `python tests/python-question-audit.test.py` (95 Python reference solutions)

All listed checks passed. A live browser end-to-end test was not performed.
