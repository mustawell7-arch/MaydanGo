import assert from "node:assert/strict";
import test from "node:test";
import { iraqCalendarDate, openingState, type FacilityHoursDay } from "./facility-hours";
import { facilityHoursOverrideInput, facilityProfileFields } from "./operation-inputs";

const closedWeek = (): FacilityHoursDay[] => Array.from({ length: 7 }, (_, day) => ({
  day, closed: true, opensAt: null, closesAt: null,
}));

test("opening state follows Iraq time on the published weekday", () => {
  const hours = closedWeek();
  hours[1] = { day: 1, closed: false, opensAt: "09:00", closesAt: "18:00" };
  assert.deepEqual(openingState(hours, new Date("2026-01-05T12:00:00Z")), {
    openingStatus: "open", closesAt: "18:00",
  });
  assert.deepEqual(openingState(hours, new Date("2026-01-05T17:00:00Z")), {
    openingStatus: "closed", closesAt: null,
  });
});

test("opening state carries overnight hours across Iraq midnight", () => {
  const hours = closedWeek();
  hours[0] = { day: 0, closed: false, opensAt: "20:00", closesAt: "02:00" };
  assert.deepEqual(openingState(hours, new Date("2026-01-04T21:30:00Z")), {
    openingStatus: "open", closesAt: "02:00",
  });
});

test("missing weekly hours are unavailable and closed days remain closed", () => {
  assert.deepEqual(openingState([], new Date("2026-01-05T12:00:00Z")), {
    openingStatus: "unavailable", closesAt: null,
  });
  assert.deepEqual(openingState(closedWeek(), new Date("2026-01-05T12:00:00Z")), {
    openingStatus: "closed", closesAt: null,
  });
});

test("date-bounded closures take precedence over weekly opening hours", () => {
  const hours = closedWeek();
  hours[1] = { day: 1, closed: false, opensAt: "09:00", closesAt: "18:00" };
  const override = {
    startDate: "2026-01-05", endDate: "2026-01-06", closed: true, opensAt: null, closesAt: null,
  };
  assert.equal(iraqCalendarDate(new Date("2026-01-05T00:30:00Z")), "2026-01-05");
  assert.deepEqual(openingState(hours, new Date("2026-01-05T12:00:00Z"), [override]), {
    openingStatus: "closed", closesAt: null,
  });
  assert.deepEqual(openingState(hours, new Date("2026-01-06T12:00:00Z"), [override]), {
    openingStatus: "closed", closesAt: null,
  });
  assert.deepEqual(openingState(hours, new Date("2026-01-12T12:00:00Z"), [override]), {
    openingStatus: "open", closesAt: "18:00",
  });
});

test("special hours can open a normally closed day and honor their own closing time", () => {
  const override = {
    startDate: "2026-01-05", endDate: "2026-01-05", closed: false, opensAt: "12:00", closesAt: "15:00",
  };
  assert.deepEqual(openingState(closedWeek(), new Date("2026-01-05T09:30:00Z"), [override]), {
    openingStatus: "open", closesAt: "15:00",
  });
  assert.deepEqual(openingState(closedWeek(), new Date("2026-01-05T12:30:00Z"), [override]), {
    openingStatus: "closed", closesAt: null,
  });
});

test("special hours preserve overnight opening through Iraq midnight", () => {
  const override = {
    startDate: "2026-01-04", endDate: "2026-01-04", closed: false, opensAt: "20:00", closesAt: "02:00",
  };
  assert.deepEqual(openingState(closedWeek(), new Date("2026-01-04T22:30:00Z"), [override]), {
    openingStatus: "open", closesAt: "02:00",
  });
});

test("hours override inputs require a valid bounded date range and a complete hours shape", () => {
  const valid = {
    startDate: "2026-11-01",
    endDate: "2026-11-02",
    closed: true,
    opensAt: null,
    closesAt: null,
    localizedReason: { en: "Holiday", ar: "عطلة", ku: "پشوو" },
  };
  assert.equal(facilityHoursOverrideInput.safeParse(valid).success, true);
  assert.equal(facilityHoursOverrideInput.safeParse({ ...valid, endDate: "2026-10-30" }).success, false);
  assert.equal(facilityHoursOverrideInput.safeParse({ ...valid, endDate: "2027-11-02" }).success, false);
  assert.equal(facilityHoursOverrideInput.safeParse({ ...valid, opensAt: "09:00" }).success, false);
  assert.equal(facilityHoursOverrideInput.safeParse({
    ...valid, closed: false, opensAt: "09:00", closesAt: "18:00",
  }).success, true);
});

test("facility profiles require seven unique valid weekdays and paired coordinates", () => {
  const profile = {
    city: "Erbil",
    facility: "Central Hall",
    localizedName: { en: "Central Hall", ar: "القاعة المركزية", ku: "هۆڵی ناوەندی" },
    localizedDistrict: { en: "Citadel", ar: "القلعة", ku: "قەڵا" },
    localizedAddress: { en: "Main Street", ar: "الشارع الرئيسي", ku: "شەقامی سەرەکی" },
    localizedDescription: { en: "A local facility", ar: "مرفق محلي", ku: "شوێنێکی ناوخۆیی" },
    activities: [],
    amenities: [],
    accessibility: [],
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day, closed: day === 6, opensAt: day === 6 ? null : "09:00", closesAt: day === 6 ? null : "18:00",
    })),
    contactPhone: null,
    websiteUrl: null,
    latitude: null,
    longitude: null,
  };
  assert.equal(facilityProfileFields.safeParse(profile).success, true);
  assert.equal(facilityProfileFields.safeParse({ ...profile, latitude: 36.2 }).success, false);
  assert.equal(facilityProfileFields.safeParse({ ...profile, openingHours: profile.openingHours.slice(1) }).success, false);
  assert.equal(facilityProfileFields.safeParse({
    ...profile,
    openingHours: profile.openingHours.map(day => ({ ...day, opensAt: day.closed ? null : "27:00" })),
  }).success, false);
});
