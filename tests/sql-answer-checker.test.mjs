import assert from 'node:assert/strict';
import { compareResults } from '../public/sql-answer-checker.mjs';

const expectedStudents = [{
  columns: ['student'],
  values: [['Aarav'], ['Diya'], ['Kabir'], ['Meera'], ['Rohan']]
}];

// Different WHERE expressions that return the same records must be accepted.
const idLessThanSix = [{
  columns: ['student'],
  values: [['Rohan'], ['Aarav'], ['Meera'], ['Kabir'], ['Diya']]
}];
assert.equal(compareResults(idLessThanSix, expectedStudents).equal, true);

const idBetweenOneAndFive = [{
  columns: ['student'],
  values: [['Aarav'], ['Diya'], ['Kabir'], ['Meera'], ['Rohan']]
}];
assert.equal(compareResults(idBetweenOneAndFive, expectedStudents).equal, true);

// Column order and aliases should not make an otherwise identical answer fail.
const reversedColumns = [{
  columns: ['marks', 'student_name'],
  values: [[85, 'Aarav'], [92, 'Diya']]
}];
const originalColumns = [{
  columns: ['student', 'marks'],
  values: [['Aarav', 85], ['Diya', 92]]
}];
assert.equal(compareResults(reversedColumns, originalColumns).equal, true);

// Returned rows can be in any order unless the question explicitly sorts them.
const unsortedMarks = [{ columns: ['marks'], values: [[68], [95], [85]] }];
const sortedMarks = [{ columns: ['marks'], values: [[95], [85], [68]] }];
assert.equal(compareResults(unsortedMarks, sortedMarks).equal, true);
assert.equal(compareResults(unsortedMarks, sortedMarks, { orderBy: [{ column: 'marks', direction: 'DESC' }] }).equal, false);
assert.equal(compareResults(sortedMarks, unsortedMarks, { orderBy: [{ column: 'marks', direction: 'DESC' }] }).equal, true);

// Explicit requested ordering must be respected, while valid tie-breakers pass.
const classSorted = [{ columns: ['student', 'class'], values: [['Aarav', 5], ['Kabir', 5], ['Meera', 6], ['Isha', 6]] }];
const classThenNameSorted = [{ columns: ['student', 'class'], values: [['Aarav', 5], ['Kabir', 5], ['Isha', 6], ['Meera', 6]] }];
const classExpected = [{ columns: ['student', 'class'], values: [['Aarav', 5], ['Meera', 6], ['Kabir', 5], ['Isha', 6]] }];
const classOrderRule = [{ column: 'class', direction: 'ASC' }];
assert.equal(compareResults(classSorted, classExpected, { orderBy: classOrderRule }).equal, true);
assert.equal(compareResults(classThenNameSorted, classExpected, { orderBy: classOrderRule }).equal, true);

const wrongAnswer = [{ columns: ['student'], values: [['Aarav'], ['Diya'], ['Kabir'], ['Meera']] }];
assert.equal(compareResults(wrongAnswer, expectedStudents).equal, false);


// State tasks compare every verification result set, not just one changed row.
const fullState = [
  { columns: ['name'], values: [['Aarav'], ['Diya']] },
  { columns: ['id', 'age'], values: [[1, 20], [2, 21]] }
];
const sameFullState = [
  { columns: ['name'], values: [['Diya'], ['Aarav']] },
  { columns: ['id', 'age'], values: [[2, 21], [1, 20]] }
];
assert.equal(compareResults(sameFullState, fullState).equal, true);
const incorrectFullState = [
  { columns: ['name'], values: [['Aarav']] },
  { columns: ['id', 'age'], values: [[1, 20], [2, 21]] }
];
assert.equal(compareResults(incorrectFullState, fullState).equal, false);

console.log('SQL answer checker tests passed: equivalent WHERE clauses, column aliases/order, unordered results, required ORDER BY and incorrect outputs.');
