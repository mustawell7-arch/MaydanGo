export const COOKIE_CONSENT_KEY = 'maydango-cookie-consent-v1';

export type AnalyticsConsent = 'accepted' | 'essential-only' | null;

export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === 'accepted' || value === 'essential-only' ? value : null;
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(value: Exclude<AnalyticsConsent, null>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    // The site remains usable if browser storage is unavailable.
  }
}

export function hasAnalyticsConsent(): boolean {
  return readAnalyticsConsent() === 'accepted';
}
