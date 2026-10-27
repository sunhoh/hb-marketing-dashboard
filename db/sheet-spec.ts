/**
 * 구글 시트 "마케팅 대시보드 입력"의 탭·열 정의.
 * 양식 파일(scripts/make-sheet-template.ts)과 이후 동기화 스크립트가 같은 정의를 쓴다.
 * 시트에는 사람이 읽는 이름(GU강남, 강남언니)을 적고, DB 에는 slug 로 바꿔 저장한다.
 */
import { CHANNEL_LABELS, CLIENTS, PLATFORM_LABELS } from "@/lib/clients";

export type ColumnKind = "monday" | "date" | "client" | "channel" | "platform" | "viralPlatform" | "ox" | "won" | "int" | "rating" | "text" | "url";

export type SheetColumn = { key: string; header: string; kind: ColumnKind; required?: boolean; note?: string; width?: number };
export type SheetTab = { name: string; table: string; description: string; columns: SheetColumn[] };

/** API 로 들어오는 매체(메타·네이버)는 시트에 적지 않는다 */
export const MANUAL_CHANNELS = ["gangnam-unni", "creatrip", "danggeun", "kakao-sms"] as const;

export const VIRAL_PLATFORMS = ["블로그", "카페", "지식인", "기타"] as const;

export const LISTS = {
  client: CLIENTS.map((c) => c.name),
  channel: MANUAL_CHANNELS.map((c) => CHANNEL_LABELS[c]),
  platform: Object.values(PLATFORM_LABELS),
  viralPlatform: [...VIRAL_PLATFORMS],
  ox: ["O", "X"],
} satisfies Partial<Record<ColumnKind, string[]>>;

export const SHEET_TABS: SheetTab[] = [
  {
    name: "매체_수동",
    table: "ad_metrics",
    description: "API 가 없는 매체의 주간 성과. 매주 월요일에 지난주 숫자를 채널(·세그먼트)마다 한 줄씩",
    columns: [
      { key: "weekStart", header: "주 시작일(월)", kind: "monday", required: true },
      { key: "client", header: "클라이언트", kind: "client", required: true },
      { key: "channel", header: "채널", kind: "channel", required: true },
      { key: "segment", header: "세그먼트", kind: "text", note: "국가·타겟 등 나눠 볼 때만. 없으면 비움", width: 14 },
      { key: "spend", header: "소진액(원)", kind: "won", required: true },
      { key: "impressions", header: "노출(문자는 발송 수)", kind: "int", required: true, width: 20 },
      { key: "clicks", header: "클릭", kind: "int", required: true },
      { key: "conversions", header: "매체 전환", kind: "int", note: "매체 화면에 나온 전환(상담 신청·채팅 문의 등). 없으면 비움" },
      { key: "memo", header: "메모", kind: "text", width: 30 },
    ],
  },
  {
    name: "플레이스_순위",
    table: "place_ranks",
    description: "네이버 플레이스 키워드 순위. 매주 같은 요일에 키워드마다 한 줄",
    columns: [
      { key: "weekStart", header: "주 시작일(월)", kind: "monday", required: true },
      { key: "client", header: "클라이언트", kind: "client", required: true },
      { key: "keyword", header: "키워드", kind: "text", required: true, width: 18 },
      { key: "rank", header: "순위", kind: "int", note: "순위권 밖이면 비움" },
    ],
  },
  {
    name: "플레이스_지표",
    table: "place_stats",
    description: "스마트플레이스의 리뷰 수·평점·저장 수(누적값). 매주 한 줄",
    columns: [
      { key: "weekStart", header: "주 시작일(월)", kind: "monday", required: true },
      { key: "client", header: "클라이언트", kind: "client", required: true },
      { key: "reviews", header: "리뷰 수", kind: "int", required: true },
      { key: "rating", header: "평점", kind: "rating" },
      { key: "saves", header: "저장 수", kind: "int" },
    ],
  },
  {
    name: "바이럴",
    table: "viral_posts",
    description: "블로그·카페 글을 발행할 때마다 한 줄. 상위노출은 확인할 때 O/X 갱신",
    columns: [
      { key: "publishedOn", header: "발행일", kind: "date", required: true },
      { key: "client", header: "클라이언트", kind: "client", required: true },
      { key: "platform", header: "플랫폼", kind: "viralPlatform", required: true },
      { key: "url", header: "글 주소", kind: "url", required: true, width: 40 },
      { key: "keyword", header: "목표 키워드", kind: "text", width: 18 },
      { key: "topExposed", header: "상위노출", kind: "ox" },
      { key: "checkedOn", header: "확인일", kind: "date" },
    ],
  },
  {
    name: "SNS",
    table: "sns_stats",
    description: "SNS 팔로워(주 마지막 날 기준)와 그 주 조회수. 인스타그램 API 연결 전까지",
    columns: [
      { key: "weekStart", header: "주 시작일(월)", kind: "monday", required: true },
      { key: "client", header: "클라이언트", kind: "client", required: true },
      { key: "platform", header: "플랫폼", kind: "platform", required: true },
      { key: "followers", header: "팔로워", kind: "int", required: true },
      { key: "views", header: "조회수", kind: "int" },
    ],
  },
];
