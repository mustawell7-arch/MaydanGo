import type { PublicFacilitySession } from "@workspace/api-client-react";
import { cities } from "@/data/demo";
import type { Language } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

export type LocalizedFacilityText = { en: string; ar: string; ku: string };
export const facilityText = (value: LocalizedFacilityText, language: Language) => value[language] || value.en;
export const cityIdForFacility = (name: string) => {
  const normalized = name.trim().toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
  return cities.find(city =>
    city.id.replace(/[^a-z0-9]/g, "") === normalized ||
    city.english.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "") === normalized,
  )?.id ?? normalized;
};

export function facilityClockTime(value: string, language: Language) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat(language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 4, hour, minute)));
}

export function facilityWeekday(day: number, language: Language) {
  return new Intl.DateTimeFormat(language === "ku" ? "ckb-IQ" : language === "ar" ? "ar-IQ" : "en-IQ", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 0, 4 + day, 12)));
}

export const eligibilityKey = (session: Pick<PublicFacilitySession, "gender" | "minAge" | "maxAge">) =>
  `${session.gender}:${session.minAge}:${session.maxAge ?? ""}`;

export function eligibilityLabel(
  session: Pick<PublicFacilitySession, "gender" | "minAge" | "maxAge">,
  language: Language,
) {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const gender = session.gender === "female" ? t("womenOnly") :
    session.gender === "male" ? t("menOnly") : null;
  const age = session.maxAge !== null
    ? t("ageRangeLabel").replace("{min}", String(session.minAge)).replace("{max}", String(session.maxAge))
    : session.minAge > 0 ? t("ageMinimum").replace("{age}", String(session.minAge)) : null;
  if (gender && age) return t("ageAndGender").replace("{gender}", gender).replace("{age}", age);
  return gender ?? age ?? t("allMembers");
}
