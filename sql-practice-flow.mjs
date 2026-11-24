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
