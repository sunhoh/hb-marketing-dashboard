"use client";

import { useSyncExternalStore } from "react";

/** SVG 속성에는 CSS 변수를 바로 못 넣으므로, 현재 테마(라이트/다크)의 계산된 색을 읽는다 */
const VARS = [
  "--chart-spend",
  "--chart-spend-dim",
  "--chart-ctr",
  "--chart-cpc",
  "--chart-4",
  "--chart-grid",
  "--chart-axis",
  "--card",
] as const;
type VarName = (typeof VARS)[number];
export type ThemeColors = Record<VarName, string>;

const FALLBACK: ThemeColors = {
  "--chart-spend": "#3182f6",
  "--chart-spend-dim": "#c9e2ff",
  "--chart-ctr": "#109595",
  "--chart-cpc": "#ed6700",
  "--chart-4": "#a234c7",
  "--chart-grid": "#e5e8eb",
  "--chart-axis": "#8b95a1",
  "--card": "#ffffff",
};

let cacheKey = "";
let cache: ThemeColors = FALLBACK;

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const values = VARS.map((v) => style.getPropertyValue(v).trim());
  const key = values.join("|");
  if (key !== cacheKey) {
    cacheKey = key;
    cache = Object.fromEntries(VARS.map((v, i) => [v, values[i] || FALLBACK[v]])) as ThemeColors;
  }
  return cache;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useThemeColors() {
  return useSyncExternalStore(subscribe, read, () => FALLBACK);
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

export function useIsNarrow(maxWidth = 640) {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth < maxWidth,
    () => false,
  );
}
