import assert from "node:assert/strict";
import test from "node:test";
import { buildMemberProfileUpsert } from "./member-profile";

test("birth-date-only saves preserve an existing gender on conflict", () => {
  const write = buildMemberProfileUpsert({ birthDate: "1990-04-12" });
  assert.deepEqual(write.insert, { gender: "unspecified", birthDate: "1990-04-12" });
  assert.deepEqual(write.update, { birthDate: "1990-04-12" });
});

test("profile edits update gender only when the member supplies it", () => {
  const write = buildMemberProfileUpsert({ gender: "female", birthDate: "1990-04-12" });
  assert.deepEqual(write.update, { birthDate: "1990-04-12", gender: "female" });
});
