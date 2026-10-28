import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import { paymentsEnabled, payTabsTestModeEnabled, requirePayTabsCredentials } from "../lib/payment-config";
import paymentWebhookRouter from "./payment-webhook";

const envKeys = [
  "NODE_ENV", "PAYTABS_PROFILE_ID", "PAYTABS_SERVER_KEY", "PAYTABS_TEST_PROFILE_ID", "PAYTABS_TEST_SERVER_KEY",
  "PAYTABS_CALLBACK_URL", "PAYTABS_RETURN_URL", "MAYDANGO_PAYTABS_TEST_MODE", "MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED",
  "MAYDANGO_PAYMENTS_ENABLED", "MAYDANGO_PAYOUTS_VERIFIED", "MAYDANGO_PAYTABS_RECURRING_VERIFIED",
];
const previousEnv = new Map(envKeys.map(key => [key, process.env[key]]));
const secret = "test_paytabs_callback_server_key";
Object.assign(process.env, {
  NODE_ENV: "development",
  PAYTABS_PROFILE_ID: "",
  PAYTABS_SERVER_KEY: "",
  PAYTABS_TEST_PROFILE_ID: "12345",
  PAYTABS_TEST_SERVER_KEY: secret,
  PAYTABS_CALLBACK_URL: "https://api.example.test/api/payments/webhook",
  PAYTABS_RETURN_URL: "https://api.example.test/api/payments/return",
  MAYDANGO_PAYTABS_TEST_MODE: "true",
  MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED: "false",
  MAYDANGO_PAYMENTS_ENABLED: "false",
  MAYDANGO_PAYOUTS_VERIFIED: "false",
  MAYDANGO_PAYTABS_RECURRING_VERIFIED: "false",
});

const app = express();
app.use("/api/payments", express.raw({ type: "application/json", limit: "1mb" }), paymentWebhookRouter);

function signature(raw: string) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

test("PayTabs callbacks require a valid raw-body signature and remain disabled until verified", async t => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/payments/webhook`;
  const body = JSON.stringify({ tran_ref: "TST_test", cart_id: "billing_test" });

  const forged = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Signature: "0".repeat(64) },
    body,
  });
  assert.equal(forged.status, 400);

  const signed = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Signature: signature(body) },
    body,
  });
  assert.equal(signed.status, 503);
});

test("development test mode can be exercised without claiming live payout eligibility", () => {
  const keys = [
    "NODE_ENV", "PAYTABS_PROFILE_ID", "PAYTABS_SERVER_KEY", "PAYTABS_TEST_PROFILE_ID", "PAYTABS_TEST_SERVER_KEY",
    "PAYTABS_CALLBACK_URL", "PAYTABS_RETURN_URL", "MAYDANGO_PAYTABS_TEST_MODE", "MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED",
    "MAYDANGO_PAYMENTS_ENABLED", "MAYDANGO_PAYOUTS_VERIFIED", "MAYDANGO_PAYTABS_RECURRING_VERIFIED",
  ];
  const saved = new Map(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: "development",
      PAYTABS_PROFILE_ID: "",
      PAYTABS_SERVER_KEY: "",
      PAYTABS_TEST_PROFILE_ID: "12345",
      PAYTABS_TEST_SERVER_KEY: secret,
      PAYTABS_CALLBACK_URL: "https://api.example.test/api/payments/webhook",
      PAYTABS_RETURN_URL: "https://api.example.test/api/payments/return",
      MAYDANGO_PAYMENTS_ENABLED: "true",
      MAYDANGO_PAYTABS_TEST_MODE: "true",
      MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED: "true",
      MAYDANGO_PAYOUTS_VERIFIED: "false",
      MAYDANGO_PAYTABS_RECURRING_VERIFIED: "false",
    });
    assert.equal(paymentsEnabled(), true);
    assert.equal(requirePayTabsCredentials().profileId, "12345");
    process.env.NODE_ENV = "production";
    assert.equal(payTabsTestModeEnabled(), false);
    assert.equal(paymentsEnabled(), false, "test settings cannot activate live payments");
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

after(() => {
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
