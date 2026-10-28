import { PaymentError, requirePayTabsCredentials } from "./payment-config";

const PAYTABS_BASE_URL = "https://secure-iraq.paytabs.com";
type PayTabsObject = Record<string, unknown>;
type PayTabsFetch = typeof fetch;

let fetchOverride: PayTabsFetch | null = null;

export function setPayTabsFetchOverrideForTests(value: PayTabsFetch | null): void {
  fetchOverride = value;
}

export async function payTabsRequest(path: string, payload: PayTabsObject): Promise<PayTabsObject> {
  if (!path.startsWith("/") || path.includes("://")) {
    throw new Error("PayTabs endpoint path is invalid.");
  }
  const { profileId, serverKey } = requirePayTabsCredentials();
  let response: Response;
  try {
    response = await (fetchOverride ?? fetch)(`${PAYTABS_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        authorization: serverKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ ...payload, profile_id: profileId }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PaymentError(502, "PayTabs could not be reached. Try again shortly.");
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new PaymentError(502, "PayTabs returned an invalid response.");
  }
  if (!response.ok || !result || typeof result !== "object" || Array.isArray(result)) {
    throw new PaymentError(502, "PayTabs could not complete the payment request.");
  }
  return result as PayTabsObject;
}

export function payTabsApiBaseUrl(): string {
  return PAYTABS_BASE_URL;
}
