/**
 * 화면이 부르는 유일한 데이터 함수(서버 전용, /api/metrics 가 호출). DB 에서 읽는다.
 */
import "server-only";
import { loadDbDataset } from "@/db/dataset";
import { buildMetrics, type Metrics } from "./build-metrics";
import type { ClientSlug, PeriodKey } from "./types";

export async function getMetrics(client: ClientSlug, period: PeriodKey): Promise<Metrics> {
  const { dataset, lastSyncedAt } = await loadDbDataset();
  return { ...buildMetrics(dataset, client, period), lastSyncedAt };
}
