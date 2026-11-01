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
export type RecurrenceMode = "daily" | "weekly" | "custom" | "dates";
export type RecurringOfferingSchedule = {
  repeatUntil: string;
  mode?: RecurrenceMode;
  interval?: number;
  weekdays?: number[];
  dates?: string[];
  excludedDates?: string[];
};

function calendarDateFromString(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BookingError(400, "Choose a valid calendar date for this schedule.");

  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const roundTrip = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (roundTrip.getUTCFullYear() !== date.year
    || roundTrip.getUTCMonth() + 1 !== date.month
    || roundTrip.getUTCDate() !== date.day) {
    throw new BookingError(400, "Choose a valid calendar date for this schedule.");
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

export function expandRecurringOffering(
  template: OfferingData,
  schedule: RecurringOfferingSchedule,
): OfferingData[] {
  const startTemplate = baghdadParts(new Date(template.startsAt));
  const endTemplate = baghdadParts(new Date(template.endsAt));
  const cancellationTemplate = baghdadParts(new Date(template.cancellationDeadline));
  const startDate = { year: startTemplate.year, month: startTemplate.month, day: startTemplate.day };
  const until = calendarDateFromString(schedule.repeatUntil);
  const dayRange = (dateOrdinal(until) - dateOrdinal(startDate)) / 86_400_000;

  if (dayRange < 0 || dayRange >= MAX_SCHEDULE_DAYS) {
    throw new BookingError(400, "The final date must be within 90 days of the first session.");
  }

  const mode = schedule.mode ?? "weekly";
  const interval = schedule.interval ?? 1;
  const dateRange = Array.from({ length: dayRange + 1 }, (_, offset) => addCalendarDays(startDate, offset));
  const validateWeekdays = () => {
    const weekdays = schedule.weekdays ?? [];
    if (weekdays.length < 1 || weekdays.length > 7
      || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(weekdays).size !== weekdays.length) {
      throw new BookingError(400, "Choose one or more different weekdays for this schedule.");
    }
    return new Set(weekdays);
  };

  let scheduledDates: CalendarDate[];
  if (mode === "daily") {
    if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
      throw new BookingError(400, "Daily schedules must repeat every 1 to 30 days.");
    }
    scheduledDates = dateRange.filter((_, offset) => offset % interval === 0);
  } else if (mode === "weekly" || mode === "custom") {
    if (!Number.isInteger(interval) || interval < 1 || interval > (mode === "weekly" ? 1 : 12)) {
      throw new BookingError(400, mode === "weekly"
        ? "Weekly schedules repeat every week."
        : "Custom schedules must repeat every 1 to 12 weeks.");
    }
    const weekdays = validateWeekdays();
    const firstSunday = addCalendarDays(startDate, -new Date(dateOrdinal(startDate)).getUTCDay());
    scheduledDates = dateRange.filter(date => {
      if (!weekdays.has(new Date(dateOrdinal(date)).getUTCDay())) return false;
      const weekIndex = Math.floor((dateOrdinal(date) - dateOrdinal(firstSunday)) / (7 * 86_400_000));
      return weekIndex % interval === 0;
    });
  } else if (mode === "dates") {
    const additionalDates = (schedule.dates ?? []).map(calendarDateFromString);
    if (additionalDates.length > MAX_OCCURRENCES - 1
      || new Set(additionalDates.map(dateString)).size !== additionalDates.length) {
      throw new BookingError(400, "Bulk schedule dates must be unique and contain no more than 90 sessions.");
    }
    if (additionalDates.some(date => dateOrdinal(date) < dateOrdinal(startDate) || dateOrdinal(date) > dateOrdinal(until))) {
      throw new BookingError(400, "Bulk session dates must fall between the first and final dates.");
    }
    scheduledDates = [startDate, ...additionalDates]
      .sort((left, right) => dateOrdinal(left) - dateOrdinal(right))
      .filter((date, index, dates) => index === 0 || dateString(date) !== dateString(dates[index - 1]));
  } else {
    throw new BookingError(400, "Choose a supported recurrence mode.");
  }

  const endDayOffset = (dateOrdinal(endTemplate) - dateOrdinal(startTemplate)) / 86_400_000;
  const cancellationDayOffset = (dateOrdinal(cancellationTemplate) - dateOrdinal(startTemplate)) / 86_400_000;
  const excludedValues = schedule.excludedDates ?? [];
  if (excludedValues.length > MAX_OCCURRENCES || new Set(excludedValues).size !== excludedValues.length) {
    throw new BookingError(400, "Excluded dates must be unique and no more than 90 dates.");
  }
  const excluded = new Set(excludedValues.map(value => dateString(calendarDateFromString(value))));
  if ([...excluded].some(value => {
    const date = calendarDateFromString(value);
    return dateOrdinal(date) < dateOrdinal(startDate) || dateOrdinal(date) > dateOrdinal(until);
  })) {
    throw new BookingError(400, "Excluded dates must fall between the first and final dates.");
  }
  const occurrences: OfferingData[] = [];

  for (const date of scheduledDates) {
    if (excluded.has(dateString(date))) continue;
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
    throw new BookingError(400, "No sessions remain after applying the recurrence pattern and excluded dates.");
  }
  if (occurrences.length > MAX_OCCURRENCES) {
    throw new BookingError(400, "A recurring schedule can contain no more than 90 sessions.");
  }
  for (let index = 1; index < occurrences.length; index += 1) {
    if (new Date(occurrences[index].startsAt) < new Date(occurrences[index - 1].endsAt)) {
      throw new BookingError(400, "Sessions in one schedule must not overlap.");
    }
  }

  return occurrences;
}

export function expandWeeklyOffering(template: OfferingData, schedule: WeeklyOfferingSchedule): OfferingData[] {
  return expandRecurringOffering(template, { ...schedule, mode: "weekly", interval: 1 });
}
