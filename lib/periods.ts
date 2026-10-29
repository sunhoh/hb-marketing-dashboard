import type { PeriodKey } from "./types";

export const PERIODS: {
  key: PeriodKey;
  label: string;
  compareLabel: string;
}[] = [
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

export type DateRange = { start: string; end: string }; // 둘 다 포함, YYYY-MM-DD

function lastDayOf(ym: string) {
  return addDays(`${shiftMonth(ym, 1)}-01`, -1);
}

/**
 * 기간과 비교할 이전 기간(날짜 그대로, 매체 광고 관리자와 같은 기준).
 *   · 이번 달: 1일 ~ 어제(오늘은 아직 진행 중). 비교는 지난달 1일 ~ 같은 날짜(28일치와 30일치를 비교하지 않게)
 *   · 지난달: 그 달 전체. 비교는 그 전 달 전체
 *   · 최근 12주: 11주 전 월요일 ~ 어제. 비교는 바로 앞 84일
 * 매달 1일에는 이번 달 데이터가 아직 없어서 start > end(빈 기간)가 된다.
 */
export function resolvePeriod(
  period: PeriodKey,
  today: string,
): { current: DateRange; previous: DateRange } {
  const yesterday = addDays(today, -1);
  if (period === "last-12-weeks") {
    const start = addDays(mondayOf(today), -77);
    return {
      current: { start, end: yesterday },
      previous: { start: addDays(start, -84), end: addDays(start, -1) },
    };
  }
  const thisMonth = monthKey(today);
  if (period === "last-month") {
    const target = shiftMonth(thisMonth, -1);
    const prev = shiftMonth(target, -1);
    return {
      current: { start: `${target}-01`, end: lastDayOf(target) },
      previous: { start: `${prev}-01`, end: lastDayOf(prev) },
    };
  }
  const start = `${thisMonth}-01`;
  const prev = shiftMonth(thisMonth, -1);
  const sameDay = `${prev}-${yesterday.slice(8, 10)}`;
  const prevEnd = sameDay < lastDayOf(prev) ? sameDay : lastDayOf(prev);
  return {
    current: { start, end: yesterday },
    // 1일이면 이번 달이 비어 있으니 비교 기간도 비운다
    previous:
      yesterday < start
        ? { start: `${prev}-01`, end: addDays(`${prev}-01`, -1) }
        : { start: `${prev}-01`, end: prevEnd },
  };
}

export function inRange(date: string, range: DateRange) {
  return date >= range.start && date <= range.end;
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

/** iso 날짜가 속한 주의 월요일 */
export function mondayOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

/** today 가 속한 주까지 거꾸로 count 주의 월요일(오래된 순) */
export function weeksUntil(today: string, count: number) {
  const last = mondayOf(today);
  return Array.from({ length: count }, (_, i) =>
    addDays(last, (i - count + 1) * 7),
  );
}
