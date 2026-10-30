"use client";

import {
  createExpandedRowModel,
  createSortedRowModel,
  metaHelper,
  rowExpandingFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortFn,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BASELINE_TOLERANCE,
  BASELINE_WEEKS,
  type ChannelRow,
  type Metrics,
} from "@/lib/build-metrics";
import { EMPTY, formatNumber, formatPercent, formatWon } from "@/lib/metrics";
import { type TableView, useTableView } from "@/lib/use-preferences";
import { cn } from "@/lib/utils";
import { EmptyState, Section } from "./primitives";

/** 같은 채널·세부의 직전 12주보다 BASELINE_TOLERANCE 이상 나쁜 칸 */
function isWorse(row: ChannelRow, key: "ctr" | "cpc" | "cpm") {
  const v = row[key];
  const base = row.baseline[key];
  if (v === null || base === null) return false;
  return key === "ctr"
    ? v < base * (1 - BASELINE_TOLERANCE)
    : v > base * (1 + BASELINE_TOLERANCE);
}

type ColumnMeta = { numeric?: boolean; flag?: "ctr" | "cpc" | "cpm" };
type NumericKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "conversions"
  | "ctr"
  | "cpc"
  | "cpm"
  | "landingVisits"
  | "arrivalRate"
  | "costPerVisit";

const VIEWS: { value: TableView; label: string }[] = [
  { value: "campaign", label: "캠페인별" },
  { value: "country", label: "국가별" },
];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
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

/**
 * 도착률이 이보다 낮으면 실제로 안 들어온 게 아니라 UTM 이 짝지어지지 않은 것(이름으로 직접 쓴 UTM 등).
 * 정상 캠페인은 30~80% 정도라서 숫자 대신 "UTM 확인"을 보여 준다.
 */
const UTM_SUSPECT_RATE = 5;
const utmSuspect = (r: ChannelRow) =>
  r.arrivalRate !== null && r.arrivalRate < UTM_SUSPECT_RATE;

/** 캠페인 이름 옆: 광고 계정(계정이 여럿일 때만), 꺼짐 */
function CampaignTags({
  row,
  showAccount,
}: {
  row: ChannelRow;
  showAccount: boolean;
}) {
  return (
    <>
      {showAccount && row.account && (
        <span className="ml-1.5 shrink-0 text-st12 font-normal whitespace-nowrap text-subtle">
          {row.account}
        </span>
      )}
      {row.active === false && (
        <span className="ml-1.5 inline-flex h-5 shrink-0 items-center rounded-md bg-surface px-1.5 align-middle text-st12 font-semibold text-subtle">
          꺼짐
        </span>
      )}
    </>
  );
}

export function ChannelTable({ data }: { data: Metrics }) {
  const [view, setView] = useTableView();
  const rows = view === "campaign" ? data.campaigns : data.channels;
  // 메타 계정이 여럿인 클라이언트(GU강남)만 캠페인 옆에 계정 이름을 붙인다
  const showAccount =
    new Set(data.campaigns.map((r) => r.account).filter(Boolean)).size > 1;
  // 랜딩 방문 칸은 캠페인별 보기에서, 랜딩 GA4 가 연결된 클라이언트만(국가별은 GA4 국가와 기준이 달라 뺀다)
  const showLanding = view === "campaign" && data.landing !== null;

  const columns = useMemo<Col[]>(() => {
    const num = (
      key: NumericKey,
      header: string,
      format: (v: number | null) => string,
    ): Col => ({
      id: key,
      accessorFn: (r) => r[key],
      header,
      sortFn: numericSort,
      sortDescFirst: true,
      cell: ({ row }) => format(row.original[key]),
      meta: {
        numeric: true,
        flag: key === "ctr" || key === "cpc" || key === "cpm" ? key : undefined,
      },
    });
    const landingCols: Col[] = showLanding
      ? [
          {
            ...num("landingVisits", "랜딩 방문", formatNumber),
            cell: ({ row }) =>
              utmSuspect(row.original) ? (
                <span
                  className="rounded-sm bg-warn-bg px-1 text-st12 font-semibold text-warn-fg"
                  title={`랜딩 방문 ${formatNumber(row.original.landingVisits)}건 · 클릭에 비해 너무 적어요. 광고 링크 UTM 이 캠페인 ID 로 들어갔는지 확인해 주세요`}
                >
                  UTM 확인
                </span>
              ) : (
                formatNumber(row.original.landingVisits)
              ),
          },
          {
            ...num("arrivalRate", "도착률", (v) => formatPercent(v)),
            cell: ({ row }) =>
              utmSuspect(row.original)
                ? EMPTY
                : formatPercent(row.original.arrivalRate),
          },
          {
            ...num("costPerVisit", "방문당 비용", formatWon),
            cell: ({ row }) =>
              utmSuspect(row.original)
                ? EMPTY
                : formatWon(row.original.costPerVisit),
          },
        ]
      : [];
    return [
      {
        id: "channel",
        accessorFn: (r) => `${r.channelLabel} ${r.segment ?? ""}`,
        header: "채널 · 세부",
        sortFn: "text",
        cell: ({ row }) => {
          const r = row.original;
          if (row.depth > 0)
            return (
              <span className="flex items-center pl-7 text-body">
                <span className="max-w-[320px] truncate" title={r.segment}>
                  {r.segment}
                </span>
                <CampaignTags row={r} showAccount={showAccount} />
              </span>
            );
          const expanded = row.getIsExpanded();
          return (
            <span className="flex items-center gap-1">
              {row.getCanExpand() ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={expanded ? "접기" : "펼치기"}
                  onClick={(e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  }}
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-subtle outline-none hover:bg-surface hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-4 transition-transform",
                      expanded && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                <span className="size-6 shrink-0" />
              )}
              <span className="flex min-w-0 items-center font-semibold whitespace-nowrap text-foreground">
                {r.channelLabel}
                {r.segment && (
                  <span
                    className="ml-1 max-w-[320px] truncate font-normal text-body"
                    title={r.segment}
                  >
                    · {r.segment}
                  </span>
                )}
                <CampaignTags row={r} showAccount={showAccount} />
              </span>
            </span>
          );
        },
      },
      num("spend", "소진액", formatWon),
      num("impressions", "노출", formatNumber),
      num("clicks", "클릭", formatNumber),
      ...landingCols,
      num("ctr", "CTR", (v) => formatPercent(v)),
      num("cpc", "CPC", formatWon),
      num("cpm", "CPM", formatWon),
      {
        ...num("conversions", "매체 전환", formatNumber),
        cell: ({ row }) => (
          <span title={row.original.conversionLabel}>
            {formatNumber(row.original.conversions)}
            <span className="ml-1 text-st12 text-subtle">
              {row.original.conversionLabel}
            </span>
          </span>
        ),
      },
    ];
  }, [showAccount, showLanding]);

  const table = useTable({
    features,
    columns,
    data: rows,
    getSubRows: (r) => r.subRows,
    initialState: { sorting: [{ id: "spend", desc: true }] },
  });

  return (
    <Section
      title="채널별 효율"
      action={
        <Tabs value={view} onValueChange={(v) => setView(v as TableView)}>
          <TabsList
            aria-label="묶는 기준"
            className="h-9! rounded-xl bg-surface p-1"
          >
            {VIEWS.map((v) => (
              <TabsTrigger
                key={v.value}
                value={v.value}
                className="h-7 cursor-pointer rounded-lg px-3 text-st12 font-semibold text-subtle data-active:bg-card! data-active:text-foreground data-active:shadow-none! dark:data-active:border-transparent"
              >
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      description={
        <>
          {view === "campaign"
            ? "캠페인을 누르면 소재(네이버는 광고그룹)별로 펼쳐져요"
            : "메타 국가를 누르면 캠페인별로 펼쳐져요"}{" "}
          · 머리글을 누르면 정렬돼요 ·{" "}
          <span className="rounded-sm bg-warn-bg px-1 text-warn-fg">
            주황 칸
          </span>{" "}
          은 같은 행의 직전 {BASELINE_WEEKS}주보다 {BASELINE_TOLERANCE * 100}%
          이상 나쁜 값{showLanding && " · 도착률 = 랜딩 방문 ÷ 클릭"}
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>선택한 기간에 매체 데이터가 없어요</EmptyState>
      ) : (
        <div className="-mx-5 sm:-mx-6">
          <Table className="tabular text-t7">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow
                  key={hg.id}
                  className="border-border hover:bg-transparent"
                >
                  {hg.headers.map((h, i) => {
                    const numeric = h.column.columnDef.meta?.numeric;
                    const sorted = h.column.getIsSorted();
                    return (
                      <TableHead
                        key={h.id}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                        }
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
                <TableRow
                  key={row.id}
                  onClick={
                    row.getCanExpand() ? () => row.toggleExpanded() : undefined
                  }
                  className={cn(
                    "border-border hover:bg-surface/60",
                    row.getCanExpand() && "cursor-pointer",
                    row.depth > 0 && "bg-surface/40 text-t7",
                  )}
                >
                  {row.getAllCells().map((cell, i, cells) => {
                    const meta = cell.column.columnDef.meta;
                    const worse = meta?.flag
                      ? isWorse(row.original, meta.flag)
                      : false;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "h-12 px-3 text-body",
                          i === 0 && "pl-5 sm:pl-6",
                          i === cells.length - 1 && "pr-5 sm:pr-6",
                          meta?.numeric && "text-right",
                          worse && "bg-warn-bg font-semibold text-warn-fg",
                        )}
                        title={
                          worse
                            ? `직전 ${BASELINE_WEEKS}주보다 ${BASELINE_TOLERANCE * 100}% 이상 나쁨`
                            : undefined
                        }
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
      {showLanding && data.landing!.unmatched > 0 && (
        <p className="mt-3 text-st12 text-subtle">
          캠페인과 연결하지 못한 랜딩 방문{" "}
          <span className="tabular font-semibold text-body">
            {formatNumber(data.landing!.unmatched)}
          </span>
          건 (전체 {formatNumber(data.landing!.total)}건) · 광고 링크의 UTM 이
          캠페인 ID 가 아니라 이름 등으로 들어간 방문이에요
        </p>
      )}
    </Section>
  );
}
