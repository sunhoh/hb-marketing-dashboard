/**
 * 구글 시트 → DB 동기화. 시트가 원본이므로 source = "sheet" 인 행은 매번 시트 내용으로 통째로 교체한다
 * (시트에서 지운 줄은 DB 에서도 사라진다). API 로 들어온 행(meta_api 등)은 건드리지 않는다.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adMetrics,
  placeRanks,
  placeStats,
  snsStats,
  syncRuns,
  viralPosts,
} from "@/db/schema";
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
    const counts = {
      매체_수동: parsed.adMetrics.length,
      플레이스_순위: parsed.placeRanks.length,
      플레이스_지표: parsed.placeStats.length,
      바이럴: parsed.viralPosts.length,
      SNS: parsed.snsStats.length,
    };

    await db.transaction(async (tx) => {
      const replace = async <
        T extends
          | typeof adMetrics
          | typeof placeRanks
          | typeof placeStats
          | typeof viralPosts
          | typeof snsStats,
      >(
        tab: string,
        table: T,
        rows: T["$inferInsert"][],
      ) => {
        if (parsed.skippedTabs.has(tab)) return;
        await tx.delete(table).where(eq(table.source, "sheet"));
        if (rows.length) await tx.insert(table).values(rows as never);
      };
      await replace("매체_수동", adMetrics, parsed.adMetrics);
      await replace("플레이스_순위", placeRanks, parsed.placeRanks);
      await replace("플레이스_지표", placeStats, parsed.placeStats);
      await replace("바이럴", viralPosts, parsed.viralPosts);
      await replace("SNS", snsStats, parsed.snsStats);
    });

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
