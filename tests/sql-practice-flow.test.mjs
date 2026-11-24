import assert from 'node:assert/strict';
import {
  getNextUnsolvedQuestion,
  getQuestionDraft,
  hasRequiredSemicolon,
  withQuestionDraft
} from '../sql-practice-flow.mjs';

assert.equal(hasRequiredSemicolon('SELECT * FROM school'), false, 'a query without a semicolon cannot be submitted');
assert.equal(hasRequiredSemicolon('SELECT * FROM school;'), true);
assert.equal(hasRequiredSemicolon('SELECT *\nFROM school;\n  '), true, 'trailing whitespace after the terminator is okay');
assert.equal(hasRequiredSemicolon('SELECT * FROM school; -- trailing comment'), false, 'the semicolon must terminate the complete input');
assert.equal(hasRequiredSemicolon(''), false);

const questions = [1, 2, 3, 4, 5].map((number) => ({ id: `q${number}` }));
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

const afterQ1 = withQuestionDraft({}, 'q1', 'SELECT student FROM school;');
const afterQ2 = withQuestionDraft(afterQ1, 'q2', 'SELECT teacher FROM school;');
assert.equal(getQuestionDraft(afterQ2, 'q1'), 'SELECT student FROM school;', 'q1 draft remains saved after typing q2');
assert.equal(getQuestionDraft(afterQ2, 'q2'), 'SELECT teacher FROM school;');
assert.equal(getQuestionDraft(afterQ2, 'q3', 'SELECT * FROM school;'), 'SELECT * FROM school;', 'legacy solved tasks can display a fallback solution');
const clearedQ1 = withQuestionDraft(afterQ2, 'q1', '');
assert.equal(getQuestionDraft(clearedQ1, 'q1'), '', 'an intentionally cleared draft remains empty');

console.log('SQL practice flow tests passed: semicolon gate, out-of-order progression and independent saved answers per question.');
