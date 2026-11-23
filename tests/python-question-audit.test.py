from __future__ import annotations

import contextlib
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "python" / "questions"


def run_solution(code: str, user_input: str = "") -> str:
    output = io.StringIO()
    previous_stdin = sys.stdin
    previous_cwd = Path.cwd()
    try:
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)
            sys.stdin = io.StringIO(user_input)
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(io.StringIO()):
                exec(compile(code, "<reference-solution>", "exec"), {"__name__": "__main__"})
    finally:
        sys.stdin = previous_stdin
        os.chdir(previous_cwd)
    return output.getvalue().rstrip("\n")


files = sorted(QUESTION_DIR.glob("*.json"))
assert len(files) == 19, f"Expected 19 topic files, found {len(files)}"
count = 0
for path in files:
    questions = json.loads(path.read_text(encoding="utf-8"))
    assert len(questions) == 5, f"{path.name} should contain five questions"
    for question in questions:
        count += 1
        actual = run_solution(question["solution"], question.get("testInput", ""))
        expected = question.get("expectedOutput", "")
        if path.name == "17-modules.json" and question["title"] == "Print today’s date":
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", actual), f"Date output is not YYYY-MM-DD: {actual!r}"
        else:
            assert actual == expected, (
                f"{path.name} / {question['title']}: expected {expected!r}, got {actual!r}"
            )

# Both ordinary Python string quote styles must run and print identical text.
assert run_solution("print('CodeBolt')") == "CodeBolt"
assert run_solution('print("CodeBolt")') == "CodeBolt"

# Updating the same variable must print the new value, not the old value.
correct_update = "score = 10\nscore = score + 5\nprint(score)"
wrong_order = "score = 10\nprint(score)\nscore = score + 5"
assert run_solution(correct_update) == "15"
assert run_solution(wrong_order) == "10"

# The browser checker must enforce exact results for flagged questions.
checker = (ROOT / "python-practice.js").read_text(encoding="utf-8")
assert "rule.matchExpected" in checker
assert "normalizeOutput(question.expectedOutput)" in checker

print(f"Passed: {count} reference solutions, both quote styles, and variable-update order.")
