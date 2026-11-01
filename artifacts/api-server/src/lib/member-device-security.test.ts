import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request } from "express";
import {
  getDeviceChangeActivationAt,
  readMemberDeviceToken,
  shouldFlagDeviceChange,
} from "./member-device-security";

function requestWithDeviceToken(token?: string): Request {
  return {
    header: (name: string) => name.toLowerCase() === "x-maydango-device" ? token : undefined,
  } as unknown as Request;
}

test("device installation tokens accept UUIDv4 and normalize case", () => {
  assert.equal(
    readMemberDeviceToken(requestWithDeviceToken("F47AC10B-58CC-4372-A567-0E02B2C3D479")),
    "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  );
});

test("device installation tokens reject missing and malformed values", () => {
  assert.equal(readMemberDeviceToken(requestWithDeviceToken()), null);
  assert.equal(readMemberDeviceToken(requestWithDeviceToken("not-a-device-token")), null);
  assert.equal(readMemberDeviceToken(requestWithDeviceToken("f47ac10b-58cc-1372-a567-0e02b2c3d479")), null);
});

test("device changes become eligible exactly 24 hours after request", () => {
  const requestedAt = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(
    getDeviceChangeActivationAt(requestedAt).toISOString(),
    "2026-11-01T12:00:00.000Z",
  );
});

test("the third device change within the rolling window is flagged for support", () => {
  assert.equal(shouldFlagDeviceChange(0), false);
  assert.equal(shouldFlagDeviceChange(1), false);
  assert.equal(shouldFlagDeviceChange(2), true);
  assert.equal(shouldFlagDeviceChange(3), true);
});
