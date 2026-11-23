# CodeBolt — Beginner questions and flexible answer checking

## What changed
- Rewrote all 95 Python practice prompts in beginner-friendly language across the same 19 topics (5 questions per topic).
- Set every question's level label to Beginner.
- Replaced the fixed expected-output equality check with question-specific validation rules.
- The runner executes the learner's actual Python code, reports Python syntax/runtime errors, inspects the Python AST for the required concept, and checks the required output shape (for example: any non-empty text, a number, a Boolean, one line, or multiple lines).
- `expectedOutput` is now presented as **Example Output · One possible result**, not as the only accepted answer.
- For open-ended Print Function tasks, any non-empty text/value from a valid `print(...)` call is accepted; the wording, name, capitalization, and punctuation do not have to match the reference solution. The number task accepts any numeric output, e.g. `print(100)`.
- Invalid Python syntax is still rejected and the runner shows the real error. For example, omitting the parentheses in `print Ayaan Khan` raises a SyntaxError in Python 3, while `print("Ayaan Khan")` is valid.
- Reference solutions, explanations, common mistakes, and beginner hints remain available for all 95 questions.

## Checks performed
- Exactly 19 topic files and 5 questions per topic (95 total).
- Every question has a validation rule and a reference solution.
- All 95 reference solutions execute and pass their new question-specific validator in local Python checks.
- Explicit open-ended tests pass: `print("Hello World!")`, `print("hello python")`, `print("Ayaan Khan")`, `print(100)`, and `print("Ayaan", "Khan")`.
- Invalid `print Ayaan Khan` syntax is rejected by Python's parser.
- JavaScript syntax checks pass for `python-practice.js` and `python-worker.js`.
- The embedded Python AST-analysis wrapper parses successfully.

## Grading behavior
The checker no longer compares the learner's complete output to one hard-coded `expectedOutput`. It checks the concept stated in the question and validates the produced output's shape. Alternative implementations are accepted when they use the required concept and run successfully. For example, string joining may use `+`, an f-string, or `join()` where the question allows those approaches.

## Runtime note
Pyodide continues to load from the existing CDN. The persistent worker is reused; this update does not require a build step.
