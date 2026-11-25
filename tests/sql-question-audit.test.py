from __future__ import annotations

import json
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSONS = json.loads((ROOT / 'public' / 'lessons.json').read_text(encoding='utf-8'))
DATABASE_SOURCE = (ROOT / 'public' / 'database.js').read_text(encoding='utf-8')
MATCH = re.search(r'const SAMPLE_DATABASE_SQL = `([\s\S]*?)`;', DATABASE_SOURCE)
assert MATCH, 'Could not find the sample SQL database definition.'
SAMPLE_SQL = MATCH.group(1)


def execute_result_sets(connection, sql):
    statements = [statement.strip() for statement in sql.split(';') if statement.strip()]
    return [connection.execute(statement).fetchall() for statement in statements]


def canonical_result_sets(result_sets):
    return tuple(tuple(sorted(repr(tuple(row)) for row in rows)) for rows in result_sets)


class SqlQuestionAuditTests(unittest.TestCase):
    def test_course_has_ten_lessons_and_filtering_topics_have_ten_questions_each(self):
        self.assertEqual(len(LESSONS), 10)
        self.assertTrue(all(len(lesson['questions']) == 10 for index, lesson in enumerate(LESSONS) if index != 4))
        self.assertEqual(len(LESSONS[4]['questions']), 34)
        app = (ROOT / 'public' / 'app.js').read_text(encoding='utf-8')
        for slug in ('logical-operators', 'between-in-like', 'text-constraints'):
            match = re.search("slug: '" + slug + r"'[^}]*?questionIds: \[([^]]+)\]", app)
            self.assertIsNotNone(match, f'{slug} topic must have a question list')
            ids = re.findall(r"'([^']+)'", match.group(1))
            questions = [next((q for q in LESSONS[4]['questions'] if q['id'] == question_id), None) for question_id in ids]
            self.assertEqual(len(questions), 10, f'{slug} must have ten questions')
            self.assertTrue(all(questions), f'{slug} must reference existing questions')
            self.assertEqual(sum(bool(q.get('free')) for q in questions), 5, f'{slug} must have five free questions')
            self.assertEqual(sum(not bool(q.get('free')) for q in questions), 5, f'{slug} must have five premium questions')

    def test_all_reference_solutions_execute(self):
        seen = set()
        for lesson in LESSONS:
            for question in lesson['questions']:
                self.assertNotIn(question['id'], seen, f"Duplicate question id: {question['id']}")
                seen.add(question['id'])
                connection = sqlite3.connect(':memory:')
                try:
                    connection.executescript(SAMPLE_SQL)
                    if question.get('type') == 'state':
                        connection.executescript(question['solution'])
                        result_sets = execute_result_sets(connection, question['verify'])
                        display_sets = execute_result_sets(connection, question['displayVerify'])
                        self.assertTrue(display_sets, f"{question['id']} display output returned no result sets")
                        self.assertTrue(result_sets, f"{question['id']} verification returned no result sets")
                        self.assertTrue(all(rows is not None for rows in result_sets), question['id'])
                        if question['id'].startswith('l9-'):
                            self.assertEqual(len(display_sets), 1, f"{question['id']} should display a concise change summary")
                            expected_count = 10 if question['id'] in {'l9-q1', 'l9-q2'} else 9
                            self.assertEqual(len(result_sets), expected_count, f"{question['id']} must verify catalog, schemas and all table contents")
                        if question['id'].startswith('l10-'):
                            self.assertEqual(len(display_sets), 2, f"{question['id']} should display only the new table and its schema")
                            self.assertEqual(len(result_sets), 2, f"{question['id']} must verify table catalog and requested schema")
                            table_match = re.search(r'CREATE\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)', question['solution'], re.I)
                            self.assertIsNotNone(table_match, question['id'])
                            self.assertIn(('table', table_match.group(1), table_match.group(1)), result_sets[0], question['id'])
                    else:
                        rows = connection.execute(question['solution']).fetchall()
                        self.assertIsNotNone(rows)
                except Exception as error:
                    self.fail(f"{question['id']} reference answer failed: {error}")
                finally:
                    connection.close()
        self.assertEqual(len(seen), 124)

    def test_ordering_questions_have_explicit_grading_rules(self):
        questions = {q['id']: q for lesson in LESSONS for q in lesson['questions']}
        for question_id in ('l5-q1', 'l5-q2', 'l5-q3', 'l5-q4', 'l5-q5', 'l5-q6', 'l5-q7', 'l5-q9', 'l5-q10', 'l2-distinct-q4', 'l2-distinct-q8', 'l2-distinct-q9'):
            self.assertTrue(questions[question_id].get('orderBy'), f'{question_id} must check the requested sort order')
        for question_id in ('l2-distinct-q3', 'l2-distinct-q7'):
            self.assertTrue(questions[question_id].get('orderMatters'), f'{question_id} must keep its ID order')

    def test_equivalent_where_filters_return_the_same_answer(self):
        connection = sqlite3.connect(':memory:')
        try:
            connection.executescript(SAMPLE_SQL)
            expected = connection.execute('SELECT student FROM school WHERE id BETWEEN 1 AND 5;').fetchall()
            alternate = connection.execute('SELECT student FROM school WHERE id < 6;').fetchall()
            second_alternate = connection.execute('SELECT student FROM school WHERE id >= 1 AND id <= 5;').fetchall()
            self.assertCountEqual(alternate, expected)
            self.assertCountEqual(second_alternate, expected)
        finally:
            connection.close()

    def test_insert_questions_allow_unspecified_id_values(self):
        for question_id, alternate_sql in (
            ('l9-q1', "INSERT INTO students (id, name, age, city, email) VALUES (777, 'Asha', 21, 'Delhi', 'asha@example.test');"),
            ('l9-q2', "INSERT INTO courses (id, title, lesson_count, teacher_id, created_year, difficulty, category) VALUES (999, 'SQL Basics', 8, 1, 2025, 'Beginner', 'Databases');"),
        ):
            question = next(q for q in LESSONS[8]['questions'] if q['id'] == question_id)
            reference_db = sqlite3.connect(':memory:')
            alternate_db = sqlite3.connect(':memory:')
            try:
                reference_db.executescript(SAMPLE_SQL)
                alternate_db.executescript(SAMPLE_SQL)
                reference_db.executescript(question['solution'])
                alternate_db.executescript(alternate_sql)
                self.assertEqual(
                    canonical_result_sets(execute_result_sets(reference_db, question['verify'])),
                    canonical_result_sets(execute_result_sets(alternate_db, question['verify'])),
                    f'{question_id} should accept a valid ID when the task does not specify one'
                )
            finally:
                reference_db.close()
                alternate_db.close()

    def test_dml_verification_rejects_unintended_changes_to_other_rows(self):
        delete_question = next(q for q in LESSONS[8]['questions'] if q['id'] == 'l9-q6')
        expected_db = sqlite3.connect(':memory:')
        bad_db = sqlite3.connect(':memory:')
        try:
            expected_db.executescript(SAMPLE_SQL)
            bad_db.executescript(SAMPLE_SQL)
            expected_db.executescript(delete_question['solution'])
            bad_db.executescript('DELETE FROM students;')
            expected_state = canonical_result_sets(execute_result_sets(expected_db, delete_question['verify']))
            bad_state = canonical_result_sets(execute_result_sets(bad_db, delete_question['verify']))
            self.assertNotEqual(expected_state, bad_state, 'deleting every student must not pass a task that asks to delete only id 6')
        finally:
            expected_db.close()
            bad_db.close()

    def test_ddl_verification_rejects_extra_or_wrong_columns(self):
        question = next(q for q in LESSONS[9]['questions'] if q['id'] == 'l10-q1')
        correct_db = sqlite3.connect(':memory:')
        wrong_db = sqlite3.connect(':memory:')
        try:
            correct_db.executescript(SAMPLE_SQL)
            wrong_db.executescript(SAMPLE_SQL)
            correct_db.executescript(question['solution'])
            wrong_db.executescript('CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, extra TEXT);')
            self.assertNotEqual(
                canonical_result_sets(execute_result_sets(correct_db, question['verify'])),
                canonical_result_sets(execute_result_sets(wrong_db, question['verify'])),
                'extra columns must not pass the requested table definition'
            )
        finally:
            correct_db.close()
            wrong_db.close()

    def test_select_projection_returns_only_requested_columns_for_preview(self):
        connection = sqlite3.connect(':memory:')
        try:
            connection.executescript(SAMPLE_SQL)
            cases = (
                ('SELECT student FROM school;', ['student']),
                ('SELECT teacher FROM school;', ['teacher']),
                ('SELECT student, marks FROM school;', ['student', 'marks']),
                ('SELECT * FROM school;', ['id', 'student', 'teacher', 'marks', 'class']),
            )
            for sql, expected_columns in cases:
                cursor = connection.execute(sql)
                actual_columns = [column[0] for column in cursor.description]
                self.assertEqual(actual_columns, expected_columns, sql)
                self.assertEqual(len(cursor.fetchall()), 8, sql)
        finally:
            connection.close()

    def test_practice_interaction_contracts_are_present(self):
        app = (ROOT / 'public' / 'app.js').read_text(encoding='utf-8')
        css = (ROOT / 'public' / 'course.css').read_text(encoding='utf-8')
        site_css = (ROOT / 'public' / 'style.css').read_text(encoding='utf-8')
        input_listener = app[app.index("document.addEventListener('input'"):app.index("document.addEventListener('click'")]
        self.assertIn("if (event.target?.id === 'query') {\n    saveSharedEditorDraft(event.target.value);\n    scheduleAutoCheck();\n    scheduleQueryPreview();\n  }", input_listener)
        self.assertIn('function scheduleQueryPreview()', app)
        self.assertIn("import { cloneDatabase, createFreshDatabase, loadSqlModule }", app)
        self.assertIn('const QUERY_PREVIEW_DELAY_MS = 20;', app)
        self.assertIn('function isSingleReadOnlySelect(sql)', app)
        self.assertIn('resultSets = sourceDb.exec(sql);', app, 'simple SELECT previews must reuse the loaded database synchronously')
        self.assertIn('isolatedDb = await cloneDatabase(sourceDb);', app, 'mutating/multi-statement previews must use a fast isolated snapshot')
        self.assertIn('renderSchemaViewer(previewSource, true);', app)
        self.assertIn('function renderSchemaViewer(sourceDb = db, isQueryPreview = false)', app)
        self.assertIn('queryPreviewVisible = Boolean(isQueryPreview);', app)
        self.assertIn('renderQueryResultsInSchemaViewer(results)', app)
        preview_fn = app[app.index('function renderQueryResultsInSchemaViewer('):app.index('function isSingleReadOnlySelect(')]
        self.assertIn('resultSet?.columns', preview_fn)
        self.assertIn('resultSet?.values', preview_fn)
        self.assertIn("heading.textContent = 'Query result';", preview_fn)
        preview_schedule = app[app.index('function scheduleQueryPreview('):app.index('function renderSchemaViewer(')]
        self.assertNotIn('createFreshDatabase(', preview_schedule, 'preview must not rebuild/reseed the whole sample database on each keystroke')
        self.assertIn('if (!hasRequiredSemicolon(sql)) return;', preview_schedule, 'incomplete SQL must leave the last successful preview visible')
        self.assertIn('if (!queryPreviewVisible) renderSchemaViewer();', app, 'question rerenders must not flash the full source table over the active query result')
        open_lesson = app[app.index('async function openLesson('):app.index('function setPracticeEnabled(')]
        self.assertIn('await applyQueryPreview(retainedSql, queryPreviewVersion, currentQuestionId)', open_lesson)
        self.assertLess(open_lesson.index('await applyQueryPreview(retainedSql, queryPreviewVersion, currentQuestionId)'), open_lesson.index('if (!retainedPreviewShown) renderSchemaViewer();'))
        database_source = (ROOT / 'public' / 'database.js').read_text(encoding='utf-8')
        self.assertIn('export async function cloneDatabase(sourceDb)', database_source)
        self.assertIn("event.target?.id === 'query' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.shiftKey", app)
        self.assertIn("// Plain Enter is deliberately left alone", app)
        self.assertNotIn("textarea.value = '';", app, 'solving must not clear the learner query')
        self.assertIn('saveSharedEditorDraft(sql);', app)
        self.assertIn('Your previous SQL is still in the shared editor. Select the query and delete it yourself before writing this answer.', app)
        self.assertIn("const SHARED_QUERY_KEY = 'codebolt-sql-shared-editor-v1';", app)
        self.assertIn('queryEditor.value = getSavedQuestionDraft(currentQuestionId)', app)
        self.assertIn('sharedEditorDraft = getSharedEditorDraft(null, questionDrafts, questionId, legacyFallback);', app)
        self.assertIn('if (!hasRequiredSemicolon(sql))', app)
        self.assertIn('!hasRequiredSemicolon(sql)', app)
        self.assertIn('getNextUnsolvedQuestionAfter(', app)
        self.assertIn('const allCourseQuestions = lessons.flatMap((lesson) => lesson.questions);', app)
        self.assertIn('getSavedQuestionDraft(currentQuestionId)', app)
        complete_fn = app[app.index('function completeCorrectAnswer('):app.index('function scheduleAutoCheck(')]
        self.assertIn('scheduleAutoAdvance(question.id);', complete_fn)
        self.assertNotIn('getActiveFreeTaskSolvedCount() === getActiveFreeTaskCount()', complete_fn, 'finishing a topic must still auto-advance to the next unanswered course question')
        self.assertIn("const preferredQuestion = availableQuestions.find((question) => question.id === preferredQuestionId) || null;", app)
        select_question_fn = app[app.index('function selectQuestion(id)'):app.index('function runQuery()')]
        self.assertIn('openLesson(targetLessonIndex, false, id, targetTopicSlug, true);', select_question_fn)
        self.assertIn('checkExistingDraft = false', app)
        self.assertIn('if (checkExistingDraft && $(\'#query\')?.value.trim()) scheduleAutoCheck();', app)
        submit_fn = app[app.index('async function submitAnswer()'):app.index('function toggleHint()')]
        self.assertIn('const selection = getQuestionById(currentQuestionId);', submit_fn)
        self.assertIn('if (currentQuestionId !== questionId || $(\'#query\')?.value.trim() !== sql)', submit_fn)
        self.assertIn("if (message) {\n          message.hidden = false;\n          message.className = 'answer-message';", app)
        self.assertIn('This question is already completed in this session. You can practise it again.', app)
        self.assertIn(".task-choice.locked .task-text {\n  filter: blur(3px);", css)
        self.assertIn(".solution-card-locked .solution-card-heading p {\n  filter: blur(3px);", css)
        self.assertIn("width: 30px;\n  height: 30px;", css)
        self.assertIn('sampleDb.exec(selection.question.displayVerify || selection.question.verify)', app)
        self.assertIn('.solution-card-locked .solution-card-heading p { filter: blur(3px);', site_css)

    def test_course_insert_prompt_matches_reference_solution_fields(self):
        question = next(q for q in LESSONS[8]['questions'] if q['id'] == 'l9-q2')
        self.assertIn('teacher_id 1', question['text'])
        self.assertIn('teacher_id', question['solution'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
