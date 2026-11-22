import assert from 'node:assert/strict';
import { clearAllCourseProgress, resetSingleTaskProgress, wasBrowserReload } from '../progress-state.mjs';

const beforeProgress = {
  q1: { status: 'solved', attempts: 2, wrongAttempts: 1 },
  q2: { status: 'attempted', attempts: 1, wrongAttempts: 1 },
  q3: { status: 'solved', attempts: 1, wrongAttempts: 0 }
};
const beforeGamification = {
  xp: 75, streak: 4, bestStreak: 6, lastActiveDate: '2026-11-22',
  lastDailyBonusDate: '2026-11-22', awardedQuestionIds: ['q1', 'q3']
};

const single = resetSingleTaskProgress(beforeProgress, beforeGamification, 'q1', 25);
assert.equal(Object.hasOwn(single.progress, 'q1'), false, 'current task must be removed');
assert.deepEqual(single.progress.q2, beforeProgress.q2, 'attempted sibling task must remain');
assert.deepEqual(single.progress.q3, beforeProgress.q3, 'solved sibling task must remain');
assert.equal(single.gamification.xp, 50, 'only the selected task award must be reversed');
assert.deepEqual(single.gamification.awardedQuestionIds, ['q3']);
assert.equal(single.gamification.streak, 4, 'streak must remain on single-task reset');

const all = clearAllCourseProgress();
assert.deepEqual(all.progress, {}, 'full refresh reset must clear every task record');
assert.equal(all.gamification.xp, 0);
assert.deepEqual(all.gamification.awardedQuestionIds, []);
assert.equal(wasBrowserReload({ getEntriesByType: () => [{ type: 'reload' }] }), true);
assert.equal(wasBrowserReload({ getEntriesByType: () => [{ type: 'navigate' }] }), false);

console.log('Progress state tests passed: single-task reset, full refresh reset, and navigation detection.');
