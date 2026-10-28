/**
 * DB → Dataset. API 의 일 단위 행은 주(월요일) 단위로 합친다.
 */
import "server-only";
import { desc, eq, gte } from "drizzle-orm";
import type { Dataset } from "@/lib/build-metrics";
import { mondayOf, weeksUntil } from "@/lib/periods";
import type { Creative, WeeklyMetric } from "@/lib/types";
import { db } from ".";
import {
  adMetrics,
  creatives,
  ga4Daily,
  gscDaily,
  gscQueryDaily,
  snsStats,
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

/** 일 단위 행을 (키 + 주) 로 묶어 숫자 칸을 더한다 */
function sumByWeek<T extends { date: string }, K extends keyof T>(
  rows: T[],
  keyOf: (r: T) => unknown[],
  fields: K[],
) {
  const map = new Map<string, T & { weekStart: string }>();
  for (const r of rows) {
    const weekStart = mondayOf(r.date);
    const key = [weekStart, ...keyOf(r)].join("|");
    const acc = map.get(key);
    if (!acc) {
      map.set(key, { ...r, weekStart });
      continue;
    }
    for (const f of fields)
      (acc[f] as number) = (acc[f] as number) + (r[f] as number);
  }
  return [...map.values()];
}

function toWeekly(
  rows: AdRow[],
  keyOf: (r: AdRow) => string | undefined,
): WeeklyMetric[] {
  const map = new Map<string, WeeklyMetric & { hasConv: boolean }>();
  for (const r of rows) {
    const weekStart = r.granularity === "week" ? r.date : mondayOf(r.date);
    const segment = keyOf(r);
    const key = [weekStart, r.client, r.channel, segment ?? ""].join("|");
    const acc = map.get(key) ?? {
      client: r.client,
      channel: r.channel,
      segment,
      weekStart,
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

  const [ads, creativeRows, sns, videos, ga4Rows, gscRows, queryRows, lastRun] =
    await Promise.all([
      db.select().from(adMetrics).where(gte(adMetrics.date, from)),
      db.select().from(creatives),
      db.select().from(snsStats).where(gte(snsStats.weekStart, from)),
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

  const channelRows = ads.filter((r) => r.creativeId === "");
  const creativeRowsOnly = ads.filter((r) => r.creativeId !== "");

  const dataset: Dataset = {
    today,
    weeks,
    weekly: toWeekly(channelRows, (r) => r.segment || undefined),
    creatives: creativeRows.map(
      (c): Creative =>
        ({
          id: c.id,
          client: c.client,
          name: c.name,
          format: c.format ?? "—",
        }) as Creative,
    ),
    creativeWeekly: toWeekly(creativeRowsOnly, (r) => r.creativeId),
    ga4: sumByWeek(ga4Rows, (r) => [r.client, r.sourceMedium], [
      "sessions",
      "newUsers",
      "conversions",
    ]).map((r) => ({
      client: r.client,
      sourceMedium: r.sourceMedium,
      weekStart: r.weekStart,
      sessions: r.sessions,
      newUsers: r.newUsers,
      conversions: r.conversions,
    })),
    gsc: sumByWeek(gscRows, (r) => [r.client], [
      "clicks",
      "impressions",
      "positionSum",
    ]).map((r) => ({
      client: r.client,
      weekStart: r.weekStart,
      clicks: r.clicks,
      impressions: r.impressions,
      positionSum: r.positionSum,
    })),
    gscQueries: sumByWeek(queryRows, (r) => [r.client, r.query], [
      "clicks",
      "impressions",
      "positionSum",
    ]).map((r) => ({
      client: r.client,
      query: r.query,
      weekStart: r.weekStart,
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
      isShort: v.isShort === 1,
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
