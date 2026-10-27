import type { PeriodKey } from "./types";

export const PERIODS: { key: PeriodKey; label: string; compareLabel: string }[] = [
  { key: "this-month", label: "이번 달", compareLabel: "전월 대비" },
  { key: "last-month", label: "지난달", compareLabel: "전월 대비" },
  { key: "last-12-weeks", label: "최근 12주", compareLabel: "직전 12주 대비" },
];

export function isPeriodKey(value: unknown): value is PeriodKey {
  return PERIODS.some((p) => p.key === value);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * 기간에 속하는 주(월요일 시작일)와 비교할 이전 기간의 주를 고른다.
 * 월 단위 기간은 주 시작일이 그 달에 있는 주를 그 달로 친다.
 */
export function resolvePeriod(period: PeriodKey, weeks: string[], today: string) {
  if (period === "last-12-weeks") {
    return { current: weeks.slice(-12), previous: weeks.slice(-24, -12) };
  }
  const thisMonth = monthKey(today);
  const target = period === "this-month" ? thisMonth : shiftMonth(thisMonth, -1);
  const prev = shiftMonth(target, -1);
  return {
    current: weeks.filter((w) => monthKey(w) === target),
    previous: weeks.filter((w) => monthKey(w) === prev),
  };
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "10.05" 형식 */
export function shortDate(iso: string) {
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}`;
}
