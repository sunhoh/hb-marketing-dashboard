/**
 * 모든 출처 동기화를 정해진 순서로 실행. 터미널(npm run sync)과 화면의 [동기화] 버튼이 같이 쓴다.
 * 한 출처가 실패해도 나머지는 계속하고, 단계마다 onProgress 로 알려 준다.
 */
import { CHANNEL_LABELS, CLIENTS } from "@/lib/clients";
import { formatNumber, formatWon } from "@/lib/metrics";
import { syncGoogle } from "./google";
import { isInstagramConfigured, syncInstagram } from "./instagram";
import { isMetaConfigured, syncMeta } from "./meta";
import { isNaverSearchAdConfigured, syncNaverSearchAd } from "./naver-searchad";
import { isYoutubeConfigured, syncYoutube } from "./youtube";

/** 비우면 각 출처의 기본값(최근 며칠·몇 주)을 쓴다. 과거를 채울 때만 터미널에서 넘긴다 */
export type SyncOptions = {
  naverDays?: number;
  metaDays?: number;
  instagramWeeks?: number;
  googleDays?: number;
};

/**
 * 구글 시트(매체_수동)는 팀 결정으로 잠시 뺐다(2026-10-28). 코드는 db/sync/sheet.ts 에 그대로 있어서
 * 다시 넣으려면 여기에 { key: "sheet", label: "구글 시트" } 와 runStep 의 case 를 되살리면 된다.
 */
export const SYNC_STEPS = [
  { key: "naver", label: "네이버 검색광고" },
  { key: "meta", label: "메타 광고" },
  { key: "google", label: "GA4 · 서치 콘솔" },
  { key: "instagram", label: "인스타그램" },
  { key: "youtube", label: "유튜브" },
] as const;
export type SyncStepKey = (typeof SYNC_STEPS)[number]["key"];

export type SyncEvent =
  | { step: SyncStepKey; status: "running" }
  | { step: SyncStepKey; status: "done"; lines: string[] }
  | { step: SyncStepKey; status: "skipped" }
  | { step: SyncStepKey; status: "error"; error: string };

const name = (slug: string) =>
  CLIENTS.find((c) => c.slug === slug)?.name ?? slug;

/** 단계 하나 실행. 설정이 없으면 null(건너뜀), 있으면 결과 요약 줄 */
async function runStep(
  key: SyncStepKey,
  opts: SyncOptions,
): Promise<string[] | null> {
  switch (key) {
    case "naver": {
      if (!isNaverSearchAdConfigured()) return null;
      const { since, until, rows, campaigns } = await syncNaverSearchAd(
        opts.naverDays,
      );
      return [
        `${since} ~ ${until}, ${rows}줄`,
        ...campaigns.map((c) => {
          const where = c.target
            ? `→ ${name(c.target.client)} · ${CHANNEL_LABELS[c.target.channel] ?? c.target.channel}`
            : c.excluded
              ? "→ 제외(팀 결정)"
              : "→ 가져오지 않음(지점을 알 수 없음)";
          return `  · ${c.name} (${c.type}${c.status === "PAUSED" ? ", 중지" : ""}) ${formatWon(c.spend)} ${where}`;
        }),
      ];
    }
    case "meta": {
      if (!isMetaConfigured()) return null;
      const { since, until, rows, accounts } = await syncMeta(opts.metaDays);
      return [
        `${since} ~ ${until}, ${rows}줄`,
        ...accounts.map(
          (a) =>
            `  · ${a.account} → ${name(a.client)}: ${formatWon(a.spend)}, 국가 ${a.countries}개, 소재 ${a.ads}개`,
        ),
      ];
    }
    case "instagram": {
      if (!isInstagramConfigured()) return null;
      const { weeks, report } = await syncInstagram(opts.instagramWeeks);
      return [
        `최근 ${weeks}주`,
        ...report.map(
          (r) =>
            `  · ${name(r.client)} ${r.account}: 팔로워 ${formatNumber(r.followers)}, 이번 주 조회수 ${formatNumber(r.weekViews)}`,
        ),
      ];
    }
    case "youtube": {
      if (!isYoutubeConfigured()) return null;
      return (await syncYoutube()).map(
        (r) =>
          `${name(r.client)} "${r.title}": 구독자 ${formatNumber(r.subscribers)}, 누적 조회수 ${formatNumber(r.totalViews)}, 최근 영상 ${r.videos}개`,
      );
    }
    case "google": {
      const r = await syncGoogle(opts.googleDays);
      return [
        ...(r.ga4 ?? []).map(
          (g) =>
            `GA4 ${name(g.client)}: ${r.since} ~ ${r.until}, 세션 ${formatNumber(g.sessions)}, 전환 ${formatNumber(g.conversions)}`,
        ),
        ...(r.gsc?.report ?? []).map(
          (g) =>
            `서치 콘솔 ${name(g.client)}: ${r.gsc!.since} ~ ${r.until}, 클릭 ${formatNumber(g.clicks)}, 노출 ${formatNumber(g.impressions)}, 검색어 ${formatNumber(g.queries)}줄`,
        ),
      ];
    }
  }
}

/** 실패한 단계가 하나라도 있으면 failed = true */
export async function runAllSyncs(
  opts: SyncOptions = {},
  onProgress: (e: SyncEvent) => void = () => {},
) {
  let failed = false;
  for (const { key } of SYNC_STEPS) {
    onProgress({ step: key, status: "running" });
    try {
      const lines = await runStep(key, opts);
      onProgress(
        lines === null
          ? { step: key, status: "skipped" }
          : { step: key, status: "done", lines },
      );
    } catch (e) {
      failed = true;
      onProgress({ step: key, status: "error", error: (e as Error).message });
    }
  }
  return { failed };
}
