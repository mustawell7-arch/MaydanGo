import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  ACTIVE_RESERVATION_STATUSES, db, membershipBilling, membershipPlans, memberships, offerings,
  paymentWebhookEvents, reservations,
} from "@workspace/db";
import { PaymentError, paymentsEnabled, requirePayTabsCredentials } from "./payment-config";
import { payTabsRequest } from "./paytabs-client";

type JsonObject = Record<string, unknown>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BillingRow = typeof membershipBilling.$inferSelect;
type PayTabsEventResult = "processed" | "ignored" | "duplicate";

const asObject = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length ? value.trim() : null;
const nestedId = (value: unknown): string | null => text(asObject(value)?.id);
const parseAmount = (value: unknown): number | null => {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) ? amount : null;
};
const sameAmount = (a: unknown, b: number): boolean => {
  const parsed = parseAmount(a);
  return parsed !== null && Math.abs(parsed - b) < 0.0001;
};
const providerAgreementId = (value: JsonObject): string | null =>
  text(value.agreement_id) ?? nestedId(value.agreement);

export function validatePaidPlan(priceIqd: number | null | undefined): void {
  if (!Number.isInteger(priceIqd) || !priceIqd || priceIqd < 1 || priceIqd > 1_000_000_000) {
    throw new PaymentError(400, "Paid plans need a valid whole-number IQD price.");
  }
}

export async function listMemberPlans() {
  const rows = await db.select().from(membershipPlans).where(eq(membershipPlans.active, true));
  return rows.map(({ whopPlanId: _legacyProviderId, ...plan }) => ({
    ...plan,
    purchasable: plan.kind === "paid" && paymentsEnabled() &&
      Number.isInteger(plan.priceIqd) && Number(plan.priceIqd) > 0,
    priceLabel: plan.kind === "paid" && Number.isInteger(plan.priceIqd)
      ? `${Number(plan.priceIqd).toLocaleString("en-IQ")} IQD`
      : null,
    availabilityMessage: plan.kind === "paid" && !paymentsEnabled()
      ? "Paid checkout is not enabled yet. No charge or access activation can occur until the PayTabs account and recurring billing are verified."
      : plan.kind === "paid" && (!Number.isInteger(plan.priceIqd) || Number(plan.priceIqd) < 1)
        ? "This paid plan needs an IQD price."
        : null,
  }));
}

function formatPayTabsDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  const day = part("day"), month = part("month"), year = part("year");
  if (!day || !month || !year) throw new Error("Unable to format the PayTabs renewal date.");
  return `${day}/${month}/${year}`;
}

function validHostedCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "secure-iraq.paytabs.com" &&
      url.pathname.startsWith("/payment/");
  } catch {
    return false;
  }
}

export async function createMemberCheckout(userId: string, localPlanId: string) {
  if (!paymentsEnabled()) throw new PaymentError(503, "Paid checkout is not enabled yet.");
  const now = new Date();
  const intent = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [current] = await tx.select().from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.scope, "live")));
    if (current?.source === "paid" && current.paymentStatus === "past_due" &&
        current.startsAt <= now && current.endsAt > now) {
      throw new PaymentError(409, "Resolve the current subscription payment before starting another membership.");
    }
    if (current && ["active", "trial", "scheduled_cancellation"].includes(current.status) && current.endsAt > now) {
      throw new PaymentError(409, "An active live membership already exists.");
    }
    const [pending] = await tx.select().from(membershipBilling)
      .where(and(eq(membershipBilling.userId, userId), eq(membershipBilling.status, "pending")))
      .orderBy(desc(membershipBilling.createdAt)).limit(1);
    if (pending?.purchaseUrl) {
      if (pending.planId !== localPlanId) {
        throw new PaymentError(409, "Finish or cancel the existing checkout before choosing another plan.");
      }
      return pending;
    }
    if (pending) throw new PaymentError(409, "A checkout is already being prepared. Try again shortly.");

    const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, localPlanId));
    if (!plan?.active || plan.kind !== "paid") {
      throw new PaymentError(404, "This paid plan is not ready for checkout.");
    }
    validatePaidPlan(plan.priceIqd);
    const periodEndsAt = new Date(now.getTime() + plan.durationDays * 86_400_000);
    const [row] = await tx.insert(membershipBilling).values({
      id: randomUUID(), userId, planId: plan.id, status: "pending", paymentStatus: "pending",
      amountIqd: plan.priceIqd!, periodStartsAt: now, periodEndsAt,
    }).returning();
    return { ...row, durationDays: plan.durationDays, planName: plan.name };
  });

  if (intent.purchaseUrl) return { purchaseUrl: intent.purchaseUrl };
  if (!intent.amountIqd || !intent.periodEndsAt || !("durationDays" in intent)) {
    throw new PaymentError(409, "This paid plan is not ready for checkout.");
  }

  try {
    const callbackUrl = process.env.PAYTABS_CALLBACK_URL;
    const returnUrl = process.env.PAYTABS_RETURN_URL;
    if (!callbackUrl || !returnUrl) throw new PaymentError(503, "PayTabs callback settings are not configured.");
    const response = await payTabsRequest("/payment/request", {
      tran_type: "sale",
      tran_class: "ecom",
      cart_id: intent.id,
      cart_currency: "IQD",
      cart_amount: intent.amountIqd,
      cart_description: `${intent.planName} membership`,
      paypage_lang: "en",
      callback: callbackUrl,
      return: returnUrl,
      user_defined: { udf1: intent.id },
      agreement: {
        agreement_description: `${intent.planName} membership`,
        agreement_currency: "IQD",
        initial_amount: intent.amountIqd,
        repeat_amount: intent.amountIqd,
        repeat_terms: 0,
        repeat_period: 1,
        repeat_every: intent.durationDays,
        first_installment_due_date: formatPayTabsDate(intent.periodEndsAt),
      },
    });
    const purchaseUrl = text(response.redirect_url);
    const checkoutRef = text(response.tran_ref);
    if (!purchaseUrl || !validHostedCheckoutUrl(purchaseUrl) || !checkoutRef) {
      throw new Error("PayTabs did not return a valid hosted checkout.");
    }
    const [updated] = await db.update(membershipBilling).set({
      providerCheckoutRef: checkoutRef,
      purchaseUrl,
      updatedAt: new Date(),
    }).where(eq(membershipBilling.id, intent.id)).returning();
    if (!updated) throw new Error("Unable to save the PayTabs checkout.");
    return { purchaseUrl };
  } catch (error) {
    await db.update(membershipBilling).set({ status: "failed", paymentStatus: "failed", updatedAt: new Date() })
      .where(eq(membershipBilling.id, intent.id));
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(502, "Checkout could not be prepared. Please try again.");
  }
}

async function expirePaidAccess(billingId: string): Promise<void> {
  await db.transaction(async tx => {
    const [billing] = await tx.select().from(membershipBilling).where(eq(membershipBilling.id, billingId)).for("update");
    if (!billing) return;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${billing.userId}))`);
    const now = new Date();
    await tx.update(membershipBilling).set({ status: "expired", paymentStatus: "expired", updatedAt: now })
      .where(eq(membershipBilling.id, billing.id));
    await tx.update(memberships).set({ status: "terminated", paymentStatus: "expired" })
      .where(and(eq(memberships.userId, billing.userId), eq(memberships.scope, "live"),
        eq(memberships.source, "paid"), eq(memberships.billingId, billing.id)));
    await cancelUpcomingLiveReservations(tx, billing.userId, now);
  });
}

export async function memberSubscription(userId: string) {
  const [row] = await db.select().from(membershipBilling)
    .where(and(eq(membershipBilling.userId, userId), inArray(membershipBilling.status, ["pending", "active", "past_due"])))
    .orderBy(desc(membershipBilling.createdAt)).limit(1);
  if (!row) return null;
  if (["active", "past_due"].includes(row.status) && row.periodEndsAt && row.periodEndsAt <= new Date()) {
    await expirePaidAccess(row.id);
    return {
      status: "expired", paymentStatus: "expired", cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      periodEndsAt: row.periodEndsAt, recoveryUrl: null, refundStatus: row.refundStatus,
    };
  }
  return {
    status: row.status,
    paymentStatus: row.paymentStatus,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    periodEndsAt: row.periodEndsAt,
    recoveryUrl: row.recoveryUrl,
    refundStatus: row.refundStatus,
  };
}

async function verifiedBillingAgreement(billing: BillingRow): Promise<string> {
  if (!billing.paytabsAgreementId) {
    throw new PaymentError(409, "The PayTabs agreement reference is not available yet.");
  }
  return billing.paytabsAgreementId;
}

async function cancelProviderAgreement(agreementId: string): Promise<void> {
  const response = await payTabsRequest("/payment/agreement/cancel", { agreement_id: agreementId });
  if (text(response.status)?.toLowerCase() !== "success") {
    throw new PaymentError(502, "PayTabs did not confirm agreement cancellation.");
  }
}

export async function cancelMemberSubscription(userId: string) {
  if (!paymentsEnabled()) throw new PaymentError(503, "Subscription management is not enabled yet.");
  const [billing] = await db.select().from(membershipBilling)
    .where(and(eq(membershipBilling.userId, userId), inArray(membershipBilling.status, ["active", "past_due"])))
    .orderBy(desc(membershipBilling.createdAt)).limit(1);
  if (!billing) throw new PaymentError(404, "No paid subscription was found.");
  if (billing.cancelAtPeriodEnd) return { cancelAtPeriodEnd: true, periodEndsAt: billing.periodEndsAt };

  const agreementId = await verifiedBillingAgreement(billing);
  await cancelProviderAgreement(agreementId);
  await db.update(membershipBilling).set({
    cancelAtPeriodEnd: true, updatedAt: new Date(),
  }).where(eq(membershipBilling.id, billing.id));
  return { cancelAtPeriodEnd: true, periodEndsAt: billing.periodEndsAt };
}

export async function cancelPaidSubscriptionImmediately(userId: string): Promise<void> {
  const [billing] = await db.select().from(membershipBilling)
    .where(and(eq(membershipBilling.userId, userId), inArray(membershipBilling.status, ["active", "past_due"])))
    .orderBy(desc(membershipBilling.createdAt)).limit(1);
  if (!billing) return;
  const agreementId = await verifiedBillingAgreement(billing);
  await cancelProviderAgreement(agreementId);
  await endPaidAccess(billing.id, "canceled");
}

async function cancelUpcomingLiveReservations(tx: Tx, userId: string, now = new Date()) {
  const future = await tx.select({ id: offerings.id }).from(offerings)
    .where(and(eq(offerings.scope, "live"), gt(offerings.startsAt, now)));
  if (future.length) {
    await tx.update(reservations).set({ status: "cancelled", cancelledAt: now })
      .where(and(eq(reservations.userId, userId), inArray(reservations.offeringId, future.map(row => row.id)),
        inArray(reservations.status, ACTIVE_RESERVATION_STATUSES)));
  }
}

async function endPaidAccess(billingId: string, paymentStatus: string) {
  await db.transaction(async tx => {
    const [billing] = await tx.select().from(membershipBilling).where(eq(membershipBilling.id, billingId)).for("update");
    if (!billing) return;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${billing.userId}))`);
    await tx.update(membershipBilling).set({
      status: paymentStatus === "refunded" ? "refunded" : "canceled",
      paymentStatus, updatedAt: new Date(),
    }).where(eq(membershipBilling.id, billingId));
    const [membership] = await tx.select().from(memberships)
      .where(and(eq(memberships.userId, billing.userId), eq(memberships.scope, "live")));
    if (membership?.source === "paid" && membership.billingId === billing.id) {
      await tx.update(memberships).set({ status: "terminated", paymentStatus })
        .where(and(eq(memberships.userId, billing.userId), eq(memberships.scope, "live")));
      await cancelUpcomingLiveReservations(tx, billing.userId);
    }
  });
}

function transactionDate(transaction: JsonObject, fallback = new Date()): Date {
  const result = asObject(transaction.payment_result);
  const date = text(result?.transaction_time);
  const parsed = date ? new Date(date) : fallback;
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

async function findBillingForEvent(payload: JsonObject, query?: JsonObject): Promise<BillingRow | null> {
  const objects = [payload, query].filter((value): value is JsonObject => Boolean(value));
  for (const data of objects) {
    const cartId = text(data.cart_id);
    const userDefined = asObject(data.user_defined);
    const billingId = text(userDefined?.udf1);
    const agreementId = providerAgreementId(data);
    if (cartId) {
      const [row] = await db.select().from(membershipBilling).where(eq(membershipBilling.id, cartId));
      if (row) return row;
    }
    if (billingId) {
      const [row] = await db.select().from(membershipBilling).where(eq(membershipBilling.id, billingId));
      if (row) return row;
    }
    if (agreementId) {
      const [row] = await db.select().from(membershipBilling)
        .where(eq(membershipBilling.paytabsAgreementId, agreementId));
      if (row) return row;
    }
  }
  return null;
}

async function applyVerifiedPayment(
  billingId: string,
  transaction: JsonObject,
  agreementId: string,
): Promise<void> {
  const now = new Date();
  const tranRef = text(transaction.tran_ref);
  if (!tranRef) return;
  await db.transaction(async tx => {
    const [billing] = await tx.select().from(membershipBilling).where(eq(membershipBilling.id, billingId)).for("update");
    if (!billing || billing.lastPaymentId === tranRef) return;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${billing.userId}))`);
    const flagPaidConflict = async () => {
      await tx.update(membershipBilling).set({
        status: "conflict", paymentStatus: "paid", providerMembershipStatus: "A",
        paytabsAgreementId: billing.paytabsAgreementId ?? agreementId,
        lastPaymentId: tranRef, updatedAt: now,
      }).where(eq(membershipBilling.id, billing.id));
    };
    const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, billing.planId));
    if (!plan?.active || plan.kind !== "paid" || !billing.amountIqd ||
        plan.priceIqd !== billing.amountIqd ||
        (billing.paytabsAgreementId && billing.paytabsAgreementId !== agreementId)) {
      await flagPaidConflict();
      return;
    }

    const [existing] = await tx.select().from(memberships)
      .where(and(eq(memberships.userId, billing.userId), eq(memberships.scope, "live")));
    if (existing && existing.source !== "paid" && ["active", "trial", "scheduled_cancellation"].includes(existing.status) && existing.endsAt > now) {
      await flagPaidConflict();
      return;
    }
    if (existing?.source === "paid" && existing.status === "active" &&
        existing.billingId !== billing.id && existing.endsAt > now) {
      await flagPaidConflict();
      return;
    }

    const startsAt = transactionDate(transaction, now);
    const endsAt = new Date(startsAt.getTime() + plan.durationDays * 86_400_000);
    if (!endsAt || !Number.isFinite(endsAt.getTime()) || endsAt <= now) {
      await flagPaidConflict();
      return;
    }

    await tx.update(membershipBilling).set({
      status: "active", paymentStatus: "paid", providerMembershipStatus: "A",
      paytabsAgreementId: agreementId, lastPaymentId: tranRef, recoveryUrl: null,
      periodStartsAt: startsAt, periodEndsAt: endsAt, updatedAt: now,
    }).where(eq(membershipBilling.id, billing.id));
    await tx.insert(memberships).values({
      userId: billing.userId, scope: "live", status: "active", paymentStatus: "paid",
      tier: plan.tier, source: "paid", billingId: billing.id, corporateId: null,
      startsAt, endsAt, rules: plan.rules,
    }).onConflictDoUpdate({
      target: [memberships.userId, memberships.scope],
      set: {
        status: "active", paymentStatus: "paid", tier: plan.tier, source: "paid",
        billingId: billing.id, corporateId: null, startsAt, endsAt, rules: plan.rules,
      },
    });
  });
}

async function applyFailedPayment(billing: BillingRow, transaction: JsonObject): Promise<void> {
  const now = new Date();
  const status = text(asObject(transaction.payment_result)?.response_status) ?? "unknown";
  const agreementId = providerAgreementId(transaction);
  if (billing.paytabsAgreementId && agreementId && billing.paytabsAgreementId !== agreementId) return;
  if (billing.status === "pending") {
    await db.update(membershipBilling).set({
      status: "failed", paymentStatus: "failed", providerMembershipStatus: status, updatedAt: now,
    }).where(and(eq(membershipBilling.id, billing.id), eq(membershipBilling.status, "pending")));
    return;
  }
  if (!["active", "past_due"].includes(billing.status) || !billing.paytabsAgreementId) return;
  await db.transaction(async tx => {
    await tx.update(membershipBilling).set({
      status: "past_due", paymentStatus: "past_due", providerMembershipStatus: status, updatedAt: now,
    }).where(eq(membershipBilling.id, billing.id));
    await tx.update(memberships).set({ status: "paused", paymentStatus: "past_due" })
      .where(and(eq(memberships.userId, billing.userId), eq(memberships.scope, "live"),
        eq(memberships.source, "paid"), eq(memberships.billingId, billing.id)));
  });
}

async function processPayTabsEvent(payload: JsonObject): Promise<"processed" | "ignored"> {
  const tranRef = text(payload.tran_ref);
  if (!tranRef) return "ignored";
  const callbackCartId = text(payload.cart_id);
  const query = await payTabsRequest("/payment/query", { tran_ref: tranRef });
  const { profileId } = requirePayTabsCredentials();
  const queryProfile = text(query.profile_id);
  if (queryProfile !== profileId || text(query.tran_ref) !== tranRef ||
      (callbackCartId && text(query.cart_id) !== callbackCartId)) return "ignored";

  const billing = await findBillingForEvent(payload, query);
  if (!billing || !billing.amountIqd) return "ignored";
  const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.id, billing.planId));
  if (!plan || plan.kind !== "paid" ||
      !sameAmount(query.cart_amount, billing.amountIqd) ||
      text(query.cart_currency)?.toUpperCase() !== "IQD") return "ignored";

  const status = text(asObject(query.payment_result)?.response_status);
  if (status === "A") {
    const agreementId = providerAgreementId(query) ?? providerAgreementId(payload);
    if (!agreementId) {
      throw new PaymentError(503, "The PayTabs recurring agreement reference is not available yet.");
    }
    const queryUserData = asObject(query.user_defined);
    const callbackUserData = asObject(payload.user_defined);
    const hasLocalOwnership = text(query.cart_id) === billing.id ||
      text(queryUserData?.udf1) === billing.id ||
      text(callbackUserData?.udf1) === billing.id ||
      Boolean(billing.paytabsAgreementId && agreementId === billing.paytabsAgreementId);
    if (!hasLocalOwnership) {
      await db.update(membershipBilling).set({ status: "conflict", updatedAt: new Date() })
        .where(eq(membershipBilling.id, billing.id));
      return "ignored";
    }
    await applyVerifiedPayment(billing.id, query, agreementId);
    return "processed";
  }

  if (status && ["D", "E", "C"].includes(status)) {
    const txClass = text(query.tran_class)?.toLowerCase();
    const isRecurring = txClass === "recurring" || Boolean(billing.paytabsAgreementId);
    if (isRecurring && billing.paytabsAgreementId &&
        providerAgreementId(query) && providerAgreementId(query) !== billing.paytabsAgreementId) return "ignored";
    await applyFailedPayment(billing, query);
    return "processed";
  }
  if (!status || !["D", "E", "C"].includes(status)) {
    throw new PaymentError(503, "The PayTabs transaction has not reached a final status yet.");
  }
  return "ignored";
}

export async function handlePayTabsWebhook(payload: JsonObject, deliveryId: string): Promise<PayTabsEventResult> {
  const eventType = text(asObject(payload.payment_result)?.response_status) ?? "unknown";
  const eventId = `paytabs_${createHash("sha256").update(deliveryId).digest("hex")}`;
  const now = new Date();
  await db.insert(paymentWebhookEvents).values({
    id: eventId, deliveryId, eventType, status: "received", receivedAt: now, updatedAt: now,
  }).onConflictDoNothing();
  const [prior] = await db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, eventId));
  if (!prior) throw new Error("Unable to persist the PayTabs callback.");
  if (prior.status === "processed" || prior.status === "ignored") return "duplicate";

  const [claimed] = await db.update(paymentWebhookEvents).set({ status: "processing", updatedAt: now })
    .where(and(eq(paymentWebhookEvents.id, eventId), inArray(paymentWebhookEvents.status, ["received", "failed"])))
    .returning();
  if (!claimed) {
    const staleBefore = new Date(Date.now() - 60_000);
    const [reclaimed] = await db.update(paymentWebhookEvents).set({ status: "processing", updatedAt: now })
      .where(and(eq(paymentWebhookEvents.id, eventId), eq(paymentWebhookEvents.status, "processing"),
        sql`${paymentWebhookEvents.updatedAt} < ${staleBefore}`)).returning();
    if (!reclaimed) return "duplicate";
  }
  try {
    const outcome = await processPayTabsEvent(payload);
    await db.update(paymentWebhookEvents).set({
      status: outcome, processedAt: new Date(), updatedAt: new Date(),
    }).where(eq(paymentWebhookEvents.id, eventId));
    return outcome;
  } catch (error) {
    await db.update(paymentWebhookEvents).set({ status: "failed", updatedAt: new Date() })
      .where(eq(paymentWebhookEvents.id, eventId));
    throw error;
  }
}

export async function requestFullRefund(userId: string, _reason: string) {
  if (!paymentsEnabled()) throw new PaymentError(503, "Refunds are not enabled yet.");
  const [billing] = await db.select().from(membershipBilling)
    .where(and(eq(membershipBilling.userId, userId),
      inArray(membershipBilling.status, ["active", "past_due", "conflict"]),
      eq(membershipBilling.paymentStatus, "paid")))
    .orderBy(desc(membershipBilling.createdAt)).limit(1);
  if (!billing?.lastPaymentId || !billing.amountIqd) {
    throw new PaymentError(404, "No refundable paid membership was found.");
  }
  if (!["none", "failed"].includes(billing.refundStatus)) {
    throw new PaymentError(409, "A refund is already being processed.");
  }
  const [claimed] = await db.update(membershipBilling).set({ refundStatus: "requested", updatedAt: new Date() })
    .where(and(eq(membershipBilling.id, billing.id), inArray(membershipBilling.refundStatus, ["none", "failed"]))).returning();
  if (!claimed) throw new PaymentError(409, "A refund is already being processed.");

  let refundRequestSubmitted = false;
  try {
    const previous = await payTabsRequest("/payment/query", { tran_ref: billing.lastPaymentId });
    const { profileId } = requirePayTabsCredentials();
    if (text(previous.profile_id) !== profileId || text(previous.tran_ref) !== billing.lastPaymentId ||
        text(asObject(previous.payment_result)?.response_status) !== "A" ||
        !sameAmount(previous.cart_amount, billing.amountIqd) ||
        text(previous.cart_currency)?.toUpperCase() !== "IQD" ||
        (providerAgreementId(previous) && providerAgreementId(previous) !== billing.paytabsAgreementId)) {
      throw new PaymentError(409, "The latest charge could not be verified for a full refund.");
    }
    const agreementId = await verifiedBillingAgreement(billing);
    if (!billing.cancelAtPeriodEnd) {
      await cancelProviderAgreement(agreementId);
      await db.update(membershipBilling).set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(membershipBilling.id, billing.id));
    }
    refundRequestSubmitted = true;
    const refund = await payTabsRequest("/payment/request", {
      tran_type: "refund",
      tran_class: "recurring",
      cart_id: `${billing.id}-refund`,
      cart_currency: "IQD",
      cart_amount: billing.amountIqd,
      cart_description: "MaydanGo membership refund",
      tran_ref: billing.lastPaymentId,
    });
    const refundResult = asObject(refund.payment_result);
    if (text(refund.previous_tran_ref) !== billing.lastPaymentId ||
        text(refundResult?.response_status) !== "A" ||
        !sameAmount(refund.cart_amount, billing.amountIqd) ||
        text(refund.cart_currency)?.toUpperCase() !== "IQD") {
      await db.update(membershipBilling).set({ refundStatus: "pending", cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(membershipBilling.id, billing.id));
      return { status: "pending" as const };
    }
    await db.update(membershipBilling).set({ refundStatus: "completed", cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(membershipBilling.id, billing.id));
    await endPaidAccess(billing.id, "refunded");
    return { status: "completed" as const };
  } catch (error) {
    await db.update(membershipBilling).set({
      refundStatus: refundRequestSubmitted ? "pending" : "failed",
      updatedAt: new Date(),
    }).where(eq(membershipBilling.id, billing.id));
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(502, "The refund could not be confirmed yet. Check the membership before retrying.");
  }
}
