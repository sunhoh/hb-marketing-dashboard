/**
 * 실제 데이터 가져오기.  npm run sync
 * 구글 시트 + 설정된 매체 API. 한 출처가 실패해도 나머지는 계속한다.
 */
import "./env";
import { db } from "../db";
import { isNaverSearchAdConfigured, syncNaverSearchAd } from "../db/sync/naver-searchad";
import { syncSheet } from "../db/sync/sheet";
import { CLIENTS, CHANNEL_LABELS } from "../lib/clients";
import { formatWon } from "../lib/metrics";

const name = (slug: string) => CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

async function sheet() {
  console.log("구글 시트 가져오는 중…");
  const { counts, issues } = await syncSheet();
  for (const [tab, n] of Object.entries(counts)) console.log(`  ${tab}: ${n}줄`);
  if (issues.length) {
    console.log(`  확인이 필요한 줄 ${issues.length}개 (건너뜀):`);
    for (const i of issues) console.log(`    · ${i.tab}${i.row ? ` ${i.row}행` : ""}: ${i.message}`);
  }
}

async function naver() {
  if (!isNaverSearchAdConfigured()) {
    console.log("네이버 검색광고: 설정 없음(건너뜀)");
    return;
  }
  console.log("네이버 검색광고 가져오는 중…");
  const { since, until, report } = await syncNaverSearchAd();
  for (const r of report) {
    console.log(`  ${name(r.client)} ${CHANNEL_LABELS["naver-place"]}: ${since} ~ ${until}, ${r.rows}일치`);
    for (const s of r.skipped) console.log(`    · 가져오지 않은 캠페인(${s.type}) "${s.name}": ${formatWon(s.spend)}`);
  }
}

async function main() {
  let failed = false;
  for (const [label, job] of [["구글 시트", sheet], ["네이버 검색광고", naver]] as const) {
    try {
      await job();
    } catch (e) {
      failed = true;
      console.error(`  ${label} 실패: ${(e as Error).message}`);
    }
  }
  console.log(failed ? "\n일부 실패" : "\n완료");
  if (failed) process.exitCode = 1;
}

main().finally(() => db.$client.end());
