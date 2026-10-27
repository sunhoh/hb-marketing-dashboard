"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getClient } from "@/lib/clients";
import { getMetrics } from "@/lib/data";
import { shortDate } from "@/lib/periods";
import type { ClientFilter } from "@/lib/types";
import { readStoredClient, usePreferences } from "@/lib/use-preferences";
import { ChannelTable } from "./channel-table";
import { CreativeRanking } from "./creative-ranking";
import { FilterBar } from "./filter-bar";
import { OrganicSection } from "./organic-section";
import { SummaryCards } from "./summary-cards";
import { TrendChart } from "./trend-chart";

// 새로고침 직후 첫 화면에서만 마지막 클라이언트로 돌려놓는다(뒤로 가기로 '/'에 왔을 때 다시 끌려가지 않게)
let restoreChecked = false;

export function Dashboard({ client }: { client: ClientFilter }) {
  const router = useRouter();
  const { period, setPeriod, setClient } = usePreferences();
  const info = client === "all" ? null : getClient(client);

  useEffect(() => {
    if (!restoreChecked) {
      restoreChecked = true;
      const last = readStoredClient();
      if (client === "all" && last && last !== "all") {
        router.replace(`/clients/${last}`);
        return;
      }
    }
    setClient(client);
  }, [client, router, setClient]);

  const { data, isError } = useQuery({
    queryKey: ["metrics", client, period],
    queryFn: () => getMetrics(client, period),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="pt-6 pb-4 sm:pt-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" onClick={() => setClient("all")} className="text-t7 font-semibold text-subtle hover:text-body">
            힐링브리즈 마케팅 대시보드
          </Link>
          <span className="inline-flex h-6 items-center rounded-md bg-warn-bg px-2 text-st12 font-bold text-warn-fg">
            샘플 데이터
          </span>
        </div>
        <h1 className="mt-1.5 text-t2 font-bold text-foreground sm:text-t1">
          {info ? info.fullName : "전체 클라이언트"}
        </h1>
        <p className="mt-1 text-t6 text-body">
          {info ? info.description : "GU강남 · GU일산 · 루호 · 셀로라 매체 지표 합계"}
          {data && (
            <span className="tabular text-subtle">
              {" "}
              · {data.periodLabel} {shortDate(data.range.start)} ~ {shortDate(data.range.end)}
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
          <ChannelTable data={data} showClient={client === "all"} />
          <CreativeRanking data={data} showClient={client === "all"} />
          <div className="mt-5">
            <OrganicSection data={data} showClient={client === "all"} />
          </div>
          <p className="mt-6 px-1 text-st12 text-subtle">
            샘플 데이터 기준일 {data.sampleToday} · 주 시작일(월요일)이 속한 달로 기간을 나눠요 · CRM 지표(DB·상담·예약·매출)는
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
