"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isClientSlug } from "./clients";
import { isPeriodKey } from "./periods";
import type { ClientSlug, PeriodKey } from "./types";

const KEY = "marketing-dashboard:filters";
export const DEFAULT_PERIOD: PeriodKey = "this-month";

/** 채널별 효율 표를 캠페인으로 묶을지, 국가(네이버는 캠페인)로 묶을지 */
export type TableView = "campaign" | "country";
export const DEFAULT_TABLE_VIEW: TableView = "campaign";
const isTableView = (v: unknown): v is TableView =>
  v === "campaign" || v === "country";

type Stored = {
  client?: ClientSlug;
  period?: PeriodKey;
  tableView?: TableView;
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedValue: Stored = {};

function read(): Stored {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // 사파리 개인정보 보호 모드 등에서는 저장소가 막혀 있다 — 기본값으로 동작
  }
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Stored) : {};
    cachedValue = {
      client: isClientSlug(parsed.client) ? parsed.client : undefined,
      period: isPeriodKey(parsed.period) ? parsed.period : undefined,
      tableView: isTableView(parsed.tableView) ? parsed.tableView : undefined,
    };
  } catch {
    cachedValue = {};
  }
  return cachedValue;
}

export function readStoredClient() {
  return read().client;
}

function write(next: Stored) {
  if (Object.entries(next).every(([k, v]) => read()[k as keyof Stored] === v))
    return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...next }));
  } catch {
    // 저장 실패해도 화면 동작에는 영향 없음
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const serverSnapshot: Stored = {};

/** 마지막으로 고른 클라이언트·기간 (localStorage) */
export function usePreferences() {
  const stored = useSyncExternalStore(subscribe, read, () => serverSnapshot);
  const setPeriod = useCallback((period: PeriodKey) => write({ period }), []);
  const setClient = useCallback((client: ClientSlug) => write({ client }), []);
  return { period: stored.period ?? DEFAULT_PERIOD, setPeriod, setClient };
}

/** 채널별 효율 표의 보기(캠페인별 / 국가별), 마지막 선택을 기억 */
export function useTableView() {
  const stored = useSyncExternalStore(subscribe, read, () => serverSnapshot);
  const setTableView = useCallback(
    (tableView: TableView) => write({ tableView }),
    [],
  );
  return [stored.tableView ?? DEFAULT_TABLE_VIEW, setTableView] as const;
}
