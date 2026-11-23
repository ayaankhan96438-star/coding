# CodeBolt Python Question Audit

All 95 reference solutions were executed in isolated temporary folders, with the configured input supplied to each question. Every reference solution now runs and produces its displayed expected output. The Python AST feature requirements were also checked against all 95 solutions.

## Question and answer corrections
- Topic 01 Q5: multiplication now uses 4 * 3 and shows 12.
- Topic 02 Q3-Q4: sample output now includes both a name and age, and a complete sentence.
- Topic 03 Q2: the prompt explicitly sets score to 10, updates the same variable by adding 5, then prints 15. The checker rejects output printed before the update.
- Topic 04 Q5 and Topic 05 Q3: conversions and remainder calculations now use the exact values stated in the questions.
- Topic 06 Q5: the sample doubles the decimal input using * 2, not * 1.5.
- Topic 07 Q4-Q5: slicing returns exactly three letters; the reverse example uses a word that looks different backwards.
- Topic 08 Q1-Q3: list examples now use fruits, the first list item is accessed with index 0, and append adds a fruit.
- Topic 09 Q1-Q2: the tuple example contains colours and the second item uses index 1.
- Topic 10 Q1-Q2 and Q4-Q5: set tasks describe sorted output accurately, because sorted() returns a list for stable display.
- Topic 11 Q1 and Q3: tasks asking to print the whole dictionary now print the whole updated dictionary.
- Topic 12 Q1: positive, negative and zero are handled by separate if/elif/else branches.
- Topic 13 Q3: the loop now prints the letters in Python, not CAT.
- Topic 14 Q2-Q5: countdown, sum, doubling limit and digit-count examples now match their prompts.
- Topic 16 Q1, Q3 and Q5: lambda examples now add 5, sort the named strings by length, and double values rather than squaring them.
- Topic 17 Q4: date.today() prints the actual current date rather than a hard-coded old date.
- Topic 18 Q1: the invalid text is hello, matching the prompt.
- Topic 19 Q1-Q2: the write/read/append tasks use the same filename throughout.

## Checker improvements
- Both single-quoted ('text') and double-quoted ("text") Python strings are accepted. Python already treats these as equivalent syntax; the editor now tells learners this explicitly.
- Selected tasks with exact, fixed results now compare the actual output with the expected answer. Open-ended tasks remain flexible.
- The variable update task specifically checks for 15, so printing the old value 10 before updating it does not pass.

## Verification
- 19 question JSON files parsed successfully.
- 95/95 reference solutions executed and matched their expected outputs (the current-date task was checked for YYYY-MM-DD format).
- All 95 AST feature rules were checked; no sample solution is missing a required feature.
- Both quote styles and variable-update order passed regression tests.
- Existing progress-state tests passed.
