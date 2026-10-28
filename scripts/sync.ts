/**
 * 실제 데이터 가져오기.  npm run sync
 * 설정된 매체 API(구글 시트는 잠시 제외). 한 출처가 실패해도 나머지는 계속한다. 화면의 [동기화] 버튼과 같은 코드(db/sync/run-all.ts).
 *
 * 처음 한 번 과거를 채울 때:
 *   npm run sync -- --naver-days=365 --meta-days=365 --instagram-weeks=52 --google-days=400
 */
import "./env";
import { db } from "../db";
import { runAllSyncs, SYNC_STEPS } from "../db/sync/run-all";

function numberArg(flag: string) {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? Number(arg.split("=")[1]) : undefined;
}

const label = (key: string) => SYNC_STEPS.find((s) => s.key === key)!.label;

runAllSyncs(
  {
    naverDays: numberArg("naver-days"),
    metaDays: numberArg("meta-days"),
    instagramWeeks: numberArg("instagram-weeks"),
    googleDays: numberArg("google-days"),
  },
  (e) => {
    if (e.status === "running") console.log(`${label(e.step)} 가져오는 중…`);
    else if (e.status === "done")
      for (const line of e.lines) console.log(`  ${line}`);
    else if (e.status === "skipped") console.log(`  설정 없음(건너뜀)`);
    else console.error(`  ${label(e.step)} 실패: ${e.error}`);
  },
)
  .then(({ failed }) => {
    console.log(failed ? "\n일부 실패" : "\n완료");
    if (failed) process.exitCode = 1;
  })
  .finally(() => db.$client.end());
