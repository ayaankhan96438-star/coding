/**
 * Premium access boundary.
 * Before launch, replace this UI-only check with an entitlement lookup backed by
 * an authenticated server. Never ship protected premium solutions to the client.
 */
export function isUnlocked(question) {
  // Later this will check the user's real subscription entitlement from a server.
  return Boolean(question && question.free === true);
}
