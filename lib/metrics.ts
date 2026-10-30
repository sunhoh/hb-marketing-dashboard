/**
 * 파생 지표 공통 함수. 화면 어디서든 CTR·CPC·CPM·증감률은 여기서만 계산한다.
 * 분모가 0이면 null 을 돌려주고, 표시할 때 "—" 로 바꾼다.
 */
import type { Totals, AdMetric } from "./types";

export const EMPTY = "—";

function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || !Number.isFinite(denominator)) return null;
  return numerator / denominator;
}

/** CTR = 클릭 ÷ 노출 × 100 */
export function ctr(t: Pick<Totals, "clicks" | "impressions">) {
  const v = safeDivide(t.clicks, t.impressions);
  return v === null ? null : v * 100;
}

/** CPC = 소진액 ÷ 클릭 */
export function cpc(t: Pick<Totals, "spend" | "clicks">) {
  return safeDivide(t.spend, t.clicks);
}

/** CPM = 소진액 ÷ 노출 × 1000 */
export function cpm(t: Pick<Totals, "spend" | "impressions">) {
  const v = safeDivide(t.spend, t.impressions);
  return v === null ? null : v * 1000;
}

/** 도착률 = 랜딩 방문 ÷ 링크 클릭 × 100. 클릭하고 페이지가 뜨기 전에 나간 사람이 많으면 낮다 */
export function arrivalRate(visits: number | null, clicks: number) {
  if (visits === null) return null;
  const v = safeDivide(visits, clicks);
  return v === null ? null : v * 100;
}

/** 방문당 비용 = 소진액 ÷ 랜딩 방문 */
export function costPerVisit(spend: number, visits: number | null) {
  return visits === null ? null : safeDivide(spend, visits);
}

/** 증감률 = (이번 기간 − 이전 기간) ÷ 이전 기간 × 100 */
export function changeRate(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  const v = safeDivide(current - previous, previous);
  return v === null ? null : v * 100;
}

export function sumTotals(rows: Pick<AdMetric, "spend" | "impressions" | "clicks" | "conversions">[]): Totals {
  return rows.reduce<Totals>(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + (r.conversions ?? 0),
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
  );
}

/** 소진액이 0 이면(브랜드검색 계약형 등) CPC·CPM 은 ₩0 이 아니라 — 로 둔다 */
export function deriveAll(t: Totals) {
  const free = t.spend === 0;
  return { ...t, ctr: ctr(t), cpc: free ? null : cpc(t), cpm: free ? null : cpm(t) };
}
export type DerivedTotals = ReturnType<typeof deriveAll>;

// ── 표시 형식 ──────────────────────────────────────────────

const intFormat = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

export function formatWon(v: number | null) {
  return v === null ? EMPTY : `₩${intFormat.format(Math.round(v))}`;
}

export function formatNumber(v: number | null) {
  return v === null ? EMPTY : intFormat.format(Math.round(v));
}

export function formatPercent(v: number | null, digits = 2) {
  return v === null ? EMPTY : `${v.toFixed(digits)}%`;
}

/** 축·좁은 칸용 짧은 금액: ₩1.2억, ₩350만 */
export function formatWonShort(v: number) {
  if (Math.abs(v) >= 100_000_000) return `₩${(v / 100_000_000).toFixed(1)}억`;
  if (Math.abs(v) >= 10_000) return `₩${intFormat.format(Math.round(v / 10_000))}만`;
  return `₩${intFormat.format(Math.round(v))}`;
}

/** 좁은 칸용 수 표시: 12,345 → 1.2만, 248,912 → 24.9만 */
export function formatCountShort(v: number | null) {
  if (v === null) return EMPTY;
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (Math.abs(v) >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
  return intFormat.format(Math.round(v));
}

export type MetricKey = "spend" | "impressions" | "clicks" | "conversions" | "ctr" | "cpc" | "cpm";
