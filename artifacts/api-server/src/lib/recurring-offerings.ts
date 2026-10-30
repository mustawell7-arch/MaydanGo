import { z } from "zod";
import { offeringInput } from "./operation-inputs";
import { BookingError } from "./reservations";

const BAGHDAD_TIME_ZONE = "Asia/Baghdad";
const MAX_SCHEDULE_DAYS = 90;
const MAX_OCCURRENCES = 90;

type OfferingData = z.infer<typeof offeringInput>;
type CalendarDate = { year: number; month: number; day: number };
type LocalTime = { hour: number; minute: number; second: number };

export type WeeklyOfferingSchedule = {
  repeatUntil: string;
  weekdays: number[];
};

function calendarDateFromString(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BookingError(400, "Choose a valid final date for this weekly schedule.");

  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const roundTrip = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (roundTrip.getUTCFullYear() !== date.year
    || roundTrip.getUTCMonth() + 1 !== date.month
    || roundTrip.getUTCDate() !== date.day) {
    throw new BookingError(400, "Choose a valid final date for this weekly schedule.");
  }
  return date;
}

function dateString(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dateOrdinal(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(dateOrdinal(date) + days * 86_400_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function baghdadParts(value: Date): CalendarDate & LocalTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BAGHDAD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function localBaghdadTime(date: CalendarDate, time: LocalTime): Date {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second);
  let candidate = new Date(wallClock);

  // Resolve the wall clock time using the IANA zone instead of the server's timezone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const displayed = baghdadParts(candidate);
    const displayedAsUtc = Date.UTC(
      displayed.year, displayed.month - 1, displayed.day,
      displayed.hour, displayed.minute, displayed.second,
    );
    candidate = new Date(wallClock - (displayedAsUtc - candidate.getTime()));
  }

  const actual = baghdadParts(candidate);
  if (actual.year !== date.year || actual.month !== date.month || actual.day !== date.day
    || actual.hour !== time.hour || actual.minute !== time.minute || actual.second !== time.second) {
    throw new BookingError(400, "That local Iraq time is not valid on one of the selected dates.");
  }
  return candidate;
}

export function expandWeeklyOffering(
  template: OfferingData,
  schedule: WeeklyOfferingSchedule,
): OfferingData[] {
  const startTemplate = baghdadParts(new Date(template.startsAt));
  const endTemplate = baghdadParts(new Date(template.endsAt));
  const cancellationTemplate = baghdadParts(new Date(template.cancellationDeadline));
  const startDate = { year: startTemplate.year, month: startTemplate.month, day: startTemplate.day };
  const until = calendarDateFromString(schedule.repeatUntil);
  const dayRange = (dateOrdinal(until) - dateOrdinal(startDate)) / 86_400_000;

  if (dayRange < 0 || dayRange >= MAX_SCHEDULE_DAYS) {
    throw new BookingError(400, "The final date must be within 90 days of the first date.");
  }
  if (schedule.weekdays.length < 1 || schedule.weekdays.length > 7
    || schedule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
    || new Set(schedule.weekdays).size !== schedule.weekdays.length) {
    throw new BookingError(400, "Choose one or more different weekdays for this schedule.");
  }

  const endDayOffset = (dateOrdinal(endTemplate) - dateOrdinal(startTemplate)) / 86_400_000;
  const cancellationDayOffset = (dateOrdinal(cancellationTemplate) - dateOrdinal(startTemplate)) / 86_400_000;
  const weekdays = new Set(schedule.weekdays);
  const occurrences: OfferingData[] = [];

  for (let offset = 0; offset <= dayRange; offset += 1) {
    const date = addCalendarDays(startDate, offset);
    if (!weekdays.has(new Date(dateOrdinal(date)).getUTCDay())) continue;

    const startsAt = localBaghdadTime(date, startTemplate);
    const endsAt = localBaghdadTime(addCalendarDays(date, endDayOffset), endTemplate);
    const cancellationDeadline = localBaghdadTime(addCalendarDays(date, cancellationDayOffset), cancellationTemplate);
    occurrences.push(offeringInput.parse({
      ...template,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      cancellationDeadline: cancellationDeadline.toISOString(),
    }));
  }

  if (!occurrences.length) {
    throw new BookingError(400, "No sessions fall on the selected weekdays in this date range.");
  }
  if (occurrences.length > MAX_OCCURRENCES) {
    throw new BookingError(400, "A weekly schedule can contain no more than 90 sessions.");
  }
  for (let index = 1; index < occurrences.length; index += 1) {
    if (new Date(occurrences[index].startsAt) < new Date(occurrences[index - 1].endsAt)) {
      throw new BookingError(400, "Sessions in one schedule must not overlap.");
    }
  }

  return occurrences;
}
