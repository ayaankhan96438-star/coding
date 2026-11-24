# CodeBolt SQL Practice Bugfix Report

## Practice answer checking
- Grading compares the result sets / resulting database state, not the literal SQL string.
- Equivalent `WHERE` expressions are accepted when they return the same rows.
- Aliases and selected-column order do not cause a false rejection.
- Row order is ignored unless a question explicitly asks for an order. Required `ORDER BY` direction is checked for ranking/alphabetical questions; valid tie-breakers are allowed.
- DML tasks compare the table catalog, every table schema and all seven sample tables after running the learner's SQL. This prevents a broad update/delete or unrelated data changes from passing.
- DML inserts that do not specify an ID accept another valid ID. The task's actual requested field values must still match, and unrelated rows must remain unchanged.
- DDL tasks compare the user-table catalog and the requested table schema, so extra/missing columns are rejected.

## Editor and navigation
- Correct answers are checked automatically after a short pause while typing.
- Plain Enter inserts a new line; Ctrl+Shift+Enter and the optional Check answer button perform a manual check.
- A correct answer clears the editor and automatically opens the next unfinished free question.
- The solved marker is larger (30px).
- Solved questions remain clickable and can be practised again without resetting progress or awarding duplicate XP.
- Premium question text is blurred in the practice task list and the separate Solutions page.
- DML/DDL expected-output previews use compact display queries; the checker still uses the full-state verification queries.

## Validation performed
- All 100 reference SQL solutions execute against the CodeBolt sample SQLite database.
- SQL result checker tests pass for equivalent filters, aliases, selected-column order, unordered result rows, required sorting and wrong outputs.
- State-verification tests reject unintended mass deletes and extra DDL columns.
- Alternative insert IDs pass when the question does not specify an ID.
- Interaction contract tests cover auto-check, Enter behaviour, clearing, revisit and premium blur.
- Progress-state tests pass.
- Python practice regression audit passes (95 reference answers).
- JavaScript syntax checks pass.

## Limitation
The Premium blur/lock is a front-end presentation restriction. The current static project still ships lesson data to the browser; protecting Premium content from source inspection requires server-side entitlement checks and server-protected content.
