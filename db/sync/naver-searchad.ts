/**
 * 네이버 검색광고 API → ad_metrics(날짜 × 캠페인, 지점이 광고그룹으로 나뉜 캠페인은 × 광고그룹, source = "naver_api").
 * 광고 계정 하나(gu_clinic)에 여러 지점이 섞여 있어서 이름 규칙(NAME_RULES)으로 클라이언트를 나눈다.
 * 캠페인 이름에 지점이 없으면(예: "플레이스 검색광고") 광고그룹에 연결된 업체(비즈채널) → 광고그룹 이름 순으로 나눈다.
 * 캠페인·광고그룹 ID 와 이름을 함께 저장해서, 표에서 광고주센터와 줄마다 맞춰 볼 수 있다.
 * 어느 규칙에도 안 걸리거나 제외 목록에 있으면 가져오지 않고 이름·유형·금액만 알려 준다.
 *
 * .env.local
 *   NAVER_SEARCHAD_API_KEY      엑세스라이선스
 *   NAVER_SEARCHAD_SECRET       비밀키
 *   NAVER_SEARCHAD_CUSTOMER_ID  광고 계정 고객 ID (ads.naver.com/manage/ad-accounts/{이 숫자})
 */
import { createHmac } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { adMetrics, campaigns, syncRuns, type AdChannel } from "@/db/schema";
import { addDays } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const BASE = "https://api.searchad.naver.com";
/** 늦게 확정되는 전환·무효클릭 정산을 반영하려고 최근 며칠을 매번 다시 가져온다 */
const DEFAULT_DAYS = 35;
/** 네이버가 보관하는 기간(처음 한 번 채울 때 최대) */
export const MAX_DAYS = 365;
/** /stats 한 번에 조회할 수 있는 최대 일수(92일)보다 조금 작게 나눠 부른다 */
const CHUNK_DAYS = 90;
/** 네이버 캠페인 유형 → 대시보드 채널 */
const CHANNEL_BY_CAMPAIGN_TYPE: Record<string, AdChannel> = {
  WEB_SITE: "naver-search", // 파워링크
  BRAND_SEARCH: "naver-brand", // 브랜드검색(계약형이라 일별 비용이 0 으로 올 수 있음)
  PLACE: "naver-place",
};

/** 캠페인·광고그룹 이름 → 클라이언트. 위에서부터 처음 맞는 규칙을 쓴다 */
const NAME_RULES: { match: RegExp; client: ClientSlug }[] = [
  { match: /일산/, client: "gu-ilsan" },
  { match: /강남/, client: "gu-gangnam" },
];

/**
 * 광고그룹에 연결된 업체(스마트플레이스) 이름 → 클라이언트. 이름 규칙보다 먼저 본다.
 * "사적인 아름다움 지유의원"(지점명 없음)은 강남점 업체로 보고 있다 — 확인 필요(2026-10-27).
 */
const BIZCHANNEL_RULES: { match: RegExp; client: ClientSlug }[] = [
  { match: /일산/, client: "gu-ilsan" },
  { match: /^사적인 아름다움 지유의원$/, client: "gu-gangnam" },
];

/** 대시보드에 넣지 않는 캠페인(팀 결정) */
const EXCLUDED_CAMPAIGNS = [/^자사명 캠페인$/];

type Campaign = {
  nccCampaignId: string;
  name: string;
  campaignTp: string;
  status?: string; // ELIGIBLE / PAUSED / LIMITED_BY_BUDGET …
  userLock?: boolean; // 광고주센터에서 끈 캠페인
  delFlag?: boolean;
};
type Adgroup = {
  nccAdgroupId: string;
  name: string;
  status?: string;
  pcChannelId?: string;
  mobileChannelId?: string;
};
type BizChannel = { nccBusinessChannelId: string; name: string };

/** 통계를 조회하는 단위. 캠페인 하나 또는 (캠페인 이름으로 못 나누면) 광고그룹 하나 */
type Unit = {
  id: string;
  label: string;
  campaignId: string;
  campaignName: string;
  adgroupId?: string;
  adgroupName?: string;
  type: string;
  status?: string;
  target: { client: ClientSlug; channel: AdChannel } | null;
  excluded?: boolean;
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

function clientByName(name: string) {
  return NAME_RULES.find((r) => r.match.test(name))?.client;
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
  days = Math.min(Math.max(1, Math.floor(days)), MAX_DAYS);
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
    const nccCampaigns = await call<Campaign[]>(
      cfg,
      customerId,
      "/ncc/campaigns",
    );
    let bizChannels: Map<string, string> | undefined;

    const units: Unit[] = [];
    for (const c of nccCampaigns) {
      const channel = CHANNEL_BY_CAMPAIGN_TYPE[c.campaignTp];
      const base = {
        type: c.campaignTp,
        status: c.status,
        campaignId: c.nccCampaignId,
        campaignName: c.name,
      };
      if (EXCLUDED_CAMPAIGNS.some((r) => r.test(c.name))) {
        units.push({
          ...base,
          id: c.nccCampaignId,
          label: c.name,
          target: null,
          excluded: true,
        });
        continue;
      }
      const client = clientByName(c.name);
      if (client || !channel) {
        units.push({
          ...base,
          id: c.nccCampaignId,
          label: c.name,
          target: client && channel ? { client, channel } : null,
        });
        continue;
      }
      // 캠페인 이름에 지점이 없으면 광고그룹 이름으로 나눈다
      const groups = await call<Adgroup[]>(cfg, customerId, "/ncc/adgroups", {
        nccCampaignId: c.nccCampaignId,
      });
      bizChannels ??= new Map(
        (await call<BizChannel[]>(cfg, customerId, "/ncc/channels")).map(
          (b) => [b.nccBusinessChannelId, b.name],
        ),
      );
      for (const g of groups) {
        const bizName = [g.pcChannelId, g.mobileChannelId]
          .map((id) => id && bizChannels!.get(id))
          .find(Boolean);
        const gc =
          (bizName &&
            BIZCHANNEL_RULES.find((r) => r.match.test(bizName))?.client) ??
          clientByName(g.name);
        units.push({
          type: c.campaignTp,
          status: g.status,
          id: g.nccAdgroupId,
          label: `${c.name} / ${g.name}`,
          campaignId: c.nccCampaignId,
          campaignName: c.name,
          adgroupId: g.nccAdgroupId,
          adgroupName: g.name,
          target: gc ? { client: gc, channel } : null,
        });
      }
    }

    // /stats 는 ID 하나씩만 받고, 기간(최대 92일)을 주면 일별 행을 돌려준다
    const ranges: { since: string; until: string }[] = [];
    for (let from = since; from <= until; from = addDays(from, CHUNK_DAYS)) {
      const to = addDays(from, CHUNK_DAYS - 1);
      ranges.push({ since: from, until: to < until ? to : until });
    }
    const statsById = new Map<string, StatRow[]>();
    for (const u of units) {
      const rows: StatRow[] = [];
      for (const range of ranges) {
        const res = await call<{ data: StatRow[] }>(cfg, customerId, "/stats", {
          id: u.id,
          fields: JSON.stringify(["impCnt", "clkCnt", "salesAmt", "ccnt"]),
          timeRange: JSON.stringify(range),
        });
        rows.push(...res.data);
      }
      statsById.set(u.id, rows);
    }

    // 캠페인(/광고그룹)별 일 단위 행
    const rows: (typeof adMetrics.$inferInsert)[] = [];
    for (const u of units) {
      if (!u.target) continue;
      for (const st of statsById.get(u.id) ?? []) {
        const date = (st.dateStart ?? st.date ?? "").slice(0, 10);
        const row = {
          date,
          ...u.target,
          accountId: customerId,
          campaignId: u.campaignId,
          campaignName: u.campaignName,
          adgroupId: u.adgroupId ?? null,
          adgroupName: u.adgroupName ?? null,
          spend: Math.round(st.salesAmt ?? 0),
          impressions: st.impCnt ?? 0,
          clicks: st.clkCnt ?? 0,
          conversions: st.ccnt ?? 0,
          source: "naver_api" as const,
        };
        // 노출·클릭·비용이 모두 0 인 날(중지된 캠페인 등)은 표에 ₩0 행만 늘리므로 넣지 않는다
        if (date && (row.spend || row.impressions || row.clicks))
          rows.push(row);
      }
    }

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
      // 캠페인 켜짐/꺼짐 — 예산 소진(LIMITED_BY_BUDGET) 같은 상태는 켜 둔 것으로 본다
      for (const c of nccCampaigns) {
        const channel = CHANNEL_BY_CAMPAIGN_TYPE[c.campaignTp];
        if (!channel) continue;
        const row = {
          id: c.nccCampaignId,
          channel,
          accountId: customerId,
          name: c.name,
          active: !c.userLock && !c.delFlag && c.status !== "PAUSED",
          status: c.status ?? null,
        };
        await tx
          .insert(campaigns)
          .values(row)
          .onConflictDoUpdate({
            target: campaigns.id,
            set: { ...row, updatedAt: sql`now()` },
          });
      }
    });

    const spendOf = (id: string) =>
      (statsById.get(id) ?? []).reduce((a, s) => a + (s.salesAmt ?? 0), 0);
    const campaignReport = units.map((u) => ({
      name: u.label,
      type: u.type,
      target: u.target,
      status: u.status,
      excluded: u.excluded ?? false,
      spend: Math.round(spendOf(u.id)),
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
