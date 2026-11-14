export const FINANCE_RECORD_RETENTION_YEARS = 10;

export function financeRecordRetentionUntil(from: Date): Date {
  if (!Number.isFinite(from.getTime())) throw new Error("A valid finance record date is required.");

  const year = from.getUTCFullYear() + FINANCE_RECORD_RETENTION_YEARS;
  const month = from.getUTCMonth();
  const lastDayOfTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDayOfTargetMonth);

  return new Date(Date.UTC(
    year,
    month,
    day,
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  ));
}
