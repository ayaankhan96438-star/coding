from __future__ import annotations

import ast
import contextlib
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "public" / "python" / "questions"


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

# The score exercise specifically teaches creating and printing a second variable.
score_question = json.loads((QUESTION_DIR / "03-variables.json").read_text(encoding="utf-8"))[1]
correct_score = score_question["solution"]
assert correct_score == "score = 10\nscore1 = score + 5\nprint(score1)"
assert run_solution(correct_score) == "15"

def has_printed_new_variable_from_existing(source: str) -> bool:
    tree = ast.parse(source)
    assignments = [node for node in ast.walk(tree) if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign))]
    def targets(target):
        if isinstance(target, ast.Name):
            return {target.id}
        if isinstance(target, (ast.Tuple, ast.List)):
            return set().union(*(targets(item) for item in target.elts)) if target.elts else set()
        return set()
    previous = set()
    derived = set()
    for node in sorted(assignments, key=lambda item: item.lineno):
        value = getattr(node, "value", None)
        reads = {item.id for item in ast.walk(value) if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Load)} if value is not None else set()
        names = set().union(*(targets(item) for item in node.targets)) if isinstance(node, ast.Assign) else targets(node.target)
        derived.update(name for name in names if name not in previous and bool(reads & previous))
        previous.update(names)
    printed = {item.id for call in ast.walk(tree) if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == "print" for item in ast.walk(call) if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Load)}
    return bool(derived & printed)

assert has_printed_new_variable_from_existing("score = 10\nscore1 = score + 5\nprint(score1)")
assert not has_printed_new_variable_from_existing("score = 10\nscore = score + 5\nprint(score)")
assert not has_printed_new_variable_from_existing("score = 10\nscore1 = score + 5\nprint(score)")

# A solution and its displayed output must exactly match the written question.
hello_function = json.loads((QUESTION_DIR / "15-functions.json").read_text(encoding="utf-8"))[0]
assert run_solution(hello_function["solution"]) == hello_function["expectedOutput"] == "Hello"

# The browser checker must enforce exact results for flagged questions.
checker = (ROOT / "public" / "python-practice.js").read_text(encoding="utf-8")
assert "rule.matchExpected" in checker
assert "normalizeOutput(question.expectedOutput)" in checker
assert 'has_new_variable_from_existing' in checker
assert 'has_new_variable_from_existing' in (ROOT / "public" / "python-worker.js").read_text(encoding="utf-8")

print(f"Passed: {count} reference solutions, both quote styles, separate-variable logic, and solution/question alignment.")
