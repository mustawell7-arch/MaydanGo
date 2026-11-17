import assert from "node:assert/strict";
import test from "node:test";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

test("member photo staging paths use an opaque owner key and a validated upload id", () => {
  const storage = new ObjectStorageService();
  const uploadId = "d9e7a2a0-04e6-4c3c-8a33-5ee1ce137cc4";
  const first = storage.getMemberProfilePhotoUploadPath("member_account_123", uploadId, "jpg");
  const second = storage.getMemberProfilePhotoUploadPath("another_member", uploadId, "jpg");

  assert.match(first, /^\/objects\/member-profile-photo-uploads\/[a-f0-9]{64}\/d9e7a2a0-04e6-4c3c-8a33-5ee1ce137cc4\.jpg$/);
  assert.notEqual(first, second);
  assert.equal(first.includes("member_account_123"), false);
  assert.throws(
    () => storage.getMemberProfilePhotoUploadPath("member_account_123", "../escape", "jpg"),
    ObjectNotFoundError,
  );
  assert.throws(
    () => storage.getMemberProfilePhotoUploadPath("member_account_123", uploadId, "svg"),
    ObjectNotFoundError,
  );
});
