import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLessonAccessible, isUnlocked } from '../public/access.js';

assert.equal(isLessonAccessible(0, 10), true, 'first lesson is accessible');
assert.equal(isLessonAccessible(6, 10), true, 'a later lesson is accessible without completing earlier lessons');
assert.equal(isLessonAccessible(9, 10), true, 'last lesson is accessible directly');
assert.equal(isLessonAccessible(10, 10), false, 'out-of-range lesson indexes are rejected');
assert.equal(isUnlocked({ free: true }), true, 'free questions remain accessible');
assert.equal(isUnlocked({ free: false }), false, 'Premium questions remain locked');

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const lessons = JSON.parse(readFileSync(new URL('../public/lessons.json', import.meta.url), 'utf8'));
const filteringQuestions = JSON.parse(readFileSync(new URL('../public/filtering-questions.json', import.meta.url), 'utf8'));
assert.equal(lessons.length, 10, 'course has exactly ten lessons');
assert.ok(lessons.every((lesson) => lesson.questions.length === 10), 'every lesson has exactly ten questions');
assert.equal(filteringQuestions.length, 24, 'additional Filtering questions are kept in a separate bank');
const allQuestionIds = new Set([...lessons.flatMap((lesson) => lesson.questions.map((question) => question.id)), ...filteringQuestions.map((question) => question.id)]);
for (const match of app.matchAll(/questionIds:\s*\[([^\]]+)\]/g)) {
  const ids = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  for (const id of ids) assert.ok(allQuestionIds.has(id), `topic references existing question ${id}`);
}
assert.match(readFileSync(new URL('../public/account-bootstrap.js', import.meta.url), 'utf8'), /clearQuestionProgressOnReload/, 'a full browser refresh must clear all question states');
assert.match(readFileSync(new URL('../public/account-bootstrap.js', import.meta.url), 'utf8'), /QueryPathProgressResetOnReload = true/, 'account bootstrap reports whether the cloud/local reset completed');
assert.match(readFileSync(new URL('../public/account-core.js', import.meta.url), 'utf8'), /removeItem\(STORAGE_KEYS\.sharedSqlDraft\)/, 'refresh also clears the shared SQL editor draft');
assert.match(readFileSync(new URL('../public/account-core.js', import.meta.url), 'utf8'), /cloudWriteQueue = cloudWriteQueue\.then\(write, write\)/, 'cloud reset is queued after prior saves so stale progress cannot overwrite it');
assert.match(app, /const refreshedByBrowser = wasBrowserReload\(window\.performance\)[\s\S]{0,160}QueryPathWasBrowserRefresh/, 'refresh is detected by both app and account bootstrap');
assert.match(app, /localStorage\.setItem\(PROGRESS_KEY, '\{\}'\)/, 'practice app has a local fallback that clears solved/attempted state on refresh');
assert.match(app, /localStorage\.removeItem\(SHARED_QUERY_KEY\)/, 'refresh clears the saved SQL editor answer');
assert.match(app, /async function completeCorrectAnswer[\s\S]{0,420}await applyQueryPreview\(sql, queryPreviewVersion, questionId\)/, 'correct answer preview must finish before progress/auto-advance');
assert.match(app, /getFirstAvailableQuestion\(/, 'refresh should choose the first available question in the current topic');
assert.match(app, /getNextCourseTopic\(SQL_TOPICS, currentTopicSlug\)/, 'next topic navigation is independent of completion');
assert.match(app, /queryPreviewVisible = false;[\s\S]{0,180}renderSchemaViewer\(\);/, 'navigation restores the selected question source tables instead of carrying a prior query result');
assert.match(app, /The shared editor remains untouched/, 'navigation preserves the shared SQL editor text');
assert.doesNotMatch(app, /const retainedPreviewShown = retainedSql/, 'old SQL preview is not replayed into a newly selected topic');
assert.match(readFileSync(new URL('../legacy-pages/practice.html', import.meta.url), 'utf8'), /app\.js\?v=20261125-refresh-and-preview-fix-01/, 'topic navigation fix gets a fresh browser asset URL');
assert.doesNotMatch(app, /Solve all \$\{getFreeTaskCount\(lesson\)\} free tasks before moving to the next lesson/, 'incomplete lesson does not block next-topic navigation');

const basicStart = app.indexOf("{ title: 'Foundation · Basic SQL Queries'");
const basicEnd = app.indexOf("{ title: 'Foundation · Database & Table Basics", basicStart);
assert.ok(basicStart >= 0 && basicEnd > basicStart, 'basic SQL topic group exists');
const basic = app.slice(basicStart, basicEnd);
const orderedSlugs = ['select-statement', 'where-clause', 'like-operator', 'order-by', 'distinct-limit'];
const positions = orderedSlugs.map((slug) => basic.indexOf(`slug: '${slug}'`));
assert.ok(positions.every((position) => position >= 0), 'SELECT, WHERE, LIKE, ORDER BY and DISTINCT/LIMIT are present');
assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'LIKE is third, ORDER BY fourth and DISTINCT/LIMIT fifth');
assert.match(app, /title: 'BETWEEN & IN'/, 'BETWEEN and IN remain in Filtering & Conditions');
assert.match(app, /slug: 'like-operator',[^\n]*questionIds: \['l4-text-q4', 'l4-text-q5', 'l4-text-q6', 'l4-text-q7'\]/, 'LIKE gets its own four pattern-matching tasks in Basic SQL');

console.log('Lesson navigation tests passed: direct access, Premium-only locks, refresh selection and lesson topic order.');
