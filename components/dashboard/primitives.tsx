import { cn } from "@/lib/utils";
import { EMPTY } from "@/lib/metrics";

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

/** 증권식 색: 상승 빨강, 하락 파랑. 지표가 좋아졌는지와는 무관하게 방향만 나타낸다(팀 결정 2026-10-28) */
export function directionClass(value: number) {
  return value > 0 ? "text-up" : value < 0 ? "text-down" : "text-muted-foreground";
}

/** 증감률 표시 */
export function Delta({ rate, className }: { rate: number | null; className?: string }) {
  if (rate === null) return <span className={cn("text-muted-foreground", className)}>{EMPTY}</span>;
  const flat = Math.abs(rate) < 0.05;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", directionClass(flat ? 0 : rate), className)}>
      {!flat && <span aria-hidden>{rate > 0 ? "▲" : "▼"}</span>}
      <span className="sr-only">{flat ? "변화 없음" : rate > 0 ? "증가" : "감소"}</span>
      {flat ? "0.0" : Math.abs(rate).toFixed(1)}%
    </span>
  );
}

/** 정수 증감(팔로워·리뷰 수 등). 순위는 호출하는 쪽에서 '올라간 만큼'을 양수로 넘긴다 */
export function CountDelta({ value, unit = "", className }: { value: number | null; unit?: string; className?: string }) {
  if (value === null) return <span className={cn("text-muted-foreground", className)}>{EMPTY}</span>;
  if (value === 0) return <span className={cn("font-semibold text-muted-foreground", className)}>변동 없음</span>;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 font-semibold", directionClass(value), className)}>
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
