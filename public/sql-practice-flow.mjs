/** Shared SQL practice-flow rules. Kept pure so the exact behaviour can be tested. */
export function hasRequiredSemicolon(sql) {
  return /;\s*$/.test(String(sql ?? '').trim());
}

/** Return the first question, in course order, that is unlocked and unsolved. */
export function getNextUnsolvedQuestion(questions, isUnlocked, getStatus) {
  return (Array.isArray(questions) ? questions : []).find((question) =>
    Boolean(isUnlocked?.(question)) && getStatus?.(question.id) !== 'solved'
  ) || null;
}

/**
 * Find the next unanswered accessible question after the one just completed.
 * Search in course order and wrap once, so solving out of order always advances
 * to the next unanswered question instead of stopping at a topic boundary.
 */
export function getNextUnsolvedQuestionAfter(questions, currentQuestionId, isUnlocked, getStatus) {
  const list = Array.isArray(questions) ? questions : [];
  if (!list.length) return null;
  const currentIndex = list.findIndex((question) => question?.id === currentQuestionId);
  const startIndex = currentIndex >= 0 ? currentIndex : -1;

  for (let offset = 1; offset <= list.length; offset += 1) {
    const question = list[(startIndex + offset + list.length) % list.length];
    if (Boolean(isUnlocked?.(question)) && getStatus?.(question.id) !== 'solved') return question;
  }
  return null;
}

/** Return the first accessible question in a topic, regardless of completion. */
export function getFirstAvailableQuestion(questions, isAvailable) {
  return (Array.isArray(questions) ? questions : []).find((question) => Boolean(isAvailable?.(question))) || null;
}

/**
 * There is one shared SQL editor for the whole practice flow. Prefer its saved
 * content; only migrate an older per-question draft when no shared value exists.
 */
export function getSharedEditorDraft(sharedDraft, legacyDrafts, initialQuestionId, fallback = '') {
  if (sharedDraft !== null && sharedDraft !== undefined) return String(sharedDraft);
  if (legacyDrafts && Object.prototype.hasOwnProperty.call(legacyDrafts, initialQuestionId)) {
    return String(legacyDrafts[initialQuestionId] ?? '');
  }
  return String(fallback ?? '');
}

/** Normalize the shared editor value without tying it to any question ID. */
export function normalizeSharedEditorDraft(sql) {
  return String(sql ?? '');
}

/** Find the next course topic in navigation order, without checking completion. */
export function getNextCourseTopic(topics, currentSlug) {
  const list = Array.isArray(topics) ? topics : [];
  const currentIndex = list.findIndex((topic) => topic?.slug === currentSlug);
  return currentIndex >= 0 ? list[currentIndex + 1] || null : null;
}
