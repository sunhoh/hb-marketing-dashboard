/**
 * 2단계 DB 틀. 원본 값만 저장하고 CTR·CPC·CPM 같은 파생 지표는 lib/metrics.ts 에서 계산한다.
 * 같은 데이터를 다시 가져와도 중복되지 않도록 표마다 "자연 키"에 unique 를 건다(동기화는 upsert).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { ClientSlug } from "@/lib/types";

/** 데이터가 어디서 왔는지 — 화면의 "연결 끊김" 경고와 디버깅에 쓴다 */
export type Source =
  | "meta_api"
  | "naver_api"
  | "instagram_api"
  | "youtube_api"
  | "ga4_api"
  | "gsc_api"
  | "sheet";

const client = () => text("client").$type<ClientSlug>().notNull();
const source = () => text("source").$type<Source>().notNull();
const syncedAt = () =>
  timestamp("synced_at", { withTimezone: true }).notNull().defaultNow();

/** 매체 성과. API 는 일 단위(day), 시트 수기 입력은 주 단위(week, 월요일 날짜) */
export const adMetrics = pgTable(
  "ad_metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    granularity: text("granularity").$type<"day" | "week">().notNull(),
    client: client(),
    channel: text("channel").notNull(), // meta, gangnam-unni, creatrip, naver-place, danggeun, kakao-sms
    segment: text("segment").notNull().default(""), // 국가 / 국가 등급. 없으면 ""
    creativeId: text("creative_id").notNull().default(""), // 소재 단위 행만 채움
    account: text("account").notNull().default(""), // 매체 광고 계정 ID(메타 act_…). 같은 국가가 여러 계정에서 올 수 있어서 키에 넣는다
    spend: bigint("spend", { mode: "number" }).notNull(), // 원
    impressions: integer("impressions").notNull(), // 카톡·문자는 발송 수
    clicks: integer("clicks").notNull(),
    conversions: integer("conversions"), // 매체 전환. 매체가 주지 않으면 null
    source: source(),
    memo: text("memo"),
    syncedAt: syncedAt(),
  },
  (t) => [
    unique("ad_metrics_key").on(
      t.date,
      t.granularity,
      t.client,
      t.channel,
      t.segment,
      t.creativeId,
      t.account,
    ),
    check("ad_metrics_granularity", sql`${t.granularity} in ('day', 'week')`),
  ],
);

/** 메타 소재 목록. 성과 숫자는 ad_metrics(creative_id) 에 있다 */
export const creatives = pgTable("creatives", {
  id: text("id").primaryKey(), // 메타 광고 ID 또는 팀 내부 코드(GG-M-01)
  client: client(),
  channel: text("channel").notNull().default("meta"),
  name: text("name").notNull(),
  format: text("format").$type<"이미지" | "영상" | "캐러셀">(),
  status: text("status"), // ACTIVE / PAUSED 등 매체 상태
  thumbnailUrl: text("thumbnail_url"),
  updatedAt: syncedAt(),
});

/** 플레이스 키워드 순위(주 1회 기록). 순위권 밖이면 rank = null */
export const placeRanks = pgTable(
  "place_ranks",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    client: client(),
    keyword: text("keyword").notNull(),
    rank: integer("rank"),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("place_ranks_key").on(t.weekStart, t.client, t.keyword)],
);

/** 플레이스 리뷰·평점·저장 수(주 마지막 날 기준 누적값) */
export const placeStats = pgTable(
  "place_stats",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    client: client(),
    reviews: integer("reviews").notNull(),
    rating: numeric("rating", { precision: 3, scale: 2, mode: "number" }),
    saves: integer("saves"),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("place_stats_key").on(t.weekStart, t.client)],
);

/** 바이럴 발행 글. 한 줄 = 글 하나. 발행 수·상위노출 키워드 수는 집계해서 만든다 */
export const viralPosts = pgTable(
  "viral_posts",
  {
    id: serial("id").primaryKey(),
    publishedOn: date("published_on").notNull(),
    client: client(),
    platform: text("platform").notNull(), // 블로그 / 카페 등
    url: text("url").notNull(),
    keyword: text("keyword"),
    topExposed: integer("top_exposed").notNull().default(0), // 상위노출 1, 아니면 0
    checkedOn: date("checked_on"), // 상위노출을 확인한 날
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("viral_posts_url").on(t.url)],
);

/**
 * SNS 팔로워(주 마지막 날 기준)와 그 주 조회수.
 * 한 클라이언트가 같은 플랫폼 계정을 여럿 가질 수 있어서(@gu_clinic, @gu_clinic_tw) account 를 키에 넣는다.
 * 인스타그램은 과거 팔로워 수를 주지 않아서, 스냅숏을 쌓기 전 주는 followers 가 null 이다.
 */
export const snsStats = pgTable(
  "sns_stats",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    client: client(),
    platform: text("platform")
      .$type<"instagram" | "youtube" | "tiktok">()
      .notNull(),
    account: text("account").notNull().default(""), // @핸들. 시트 입력·유튜브는 ""
    followers: integer("followers"),
    views: integer("views"),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [
    unique("sns_stats_key").on(t.weekStart, t.client, t.platform, t.account),
  ],
);

/**
 * SNS 누적값 스냅숏(API 가 하루 한 번 기록). 유튜브는 기간 조회수를 주지 않아서
 * 누적 조회수의 주간 차이로 sns_stats 의 views 를 만든다.
 */
export const snsSnapshots = pgTable(
  "sns_snapshots",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    platform: text("platform")
      .$type<"instagram" | "youtube" | "tiktok">()
      .notNull(),
    account: text("account").notNull().default(""),
    followers: integer("followers").notNull(),
    totalViews: bigint("total_views", { mode: "number" }).notNull(),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [
    unique("sns_snapshots_key").on(t.date, t.client, t.platform, t.account),
  ],
);

/** 유튜브 영상(공개 정보). 조회수·좋아요·댓글은 동기화 때의 누적값 */
export const youtubeVideos = pgTable(
  "youtube_videos",
  {
    id: serial("id").primaryKey(),
    client: client(),
    videoId: text("video_id").notNull(),
    channelId: text("channel_id").notNull(),
    title: text("title").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    durationSec: integer("duration_sec").notNull(),
    isShort: integer("is_short").notNull().default(0), // 3분 이하 세로 영상 추정(1/0)
    thumbnailUrl: text("thumbnail_url"),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: integer("likes"),
    comments: integer("comments"),
    syncedAt: syncedAt(),
  },
  (t) => [unique("youtube_videos_key").on(t.client, t.videoId)],
);

/** 영상별 누적 조회수 스냅숏(하루 한 번). 나중에 '기간 중 조회수가 많이 늘어난 영상'에 쓴다 */
export const youtubeVideoSnapshots = pgTable(
  "youtube_video_snapshots",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    videoId: text("video_id").notNull(),
    views: bigint("views", { mode: "number" }).notNull(),
  },
  (t) => [unique("youtube_video_snapshots_key").on(t.date, t.videoId)],
);

/** GA4 일별 유입. 전환 = 클라이언트별로 정한 이벤트(db/sync/google.ts CONVERSION_EVENTS)의 합 */
export const ga4Daily = pgTable(
  "ga4_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    sourceMedium: text("source_medium").notNull(), // 예) "naver / brand"
    sessions: integer("sessions").notNull(),
    newUsers: integer("new_users").notNull(),
    conversions: integer("conversions").notNull(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("ga4_daily_key").on(t.date, t.client, t.sourceMedium)],
);

/** 서치 콘솔 일별 합계. 평균 순위 = positionSum ÷ impressions (노출 가중 평균) */
export const gscDaily = pgTable(
  "gsc_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    positionSum: numeric("position_sum", { mode: "number" }).notNull(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("gsc_daily_key").on(t.date, t.client)],
);

/** 서치 콘솔 일별 검색어(클릭이 있거나 노출이 많은 것만) */
export const gscQueryDaily = pgTable(
  "gsc_query_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    query: text("query").notNull(),
    clicks: integer("clicks").notNull(),
    impressions: integer("impressions").notNull(),
    positionSum: numeric("position_sum", { mode: "number" }).notNull(),
  },
  (t) => [unique("gsc_query_daily_key").on(t.date, t.client, t.query)],
);

/** 동기화 실행 기록. 마지막 성공이 오래되면 화면에 "연결 끊김"을 띄운다 */
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  source: source(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status")
    .$type<"running" | "success" | "error">()
    .notNull()
    .default("running"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  error: text("error"),
});
