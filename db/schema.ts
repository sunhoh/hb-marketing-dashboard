/**
 * 2단계 DB 틀. 원본 값만 저장하고 CTR·CPC·CPM 같은 파생 지표는 lib/metrics.ts 에서 계산한다.
 * 같은 데이터를 다시 가져와도 중복되지 않도록 표마다 "자연 키"에 unique 를 건다(동기화는 upsert).
 */
import {
  bigint,
  boolean,
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

// ── 공용 enum ──────────────────────────────────────────

/** 클라이언트. 값은 URL·코드에서 쓰는 slug 그대로 */
export const clientEnum = pgEnum("client", ["gu-gangnam", "gu-ilsan", "luho"]);

/** 데이터 출처 — 화면의 "마지막 동기화"와 디버깅에 쓴다 */
export const sourceEnum = pgEnum("source", [
  "naver_api",
  "meta_api",
  "instagram_api",
  "youtube_api",
  "ga4_api",
  "gsc_api",
  "sheet",
]);
export type Source = (typeof sourceEnum.enumValues)[number];

/** SNS 플랫폼 */
export const snsPlatformEnum = pgEnum("sns_platform", [
  "instagram",
  "youtube",
  "tiktok",
]);

/** 동기화 실행 상태 */
export const syncStatusEnum = pgEnum("sync_status", [
  "running",
  "success",
  "error",
]);

const client = () => clientEnum("client").notNull();
const source = () => sourceEnum("source").notNull();
const syncedAt = () =>
  timestamp("synced_at", { withTimezone: true }).notNull().defaultNow();

// ── 광고 ────────────────────────────────────────────────

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
 * 캠페인 켜짐/꺼짐(동기화 시점). 채널별 효율 표의 "꺼짐" 표시에 쓴다.
 * 클라이언트는 넣지 않는다 — 네이버는 한 캠페인이 광고그룹별로 여러 클라이언트에 나뉠 수 있어서 ad_metrics 행이 정한다.
 */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(), // 네이버 nccCampaignId / 메타 캠페인 ID
  channel: adChannelEnum("channel").notNull(),
  accountId: text("account_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull(),
  status: text("status"), // 매체 값 그대로(메타 effective_status, 네이버 status)
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * SNS 주간 요약(화면이 읽는 표): 그 주 마지막 날 팔로워·구독자와 그 주 조회수.
 *   · 인스타그램 조회수: 계정 인사이트 views(릴스·게시물·스토리, 광고 포함)를 주 단위로 바로 받는다.
 *   · 유튜브 조회수: API 가 누적값만 줘서 sns_daily 로 계산한다.
 *       이번 주 조회수 = 이번 주 마지막 날 누적 조회수 − 지난주 마지막 날 누적 조회수
 *     그래서 기록을 시작한 첫 주는 비어(null) 있다.
 * 한 클라이언트가 같은 플랫폼 계정을 여럿 가질 수 있어서(@gu_clinic, @gu_clinic_tw) account 를 키에 넣는다.
 * 인스타그램은 과거 팔로워 수를 주지 않아서, 스냅숏을 쌓기 전 주는 followers 가 null 이다.
 */
export const snsWeekly = pgTable(
  "sns_weekly",
  {
    id: serial("id").primaryKey(),
    weekStart: date("week_start").notNull(),
    client: client(),
    platform: snsPlatformEnum("platform").notNull(),
    account: text("account").notNull().default(""), // @핸들. 시트 입력·유튜브는 ""
    followers: integer("followers"),
    views: integer("views"),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [
    unique("sns_weekly_key").on(t.weekStart, t.client, t.platform, t.account),
  ],
);

/**
 * SNS 일지(동기화 때마다 그날 값을 기록). 인스타그램·유튜브 API 는 과거 팔로워 수를 주지 않아서
 * 여기 쌓인 기록으로만 팔로워 증감과 유튜브 주간 조회수(sns_weekly 설명)를 만들 수 있다 — 지우면 되살릴 수 없다.
 * total_views 는 유튜브 채널 누적 조회수(인스타그램은 0).
 */
export const snsDaily = pgTable(
  "sns_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    platform: snsPlatformEnum("platform").notNull(),
    account: text("account").notNull().default(""),
    followers: integer("followers").notNull(),
    totalViews: bigint("total_views", { mode: "number" }).notNull(),
    source: source(),
    syncedAt: syncedAt(),
  },
  (t) => [unique("sns_daily_key").on(t.date, t.client, t.platform, t.account)],
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
    isShort: boolean("is_short").notNull().default(false), // 3분 이하 → 쇼츠로 추정
    thumbnailUrl: text("thumbnail_url"),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: integer("likes"),
    comments: integer("comments"),
    syncedAt: syncedAt(),
  },
  (t) => [unique("youtube_videos_key").on(t.client, t.videoId)],
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

/**
 * 광고 랜딩페이지 방문(GA4, 일 단위). 캠페인 랜딩 전용 GA4 속성(campaign.gu.clinic 등)에서 받는다.
 * campaign·content 는 광고 링크의 utm_campaign·utm_content 그대로 — 메타 캠페인·광고 ID 면
 * ad_metrics.campaign_id·creative_id 와 짝지어 채널별 효율 표에 붙고, 이름 등 다른 값이면 "미연결"로 센다.
 */
export const landingDaily = pgTable(
  "landing_daily",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    client: client(),
    property: text("property").notNull(), // GA4 속성 ID
    campaign: text("campaign").notNull(), // utm_campaign
    content: text("content").notNull(), // utm_content, 없으면 ""
    sourceMedium: text("source_medium").notNull(), // 예) "fb / paid"
    sessions: integer("sessions").notNull(),
    syncedAt: syncedAt(),
  },
  (t) => [
    unique("landing_daily_key").on(
      t.date,
      t.property,
      t.campaign,
      t.content,
      t.sourceMedium,
    ),
  ],
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
  status: syncStatusEnum("status").notNull().default("running"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  error: text("error"),
});
