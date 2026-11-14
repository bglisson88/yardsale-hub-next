export const USERNAME_RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'moderator',
  'staff',
  'system',
  'root',
  'api',
  'www',
]);

const INVALID_USERNAME_MESSAGE =
  'Username must be 3-20 ASCII letters, numbers, or underscores.';

export function canonicalizeUsername(value: unknown): string {
  if (typeof value !== 'string' || !/^[\x00-\x7f]*$/.test(value)) {
    throw new TypeError(INVALID_USERNAME_MESSAGE);
  }

  const username = value.replace(/[A-Z]/g, character =>
    String.fromCharCode(character.charCodeAt(0) + 32),
  );
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new TypeError(INVALID_USERNAME_MESSAGE);
  }

  return username;
}

export function isReservedUsername(value: unknown): boolean {
  return RESERVED_USERNAMES.has(canonicalizeUsername(value));
}

export function cooldownDateFromTimestamp(seconds: number, nanoseconds: number): Date {
  if (
    !Number.isSafeInteger(seconds) ||
    !Number.isInteger(nanoseconds) ||
    nanoseconds < 0 ||
    nanoseconds >= 1_000_000_000
  ) {
    throw new RangeError('Timestamp must have valid seconds and nanoseconds.');
  }
  const milliseconds = seconds * 1000 + Math.ceil(nanoseconds / 1_000_000);
  const date = new Date(milliseconds);
  if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(date.getTime())) {
    throw new RangeError('Timestamp must be a valid Date.');
  }
  return date;
}

export function canRenameUsername(
  lastRenamedAt: Date | null,
  now: Date,
): boolean {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError('Current time must be a valid Date.');
  }
  if (lastRenamedAt === null) return true;
  if (!(lastRenamedAt instanceof Date) || !Number.isFinite(lastRenamedAt.getTime())) {
    throw new RangeError('Last rename time must be null or a valid Date.');
  }

  return now.getTime() - lastRenamedAt.getTime() >= USERNAME_RENAME_COOLDOWN_MS;
}
