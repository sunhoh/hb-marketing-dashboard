/**
 * 시트 값(2차원 배열) → DB 행. 네트워크·DB 와 분리해 두어 따로 검사할 수 있다.
 * 잘못된 줄은 건너뛰고 issues 에 "탭 N행: 이유"로 모은다(한 줄 때문에 전체가 멈추지 않게).
 */
import { CHANNEL_LABELS, CLIENTS } from "@/lib/clients";
import type { ClientSlug } from "@/lib/types";
import {
  MANUAL_CHANNELS,
  SHEET_TABS,
  type SheetColumn,
  type SheetTab,
} from "../sheet-spec";

export type Cell = string | number | boolean | null | undefined;
export type Issue = { tab: string; row: number; message: string };

const CLIENT_BY_NAME = new Map(CLIENTS.map((c) => [c.name, c.slug]));
const CHANNEL_BY_LABEL = new Map(
  MANUAL_CHANNELS.map((c) => [CHANNEL_LABELS[c], c]),
);

/** 구글 시트 날짜 일련번호(1899-12-30 기준) 또는 "2026-10-19"/"2026. 10. 19" 문자열 → YYYY-MM-DD */
export function toIsoDate(v: Cell): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?$/);
    if (!m) return null;
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso
      ? null
      : iso;
  }
  return null;
}

export function isMonday(iso: string) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

/** "1,100,000" "₩1100000" 같은 입력도 받아 준다. 소수·음수는 거절 */
function toInt(v: Cell): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s₩원]/g, "");
  return /^\d+$/.test(s) ? Number(s) : null;
}

const text = (v: Cell) =>
  v === null || v === undefined ? "" : String(v).trim();

type Parsed = string | number | null;

/** 칸 하나를 해석. 빈칸은 null, 형식이 틀리면 Error */
function parseCell(col: SheetColumn, raw: Cell): Parsed {
  const s = text(raw);
  if (s === "") return null;
  switch (col.kind) {
    case "monday": {
      const d = toIsoDate(raw);
      if (!d) throw new Error(`${col.header}: 날짜 형식이 아니에요 (${s})`);
      if (!isMonday(d))
        throw new Error(`${col.header}: 월요일이 아니에요 (${d})`);
      return d;
    }
    case "client": {
      const slug = CLIENT_BY_NAME.get(s);
      if (!slug) throw new Error(`${col.header}: 모르는 클라이언트예요 (${s})`);
      return slug;
    }
    case "channel": {
      const slug = CHANNEL_BY_LABEL.get(s as never);
      if (!slug)
        throw new Error(`${col.header}: 수기 입력 채널이 아니에요 (${s})`);
      return slug;
    }
    case "won":
    case "int": {
      const n = toInt(raw);
      if (n === null)
        throw new Error(`${col.header}: 0 이상 정수가 아니에요 (${s})`);
      return n;
    }
    default:
      return s;
  }
}

type Row = Record<string, Parsed>;

/** 머리글 이름으로 열을 찾는다(열 순서가 바뀌거나 오른쪽에 열을 추가해도 괜찮게) */
function parseTab(
  tab: SheetTab,
  values: Cell[][],
  issues: Issue[],
  skipped: Set<string>,
): Row[] {
  const header = (values[0] ?? []).map(text);
  const index = new Map(
    tab.columns.map((c) => [c.key, header.indexOf(c.header)]),
  );
  const missing = tab.columns.filter((c) => index.get(c.key) === -1);
  if (missing.length) {
    issues.push({
      tab: tab.name,
      row: 1,
      message: `머리글이 없어요: ${missing.map((c) => c.header).join(", ")} — 이 탭은 기존 DB 값을 유지`,
    });
    skipped.add(tab.name);
    return [];
  }

  const rows: Row[] = [];
  values.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    if (cells.every((c) => text(c) === "")) return;
    try {
      const row: Row = {};
      for (const col of tab.columns) {
        const v = parseCell(col, cells[index.get(col.key)!]);
        if (v === null && col.required)
          throw new Error(`${col.header}: 꼭 채워야 해요`);
        row[col.key] = v;
      }
      rows.push(row);
    } catch (e) {
      issues.push({ tab: tab.name, row: rowNo, message: (e as Error).message });
    }
  });
  return rows;
}

/** 같은 키가 여러 줄이면 마지막 줄을 쓴다(안내 탭 규칙 4) */
function lastByKey<T>(
  rows: T[],
  key: (r: T) => string,
  tab: string,
  issues: Issue[],
): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  const dropped = rows.length - map.size;
  if (dropped)
    issues.push({
      tab,
      row: 0,
      message: `같은 키가 중복된 ${dropped}줄은 마지막 줄 값만 썼어요`,
    });
  return [...map.values()];
}

const tabByName = (name: string) => SHEET_TABS.find((t) => t.name === name)!;

export function parseSheet(valuesByTab: Record<string, Cell[][]>) {
  const issues: Issue[] = [];
  /** 머리글이 깨진 탭. 동기화는 이 탭의 DB 행을 지우지 않는다 */
  const skippedTabs = new Set<string>();
  const get = (name: string) =>
    parseTab(tabByName(name), valuesByTab[name] ?? [], issues, skippedTabs);

  const adMetrics = lastByKey(
    get("매체_수동").map((r) => ({
      date: r.weekStart as string,
      granularity: "week" as const,
      client: r.client as ClientSlug,
      channel: r.channel as string,
      segment: (r.segment as string | null) ?? "",
      spend: r.spend as number,
      impressions: r.impressions as number,
      clicks: r.clicks as number,
      conversions: r.conversions as number | null,
      memo: r.memo as string | null,
      source: "sheet" as const,
    })),
    (r) => [r.date, r.client, r.channel, r.segment].join("|"),
    "매체_수동",
    issues,
  );

  return { adMetrics, issues, skippedTabs };
}
