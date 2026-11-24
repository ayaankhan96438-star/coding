# CodeBolt SQL practice follow-up fixes

## Requested behaviour implemented

1. A SQL answer cannot be marked correct until the complete editor input ends with a semicolon (`;`). The same rule applies to automatic checks and the manual Check answer button. Pressing Enter still inserts a new line; it does not submit.
2. Each question has its own saved SQL draft in browser local storage. Typing, checking, completing, or navigating away saves the current question's exact text. Solving no longer clears the editor. Switching to another question restores that question's own draft, so one question's answer never replaces another's.
3. After a newly completed question, automatic navigation chooses the first unlocked unanswered question in course order, not merely the question after the current index. For Q1/Q3/Q5 already solved, solving Q2 moves to Q4.
4. For already-solved questions from a previous version that did not retain the user's SQL, the reference solution is shown as a fallback until the learner edits/saves a personal draft.

## Regression coverage

- Semicolon missing, present, multiline/trailing whitespace, and trailing comment cases.
- Out-of-order completion Q1/Q3/Q5 -> Q2 -> Q4.
- Separate saved drafts for Q1 and Q2, plus intentionally cleared drafts.
- Existing 100 SQL solution audit and Python audit.
