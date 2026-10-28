/**
 * GA4 Data API → ga4_daily, 서치 콘솔 API → gsc_daily · gsc_query_daily.
 * 서비스 계정 dashboard-sync 가 GA4 속성(뷰어)·서치 콘솔 속성(제한됨)에 추가돼 있어야 한다.
 * 평소엔 최근 DEFAULT_DAYS 일을 다시 받아 교체하고, 처음 한 번은 --google-days=400 으로 과거를 채운다.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { ga4Daily, gscDaily, gscQueryDaily, syncRuns } from "@/db/schema";
import { addDays } from "@/lib/periods";
import { CONVERSION_EVENTS } from "@/lib/web-config";
import type { ClientSlug } from "@/lib/types";
import { googleJwt } from "./google-auth";

const DEFAULT_DAYS = 35;
/** 검색어는 행이 많아서 최근 120일만 둔다(이번 달·지난달·최근 12주 비교에 충분) */
const QUERY_DAYS = 120;
/** 서치 콘솔 보관 기간 16개월 */
const GSC_MAX_DAYS = 480;

/** 클라이언트별 GA4 속성 */
const GA4_PROPERTIES: Record<ClientSlug, string | null> = {
  "gu-gangnam": "293101505",
  "gu-ilsan": "460229156",
  luho: "557924179",
  cellora: null,
};


/** 서치 콘솔 속성 → 클라이언트. gu.clinic 은 일산 하위 도메인까지 포함하므로 페이지 주소로 나눈다 */
const GSC_TARGETS: {
  client: ClientSlug;
  site: string;
  page?: { operator: "contains" | "notContains"; expression: string };
}[] = [
  {
    client: "gu-gangnam",
    site: "sc-domain:gu.clinic",
    page: { operator: "notContains", expression: "ilsan.gu.clinic" },
  },
  {
    client: "gu-ilsan",
    site: "sc-domain:gu.clinic",
    page: { operator: "contains", expression: "ilsan.gu.clinic" },
  },
  { client: "luho", site: "sc-domain:luho.kr" },
];

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

type Ga4Report = {
  rows?: {
    dimensionValues: { value: string }[];
    metricValues: { value: string }[];
  }[];
  rowCount?: number;
};

async function ga4Report(
  auth: ReturnType<typeof googleJwt>,
  property: string,
  body: Record<string, unknown>,
) {
  const rows: NonNullable<Ga4Report["rows"]> = [];
  const limit = 100_000;
  for (let offset = 0; ; offset += limit) {
    const res = await auth.request<Ga4Report>({
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      method: "POST",
      data: { ...body, limit, offset },
    });
    rows.push(...(res.data.rows ?? []));
    if (rows.length >= (res.data.rowCount ?? 0) || !res.data.rows?.length)
      return rows;
  }
}

async function syncGa4(
  auth: ReturnType<typeof googleJwt>,
  since: string,
  until: string,
) {
  const report: {
    client: ClientSlug;
    rows: number;
    sessions: number;
    conversions: number;
  }[] = [];
  for (const [client, property] of Object.entries(GA4_PROPERTIES) as [
    ClientSlug,
    string | null,
  ][]) {
    if (!property) continue;
    const dateRanges = [{ startDate: since, endDate: until }];
    const traffic = await ga4Report(auth, property, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }, { name: "newUsers" }],
    });
    const events = CONVERSION_EVENTS[client];
    const conv = events.length
      ? await ga4Report(auth, property, {
          dateRanges,
          dimensions: [{ name: "date" }, { name: "sessionSourceMedium" }],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            filter: {
              fieldName: "eventName",
              inListFilter: { values: events },
            },
          },
        })
      : [];

    const map = new Map<
      string,
      {
        date: string;
        sourceMedium: string;
        sessions: number;
        newUsers: number;
        conversions: number;
      }
    >();
    const get = (d: string, sm: string) => {
      const key = `${d}|${sm}`;
      let row = map.get(key);
      if (!row)
        map.set(
          key,
          (row = {
            date: ymd(d),
            sourceMedium: sm,
            sessions: 0,
            newUsers: 0,
            conversions: 0,
          }),
        );
      return row;
    };
    for (const r of traffic) {
      const row = get(r.dimensionValues[0].value, r.dimensionValues[1].value);
      row.sessions += Number(r.metricValues[0].value);
      row.newUsers += Number(r.metricValues[1].value);
    }
    for (const r of conv)
      get(r.dimensionValues[0].value, r.dimensionValues[1].value).conversions +=
        Number(r.metricValues[0].value);
    const rows = [...map.values()].map((r) => ({ ...r, client }));

    await db.transaction(async (tx) => {
      await tx
        .delete(ga4Daily)
        .where(
          and(
            eq(ga4Daily.client, client),
            gte(ga4Daily.date, since),
            lte(ga4Daily.date, until),
          ),
        );
      for (let i = 0; i < rows.length; i += 1000)
        await tx.insert(ga4Daily).values(rows.slice(i, i + 1000));
    });
    report.push({
      client,
      rows: rows.length,
      sessions: rows.reduce((a, r) => a + r.sessions, 0),
      conversions: rows.reduce((a, r) => a + r.conversions, 0),
    });
  }
  return report;
}

type GscResponse = {
  rows?: {
    keys: string[];
    clicks: number;
    impressions: number;
    position: number;
  }[];
};

async function gscQuery(
  auth: ReturnType<typeof googleJwt>,
  t: (typeof GSC_TARGETS)[number],
  body: Record<string, unknown>,
) {
  const rows: NonNullable<GscResponse["rows"]> = [];
  const rowLimit = 25_000;
  for (let startRow = 0; ; startRow += rowLimit) {
    const res = await auth.request<GscResponse>({
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(t.site)}/searchAnalytics/query`,
      method: "POST",
      data: {
        ...body,
        rowLimit,
        startRow,
        ...(t.page
          ? {
              dimensionFilterGroups: [
                { filters: [{ dimension: "page", ...t.page }] },
              ],
            }
          : {}),
      },
    });
    rows.push(...(res.data.rows ?? []));
    if ((res.data.rows?.length ?? 0) < rowLimit) return rows;
  }
}

async function syncGsc(
  auth: ReturnType<typeof googleJwt>,
  since: string,
  until: string,
) {
  const gscSince =
    since < addDays(until, -(GSC_MAX_DAYS - 1))
      ? addDays(until, -(GSC_MAX_DAYS - 1))
      : since;
  const querySince =
    gscSince < addDays(until, -(QUERY_DAYS - 1))
      ? addDays(until, -(QUERY_DAYS - 1))
      : gscSince;
  const report: {
    client: ClientSlug;
    clicks: number;
    impressions: number;
    queries: number;
  }[] = [];
  for (const t of GSC_TARGETS) {
    const totals = await gscQuery(auth, t, {
      startDate: gscSince,
      endDate: until,
      dimensions: ["date"],
    });
    const queries = await gscQuery(auth, t, {
      startDate: querySince,
      endDate: until,
      dimensions: ["date", "query"],
    });
    const dailyRows = totals.map((r) => ({
      date: r.keys[0],
      client: t.client,
      clicks: r.clicks,
      impressions: r.impressions,
      positionSum: r.position * r.impressions,
    }));
    // 행 수를 줄이려고 클릭이 있거나 노출이 10번 이상인 검색어만
    const queryRows = queries
      .filter((r) => r.clicks > 0 || r.impressions >= 10)
      .map((r) => ({
        date: r.keys[0],
        client: t.client,
        query: r.keys[1],
        clicks: r.clicks,
        impressions: r.impressions,
        positionSum: r.position * r.impressions,
      }));
    await db.transaction(async (tx) => {
      await tx
        .delete(gscDaily)
        .where(
          and(
            eq(gscDaily.client, t.client),
            gte(gscDaily.date, gscSince),
            lte(gscDaily.date, until),
          ),
        );
      for (let i = 0; i < dailyRows.length; i += 1000)
        await tx.insert(gscDaily).values(dailyRows.slice(i, i + 1000));
      await tx
        .delete(gscQueryDaily)
        .where(
          and(
            eq(gscQueryDaily.client, t.client),
            gte(gscQueryDaily.date, querySince),
            lte(gscQueryDaily.date, until),
          ),
        );
      for (let i = 0; i < queryRows.length; i += 1000)
        await tx.insert(gscQueryDaily).values(queryRows.slice(i, i + 1000));
    });
    report.push({
      client: t.client,
      clicks: dailyRows.reduce((a, r) => a + r.clicks, 0),
      impressions: dailyRows.reduce((a, r) => a + r.impressions, 0),
      queries: queryRows.length,
    });
  }
  return { since: gscSince, report };
}

export async function syncGoogle(days = DEFAULT_DAYS) {
  const until = addDays(seoulToday(), -1);
  const since = addDays(until, -(Math.max(1, Math.floor(days)) - 1));
  const auth = googleJwt(SCOPES);
  const result: {
    ga4?: Awaited<ReturnType<typeof syncGa4>>;
    gsc?: Awaited<ReturnType<typeof syncGsc>>;
  } = {};
  for (const [source, job] of [
    ["ga4_api", async () => (result.ga4 = await syncGa4(auth, since, until))],
    ["gsc_api", async () => (result.gsc = await syncGsc(auth, since, until))],
  ] as const) {
    const [run] = await db
      .insert(syncRuns)
      .values({ source })
      .returning({ id: syncRuns.id });
    try {
      await job();
      await db
        .update(syncRuns)
        .set({ status: "success", finishedAt: new Date() })
        .where(eq(syncRuns.id, run.id));
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
  return { since, until, ...result };
}
