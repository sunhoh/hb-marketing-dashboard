/**
 * 2단계 DB 틀. 원본 값만 저장하고 CTR·CPC·CPM 같은 파생 지표는 lib/metrics.ts 에서 계산한다.
 * 같은 데이터를 다시 가져와도 중복되지 않도록 표마다 "자연 키"에 unique 를 건다(동기화는 upsert).
 */
import {
  bigint,
  date,
  index,
  integer,
  numeric,
  pgEnum,
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

// ── 광고 ────────────────────────────────────────────────

/** 클라이언트. 값은 URL·코드에서 쓰는 slug 그대로 */
export const clientEnum = pgEnum("client", ["gu-gangnam", "gu-ilsan", "luho"]);

/** 광고 채널(채널별 효율 표의 "채널") */
export const adChannelEnum = pgEnum("ad_channel", [
  "naver-search", // 네이버 파워링크
  "naver-brand", // 네이버 브랜드검색
  "naver-place", // 네이버 플레이스 광고
  "meta", // 메타
  "gangnam-unni", // 강남언니 (시트 재개 시)
]);
export type AdChannel = (typeof adChannelEnum.enumValues)[number];

/** 국가(메타). 타겟 국가만 따로, 나머지는 OTHER */
export const countryEnum = pgEnum("country", [
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
  "OTHER", // 기타 국가
  "UNKNOWN", // 메타가 국가를 모름
]);
export type Country = (typeof countryEnum.enumValues)[number];

/** 데이터 출처. 우선 ad_metrics 에만 쓰고, 다른 표는 다음 단계에서 옮긴다 */
export const sourceEnum = pgEnum("source", [
  "naver_api",
  "meta_api",
  "instagram_api",
  "youtube_api",
  "ga4_api",
  "gsc_api",
  "sheet",
]);

export const creativeFormatEnum = pgEnum("creative_format", [
  "image",
  "video",
  "carousel",
]);

/** 소재(메타 광고) 정보. 성과 숫자는 ad_metrics.creative_id 로 연결 */
export const creatives = pgTable("creatives", {
  id: text("id").primaryKey(), // 메타 광고 ID
  client: clientEnum("client").notNull(),
  channel: adChannelEnum("channel").notNull(),
  accountId: text("account_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  campaignName: text("campaign_name").notNull(),
  name: text("name").notNull(),
  format: creativeFormatEnum("format"),
  status: text("status"), // ACTIVE / PAUSED … 메타 값 그대로
  thumbnailUrl: text("thumbnail_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 광고 성과(일 단위). 채널마다 단위가 하나로 정해져 있어서 어떤 기준으로 더해도 두 번 세지 않는다.
 *   · 네이버: 날짜 × 캠페인(지점이 광고그룹으로 나뉜 캠페인은 × 광고그룹)
 *   · 메타:   날짜 × 광고(소재) × 국가
 * 채널별 효율 표 = 국가·캠페인으로 묶은 합, 소재 카드 = 소재로 묶은 합.
 */
export const adMetrics = pgTable(
  "ad_metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: clientEnum("client").notNull(),
    channel: adChannelEnum("channel").notNull(),
    accountId: text("account_id").notNull(), // 네이버 고객 ID / 메타 act_…
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(), // 동기화 시점 이름
    adgroupId: text("adgroup_id"), // 네이버 광고그룹 단위일 때만
    adgroupName: text("adgroup_name"),
    creativeId: text("creative_id").references(() => creatives.id), // 메타만
    country: countryEnum("country"), // 메타만
    spend: bigint("spend", { mode: "number" }).notNull(), // 원
    impressions: integer("impressions").notNull(),
    clicks: integer("clicks").notNull(), // 메타는 링크 클릭
    conversions: integer("conversions"), // 매체 전환. 매체가 주지 않으면 null
    source: sourceEnum("source").notNull(),
    syncedAt: syncedAt(),
  },
  (t) => [
    // 같은 날·같은 단위는 한 줄. 빈 칸(null)도 같은 값으로 본다
    unique("ad_metrics_key")
      .on(
        t.date,
        t.channel,
        t.accountId,
        t.campaignId,
        t.adgroupId,
        t.creativeId,
        t.country,
      )
      .nullsNotDistinct(),
    index("ad_metrics_client_date").on(t.client, t.date), // 화면은 클라이언트 + 기간으로 읽는다
  ],
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
