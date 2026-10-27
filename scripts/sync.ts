/**
 * 실제 데이터 가져오기.  npm run sync
 * 지금은 구글 시트만. 메타·네이버 API 는 연결되면 여기에 추가한다.
 */
import { existsSync } from "node:fs";
import { db } from "../db";
import { syncSheet } from "../db/sync/sheet";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  console.log("구글 시트 가져오는 중…");
  const { counts, issues } = await syncSheet();
  for (const [tab, n] of Object.entries(counts)) console.log(`  ${tab}: ${n}줄`);
  if (issues.length) {
    console.log(`\n확인이 필요한 줄 ${issues.length}개 (건너뜀):`);
    for (const i of issues) console.log(`  · ${i.tab}${i.row ? ` ${i.row}행` : ""}: ${i.message}`);
  }
  console.log("\n완료");
}

main()
  .catch((e) => {
    console.error("\n실패:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$client.close());
