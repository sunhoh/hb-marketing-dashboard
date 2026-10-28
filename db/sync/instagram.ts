/**
 * 인스타그램(Graph API, 메타 토큰 공용) → sns_daily(팔로워, 하루 한 번) + sns_weekly(주 단위, source = "instagram_api").
 *   · 주 조회수: 계정 인사이트 views(total_value)를 월요일~일요일 범위로 바로 받는다(과거 주도 조회 가능).
 *   · 팔로워: API 가 과거 값을 주지 않아서 동기화할 때마다 스냅숏을 쌓고, 주의 마지막 스냅숏을 그 주 팔로워로 쓴다.
 *
 * .env.local
 *   META_ACCESS_TOKEN  메타 광고와 같은 토큰(instagram_basic, instagram_manage_insights 포함)
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { snsDaily, snsWeekly, syncRuns } from "@/db/schema";
import { addDays, mondayOf } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const API = "https://graph.facebook.com/v26.0";
/** 최근 주는 조회수가 며칠 늦게 확정되므로 매번 다시 가져온다 */
const DEFAULT_WEEKS = 5;
export const MAX_WEEKS = 52;

/** 인스타그램 계정 → 클라이언트(2026-10-28). 해외용 계정도 같은 클라이언트에 따로 한 줄씩 보인다 */
export const INSTAGRAM_ACCOUNTS: {
  id: string;
  username: string;
  client: ClientSlug;
}[] = [
  { id: "17841446431835227", username: "gu_clinic", client: "gu-gangnam" },
  { id: "17841474146955685", username: "gu_clinic_tw", client: "gu-gangnam" },
  { id: "17841463384780501", username: "gu_clinic_ilsan", client: "gu-ilsan" },
  { id: "17841408792910127", username: "luho_beauty", client: "luho" },
  { id: "17841468848543752", username: "luho_global", client: "luho" },
];

function token() {
  return process.env.META_ACCESS_TOKEN?.trim() || null;
}

export function isInstagramConfigured() {
  return token() !== null;
}

async function graph<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}/${path}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    const body = await res.json();
    if (!body.error) return body as T;
    if (
      (body.error.is_transient || [1, 2].includes(body.error.code)) &&
      attempt < 4
    ) {
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      continue;
    }
    throw new Error(
      `인스타그램 API ${res.status} (#${body.error.code}): ${body.error.message}`,
    );
  }
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

/** 서울 날짜 00:00 의 유닉스 초 */
const unix = (date: string) =>
  Math.floor(new Date(`${date}T00:00:00+09:00`).getTime() / 1000);

export async function syncInstagram(weeks = DEFAULT_WEEKS) {
  if (!isInstagramConfigured())
    throw new Error("META_ACCESS_TOKEN 이 .env.local 에 없어요");
  weeks = Math.min(Math.max(1, Math.floor(weeks)), MAX_WEEKS);
  const today = seoulToday();
  const thisMonday = mondayOf(today);
  const mondays = Array.from({ length: weeks }, (_, i) =>
    addDays(thisMonday, -7 * (weeks - 1 - i)),
  );

  const [run] = await db
    .insert(syncRuns)
    .values({ source: "instagram_api" })
    .returning({ id: syncRuns.id });
  try {
    const report: {
      client: ClientSlug;
      account: string;
      followers: number;
      weekViews: number | null;
    }[] = [];
    for (const acc of INSTAGRAM_ACCOUNTS) {
      const account = `@${acc.username}`;
      const profile = await graph<{
        followers_count: number;
        username: string;
      }>(`${acc.id}?fields=followers_count,username`);
      const followers = profile.followers_count;
      await db
        .insert(snsDaily)
        .values({
          date: today,
          client: acc.client,
          platform: "instagram",
          account,
          followers,
          totalViews: 0,
          source: "instagram_api",
        })
        .onConflictDoUpdate({
          target: [
            snsDaily.date,
            snsDaily.client,
            snsDaily.platform,
            snsDaily.account,
          ],
          set: { followers, syncedAt: sql`now()` },
        });

      // 주의 마지막 스냅숏 = 그 주 팔로워
      const snaps = await db
        .select({ date: snsDaily.date, followers: snsDaily.followers })
        .from(snsDaily)
        .where(
          and(
            eq(snsDaily.platform, "instagram"),
            eq(snsDaily.account, account),
          ),
        )
        .orderBy(snsDaily.date);
      const followersByWeek = new Map(
        snaps.map((s) => [mondayOf(s.date), s.followers]),
      );

      let weekViews: number | null = null;
      for (const monday of mondays) {
        // 이번 주는 오늘 0시까지(어제까지)
        const end = addDays(monday, 7) < today ? addDays(monday, 7) : today;
        let views: number | null = null;
        if (end > monday) {
          const res = await graph<{
            data: { total_value?: { value: number } }[];
          }>(
            `${acc.id}/insights?metric=views&period=day&metric_type=total_value&since=${unix(monday)}&until=${unix(end)}`,
          );
          views = res.data[0]?.total_value?.value ?? null;
        }
        if (monday === thisMonday) weekViews = views;
        const weekFollowers = followersByWeek.get(monday) ?? null;
        await db
          .insert(snsWeekly)
          .values({
            weekStart: monday,
            client: acc.client,
            platform: "instagram",
            account,
            followers: weekFollowers,
            views,
            source: "instagram_api",
          })
          .onConflictDoUpdate({
            target: [
              snsWeekly.weekStart,
              snsWeekly.client,
              snsWeekly.platform,
              snsWeekly.account,
            ],
            set: {
              views,
              // 스냅숏이 없는 과거 주는 이미 있던 값을 지우지 않는다
              followers: sql`coalesce(excluded.followers, ${snsWeekly.followers})`,
              syncedAt: sql`now()`,
            },
          });
      }
      report.push({ client: acc.client, account, followers, weekViews });
    }
    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: report.length * weeks,
      })
      .where(eq(syncRuns.id, run.id));
    return { weeks, report };
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
