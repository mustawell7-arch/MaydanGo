import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  db, pool, partners, facilityProfiles, facilityCheckinPoints, facilityCheckinQrCodes,
  facilityCheckinQrActivity,
} from "@workspace/db";
import {
  createFacilityCheckinPoint, deactivateFacilityCheckinPoint, getFacilityCheckinPoints,
  issueFacilityCheckinQr, updateFacilityCheckinPoint,
} from "./facility-checkin-qr";

const suffix = randomUUID();
const partnerId = randomUUID();
const facilityId = randomUUID();
const actorId = randomUUID();
const label = { en: "Main entrance", ar: "المدخل الرئيسي", ku: "دەروازەی سەرەکی" };
const hours = Array.from({ length: 7 }, (_, day) => ({
  day, closed: false, opensAt: "06:00", closesAt: "22:00",
}));

test("facility QR points support secure issuance, rotation, retention, and deactivation", async () => {
  await db.insert(partners).values({
    id: partnerId, name: `qr-test-${suffix}`, groupId: `qr-test-${suffix}`,
    ownerUserId: actorId, approved: true,
  });
  await db.insert(facilityProfiles).values({
    id: facilityId, partnerId, city: `qr-test-${suffix}`, facility: `qr-test-${suffix}`,
    localizedName: label, localizedDistrict: label, localizedAddress: label, localizedDescription: label,
    activities: [], amenities: [], accessibility: [], openingHours: hours,
    contactPhone: null, websiteUrl: null, latitude: 33.3, longitude: 44.4,
  });
  try {
    const printed = await createFacilityCheckinPoint(facilityId, actorId, {
      label, latitude: 33.3, longitude: 44.4, radius: 100, mode: "static",
    });
    assert.match(printed.token, /^MDG2:/);
    assert.equal(printed.expiresAt, null);
    assert.equal(printed.point.hasActiveQr, true);
    const [firstCode] = await db.select().from(facilityCheckinQrCodes)
      .where(eq(facilityCheckinQrCodes.pointId, printed.point.id));
    assert.equal(firstCode.digest.length, 64);
    assert.notEqual(firstCode.digest, printed.token);

    const replacement = await issueFacilityCheckinQr(facilityId, printed.point.id, actorId);
    assert.notEqual(replacement.token, printed.token);
    const listed = await getFacilityCheckinPoints(facilityId);
    assert.equal(listed.points[0].hasActiveQr, true);
    assert.equal(listed.activity.some(item => item.action === "qr_replaced"), true);
    assert.equal(JSON.stringify(listed).includes(printed.token), false);
    const storedCodes = await db.select().from(facilityCheckinQrCodes)
      .where(eq(facilityCheckinQrCodes.pointId, printed.point.id));
    assert.equal(storedCodes.filter(code => !!code.revokedAt).length, 1);

    const dynamic = await createFacilityCheckinPoint(facilityId, actorId, {
      label: { ...label, en: "Reception desk" }, latitude: 33.3001, longitude: 44.4001, radius: 150, mode: "dynamic",
    });
    assert.ok(dynamic.expiresAt);
    assert.ok(new Date(dynamic.expiresAt).getTime() <= Date.now() + 5 * 60_000);
    const updated = await updateFacilityCheckinPoint(facilityId, dynamic.point.id, actorId, {
      label: { ...label, en: "Updated reception" }, latitude: 33.3002, longitude: 44.4002, radius: 200,
    });
    assert.equal(updated.radius, 200);
    assert.equal(updated.label.en, "Updated reception");

    const rotating = await createFacilityCheckinPoint(facilityId, actorId, {
      label: { ...label, en: "Studio entrance" }, latitude: 33.3003, longitude: 44.4003, radius: 125, mode: "rotating",
    });
    assert.ok(rotating.expiresAt);
    assert.ok(new Date(rotating.expiresAt).getTime() <= Date.now() + 60_000);

    await deactivateFacilityCheckinPoint(facilityId, dynamic.point.id, actorId);
    const afterDeactivation = await getFacilityCheckinPoints(facilityId);
    const disabledPoint = afterDeactivation.points.find(point => point.id === dynamic.point.id);
    assert.equal(disabledPoint?.active, false);
    assert.equal(disabledPoint?.hasActiveQr, false);
    assert.equal(afterDeactivation.activity.some(item => item.action === "point_deactivated"), true);
  } finally {
    const pointRows = await db.select({ id: facilityCheckinPoints.id }).from(facilityCheckinPoints)
      .where(eq(facilityCheckinPoints.facilityId, facilityId));
    const pointIds = pointRows.map(point => point.id);
    await db.delete(facilityCheckinQrActivity).where(eq(facilityCheckinQrActivity.facilityId, facilityId));
    if (pointIds.length) await db.delete(facilityCheckinQrCodes).where(eq(facilityCheckinQrCodes.pointId, pointIds[0]));
    for (const pointId of pointIds.slice(1)) {
      await db.delete(facilityCheckinQrCodes).where(eq(facilityCheckinQrCodes.pointId, pointId));
    }
    await db.delete(facilityCheckinPoints).where(eq(facilityCheckinPoints.facilityId, facilityId));
    await db.delete(facilityProfiles).where(eq(facilityProfiles.id, facilityId));
    await db.delete(partners).where(eq(partners.id, partnerId));
  }
});

after(async () => {
  await pool.end();
});
