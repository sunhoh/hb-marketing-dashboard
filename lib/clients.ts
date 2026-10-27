import type { ClientSlug } from "./types";

export const CLIENTS: {
  slug: ClientSlug;
  name: string;
  fullName: string;
  description: string;
}[] = [
  { slug: "gu-gangnam", name: "GU강남", fullName: "지유의원 강남점", description: "피부과 · 해외 환자" },
  { slug: "gu-ilsan", name: "GU일산", fullName: "지유의원 일산점", description: "피부과 · 로컬" },
  { slug: "luho", name: "루호", fullName: "루호성형외과", description: "성형외과 · 국가별 타겟" },
  { slug: "cellora", name: "셀로라", fullName: "셀로라", description: "줄기세포 · B2B" },
];

export const CLIENT_SLUGS = CLIENTS.map((c) => c.slug);

export function getClient(slug: string) {
  return CLIENTS.find((c) => c.slug === slug);
}

export function isClientSlug(value: unknown): value is ClientSlug {
  return typeof value === "string" && CLIENT_SLUGS.includes(value as ClientSlug);
}

export const CHANNEL_LABELS: Record<string, string> = {
  meta: "메타",
  "gangnam-unni": "강남언니",
  creatrip: "크리에이트립",
  "naver-place": "네이버 플레이스 광고",
  "naver-search": "네이버 파워링크",
  "naver-brand": "네이버 브랜드검색",
  danggeun: "당근",
  "kakao-sms": "카톡·문자",
};

/** 매체 전환이 무엇을 뜻하는지 채널별로 표시 */
export const CONVERSION_LABELS: Record<string, string> = {
  meta: "폼 제출·메시지",
  "gangnam-unni": "상담 신청",
  creatrip: "예약 문의",
  "naver-place": "전화·길찾기",
  "naver-search": "전환",
  "naver-brand": "전환",
  danggeun: "채팅 문의",
  "kakao-sms": "링크 전환",
};

export const PLATFORM_LABELS = {
  instagram: "인스타그램",
  youtube: "유튜브",
  tiktok: "틱톡",
} as const;
