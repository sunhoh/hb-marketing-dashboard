/**
 * 구글 시트 읽기 — 지금은 동기화에서 빠져 있다(2026-10-28).
 * 매체_수동은 주 단위 숫자라 일 단위 표(ad_metrics)에 넣지 않는다. 시트를 다시 켤 때 주 단위 표
 * (예: ad_manual_weekly)를 만들고 여기서 "source = sheet 인 행을 시트 내용으로 통째로 교체"하도록 붙인다.
 * 그때까지는 시트를 읽고 검사만 한다.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { syncRuns } from "@/db/schema";
import { SHEET_TABS } from "../sheet-spec";
import { googleJwt } from "./google-auth";
import { parseSheet, type Cell } from "./sheet-parse";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function auth() {
  return googleJwt([SCOPE]);
}

async function fetchTabs(sheetId: string): Promise<Record<string, Cell[][]>> {
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE", // 숫자는 숫자로, 날짜는 일련번호로
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  for (const t of SHEET_TABS) params.append("ranges", `'${t.name}'!A:Z`);
  const res = await auth().request<{ valueRanges: { values?: Cell[][] }[] }>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`,
  });
  return Object.fromEntries(
    SHEET_TABS.map((t, i) => [t.name, res.data.valueRanges[i]?.values ?? []]),
  );
}

export async function syncSheet() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID 가 .env.local 에 없어요");

  const [run] = await db
    .insert(syncRuns)
    .values({ source: "sheet" })
    .returning({ id: syncRuns.id });
  try {
    const parsed = parseSheet(await fetchTabs(sheetId));
    const counts = { 매체_수동: parsed.adMetrics.length };

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await db
      .update(syncRuns)
      .set({
        status: "success",
        finishedAt: new Date(),
        rowsUpserted: total,
        error: parsed.issues.length
          ? parsed.issues
              .map((i) => `${i.tab} ${i.row}행: ${i.message}`)
              .join("\n")
          : null,
      })
      .where(eq(syncRuns.id, run.id));
    return { counts, issues: parsed.issues };
  } catch (e) {
    await db
      .update(syncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: (e as Error).message,
      })
      .where(eq(syncRuns.id, run.id));
    throw e;
  }
}
