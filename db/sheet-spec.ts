/**
 * 구글 시트 "마케팅 대시보드 입력"의 탭·열 정의. 지금은 API 가 없는 매체(강남언니·크리에이트립·당근)를 적는 탭 하나.
 * 양식 파일(scripts/make-sheet-template.ts)과 이후 동기화 스크립트가 같은 정의를 쓴다.
 * 시트에는 사람이 읽는 이름(GU강남, 강남언니)을 적고, DB 에는 slug 로 바꿔 저장한다.
 */
import { CHANNEL_LABELS, CLIENTS } from "@/lib/clients";

export type ColumnKind = "monday" | "client" | "channel" | "won" | "int" | "text";

export type SheetColumn = { key: string; header: string; kind: ColumnKind; required?: boolean; note?: string; width?: number };
export type SheetTab = { name: string; table: string; description: string; columns: SheetColumn[] };

/** API 로 들어오는 매체(메타·네이버)는 시트에 적지 않는다 */
export const MANUAL_CHANNELS = ["gangnam-unni", "creatrip", "danggeun"] as const;

export const LISTS = {
  client: CLIENTS.map((c) => c.name),
  channel: MANUAL_CHANNELS.map((c) => CHANNEL_LABELS[c]),
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
      { key: "impressions", header: "노출", kind: "int", required: true },
      { key: "clicks", header: "클릭", kind: "int", required: true },
      { key: "conversions", header: "매체 전환", kind: "int", note: "매체 화면에 나온 전환(상담 신청·채팅 문의 등). 없으면 비움" },
      { key: "memo", header: "메모", kind: "text", width: 30 },
    ],
  },
];
