import { test } from "node:test";
import assert from "node:assert/strict";
import { offeringInput } from "./operation-inputs";
import { expandRecurringOffering, expandWeeklyOffering } from "./recurring-offerings";

const template = offeringInput.parse({
  partnerId: "partner",
  title: "Weekly mobility",
  kind: "session",
  city: "Baghdad",
  facility: "Studio",
  category: "fitness",
  accessType: "physical",
  environment: "indoor",
  tiers: ["M"],
  startsAt: "2099-01-04T09:00:00+03:00",
  endsAt: "2099-01-04T10:00:00+03:00",
  cancellationDeadline: "2099-01-04T08:00:00+03:00",
  capacity: 12,
  active: false,
});
const firstWeekday = new Date(Date.UTC(2099, 0, 4)).getUTCDay();

test("weekly sessions expand on selected Baghdad weekdays with the same local times", () => {
  const sessions = expandWeeklyOffering(template, {
    repeatUntil: "2099-01-18",
    weekdays: [firstWeekday, (firstWeekday + 2) % 7],
  });

  assert.equal(sessions.length, 5);
  for (const session of sessions) {
    const start = new Date(session.startsAt);
    const end = new Date(session.endsAt);
    const cancellationDeadline = new Date(session.cancellationDeadline);
    const localDateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(start);
    const parts = Object.fromEntries(localDateParts.map(part => [part.type, part.value]));
    const weekday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
    assert.ok([firstWeekday, (firstWeekday + 2) % 7].includes(weekday));
    assert.equal((end.getTime() - start.getTime()) / 60_000, 60);
    assert.equal((start.getTime() - cancellationDeadline.getTime()) / 60_000, 60);
  }
  const localTimes = sessions.map(session => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(session.startsAt)));
  assert.deepEqual(localTimes, ["09:00", "09:00", "09:00", "09:00", "09:00"]);
});

test("weekly schedules reject invalid dates, duplicate weekdays, and ranges over 90 days", () => {
  assert.throws(() => expandWeeklyOffering(template, {
    repeatUntil: "2099-02-31",
    weekdays: [firstWeekday],
  }), /valid calendar date/);
  assert.throws(() => expandWeeklyOffering(template, {
    repeatUntil: "2099-01-18",
    weekdays: [firstWeekday, firstWeekday],
  }), /different weekdays/);
  assert.throws(() => expandWeeklyOffering(template, {
    repeatUntil: "2099-04-10",
    weekdays: [firstWeekday],
  }), /within 90 days/);
});

test("weekly schedules reject sessions that overlap the next occurrence", () => {
  const longSession = offeringInput.parse({
    ...template,
    endsAt: "2099-01-12T10:00:00+03:00",
  });
  assert.throws(() => expandWeeklyOffering(longSession, {
    repeatUntil: "2099-01-18",
    weekdays: [firstWeekday],
  }), /must not overlap/);
});

test("daily schedules exclude holiday dates and preserve Baghdad wall-clock times", () => {
  const sessions = expandRecurringOffering(template, {
    mode: "daily",
    interval: 1,
    repeatUntil: "2099-01-08",
    excludedDates: ["2099-01-06"],
  });
  assert.deepEqual(
    sessions.map(session => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(session.startsAt))),
    ["2099-01-04", "2099-01-05", "2099-01-07", "2099-01-08"],
  );
  assert.ok(sessions.every(session => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(session.startsAt)) === "09:00"));
});

test("custom schedules repeat selected weekdays every N weeks", () => {
  const sessions = expandRecurringOffering(template, {
    mode: "custom",
    interval: 2,
    repeatUntil: "2099-02-01",
    weekdays: [0, 2],
  });
  const days = sessions.map(session => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(session.startsAt)));
  assert.deepEqual(days, ["2099-01-04", "2099-01-06", "2099-01-18", "2099-01-20", "2099-02-01"]);
});

test("bulk schedules include the first date and apply exclusions", () => {
  const sessions = expandRecurringOffering(template, {
    mode: "dates",
    repeatUntil: "2099-01-18",
    dates: ["2099-01-08", "2099-01-12"],
    excludedDates: ["2099-01-12"],
  });
  const days = sessions.map(session => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(session.startsAt)));
  assert.deepEqual(days, ["2099-01-04", "2099-01-08"]);
});

test("recurrence inputs reject invalid intervals, out-of-range dates, and excluding every occurrence", () => {
  assert.throws(() => expandRecurringOffering(template, {
    mode: "daily", interval: 0, repeatUntil: "2099-01-18",
  }), /repeat every 1 to 30 days/);
  assert.throws(() => expandRecurringOffering(template, {
    mode: "dates", repeatUntil: "2099-01-18", dates: ["2099-01-19"],
  }), /between the first and final dates/);
  assert.throws(() => expandRecurringOffering(template, {
    mode: "daily", repeatUntil: "2099-01-04", excludedDates: ["2099-01-04"],
  }), /No sessions remain/);
});
