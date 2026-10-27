"use client";

import {
  createSortedRowModel,
  metaHelper,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortFn,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BASELINE_TOLERANCE, type ChannelRow, type Metrics } from "@/lib/build-metrics";
import { formatNumber, formatPercent, formatWon } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import { EmptyState, Section } from "./primitives";

/** 같은 클라이언트의 기간 전체 값보다 BASELINE_TOLERANCE 이상 나쁜 칸 */
function isWorse(row: ChannelRow, key: "ctr" | "cpc" | "cpm") {
  const v = row[key];
  const base = row.baseline[key];
  if (v === null || base === null) return false;
  return key === "ctr" ? v < base * (1 - BASELINE_TOLERANCE) : v > base * (1 + BASELINE_TOLERANCE);
}

type ColumnMeta = { numeric?: boolean; flag?: "ctr" | "cpc" | "cpm" };
type NumericKey = "spend" | "impressions" | "clicks" | "conversions" | "ctr" | "cpc" | "cpm";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
  columnMeta: metaHelper<ColumnMeta>(),
});
type Col = ColumnDef<typeof features, ChannelRow, unknown>;

/** 값 없음(—)은 오름·내림 어느 쪽이든 아래로 */
const numericSort: SortFn<typeof features, ChannelRow> = (a, b, id) => {
  const x = a.original[id as NumericKey];
  const y = b.original[id as NumericKey];
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
};

export function ChannelTable({ data, showClient }: { data: Metrics; showClient: boolean }) {
  const columns = useMemo<Col[]>(() => {
    const num = (key: NumericKey, header: string, format: (v: number | null) => string): Col => ({
      id: key,
      accessorFn: (r) => r[key],
      header,
      sortFn: numericSort,
      sortDescFirst: true,
      cell: ({ row }) => format(row.original[key]),
      meta: { numeric: true, flag: key === "ctr" || key === "cpc" || key === "cpm" ? key : undefined },
    });
    return [
      ...(showClient
        ? [{ id: "client", accessorFn: (r) => r.clientName, header: "클라이언트", sortFn: "text" } satisfies Col]
        : []),
      {
        id: "channel",
        accessorFn: (r) => `${r.channelLabel} ${r.segment ?? ""}`,
        header: "채널 · 국가",
        sortFn: "text",
        cell: ({ row }) => (
          <span className="font-semibold text-foreground">
            {row.original.channelLabel}
            {row.original.segment && <span className="font-normal text-body"> · {row.original.segment}</span>}
          </span>
        ),
      },
      num("spend", "소진액", formatWon),
      {
        ...num("impressions", "노출", formatNumber),
        cell: ({ row }) => (
          <>
            {formatNumber(row.original.impressions)}
            {row.original.channel === "kakao-sms" && <span className="ml-1 text-st12 text-subtle">발송</span>}
          </>
        ),
      },
      num("clicks", "클릭", formatNumber),
      num("ctr", "CTR", (v) => formatPercent(v)),
      num("cpc", "CPC", formatWon),
      num("cpm", "CPM", formatWon),
      {
        ...num("conversions", "매체 전환", formatNumber),
        cell: ({ row }) => (
          <span title={row.original.conversionLabel}>
            {formatNumber(row.original.conversions)}
            <span className="ml-1 text-st12 text-subtle">{row.original.conversionLabel}</span>
          </span>
        ),
      },
    ];
  }, [showClient]);

  const table = useTable({
    features,
    columns,
    data: data.channels,
    initialState: { sorting: [{ id: "spend", desc: true }] },
  });

  return (
    <Section
      title="채널·국가별 효율"
      description={
        <>
          머리글을 누르면 정렬돼요 ·{" "}
          <span className="rounded-sm bg-bad-bg px-1 text-bad">빨간 칸</span> 은 같은 클라이언트 전체보다{" "}
          {BASELINE_TOLERANCE * 100}% 이상 나쁜 값
        </>
      }
    >
      {data.channels.length === 0 ? (
        <EmptyState>선택한 기간에 매체 데이터가 없어요</EmptyState>
      ) : (
        <div className="-mx-5 sm:-mx-6">
          <Table className="tabular text-t7">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-border hover:bg-transparent">
                  {hg.headers.map((h, i) => {
                    const numeric = h.column.columnDef.meta?.numeric;
                    const sorted = h.column.getIsSorted();
                    return (
                      <TableHead
                        key={h.id}
                        aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                        className={cn(
                          "h-10 px-3 text-st12 font-semibold text-subtle",
                          i === 0 && "pl-5 sm:pl-6",
                          i === hg.headers.length - 1 && "pr-5 sm:pr-6",
                          numeric && "text-right",
                        )}
                      >
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring",
                            numeric && "flex-row-reverse",
                            sorted && "text-foreground",
                          )}
                        >
                          <table.FlexRender header={h} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-border hover:bg-surface/60">
                  {row.getAllCells().map((cell, i, cells) => {
                    const meta = cell.column.columnDef.meta;
                    const worse = meta?.flag ? isWorse(row.original, meta.flag) : false;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "h-12 px-3 text-body",
                          i === 0 && "pl-5 sm:pl-6",
                          i === cells.length - 1 && "pr-5 sm:pr-6",
                          meta?.numeric && "text-right",
                          worse && "bg-bad-bg font-semibold text-bad",
                        )}
                        title={worse ? "같은 클라이언트 전체 평균보다 나쁨" : undefined}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
