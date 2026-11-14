import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, supportTicketEvents, supportTickets } from "@workspace/db";
import {
  ActivePrivacyRequestError,
  createMemberPrivacyRequest,
  getMemberPrivacyExportAccess,
  getPrivacyRequestCopy,
  listMemberPrivacyRequests,
  parsePrivacyExportExpiry,
  PRIVACY_EXPORT_WINDOW_MS,
  recordMemberPrivacyExportDownload,
} from "./privacy-requests";

test("privacy request copy is available in English, Arabic, and Sorani Kurdish", () => {
  for (const language of ["en", "ar", "ku"] as const) {
    for (const kind of ["data_export", "account_deletion"] as const) {
      const copy = getPrivacyRequestCopy(kind, language);
      assert.ok(copy.subject.length >= 4);
      assert.ok(copy.message.length >= 10);
    }
  }
});

test("account deletion request copy makes clear that deletion is not immediate", () => {
  assert.match(getPrivacyRequestCopy("account_deletion", "en").message, /does not delete my account immediately/i);
  assert.match(getPrivacyRequestCopy("account_deletion", "ar").message, /لا يحذف الحساب فوراً/);
  assert.match(getPrivacyRequestCopy("account_deletion", "ku").message, /دەستبەجێ ناسڕێتەوە/);
});

test("privacy requests are stored as private support cases and duplicates stay blocked while active", async t => {
  const userId = `privacy-test-${randomUUID()}`;
  t.after(async () => {
    await db.delete(supportTickets).where(eq(supportTickets.userId, userId));
  });

  const created = await createMemberPrivacyRequest(userId, "data_export", "en");
  assert.equal(created.status, "open");
  assert.equal(created.subject, getPrivacyRequestCopy("data_export", "en").subject);

  const listed = await listMemberPrivacyRequests(userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);
  assert.equal(listed[0].kind, "data_export");
  assert.equal(listed[0].exportAvailableUntil, null);

  await assert.rejects(
    createMemberPrivacyRequest(userId, "data_export", "en"),
    ActivePrivacyRequestError,
  );
  assert.equal(
    (await createMemberPrivacyRequest(userId, "account_deletion", "en")).kind,
    "account_deletion",
  );
});

test("privacy exports require verified approval, are owner-scoped, and record downloads", async t => {
  const userId = `privacy-export-test-${randomUUID()}`;
  t.after(async () => {
    await db.delete(supportTickets).where(eq(supportTickets.userId, userId));
  });

  const request = await createMemberPrivacyRequest(userId, "data_export", "en");
  assert.equal(await getMemberPrivacyExportAccess(userId, request.id).then(value => value?.exportAvailableUntil ?? null), null);

  const expiry = new Date(Date.now() + PRIVACY_EXPORT_WINDOW_MS);
  const createdAt = new Date();
  await db.insert(supportTicketEvents).values({
    id: randomUUID(),
    ticketId: request.id,
    actorId: "support-export-test",
    action: "privacy_export_ready",
    detail: `identityVerified=true;expiresAt=${expiry.toISOString()}`,
    createdAt,
  });

  const access = await getMemberPrivacyExportAccess(userId, request.id);
  assert.equal(access?.exportAvailableUntil?.toISOString(), expiry.toISOString());
  assert.equal(await getMemberPrivacyExportAccess(`${userId}-other`, request.id), null);
  assert.equal(parsePrivacyExportExpiry(`expiresAt=${expiry.toISOString()}`), null);

  await recordMemberPrivacyExportDownload(userId, request.id);
  const events = await db.select({ action: supportTicketEvents.action })
    .from(supportTicketEvents).where(eq(supportTicketEvents.ticketId, request.id));
  assert.ok(events.some(event => event.action === "privacy_export_downloaded"));
});

test("privacy export approval window is 24 hours", () => {
  assert.equal(PRIVACY_EXPORT_WINDOW_MS, 24 * 60 * 60 * 1000);
});
