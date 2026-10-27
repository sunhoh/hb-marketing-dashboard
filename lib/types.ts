export type ClientSlug = "gu-gangnam" | "gu-ilsan" | "luho" | "cellora";
export type PeriodKey = "this-month" | "last-month" | "last-12-weeks";

/** 매체 원본 레코드 — 파생 지표(CTR·CPC·CPM)는 저장하지 않는다 */
export type WeeklyMetric = {
  client: ClientSlug;
  channel: string; // "meta", "gangnam-unni", "creatrip", "naver-place", "danggeun", "kakao-sms"
  segment?: string; // 국가 / 국가등급 / 소재 ID
  weekStart: string; // YYYY-MM-DD (월요일)
  spend: number; // 소진액(원)
  impressions: number; // 카톡·문자는 발송 수
  clicks: number;
  conversions?: number; // 매체 전환
};

export type Creative = {
  id: string;
  client: ClientSlug;
  name: string;
  format: "이미지" | "영상" | "캐러셀";
};

export type PlaceKeywordRank = { weekStart: string; keyword: string; rank: number };
export type PlaceStat = { weekStart: string; reviews: number; rating: number; saves: number };
export type ViralStat = {
  client: ClientSlug;
  weekStart: string;
  published: number;
  topKeywords: number; // 상위노출 키워드 수
};
export type SnsStat = {
  client: ClientSlug;
  platform: "instagram" | "youtube" | "tiktok";
  weekStart: string;
  followers: number;
  views: number;
};

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};
