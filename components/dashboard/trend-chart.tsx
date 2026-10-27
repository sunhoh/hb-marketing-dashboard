"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { Metrics } from "@/lib/data";
import { formatPercent, formatWon, formatWonShort } from "@/lib/metrics";
import { addDays, shortDate } from "@/lib/periods";
import { useIsNarrow, useThemeColors } from "@/lib/use-theme-colors";
import { Section } from "./primitives";

type Point = Metrics["weekly"][number];

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-xl bg-popover px-3.5 py-3 text-t7 text-popover-foreground shadow-lg ring-1 ring-border">
      <p className="mb-1.5 font-semibold">
        {shortDate(p.weekStart)} ~ {shortDate(addDays(p.weekStart, 6))}
        {p.inPeriod && <span className="ml-1.5 text-weak-fg">선택 기간</span>}
      </p>
      <dl className="tabular grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        <dt className="text-muted-foreground">소진액</dt>
        <dd className="text-right font-semibold">{formatWon(p.spend)}</dd>
        <dt className="text-muted-foreground">CTR</dt>
        <dd className="text-right font-semibold">{formatPercent(p.ctr)}</dd>
        <dt className="text-muted-foreground">CPC</dt>
        <dd className="text-right font-semibold">{formatWon(p.cpc)}</dd>
      </dl>
    </div>
  );
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  );
}

export function TrendChart({ data }: { data: Metrics }) {
  const c = useThemeColors();
  const narrow = useIsNarrow();
  const axisTick = { fill: c["--chart-axis"], fontSize: 12 };

  return (
    <Section
      title="주별 추이"
      description={`최근 12주 · 진한 막대가 선택한 기간(${data.periodLabel})`}
    >
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-t7 text-body">
        <LegendItem swatch={<span className="size-2.5 rounded-[3px]" style={{ background: c["--chart-spend"] }} />} label="소진액" />
        <LegendItem
          swatch={
            <svg width="18" height="10" aria-hidden>
              <line x1="0" y1="5" x2="18" y2="5" stroke={c["--chart-ctr"]} strokeWidth="2" />
              <circle cx="9" cy="5" r="3" fill={c["--chart-ctr"]} stroke={c["--card"]} strokeWidth="1.5" />
            </svg>
          }
          label="CTR (오른쪽 % 축)"
        />
        <LegendItem
          swatch={
            <svg width="18" height="10" aria-hidden>
              <line x1="0" y1="5" x2="18" y2="5" stroke={c["--chart-cpc"]} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          }
          label={narrow ? "CPC" : "CPC (오른쪽 ₩ 축)"}
        />
      </div>

      <div className="h-72 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.weekly} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={c["--chart-grid"]} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={shortDate}
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: c["--chart-grid"] }}
              interval={narrow ? 2 : 0}
              tickMargin={8}
            />
            <YAxis
              yAxisId="spend"
              tickFormatter={formatWonShort}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={narrow ? 48 : 60}
            />
            <YAxis
              yAxisId="ctr"
              orientation="right"
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={narrow ? 36 : 44}
              domain={[0, "auto"]}
            />
            <YAxis
              yAxisId="cpc"
              orientation="right"
              hide={narrow}
              tickFormatter={(v: number) => formatWonShort(v)}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={ChartTooltip}
              cursor={{ fill: c["--chart-grid"], fillOpacity: 0.5 }}
              isAnimationActive={false}
            />
            <Bar yAxisId="spend" dataKey="spend" name="소진액" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              {data.weekly.map((w) => (
                <Cell key={w.weekStart} fill={w.inPeriod ? c["--chart-spend"] : c["--chart-spend-dim"]} />
              ))}
            </Bar>
            <Line
              yAxisId="ctr"
              dataKey="ctr"
              name="CTR"
              type="monotone"
              stroke={c["--chart-ctr"]}
              strokeWidth={2}
              dot={{ r: 3.5, fill: c["--chart-ctr"], stroke: c["--card"], strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: c["--card"], strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="cpc"
              dataKey="cpc"
              name="CPC"
              type="monotone"
              stroke={c["--chart-cpc"]}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 5, stroke: c["--card"], strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}
