import type { PublicFacilitySession } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";

export type DiscoveryTimeOfDay = "morning" | "afternoon" | "evening";
export type DiscoveryAccessType = PublicFacilitySession["accessType"];
export type DiscoveryEnvironmentFilter = Exclude<NonNullable<PublicFacilitySession["environment"]>, null>;
export type DiscoverySession = Pick<
  PublicFacilitySession,
  "startsAt" | "accessType" | "tiers" | "difficultyLevel" | "environment"
>;
export type DiscoveryDifficultyFilter = Exclude<
  NonNullable<PublicFacilitySession["difficultyLevel"]>,
  "all-levels"
>;

export type DiscoverySessionFilters = {
  date: string | null;
  timeOfDay: DiscoveryTimeOfDay | null;
  accessType: DiscoveryAccessType | null;
  tier: string | null;
  difficultyLevel: DiscoveryDifficultyFilter | null;
  environment: DiscoveryEnvironmentFilter | null;
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
    || filters.accessType !== null || filters.tier !== null || filters.difficultyLevel !== null
    || (filters.environment !== null && filters.environment !== undefined);
  if (!hasFilters) return true;
  return sessions.some(session =>
    (!filters.date || baghdadDateKey(session.startsAt) === filters.date) &&
    (!filters.timeOfDay || matchesTimeOfDay(session.startsAt, filters.timeOfDay)) &&
    (!filters.accessType || session.accessType === filters.accessType) &&
    (!filters.tier || session.tiers.includes(filters.tier)) &&
    (!filters.difficultyLevel || session.difficultyLevel === "all-levels"
      || session.difficultyLevel === filters.difficultyLevel) &&
    (!filters.environment || session.environment === filters.environment),
  );
}

export function matchesMinimumFacilityRating(averageRating: number | null, minimumRating: number | null): boolean {
  return minimumRating === null || (averageRating !== null && averageRating >= minimumRating);
}

export function formatDiscoveryDate(dateKey: string, language: Language): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 9));
  return new Intl.DateTimeFormat(
    language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ",
    { weekday: "short", month: "short", day: "numeric", timeZone },
  ).format(date);
}
