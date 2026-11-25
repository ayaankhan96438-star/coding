import assert from 'node:assert/strict';
import {
  getFirstAvailableQuestion,
  getNextCourseTopic,
  getNextUnsolvedQuestion,
  getSharedEditorDraft,
  hasRequiredSemicolon,
  normalizeSharedEditorDraft
} from '../public/sql-practice-flow.mjs';

assert.equal(hasRequiredSemicolon('SELECT * FROM school'), false, 'a query without a semicolon cannot be submitted');
assert.equal(hasRequiredSemicolon('SELECT * FROM school;'), true);
assert.equal(hasRequiredSemicolon('SELECT *\nFROM school;\n  '), true, 'trailing whitespace after the terminator is okay');
assert.equal(hasRequiredSemicolon('SELECT * FROM school; -- trailing comment'), false, 'the semicolon must terminate the complete input');
assert.equal(hasRequiredSemicolon(''), false);

const questions = [1, 2, 3, 4, 5].map((number) => ({ id: `q${number}` }));
assert.equal(getFirstAvailableQuestion(questions, () => true).id, 'q1', 'refresh starts at the first accessible question even when already solved');
assert.equal(getFirstAvailableQuestion(questions, (question) => question.id !== 'q1').id, 'q2', 'refresh skips inaccessible premium questions');
const solved = new Set(['q1', 'q3', 'q5']);
const nextAfterSolvingOutOfOrder = getNextUnsolvedQuestion(
  questions,
  () => true,
  (id) => solved.has(id) ? 'solved' : 'not started'
);
assert.equal(nextAfterSolvingOutOfOrder.id, 'q2', 'the next question is the lowest-numbered unanswered question');
solved.add('q2');
const nextAfterQ2 = getNextUnsolvedQuestion(
  questions,
  () => true,
  (id) => solved.has(id) ? 'solved' : 'not started'
);
assert.equal(nextAfterQ2.id, 'q4', 'after solving q2, the app skips already-solved q3 and opens q4');
solved.add('q4');
assert.equal(getNextUnsolvedQuestion(questions, () => true, (id) => solved.has(id) ? 'solved' : 'not started'), null);

const courseTopics = [{ slug: 'select' }, { slug: 'where' }, { slug: 'like' }, { slug: 'order' }];
assert.equal(getNextCourseTopic(courseTopics, 'where').slug, 'like', 'Continue works even when the current topic is not complete');
assert.equal(getNextCourseTopic(courseTopics, 'order'), null, 'the final topic has no next topic');
assert.equal(getNextCourseTopic(courseTopics, 'unknown'), null, 'unknown topic does not produce an invalid destination');

// One shared editor: navigating from Q1 to Q2 must not swap/clear its text.
const q1Answer = 'SELECT student FROM school;';
const afterQuestionNavigation = normalizeSharedEditorDraft(q1Answer);
assert.equal(afterQuestionNavigation, q1Answer, 'the shared textarea keeps Q1 text after auto-advance to Q2');
assert.equal(getSharedEditorDraft(afterQuestionNavigation, {}, 'q2'), q1Answer, 'Q2 opens with the exact same shared editor content');
// Only the learner's explicit edit/deletion changes the shared editor.
const manuallyCleared = normalizeSharedEditorDraft('');
assert.equal(getSharedEditorDraft(manuallyCleared, {}, 'q2'), '', 'manual deletion remains blank for Q2');
const q2Answer = normalizeSharedEditorDraft('SELECT teacher FROM school;');
assert.equal(getSharedEditorDraft(q2Answer, {}, 'q3'), q2Answer, 'typed Q2 text remains as the same shared editor when Q3 opens');

// Existing users migrate their currently selected task draft only once.
assert.equal(getSharedEditorDraft(null, { q1: q1Answer, q2: 'SELECT teacher FROM school;' }, 'q1'), q1Answer);
assert.equal(getSharedEditorDraft(null, {}, 'q1', 'SELECT * FROM school;'), 'SELECT * FROM school;');
assert.equal(getSharedEditorDraft('', { q1: q1Answer }, 'q1'), '', 'an explicitly saved empty shared editor wins over legacy drafts');

console.log('SQL practice flow tests passed: semicolon gate, ordered auto-advance and one shared editor that never auto-clears/swaps answers.');
