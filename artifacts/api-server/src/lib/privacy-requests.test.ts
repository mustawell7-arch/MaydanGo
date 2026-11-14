import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, supportTickets } from "@workspace/db";
import {
  ActivePrivacyRequestError,
  createMemberPrivacyRequest,
  getPrivacyRequestCopy,
  listMemberPrivacyRequests,
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

  await assert.rejects(
    createMemberPrivacyRequest(userId, "account_deletion", "en"),
    ActivePrivacyRequestError,
  );
});
