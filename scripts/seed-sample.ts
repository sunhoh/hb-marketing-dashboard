/**
 * 샘플 데이터를 DB 에 넣는다(source = "sample"). DB 경로가 샘플 화면과 똑같이 그려지는지 확인할 때만 쓴다.
 *   npm run db:sample          넣기(기존 샘플 행은 지우고 다시)
 *   npm run db:sample -- --clear   샘플 행만 지우기
 */
import "./env";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { adMetrics, creatives, placeRanks, placeStats, snsStats, viralPosts } from "../db/schema";
import { SAMPLE_DATASET as S } from "../data/sample";

const clear = process.argv.includes("--clear");

async function main() {
  await db.transaction(async (tx) => {
    for (const t of [adMetrics, placeRanks, placeStats, viralPosts, snsStats]) await tx.delete(t).where(eq(t.source, "sample"));
    await tx.delete(creatives).where(inArray(creatives.id, S.creatives.map((c) => c.id)));
    if (clear) return;

    const ad = (m: (typeof S.weekly)[number], creativeId = "") => ({
      date: m.weekStart,
      granularity: "week" as const,
      client: m.client,
      channel: m.channel,
      segment: creativeId ? "" : (m.segment ?? ""),
      creativeId,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions ?? null,
      source: "sample" as const,
    });
    await tx.insert(adMetrics).values([...S.weekly.map((m) => ad(m)), ...S.creativeWeekly.map((m) => ad(m, m.segment!))]);
    await tx.insert(creatives).values(S.creatives.map((c) => ({ id: c.id, client: c.client, name: c.name, format: c.format })));
    await tx.insert(placeRanks).values(S.placeRanks.map((r) => ({ ...r, client: "gu-ilsan" as const, source: "sample" as const })));
    await tx.insert(placeStats).values(S.placeStats.map((s) => ({ ...s, client: "gu-ilsan" as const, source: "sample" as const })));
    // 바이럴 샘플은 주별 합계뿐이라, 주마다 발행 수만큼 글을 만들고 앞의 topKeywords 개를 상위노출로 둔다
    await tx.insert(viralPosts).values(
      S.viral.flatMap((v) =>
        Array.from({ length: v.published }, (_, i) => ({
          publishedOn: v.weekStart,
          client: v.client,
          platform: "블로그",
          url: `sample://${v.client}/${v.weekStart}/${i}`,
          keyword: `샘플 키워드 ${i}`,
          topExposed: i < v.topKeywords ? 1 : 0,
          source: "sample" as const,
        })),
      ),
    );
    await tx.insert(snsStats).values(S.sns.map((s) => ({ ...s, source: "sample" as const })));
  });
  console.log(clear ? "샘플 행을 지웠어요" : "샘플 데이터를 DB 에 넣었어요");
}

main()
  .catch((e) => {
    console.error("실패:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
