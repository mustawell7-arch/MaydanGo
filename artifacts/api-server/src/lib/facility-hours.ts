export type FacilityHoursDay = {
  day: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type FacilityHoursOverrideDay = {
  startDate: string;
  endDate: string;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

const weekdayIndex: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function iraqWeekdayAndMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: weekdayIndex[value.weekday] ?? 0,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

export function iraqCalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function previousCalendarDate(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function previousIraqCalendarDate(now: Date) {
  return previousCalendarDate(iraqCalendarDate(now));
}

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function overrideState(override: FacilityHoursOverrideDay, minutes: number) {
  if (override.closed || !override.opensAt || !override.closesAt) {
    return { openingStatus: "closed" as const, closesAt: null };
  }
  const open = timeMinutes(override.opensAt);
  const close = timeMinutes(override.closesAt);
  const isOpen = open < close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
  return isOpen
    ? { openingStatus: "open" as const, closesAt: override.closesAt }
    : { openingStatus: "closed" as const, closesAt: null };
}

function overnightOverride(override: FacilityHoursOverrideDay | undefined, minutes: number) {
  if (!override || override.closed || !override.opensAt || !override.closesAt) return false;
  const open = timeMinutes(override.opensAt);
  const close = timeMinutes(override.closesAt);
  return open > close && minutes < close;
}

export function openingState(
  hours: FacilityHoursDay[],
  now: Date,
  overrides: FacilityHoursOverrideDay[] = [],
) {
  const { day, minutes } = iraqWeekdayAndMinutes(now);
  const todayDate = iraqCalendarDate(now);
  const todayOverride = overrides.find(item => item.startDate <= todayDate && item.endDate >= todayDate);
  if (todayOverride?.closed) return { openingStatus: "closed" as const, closesAt: null };
  const previousDate = previousCalendarDate(todayDate);
  const previousOverride = overrides.find(item => item.startDate <= previousDate && item.endDate >= previousDate);
  if (overnightOverride(previousOverride, minutes)) {
    return { openingStatus: "open" as const, closesAt: previousOverride?.closesAt ?? null };
  }
  if (todayOverride) return overrideState(todayOverride, minutes);
  if (hours.length !== 7) return { openingStatus: "unavailable" as const, closesAt: null };
  const today = hours.find(item => item.day === day);
  if (!today) return { openingStatus: "unavailable" as const, closesAt: null };
  const previousDay = (day + 6) % 7;
  const previous = hours.find(item => item.day === previousDay);

  if (previous && !previous.closed && previous.opensAt && previous.closesAt) {
    const previousOpen = timeMinutes(previous.opensAt);
    const previousClose = timeMinutes(previous.closesAt);
    if (previousOpen > previousClose && minutes < previousClose) {
      return { openingStatus: "open" as const, closesAt: previous.closesAt };
    }
  }
  if (today.closed || !today.opensAt || !today.closesAt) {
    return { openingStatus: "closed" as const, closesAt: null };
  }
  const open = timeMinutes(today.opensAt);
  const close = timeMinutes(today.closesAt);
  const isOpen = open < close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
  return isOpen
    ? { openingStatus: "open" as const, closesAt: today.closesAt }
    : { openingStatus: "closed" as const, closesAt: null };
}
