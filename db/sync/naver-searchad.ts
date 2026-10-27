/**
 * 네이버 검색광고 API → ad_metrics (일 단위, source = "naver_api").
 * 지금은 플레이스 유형 캠페인만 "naver-place" 채널로 가져온다. 다른 유형(파워링크 등)은 금액만 알려 준다.
 *
 * .env.local
 *   NAVER_SEARCHAD_API_KEY   엑세스라이선스
 *   NAVER_SEARCHAD_SECRET    비밀키
 *   NAVER_SEARCHAD_CUSTOMERS 클라이언트:고객ID 목록. 예) gu-ilsan:1234567
 */
import { createHmac } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { adMetrics, syncRuns } from "@/db/schema";
import { isClientSlug } from "@/lib/clients";
import { addDays } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const BASE = "https://api.searchad.naver.com";
/** 늦게 확정되는 전환·무효클릭 정산을 반영하려고 최근 며칠을 매번 다시 가져온다 */
const DEFAULT_DAYS = 35;
/** 네이버 캠페인 유형 → 대시보드 채널 */
const CHANNEL_BY_CAMPAIGN_TYPE: Record<string, string> = { PLACE: "naver-place" };

type Campaign = { nccCampaignId: string; name: string; campaignTp: string };
type StatRow = { id: string; impCnt?: number; clkCnt?: number; salesAmt?: number; ccnt?: number; dateStart?: string; date?: string };

function config() {
  const apiKey = process.env.NAVER_SEARCHAD_API_KEY;
  const secret = process.env.NAVER_SEARCHAD_SECRET;
  const customers = (process.env.NAVER_SEARCHAD_CUSTOMERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [client, customerId] = pair.split(":").map((s) => s.trim());
      if (!isClientSlug(client) || !/^\d+$/.test(customerId ?? "")) {
        throw new Error(`NAVER_SEARCHAD_CUSTOMERS 형식이 틀렸어요: "${pair}" (예: gu-ilsan:1234567)`);
      }
      return { client: client as ClientSlug, customerId };
    });
  if (!apiKey || !secret || customers.length === 0) return null;
  return { apiKey, secret, customers };
}

async function call<T>(cfg: NonNullable<ReturnType<typeof config>>, customerId: string, path: string, query?: Record<string, string>) {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", cfg.secret).update(`${timestamp}.GET.${path}`).digest("base64");
  const url = `${BASE}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-Timestamp": timestamp, "X-API-KEY": cfg.apiKey, "X-Customer": customerId, "X-Signature": signature },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`네이버 검색광고 ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function isNaverSearchAdConfigured() {
  return config() !== null;
}

export async function syncNaverSearchAd(days = DEFAULT_DAYS) {
  const cfg = config();
  if (!cfg) throw new Error("NAVER_SEARCHAD_* 가 .env.local 에 없어요");

  // 오늘은 아직 진행 중이라 어제까지
  const until = addDays(seoulToday(), -1);
  const since = addDays(until, -(days - 1));
  const [run] = await db.insert(syncRuns).values({ source: "naver_api" }).returning({ id: syncRuns.id });

  try {
    const report: { client: ClientSlug; rows: number; skipped: { type: string; name: string; spend: number }[] }[] = [];

    for (const { client, customerId } of cfg.customers) {
      const campaigns = await call<Campaign[]>(cfg, customerId, "/ncc/campaigns");
      const wanted = campaigns.filter((c) => CHANNEL_BY_CAMPAIGN_TYPE[c.campaignTp]);
      const others = campaigns.filter((c) => !CHANNEL_BY_CAMPAIGN_TYPE[c.campaignTp]);

      const stats = async (list: Campaign[]) =>
        list.length === 0
          ? []
          : (
              await call<{ data: StatRow[] }>(cfg, customerId, "/stats", {
                ids: JSON.stringify(list.map((c) => c.nccCampaignId)),
                fields: JSON.stringify(["impCnt", "clkCnt", "salesAmt", "ccnt"]),
                timeRange: JSON.stringify({ since, until }),
                timeIncrement: "1",
              })
            ).data;

      // 같은 날·같은 채널의 캠페인은 합친다
      const byDay = new Map<string, { date: string; channel: string; spend: number; impressions: number; clicks: number; conversions: number }>();
      for (const s of await stats(wanted)) {
        const date = (s.dateStart ?? s.date ?? "").slice(0, 10);
        const campaign = wanted.find((c) => c.nccCampaignId === s.id);
        if (!date || !campaign) continue;
        const channel = CHANNEL_BY_CAMPAIGN_TYPE[campaign.campaignTp];
        const key = `${date}|${channel}`;
        const acc = byDay.get(key) ?? { date, channel, spend: 0, impressions: 0, clicks: 0, conversions: 0 };
        acc.spend += Math.round(s.salesAmt ?? 0);
        acc.impressions += s.impCnt ?? 0;
        acc.clicks += s.clkCnt ?? 0;
        acc.conversions += s.ccnt ?? 0;
        byDay.set(key, acc);
      }

      const rows = [...byDay.values()].map((d) => ({
        ...d,
        granularity: "day" as const,
        client,
        source: "naver_api" as const,
      }));

      await db.transaction(async (tx) => {
        // 가져온 기간은 통째로 교체(캠페인이 꺼지거나 지워진 날도 맞게)
        await tx
          .delete(adMetrics)
          .where(
            and(
              eq(adMetrics.source, "naver_api"),
              eq(adMetrics.client, client),
              inArray(adMetrics.channel, Object.values(CHANNEL_BY_CAMPAIGN_TYPE)),
              gte(adMetrics.date, since),
              sql`${adMetrics.date} <= ${until}`,
            ),
          );
        if (rows.length) await tx.insert(adMetrics).values(rows);
      });

      const otherStats = await stats(others);
      const skipped = others
        .map((c) => ({
          type: c.campaignTp,
          name: c.name,
          spend: otherStats.filter((s) => s.id === c.nccCampaignId).reduce((a, s) => a + (s.salesAmt ?? 0), 0),
        }))
        .filter((c) => c.spend > 0);
      report.push({ client, rows: rows.length, skipped });
    }

    await db
      .update(syncRuns)
      .set({ status: "success", finishedAt: new Date(), rowsUpserted: report.reduce((a, r) => a + r.rows, 0) })
      .where(eq(syncRuns.id, run.id));
    return { since, until, report };
  } catch (e) {
    await db
      .update(syncRuns)
      .set({ status: "error", finishedAt: new Date(), error: (e as Error).message })
      .where(eq(syncRuns.id, run.id));
    throw e;
  }
}
