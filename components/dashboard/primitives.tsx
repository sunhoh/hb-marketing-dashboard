import { cn } from "@/lib/utils";
import { changeTone, EMPTY, type MetricKey } from "@/lib/metrics";

export function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-card bg-card p-5 sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-t5 font-bold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-t7 text-subtle">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const TONE_CLASS = {
  good: "text-good",
  bad: "text-bad",
  neutral: "text-muted-foreground",
} as const;

/** 증감률 표시. 비용 지표는 내려갈수록 좋은 색 */
export function Delta({
  metric,
  rate,
  className,
}: {
  metric: MetricKey;
  rate: number | null;
  className?: string;
}) {
  if (rate === null) return <span className={cn("text-muted-foreground", className)}>{EMPTY}</span>;
  const tone = changeTone(metric, rate);
  const flat = Math.abs(rate) < 0.05;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", TONE_CLASS[tone], className)}>
      {!flat && <span aria-hidden>{rate > 0 ? "▲" : "▼"}</span>}
      <span className="sr-only">{flat ? "변화 없음" : rate > 0 ? "증가" : "감소"}</span>
      {flat ? "0.0" : Math.abs(rate).toFixed(1)}%
    </span>
  );
}

/** 정수 증감(팔로워·리뷰 수 등). lowerIsBetter 는 순위처럼 숫자가 작을수록 좋은 값 */
export function CountDelta({
  value,
  unit = "",
  lowerIsBetter = false,
  className,
}: {
  value: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  if (value === null) return <span className={cn("text-muted-foreground", className)}>{EMPTY}</span>;
  if (value === 0) return <span className={cn("font-semibold text-muted-foreground", className)}>변동 없음</span>;
  const tone = value === 0 ? "neutral" : value > 0 !== lowerIsBetter ? "good" : "bad";
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", TONE_CLASS[tone], className)}>
      <span aria-hidden>{value > 0 ? "▲" : "▼"}</span>
      {Math.abs(value).toLocaleString("ko-KR")}
      {unit}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl bg-surface px-4 py-6 text-center text-t7 text-muted-foreground">
      {children}
    </div>
  );
}
