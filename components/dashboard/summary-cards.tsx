import type { Metrics } from "@/lib/build-metrics";
import { changeRate, formatNumber, formatPercent, formatWon, type MetricKey } from "@/lib/metrics";
import { Delta } from "./primitives";

type CardDef = { key: MetricKey; label: string; format: (v: number | null) => string; hint?: string };

export function SummaryCards({ data }: { data: Metrics }) {
  const cards: CardDef[] = [
    { key: "spend", label: "소진액", format: formatWon },
    { key: "impressions", label: "노출", format: formatNumber },
    { key: "clicks", label: "클릭", format: formatNumber },
    { key: "ctr", label: "CTR", format: (v) => formatPercent(v), hint: "클릭 ÷ 노출" },
    { key: "cpc", label: "CPC", format: formatWon, hint: "낮을수록 좋음" },
    { key: "cpm", label: "CPM", format: formatWon, hint: "낮을수록 좋음" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => {
        const current = data.summary[c.key];
        const previous = data.summaryPrevious[c.key];
        return (
          <article key={c.key} className="min-w-0 rounded-card bg-card p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-t6 font-semibold text-body">{c.label}</h3>
              {c.hint && <span className="text-st12 text-subtle">{c.hint}</span>}
            </div>
            <p className="tabular mt-1.5 truncate text-t2 font-bold tracking-tight text-foreground">
              {c.format(current)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-t7">
              <span className="text-subtle">{data.compareLabel}</span>
              <Delta rate={changeRate(current, previous)} />
              <span className="tabular text-subtle">· 이전 {c.format(previous)}</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
