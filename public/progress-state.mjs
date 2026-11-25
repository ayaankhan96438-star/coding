/** Pure progress-state helpers shared by the course and its regression checks. */
export function resetSingleTaskProgress(progressData, gamificationData, questionId, xpPerQuestion = 25) {
  const nextProgress = { ...(progressData && typeof progressData === 'object' ? progressData : {}) };
  delete nextProgress[questionId];

  const currentGamification = gamificationData && typeof gamificationData === 'object' ? gamificationData : {};
  const awardedQuestionIds = Array.isArray(currentGamification.awardedQuestionIds)
    ? currentGamification.awardedQuestionIds
    : [];
  const hadAward = awardedQuestionIds.includes(questionId);
  const nextGamification = {
    xp: Math.max(0, (Number(currentGamification.xp) || 0) - (hadAward ? xpPerQuestion : 0)),
    streak: Number.isInteger(currentGamification.streak) ? currentGamification.streak : 0,
    bestStreak: Number.isInteger(currentGamification.bestStreak) ? currentGamification.bestStreak : 0,
    lastActiveDate: typeof currentGamification.lastActiveDate === 'string' ? currentGamification.lastActiveDate : null,
    lastDailyBonusDate: typeof currentGamification.lastDailyBonusDate === 'string' ? currentGamification.lastDailyBonusDate : null,
    awardedQuestionIds: awardedQuestionIds.filter((id) => id !== questionId)
  };

  return { progress: nextProgress, gamification: nextGamification };
}

export function clearAllCourseProgress() {
  return {
    progress: {},
    gamification: {
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDate: null,
      lastDailyBonusDate: null,
      awardedQuestionIds: []
    }
  };
}

export function wasBrowserReload(performanceObject = globalThis.performance) {
  try {
    const navigation = performanceObject?.getEntriesByType?.('navigation')?.[0];
    return navigation?.type === 'reload';
  } catch {
    return false;
  }
}

/** Clear question completion states on a browser reload without removing rewards or learner data. */
export function clearQuestionProgressForReload(snapshot = {}) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return { ...safe, progress: {} };
}
