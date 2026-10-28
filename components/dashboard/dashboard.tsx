"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { getClient } from "@/lib/clients";
import type { Metrics } from "@/lib/build-metrics";
import { shortDate } from "@/lib/periods";
import type { ClientSlug, PeriodKey } from "@/lib/types";
import { usePreferences } from "@/lib/use-preferences";
import { ChannelTable } from "./channel-table";
import { CreativeRanking } from "./creative-ranking";
import { FilterBar } from "./filter-bar";
import { OrganicSection } from "./organic-section";
import { SummaryCards } from "./summary-cards";
import { TrendChart } from "./trend-chart";
import { WebSection } from "./web-section";

async function fetchMetrics(client: ClientSlug, period: PeriodKey): Promise<Metrics> {
  const res = await fetch(`/api/metrics?${new URLSearchParams({ client, period })}`);
  if (!res.ok) throw new Error(`metrics ${res.status}`);
  return res.json();
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

  const { data, isError } = useQuery({
    queryKey: ["metrics", client, period],
    queryFn: () => fetchMetrics(client, period),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="pt-6 pb-4 sm:pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="text-t7 font-semibold text-subtle hover:text-body">
            힐링브리즈 마케팅 대시보드
          </Link>
          {data?.source === "sample" && (
            <span className="inline-flex h-6 items-center rounded-md bg-warn-bg px-2 text-st12 font-bold text-warn-fg">
              샘플 데이터
            </span>
          )}
          {data?.source === "db" && (
            <span className="tabular inline-flex h-6 items-center rounded-md bg-surface px-2 text-st12 font-semibold text-body">
              {data.lastSyncedAt ? `마지막 동기화 ${formatSyncedAt(data.lastSyncedAt)}` : "아직 동기화 기록이 없어요"}
            </span>
          )}
        </div>
        <h1 className="mt-1.5 text-t2 font-bold text-foreground sm:text-t1">
          {info.fullName}
        </h1>
        <p className="mt-1 text-t6 text-body">
          {info.description}
          {data && (
            <span className="tabular text-subtle">
              {" "}
              · {data.periodLabel}
              {data.range.start && data.range.end && ` ${shortDate(data.range.start)} ~ ${shortDate(data.range.end)}`}
            </span>
          )}
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-4 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <FilterBar client={client} period={period} onClientSelect={setClient} onPeriodChange={setPeriod} />
      </div>

      {isError && <p className="mt-6 text-t6 text-bad">데이터를 불러오지 못했어요. 새로고침해 주세요.</p>}

      {data ? (
        <main className="mt-3 flex flex-col gap-3">
          <SummaryCards data={data} isSms={client === "cellora"} />
          <TrendChart data={data} />
          <ChannelTable data={data} />
          {data.web && <WebSection web={data.web} compareLabel={data.compareLabel} />}
          <CreativeRanking data={data} />
          <div className="mt-5">
            <OrganicSection data={data} />
          </div>
          <p className="mt-6 px-1 text-st12 text-subtle">
            {data.source === "sample" ? "샘플 데이터 기준일" : "기준일"} {data.asOf} · 주 시작일(월요일)이 속한 달로 기간을 나눠요 · CRM 지표(DB·상담·예약·매출)는
            2단계에서 연결합니다
          </p>
        </main>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[136px] animate-pulse rounded-card bg-card" />
          ))}
        </div>
      )}
    </div>
  );
}
