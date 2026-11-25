import { createFreshDatabase } from './database.js?v=20261122-platform-tracks-sequence-02';

const output = document.querySelector('#test-results');
const summary = document.querySelector('#test-summary');

function addLine(message, passed) {
  const row = document.createElement('li');
  row.className = passed ? 'pass' : 'fail';
  row.textContent = message;
  output.append(row);
}

async function runSelfTest() {
  try {
    const response = await fetch('./lessons.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load lessons.json (HTTP ${response.status}).`);
    const lessons = await response.json();
    let passed = 0;
    let failed = 0;
    const total = lessons.reduce((sum, lesson) => sum + lesson.questions.length, 0);

    for (const lesson of lessons) {
      for (const question of lesson.questions) {
        let database;
        try {
          database = await createFreshDatabase();
          let results;
          if (question.type === 'state') {
            database.run(question.solution);
            results = database.exec(question.verify);
          } else {
            results = database.exec(question.solution);
          }
          const hasRows = Array.isArray(results) && results.some((result) => Array.isArray(result.values) && result.values.length > 0);
          if (!hasRows) throw new Error(question.type === 'query' ? 'SELECT returned no rows.' : 'Verification SELECT returned no rows.');
          if (question.type === 'state' && lesson.id === 'l10' && String(results[0].values[0][0]) !== '1') {
            throw new Error('Created table schema did not match the requested columns.');
          }
          passed += 1;
          addLine(`PASS ${question.id} — ${question.text}`, true);
        } catch (error) {
          failed += 1;
          addLine(`FAIL ${question.id} — ${question.text}: ${error.message}`, false);
        } finally {
          if (database) database.close();
        }
      }
    }
    summary.textContent = `${passed} / ${total} passed · ${failed} failed`;
    summary.className = failed === 0 ? 'pass' : 'fail';
  } catch (error) {
    summary.textContent = `Self-test could not start: ${error.message}. Run this page through a local server and check internet access for sql.js.`;
    summary.className = 'fail';
  }
}

runSelfTest();
