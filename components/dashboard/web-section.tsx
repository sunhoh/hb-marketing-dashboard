import type { Metrics } from "@/lib/build-metrics";
import { changeRate, formatNumber, formatPercent } from "@/lib/metrics";
import { Delta, Section } from "./primitives";

function Stat({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface px-3.5 py-3">
      <p className="text-st12 text-subtle">{label}</p>
      <p className="tabular mt-0.5 truncate text-t4 font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-st12">{delta}</p>
    </div>
  );
}

/** GA4 — 광고·검색으로 들어온 사람이 홈페이지에서 한 일 */
export function WebSection({ web, compareLabel }: { web: NonNullable<Metrics["web"]>; compareLabel: string }) {
  const { current, previous } = web;
  return (
    <Section
      title="홈페이지 유입 (GA4)"
      description={
        <>
          전환 = {web.conversionEvents.length ? web.conversionEvents.join(" · ") : "정해진 이벤트 없음"} · 매체 전환과 같은 예약이
          겹칠 수 있어 더하지 않아요
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="세션"
          value={formatNumber(current.sessions)}
          delta={<Delta rate={changeRate(current.sessions, previous.sessions)} />}
        />
        <Stat
          label="전환"
          value={formatNumber(current.conversions)}
          delta={<Delta rate={changeRate(current.conversions, previous.conversions)} />}
        />
        <Stat
          label="전환율"
          value={formatPercent(current.rate)}
          delta={<Delta rate={changeRate(current.rate, previous.rate)} />}
        />
      </div>
      <p className="mt-2 px-1 text-st12 text-subtle">{compareLabel}</p>

      <div className="-mx-5 mt-3 overflow-x-auto sm:-mx-6">
        <table className="tabular w-full min-w-[560px] text-t7">
          <thead>
            <tr className="border-b border-border text-left text-st12 font-semibold text-subtle">
              <th className="h-10 pr-3 pl-5 font-semibold sm:pl-6">유입 경로</th>
              <th className="px-3 text-right font-semibold">세션</th>
              <th className="px-3 text-right font-semibold">비중</th>
              <th className="px-3 text-right font-semibold">전환</th>
              <th className="pr-5 pl-3 text-right font-semibold sm:pr-6">전환율</th>
            </tr>
          </thead>
          <tbody>
            {web.sources.map((s) => (
              <tr key={s.label} className="border-b border-border last:border-0">
                <td className="h-11 pr-3 pl-5 sm:pl-6" title={s.raw.join(", ")}>
                  <span className="font-semibold text-foreground">{s.label}</span>
                  {s.raw.length === 1 && s.raw[0] !== s.label && (
                    <span className="ml-1.5 text-st12 text-subtle">{s.raw[0]}</span>
                  )}
                </td>
                <td className="px-3 text-right text-body">
                  {formatNumber(s.sessions)}{" "}
                  <Delta className="text-st12" rate={changeRate(s.sessions, s.previousSessions)} />
                </td>
                <td className="px-3 text-right text-body">{formatPercent(s.share)}</td>
                <td className="px-3 text-right text-body">{formatNumber(s.conversions)}</td>
                <td className="pr-5 pl-3 text-right text-body sm:pr-6">{formatPercent(s.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
