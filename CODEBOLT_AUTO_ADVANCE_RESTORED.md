# CodeBolt auto-advance regression fix

This is a targeted fix on top of the existing full Next.js migration. No pages, question content, practice engines, account features, styles, routes, or deployment files were removed.

## What changed
- Correct answers now advance to the next unanswered accessible SQL question across the whole course, not only within the current topic.
- The search starts immediately after the question just solved and wraps once at the end of the course.
- Solved questions and Premium/locked questions are skipped.
- When the next question belongs to a dedicated topic (for example LIKE, BETWEEN & IN, or text comparisons), the matching topic opens with it.
- The one shared SQL editor remains untouched during auto-advance. The learner manually deletes or edits the previous query.
- Refresh reset behaviour remains unchanged: SQL question status is cleared on full browser refresh; XP, streaks, bookmarks and profile remain.

## Regression coverage
- Q1, Q3, Q5 solved; solving Q2 selects Q4.
- Auto-advance crosses lesson/topic boundaries.
- Premium questions are skipped.
- Auto-advance wraps to an earlier unanswered free question only after reaching the end.
- All prior route, access, reset, checker, shared-editor, SQL and Python regression tests remain in place.

## Verification
- `node --check public/app.js`
- `node --check public/sql-practice-flow.mjs`
- `node --test tests/*.test.mjs`
- `python3 tests/sql-question-audit.test.py`
- `python3 tests/python-question-audit.test.py`
