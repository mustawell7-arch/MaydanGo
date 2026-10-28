import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, membershipBilling, membershipPlans, memberships, paymentWebhookEvents } from "@workspace/db";
import {
  cancelMemberSubscription,
  createMemberCheckout,
  handlePayTabsWebhook,
  memberSubscription,
  requestFullRefund,
  validatePaidPlan,
} from "./payments-paytabs";
import { setPayTabsFetchOverrideForTests } from "./paytabs-client";

const prefix = `paytabs-test-${randomUUID()}`;
const memberIds = [`${prefix}-paid`, `${prefix}-past-due`, `${prefix}-trial`];
const localPlanId = randomUUID();
const billingIds: string[] = [];
const deliveryIds: string[] = [];
const previousEnv = new Map<string, string | undefined>();
const env = {
  NODE_ENV: "test",
  MAYDANGO_PAYMENTS_ENABLED: "true",
  MAYDANGO_PAYOUTS_VERIFIED: "false",
  MAYDANGO_PAYTABS_RECURRING_VERIFIED: "false",
  MAYDANGO_PAYTABS_TEST_MODE: "true",
  MAYDANGO_PAYTABS_TEST_AGREEMENTS_VERIFIED: "true",
  PAYTABS_TEST_PROFILE_ID: "12345",
  PAYTABS_TEST_SERVER_KEY: "test_server_key_not_a_credential",
  PAYTABS_CALLBACK_URL: "https://api.example.test/api/payments/webhook",
  PAYTABS_RETURN_URL: "https://api.example.test/api/payments/return",
};
for (const [key, value] of Object.entries(env)) {
  previousEnv.set(key, process.env[key]);
  process.env[key] = value;
}

const providerTransactions = new Map<string, Record<string, unknown>>();
let checkoutCount = 0;
let checkoutPayload: Record<string, unknown> | null = null;
let refundPayload: Record<string, unknown> | null = null;

const fakeFetch: typeof fetch = async (input, init) => {
  const path = new URL(String(input)).pathname;
  const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  if (path === "/payment/request" && payload.tran_type === "sale") {
    checkoutCount++;
    checkoutPayload = payload;
    return new Response(JSON.stringify({
      tran_ref: `checkout_ref_${checkoutCount}`,
      redirect_url: `https://secure-iraq.paytabs.com/payment/page/checkout-${checkoutCount}`,
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (path === "/payment/query") {
    const ref = String(payload.tran_ref);
    const transaction = providerTransactions.get(ref);
    return new Response(JSON.stringify(transaction ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (path === "/payment/agreement/cancel") {
    return new Response(JSON.stringify({ status: "success", message: "Agreement has been cancelled" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  if (path === "/payment/request" && payload.tran_type === "refund") {
    refundPayload = payload;
    return new Response(JSON.stringify({
      tran_ref: "refund_transaction",
      previous_tran_ref: payload.tran_ref,
      cart_amount: payload.cart_amount,
      cart_currency: payload.cart_currency,
      payment_result: { response_status: "A" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ message: "Unexpected test request" }), {
    status: 404, headers: { "content-type": "application/json" },
  });
};
setPayTabsFetchOverrideForTests(fakeFetch);

async function prepareMember(userId: string, suffix: string) {
  const checkout = await createMemberCheckout(userId, localPlanId);
  assert.match(checkout.purchaseUrl, /^https:\/\/secure-iraq\.paytabs\.com\/payment\/page\//);
  const [billing] = await db.select().from(membershipBilling).where(eq(membershipBilling.userId, userId));
  assert.ok(billing?.providerCheckoutRef);
  assert.equal(billing?.amountIqd, 5000);
  billingIds.push(billing.id);
  return { billing, agreementId: `agreement_${suffix}` };
}

function transaction(
  tranRef: string,
  billing: typeof membershipBilling.$inferSelect,
  agreementId: string,
  responseStatus = "A",
) {
  const value = {
    tran_ref: tranRef,
    profile_id: "12345",
    cart_id: billing.id,
    cart_currency: "IQD",
    cart_amount: String(billing.amountIqd),
    tran_type: "Sale",
    tran_class: "ECom",
    agreement_id: agreementId,
    user_defined: { udf1: billing.id },
    payment_result: { response_status: responseStatus, transaction_time: new Date().toISOString() },
  };
  providerTransactions.set(tranRef, value);
  return value;
}

async function deliver(id: string, data: Record<string, unknown>) {
  deliveryIds.push(id);
  return handlePayTabsWebhook(data, id);
}

test("PayTabs checkout and paid access require verified agreement payments", async t => {
  await db.insert(membershipPlans).values({
    id: localPlanId, name: "Recurring test membership", tier: "M", kind: "paid",
    durationDays: 30, priceIqd: 5000, active: true, whopPlanId: null,
    rules: { quota: 8, dailyLimit: 2, quotaMode: "shared", physicalQuota: 8, premiumQuota: 0, liveQuota: 8 },
  });

  await t.test("only valid IQD plan prices are accepted", () => {
    assert.throws(() => validatePaidPlan(0), /valid whole-number IQD price/);
    assert.throws(() => validatePaidPlan(1.5), /valid whole-number IQD price/);
    assert.doesNotThrow(() => validatePaidPlan(5000));
  });

  const { billing: firstBilling, agreementId: firstAgreement } = await prepareMember(memberIds[0], "paid");
  assert.equal(checkoutCount, 1);
  assert.equal(checkoutPayload?.cart_amount, 5000, "price comes from the server-owned plan");
  assert.equal((checkoutPayload?.agreement as Record<string, unknown>)?.repeat_terms, 0);
  const repeatedCheckout = await createMemberCheckout(memberIds[0], localPlanId);
  assert.equal(repeatedCheckout.purchaseUrl, `https://secure-iraq.paytabs.com/payment/page/checkout-1`);
  assert.equal(checkoutCount, 1, "repeated checkout requests reuse the server-owned intent");

  const firstPayment = transaction("tran_paid_first", firstBilling, firstAgreement);
  const successDelivery = `${prefix}-success`;
  assert.equal(await deliver(successDelivery, firstPayment), "processed");
  assert.equal(await handlePayTabsWebhook(firstPayment, successDelivery), "duplicate");

  const [paidMembership] = await db.select().from(memberships)
    .where(and(eq(memberships.userId, memberIds[0]), eq(memberships.scope, "live")));
  assert.equal(paidMembership?.source, "paid");
  assert.equal(paidMembership?.paymentStatus, "paid");
  assert.equal(paidMembership?.billingId, firstBilling.id);

  await t.test("member cancellation stops renewals but preserves the paid period", async () => {
    const result = await cancelMemberSubscription(memberIds[0]);
    assert.equal(result.cancelAtPeriodEnd, true);
    assert.equal((await memberSubscription(memberIds[0]))?.cancelAtPeriodEnd, true);
    const [stillActive] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, memberIds[0]), eq(memberships.scope, "live")));
    assert.equal(stillActive.status, "active");
    assert.equal(stillActive.paymentStatus, "paid");
  });

  await t.test("full refund ends only the paid entitlement after provider confirmation", async () => {
    const result = await requestFullRefund(memberIds[0], "Member requested a full refund.");
    assert.equal(result.status, "completed");
    assert.equal(refundPayload?.cart_description, "MaydanGo membership refund");
    assert.equal(String(refundPayload?.cart_description).includes("Member requested"), false);
    const [after] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, memberIds[0]), eq(memberships.scope, "live")));
    assert.equal(after.status, "terminated");
    assert.equal(after.paymentStatus, "refunded");
    assert.equal((await db.select().from(membershipBilling).where(eq(membershipBilling.id, firstBilling.id)))[0].status, "refunded");
  });

  await t.test("a verified recurring payment failure pauses only paid access", async () => {
    const { billing, agreementId } = await prepareMember(memberIds[1], "past-due");
    const successfulCharge = transaction("tran_paid_second", billing, agreementId);
    assert.equal(await deliver(`${prefix}-second-success`, successfulCharge), "processed");

    const renewalFailure = transaction("tran_failed_renewal", billing, agreementId, "D");
    assert.equal(await deliver(`${prefix}-failure`, renewalFailure), "processed");
    const [paused] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, memberIds[1]), eq(memberships.scope, "live")));
    const subscription = await memberSubscription(memberIds[1]);
    assert.equal(paused.status, "paused");
    assert.equal(paused.paymentStatus, "past_due");
    assert.equal(subscription?.paymentStatus, "past_due");
    assert.equal(subscription?.recoveryUrl, null);
  });

  await t.test("a paid callback never replaces an active trial grant", async () => {
    const { billing, agreementId } = await prepareMember(memberIds[2], "trial-conflict");
    const now = new Date();
    await db.insert(memberships).values({
      userId: memberIds[2], scope: "live", status: "active", paymentStatus: "not_required",
      tier: "M", source: "trial", billingId: null, corporateId: null,
      startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 7 * 86_400_000),
      rules: { quota: 8, dailyLimit: 2, quotaMode: "shared", physicalQuota: 8, premiumQuota: 0, liveQuota: 8 },
    });
    const charged = transaction("tran_paid_trial_conflict", billing, agreementId);
    assert.equal(await deliver(`${prefix}-trial-conflict`, charged), "processed");
    const [trial] = await db.select().from(memberships)
      .where(and(eq(memberships.userId, memberIds[2]), eq(memberships.scope, "live")));
    const [conflictedBilling] = await db.select().from(membershipBilling)
      .where(eq(membershipBilling.id, billing.id));
    assert.equal(trial.source, "trial");
    assert.equal(trial.paymentStatus, "not_required");
    assert.equal(conflictedBilling.status, "conflict");
    assert.equal(conflictedBilling.paymentStatus, "paid");
    assert.equal(conflictedBilling.lastPaymentId, "tran_paid_trial_conflict");
  });
});

after(async () => {
  setPayTabsFetchOverrideForTests(null);
  if (deliveryIds.length) await db.delete(paymentWebhookEvents).where(inArray(paymentWebhookEvents.deliveryId, deliveryIds));
  if (memberIds.length) await db.delete(memberships).where(inArray(memberships.userId, memberIds));
  if (billingIds.length) await db.delete(membershipBilling).where(inArray(membershipBilling.id, billingIds));
  await db.delete(membershipPlans).where(eq(membershipPlans.id, localPlanId));
  await pool.end();
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
