# CodeBolt Python Practice — current curriculum

- The Python practice area has 19 requested topics and 5 questions per topic (95 questions total).
- The workspace uses a two-column layout: editor, Run, Reset, solution and output on the left; the topic/question bank on the right.
- The question bank is designed for beginners. All 95 question levels now display Beginner.
- Question completion is session-only; refreshing the page resets solved indicators.
- The Run button executes Python through a persistent Pyodide Web Worker. The worker is initialized in the background and reused.
- Every question includes a reference solution, hints, explanation and common mistakes.

## Latest grading changes

- Rewrote all 95 descriptions and hints in clear, beginner-oriented language.
- Replaced one-exact-output matching with task-specific checks: valid Python execution, required Python concepts (AST checks), and useful output shape.
- Example output is illustrative only. It is not the only accepted answer.
- Open-ended print tasks accept different text, names, capitalization, punctuation and numbers as long as the task's print requirement is met. For example, the first print task accepts `print("Hello World!")`, `print("hello python")`, or `print("Ayaan Khan")`; the number task accepts `print(100)`.
- Syntax/runtime errors are still reported. For example, omitting parentheses in `print Ayaan Khan` is invalid Python 3 syntax, while `print("Ayaan Khan")` is valid.
- Where a task asks for a particular concept (for example a for loop, addition, or list append), the checker verifies that concept instead of comparing against one fixed sample output. Multiple idiomatic approaches are allowed where the task says so.

## Latest checks
- 19 topic records and exactly 5 questions each (95 total).
- All 95 reference solutions pass their corresponding validators in local Python checks.
- Explicit beginner print cases passed: `print("Hello World!")`, `print("hello python")`, `print("Ayaan Khan")`, `print(100)`, and `print("Ayaan", "Khan")`.
- Invalid `print Ayaan Khan` syntax is rejected by the Python parser.
- `node --check` passes for `python-practice.js` and `python-worker.js`.
- The embedded Python worker wrapper parses successfully.
- Existing progress-state test passes.

## Runtime note
Pyodide loads from the existing public CDN, so first use needs an internet connection. The project remains vanilla HTML/CSS/JS with no build step.
