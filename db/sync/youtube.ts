/**
 * YouTube Data API → sns_snapshots(하루 한 번 누적값) → sns_stats(주 단위, source = "youtube_api").
 * API 는 기간 조회수를 주지 않으므로, 주 조회수 = 그 주 마지막 누적 조회수 − 지난주 마지막 누적 조회수.
 * 그래서 첫 동기화 주의 조회수는 비어 있고, 다음 주부터 채워진다. 구독자 수는 유튜브가 반올림해서 준다(예: 1.23만).
 *
 * .env.local
 *   YOUTUBE_API_KEY   구글 클라우드 API 키(YouTube Data API v3 로 제한)
 *   YOUTUBE_CHANNELS  클라이언트:채널 목록. 채널은 @핸들 또는 UC… ID. 예) gu-gangnam:@jiyuclinic,luho:UCxxxx
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { snsSnapshots, snsStats, syncRuns } from "@/db/schema";
import { isClientSlug } from "@/lib/clients";
import { mondayOf } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

type ChannelResponse = {
  items?: {
    id: string;
    snippet: { title: string };
    statistics: {
      subscriberCount?: string;
      viewCount?: string;
      hiddenSubscriberCount?: boolean;
    };
  }[];
};

function config() {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const channels = (process.env.YOUTUBE_CHANNELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      const client = pair.slice(0, i).trim();
      const channel = pair.slice(i + 1).trim();
      if (
        i < 0 ||
        !isClientSlug(client) ||
        !/^(@[\w.-]+|UC[\w-]{22})$/.test(channel)
      ) {
        throw new Error(
          `YOUTUBE_CHANNELS 형식이 틀렸어요: "${pair}" (예: gu-gangnam:@jiyuclinic)`,
        );
      }
      return { client: client as ClientSlug, channel };
    });
  if (!apiKey || channels.length === 0) return null;
  return { apiKey, channels };
}

export function isYoutubeConfigured() {
  return config() !== null;
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

/** 스냅숏 → 주 단위 sns_stats (주마다 마지막 스냅숏) */
async function rebuildWeekly(client: ClientSlug) {
  const snaps = await db
    .select()
    .from(snsSnapshots)
    .where(
      and(
        eq(snsSnapshots.client, client),
        eq(snsSnapshots.platform, "youtube"),
      ),
    )
    .orderBy(asc(snsSnapshots.date));
  const lastByWeek = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) lastByWeek.set(mondayOf(s.date), s);
  const weeks = [...lastByWeek.entries()];
  const rows = weeks.map(([weekStart, s], i) => ({
    weekStart,
    client,
    platform: "youtube" as const,
    followers: s.followers,
    views:
      i > 0 ? Math.max(0, s.totalViews - weeks[i - 1][1].totalViews) : null,
    source: "youtube_api" as const,
  }));
  await db.transaction(async (tx) => {
    await tx
      .delete(snsStats)
      .where(
        and(
          eq(snsStats.source, "youtube_api"),
          eq(snsStats.client, client),
          eq(snsStats.platform, "youtube"),
        ),
      );
    if (rows.length) await tx.insert(snsStats).values(rows);
  });
}

export async function syncYoutube() {
  const cfg = config();
  if (!cfg)
    throw new Error(
      "YOUTUBE_API_KEY / YOUTUBE_CHANNELS 가 .env.local 에 없어요",
    );
  const today = seoulToday();
  const [run] = await db
    .insert(syncRuns)
    .values({ source: "youtube_api" })
    .returning({ id: syncRuns.id });

  try {
    const report: {
      client: ClientSlug;
      title: string;
      subscribers: number;
      totalViews: number;
    }[] = [];
    for (const { client, channel } of cfg.channels) {
      const params = new URLSearchParams({
        part: "snippet,statistics",
        key: cfg.apiKey,
      });
      params.set(channel.startsWith("@") ? "forHandle" : "id", channel);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${params}`,
      );
      if (!res.ok)
        throw new Error(
          `YouTube ${channel} ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      const item = ((await res.json()) as ChannelResponse).items?.[0];
      if (!item) throw new Error(`유튜브 채널을 찾지 못했어요: ${channel}`);

      const followers = item.statistics.hiddenSubscriberCount
        ? 0
        : Number(item.statistics.subscriberCount ?? 0);
      const totalViews = Number(item.statistics.viewCount ?? 0);
      await db
        .insert(snsSnapshots)
        .values({
          date: today,
          client,
          platform: "youtube",
          followers,
          totalViews,
          source: "youtube_api",
        })
        .onConflictDoUpdate({
          target: [
            snsSnapshots.date,
            snsSnapshots.client,
            snsSnapshots.platform,
          ],
          set: { followers, totalViews, syncedAt: sql`now()` },
        });
      await rebuildWeekly(client);
      report.push({
        client,
        title: item.snippet.title,
        subscribers: followers,
        totalViews,
      });
    }
    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: report.length,
      })
      .where(eq(syncRuns.id, run.id));
    return report;
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
