# CodeBolt case-insensitive Python checker update

## Changes
- Updated `python-worker.js` to normalize Python identifiers before feature detection and execution.
- User variable names and function names are case-insensitive (`A`/`a`, `GREET`/`greet`).
- Python attribute/method names and imported aliases are case-insensitive (`APPEND`/`append`, `MATH`/`math`).
- Built-in function and exception names resolve case-insensitively (`PRINT`/`print`, `VALUEERROR`/`ValueError`).
- Boolean literals accept any casing (`True`, `TRUE`, `true`, `False`, `FALSE`, `false`).
- String contents are not case-normalized.
- Updated `python-practice.js` cache-busting version and the Boolean help text so browsers fetch the new worker.

## Important syntax note
Python grammar keywords such as `if`, `for`, `def`, `while`, and `import` remain lowercase, because they are part of Python syntax. The update is for variable/function/built-in/method names and Boolean values, not a rewrite of Python's grammar.

## Verification
- 95/95 reference solutions execute and pass their existing question validation rules.
- Verified: `PRINT("Hi")`, `A = 5; print(a)`, mixed-case function definitions/calls, `.APPEND()`, mixed-case imported module aliases, `VALUEERROR`, `TRUE`, and `false`.
- Verified malformed print syntax still errors: missing parentheses, missing closing quote/parenthesis, and an unquoted undefined name.
- `node --check` passes for `python-worker.js` and `python-practice.js`.
- ZIP integrity checked.

Only `python-worker.js` and `python-practice.js` were changed, plus this report. Question content and the other app sections were left unchanged.
