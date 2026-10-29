/**
 * 메타 광고(Marketing API) → ad_metrics(날짜 × 광고 × 국가, source = "meta_api") + creatives.
 * 한 번의 요청(level=ad, breakdowns=country)으로 받아서, 채널별 효율 표(국가로 묶음)와
 * 소재 카드(광고로 묶음)가 같은 행을 다르게 더한다 — 두 화면의 합계가 항상 같다.
 * 클릭은 네이버와 기준을 맞추려고 링크 클릭(inline_link_clicks)을 쓴다.
 * 날짜는 광고 계정 시간대 기준이다(힐링브리즈 계정만 미국 LA 시간).
 *
 * .env.local
 *   META_ACCESS_TOKEN  비즈니스 설정 → 시스템 사용자 dashboard-sync 의 토큰(ads_read)
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adMetrics,
  campaigns,
  creatives,
  syncRuns,
  type Country,
} from "@/db/schema";
import { addDays } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const API = "https://graph.facebook.com/v26.0";
/** 메타는 전환을 최대 28일 늦게 확정하므로 매번 최근 며칠을 다시 가져온다 */
const DEFAULT_DAYS = 35;
export const MAX_DAYS = 365;
/** 일별 × 광고 × 국가 행이 한 번에 너무 많지 않게 나눠 부른다 */
const CHUNK_DAYS = 30;
const INSERT_BATCH = 1000;

/**
 * 광고 계정 → 클라이언트(2026-10-28 팀 확인). GU Clinic 계정은 쓰지 않아 뺐다.
 * client: 캠페인 이름 규칙(CAMPAIGN_RULES)에 안 걸리는 캠페인이 갈 곳.
 * shared: 그 캠페인들이 강남·일산을 함께 알리는 광고라 지점별로 나눌 수 없는 계정. 지금은 GU강남에만 보인다.
 */
export const META_AD_ACCOUNTS: {
  id: string;
  name: string;
  client: ClientSlug;
  shared?: boolean;
}[] = [
  {
    id: "act_1000102971810954",
    name: "지유 글로벌(영미권)",
    client: "gu-gangnam",
    shared: true,
  },
  {
    id: "act_573926059290524",
    name: "지유 대만",
    client: "gu-gangnam",
    shared: true,
  },
  {
    id: "act_1350462796026549",
    name: "힐링브리즈(그 외 국가)",
    client: "gu-gangnam",
    shared: true,
  },
  { id: "act_476823767006615", name: "루호성형외과", client: "luho" },
];

/**
 * 캠페인 이름 → 클라이언트. 계정 기본값보다 먼저 본다.
 * 힐링브리즈 계정에 "국내_강남"·"국내_일산" 캠페인이 따로 있다(2026-10-28 확인).
 */
const CAMPAIGN_RULES: { match: RegExp; client: ClientSlug }[] = [
  { match: /일산/, client: "gu-ilsan" },
  { match: /강남/, client: "gu-gangnam" },
];

/** 매체 전환으로 세는 메타 액션. 지금 계정들은 메시지 문의 위주이고, 리드(폼)는 생기면 함께 센다 */
const CONVERSION_ACTIONS = [
  "onsite_conversion.messaging_conversation_started_7d",
  "lead",
];

type Action = { action_type: string; value: string };
type InsightRow = {
  date_start: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  country?: string;
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
};
type Paged<T> = { data: T[]; paging?: { next?: string } };
type CampaignInfo = { id: string; name: string; effective_status?: string };
/** 메타 effective_status 중 광고가 나가고 있는 상태(검토 중·문제 있음도 켜 둔 것) */
const ACTIVE_STATUSES = ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"];
type AdInfo = {
  id: string;
  name: string;
  effective_status?: string;
  creative?: {
    object_type?: string;
    thumbnail_url?: string;
    object_story_spec?: { link_data?: { child_attachments?: unknown[] } };
  };
};

function token() {
  return process.env.META_ACCESS_TOKEN?.trim() || null;
}

export function isMetaConfigured() {
  return token() !== null;
}

/** 호출 한도(코드 4·17·32·613·80000번대)나 일시 오류면 기다렸다가 다시 부른다 */
async function graph<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const body = await res.json();
    if (!body.error) return body as T;
    const code = Number(body.error.code);
    const throttled =
      [4, 17, 32, 613].includes(code) || (code >= 80000 && code < 80100);
    if (throttled && attempt < 3) {
      await new Promise((r) => setTimeout(r, 60_000 * (attempt + 1)));
      continue;
    }
    // "Service temporarily unavailable" 같은 일시 오류(#1·#2)는 잠깐 쉬고 다시
    if ((code === 1 || code === 2 || body.error.is_transient) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      continue;
    }
    throw new Error(`메타 API ${res.status} (#${code}): ${body.error.message}`);
  }
}

async function allPages<T>(url: string) {
  const rows: T[] = [];
  for (let next: string | undefined = url; next;) {
    const page: Paged<T> = await graph<Paged<T>>(next);
    rows.push(...page.data);
    next = page.paging?.next;
  }
  return rows;
}

function insightsUrl(
  account: string,
  range: { since: string; until: string },
  extra: Record<string, string>,
) {
  return `${API}/${account}/insights?${new URLSearchParams({
    time_range: JSON.stringify(range),
    time_increment: "1",
    fields: "spend,impressions,inline_link_clicks,actions",
    limit: "500",
    ...extra,
  })}`;
}

function conversionsOf(actions: Action[] | undefined) {
  return (actions ?? [])
    .filter((a) => CONVERSION_ACTIONS.includes(a.action_type))
    .reduce((sum, a) => sum + Number(a.value), 0);
}

/**
 * 따로 저장할 국가(db/schema.ts countryEnum). 여기에 없는 나라는 노출이 새어 나간 소액이라 OTHER 로 묶는다.
 * 새 나라를 타겟하면 enum 과 여기에 추가하고 npm run sync -- --meta-days=365 로 다시 채운다.
 */
const TRACKED_COUNTRIES = new Set<string>([
  "KR",
  "JP",
  "CN",
  "TW",
  "HK",
  "MO",
  "SG",
  "MY",
  "ID",
  "TH",
  "VN",
  "PH",
  "US",
  "CA",
  "GB",
  "AU",
]);

function countryOf(code: string | undefined): Country {
  if (!code || code === "unknown") return "UNKNOWN";
  return TRACKED_COUNTRIES.has(code) ? (code as Country) : "OTHER";
}

function formatOf(ad: AdInfo): "image" | "video" | "carousel" {
  if (ad.creative?.object_story_spec?.link_data?.child_attachments?.length)
    return "carousel";
  return ad.creative?.object_type === "VIDEO" ? "video" : "image";
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

export async function syncMeta(days = DEFAULT_DAYS) {
  if (!isMetaConfigured())
    throw new Error("META_ACCESS_TOKEN 이 .env.local 에 없어요");
  days = Math.min(Math.max(1, Math.floor(days)), MAX_DAYS);
  // 오늘은 아직 진행 중이라 어제까지
  const until = addDays(seoulToday(), -1);
  const since = addDays(until, -(days - 1));
  const ranges: { since: string; until: string }[] = [];
  for (let from = since; from <= until; from = addDays(from, CHUNK_DAYS)) {
    const to = addDays(from, CHUNK_DAYS - 1);
    ranges.push({ since: from, until: to < until ? to : until });
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ source: "meta_api" })
    .returning({ id: syncRuns.id });
  try {
    type Row = typeof adMetrics.$inferInsert & {
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
    };
    // 날짜 × 광고 × 국가. OTHER 로 묶이는 나라들은 한 줄로 합친다
    const rows = new Map<string, Row>();
    const ads = new Map<
      string,
      {
        client: ClientSlug;
        accountId: string;
        campaignId: string;
        campaignName: string;
        name: string;
      }
    >();
    const report = new Map<
      string,
      {
        account: string;
        client: ClientSlug;
        spend: number;
        countries: Set<string>;
        ads: Set<string>;
      }
    >();
    const reportOf = (account: string, client: ClientSlug) => {
      const key = `${account}|${client}`;
      if (!report.has(key))
        report.set(key, {
          account,
          client,
          spend: 0,
          countries: new Set(),
          ads: new Set(),
        });
      return report.get(key)!;
    };

    for (const acc of META_AD_ACCOUNTS) {
      for (const range of ranges) {
        const insights = await allPages<InsightRow>(
          insightsUrl(acc.id, range, {
            level: "ad",
            breakdowns: "country",
            fields:
              "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions",
          }),
        );
        for (const r of insights) {
          const client =
            CAMPAIGN_RULES.find((rule) =>
              rule.match.test(r.campaign_name ?? ""),
            )?.client ?? acc.client;
          const country = countryOf(r.country);
          const key = `${r.date_start}|${r.ad_id}|${country}`;
          const row = rows.get(key) ?? {
            date: r.date_start,
            client,
            channel: "meta" as const,
            accountId: acc.id,
            campaignId: r.campaign_id!,
            campaignName: r.campaign_name ?? r.campaign_id!,
            creativeId: r.ad_id!,
            country,
            spend: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            source: "meta_api" as const,
          };
          // 원 단위 반올림은 저장할 때 한 번만(작은 금액이 여러 줄로 쪼개져도 합계가 메타와 맞게)
          row.spend += Number(r.spend ?? 0);
          row.impressions += Number(r.impressions ?? 0);
          row.clicks += Number(r.inline_link_clicks ?? 0);
          row.conversions += conversionsOf(r.actions);
          rows.set(key, row);
          ads.set(r.ad_id!, {
            client,
            accountId: acc.id,
            campaignId: row.campaignId,
            campaignName: row.campaignName,
            name: r.ad_name ?? r.ad_id!,
          });
        }
      }
    }

    const values = [...rows.values()]
      .map((r) => ({ ...r, spend: Math.round(r.spend) }))
      .filter((r) => r.spend || r.impressions || r.clicks);
    for (const r of values) {
      const acc = META_AD_ACCOUNTS.find((a) => a.id === r.accountId)!;
      const rep = reportOf(acc.name, r.client);
      rep.spend += r.spend;
      rep.countries.add(r.country!);
      rep.ads.add(r.creativeId!);
    }

    // 소재 정보(형식·상태·썸네일). 계정의 광고 목록에서 찾고, 목록에 없는(지워진) 광고는 하나씩 조회한다
    const adFields =
      "name,effective_status,creative{object_type,thumbnail_url,object_story_spec}";
    const infos = new Map<string, AdInfo>();
    for (const acc of META_AD_ACCOUNTS) {
      const list = await allPages<AdInfo>(
        `${API}/${acc.id}/ads?${new URLSearchParams({
          fields: `id,${adFields}`,
          limit: "200",
          filtering: JSON.stringify([
            {
              field: "effective_status",
              operator: "IN",
              value: [
                "ACTIVE",
                "PAUSED",
                "ADSET_PAUSED",
                "CAMPAIGN_PAUSED",
                "ARCHIVED",
                "WITH_ISSUES",
                "DISAPPROVED",
                "PENDING_REVIEW",
                "IN_PROCESS",
              ],
            },
          ]),
        })}`,
      );
      for (const ad of list) if (ads.has(ad.id)) infos.set(ad.id, ad);
    }
    for (const id of ads.keys()) {
      if (infos.has(id)) continue;
      try {
        infos.set(id, await graph<AdInfo>(`${API}/${id}?fields=${adFields}`));
      } catch {
        // 완전히 지워진 광고는 이름만 남긴다
      }
    }

    // 캠페인 켜짐/꺼짐. 목록에 없으면(지워진 캠페인) 꺼짐으로 둔다
    const campaignInfos = new Map<
      string,
      CampaignInfo & { accountId: string }
    >();
    for (const acc of META_AD_ACCOUNTS) {
      const list = await allPages<CampaignInfo>(
        `${API}/${acc.id}/campaigns?${new URLSearchParams({
          fields: "id,name,effective_status",
          limit: "200",
          filtering: JSON.stringify([
            {
              field: "effective_status",
              operator: "IN",
              value: [
                "ACTIVE",
                "PAUSED",
                "ARCHIVED",
                "IN_PROCESS",
                "WITH_ISSUES",
              ],
            },
          ]),
        })}`,
      );
      for (const c of list)
        campaignInfos.set(c.id, { ...c, accountId: acc.id });
    }
    const campaignRows = new Map<string, typeof campaigns.$inferInsert>();
    for (const c of campaignInfos.values())
      campaignRows.set(c.id, {
        id: c.id,
        channel: "meta",
        accountId: c.accountId,
        name: c.name,
        active: ACTIVE_STATUSES.includes(c.effective_status ?? ""),
        status: c.effective_status ?? null,
      });
    for (const ad of ads.values())
      if (!campaignRows.has(ad.campaignId))
        campaignRows.set(ad.campaignId, {
          id: ad.campaignId,
          channel: "meta",
          accountId: ad.accountId,
          name: ad.campaignName,
          active: false,
          status: null,
        });

    await db.transaction(async (tx) => {
      for (const row of campaignRows.values())
        await tx
          .insert(campaigns)
          .values(row)
          .onConflictDoUpdate({
            target: campaigns.id,
            set: { ...row, updatedAt: sql`now()` },
          });
      // 소재를 먼저 넣어야 ad_metrics.creative_id 가 가리킬 수 있다
      for (const [id, ad] of ads) {
        const info = infos.get(id);
        const row = {
          id,
          client: ad.client,
          channel: "meta" as const,
          accountId: ad.accountId,
          campaignId: ad.campaignId,
          campaignName: ad.campaignName,
          name: info?.name ?? ad.name,
          format: info ? formatOf(info) : null,
          status: info?.effective_status ?? null,
          thumbnailUrl: info?.creative?.thumbnail_url ?? null,
        };
        await tx
          .insert(creatives)
          .values(row)
          .onConflictDoUpdate({
            target: creatives.id,
            set: { ...row, updatedAt: sql`now()` },
          });
      }
      // 가져온 기간의 메타 행은 통째로 교체(광고가 꺼지거나 계정 설정이 바뀐 경우도 맞게)
      await tx
        .delete(adMetrics)
        .where(
          and(
            eq(adMetrics.source, "meta_api"),
            gte(adMetrics.date, since),
            sql`${adMetrics.date} <= ${until}`,
          ),
        );
      for (let i = 0; i < values.length; i += INSERT_BATCH)
        await tx.insert(adMetrics).values(values.slice(i, i + INSERT_BATCH));
    });

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: values.length,
      })
      .where(eq(syncRuns.id, run.id));
    return {
      since,
      until,
      rows: values.length,
      accounts: [...report.values()].map((r) => ({
        ...r,
        countries: r.countries.size,
        ads: r.ads.size,
      })),
    };
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
