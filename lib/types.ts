/** db/schema.ts 의 clientEnum 과 같은 값 */
export type ClientSlug = "gu-gangnam" | "gu-ilsan" | "luho";
export type PeriodKey = "this-month" | "last-month" | "last-12-weeks";

/** 광고 성과(일 단위) — 파생 지표(CTR·CPC·CPM)는 저장하지 않는다 */
export type AdMetric = {
  client: ClientSlug;
  channel: string; // "meta", "gangnam-unni", "creatrip", "naver-place", "danggeun"
  segment?: string; // 국가 / 국가등급 / 소재 ID
  campaignId?: string; // 광고 행만. 캠페인별 보기에서 묶는 기준
  campaign?: string; // 캠페인 이름
  account?: string; // 광고 계정 이름(메타 계정이 여럿인 클라이언트 구분용)
  detailId?: string; // 캠페인 아래 한 단계: 메타는 소재(광고) ID, 네이버는 광고그룹 ID
  detail?: string; // 그 이름
  date: string; // YYYY-MM-DD (광고 계정 시간대 기준 날짜)
  spend: number; // 소진액(원)
  impressions: number;
  clicks: number;
  conversions?: number; // 매체 전환
};

export type Creative = {
  id: string;
  client: ClientSlug;
  name: string;
  format: "이미지" | "영상" | "캐러셀" | "—"; // 모르면 —
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
