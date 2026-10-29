/**
 * DB → Dataset. API 의 일 단위 행은 주(월요일) 단위로 합친다.
 */
import "server-only";
import { desc, eq, gte } from "drizzle-orm";
import type { Dataset } from "@/lib/build-metrics";
import { COUNTRY_LABELS, CREATIVE_FORMAT_LABELS } from "@/lib/clients";
import { weeksUntil } from "@/lib/periods";
import type { AdMetric, Creative } from "@/lib/types";
import { db } from ".";
import { META_AD_ACCOUNTS } from "./sync/meta";
import {
  adMetrics,
  campaigns,
  creatives,
  ga4Daily,
  gscDaily,
  gscQueryDaily,
  snsWeekly,
  syncRuns,
  youtubeVideos,
} from "./schema";

/** 기간 비교(최근 12주 vs 직전 12주, 지난달 vs 그 전달)에 충분한 주 수 */
const WEEK_COUNT = 30;

function seoulDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

type AdRow = typeof adMetrics.$inferSelect;

/** 채널별 효율 표의 "세부": 메타는 국가, 네이버는 캠페인(/광고그룹) 이름 */
function segmentOf(r: AdRow) {
  if (r.country) return COUNTRY_LABELS[r.country];
  return r.adgroupName
    ? `${r.campaignName} / ${r.adgroupName}`
    : r.campaignName;
}

/** 캠페인 아래 한 단계: 메타는 소재(광고), 네이버는 광고그룹(캠페인 단위 행은 없음) */
function detailOf(r: AdRow) {
  if (r.creativeId) return { id: r.creativeId, name: r.creativeId };
  return r.adgroupId
    ? { id: r.adgroupId, name: r.adgroupName ?? r.adgroupId }
    : undefined;
}

/** 메타 effective_status 중 광고가 나가고 있는 상태 */
const ACTIVE_AD_STATUSES = ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"];

const ACCOUNT_NAMES = new Map(META_AD_ACCOUNTS.map((a) => [a.id, a.name]));

/** 같은 날 · 같은 키의 행을 하나로 더한다 */
function sumByDay<T extends { date: string }, K extends keyof T>(
  rows: T[],
  keyOf: (r: T) => unknown[],
  fields: K[],
) {
  const map = new Map<string, T>();
  for (const r of rows) {
    const key = [r.date, ...keyOf(r)].join("|");
    const acc = map.get(key);
    if (!acc) {
      map.set(key, { ...r });
      continue;
    }
    for (const f of fields)
      (acc[f] as number) = (acc[f] as number) + (r[f] as number);
  }
  return [...map.values()];
}

/** 광고 행을 날짜 × 묶는 키로 더한다. withCampaign: 표용 — 캠페인·세부까지 나눠 두어 국가별·캠페인별 어느 쪽으로도 묶을 수 있게 */
function toDaily(
  rows: AdRow[],
  keyOf: (r: AdRow) => string | undefined,
  withCampaign = false,
): AdMetric[] {
  const map = new Map<string, AdMetric & { hasConv: boolean }>();
  for (const r of rows) {
    const segment = keyOf(r);
    const detail = withCampaign ? detailOf(r) : undefined;
    const key = [
      r.date,
      r.client,
      r.channel,
      segment ?? "",
      ...(withCampaign ? [r.campaignId, detail?.id ?? ""] : []),
    ].join("|");
    const acc = map.get(key) ?? {
      client: r.client,
      channel: r.channel,
      segment,
      ...(withCampaign && {
        campaignId: r.campaignId,
        campaign: r.campaignName,
        account: ACCOUNT_NAMES.get(r.accountId),
        detailId: detail?.id,
        detail: detail?.name,
      }),
      date: r.date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      hasConv: false,
    };
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    if (r.conversions !== null) {
      acc.conversions = (acc.conversions ?? 0) + r.conversions;
      acc.hasConv = true;
    }
    map.set(key, acc);
  }
  return [...map.values()].map(({ hasConv, ...m }) => ({
    ...m,
    conversions: hasConv ? m.conversions : undefined,
  }));
}

export async function loadDbDataset(): Promise<{
  dataset: Dataset;
  lastSyncedAt: string | null;
}> {
  const today = seoulToday();
  const weeks = weeksUntil(today, WEEK_COUNT);
  const from = weeks[0];

  const [
    ads,
    creativeRows,
    campaignRows,
    sns,
    videos,
    ga4Rows,
    gscRows,
    queryRows,
    lastRun,
  ] = await Promise.all([
    db.select().from(adMetrics).where(gte(adMetrics.date, from)),
    db.select().from(creatives),
    db.select({ id: campaigns.id, active: campaigns.active }).from(campaigns),
    db.select().from(snsWeekly).where(gte(snsWeekly.weekStart, from)),
    db
      .select()
      .from(youtubeVideos)
      .where(
        gte(youtubeVideos.publishedAt, new Date(`${from}T00:00:00+09:00`)),
      ),
    db.select().from(ga4Daily).where(gte(ga4Daily.date, from)),
    db.select().from(gscDaily).where(gte(gscDaily.date, from)),
    db.select().from(gscQueryDaily).where(gte(gscQueryDaily.date, from)),
    db
      .select({ finishedAt: syncRuns.finishedAt })
      .from(syncRuns)
      .where(eq(syncRuns.status, "success"))
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1),
  ]);

  const creativeNames = new Map(creativeRows.map((c) => [c.id, c.name]));
  const dataset: Dataset = {
    today,
    weeks,
    // 같은 행을 표는 세부(국가·캠페인)로, 소재 카드는 소재로 묶는다
    daily: toDaily(ads, segmentOf, true).map((m) => ({
      ...m,
      // 메타 소재는 ID 대신 이름으로
      detail: (m.detailId && creativeNames.get(m.detailId)) || m.detail,
    })),
    activeById: Object.fromEntries([
      ...campaignRows.map((c) => [c.id, c.active] as const),
      ...creativeRows
        .filter((c) => c.status)
        .map((c) => [c.id, ACTIVE_AD_STATUSES.includes(c.status!)] as const),
    ]),
    creatives: creativeRows.map((c): Creative => ({
      id: c.id,
      client: c.client,
      name: c.name,
      format: c.format ? CREATIVE_FORMAT_LABELS[c.format] : "—",
    })),
    creativeDaily: toDaily(
      ads.filter((r) => r.creativeId !== null),
      (r) => r.creativeId!,
    ),
    ga4: sumByDay(ga4Rows, (r) => [r.client, r.sourceMedium], [
      "sessions",
      "newUsers",
      "conversions",
    ]).map((r) => ({
      client: r.client,
      sourceMedium: r.sourceMedium,
      date: r.date,
      sessions: r.sessions,
      newUsers: r.newUsers,
      conversions: r.conversions,
    })),
    gsc: sumByDay(gscRows, (r) => [r.client], [
      "clicks",
      "impressions",
      "positionSum",
    ]).map((r) => ({
      client: r.client,
      date: r.date,
      clicks: r.clicks,
      impressions: r.impressions,
      positionSum: r.positionSum,
    })),
    gscQueries: sumByDay(queryRows, (r) => [r.client, r.query], [
      "clicks",
      "impressions",
      "positionSum",
    ]).map((r) => ({
      client: r.client,
      query: r.query,
      date: r.date,
      clicks: r.clicks,
      impressions: r.impressions,
      positionSum: r.positionSum,
    })),
    videos: videos.map((v) => ({
      client: v.client,
      id: v.videoId,
      title: v.title,
      publishedOn: seoulDate(v.publishedAt),
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      isShort: v.isShort,
    })),
    sns: sns.map((s) => ({
      client: s.client,
      platform: s.platform,
      account: s.account || undefined,
      weekStart: s.weekStart,
      followers: s.followers,
      views: s.views,
    })),
  };

  return {
    dataset,
    lastSyncedAt: lastRun[0]?.finishedAt?.toISOString() ?? null,
  };
}
