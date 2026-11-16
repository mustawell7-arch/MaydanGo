import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSIGNABLE_PARTNER_ROLES,
  PARTNER_ROLE_PERMISSIONS,
  canManagePartnerStaff,
  canPartnerUseOperationsRoute,
  hasPartnerPermission,
  isPartnerOperatorRole,
  isPartnerOwnerRole,
} from "./partner-roles";

test("partner roles receive only the permissions declared for their responsibilities", () => {
  assert.deepEqual(PARTNER_ROLE_PERMISSIONS.partner_reception, ["operations", "attendance"]);
  assert.equal(hasPartnerPermission("partner_reception", "finance"), false);
  assert.equal(hasPartnerPermission("partner_reception", "staff"), false);
  assert.equal(hasPartnerPermission("partner_finance", "attendance"), false);
  assert.equal(hasPartnerPermission("partner_finance", "finance"), true);
  assert.equal(hasPartnerPermission("partner_manager", "staff"), false);
  assert.equal(hasPartnerPermission("partner_manager", "sessions"), true);
  assert.equal(hasPartnerPermission("partner_manager", "courses"), false);
});

test("existing partner accounts keep owner access and only delegated roles are assignable", () => {
  assert.equal(isPartnerOperatorRole("partner"), true);
  assert.equal(isPartnerOwnerRole("partner"), true);
  assert.equal(isPartnerOwnerRole("partner_manager"), false);
  assert.equal(hasPartnerPermission("partner", "staff"), true);
  assert.deepEqual(ASSIGNABLE_PARTNER_ROLES, [
    "partner_manager",
    "partner_reception",
    "partner_finance",
  ]);
  assert.equal(isPartnerOperatorRole("admin"), false);
});

test("only the approved primary partner owner can manage its own staff", () => {
  const partner = { id: "partner-a", ownerUserId: "owner-a", approved: true };
  assert.equal(canManagePartnerStaff(
    { userId: "owner-a", role: "partner", partnerId: "partner-a" },
    partner,
  ), true);
  assert.equal(canManagePartnerStaff(
    { userId: "manager-a", role: "partner_manager", partnerId: "partner-a" },
    partner,
  ), false);
  assert.equal(canManagePartnerStaff(
    { userId: "owner-b", role: "partner", partnerId: "partner-a" },
    partner,
  ), false);
  assert.equal(canManagePartnerStaff(
    { userId: "owner-a", role: "partner", partnerId: "partner-a" },
    { ...partner, approved: false },
  ), false);
});

test("operations routes are denied unless a partner role explicitly has the matching permission", () => {
  assert.equal(canPartnerUseOperationsRoute("partner_manager", "POST", "/offerings"), true);
  assert.equal(canPartnerUseOperationsRoute("partner_manager", "POST", "/offerings/image-upload-url"), true);
  assert.equal(canPartnerUseOperationsRoute("partner_manager", "GET", "/offerings/123/image"), true);
  assert.equal(canPartnerUseOperationsRoute("partner_reception", "POST", "/offerings"), false);
  assert.equal(canPartnerUseOperationsRoute("partner_reception", "POST", "/attendance/123/guardian-consent/upload-url"), true);
  assert.equal(canPartnerUseOperationsRoute("partner_finance", "GET", "/invoices"), true);
  assert.equal(canPartnerUseOperationsRoute("partner_finance", "POST", "/finance/payouts"), false);
  assert.equal(canPartnerUseOperationsRoute("partner_manager", "POST", "/unmapped-action"), false);
  assert.equal(canPartnerUseOperationsRoute("partner", "POST", "/unmapped-action"), true);
});
