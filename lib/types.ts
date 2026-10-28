export type ClientSlug = "gu-gangnam" | "gu-ilsan" | "luho" | "cellora";
export type PeriodKey = "this-month" | "last-month" | "last-12-weeks";

/** 매체 원본 레코드 — 파생 지표(CTR·CPC·CPM)는 저장하지 않는다 */
export type WeeklyMetric = {
  client: ClientSlug;
  channel: string; // "meta", "gangnam-unni", "creatrip", "naver-place", "danggeun"
  segment?: string; // 국가 / 국가등급 / 소재 ID
  weekStart: string; // YYYY-MM-DD (월요일)
  spend: number; // 소진액(원)
  impressions: number;
  clicks: number;
  conversions?: number; // 매체 전환
};

export type Creative = {
  id: string;
  client: ClientSlug;
  name: string;
  format: "이미지" | "영상" | "캐러셀";
};

export type SnsStat = {
  client: ClientSlug;
  platform: "instagram" | "youtube" | "tiktok";
  account?: string; // @핸들. 한 클라이언트에 같은 플랫폼 계정이 여럿일 때 구분
  weekStart: string;
  followers: number | null; // 모르면 null (인스타그램 연결 전 주 등)
  views: number | null; // 모르면 null (유튜브 첫 주 등)
};

/** 유튜브 영상(공개 정보). views 등은 동기화 때의 누적값 */
export type VideoStat = {
  client: ClientSlug;
  id: string;
  title: string;
  publishedOn: string; // YYYY-MM-DD (서울)
  views: number;
  likes: number | null;
  comments: number | null;
  isShort: boolean;
};

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};
