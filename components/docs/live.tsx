/**
 * 문서에 코드의 현재 값을 그대로 보여 주는 표. 규칙을 코드에서 바꾸면 문서도 같이 바뀐다.
 * MDX 에서 import 해서 쓴다: import { Thresholds } from "@/components/docs/live";
 */
import {
  BASELINE_TOLERANCE,
  BASELINE_WEEKS,
  OFF_CPC_RATIO,
  OFF_CTR_RATIO,
  OFF_MIN_IMPRESSIONS,
  RANK_MIN_IMPRESSIONS,
  SEARCH_QUERY_TOP,
  UTM_SUSPECT_RATE,
  WEB_SOURCE_ROWS,
  YOUTUBE_TOP,
} from "@/lib/build-metrics";
import { CHANNEL_LABELS, CLIENTS, CONVERSION_LABELS } from "@/lib/clients";
import { formatNumber } from "@/lib/metrics";
import { CONVERSION_EVENTS, SOURCE_RULES } from "@/lib/web-config";

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

/** 화면에서 색·배지·순위를 정하는 문턱값 */
export function Thresholds() {
  const rows: [string, string, string][] = [
    [
      "채널 표 주황 칸",
      `직전 ${BASELINE_WEEKS}주보다 ${pct(BASELINE_TOLERANCE)} 이상 나쁨`,
      "CTR 은 낮을수록, CPC·CPM 은 높을수록 나쁨",
    ],
    ["UTM 확인", `도착률 ${UTM_SUSPECT_RATE}% 미만`, "숫자 대신 'UTM 확인'을 보여 줌"],
    ["소재 순위에 넣는 최소 노출", `${formatNumber(RANK_MIN_IMPRESSIONS)}회`, "이보다 적으면 순위에서 뺌"],
    ["OFF 후보를 따지는 최소 노출", `${formatNumber(OFF_MIN_IMPRESSIONS)}회`, "이보다 적으면 OFF 후보로 보지 않음"],
    ["OFF 후보 · CTR 낮음", `전체 소재 CTR 의 ${pct(OFF_CTR_RATIO)} 미만`, "같은 클라이언트 메타 소재 전체 대비"],
    ["OFF 후보 · CPC 높음", `전체 소재 CPC 의 ${pct(OFF_CPC_RATIO)} 초과`, "같은 클라이언트 메타 소재 전체 대비"],
    ["홈페이지 유입 표 줄 수", `${WEB_SOURCE_ROWS}개`, "나머지는 '기타 N개'로 묶음"],
    ["구글 검색어", `상위 ${SEARCH_QUERY_TOP}개`, "클릭 많은 순"],
    ["유튜브 인기 영상", `상위 ${YOUTUBE_TOP}개`, "조회수 많은 순"],
  ];
  return (
    <table>
      <thead>
        <tr>
          <th>항목</th>
          <th>현재 값</th>
          <th>설명</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, value, note]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>
              <strong>{value}</strong>
            </td>
            <td>{note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 채널별 '매체 전환'이 뜻하는 것 */
export function ConversionLabels() {
  return (
    <table>
      <thead>
        <tr>
          <th>채널</th>
          <th>매체 전환 칸 이름</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(CONVERSION_LABELS).map(([channel, label]) => (
          <tr key={channel}>
            <td>{CHANNEL_LABELS[channel] ?? channel}</td>
            <td>{label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 클라이언트별 '홈페이지 전환'으로 세는 GA4 이벤트 */
export function ConversionEvents() {
  return (
    <table>
      <thead>
        <tr>
          <th>클라이언트</th>
          <th>전환으로 세는 GA4 이벤트</th>
        </tr>
      </thead>
      <tbody>
        {CLIENTS.map((c) => (
          <tr key={c.slug}>
            <td>{c.name}</td>
            <td>
              {CONVERSION_EVENTS[c.slug]?.length ? (
                CONVERSION_EVENTS[c.slug].map((e, i) => (
                  <span key={e}>
                    {i > 0 && " · "}
                    <code>{e}</code>
                  </span>
                ))
              ) : (
                "정해진 이벤트 없음"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** GA4 소스/매체 → 화면 이름 규칙. 위에서부터 처음 맞는 규칙을 쓴다 */
export function SourceRules() {
  return (
    <table>
      <thead>
        <tr>
          <th>화면 이름</th>
          <th>GA4 소스 / 매체 (정규식)</th>
        </tr>
      </thead>
      <tbody>
        {SOURCE_RULES.map(([re, label]) => (
          <tr key={re.source}>
            <td>{label}</td>
            <td>
              <code>{re.source}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
