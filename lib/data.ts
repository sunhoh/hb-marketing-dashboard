/**
 * 화면이 부르는 유일한 데이터 함수.
 * 2단계에서는 이 파일 안쪽만 실제 출처(구글 시트, 매체 API, KOS 엑셀)로 바꾸고,
 * 돌려주는 모양(Metrics)은 그대로 둔다.
 */
import {
  CREATIVE_METRICS,
  CREATIVES,
  PLACE_KEYWORDS,
  PLACE_RANKS,
  PLACE_STATS,
  SAMPLE_TODAY,
  SAMPLE_WEEKS,
  SNS_STATS,
  VIRAL_STATS,
  WEEKLY_METRICS,
} from "@/data/sample";
import { CHANNEL_LABELS, CLIENTS, CONVERSION_LABELS } from "./clients";
import { cpc, ctr, deriveAll, sumTotals, type DerivedTotals } from "./metrics";
import { addDays, PERIODS, resolvePeriod } from "./periods";
import type { ClientFilter, ClientSlug, PeriodKey, SnsStat, WeeklyMetric } from "./types";

/** 채널 표에서 '기준보다 나쁨'으로 칠하는 문턱 (기준 = 같은 클라이언트의 기간 전체 값) */
export const BASELINE_TOLERANCE = 0.2;
/** 소재 OFF 후보 문턱 (기준 = 같은 클라이언트 메타 소재 전체 값) */
export const OFF_CTR_RATIO = 0.7;
export const OFF_CPC_RATIO = 1.3;
const OFF_MIN_IMPRESSIONS = 5_000;

export type ChannelRow = DerivedTotals & {
  id: string;
  client: ClientSlug;
  clientName: string;
  channel: string;
  channelLabel: string;
  segment?: string;
  conversionLabel: string;
  baseline: { ctr: number | null; cpc: number | null; cpm: number | null };
};

export type CreativeRow = DerivedTotals & {
  id: string;
  client: ClientSlug;
  clientName: string;
  name: string;
  format: string;
  ctrRank: number;
  cpcRank: number;
  offReasons: string[];
};

export type Metrics = Awaited<ReturnType<typeof getMetrics>>;

const clientName = (slug: ClientSlug) => CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

function byClient<T extends { client: ClientSlug }>(rows: T[], client: ClientFilter) {
  return client === "all" ? rows : rows.filter((r) => r.client === client);
}

function inWeeks<T extends { weekStart: string }>(rows: T[], weeks: string[]) {
  const set = new Set(weeks);
  return rows.filter((r) => set.has(r.weekStart));
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}

export async function getMetrics(client: ClientFilter, period: PeriodKey) {
  const periodInfo = PERIODS.find((p) => p.key === period)!;
  const weeks = resolvePeriod(period, SAMPLE_WEEKS, SAMPLE_TODAY);
  const lastWeek = weeks.current[weeks.current.length - 1];
  const rangeEnd = addDays(lastWeek, 6) > SAMPLE_TODAY ? SAMPLE_TODAY : addDays(lastWeek, 6);

  const metrics = byClient(WEEKLY_METRICS, client);
  const current = inWeeks(metrics, weeks.current);
  const previous = inWeeks(metrics, weeks.previous);

  // 요약 카드
  const summary = deriveAll(sumTotals(current));
  const summaryPrevious = deriveAll(sumTotals(previous));

  // 주별 추이 — 항상 최근 12주, 선택 기간에 속한 주는 표시
  const trendWeeks = SAMPLE_WEEKS.slice(-12);
  const currentSet = new Set(weeks.current);
  const weekly = trendWeeks.map((weekStart) => {
    const t = sumTotals(metrics.filter((r) => r.weekStart === weekStart));
    return { weekStart, inPeriod: currentSet.has(weekStart), spend: t.spend, ctr: ctr(t), cpc: cpc(t) };
  });

  // 채널·국가별 표
  const clientBaselines = new Map(
    [...groupBy(current, (r) => r.client)].map(([slug, rows]) => [slug, deriveAll(sumTotals(rows))]),
  );
  const channels: ChannelRow[] = [...groupBy(current, (r) => `${r.client}|${r.channel}|${r.segment ?? ""}`)].map(
    ([id, rows]) => {
      const { client: slug, channel, segment } = rows[0] as WeeklyMetric;
      const base = clientBaselines.get(slug)!;
      return {
        id,
        client: slug,
        clientName: clientName(slug),
        channel,
        channelLabel: CHANNEL_LABELS[channel] ?? channel,
        segment,
        conversionLabel: CONVERSION_LABELS[channel] ?? "매체 전환",
        baseline: { ctr: base.ctr, cpc: base.cpc, cpm: base.cpm },
        ...deriveAll(sumTotals(rows)),
      };
    },
  );

  // 메타 소재
  const creativeCurrent = inWeeks(byClient(CREATIVE_METRICS, client), weeks.current);
  const creatives: CreativeRow[] = [];
  for (const [slug, rows] of groupBy(creativeCurrent, (r) => r.client)) {
    const base = deriveAll(sumTotals(rows));
    const perCreative = [...groupBy(rows, (r) => r.segment!)].map(([id, list]) => {
      const meta = CREATIVES.find((c) => c.id === id)!;
      return { meta, totals: deriveAll(sumTotals(list)) };
    });
    const byCtr = [...perCreative].sort((a, b) => (b.totals.ctr ?? -1) - (a.totals.ctr ?? -1));
    const byCpc = [...perCreative].sort((a, b) => (a.totals.cpc ?? Infinity) - (b.totals.cpc ?? Infinity));
    for (const { meta, totals } of byCtr) {
      const offReasons: string[] = [];
      if (totals.impressions >= OFF_MIN_IMPRESSIONS) {
        if (totals.ctr !== null && base.ctr !== null && totals.ctr < base.ctr * OFF_CTR_RATIO) offReasons.push("CTR 낮음");
        if (totals.cpc !== null && base.cpc !== null && totals.cpc > base.cpc * OFF_CPC_RATIO) offReasons.push("CPC 높음");
      }
      creatives.push({
        id: meta.id,
        client: slug as ClientSlug,
        clientName: clientName(slug as ClientSlug),
        name: meta.name,
        format: meta.format,
        ctrRank: byCtr.findIndex((c) => c.meta.id === meta.id) + 1,
        cpcRank: byCpc.findIndex((c) => c.meta.id === meta.id) + 1,
        offReasons,
        ...totals,
      });
    }
  }

  // 오가닉
  const showPlace = client === "all" || client === "gu-ilsan";
  const prevLastWeek = weeks.previous[weeks.previous.length - 1];
  const placeAt = (w: string) => PLACE_STATS.find((s) => s.weekStart === w);
  const place = showPlace
    ? {
        keywords: PLACE_KEYWORDS.map((keyword) => {
          const rank = (w: string) => PLACE_RANKS.find((r) => r.keyword === keyword && r.weekStart === w)?.rank ?? null;
          return { keyword, rank: rank(lastWeek), previousRank: prevLastWeek ? rank(prevLastWeek) : null };
        }),
        rankTrend: trendWeeks.map((weekStart) => ({
          weekStart,
          ...Object.fromEntries(
            PLACE_KEYWORDS.map((k) => [k, PLACE_RANKS.find((r) => r.keyword === k && r.weekStart === weekStart)?.rank]),
          ),
        })) as ({ weekStart: string } & Record<string, number>)[],
        current: placeAt(lastWeek)!,
        previous: prevLastWeek ? placeAt(prevLastWeek) ?? null : null,
      }
    : null;

  const viralRows = byClient(VIRAL_STATS, client);
  const sumViral = (rows: typeof viralRows) =>
    rows.reduce((a, r) => ({ published: a.published + r.published, topKeywords: a.topKeywords + r.topKeywords }), {
      published: 0,
      topKeywords: 0,
    });
  const viral = viralRows.length
    ? {
        current: sumViral(inWeeks(viralRows, weeks.current)),
        previous: sumViral(inWeeks(viralRows, weeks.previous)),
        byClient: [...groupBy(inWeeks(viralRows, weeks.current), (r) => r.client)].map(([slug, rows]) => ({
          client: slug as ClientSlug,
          clientName: clientName(slug as ClientSlug),
          ...sumViral(rows),
        })),
      }
    : null;

  const snsRows = byClient(SNS_STATS, client);
  const sns = [...groupBy(snsRows, (r) => `${r.client}|${r.platform}`)].map(([, rows]) => {
    const at = (w: string | undefined) => rows.find((r) => r.weekStart === w);
    const sumViews = (ws: string[]) => inWeeks(rows, ws).reduce((a, r) => a + r.views, 0);
    const first = rows[0] as SnsStat;
    const end = at(lastWeek)?.followers ?? 0;
    const startFollowers = at(prevLastWeek)?.followers ?? null;
    return {
      client: first.client,
      clientName: clientName(first.client),
      platform: first.platform,
      followers: end,
      followerChange: startFollowers === null ? null : end - startFollowers,
      views: sumViews(weeks.current),
      previousViews: sumViews(weeks.previous),
    };
  });

  return {
    client,
    period,
    periodLabel: periodInfo.label,
    compareLabel: periodInfo.compareLabel,
    range: { start: weeks.current[0], end: rangeEnd },
    sampleToday: SAMPLE_TODAY,
    summary,
    summaryPrevious,
    weekly,
    channels,
    creatives,
    organic: { place, viral, sns },
  };
}
