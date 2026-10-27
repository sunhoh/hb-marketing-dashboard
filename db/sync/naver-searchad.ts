/**
 * 네이버 검색광고 API → ad_metrics (일 단위, source = "naver_api").
 * 광고 계정 하나(gu_clinic)에 여러 지점 캠페인이 섞여 있어서, 캠페인 이름 규칙(CAMPAIGN_RULES)으로 클라이언트를 나눈다.
 * 규칙에 안 걸리는 캠페인은 가져오지 않고 이름·유형·금액만 알려 준다.
 *
 * .env.local
 *   NAVER_SEARCHAD_API_KEY      엑세스라이선스
 *   NAVER_SEARCHAD_SECRET       비밀키
 *   NAVER_SEARCHAD_CUSTOMER_ID  광고 계정 고객 ID (ads.naver.com/manage/ad-accounts/{이 숫자})
 */
import { createHmac } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { adMetrics, syncRuns } from "@/db/schema";
import { addDays } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const BASE = "https://api.searchad.naver.com";
/** 늦게 확정되는 전환·무효클릭 정산을 반영하려고 최근 며칠을 매번 다시 가져온다 */
const DEFAULT_DAYS = 35;
/** 네이버 캠페인 유형 → 대시보드 채널 */
const CHANNEL_BY_CAMPAIGN_TYPE: Record<string, string> = {
  WEB_SITE: "naver-search", // 파워링크
  BRAND_SEARCH: "naver-brand", // 브랜드검색(계약형이라 일별 비용이 0 으로 올 수 있음)
  PLACE: "naver-place",
};

/**
 * 캠페인 이름 → 클라이언트. 위에서부터 처음 맞는 규칙을 쓴다.
 * "자사명 캠페인"은 어느 지점인지 정해지지 않아 일부러 규칙에 없다(가져오지 않음).
 */
const CAMPAIGN_RULES: { match: RegExp; client: ClientSlug }[] = [
  { match: /일산/, client: "gu-ilsan" },
  { match: /강남/, client: "gu-gangnam" },
  { match: /셀로라/, client: "cellora" },
  { match: /^플레이스 검색광고$/, client: "gu-ilsan" }, // 플레이스 광고는 GU일산만 운영(CLAUDE.md)
];

type Campaign = {
  nccCampaignId: string;
  name: string;
  campaignTp: string;
  status?: string;
};
type StatRow = {
  impCnt?: number;
  clkCnt?: number;
  salesAmt?: number;
  ccnt?: number;
  dateStart?: string;
  date?: string;
};

function config() {
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY;
  const secret = process.env.NAVER_SEARCHAD_SECRET;
  const customerId = process.env.NAVER_SEARCHAD_CUSTOMER_ID?.trim();
  if (!apiKey || !secret || !customerId) return null;
  if (!/^\d+$/.test(customerId))
    throw new Error(
      `NAVER_SEARCHAD_CUSTOMER_ID 는 숫자여야 해요 (${customerId})`,
    );
  return { apiKey, secret, customerId };
}

function classify(c: Campaign) {
  const client = CAMPAIGN_RULES.find((r) => r.match.test(c.name))?.client;
  const channel = CHANNEL_BY_CAMPAIGN_TYPE[c.campaignTp];
  return client && channel ? { client, channel } : null;
}

async function call<T>(
  cfg: NonNullable<ReturnType<typeof config>>,
  customerId: string,
  path: string,
  query?: Record<string, string>,
) {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", cfg.secret)
    .update(`${timestamp}.GET.${path}`)
    .digest("base64");
  const url = `${BASE}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": cfg.apiKey,
        "X-Customer": customerId,
        "X-Signature": signature,
      },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok)
      throw new Error(
        `네이버 검색광고 ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`,
      );
    return (await res.json()) as T;
  }
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

export function isNaverSearchAdConfigured() {
  return config() !== null;
}

export async function syncNaverSearchAd(days = DEFAULT_DAYS) {
  const cfg = config();
  if (!cfg) throw new Error("NAVER_SEARCHAD_* 가 .env.local 에 없어요");
  const { customerId } = cfg;

  // 오늘은 아직 진행 중이라 어제까지
  const until = addDays(seoulToday(), -1);
  const since = addDays(until, -(days - 1));
  const [run] = await db
    .insert(syncRuns)
    .values({ source: "naver_api" })
    .returning({ id: syncRuns.id });

  try {
    const campaigns = await call<Campaign[]>(cfg, customerId, "/ncc/campaigns");
    // /stats 는 캠페인 하나씩만 받고, 기간을 주면 일별 행을 돌려준다
    const statsById = new Map<string, StatRow[]>();
    for (const c of campaigns) {
      const res = await call<{ data: StatRow[] }>(cfg, customerId, "/stats", {
        id: c.nccCampaignId,
        fields: JSON.stringify(["impCnt", "clkCnt", "salesAmt", "ccnt"]),
        timeRange: JSON.stringify({ since, until }),
      });
      statsById.set(c.nccCampaignId, res.data);
    }

    // 같은 날·같은 클라이언트·같은 채널의 캠페인은 합친다
    const byDay = new Map<
      string,
      {
        date: string;
        client: ClientSlug;
        channel: string;
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
      }
    >();
    for (const campaign of campaigns) {
      const target = classify(campaign);
      if (!target) continue;
      for (const s of statsById.get(campaign.nccCampaignId) ?? []) {
        const date = (s.dateStart ?? s.date ?? "").slice(0, 10);
        if (!date) continue;
        const key = `${date}|${target.client}|${target.channel}`;
        const acc = byDay.get(key) ?? {
          date,
          ...target,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
        };
        acc.spend += Math.round(s.salesAmt ?? 0);
        acc.impressions += s.impCnt ?? 0;
        acc.clicks += s.clkCnt ?? 0;
        acc.conversions += s.ccnt ?? 0;
        byDay.set(key, acc);
      }
    }
    // 노출·클릭·비용이 모두 0 인 날(중지된 캠페인 등)은 표에 ₩0 행만 늘리므로 넣지 않는다
    const rows = [...byDay.values()]
      .filter((d) => d.spend || d.impressions || d.clicks)
      .map((d) => ({
        ...d,
        granularity: "day" as const,
        source: "naver_api" as const,
      }));

    await db.transaction(async (tx) => {
      // 가져온 기간의 네이버 행은 통째로 교체(캠페인이 꺼지거나 규칙이 바뀐 경우도 맞게)
      await tx
        .delete(adMetrics)
        .where(
          and(
            eq(adMetrics.source, "naver_api"),
            gte(adMetrics.date, since),
            sql`${adMetrics.date} <= ${until}`,
          ),
        );
      if (rows.length) await tx.insert(adMetrics).values(rows);
    });

    const spendOf = (id: string) =>
      (statsById.get(id) ?? []).reduce((a, s) => a + (s.salesAmt ?? 0), 0);
    const campaignReport = campaigns.map((c) => ({
      name: c.name,
      type: c.campaignTp,
      target: classify(c),
      status: c.status,
      spend: Math.round(spendOf(c.nccCampaignId)),
    }));

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: rows.length,
      })
      .where(eq(syncRuns.id, run.id));
    return { since, until, rows: rows.length, campaigns: campaignReport };
  } catch (e) {
    await db
      .update(syncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: (e as Error).message,
      })
      .where(eq(syncRuns.id, run.id));
    throw e;
  }
}
