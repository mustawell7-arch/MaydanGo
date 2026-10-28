export class PaymentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function payTabsTestModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" &&
    process.env.MAYDANGO_PAYTABS_TEST_MODE === "true";
}

function hasProfileCredentials(profileId: string | undefined, serverKey: string | undefined): boolean {
  return Boolean(profileId && /^\d{1,20}$/.test(profileId.trim()) && serverKey?.trim());
}

export function paymentsEnabled(): boolean {
  if (process.env.MAYDANGO_PAYMENTS_ENABLED !== "true" ||
      !isHttpsUrl(process.env.PAYTABS_CALLBACK_URL) ||
      !isHttpsUrl(process.env.PAYTABS_RETURN_URL)) return false;
  if (payTabsTestModeEnabled()) {
    return process.env.MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED === "true" &&
      hasProfileCredentials(process.env.PAYTABS_TEST_PROFILE_ID, process.env.PAYTABS_TEST_SERVER_KEY);
  }
  return process.env.MAYDANGO_PAYOUTS_VERIFIED === "true" &&
    process.env.MAYDANGO_PAYTABS_RECURRING_VERIFIED === "true" &&
    hasProfileCredentials(process.env.PAYTABS_PROFILE_ID, process.env.PAYTABS_SERVER_KEY);
}

export function requirePaymentsEnabled(): void {
  if (!paymentsEnabled()) {
    throw new PaymentError(503, "Paid checkout is not enabled yet.");
  }
}

export function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function requirePayTabsCredentials(): { profileId: string; serverKey: string } {
  const testMode = payTabsTestModeEnabled();
  const profileId = (testMode ? process.env.PAYTABS_TEST_PROFILE_ID : process.env.PAYTABS_PROFILE_ID)?.trim();
  const serverKey = (testMode ? process.env.PAYTABS_TEST_SERVER_KEY : process.env.PAYTABS_SERVER_KEY)?.trim();
  if (!hasProfileCredentials(profileId, serverKey) || !profileId || !serverKey) {
    throw new PaymentError(503, "PayTabs credentials are not configured.");
  }
  return { profileId, serverKey };
}
