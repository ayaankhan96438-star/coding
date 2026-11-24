# CodeBolt beginner-friendly question wording update

## Scope
Updated the visible title and task description for all 95 Python questions across the 19 existing topics.

## Writing changes
- Replaced vague labels such as "first Python statement" with direct action titles.
- Rewrote descriptions in plain beginner-friendly English.
- Each description now explains what to create, what to do with it, and what to display/check.
- Added small examples where they help explain syntax or expected action.
- Clarified beginner concepts such as comments, variables, indexes, loops, functions, lambda, modules, exceptions, and files.

## Preserved
- All 19 topics and 95 question IDs.
- Every validation rule and flexible-grading requirement.
- All reference solutions, hints, expected outputs, starter code, and input data.
- Existing CodeBolt styling, navigation, runner, progress behavior, and other site pages.

## Verification
- 19 topic JSON files found.
- Exactly 5 questions per topic (95 total).
- All JSON files parse successfully.
- Compared against the previous beginner-flexible-grading ZIP: only `title` and `description` were changed in question records; all other fields are byte-semantically unchanged.
- ZIP integrity checked after packaging.

This update changes question wording, not the Python grader or lesson logic.
