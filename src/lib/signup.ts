// Keep in sync with the callable's hardcoded names; the server also checks Firestore reservations.
import { usernameRateLimitErrorMessage } from './username-rate-limit';

const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'support', 'help', 'moderator',
  'staff', 'system', 'root', 'api', 'www',
]);

export function normalizeUsername(value: string): string {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(value) || /[^A-Za-z0-9_]/.test(value)) {
    throw new Error('Username must be 3–20 ASCII letters, numbers, or underscores.');
  }
  const username = value.toLowerCase();
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error('That username is unavailable. Please choose another.');
  }
  return username;
}

export function registrationErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? error.code : undefined;
  switch (code) {
    case 'functions/already-exists':
      return 'That username is unavailable. Please choose another.';
    case 'functions/invalid-argument':
      return 'Please enter a valid username.';
    case 'functions/unauthenticated':
      return 'Your session has expired. Sign in, then return to this page to finish setup.';
    case 'functions/failed-precondition':
      return 'Your account profile could not be verified. Please contact support if this continues.';
    case 'functions/resource-exhausted':
      return usernameRateLimitErrorMessage(error, 'register') ??
        'The username service is temporarily unavailable. Please try again.';
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
    case 'functions/aborted':
      return 'The username service is temporarily unavailable. Please try again.';
    default:
      return 'Unable to register your username. Please try again or contact support.';
  }
}

interface SignupSteps {
  createAccount: () => Promise<string>;
  savePrivateProfile: (uid: string) => Promise<void>;
  registerUsername: (username: string) => Promise<string>;
  onAccountCreated: (uid: string) => void;
  onPrivateProfileCreated: () => void;
}

export async function completeSignup(
  username: string,
  state: { uid: string | null; hasPrivateProfile: boolean },
  steps: SignupSteps,
): Promise<string> {
  const normalized = normalizeUsername(username);
  const uid = state.uid ?? await steps.createAccount();
  if (!state.uid) steps.onAccountCreated(uid);
  if (!state.hasPrivateProfile) {
    await steps.savePrivateProfile(uid);
    steps.onPrivateProfileCreated();
  }
  return steps.registerUsername(normalized);
}
