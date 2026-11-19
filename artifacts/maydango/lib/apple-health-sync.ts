export const APPLE_HEALTH_LOOKBACK_DAYS = 30;

export type AppleHealthDailySummary = {
  activityDate: string;
  steps: number | null;
  completedWorkouts: number;
};

export function baghdadDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addCalendarDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getAppleHealthSyncRange(now = new Date()) {
  const today = baghdadDateKey(now);
  const firstDay = addCalendarDays(today, -(APPLE_HEALTH_LOOKBACK_DAYS - 1));
  return {
    firstDay,
    today,
    from: new Date(`${firstDay}T00:00:00+03:00`),
    to: now,
  };
}

export function buildAppleHealthDailySummaries(
  stepStatistics: Array<{ startDate: Date; sum?: number }>,
  workouts: Array<{ startDate: Date }>,
  firstDay: string,
  today: string,
): AppleHealthDailySummary[] {
  const days = new Map<string, AppleHealthDailySummary>();
  const getDay = (activityDate: string) => {
    let summary = days.get(activityDate);
    if (!summary) {
      summary = { activityDate, steps: null, completedWorkouts: 0 };
      days.set(activityDate, summary);
    }
    return summary;
  };

  for (const statistic of stepStatistics) {
    if (statistic.sum === undefined || !Number.isFinite(statistic.sum)) continue;
    const activityDate = baghdadDateKey(statistic.startDate);
    if (activityDate < firstDay || activityDate > today) continue;
    const steps = Math.round(statistic.sum);
    if (steps < 0 || steps > 300_000) {
      throw new Error('Apple Health returned a daily step total outside the supported range.');
    }
    getDay(activityDate).steps = steps;
  }

  for (const workout of workouts) {
    const activityDate = baghdadDateKey(workout.startDate);
    if (activityDate < firstDay || activityDate > today) continue;
    const summary = getDay(activityDate);
    summary.completedWorkouts += 1;
    if (summary.completedWorkouts > 100) {
      throw new Error('Apple Health returned more than 100 workouts for one day.');
    }
  }

  return [...days.values()]
    .filter(summary => summary.steps !== null || summary.completedWorkouts > 0)
    .sort((left, right) => left.activityDate.localeCompare(right.activityDate));
}
