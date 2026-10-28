/**
 * 실제 데이터 가져오기.  npm run sync
 * 구글 시트 + 설정된 매체 API. 한 출처가 실패해도 나머지는 계속한다.
 */
import "./env";
import { db } from "../db";
import {
  isNaverSearchAdConfigured,
  syncNaverSearchAd,
} from "../db/sync/naver-searchad";
import { syncGoogle } from "../db/sync/google";
import { syncSheet } from "../db/sync/sheet";
import { isYoutubeConfigured, syncYoutube } from "../db/sync/youtube";
import { CLIENTS, CHANNEL_LABELS } from "../lib/clients";
import { formatNumber, formatWon } from "../lib/metrics";

const name = (slug: string) =>
  CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

async function sheet() {
  console.log("구글 시트 가져오는 중…");
  const { counts, issues } = await syncSheet();
  for (const [tab, n] of Object.entries(counts))
    console.log(`  ${tab}: ${n}줄`);
  if (issues.length) {
    console.log(`  확인이 필요한 줄 ${issues.length}개 (건너뜀):`);
    for (const i of issues)
      console.log(`    · ${i.tab}${i.row ? ` ${i.row}행` : ""}: ${i.message}`);
  }
}

async function naver() {
  if (!isNaverSearchAdConfigured()) {
    console.log("네이버 검색광고: 설정 없음(건너뜀)");
    return;
  }
  console.log("네이버 검색광고 가져오는 중…");
  // 처음 한 번은 npm run sync -- --naver-days=365 로 과거를 채운다
  const daysArg = process.argv.find((a) => a.startsWith("--naver-days="));
  const { since, until, rows, campaigns } = await syncNaverSearchAd(
    daysArg ? Number(daysArg.split("=")[1]) : undefined,
  );
  console.log(`  ${since} ~ ${until}, ${rows}줄`);
  for (const c of campaigns) {
    const where = c.target
      ? `→ ${name(c.target.client)} · ${CHANNEL_LABELS[c.target.channel] ?? c.target.channel}`
      : c.excluded
        ? "→ 제외(팀 결정)"
        : "→ 가져오지 않음(지점을 알 수 없음)";
    console.log(
      `    · ${c.name} (${c.type}${c.status === "PAUSED" ? ", 중지" : ""}) ${formatWon(c.spend)} ${where}`,
    );
  }
}

async function youtube() {
  if (!isYoutubeConfigured()) {
    console.log("유튜브: 설정 없음(건너뜀)");
    return;
  }
  console.log("유튜브 가져오는 중…");
  for (const r of await syncYoutube()) {
    console.log(
      `  ${name(r.client)} "${r.title}": 구독자 ${formatNumber(r.subscribers)}, 누적 조회수 ${formatNumber(r.totalViews)}, 최근 영상 ${r.videos}개`,
    );
  }
}

async function google() {
  // 처음 한 번은 npm run sync -- --google-days=400 으로 과거를 채운다
  const daysArg = process.argv.find((a) => a.startsWith("--google-days="));
  console.log("GA4 · 서치 콘솔 가져오는 중…");
  const r = await syncGoogle(
    daysArg ? Number(daysArg.split("=")[1]) : undefined,
  );
  for (const g of r.ga4 ?? [])
    console.log(
      `  GA4 ${name(g.client)}: ${r.since} ~ ${r.until}, 세션 ${formatNumber(g.sessions)}, 전환 ${formatNumber(g.conversions)}`,
    );
  for (const g of r.gsc?.report ?? [])
    console.log(
      `  서치 콘솔 ${name(g.client)}: ${r.gsc!.since} ~ ${r.until}, 클릭 ${formatNumber(g.clicks)}, 노출 ${formatNumber(g.impressions)}, 검색어 ${formatNumber(g.queries)}줄`,
    );
}

async function main() {
  let failed = false;
  for (const [label, job] of [
    ["구글 시트", sheet],
    ["네이버 검색광고", naver],
    ["유튜브", youtube],
    ["GA4 · 서치 콘솔", google],
  ] as const) {
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
