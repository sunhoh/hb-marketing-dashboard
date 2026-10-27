/**
 * 화면이 부르는 유일한 데이터 함수(서버 전용, /api/metrics 가 호출).
 * DATA_SOURCE=db 이면 DB, 아니면 샘플. 돌려주는 모양(Metrics)은 출처와 무관하게 같다.
 */
import "server-only";
import { buildMetrics, type Metrics } from "./build-metrics";
import type { ClientSlug, PeriodKey } from "./types";

export async function getMetrics(client: ClientSlug, period: PeriodKey): Promise<Metrics> {
  if (process.env.DATA_SOURCE === "db") {
    const { loadDbDataset } = await import("@/db/dataset");
    const { dataset, lastSyncedAt } = await loadDbDataset();
    return { ...buildMetrics(dataset, client, period), lastSyncedAt };
  }
  const { SAMPLE_DATASET } = await import("@/data/sample");
  return { ...buildMetrics(SAMPLE_DATASET, client, period), lastSyncedAt: null };
}
