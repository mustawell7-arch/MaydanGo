export function iraqDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function iraqToday(): string {
  return iraqDateKey(new Date());
}

export function iraqDayBounds(day: string): { start: Date; end: Date } {
  return {
    start: new Date(`${day}T00:00:00+03:00`),
    end: new Date(`${addCalendarDays(day, 1)}T00:00:00+03:00`),
  };
}

export function addCalendarDays(day: string, amount: number): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function validFitnessChallengeDates(startDate: string, endDate: string, goalActiveDays: number): boolean {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (
    !Number.isFinite(start.getTime())
    || !Number.isFinite(end.getTime())
    || start.toISOString().slice(0, 10) !== startDate
    || end.toISOString().slice(0, 10) !== endDate
    || end < start
  ) return false;
  const durationDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Number.isInteger(goalActiveDays) && goalActiveDays >= 1 && goalActiveDays <= Math.min(durationDays, 366);
}
