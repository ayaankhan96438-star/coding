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

/** Save one question's editor text without changing drafts for other questions. */
export function withQuestionDraft(drafts, questionId, sql) {
  if (!questionId) return { ...(drafts || {}) };
  return { ...(drafts && typeof drafts === 'object' ? drafts : {}), [questionId]: String(sql ?? '') };
}

/** Read the saved editor text. The fallback supports solved tasks from older builds. */
export function getQuestionDraft(drafts, questionId, fallback = '') {
  if (drafts && Object.prototype.hasOwnProperty.call(drafts, questionId)) {
    return String(drafts[questionId] ?? '');
  }
  return String(fallback ?? '');
}
