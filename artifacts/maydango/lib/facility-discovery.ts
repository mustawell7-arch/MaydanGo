import type { PublicFacilitySession } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";

export type DiscoveryTimeOfDay = "morning" | "afternoon" | "evening";
export type DiscoveryAccessType = PublicFacilitySession["accessType"];
export type DiscoverySession = Pick<PublicFacilitySession, "startsAt" | "accessType" | "tiers">;

export type DiscoverySessionFilters = {
  date: string | null;
  timeOfDay: DiscoveryTimeOfDay | null;
  accessType: DiscoveryAccessType | null;
  tier: string | null;
};

const timeZone = "Asia/Baghdad";

export function baghdadDateKey(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function baghdadHour(value: string): number | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : null;
}

function matchesTimeOfDay(value: string, timeOfDay: DiscoveryTimeOfDay): boolean {
  const hour = baghdadHour(value);
  if (hour === null) return false;
  if (timeOfDay === "morning") return hour >= 5 && hour < 12;
  if (timeOfDay === "afternoon") return hour >= 12 && hour < 17;
  return hour >= 17 || hour < 5;
}

export function matchesDiscoverySessionFilters(
  sessions: DiscoverySession[],
  filters: DiscoverySessionFilters,
): boolean {
  const hasFilters = filters.date !== null || filters.timeOfDay !== null
    || filters.accessType !== null || filters.tier !== null;
  if (!hasFilters) return true;
  return sessions.some(session =>
    (!filters.date || baghdadDateKey(session.startsAt) === filters.date) &&
    (!filters.timeOfDay || matchesTimeOfDay(session.startsAt, filters.timeOfDay)) &&
    (!filters.accessType || session.accessType === filters.accessType) &&
    (!filters.tier || session.tiers.includes(filters.tier)),
  );
}

export function formatDiscoveryDate(dateKey: string, language: Language): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 9));
  return new Intl.DateTimeFormat(
    language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ",
    { weekday: "short", month: "short", day: "numeric", timeZone },
  ).format(date);
}
