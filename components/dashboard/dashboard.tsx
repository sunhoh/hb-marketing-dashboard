"use client";

import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { LoaderCircle, Lock } from "lucide-react";
import { useEffect } from "react";
import { getClient } from "@/lib/clients";
import type { Metrics } from "@/lib/build-metrics";
import type { IpBlocked } from "@/proxy";
import { shortDate } from "@/lib/periods";
import type { ClientSlug, PeriodKey } from "@/lib/types";
import { usePreferences } from "@/lib/use-preferences";
import { ChannelTable } from "./channel-table";
import { CreativeRanking } from "./creative-ranking";
import { FilterBar } from "./filter-bar";
import { OrganicSection } from "./organic-section";
import { SummaryCards } from "./summary-cards";
import { SyncButton } from "./sync-button";
import { TrendChart } from "./trend-chart";
import { WebSection } from "./web-section";

/** 사내 IP 가 아니어서 서버가 데이터를 주지 않음(proxy.ts) */
class IpBlockedError extends Error {
  constructor(readonly ip: string | null) {
    super("IP_NOT_ALLOWED");
  }
}

async function fetchMetrics(
  client: ClientSlug,
  period: PeriodKey,
): Promise<Metrics> {
  const res = await fetch(
    `/api/metrics?${new URLSearchParams({ client, period })}`,
  );
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as IpBlocked | null;
    if (body?.code === "IP_NOT_ALLOWED") throw new IpBlockedError(body.ip);
  }
  if (!res.ok) throw new Error(`metrics ${res.status}`);
  return res.json();
}

/** 가장 최근에 받은 화면 데이터 — 다른 클라이언트로 넘어갈 때 새 데이터가 올 때까지 흐리게 깔아 둔다 */
function latestMetrics(queryClient: QueryClient) {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: ["metrics"] })
    .filter((q) => q.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state
    .data as Metrics | undefined;
}

/** 화면 가운데 "불러오는 중" — 뒤 화면 클릭은 막지 않는다(필터는 계속 바꿀 수 있게) */
function LoadingOverlay() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center "
      role="status"
    >
      <div className="inline-flex items-center gap-2 text-t6 font-semibold text-foreground">
        <LoaderCircle
          aria-hidden
          className="size-4 animate-spin text-primary"
        />
        불러오는 중…
      </div>
    </div>
  );
}

/** 실제 숫자 없이 대시보드 모양만 — 사내 IP 가 아닐 때 흐리게 깔아 둔다 */
function BlurredPlaceholder() {
  return (
    <div
      aria-hidden
      className="pointer-events-none mt-3 flex select-none flex-col gap-3 blur-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[136px] rounded-card bg-card p-5">
            <div className="h-3 w-16 rounded bg-surface" />
            <div className="mt-4 h-7 w-32 rounded bg-surface" />
            <div className="mt-3 h-3 w-24 rounded bg-surface" />
          </div>
        ))}
      </div>
      <div className="flex h-72 items-end gap-3 rounded-card bg-card p-6">
        {[40, 65, 55, 80, 50, 70, 90, 60, 75, 85, 45, 30].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-surface"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-card bg-card p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-5 rounded bg-surface" />
        ))}
      </div>
    </div>
  );
}

function IpBlockedModal({ ip }: { ip: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-labelledby="ip-blocked-title"
        aria-describedby="ip-blocked-desc"
        className="w-[min(400px,100%)] rounded-card bg-card p-6 text-center shadow-xl ring-1 ring-foreground/10"
      >
        <Lock aria-hidden className="mx-auto size-8 text-subtle" />
        <h2
          id="ip-blocked-title"
          className="mt-3 text-t5 font-bold text-foreground"
        >
          사내 네트워크에서만 볼 수 있어요
        </h2>
        <p id="ip-blocked-desc" className="mt-1.5 text-t7 text-body">
          회사 와이파이(사내망)에 연결한 뒤 새로고침해 주세요.
        </p>
        {ip && (
          <p className="tabular mt-3 text-st12 text-subtle">
            지금 접속한 IP {ip}
          </p>
        )}
      </div>
    </div>
  );
}

/** "10.27 14:05" (서울 시간) */
function formatSyncedAt(iso: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

export function Dashboard({ client }: { client: ClientSlug }) {
  const { period, setPeriod, setClient } = usePreferences();
  const info = getClient(client)!;

  useEffect(() => {
    setClient(client);
  }, [client, setClient]);

  const queryClient = useQueryClient();
  const { data, isError, error, isPlaceholderData } = useQuery({
    queryKey: ["metrics", client, period],
    queryFn: () => fetchMetrics(client, period),
    // 기간을 바꾸면 이전 기간, 클라이언트를 바꾸면(페이지가 새로 열림) 직전에 보던 화면을 흐리게 둔다
    placeholderData: (prev) => prev ?? latestMetrics(queryClient),
    // 사내 IP 가 아니면 다시 시도해도 같으니 바로 모달을 띄운다
    retry: (count, e) => !(e instanceof IpBlockedError) && count < 3,
  });
  const blocked = error instanceof IpBlockedError ? error : null;
  const loading = !blocked && !isError && (isPlaceholderData || !data);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="pt-6 pb-4 sm:pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-t7 font-semibold text-subtle">
            힐링브리즈 마케팅 대시보드
          </span>
          {data && (
            <span className="tabular inline-flex h-6 items-center rounded-md bg-surface px-2 text-st12 font-semibold text-body">
              {data.lastSyncedAt
                ? `마지막 동기화 ${formatSyncedAt(data.lastSyncedAt)}`
                : "아직 동기화 기록이 없어요"}
            </span>
          )}
          {!blocked && <SyncButton />}
        </div>
        <h1 className="mt-1.5 text-t2 font-bold text-foreground sm:text-t1">
          {info.fullName}
        </h1>
        <p className="mt-1 text-t6 text-body">
          {info.description}
          {data && (
            <span className="tabular text-subtle">
              {" "}
              · {data.periodLabel}{" "}
              {data.range.start <= data.range.end
                ? `${shortDate(data.range.start)} ~ ${shortDate(data.range.end)}`
                : "(아직 데이터 없음)"}
              {data.previousRange.start <= data.previousRange.end &&
                ` · 비교 ${shortDate(data.previousRange.start)} ~ ${shortDate(data.previousRange.end)}`}
            </span>
          )}
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <FilterBar
          client={client}
          period={period}
          onClientSelect={setClient}
          onPeriodChange={setPeriod}
        />
      </div>

      {isError && !blocked && (
        <p className="mt-6 text-t6 text-bad">
          데이터를 불러오지 못했어요. 새로고침해 주세요.
        </p>
      )}

      {blocked ? (
        <>
          <BlurredPlaceholder />
          <IpBlockedModal ip={blocked.ip} />
        </>
      ) : data ? (
        <main
          className={`mt-3 flex flex-col gap-3 transition-opacity duration-200 ${isPlaceholderData ? "pointer-events-none opacity-40" : ""}`}
          aria-busy={isPlaceholderData}
        >
          <SummaryCards data={data} />
          <TrendChart data={data} />
          <ChannelTable data={data} />
          {data.web && (
            <WebSection web={data.web} compareLabel={data.compareLabel} />
          )}
          <CreativeRanking data={data} />
          <div className="mt-5">
            <OrganicSection data={data} />
          </div>
          <p className="mt-6 px-1 text-st12 text-subtle">
            기준일 {data.asOf} · 이번 달은 1일~어제, 전월 대비는 지난달 같은
            날짜까지와 비교해요 · SNS 조회수는 주 단위(월요일이 기간 안에 있는
            주) · CRM 지표(DB·상담·예약·매출)는 2단계에서 연결합니다
          </p>
        </main>
      ) : (
        <div
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy
        >
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-[136px] animate-pulse rounded-card bg-card"
            />
          ))}
        </div>
      )}
      {loading && <LoadingOverlay />}
    </div>
  );
}
