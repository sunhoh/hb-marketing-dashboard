/**
 * 원본 레코드(Dataset) → 화면용 지표. DB 를 모르는 순수 계산이라 브라우저에서도 import 할 수 있다.
 */
import { CHANNEL_LABELS, CLIENTS, CONVERSION_LABELS } from "./clients";
import {
  arrivalRate,
  costPerVisit,
  cpc,
  ctr,
  deriveAll,
  sumTotals,
  type DerivedTotals,
} from "./metrics";
import {
  addDays,
  type DateRange,
  inRange,
  mondayOf,
  PERIODS,
  resolvePeriod,
} from "./periods";
import { CONVERSION_EVENTS, sourceLabel } from "./web-config";
import type {
  AdMetric,
  ClientSlug,
  Creative,
  PeriodKey,
  SnsStat,
  VideoStat,
} from "./types";

/** db/dataset.ts 가 채우는 원본 묶음 */
export type Dataset = {
  today: string; // 기준일 YYYY-MM-DD
  weeks: string[]; // today 가 속한 주까지의 월요일(오래된 순) — 주별 추이·SNS 용
  daily: AdMetric[]; // 날짜 × 채널·세그먼트·캠페인·세부

  activeById: Record<string, boolean>; // 캠페인·소재 ID → 동기화 시점에 켜져 있었나
  creatives: Creative[];
  creativeDaily: AdMetric[]; // 날짜 × 소재, segment = 소재 ID
  sns: SnsStat[];
  videos: VideoStat[];
  ga4: {
    client: ClientSlug;
    date: string;
    sourceMedium: string;
    sessions: number;
    newUsers: number;
    conversions: number;
  }[];
  gsc: {
    client: ClientSlug;
    date: string;
    clicks: number;
    impressions: number;
    positionSum: number;
  }[];
  /** 광고 랜딩 방문. campaign·content = utm_campaign·utm_content(메타 캠페인·광고 ID 면 표에 붙는다) */
  landing: {
    client: ClientSlug; // 랜딩 GA4 속성의 클라이언트
    date: string;
    campaign: string;
    content: string;
    sessions: number;
  }[];
  gscQueries: {
    client: ClientSlug;
    date: string;
    query: string;
    clicks: number;
    impressions: number;
    positionSum: number;
  }[];
};

/** 채널 표에서 '평소보다 나쁨'으로 칠하는 문턱 (기준 = 같은 채널·세부의 기간 시작 전 12주) */
export const BASELINE_TOLERANCE = 0.2;
export const BASELINE_WEEKS = 12;
const TREND_WEEKS = 12;
export const YOUTUBE_TOP = 5;
/** 홈페이지 유입 표에 따로 보여 줄 유입 경로 수(나머지는 '기타') */
export const WEB_SOURCE_ROWS = 8;
export const SEARCH_QUERY_TOP = 10;
/** 소재 OFF 후보 문턱 (기준 = 같은 클라이언트 메타 소재 전체 값) */
export const OFF_CTR_RATIO = 0.7;
export const OFF_CPC_RATIO = 1.3;
const OFF_MIN_IMPRESSIONS = 5_000;
/** 노출이 이보다 적은 소재는 CTR 이 우연히 튀어서(노출 5회에 클릭 1번 = 20%) 순위에서 뺀다 */
const RANK_MIN_IMPRESSIONS = 1_000;

export type ChannelRow = DerivedTotals & {
  id: string;
  client: ClientSlug;
  clientName: string;
  channel: string;
  channelLabel: string;
  segment?: string;
  account?: string; // 캠페인 행만
  active?: boolean | null; // 캠페인·소재 행만. null = 상태를 모름
  conversionLabel: string;
  baseline: { ctr: number | null; cpc: number | null; cpm: number | null };
  /** 메타 캠페인·소재 행만, 랜딩 방문이 있을 때. 없으면 null(— 표시) */
  landingVisits: number | null;
  arrivalRate: number | null; // 랜딩 방문 ÷ 링크 클릭
  costPerVisit: number | null; // 소진액 ÷ 랜딩 방문
  subRows?: ChannelRow[]; // 펼치면 보이는 한 단계 아래(국가별 → 캠페인, 캠페인별 → 소재·광고그룹)
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

export type Metrics = ReturnType<typeof buildMetrics> & {
  lastSyncedAt: string | null;
};

const clientName = (slug: ClientSlug) =>
  CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

function byClient<T extends { client: ClientSlug }>(
  rows: T[],
  client: ClientSlug,
) {
  return rows.filter((r) => r.client === client);
}

function within<T extends { date: string }>(rows: T[], range: DateRange) {
  return rows.filter((r) => inRange(r.date, range));
}

/** SNS 처럼 주 단위로만 있는 값: 월요일이 기간 안에 있는 주 */
function weeksWithin<T extends { weekStart: string }>(
  rows: T[],
  range: DateRange,
) {
  return rows.filter((r) => inRange(r.weekStart, range));
}

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}

export function buildMetrics(
  ds: Dataset,
  client: ClientSlug,
  period: PeriodKey,
) {
  const periodInfo = PERIODS.find((p) => p.key === period)!;
  const range = resolvePeriod(period, ds.today);

  const metrics = byClient(ds.daily, client);
  const current = within(metrics, range.current);
  const previous = within(metrics, range.previous);

  // 요약 카드
  const summary = deriveAll(sumTotals(current));
  const summaryPrevious = deriveAll(sumTotals(previous));

  // 주별 추이 — 항상 최근 12주, 선택 기간과 겹치는 주는 표시.
  // 기간 경계에 걸친 주(예: 9/28~10/4 중 10/1~10/4 만 이번 달)는 겹친 날짜를 partial 로 알려 준다.
  // 이번 주처럼 남은 날이 아직 오지 않은 것뿐이면 걸친 주로 보지 않는다.
  const yesterday = addDays(ds.today, -1);
  const weekly = ds.weeks.slice(-TREND_WEEKS).map((weekStart) => {
    const week = { start: weekStart, end: addDays(weekStart, 6) };
    const t = sumTotals(within(metrics, week));
    const inPeriod =
      week.start <= range.current.end && week.end >= range.current.start;
    const cutStart = week.start < range.current.start;
    const cutEnd =
      week.end > range.current.end && range.current.end < yesterday;
    return {
      weekStart,
      inPeriod,
      partial:
        inPeriod && (cutStart || cutEnd)
          ? {
              start: cutStart ? range.current.start : week.start,
              end: cutEnd ? range.current.end : week.end,
            }
          : null,
      spend: t.spend,
      ctr: ctr(t),
      cpc: cpc(t),
    };
  });

  // 채널별 표 — 기준은 같은 행(채널·세부)의 기간 시작 전 12주
  const baselineRows = within(metrics, {
    start: addDays(range.current.start, -BASELINE_WEEKS * 7),
    end: addDays(range.current.start, -1),
  });

  /** key 로 묶어 한 줄씩. describe 로 줄 이름을, sub 로 펼칠 아래 줄을 만든다 */
  const buildRows = (
    rows: AdMetric[],
    base: AdMetric[],
    key: (r: AdMetric) => string,
    describe: (r: AdMetric) => Partial<ChannelRow>,
    sub?: (rows: AdMetric[], base: AdMetric[]) => ChannelRow[],
    visitsOf?: (r: AdMetric) => number | null,
  ): ChannelRow[] => {
    const baseByKey = groupBy(base, key);
    return [...groupBy(rows, key)].map(([id, list]) => {
      const first = list[0] as AdMetric;
      const b = deriveAll(sumTotals(baseByKey.get(id) ?? []));
      const children = sub?.(list, baseByKey.get(id) ?? []);
      return {
        id,
        client: first.client,
        clientName: clientName(first.client),
        channel: first.channel,
        channelLabel: CHANNEL_LABELS[first.channel] ?? first.channel,
        conversionLabel: CONVERSION_LABELS[first.channel] ?? "매체 전환",
        baseline: baseByKey.has(id)
          ? { ctr: b.ctr, cpc: b.cpc, cpm: b.cpm }
          : { ctr: null, cpc: null, cpm: null },
        ...describe(first),
        ...withVisits(deriveAll(sumTotals(list)), visitsOf?.(first)),
        // 아래 줄이 하나뿐이고 이름도 같으면(국가별 보기의 네이버 캠페인 등) 펼칠 게 없다
        subRows:
          children &&
          (children.length > 1 ||
            (children.length === 1 &&
              children[0].segment !== describe(first).segment))
            ? children
            : undefined,
      };
    });
  };
  // 랜딩 방문 — utm_campaign(메타 캠페인 ID)·utm_content(광고 ID)로 짝짓는다. 다른 클라이언트의
  // 랜딩 속성에 쌓였어도 캠페인 ID 가 같으면 붙인다(예: 국내_일산 캠페인이 지유 랜딩으로 보낸 경우)
  const landingNow = within(ds.landing, range.current);
  const visitsBy = (key: (r: (typeof landingNow)[number]) => string) => {
    const map = new Map<string, number>();
    for (const r of landingNow) {
      const k = key(r);
      if (k) map.set(k, (map.get(k) ?? 0) + r.sessions);
    }
    return map;
  };
  const visitsByCampaign = visitsBy((r) => r.campaign);
  const visitsByAd = visitsBy((r) => r.content);
  const metaVisits = (map: Map<string, number>, id: string | undefined) =>
    id ? (map.get(id) ?? null) : null;
  const withVisits = (t: DerivedTotals, visits: number | null | undefined) => ({
    ...t,
    landingVisits: visits ?? null,
    arrivalRate: arrivalRate(visits ?? null, t.clicks),
    costPerVisit: costPerVisit(t.spend, visits ?? null),
  });
  // 메타 캠페인 ID 가 아닌 utm_campaign(이름을 직접 쓴 UTM, 다른 계정 등)은 이 클라이언트의 "미연결"로 센다
  const knownCampaigns = new Set([
    ...ds.daily.map((r) => r.campaignId),
    ...Object.keys(ds.activeById),
  ]);
  const ownLanding = landingNow.filter((r) => r.client === client);
  const landing = ownLanding.length
    ? {
        total: ownLanding.reduce((a, r) => a + r.sessions, 0),
        unmatched: ownLanding
          .filter((r) => !knownCampaigns.has(r.campaign))
          .reduce((a, r) => a + r.sessions, 0),
      }
    : null;

  const channelKey = (r: AdMetric) => `${r.client}|${r.channel}`;
  const campaignOf = (r: AdMetric): Partial<ChannelRow> => ({
    segment: r.campaign,
    account: r.account,
    active: r.campaignId ? (ds.activeById[r.campaignId] ?? null) : null,
  });

  // 국가별(기존 보기): 채널 · 국가(네이버는 캠페인) → 펼치면 캠페인
  const channels = buildRows(
    current,
    baselineRows,
    (r) => `${channelKey(r)}|${r.segment ?? ""}`,
    (r) => ({ segment: r.segment }),
    (rows, base) =>
      rows[0].channel === "meta"
        ? buildRows(rows, base, (r) => `${r.campaignId}`, campaignOf)
        : [],
  );
  // 캠페인별: 채널 · 캠페인 → 펼치면 소재(메타)·광고그룹(네이버)
  const campaigns = buildRows(
    current,
    baselineRows,
    (r) => `${channelKey(r)}|${r.campaignId ?? r.segment ?? ""}`,
    (r) => (r.campaignId ? campaignOf(r) : { segment: r.segment }),
    (rows, base) =>
      rows.some((r) => r.detailId)
        ? buildRows(
            rows,
            base,
            (r) => r.detailId ?? "",
            (r) => ({
              segment: r.detail ?? "—",
              active:
                r.channel === "meta" && r.detailId
                  ? (ds.activeById[r.detailId] ?? null)
                  : null,
            }),
            undefined,
            (r) =>
              r.channel === "meta" ? metaVisits(visitsByAd, r.detailId) : null,
          )
        : [],
    (r) =>
      r.channel === "meta" ? metaVisits(visitsByCampaign, r.campaignId) : null,
  );

  // 메타 소재
  const creativeCurrent = within(
    byClient(ds.creativeDaily, client),
    range.current,
  );
  const creatives: CreativeRow[] = [];
  for (const [slug, rows] of groupBy(creativeCurrent, (r) => r.client)) {
    const base = deriveAll(sumTotals(rows));
    const perCreative = [...groupBy(rows, (r) => r.segment!)]
      .map(([id, list]) => {
        const meta = ds.creatives.find((c) => c.id === id) ?? {
          id,
          client: slug as ClientSlug,
          name: id,
          format: "—",
        };
        return { meta, totals: deriveAll(sumTotals(list)) };
      })
      .filter((c) => c.totals.impressions >= RANK_MIN_IMPRESSIONS);
    const byCtr = [...perCreative].sort(
      (a, b) => (b.totals.ctr ?? -1) - (a.totals.ctr ?? -1),
    );
    const byCpc = [...perCreative].sort(
      (a, b) => (a.totals.cpc ?? Infinity) - (b.totals.cpc ?? Infinity),
    );
    for (const { meta, totals } of byCtr) {
      const offReasons: string[] = [];
      if (totals.impressions >= OFF_MIN_IMPRESSIONS) {
        if (
          totals.ctr !== null &&
          base.ctr !== null &&
          totals.ctr < base.ctr * OFF_CTR_RATIO
        )
          offReasons.push("CTR 낮음");
        if (
          totals.cpc !== null &&
          base.cpc !== null &&
          totals.cpc > base.cpc * OFF_CPC_RATIO
        )
          offReasons.push("CPC 높음");
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

  // 오가닉 — SNS 는 주 단위로만 있어서 월요일이 기간 안에 있는 주로 계산한다
  const snsRows = byClient(ds.sns, client);
  const sns = [
    ...groupBy(snsRows, (r) => `${r.client}|${r.platform}|${r.account ?? ""}`),
  ].map(([, rows]) => {
    /** 기간 안에 조회수를 아는 주가 하나도 없으면 null(— 표시) */
    const sumViews = (r: DateRange) => {
      const known = weeksWithin(rows, r).filter((x) => x.views !== null);
      return known.length ? known.reduce((a, x) => a + x.views!, 0) : null;
    };
    /** date 가 속한 주까지 알던 가장 최근 팔로워 */
    const followersAt = (date: string) =>
      [...rows]
        .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        .find((r) => r.followers !== null && r.weekStart <= mondayOf(date))
        ?.followers ?? null;
    const first = rows[0] as SnsStat;
    const end = followersAt(range.current.end);
    const startFollowers = followersAt(addDays(range.current.start, -1));
    return {
      client: first.client,
      clientName: clientName(first.client),
      platform: first.platform,
      account: first.account ?? null,
      followers: end,
      followerChange:
        end === null || startFollowers === null ? null : end - startFollowers,
      views: sumViews(range.current),
      previousViews: sumViews(range.previous),
    };
  });

  // 유튜브 영상 — 기간 안에 올린 영상
  const videoRows = byClient(ds.videos, client);
  const uploadedIn = (r: DateRange) =>
    videoRows.filter((v) => inRange(v.publishedOn, r));
  const currentVideos = uploadedIn(range.current);
  const youtube = videoRows.length
    ? {
        uploads: currentVideos.length,
        previousUploads: uploadedIn(range.previous).length,
        shorts: currentVideos.filter((v) => v.isShort).length,
        top: [...currentVideos]
          .sort((a, b) => b.views - a.views)
          .slice(0, YOUTUBE_TOP),
      }
    : null;

  // 홈페이지 유입(GA4) — 같은 화면 이름(sourceLabel)끼리 합친다
  const ga4Rows = byClient(ds.ga4, client);
  const sumWeb = (rows: typeof ga4Rows) =>
    rows.reduce(
      (a, r) => ({
        sessions: a.sessions + r.sessions,
        conversions: a.conversions + r.conversions,
      }),
      {
        sessions: 0,
        conversions: 0,
      },
    );
  const webRate = (t: { sessions: number; conversions: number }) =>
    t.sessions ? (t.conversions / t.sessions) * 100 : null;
  const webCurrent = within(ga4Rows, range.current);
  const webPrevious = within(ga4Rows, range.previous);
  const bySource = [...groupBy(webCurrent, (r) => sourceLabel(r.sourceMedium))]
    .map(([label, rows]) => {
      const t = sumWeb(rows);
      const prev = sumWeb(
        webPrevious.filter((r) => sourceLabel(r.sourceMedium) === label),
      );
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
                  const t = {
                    sessions: 0,
                    conversions: 0,
                    previousSessions: 0,
                  };
                  for (const r of restSources) {
                    t.sessions += r.sessions;
                    t.conversions += r.conversions;
                    t.previousSessions += r.previousSessions;
                  }
                  return {
                    label: `기타 ${restSources.length}개`,
                    raw: restSources.map((r) => r.label),
                    ...t,
                    rate: webRate(t),
                  };
                })(),
              ]
            : []),
        ].map((r) => ({
          ...r,
          share: webTotal.sessions
            ? (r.sessions / webTotal.sessions) * 100
            : null,
        })),
      }
    : null;

  // 구글 검색(서치 콘솔)
  const gscRows = byClient(ds.gsc, client);
  const sumSearch = (
    rows: { clicks: number; impressions: number; positionSum: number }[],
  ) => {
    const t = rows.reduce(
      (a, r) => ({
        clicks: a.clicks + r.clicks,
        impressions: a.impressions + r.impressions,
        positionSum: a.positionSum + r.positionSum,
      }),
      { clicks: 0, impressions: 0, positionSum: 0 },
    );
    return {
      clicks: t.clicks,
      impressions: t.impressions,
      ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
      position: t.impressions ? t.positionSum / t.impressions : null,
    };
  };
  const queryCurrent = within(byClient(ds.gscQueries, client), range.current);
  const search = gscRows.length
    ? {
        current: sumSearch(within(gscRows, range.current)),
        previous: sumSearch(within(gscRows, range.previous)),
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
    range: range.current,
    previousRange: range.previous,
    asOf: ds.today,
    summary,
    summaryPrevious,
    weekly,
    channels,
    campaigns,
    landing,
    creatives,
    web,
    organic: { sns, youtube, search },
  };
}
