"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import {
  CircleCheck,
  LoaderCircle,
  Minus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SyncState, SyncStepState } from "@/db/sync/status";

/** 동기화 중에 진행 상황을 다시 묻는 간격 */
const POLL_MS = 5_000;
/** 끝난 뒤 결과를 보여주고 진행 창을 닫기까지 */
const AUTO_CLOSE_MS = 5_000;

async function fetchSyncState(): Promise<SyncState> {
  const res = await fetch("/api/sync");
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res.json();
}

async function startSync(): Promise<SyncState> {
  const res = await fetch("/api/sync", { method: "POST" });
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return res.json();
}

/** [동기화] 버튼 — 모든 출처를 최근 며칠 치만 다시 가져오고, 끝나면 화면 데이터를 새로 읽는다 */
export function SyncButton() {
  const queryClient = useQueryClient();
  const [clicked, setClicked] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: state } = useQuery({
    queryKey: ["sync-status"],
    queryFn: fetchSyncState,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.running ? POLL_MS : false),
  });

  const start = useMutation({
    mutationFn: startSync,
    onSuccess: (s) => queryClient.setQueryData(["sync-status"], s),
  });

  // 돌던 동기화가 끝나면 카드·차트·표를 다시 불러오고, 결과를 잠시 보여준 뒤 진행 창을 닫는다.
  // 실패한 출처는 버튼 옆 안내로 남는다
  const wasRunning = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (wasRunning.current && state && !state.running) {
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      closeTimer.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    }
    wasRunning.current = state?.running ?? false;
  }, [state, queryClient]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const running = state?.running || start.isPending;
  const steps = state?.steps ?? [];
  const current = steps.findIndex((s) => s.status === "running");
  const failed = steps.filter((s) => s.status === "error");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // 돌고 있을 때 누르면 진행 창만 다시 연다
          clearTimeout(closeTimer.current);
          setOpen(true);
          if (running) return;
          setClicked(true);
          start.mutate();
        }}
        className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md bg-surface px-2 text-st12 font-semibold text-body hover:text-foreground"
      >
        {running ? (
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw aria-hidden className="size-3.5" />
        )}
        {running
          ? current >= 0
            ? `${steps[current].label} 가져오는 중… ${current + 1}/${steps.length}`
            : "동기화 시작 중…"
          : "동기화"}
      </button>
      {start.isError && (
        <span className="text-st12 font-semibold text-warn-fg">
          동기화를 시작하지 못했어요
        </span>
      )}
      {/* 성공은 '마지막 동기화' 시각이 바뀌는 것으로 충분해서, 실패만 알린다 */}
      {clicked && !running && failed.length > 0 && (
        <span
          className="inline-flex items-center gap-1 text-st12 font-semibold text-warn-fg"
          role="status"
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          <span title={failed.map((s) => `${s.label}: ${s.error}`).join("\n")}>
            {failed.map((s) => s.label).join(", ")} 실패 · 나머지는 완료
          </span>
        </span>
      )}
      <SyncDialog
        open={open}
        onOpenChange={setOpen}
        running={running}
        steps={steps}
      />
    </>
  );
}

function StepIcon({ status }: { status: SyncStepState["status"] }) {
  if (status === "running")
    return (
      <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
    );
  if (status === "done")
    return <CircleCheck aria-hidden className="size-4 text-primary" />;
  if (status === "error")
    return <TriangleAlert aria-hidden className="size-4 text-warn-fg" />;
  if (status === "skipped")
    return <Minus aria-hidden className="size-4 text-subtle" />;
  return (
    <span aria-hidden className="size-4 rounded-full border-2 border-border" />
  );
}

const STATUS_TEXT: Record<SyncStepState["status"], string> = {
  pending: "대기",
  running: "가져오는 중",
  done: "완료",
  skipped: "설정 없음",
  error: "실패",
};

/** 화면 가운데 진행 창. 뒤 대시보드는 흐리게. 닫아도 동기화는 서버에서 계속된다 */
function SyncDialog({
  open,
  onOpenChange,
  running,
  steps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  running: boolean;
  steps: SyncStepState[];
}) {
  const failed = steps.some((s) => s.status === "error");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-6 shadow-xl ring-1 ring-foreground/10 transition-[opacity,scale] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <Dialog.Title className="text-t5 font-bold text-foreground">
            {running
              ? "데이터 동기화 중"
              : failed
                ? "일부 출처를 가져오지 못했어요"
                : "동기화 완료"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-t7 text-subtle">
            {running
              ? "최근 35일(인스타그램은 5주) 데이터를 다시 가져와요. 창을 닫아도 동기화는 계속돼요."
              : "카드·차트·표에 새 데이터가 반영됐어요."}
          </Dialog.Description>

          <ul className="mt-4 divide-y divide-border">
            {steps.map((s) => (
              <li key={s.key} className="py-2.5">
                <div className="flex items-center gap-2.5">
                  <StepIcon status={s.status} />
                  <span
                    className={`flex-1 text-t6 ${s.status === "pending" ? "text-subtle" : "font-semibold text-foreground"}`}
                  >
                    {s.label}
                  </span>
                  <span
                    className={`text-st12 ${s.status === "error" ? "font-semibold text-warn-fg" : "text-subtle"}`}
                  >
                    {STATUS_TEXT[s.status]}
                  </span>
                </div>
                {s.error && (
                  <p className="mt-1 pl-6.5 text-st12 break-words text-warn-fg">
                    {s.error}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Dialog.Close className="mt-5 h-10 w-full rounded-lg bg-primary text-t6 font-semibold text-primary-foreground hover:opacity-90">
            대시보드 보기
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
