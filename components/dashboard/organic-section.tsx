"use client";

import type { Metrics } from "@/lib/build-metrics";
import { PLATFORM_LABELS } from "@/lib/clients";
import {
  changeRate,
  EMPTY,
  formatCountShort,
  formatNumber,
} from "@/lib/metrics";
import { shortDate } from "@/lib/periods";
import type { SnsStat } from "@/lib/types";
import {
  CountDelta,
  Delta,
  directionClass,
  EmptyState,
  Section,
} from "./primitives";

type SnsPlatform = SnsStat["platform"];

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-surface px-3.5 py-3">
      <p className="text-st12 text-subtle">{label}</p>
      <p className="tabular mt-0.5 truncate text-t4 font-bold text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-st12">{delta}</p>
    </div>
  );
}

function CountDeltaDecimal({ value }: { value: number }) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0)
    return (
      <span className="font-semibold text-muted-foreground">변동 없음</span>
    );
  return (
    <span className={`font-semibold ${directionClass(rounded)}`}>
      {rounded > 0 ? "▲" : "▼"} {Math.abs(rounded).toFixed(2)}
    </span>
  );
}

/** 계정 핸들 → 프로필 주소. 핸들을 모르면(시트 입력) 플랫폼 첫 화면 */
function profileUrl(platform: SnsPlatform, account: string | null) {
  const handle = account?.replace(/^@/, "");
  if (platform === "instagram")
    return `https://www.instagram.com/${handle ?? ""}`;
  if (platform === "tiktok")
    return `https://www.tiktok.com/${handle ? `@${handle}` : ""}`;
  if (!handle) return "https://www.youtube.com";
  return handle.startsWith("UC") && !account!.startsWith("@")
    ? `https://www.youtube.com/channel/${handle}`
    : `https://www.youtube.com/@${handle}`;
}

function SnsCard({ sns }: { sns: Metrics["organic"]["sns"] }) {
  return (
    <Section title="SNS" description="기간 말 팔로워·구독자와 기간 내 조회수">
      <ul className="divide-y divide-border">
        {sns.map((s) => (
          <li
            key={`${s.client}-${s.platform}-${s.account ?? ""}`}
            className="flex items-center justify-between gap-x-3 py-3"
          >
            <a
              href={profileUrl(s.platform, s.account)}
              target="_blank"
              rel="noreferrer"
              className="group min-w-0 flex-1"
            >
              <p className="truncate text-t6 font-semibold text-foreground group-hover:underline">
                {PLATFORM_LABELS[s.platform]}
              </p>
              {s.account && (
                <p className="truncate text-st12 text-subtle" title={s.account}>
                  {s.account}
                </p>
              )}
            </a>
            <dl className="tabular grid shrink-0 grid-cols-2 gap-x-5 whitespace-nowrap text-right text-t7">
              <div>
                <dt className="text-st12 text-subtle">
                  {s.platform === "youtube" ? "구독자" : "팔로워"}
                </dt>
                <dd className="font-semibold text-foreground">
                  {formatNumber(s.followers)}
                  {s.followerChange !== null && (
                    <>
                      {" "}
                      <CountDelta
                        className="text-st12"
                        value={s.followerChange}
                      />
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-st12 text-subtle">조회수</dt>
                <dd className="font-semibold text-foreground">
                  {formatNumber(s.views)}
                  {s.views !== null && s.previousViews !== null && (
                    <>
                      {" "}
                      <Delta
                        className="text-st12"
                        rate={changeRate(s.views, s.previousViews)}
                      />
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

function YoutubeCard({
  youtube,
  compareLabel,
}: {
  youtube: NonNullable<Metrics["organic"]["youtube"]>;
  compareLabel: string;
}) {
  return (
    <Section
      title="유튜브 영상"
      description={`기간 내 업로드 · ${compareLabel} · 누적 조회수 순`}
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="업로드"
          value={`${formatNumber(youtube.uploads)}개`}
          delta={
            <CountDelta
              value={youtube.uploads - youtube.previousUploads}
              unit="개"
            />
          }
        />
        <Stat
          label="그중 쇼츠"
          value={`${formatNumber(youtube.shorts)}개`}
          delta={<span className="text-subtle">3분 이하 영상</span>}
        />
      </div>
      {youtube.top.length === 0 ? (
        <div className="mt-3">
          <EmptyState>이 기간에 올린 영상이 없어요</EmptyState>
        </div>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {youtube.top.map((v, i) => (
            <li key={v.id} className="flex items-start gap-3 py-2.5">
              <span className="tabular w-4 shrink-0 pt-0.5 text-t7 font-bold text-subtle">
                {i + 1}
              </span>
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
              <span className="tabular shrink-0 pt-0.5 text-t7 font-bold text-foreground">
                {formatNumber(v.views)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function SearchCard({
  search,
  compareLabel,
}: {
  search: NonNullable<Metrics["organic"]["search"]>;
  compareLabel: string;
}) {
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
          delta={
            <Delta
              rate={changeRate(current.impressions, previous.impressions)}
            />
          }
        />
        <Stat
          label="평균 순위"
          value={
            current.position === null
              ? EMPTY
              : `${current.position.toFixed(1)}위`
          }
          delta={
            current.position !== null && previous.position !== null ? (
              <CountDeltaDecimal value={previous.position - current.position} />
            ) : (
              <span className="text-muted-foreground">{EMPTY}</span>
            )
          }
        />
      </div>
      <h3 className="mt-5 mb-1 text-t7 font-semibold text-body">
        검색어 TOP {search.queries.length} (클릭 순)
      </h3>
      {search.queries.length === 0 ? (
        <EmptyState>이 기간 검색어 데이터가 없어요</EmptyState>
      ) : (
        <ol className="divide-y divide-border">
          {search.queries.map((q) => (
            <li
              key={q.query}
              className="flex items-center justify-between gap-3 py-2 text-t7"
            >
              <span className="min-w-0 truncate text-body">{q.query}</span>
              <span className="tabular shrink-0 text-subtle">
                <b className="text-foreground">{formatNumber(q.clicks)}</b> 클릭
                · {q.position === null ? EMPTY : `${q.position.toFixed(1)}위`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export function OrganicSection({ data }: { data: Metrics }) {
  const { sns, youtube, search } = data.organic;
  const empty = sns.length === 0 && !youtube && !search;

  return (
    <div className="min-w-0">
      <h2 className="mb-3 px-1 text-t4 font-bold text-foreground">오가닉</h2>
      {empty ? (
        <div className="rounded-card bg-card p-5">
          <EmptyState>선택한 기간에 오가닉 데이터가 없어요</EmptyState>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sns.length > 0 && <SnsCard sns={sns} />}
          {search && (
            <SearchCard search={search} compareLabel={data.compareLabel} />
          )}
          {youtube && (
            <YoutubeCard youtube={youtube} compareLabel={data.compareLabel} />
          )}
        </div>
      )}
    </div>
  );
}
