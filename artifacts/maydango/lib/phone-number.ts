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
