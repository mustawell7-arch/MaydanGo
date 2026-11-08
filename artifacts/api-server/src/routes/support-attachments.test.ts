import assert from "node:assert/strict";
import test from "node:test";
import {
  hasValidSupportAttachmentSignature,
  sanitizeSupportAttachmentFileName,
} from "./support-attachments";

test("support attachments require a real PDF or image signature", () => {
  assert.equal(hasValidSupportAttachmentSignature("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(hasValidSupportAttachmentSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(hasValidSupportAttachmentSignature("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasValidSupportAttachmentSignature("image/webp", Buffer.from("RIFF0000WEBP")), true);
  assert.equal(hasValidSupportAttachmentSignature("image/png", Buffer.from("%PDF-1.7")), false);
  assert.equal(hasValidSupportAttachmentSignature("text/html", Buffer.from("<script>")), false);
});

test("support attachment file names are reduced to a safe matching basename", () => {
  assert.equal(sanitizeSupportAttachmentFileName("../../report.pdf", "application/pdf"), "report.pdf");
  assert.equal(sanitizeSupportAttachmentFileName("صورة.png", "image/png"), "صورة.png");
  assert.throws(() => sanitizeSupportAttachmentFileName("report.html", "application/pdf"), /matching file extension/);
});
