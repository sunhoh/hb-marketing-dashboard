/**
 * 메타 광고(Marketing API) → ad_metrics(일 단위, source = "meta_api") + creatives.
 *   · 채널 표: 광고 계정 × 국가 (segment = 국가 이름, account = act_…)
 *   · 소재 표: 광고 단위 (creative_id = 광고 ID)
 * 클릭은 네이버와 기준을 맞추려고 링크 클릭(inline_link_clicks)을 쓴다.
 * 날짜는 광고 계정 시간대 기준이다(힐링브리즈 계정만 미국 LA 시간).
 *
 * .env.local
 *   META_ACCESS_TOKEN  비즈니스 설정 → 시스템 사용자 dashboard-sync 의 토큰(ads_read)
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { adMetrics, creatives, syncRuns } from "@/db/schema";
import { addDays } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const API = "https://graph.facebook.com/v26.0";
/** 메타는 전환을 최대 28일 늦게 확정하므로 매번 최근 며칠을 다시 가져온다 */
const DEFAULT_DAYS = 35;
export const MAX_DAYS = 365;
/** 일별 × 국가/광고 행이 한 번에 너무 많지 않게 나눠 부른다 */
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
  campaign_name?: string;
};
type Paged<T> = { data: T[]; paging?: { next?: string } };
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
 * 표에 따로 보여 줄 국가(타겟 국가). 여기에 없는 나라는 노출이 새어 나간 소액이라 "기타 국가"로 묶는다.
 * 새 나라를 타겟하면 여기에 추가하고 npm run sync -- --meta-days=365 로 다시 채운다.
 */
const COUNTRY_LABELS: Record<string, string> = {
  KR: "한국",
  JP: "일본",
  CN: "중국",
  TW: "대만",
  HK: "홍콩",
  MO: "마카오",
  SG: "싱가포르",
  MY: "말레이시아",
  ID: "인도네시아",
  TH: "태국",
  VN: "베트남",
  PH: "필리핀",
  US: "미국",
  CA: "캐나다",
  GB: "영국",
  AU: "호주",
};
const OTHER_COUNTRIES = "기타 국가";

function formatOf(ad: AdInfo): "이미지" | "영상" | "캐러셀" {
  if (ad.creative?.object_story_spec?.link_data?.child_attachments?.length)
    return "캐러셀";
  return ad.creative?.object_type === "VIDEO" ? "영상" : "이미지";
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
    type Row = typeof adMetrics.$inferInsert;
    const rows: Row[] = [];
    const adNames = new Map<string, { name: string; client: ClientSlug }>();
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
      const base = (r: InsightRow) => ({
        date: r.date_start,
        granularity: "day" as const,
        client:
          CAMPAIGN_RULES.find((rule) => rule.match.test(r.campaign_name ?? ""))
            ?.client ?? acc.client,
        channel: "meta",
        account: acc.id,
        spend: Math.round(Number(r.spend ?? 0)),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.inline_link_clicks ?? 0),
        conversions: conversionsOf(r.actions),
        source: "meta_api" as const,
      });
      const hasData = (r: Row) => r.spend || r.impressions || r.clicks;

      for (const range of ranges) {
        // 채널 표: 국가별. 기타 국가는 날짜마다 한 줄로 합친다
        const byCountry = new Map<
          string,
          Row & {
            spend: number;
            impressions: number;
            clicks: number;
            conversions: number;
          }
        >();
        for (const r of await allPages<InsightRow>(
          insightsUrl(acc.id, range, {
            level: "campaign",
            breakdowns: "country",
            fields:
              "campaign_name,spend,impressions,inline_link_clicks,actions",
          }),
        )) {
          const segment = COUNTRY_LABELS[r.country ?? ""] ?? OTHER_COUNTRIES;
          const row = base(r);
          const key = `${row.date}|${row.client}|${segment}`;
          const sum = byCountry.get(key);
          if (!sum) {
            byCountry.set(key, { ...row, segment });
            continue;
          }
          sum.spend += row.spend;
          sum.impressions += row.impressions;
          sum.clicks += row.clicks;
          sum.conversions += row.conversions;
        }
        for (const row of byCountry.values()) {
          if (!hasData(row)) continue;
          rows.push(row);
          const rep = reportOf(acc.name, row.client);
          rep.spend += row.spend;
          rep.countries.add(row.segment!);
        }
        // 소재 표: 광고별
        const adRows = await allPages<InsightRow>(
          insightsUrl(acc.id, range, {
            level: "ad",
            fields:
              "ad_id,ad_name,campaign_name,spend,impressions,inline_link_clicks,actions",
          }),
        );
        for (const r of adRows) {
          const row = { ...base(r), segment: "", creativeId: r.ad_id! };
          if (!hasData(row)) continue;
          rows.push(row);
          reportOf(acc.name, row.client).ads.add(r.ad_id!);
          adNames.set(r.ad_id!, {
            name: r.ad_name ?? r.ad_id!,
            client: row.client,
          });
        }
      }
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
      for (const ad of list) if (adNames.has(ad.id)) infos.set(ad.id, ad);
    }
    for (const id of adNames.keys()) {
      if (infos.has(id)) continue;
      try {
        infos.set(id, await graph<AdInfo>(`${API}/${id}?fields=${adFields}`));
      } catch {
        // 완전히 지워진 광고는 이름만 남긴다
      }
    }

    await db.transaction(async (tx) => {
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
      for (let i = 0; i < rows.length; i += INSERT_BATCH)
        await tx.insert(adMetrics).values(rows.slice(i, i + INSERT_BATCH));

      for (const [id, { name, client }] of adNames) {
        const info = infos.get(id);
        const row = {
          id,
          client,
          channel: "meta",
          name: info?.name ?? name,
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
    });

    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: rows.length,
      })
      .where(eq(syncRuns.id, run.id));
    return {
      since,
      until,
      rows: rows.length,
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
