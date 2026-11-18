function toWesternDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code - (code <= 0x0669 ? 0x0660 : 0x06f0));
  });
}

export function normalizeInternationalPhoneNumber(value: string) {
  const normalized = toWesternDigits(value).replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function baghdadToday(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeBirthDate(value: string, now = new Date()) {
  const normalized = toWesternDigits(value.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return null;
  if (normalized > baghdadToday(now)) return null;
  return normalized;
}
