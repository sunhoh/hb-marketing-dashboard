/**
 * 1단계 샘플 데이터. 시드 고정 난수로 만들어서 새로고침해도 값이 같다.
 * 2단계에서는 이 파일 대신 lib/data.ts 가 실제 출처(구글 시트·매체 API·KOS 엑셀)를 읽는다.
 */
import type {
  ClientSlug,
  Creative,
  PlaceKeywordRank,
  PlaceStat,
  SnsStat,
  ViralStat,
  WeeklyMetric,
} from "@/lib/types";
import type { Dataset } from "@/lib/build-metrics";

/** 샘플 데이터의 '오늘'. 실제 날짜를 쓰면 서버·브라우저 렌더 값이 달라질 수 있어 고정한다. */
export const SAMPLE_TODAY = "2026-10-27";
const WEEK_COUNT = 30;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261027);
const jitter = (spread: number) => 1 + (rand() * 2 - 1) * spread;

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** SAMPLE_TODAY 가 속한 주의 월요일부터 거꾸로 WEEK_COUNT 주 */
export const SAMPLE_WEEKS: string[] = (() => {
  const today = new Date(`${SAMPLE_TODAY}T00:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return Array.from({ length: WEEK_COUNT }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() - (WEEK_COUNT - 1 - i) * 7);
    return toISO(d);
  });
})();

type ChannelSpec = {
  client: ClientSlug;
  channel: string;
  segment?: string;
  spend: number; // 주간 기준 소진액
  cpm: number;
  ctr: number; // %
  cvr: number; // 클릭 대비 매체 전환 비율
  growth?: number; // 주당 소진액 증감 비율
};

const CHANNEL_SPECS: ChannelSpec[] = [
  // GU강남 — 메타(국가별), 강남언니, 크리에이트립
  { client: "gu-gangnam", channel: "meta", segment: "일본", spend: 1_350_000, cpm: 6_200, ctr: 1.42, cvr: 0.061, growth: 0.012 },
  { client: "gu-gangnam", channel: "meta", segment: "중국", spend: 980_000, cpm: 4_800, ctr: 1.18, cvr: 0.044 },
  { client: "gu-gangnam", channel: "meta", segment: "대만", spend: 620_000, cpm: 3_900, ctr: 1.65, cvr: 0.072, growth: 0.02 },
  { client: "gu-gangnam", channel: "meta", segment: "미국", spend: 540_000, cpm: 11_500, ctr: 0.84, cvr: 0.038, growth: -0.01 },
  { client: "gu-gangnam", channel: "gangnam-unni", spend: 1_100_000, cpm: 14_000, ctr: 2.4, cvr: 0.09 },
  { client: "gu-gangnam", channel: "creatrip", spend: 450_000, cpm: 9_000, ctr: 1.9, cvr: 0.055, growth: 0.015 },
  // GU일산 — 네이버 플레이스 광고, 당근
  { client: "gu-ilsan", channel: "naver-place", spend: 820_000, cpm: 21_000, ctr: 3.1, cvr: 0.12, growth: 0.005 },
  { client: "gu-ilsan", channel: "danggeun", spend: 380_000, cpm: 5_200, ctr: 0.95, cvr: 0.035, growth: 0.018 },
  // 루호 — 메타 국가 등급별
  { client: "luho", channel: "meta", segment: "S · 태국", spend: 1_600_000, cpm: 2_800, ctr: 1.55, cvr: 0.058, growth: 0.01 },
  { client: "luho", channel: "meta", segment: "S · 미국", spend: 1_250_000, cpm: 12_800, ctr: 0.92, cvr: 0.041 },
  { client: "luho", channel: "meta", segment: "A · 일본", spend: 900_000, cpm: 6_600, ctr: 1.21, cvr: 0.047 },
  { client: "luho", channel: "meta", segment: "A · 중국", spend: 720_000, cpm: 4_400, ctr: 0.98, cvr: 0.033, growth: -0.008 },
  { client: "luho", channel: "meta", segment: "시험 · 대만", spend: 260_000, cpm: 3_700, ctr: 1.74, cvr: 0.064, growth: 0.03 },
  { client: "luho", channel: "meta", segment: "시험 · 홍콩", spend: 210_000, cpm: 7_900, ctr: 0.71, cvr: 0.022 },
];

function round(n: number) {
  return Math.max(0, Math.round(n));
}

function makeWeekly(spec: ChannelSpec, i: number): WeeklyMetric {
  const spend = spec.spend * (1 + (spec.growth ?? 0) * (i - WEEK_COUNT / 2)) * jitter(0.18);
  const impressions = (spend / (spec.cpm * jitter(0.12))) * 1000;
  const clicks = (impressions * spec.ctr * jitter(0.15)) / 100;
  const conversions = clicks * spec.cvr * jitter(0.3);
  return {
    client: spec.client,
    channel: spec.channel,
    segment: spec.segment,
    weekStart: SAMPLE_WEEKS[i],
    spend: round(spend),
    impressions: round(impressions),
    clicks: round(clicks),
    conversions: round(conversions),
  };
}

/** 셀로라 카톡·문자 — 노출 자리에 발송 수, 소진액은 발송 비용. 발송 없는 주도 있다(0 나누기 확인용). */
function makeKakaoSms(i: number): WeeklyMetric {
  const sends = i % 5 === 3 ? 0 : round(2_400 * jitter(0.35));
  const clicks = round(sends * 0.046 * jitter(0.3));
  return {
    client: "cellora",
    channel: "kakao-sms",
    weekStart: SAMPLE_WEEKS[i],
    spend: round(sends * 13.5),
    impressions: sends,
    clicks,
    conversions: round(clicks * 0.08 * jitter(0.4)),
  };
}

export const WEEKLY_METRICS: WeeklyMetric[] = SAMPLE_WEEKS.flatMap((_, i) => [
  ...CHANNEL_SPECS.map((spec) => makeWeekly(spec, i)),
  makeKakaoSms(i),
]);

// ── 메타 소재 ─────────────────────────────────────────────

export const CREATIVES: Creative[] = [
  { id: "GG-M-01", client: "gu-gangnam", name: "리쥬란 전후 비교 (일본어)", format: "이미지" },
  { id: "GG-M-02", client: "gu-gangnam", name: "원장 상담 숏폼", format: "영상" },
  { id: "GG-M-03", client: "gu-gangnam", name: "K-뷰티 투어 패키지", format: "캐러셀" },
  { id: "GG-M-04", client: "gu-gangnam", name: "울쎄라 가격 안내", format: "이미지" },
  { id: "GG-M-05", client: "gu-gangnam", name: "외국인 후기 인터뷰", format: "영상" },
  { id: "LH-M-01", client: "luho", name: "코성형 3D 시뮬레이션", format: "영상" },
  { id: "LH-M-02", client: "luho", name: "태국어 상담 이벤트", format: "이미지" },
  { id: "LH-M-03", client: "luho", name: "눈성형 전후 캐러셀", format: "캐러셀" },
  { id: "LH-M-04", client: "luho", name: "병원 투어 브이로그", format: "영상" },
  { id: "LH-M-05", client: "luho", name: "가격 비교표", format: "이미지" },
  { id: "LH-M-06", client: "luho", name: "회복 과정 다이어리", format: "캐러셀" },
];

const CREATIVE_PERF: Record<string, { spend: number; cpm: number; ctr: number; cvr: number }> = {
  "GG-M-01": { spend: 820_000, cpm: 6_000, ctr: 1.85, cvr: 0.07 },
  "GG-M-02": { spend: 640_000, cpm: 5_400, ctr: 1.52, cvr: 0.06 },
  "GG-M-03": { spend: 520_000, cpm: 6_800, ctr: 1.21, cvr: 0.05 },
  "GG-M-04": { spend: 760_000, cpm: 7_400, ctr: 0.62, cvr: 0.03 },
  "GG-M-05": { spend: 400_000, cpm: 5_900, ctr: 1.38, cvr: 0.055 },
  "LH-M-01": { spend: 1_050_000, cpm: 5_100, ctr: 1.64, cvr: 0.06 },
  "LH-M-02": { spend: 880_000, cpm: 3_900, ctr: 1.41, cvr: 0.05 },
  "LH-M-03": { spend: 760_000, cpm: 5_600, ctr: 1.12, cvr: 0.045 },
  "LH-M-04": { spend: 620_000, cpm: 6_100, ctr: 0.95, cvr: 0.04 },
  "LH-M-05": { spend: 540_000, cpm: 7_200, ctr: 0.55, cvr: 0.02 },
  "LH-M-06": { spend: 330_000, cpm: 5_000, ctr: 1.29, cvr: 0.05 },
};

/** 소재별 주간 레코드 — segment 에 소재 ID. 채널 합계와 중복되므로 WEEKLY_METRICS 와 따로 둔다. */
export const CREATIVE_METRICS: WeeklyMetric[] = SAMPLE_WEEKS.flatMap((_, i) =>
  CREATIVES.map((c) => {
    const p = CREATIVE_PERF[c.id];
    return makeWeekly({ client: c.client, channel: "meta", segment: c.id, ...p }, i);
  }),
);

// ── 오가닉 ────────────────────────────────────────────────

export const PLACE_KEYWORDS = ["일산 피부과", "일산 여드름", "주엽 피부과", "킨텍스 피부과"];

export const PLACE_RANKS: PlaceKeywordRank[] = (() => {
  const start: Record<string, number> = { "일산 피부과": 9, "일산 여드름": 6, "주엽 피부과": 4, "킨텍스 피부과": 12 };
  const rows: PlaceKeywordRank[] = [];
  for (const keyword of PLACE_KEYWORDS) {
    let rank = start[keyword];
    SAMPLE_WEEKS.forEach((weekStart, i) => {
      const drift = i > WEEK_COUNT / 2 ? -0.35 : 0.1; // 후반부에 순위 개선
      rank = Math.min(20, Math.max(1, rank + drift + (rand() * 2 - 1) * 1.2));
      rows.push({ weekStart, keyword, rank: Math.round(rank) });
    });
  }
  return rows;
})();

export const PLACE_STATS: PlaceStat[] = (() => {
  let reviews = 1_284;
  let saves = 3_920;
  let ratingSum = 4.62 * reviews;
  return SAMPLE_WEEKS.map((weekStart) => {
    const newReviews = round(14 * jitter(0.5));
    reviews += newReviews;
    ratingSum += newReviews * (4.55 + rand() * 0.4);
    saves += round(38 * jitter(0.45));
    return { weekStart, reviews, rating: Math.round((ratingSum / reviews) * 100) / 100, saves };
  });
})();

const VIRAL_BASE: Partial<Record<ClientSlug, number>> = { "gu-gangnam": 6, "gu-ilsan": 9, luho: 7 };

export const VIRAL_STATS: ViralStat[] = SAMPLE_WEEKS.flatMap((weekStart) =>
  (Object.entries(VIRAL_BASE) as [ClientSlug, number][]).map(([client, base]) => {
    const published = round(base * jitter(0.4));
    return { client, weekStart, published, topKeywords: round(published * (0.35 + rand() * 0.3)) };
  }),
);

const SNS_BASE: { client: ClientSlug; platform: SnsStat["platform"]; followers: number; growth: number; views: number }[] = [
  { client: "gu-gangnam", platform: "instagram", followers: 18_400, growth: 120, views: 64_000 },
  { client: "gu-gangnam", platform: "tiktok", followers: 7_200, growth: 210, views: 152_000 },
  { client: "gu-ilsan", platform: "instagram", followers: 4_900, growth: 35, views: 12_500 },
  { client: "luho", platform: "instagram", followers: 26_800, growth: 160, views: 98_000 },
  { client: "luho", platform: "youtube", followers: 3_100, growth: 45, views: 41_000 },
];

export const SNS_STATS: SnsStat[] = SNS_BASE.flatMap((s) => {
  let followers = s.followers;
  return SAMPLE_WEEKS.map((weekStart) => {
    followers += round(s.growth * jitter(0.7)) - 15;
    return { client: s.client, platform: s.platform, weekStart, followers, views: round(s.views * jitter(0.35)) };
  });
});

export const SAMPLE_DATASET: Dataset = {
  source: "sample",
  today: SAMPLE_TODAY,
  weeks: SAMPLE_WEEKS,
  weekly: WEEKLY_METRICS,
  creatives: CREATIVES,
  creativeWeekly: CREATIVE_METRICS,
  placeKeywords: PLACE_KEYWORDS,
  placeRanks: PLACE_RANKS,
  placeStats: PLACE_STATS,
  viral: VIRAL_STATS,
  sns: SNS_STATS,
  videos: [],
};
