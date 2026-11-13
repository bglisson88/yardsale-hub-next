export function authDestination(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.includes('\\') || /[\u0000-\u001f]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://yardsale.invalid');
    const path = decodeURIComponent(url.pathname);
    const normalizedPath = new URL(path, 'https://yardsale.invalid').pathname;
    if (url.origin !== 'https://yardsale.invalid' || path.startsWith('//') ||
        path.includes('\\') || /[\u0000-\u001f]/.test(path) ||
        /^\/auth(?:\/|$)/i.test(normalizedPath)) {
      return '/dashboard';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}
