/**
 * 화면 [동기화] 버튼의 진행 상태(서버 메모리). 동시에 하나만 돌게 막고, 화면은 이 상태를 몇 초마다 읽는다.
 * 서버가 한 프로세스인 로컬 기준이다. 배포(서버리스)에서는 상태를 DB 로 옮겨야 한다.
 */
import "server-only";
import { runAllSyncs, SYNC_STEPS, type SyncStepKey } from "./run-all";

export type SyncStepState = {
  key: SyncStepKey;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  error?: string;
};

export type SyncState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  steps: SyncStepState[];
};

const store = globalThis as unknown as { __syncState?: SyncState };

export function getSyncState(): SyncState {
  return (
    store.__syncState ?? {
      running: false,
      startedAt: null,
      finishedAt: null,
      steps: [],
    }
  );
}

/** 이미 돌고 있으면 null. 아니면 상태를 잡고(동기) 실행 함수를 돌려준다 — 응답을 보낸 뒤 after() 에서 부른다 */
export function claimSync(): (() => Promise<void>) | null {
  if (getSyncState().running) return null;
  const state: SyncState = {
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: SYNC_STEPS.map((s) => ({
      key: s.key,
      label: s.label,
      status: "pending",
    })),
  };
  store.__syncState = state;
  return async () => {
    try {
      await runAllSyncs({}, (e) => {
        const step = state.steps.find((s) => s.key === e.step)!;
        step.status = e.status;
        if (e.status === "error") step.error = e.error;
      });
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  };
}
