/**
 * DB → Dataset. API 의 일 단위 행은 주(월요일) 단위로 합쳐서 샘플 데이터와 같은 모양으로 만든다.
 */
import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import type { Dataset } from "@/lib/build-metrics";
import { mondayOf, weeksUntil } from "@/lib/periods";
import type { ClientSlug, Creative, WeeklyMetric } from "@/lib/types";
import { db } from ".";
import { adMetrics, creatives, placeRanks, placeStats, snsStats, syncRuns, viralPosts } from "./schema";

/** 기간 비교(최근 12주 vs 직전 12주, 지난달 vs 그 전달)에 충분한 주 수 */
const WEEK_COUNT = 30;
/** 플레이스 카드는 지금 GU일산만 */
const PLACE_CLIENT: ClientSlug = "gu-ilsan";

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

type AdRow = typeof adMetrics.$inferSelect;

function toWeekly(rows: AdRow[], keyOf: (r: AdRow) => string | undefined): WeeklyMetric[] {
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
  return [...map.values()].map(({ hasConv, ...m }) => ({ ...m, conversions: hasConv ? m.conversions : undefined }));
}

export async function loadDbDataset(): Promise<{ dataset: Dataset; lastSyncedAt: string | null }> {
  const today = seoulToday();
  const weeks = weeksUntil(today, WEEK_COUNT);
  const from = weeks[0];

  const [ads, creativeRows, ranks, stats, posts, sns, lastRun] = await Promise.all([
    db.select().from(adMetrics).where(gte(adMetrics.date, from)),
    db.select().from(creatives),
    db
      .select()
      .from(placeRanks)
      .where(and(gte(placeRanks.weekStart, from), eq(placeRanks.client, PLACE_CLIENT)))
      .orderBy(placeRanks.id),
    db.select().from(placeStats).where(and(gte(placeStats.weekStart, from), eq(placeStats.client, PLACE_CLIENT))),
    db.select().from(viralPosts).where(gte(viralPosts.publishedOn, from)),
    db.select().from(snsStats).where(gte(snsStats.weekStart, from)),
    db
      .select({ finishedAt: syncRuns.finishedAt })
      .from(syncRuns)
      .where(eq(syncRuns.status, "success"))
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1),
  ]);

  const channelRows = ads.filter((r) => r.creativeId === "");
  const creativeRowsOnly = ads.filter((r) => r.creativeId !== "");

  // 바이럴: 발행일이 속한 주로 묶어 발행 수와 상위노출 키워드 수(중복 제외)를 센다
  const viralMap = new Map<string, { client: ClientSlug; weekStart: string; published: number; keywords: Set<string> }>();
  for (const p of posts) {
    const weekStart = mondayOf(p.publishedOn);
    const key = `${weekStart}|${p.client}`;
    const acc = viralMap.get(key) ?? { client: p.client, weekStart, published: 0, keywords: new Set<string>() };
    acc.published += 1;
    if (p.topExposed && p.keyword) acc.keywords.add(p.keyword);
    viralMap.set(key, acc);
  }

  const dataset: Dataset = {
    source: "db",
    today,
    weeks,
    weekly: toWeekly(channelRows, (r) => r.segment || undefined),
    creatives: creativeRows.map(
      (c): Creative => ({ id: c.id, client: c.client, name: c.name, format: c.format ?? "—" }) as Creative,
    ),
    creativeWeekly: toWeekly(creativeRowsOnly, (r) => r.creativeId),
    placeKeywords: [...new Set(ranks.map((r) => r.keyword))], // 시트에 처음 적힌 순서 = 선 색 순서
    placeRanks: ranks.flatMap((r) => (r.rank === null ? [] : [{ weekStart: r.weekStart, keyword: r.keyword, rank: r.rank }])),
    placeStats: stats.map((s) => ({ weekStart: s.weekStart, reviews: s.reviews, rating: s.rating ?? 0, saves: s.saves ?? 0 })),
    viral: [...viralMap.values()].map(({ keywords, ...v }) => ({ ...v, topKeywords: keywords.size })),
    sns: sns.map((s) => ({ client: s.client, platform: s.platform, weekStart: s.weekStart, followers: s.followers, views: s.views ?? 0 })),
  };

  return { dataset, lastSyncedAt: lastRun[0]?.finishedAt?.toISOString() ?? null };
}
