"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLIENTS } from "@/lib/clients";
import { PERIODS, isPeriodKey } from "@/lib/periods";
import type { ClientFilter, PeriodKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const CLIENT_OPTIONS: { value: ClientFilter; label: string; href: string }[] = [
  { value: "all", label: "전체", href: "/" },
  ...CLIENTS.map((c) => ({ value: c.slug, label: c.name, href: `/clients/${c.slug}` })),
];

export function FilterBar({
  client,
  period,
  onClientSelect,
  onPeriodChange,
}: {
  client: ClientFilter;
  period: PeriodKey;
  onClientSelect: (client: ClientFilter) => void;
  onPeriodChange: (period: PeriodKey) => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label="클라이언트" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {CLIENT_OPTIONS.map((o) => {
          const active = o.value === client;
          return (
            <Link
              key={o.value}
              href={o.href}
              aria-current={active ? "page" : undefined}
              onClick={() => onClientSelect(o.value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-lg px-3 sm:px-3.5 text-t6 font-semibold transition-[background-color,color,transform] outline-none active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring",
                active
                  ? "bg-weak-bg text-weak-fg"
                  : "bg-card text-body hover:bg-surface",
              )}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>

      <Tabs value={period} onValueChange={(v) => isPeriodKey(v) && onPeriodChange(v)}>
        <TabsList
          aria-label="기간"
          className="h-10! w-full rounded-xl bg-card p-1 sm:w-auto"
        >
          {PERIODS.map((p) => (
            <TabsTrigger
              key={p.key}
              value={p.key}
              className="h-8 rounded-lg px-3.5 text-t7 font-semibold text-subtle data-active:bg-surface! data-active:text-foreground data-active:shadow-none! dark:data-active:border-transparent"
            >
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
