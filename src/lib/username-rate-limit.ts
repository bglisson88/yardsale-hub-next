export function usernameRateLimitErrorMessage(
  error: unknown,
  operation: 'register' | 'rename',
): string | null {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? error.code : undefined;
  const details = typeof error === 'object' && error !== null && 'details' in error
    ? error.details : undefined;
  if (
    code !== 'functions/resource-exhausted' ||
    typeof details !== 'object' ||
    details === null ||
    !('reason' in details) ||
    details.reason !== 'USERNAME_RATE_LIMIT'
  ) {
    return null;
  }

  const retrySeconds = 'retryAfterSeconds' in details &&
    typeof details.retryAfterSeconds === 'number' &&
    Number.isSafeInteger(details.retryAfterSeconds) &&
    details.retryAfterSeconds > 0
    ? details.retryAfterSeconds
    : null;
  const retryAt = 'retryAt' in details && typeof details.retryAt === 'string'
    ? new Date(details.retryAt)
    : null;
  const remaining = retrySeconds ?? (
    retryAt && Number.isFinite(retryAt.getTime())
      ? Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000))
      : null
  );
  const wait = remaining === null
    ? 'a little while'
    : remaining < 60
      ? 'less than a minute'
      : remaining < 3600
        ? `about ${Math.ceil(remaining / 60)} minutes`
        : `about ${Math.ceil(remaining / 3600)} hours`;
  const action = operation === 'register' ? 'registering' : 'changing';
  return `Too many attempts at ${action} your username. Please try again in ${wait}.`;
}
