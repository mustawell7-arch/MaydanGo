export type FacilityHoursDay = {
  day: number;
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

function timeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function openingState(hours: FacilityHoursDay[], now: Date) {
  if (hours.length !== 7) return { openingStatus: "unavailable" as const, closesAt: null };
  const { day, minutes } = iraqWeekdayAndMinutes(now);
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
