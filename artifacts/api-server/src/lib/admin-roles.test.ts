import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ROLE_PERMISSIONS,
  hasAdminPermission,
  isFinanceStaff,
  isOperationsPortalRole,
  isSupportAdministrator,
  isSupportStaff,
  type AdminPermission,
} from "./admin-roles";

const permissions: AdminPermission[] = [
  "support",
  "membership_support",
  "partner_operations",
  "finance",
  "content",
  "marketing",
  "corporate",
  "fraud_compliance",
  "technical",
];

test("each administrator role receives only its declared permissions", () => {
  for (const [role, granted] of Object.entries(ADMIN_ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      assert.equal(
        hasAdminPermission(role, permission),
        (granted as readonly AdminPermission[]).includes(permission),
        `${role} permission ${permission}`,
      );
    }
  }
});

test("legacy and unknown roles receive no implicit administrator access", () => {
  for (const role of ["admin", "super_admin", "unknown"]) {
    for (const permission of permissions) {
      assert.equal(hasAdminPermission(role, permission), false);
    }
    assert.equal(isOperationsPortalRole(role), false);
    assert.equal(isSupportAdministrator(role), false);
  }
});

test("existing support and finance staff retain only their own scoped access", () => {
  assert.equal(isSupportStaff("support"), true);
  assert.equal(isSupportAdministrator("support"), false);
  assert.equal(isFinanceStaff("finance"), true);
  assert.equal(hasAdminPermission("finance", "support"), false);
  assert.equal(hasAdminPermission("support", "finance"), false);
});
