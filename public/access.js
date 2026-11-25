/**
 * Premium access boundary.
 * Before launch, replace this UI-only check with an entitlement lookup backed by
 * an authenticated server. Never ship protected premium solutions to the client.
 */
export function isUnlocked(question) {
  // Later this will check the user's real subscription entitlement from a server.
  return Boolean(question && question.free === true);
}

/** All lessons can be opened directly; Premium access is controlled per question. */
export function isLessonAccessible(index, lessonCount) {
  return Number.isInteger(index) && index >= 0 && Number.isInteger(lessonCount) && lessonCount >= 0 && index < lessonCount;
}
