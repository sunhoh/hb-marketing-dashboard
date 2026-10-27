"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLATFORM_LABELS } from "@/lib/clients";
import type { Metrics } from "@/lib/build-metrics";
import { changeRate, EMPTY, formatNumber } from "@/lib/metrics";
import { shortDate } from "@/lib/periods";
import { useThemeColors } from "@/lib/use-theme-colors";
import { CountDelta, Delta, EmptyState, Section } from "./primitives";

function Stat({ label, value, delta }: { label: string; value: string; delta: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface px-3.5 py-3">
      <p className="text-st12 text-subtle">{label}</p>
      <p className="tabular mt-0.5 truncate text-t4 font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-st12">{delta}</p>
    </div>
  );
}

function PlaceCard({ place, compareLabel }: { place: NonNullable<Metrics["organic"]["place"]>; compareLabel: string }) {
  const c = useThemeColors();
  const lineColors = [c["--chart-spend"], c["--chart-ctr"], c["--chart-cpc"], c["--chart-4"]];
  const prev = place.previous;
  return (
    <Section title="네이버 플레이스" description={`GU일산 · 기간 마지막 주 기준, ${compareLabel}`}>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="리뷰 수"
          value={formatNumber(place.current.reviews)}
          delta={<CountDelta value={prev ? place.current.reviews - prev.reviews : null} />}
        />
        <Stat
          label="평점"
          value={place.current.rating.toFixed(2)}
          delta={
            prev ? (
              <CountDeltaDecimal value={place.current.rating - prev.rating} />
            ) : (
              <span className="text-muted-foreground">{EMPTY}</span>
            )
          }
        />
        <Stat
          label="저장 수"
          value={formatNumber(place.current.saves)}
          delta={<CountDelta value={prev ? place.current.saves - prev.saves : null} />}
        />
      </div>

      <h3 className="mt-5 mb-2 text-t7 font-semibold text-body">키워드 순위 (최근 12주, 위로 갈수록 상위)</h3>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={place.rankTrend} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={c["--chart-grid"]} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={shortDate}
              tick={{ fill: c["--chart-axis"], fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: c["--chart-grid"] }}
              interval={3}
            />
            <YAxis
              reversed
              domain={[1, "dataMax"]}
              allowDecimals={false}
              tickFormatter={(v: number) => `${v}위`}
              tick={{ fill: c["--chart-axis"], fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(l) => `${shortDate(String(l))} 주`}
              formatter={(v, name) => [`${v}위`, name]}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 13,
                color: "var(--popover-foreground)",
              }}
              itemSorter={(item) => Number(item.value)}
            />
            {place.keywords.map((k, i) => (
              <Line
                key={k.keyword}
                dataKey={k.keyword}
                stroke={lineColors[i % lineColors.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: c["--card"], strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 text-t7 sm:grid-cols-2">
        {place.keywords.map((k, i) => (
          <li key={k.keyword} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: lineColors[i % lineColors.length] }} />
              <span className="truncate text-body">{k.keyword}</span>
            </span>
            <span className="tabular flex shrink-0 items-center gap-1.5">
              <span className="font-bold text-foreground">{k.rank ?? EMPTY}위</span>
              <CountDelta
                className="text-st12"
                value={k.rank !== null && k.previousRank !== null ? k.previousRank - k.rank : null}
              />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CountDeltaDecimal({ value }: { value: number }) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return <span className="font-semibold text-muted-foreground">변동 없음</span>;
  return (
    <span className={rounded > 0 ? "font-semibold text-good" : "font-semibold text-bad"}>
      {rounded > 0 ? "▲" : "▼"} {Math.abs(rounded).toFixed(2)}
    </span>
  );
}

function ViralCard({ viral }: { viral: NonNullable<Metrics["organic"]["viral"]> }) {
  return (
    <Section title="바이럴" description="블로그·카페 발행과 상위노출 키워드">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="발행 수"
          value={`${formatNumber(viral.current.published)}건`}
          delta={<Delta metric="clicks" rate={changeRate(viral.current.published, viral.previous.published)} />}
        />
        <Stat
          label="상위노출 키워드"
          value={`${formatNumber(viral.current.topKeywords)}개`}
          delta={<Delta metric="clicks" rate={changeRate(viral.current.topKeywords, viral.previous.topKeywords)} />}
        />
      </div>
    </Section>
  );
}

function SnsCard({ sns }: { sns: Metrics["organic"]["sns"] }) {
  return (
    <Section title="SNS" description="기간 말 팔로워·구독자와 기간 내 조회수">
      <ul className="divide-y divide-border">
        {sns.map((s) => (
          <li key={`${s.client}-${s.platform}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
            <div className="min-w-0">
              <p className="text-t6 font-semibold text-foreground">{PLATFORM_LABELS[s.platform]}</p>
            </div>
            <dl className="tabular grid grid-cols-2 gap-x-5 text-right text-t7">
              <div>
                <dt className="text-st12 text-subtle">{s.platform === "youtube" ? "구독자" : "팔로워"}</dt>
                <dd className="font-semibold text-foreground">
                  {formatNumber(s.followers)}
                  {s.followerChange !== null && <> <CountDelta className="text-st12" value={s.followerChange} /></>}
                </dd>
              </div>
              <div>
                <dt className="text-st12 text-subtle">조회수</dt>
                <dd className="font-semibold text-foreground">
                  {formatNumber(s.views)}
                  {s.views !== null && s.previousViews !== null && (
                    <>
                      {" "}
                      <Delta className="text-st12" metric="impressions" rate={changeRate(s.views, s.previousViews)} />
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function OrganicSection({ data }: { data: Metrics }) {
  const { place, viral, sns } = data.organic;
  const empty = !place && !viral && sns.length === 0;

  return (
    <div className="min-w-0">
      <h2 className="mb-3 px-1 text-t4 font-bold text-foreground">오가닉 · 플레이스</h2>
      {empty ? (
        <div className="rounded-card bg-card p-5">
          <EmptyState>
            {data.client === "cellora" ? "이 클라이언트는 오가닉 채널 데이터가 없어요" : "선택한 기간에 오가닉 데이터가 없어요"}
          </EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          {place && <PlaceCard place={place} compareLabel={data.compareLabel} />}
          {viral && <ViralCard viral={viral} />}
          {sns.length > 0 && <SnsCard sns={sns} />}
        </div>
      )}
    </div>
  );
}
