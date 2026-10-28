/**
 * YouTube Data API → sns_daily(하루 한 번 누적값) → sns_weekly(주 단위, source = "youtube_api").
 * API 는 기간 조회수를 주지 않으므로, 주 조회수 = 그 주 마지막 누적 조회수 − 지난주 마지막 누적 조회수.
 * 그래서 첫 동기화 주의 조회수는 비어 있고, 다음 주부터 채워진다. 구독자 수는 유튜브가 반올림해서 준다(예: 1.23만).
 * 영상 목록(최근 VIDEO_LOOKBACK_DAYS 일 업로드)도 함께 저장한다(조회수는 동기화 때의 누적값).
 *
 * .env.local
 *   YOUTUBE_API_KEY   구글 클라우드 API 키(YouTube Data API v3 로 제한)
 *   YOUTUBE_CHANNELS  클라이언트:채널 목록. 채널은 @핸들 또는 UC… ID. 예) gu-gangnam:@jiyuclinic,luho:UCxxxx
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { snsDaily, snsWeekly, syncRuns, youtubeVideos } from "@/db/schema";
import { isClientSlug } from "@/lib/clients";
import { addDays, mondayOf } from "@/lib/periods";
import type { ClientSlug } from "@/lib/types";

const API = "https://www.googleapis.com/youtube/v3";
/** 영상 목록을 가져올 기간. 기간 비교(직전 12주·전월)에 충분하게 */
const VIDEO_LOOKBACK_DAYS = 400;
/** 유튜브 쇼츠는 최대 3분 — 길이로 추정한다 */
const SHORTS_MAX_SEC = 180;

type ChannelResponse = {
  items?: {
    id: string;
    snippet: { title: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
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
        !/^(@[\p{L}\p{N}._-]+|UC[\w-]{22})$/u.test(channel)
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

async function yt<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
) {
  const res = await fetch(
    `${API}/${path}?${new URLSearchParams({ ...params, key: apiKey })}`,
  );
  if (!res.ok)
    throw new Error(
      `YouTube ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  return (await res.json()) as T;
}

/** "PT1H2M3S" → 초 */
function durationToSec(iso: string) {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, mi, se] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + se;
}

type PlaylistItems = {
  nextPageToken?: string;
  items: { contentDetails: { videoId: string; videoPublishedAt?: string } }[];
};
type Videos = {
  items: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails?: { medium?: { url: string } };
    };
    contentDetails: { duration: string };
    statistics: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }[];
};

/** 업로드 재생목록에서 최근 영상을 모아 youtube_videos 와 스냅숏에 저장. 저장한 영상 수를 돌려준다 */
async function syncVideos(
  client: ClientSlug,
  channelId: string,
  uploads: string,
  apiKey: string,
  today: string,
) {
  const cutoff = addDays(today, -VIDEO_LOOKBACK_DAYS);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await yt<PlaylistItems>(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploads,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );
    let reachedOld = false;
    for (const it of page.items) {
      const published = it.contentDetails.videoPublishedAt?.slice(0, 10);
      if (published && published < cutoff) reachedOld = true;
      else ids.push(it.contentDetails.videoId);
    }
    // 업로드 목록은 최신순이라 오래된 영상이 나오면 멈춘다
    pageToken = reachedOld ? undefined : page.nextPageToken;
  } while (pageToken);

  for (let i = 0; i < ids.length; i += 50) {
    const batch = await yt<Videos>(
      "videos",
      {
        part: "snippet,contentDetails,statistics",
        id: ids.slice(i, i + 50).join(","),
      },
      apiKey,
    );
    for (const v of batch.items) {
      const durationSec = durationToSec(v.contentDetails.duration);
      const row = {
        client,
        videoId: v.id,
        channelId,
        title: v.snippet.title,
        publishedAt: new Date(v.snippet.publishedAt),
        durationSec,
        isShort: durationSec > 0 && durationSec <= SHORTS_MAX_SEC,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url ?? null,
        views: Number(v.statistics.viewCount ?? 0),
        likes:
          v.statistics.likeCount === undefined
            ? null
            : Number(v.statistics.likeCount),
        comments:
          v.statistics.commentCount === undefined
            ? null
            : Number(v.statistics.commentCount),
      };
      await db
        .insert(youtubeVideos)
        .values(row)
        .onConflictDoUpdate({
          target: [youtubeVideos.client, youtubeVideos.videoId],
          set: { ...row, syncedAt: sql`now()` },
        });
    }
  }
  return ids.length;
}

function seoulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

/**
 * sns_daily → sns_weekly. 주마다 마지막 날 기록을 그 주 값으로 쓴다.
 * 유튜브 API 는 누적 조회수만 주므로
 *   이번 주 조회수 = 이번 주 마지막 날 누적 조회수 − 지난주 마지막 날 누적 조회수
 * 기록을 시작한 첫 주는 뺄 값이 없어서 null(화면에서 —).
 */
async function rebuildWeekly(client: ClientSlug, account: string) {
  const snaps = await db
    .select()
    .from(snsDaily)
    .where(
      and(
        eq(snsDaily.client, client),
        eq(snsDaily.platform, "youtube"),
        eq(snsDaily.account, account),
      ),
    )
    .orderBy(asc(snsDaily.date));
  const lastByWeek = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) lastByWeek.set(mondayOf(s.date), s);
  const weeks = [...lastByWeek.entries()];
  const rows = weeks.map(([weekStart, s], i) => ({
    weekStart,
    client,
    platform: "youtube" as const,
    account,
    followers: s.followers,
    views:
      i > 0 ? Math.max(0, s.totalViews - weeks[i - 1][1].totalViews) : null,
    source: "youtube_api" as const,
  }));
  await db.transaction(async (tx) => {
    await tx
      .delete(snsWeekly)
      .where(
        and(
          eq(snsWeekly.source, "youtube_api"),
          eq(snsWeekly.client, client),
          eq(snsWeekly.platform, "youtube"),
        ),
      );
    if (rows.length) await tx.insert(snsWeekly).values(rows);
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
      videos: number;
    }[] = [];
    for (const { client, channel } of cfg.channels) {
      const params = new URLSearchParams({
        part: "snippet,statistics,contentDetails",
        key: cfg.apiKey,
      });
      params.set(
        channel.startsWith("@") ? "forHandle" : "id",
        channel.normalize("NFC"),
      );
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
        .insert(snsDaily)
        .values({
          date: today,
          client,
          platform: "youtube",
          account: channel, // 채널 링크용 @핸들(또는 UC… ID)
          followers,
          totalViews,
          source: "youtube_api",
        })
        .onConflictDoUpdate({
          target: [
            snsDaily.date,
            snsDaily.client,
            snsDaily.platform,
            snsDaily.account,
          ],
          set: { followers, totalViews, syncedAt: sql`now()` },
        });
      await rebuildWeekly(client, channel);
      const uploads = item.contentDetails?.relatedPlaylists?.uploads;
      const videos = uploads
        ? await syncVideos(client, item.id, uploads, cfg.apiKey, today)
        : 0;
      report.push({
        videos,
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
