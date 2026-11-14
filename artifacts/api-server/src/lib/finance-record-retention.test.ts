import { test } from "node:test";
import assert from "node:assert/strict";
import { financeRecordRetentionUntil } from "./finance-record-retention";

test("finance records are retained for ten calendar years", () => {
  assert.equal(
    financeRecordRetentionUntil(new Date("2026-11-14T12:30:00.000Z")).toISOString(),
    "2036-11-14T12:30:00.000Z",
  );
});

test("leap-day finance records end on the final day of February", () => {
  assert.equal(
    financeRecordRetentionUntil(new Date("2024-02-29T08:00:00.000Z")).toISOString(),
    "2034-02-28T08:00:00.000Z",
  );
});
