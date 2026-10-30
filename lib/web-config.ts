import type { ClientSlug } from "./types";

/**
 * '홈페이지 전환'으로 셀 GA4 이벤트(2026-10-28 결정). GA4 의 핵심 이벤트 설정과 무관하게 여기서 고른다.
 * 바꾸면 npm run sync -- --google-days=400 으로 과거도 다시 계산한다.
 */
export const CONVERSION_EVENTS: Record<ClientSlug, string[]> = {
  "gu-gangnam": ["booking_complete", "팝업_카카오", "팝업_전화"],
  "gu-ilsan": ["booking_complete"],
  luho: ["reservation_complete", "contact_click"],
};

/** GA4 유입(소스 / 매체) → 화면 이름. 없으면 원래 값을 그대로 보여 준다 */
export const SOURCE_RULES: [RegExp, string][] = [
  [/^google \/ cpc$/, "구글 광고"],
  [/^google \/ organic$/, "구글 검색"],
  [/^naver \/ organic$/, "네이버 검색"],
  [/^naver \/ brand$/, "네이버 브랜드검색"],
  [/^naver \/ (keyword|cpc|powerlink)$/, "네이버 파워링크"],
  [/^naver \/ display$/, "네이버 디스플레이"],
  [/^(m\.)?search\.naver\.com \/ referral$/, "네이버 검색(UTM 없음)"],
  [/^(m\.)?place\.naver\.com \/ referral$/, "네이버 플레이스"],
  [/^\(direct\) \/ \(none\)$/, "직접 방문"],
  [/^mobon \//, "모비온"],
  [/^(danggn|daangn) \//, "당근"],
  [/instagram/, "인스타그램"],
  [/(facebook|^fb \/|^meta \/)/, "메타"],
  [/youtube/, "유튜브"],
  [/gangnamunni|강남언니/, "강남언니"],
  [/creatrip/, "크리에이트립"],
];

export function sourceLabel(sourceMedium: string) {
  return SOURCE_RULES.find(([re]) => re.test(sourceMedium))?.[1] ?? sourceMedium;
}
