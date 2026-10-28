"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PLATFORM_LABELS } from "@/lib/clients";
import type { Metrics } from "@/lib/build-metrics";
import { changeRate, EMPTY, formatCountShort, formatNumber } from "@/lib/metrics";
import { shortDate } from "@/lib/periods";
import { useThemeColors } from "@/lib/use-theme-colors";
import { CountDelta, Delta, directionClass, EmptyState, Section } from "./primitives";

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
    <span className={`font-semibold ${directionClass(rounded)}`}>
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
          delta={<Delta rate={changeRate(viral.current.published, viral.previous.published)} />}
        />
        <Stat
          label="상위노출 키워드"
          value={`${formatNumber(viral.current.topKeywords)}개`}
          delta={<Delta rate={changeRate(viral.current.topKeywords, viral.previous.topKeywords)} />}
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
                      <Delta className="text-st12" rate={changeRate(s.views, s.previousViews)} />
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

function YoutubeCard({ youtube, compareLabel }: { youtube: NonNullable<Metrics["organic"]["youtube"]>; compareLabel: string }) {
  return (
    <Section title="유튜브 영상" description={`기간 내 업로드 · ${compareLabel} · 누적 조회수 순`}>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="업로드"
          value={`${formatNumber(youtube.uploads)}개`}
          delta={<CountDelta value={youtube.uploads - youtube.previousUploads} unit="개" />}
        />
        <Stat label="그중 쇼츠" value={`${formatNumber(youtube.shorts)}개`} delta={<span className="text-subtle">3분 이하 영상</span>} />
      </div>
      {youtube.top.length === 0 ? (
        <div className="mt-3">
          <EmptyState>이 기간에 올린 영상이 없어요</EmptyState>
        </div>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {youtube.top.map((v, i) => (
            <li key={v.id} className="flex items-start gap-3 py-2.5">
              <span className="tabular w-4 shrink-0 pt-0.5 text-t7 font-bold text-subtle">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`https://youtu.be/${v.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-t7 font-semibold text-foreground hover:underline"
                >
                  {v.title}
                </a>
                <p className="tabular mt-0.5 text-st12 text-subtle">
                  {shortDate(v.publishedOn)}
                  {v.isShort && " · 쇼츠"}
                  {v.likes !== null && ` · 좋아요 ${formatNumber(v.likes)}`}
                  {v.comments !== null && ` · 댓글 ${formatNumber(v.comments)}`}
                </p>
              </div>
              <span className="tabular shrink-0 pt-0.5 text-t7 font-bold text-foreground">{formatNumber(v.views)}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function SearchCard({ search, compareLabel }: { search: NonNullable<Metrics["organic"]["search"]>; compareLabel: string }) {
  const { current, previous } = search;
  return (
    <Section title="구글 검색" description={`서치 콘솔 · ${compareLabel}`}>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="클릭"
          value={formatNumber(current.clicks)}
          delta={<Delta rate={changeRate(current.clicks, previous.clicks)} />}
        />
        <Stat
          label="노출"
          value={formatCountShort(current.impressions)}
          delta={<Delta rate={changeRate(current.impressions, previous.impressions)} />}
        />
        <Stat
          label="평균 순위"
          value={current.position === null ? EMPTY : `${current.position.toFixed(1)}위`}
          delta={
            current.position !== null && previous.position !== null ? (
              <CountDeltaDecimal value={previous.position - current.position} />
            ) : (
              <span className="text-muted-foreground">{EMPTY}</span>
            )
          }
        />
      </div>
      <h3 className="mt-5 mb-1 text-t7 font-semibold text-body">검색어 TOP {search.queries.length} (클릭 순)</h3>
      {search.queries.length === 0 ? (
        <EmptyState>이 기간 검색어 데이터가 없어요</EmptyState>
      ) : (
        <ol className="divide-y divide-border">
          {search.queries.map((q) => (
            <li key={q.query} className="flex items-center justify-between gap-3 py-2 text-t7">
              <span className="min-w-0 truncate text-body">{q.query}</span>
              <span className="tabular shrink-0 text-subtle">
                <b className="text-foreground">{formatNumber(q.clicks)}</b> 클릭 · {q.position === null ? EMPTY : `${q.position.toFixed(1)}위`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function OrganicSection({ data }: { data: Metrics }) {
  const { place, viral, sns, youtube, search } = data.organic;
  const empty = !place && !viral && sns.length === 0 && !youtube && !search;

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
          {search && <SearchCard search={search} compareLabel={data.compareLabel} />}
          {youtube && <YoutubeCard youtube={youtube} compareLabel={data.compareLabel} />}
        </div>
      )}
    </div>
  );
}
