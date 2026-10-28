/**
 * 원본 레코드(Dataset) → 화면용 지표. 출처(샘플·DB)와 무관한 순수 계산이라 브라우저에서도 import 할 수 있다.
 */
import { CHANNEL_LABELS, CLIENTS, CONVERSION_LABELS } from "./clients";
import { cpc, ctr, deriveAll, sumTotals, type DerivedTotals } from "./metrics";
import { addDays, mondayOf, PERIODS, resolvePeriod } from "./periods";
import { CONVERSION_EVENTS, sourceLabel } from "./web-config";
import type {
  ClientSlug,
  Creative,
  PeriodKey,
  PlaceKeywordRank,
  PlaceStat,
  SnsStat,
  VideoStat,
  ViralStat,
  WeeklyMetric,
} from "./types";

/** 출처별 로더가 채우는 원본 묶음 */
export type Dataset = {
  source: "sample" | "db";
  today: string; // 기준일 YYYY-MM-DD
  weeks: string[]; // today 가 속한 주까지의 월요일(오래된 순)
  weekly: WeeklyMetric[]; // 채널·세그먼트 단위
  creatives: Creative[];
  creativeWeekly: WeeklyMetric[]; // 소재 단위, segment = 소재 ID
  placeKeywords: string[];
  placeRanks: PlaceKeywordRank[];
  placeStats: PlaceStat[];
  viral: ViralStat[];
  sns: SnsStat[];
  videos: VideoStat[];
  ga4: { client: ClientSlug; weekStart: string; sourceMedium: string; sessions: number; newUsers: number; conversions: number }[];
  gsc: { client: ClientSlug; weekStart: string; clicks: number; impressions: number; positionSum: number }[];
  gscQueries: { client: ClientSlug; weekStart: string; query: string; clicks: number; impressions: number; positionSum: number }[];
};

/** 채널 표에서 '평소보다 나쁨'으로 칠하는 문턱 (기준 = 같은 채널·세부의 직전 12주) */
export const BASELINE_TOLERANCE = 0.2;
export const BASELINE_WEEKS = 12;
export const YOUTUBE_TOP = 5;
/** 홈페이지 유입 표에 따로 보여 줄 유입 경로 수(나머지는 '기타') */
export const WEB_SOURCE_ROWS = 8;
export const SEARCH_QUERY_TOP = 10;
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

export type Metrics = ReturnType<typeof buildMetrics> & { lastSyncedAt: string | null };

const clientName = (slug: ClientSlug) => CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

function byClient<T extends { client: ClientSlug }>(rows: T[], client: ClientSlug) {
  return rows.filter((r) => r.client === client);
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

export function buildMetrics(ds: Dataset, client: ClientSlug, period: PeriodKey) {
  const periodInfo = PERIODS.find((p) => p.key === period)!;
  const weeks = resolvePeriod(period, ds.weeks, ds.today);
  const lastWeek = weeks.current[weeks.current.length - 1];
  const rangeStart = weeks.current[0] ?? null;
  const rangeEnd = lastWeek ? (addDays(lastWeek, 6) > ds.today ? ds.today : addDays(lastWeek, 6)) : null;

  const metrics = byClient(ds.weekly, client);
  const current = inWeeks(metrics, weeks.current);
  const previous = inWeeks(metrics, weeks.previous);

  // 요약 카드
  const summary = deriveAll(sumTotals(current));
  const summaryPrevious = deriveAll(sumTotals(previous));

  // 주별 추이 — 항상 최근 12주, 선택 기간에 속한 주는 표시
  const trendWeeks = ds.weeks.slice(-12);
  const currentSet = new Set(weeks.current);
  const weekly = trendWeeks.map((weekStart) => {
    const t = sumTotals(metrics.filter((r) => r.weekStart === weekStart));
    return { weekStart, inPeriod: currentSet.has(weekStart), spend: t.spend, ctr: ctr(t), cpc: cpc(t) };
  });

  // 채널별 표 — 기준은 같은 행(채널·세부)의 선택 기간 직전 12주
  const rowKey = (r: WeeklyMetric) => `${r.client}|${r.channel}|${r.segment ?? ""}`;
  const periodStart = weeks.current[0];
  const startIdx = periodStart ? ds.weeks.indexOf(periodStart) : -1;
  const baselineWeeks = startIdx > 0 ? ds.weeks.slice(Math.max(0, startIdx - BASELINE_WEEKS), startIdx) : [];
  const baselines = new Map(
    [...groupBy(inWeeks(metrics, baselineWeeks), rowKey)].map(([id, rows]) => [id, deriveAll(sumTotals(rows))]),
  );
  const channels: ChannelRow[] = [...groupBy(current, rowKey)].map(
    ([id, rows]) => {
      const { client: slug, channel, segment } = rows[0] as WeeklyMetric;
      const base = baselines.get(id);
      return {
        id,
        client: slug,
        clientName: clientName(slug),
        channel,
        channelLabel: CHANNEL_LABELS[channel] ?? channel,
        segment,
        conversionLabel: CONVERSION_LABELS[channel] ?? "매체 전환",
        baseline: { ctr: base?.ctr ?? null, cpc: base?.cpc ?? null, cpm: base?.cpm ?? null },
        ...deriveAll(sumTotals(rows)),
      };
    },
  );

  // 메타 소재
  const creativeCurrent = inWeeks(byClient(ds.creativeWeekly, client), weeks.current);
  const creatives: CreativeRow[] = [];
  for (const [slug, rows] of groupBy(creativeCurrent, (r) => r.client)) {
    const base = deriveAll(sumTotals(rows));
    const perCreative = [...groupBy(rows, (r) => r.segment!)].map(([id, list]) => {
      const meta = ds.creatives.find((c) => c.id === id) ?? { id, client: slug as ClientSlug, name: id, format: "—" };
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
  const showPlace = client === "gu-ilsan";
  const prevLastWeek = weeks.previous[weeks.previous.length - 1];
  const placeAt = (w: string | undefined) => ds.placeStats.find((s) => s.weekStart === w);
  const placeCurrent = placeAt(lastWeek);
  const place = showPlace && placeCurrent
    ? {
        keywords: ds.placeKeywords.map((keyword) => {
          const rank = (w: string) => ds.placeRanks.find((r) => r.keyword === keyword && r.weekStart === w)?.rank ?? null;
          return { keyword, rank: lastWeek ? rank(lastWeek) : null, previousRank: prevLastWeek ? rank(prevLastWeek) : null };
        }),
        rankTrend: trendWeeks.map((weekStart) => ({
          weekStart,
          ...Object.fromEntries(
            ds.placeKeywords.map((k) => [k, ds.placeRanks.find((r) => r.keyword === k && r.weekStart === weekStart)?.rank]),
          ),
        })) as ({ weekStart: string } & Record<string, number>)[],
        current: placeCurrent,
        previous: prevLastWeek ? placeAt(prevLastWeek) ?? null : null,
      }
    : null;

  const viralRows = byClient(ds.viral, client);
  const sumViral = (rows: typeof viralRows) =>
    rows.reduce((a, r) => ({ published: a.published + r.published, topKeywords: a.topKeywords + r.topKeywords }), {
      published: 0,
      topKeywords: 0,
    });
  const viral = viralRows.length
    ? {
        current: sumViral(inWeeks(viralRows, weeks.current)),
        previous: sumViral(inWeeks(viralRows, weeks.previous)),
      }
    : null;

  const snsRows = byClient(ds.sns, client);
  const sns = [...groupBy(snsRows, (r) => `${r.client}|${r.platform}`)].map(([, rows]) => {
    const at = (w: string | undefined) => rows.find((r) => r.weekStart === w);
    /** 기간 안에 조회수를 아는 주가 하나도 없으면 null(— 표시) */
    const sumViews = (ws: string[]) => {
      const known = inWeeks(rows, ws).filter((r) => r.views !== null);
      return known.length ? known.reduce((a, r) => a + r.views!, 0) : null;
    };
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

  // 유튜브 영상 — 업로드한 주가 기간에 속한 영상
  const videoRows = byClient(ds.videos, client);
  const inPeriodWeeks = (ws: string[]) => {
    const set = new Set(ws);
    return videoRows.filter((v) => set.has(mondayOf(v.publishedOn)));
  };
  const currentVideos = inPeriodWeeks(weeks.current);
  const youtube = videoRows.length
    ? {
        uploads: currentVideos.length,
        previousUploads: inPeriodWeeks(weeks.previous).length,
        shorts: currentVideos.filter((v) => v.isShort).length,
        top: [...currentVideos].sort((a, b) => b.views - a.views).slice(0, YOUTUBE_TOP),
      }
    : null;

  // 홈페이지 유입(GA4) — 같은 화면 이름(sourceLabel)끼리 합친다
  const ga4Rows = byClient(ds.ga4, client);
  const sumWeb = (rows: typeof ga4Rows) =>
    rows.reduce((a, r) => ({ sessions: a.sessions + r.sessions, conversions: a.conversions + r.conversions }), {
      sessions: 0,
      conversions: 0,
    });
  const webRate = (t: { sessions: number; conversions: number }) => (t.sessions ? (t.conversions / t.sessions) * 100 : null);
  const webCurrent = inWeeks(ga4Rows, weeks.current);
  const webPrevious = inWeeks(ga4Rows, weeks.previous);
  const bySource = [...groupBy(webCurrent, (r) => sourceLabel(r.sourceMedium))]
    .map(([label, rows]) => {
      const t = sumWeb(rows);
      const prev = sumWeb(webPrevious.filter((r) => sourceLabel(r.sourceMedium) === label));
      return {
        label,
        raw: [...new Set(rows.map((r) => r.sourceMedium))],
        ...t,
        rate: webRate(t),
        previousSessions: prev.sessions,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
  const webTotal = sumWeb(webCurrent);
  const webPrevTotal = sumWeb(webPrevious);
  const restSources = bySource.slice(WEB_SOURCE_ROWS);
  const web = ga4Rows.length
    ? {
        conversionEvents: CONVERSION_EVENTS[client],
        current: { ...webTotal, rate: webRate(webTotal) },
        previous: { ...webPrevTotal, rate: webRate(webPrevTotal) },
        sources: [
          ...bySource.slice(0, WEB_SOURCE_ROWS),
          ...(restSources.length
            ? [
                (() => {
                  const t = { sessions: 0, conversions: 0, previousSessions: 0 };
                  for (const r of restSources) {
                    t.sessions += r.sessions;
                    t.conversions += r.conversions;
                    t.previousSessions += r.previousSessions;
                  }
                  return { label: `기타 ${restSources.length}개`, raw: restSources.map((r) => r.label), ...t, rate: webRate(t) };
                })(),
              ]
            : []),
        ].map((r) => ({ ...r, share: webTotal.sessions ? (r.sessions / webTotal.sessions) * 100 : null })),
      }
    : null;

  // 구글 검색(서치 콘솔)
  const gscRows = byClient(ds.gsc, client);
  const sumSearch = (rows: { clicks: number; impressions: number; positionSum: number }[]) => {
    const t = rows.reduce(
      (a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, positionSum: a.positionSum + r.positionSum }),
      { clicks: 0, impressions: 0, positionSum: 0 },
    );
    return {
      clicks: t.clicks,
      impressions: t.impressions,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
      position: t.impressions ? t.positionSum / t.impressions : null,
    };
  };
  const queryCurrent = inWeeks(byClient(ds.gscQueries, client), weeks.current);
  const search = gscRows.length
    ? {
        current: sumSearch(inWeeks(gscRows, weeks.current)),
        previous: sumSearch(inWeeks(gscRows, weeks.previous)),
        queries: [...groupBy(queryCurrent, (r) => r.query)]
          .map(([query, rows]) => ({ query, ...sumSearch(rows) }))
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
          .slice(0, SEARCH_QUERY_TOP),
      }
    : null;

  return {
    client,
    period,
    periodLabel: periodInfo.label,
    compareLabel: periodInfo.compareLabel,
    source: ds.source,
    range: { start: rangeStart, end: rangeEnd },
    asOf: ds.today,
    summary,
    summaryPrevious,
    weekly,
    channels,
    creatives,
    web,
    organic: { place, viral, sns, youtube, search },
  };
}
