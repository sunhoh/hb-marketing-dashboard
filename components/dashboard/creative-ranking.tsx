"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OFF_CPC_RATIO, OFF_CTR_RATIO, type CreativeRow, type Metrics } from "@/lib/build-metrics";
import { formatNumber, formatPercent, formatWon } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { EmptyState, Section } from "./primitives";

type RankBy = "ctr" | "cpc";

function CreativeItem({ row, rankBy }: { row: CreativeRow; rankBy: RankBy }) {
  const rank = rankBy === "ctr" ? row.ctrRank : row.cpcRank;
  const off = row.offReasons.length > 0;
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-x-3 py-3.5 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
      <span
        className={cn(
          "tabular row-span-2 flex size-8 items-center justify-center rounded-lg text-t7 font-bold sm:row-span-1",
          rank <= 3 && !off ? "bg-weak-bg text-weak-fg" : "bg-surface text-body",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-t6 font-semibold text-foreground">{row.name}</p>
          {off && (
            <Badge className="h-5 rounded-md bg-warn-bg px-1.5 text-st12 font-semibold text-warn-fg">OFF 후보</Badge>
          )}
        </div>
        <p className="mt-0.5 text-st12 text-subtle">
          {row.id} · {row.format}
          {off && <span className="text-warn-fg"> · {row.offReasons.join(", ")}</span>}
        </p>
      </div>
      <dl className="tabular col-start-2 mt-2 grid grid-cols-3 gap-x-4 text-right text-t7 sm:col-start-3 sm:mt-0 sm:w-72">
        <div>
          <dt className="text-st12 text-subtle">CTR</dt>
          <dd className={cn("font-semibold", rankBy === "ctr" ? "text-foreground" : "text-body")}>
            {formatPercent(row.ctr)}
          </dd>
        </div>
        <div>
          <dt className="text-st12 text-subtle">CPC</dt>
          <dd className={cn("font-semibold", rankBy === "cpc" ? "text-foreground" : "text-body")}>
            {formatWon(row.cpc)}
          </dd>
        </div>
        <div>
          <dt className="text-st12 text-subtle">클릭</dt>
          <dd className="font-semibold text-body">{formatNumber(row.clicks)}</dd>
        </div>
      </dl>
    </li>
  );
}

export function CreativeRanking({ data }: { data: Metrics }) {
  const [rankBy, setRankBy] = useState<RankBy>("ctr");
  const rows = [...data.creatives].sort((a, b) => (rankBy === "ctr" ? a.ctrRank - b.ctrRank : a.cpcRank - b.cpcRank));

  return (
    <Section
      title="메타 소재별 성과"
      description={`노출 1,000회 이상 소재만 · CTR이 소재 평균의 ${OFF_CTR_RATIO * 100}% 미만이거나 CPC가 ${OFF_CPC_RATIO * 100}% 초과면 OFF 후보`}
      action={
        rows.length > 0 && (
          <Tabs value={rankBy} onValueChange={(v) => setRankBy(v as RankBy)}>
            <TabsList aria-label="순위 기준" className="h-9! rounded-lg bg-surface p-0.5">
              {(["ctr", "cpc"] as const).map((k) => (
                <TabsTrigger
                  key={k}
                  value={k}
                  className="h-8 rounded-md px-3 text-t7 font-semibold text-subtle data-active:bg-card! data-active:text-foreground data-active:shadow-none! dark:data-active:border-transparent"
                >
                  {k === "ctr" ? "CTR 순" : "CPC 순"}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState>
          선택한 기간에 소재 데이터가 없어요
        </EmptyState>
      ) : (
        // 정렬 기준을 바꾸면 key로 다시 마운트돼 스크롤이 맨 위로 돌아감
        <ol
          key={rankBy}
          className="-mr-2 max-h-[32rem] divide-y divide-border overflow-y-auto overscroll-contain pr-2 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] hover:[scrollbar-color:var(--subtle)_transparent]"
        >
          {rows.map((row) => (
            <CreativeItem key={row.id} row={row} rankBy={rankBy} />
          ))}
        </ol>
      )}
    </Section>
  );
}
