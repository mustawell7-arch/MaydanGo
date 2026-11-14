export function ageOnDate(birthDate: string | null | undefined, onDate: Date): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baghdad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(onDate).map(part => [part.type, part.value]));
  const localYear = Number(parts.year);
  const localMonth = Number(parts.month);
  const localDay = Number(parts.day);
  let age = localYear - birth.getUTCFullYear();
  if (localMonth < birth.getUTCMonth() + 1
    || (localMonth === birth.getUTCMonth() + 1 && localDay < birth.getUTCDate())) age--;
  return age < 0 ? null : age;
}
