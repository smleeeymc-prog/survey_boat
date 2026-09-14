/* =============================================================================
 * stats/metrics.js — 무엇을 세는가.
 *
 * "무엇을 세는가"와 "어떻게 그리는가"를 따로 둔다. 같은 값을 다른 모양으로 여러 번
 * 보여줄 수도 있고, 새 지표가 생겨도 그리는 쪽은 손댈 일이 없다.
 *   metrics.js  무엇을      ← 여기
 *   views.js    어떻게
 *   index.js    무엇을 어떻게, 어떤 순서로
 *
 * 지표를 늘리려면 아래 표에 한 줄 더하고 index.js의 SLIDES에 끼워 넣으면 된다.
 * pick(record) 은 값 하나 또는 값의 배열을 돌려준다 (배열이면 항목마다 한 표씩).
 * ========================================================================== */

import { STATE_LABEL } from "../config.js";
import { tally } from "../store.js";

export const METRICS = [
  { id: "reason", label: "가장 많이 선택된 이유",     pick: (r) => r.keywords },
  { id: "state",  label: "지금 사람들이 서 있는 자리", pick: (r) => STATE_LABEL[r.state] || r.state },
  { id: "region", label: "문장이 도착한 곳",          pick: (r) => r.region },
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m]));

/**
 * 지표 하나를 그리기 좋은 모양으로. 그리는 쪽(views.js)은 전부 이 모양만 받는다 —
 * 어떤 지표였는지, 어떻게 셌는지는 알 필요가 없다.
 *
 * @returns {{label:string, count:number, share:number}[]} 빈도 내림차순
 *   share 는 "표 전체 중 이 항목의 비율"이다. 키워드처럼 한 사람이 여러 개를 고르는
 *   지표에서는 응답자 수가 아니라 표 수가 분모라는 뜻이고, 막대 그래프의 기준도 이것이다.
 */
export function toRows(records, metric, limit = 9) {
  const t = tally(records, metric.pick);
  const total = t.reduce((a, r) => a + r.count, 0) || 1;
  return t.slice(0, limit).map((r) => ({ ...r, share: r.count / total }));
}
