import type { ClientSlug } from "./types";

export const CLIENTS: {
  slug: ClientSlug;
  name: string;
  fullName: string;
  description: string;
}[] = [
  {
    slug: "gu-gangnam",
    name: "GU강남",
    fullName: "지유의원 강남점",
    description: "피부과 · 강남점",
  },
  {
    slug: "gu-ilsan",
    name: "GU일산",
    fullName: "지유의원 일산점",
    description: "피부과 · 일산점",
  },
  {
    slug: "luho",
    name: "루호",
    fullName: "루호성형외과",
    description: "성형외과 · 신사점",
  },
];

export const CLIENT_SLUGS = CLIENTS.map((c) => c.slug);

export function getClient(slug: string) {
  return CLIENTS.find((c) => c.slug === slug);
}

export function isClientSlug(value: unknown): value is ClientSlug {
  return (
    typeof value === "string" && CLIENT_SLUGS.includes(value as ClientSlug)
  );
}

export const CHANNEL_LABELS: Record<string, string> = {
  meta: "메타",
  "gangnam-unni": "강남언니",
  creatrip: "크리에이트립",
  "naver-place": "네이버 플레이스 광고",
  "naver-search": "네이버 파워링크",
  "naver-brand": "네이버 브랜드검색",
  danggeun: "당근",
};

/** 매체 전환이 무엇을 뜻하는지 채널별로 표시 */
export const CONVERSION_LABELS: Record<string, string> = {
  meta: "폼 제출·메시지",
  "gangnam-unni": "상담 신청",
  creatrip: "예약 문의",
  "naver-place": "전환",
  "naver-search": "전환",
  "naver-brand": "전환",
  danggeun: "채팅 문의",
};

/** 메타 국가(db/schema.ts countryEnum) → 표에 쓰는 이름. 모르는 국가도 "기타 국가"로 묶어 보여 준다 */
export const COUNTRY_LABELS: Record<string, string> = {
  KR: "한국",
  JP: "일본",
  CN: "중국",
  TW: "대만",
  HK: "홍콩",
  MO: "마카오",
  SG: "싱가포르",
  MY: "말레이시아",
  ID: "인도네시아",
  TH: "태국",
  VN: "베트남",
  PH: "필리핀",
  US: "미국",
  CA: "캐나다",
  GB: "영국",
  AU: "호주",
  OTHER: "기타 국가",
  UNKNOWN: "기타 국가",
};

/** 소재 형식(db/schema.ts creativeFormatEnum) → 화면 이름 */
export const CREATIVE_FORMAT_LABELS = {
  image: "이미지",
  video: "영상",
  carousel: "캐러셀",
} as const;

export const PLATFORM_LABELS = {
  instagram: "인스타그램",
  youtube: "유튜브",
  tiktok: "틱톡",
} as const;
