/* =============================================================================
 * stats/index.js — 무엇을 어떻게, 어떤 순서로 보여줄지.
 *
 * 패널(../panel.js)이 아는 건 이 파일 하나다. 지표를 늘리거나 모양을 바꾸는 일은
 * 여기와 metrics.js / insights.js / views.js 안에서 끝나고, 패널도 3D 쪽도 건드릴 일이 없다.
 *
 * 한 장(chapter)은 보고서 한 쪽이다 — 레퍼런스(dh-learning.kr 전시 화면)의 "Data Analysis"
 * 카드를 옮겼다. 패널은 이 파일이 준 조각을 정해진 자리에 꽂기만 한다.
 *
 *     Data Analysis — Why people stay                    01 / 09   ← tagline · 장 번호
 *     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ← 굵은 선 = 진행 막대
 *     머무르게 하는 이유 · · · · · · · · · · · · · · · · · · 가족   ← label · value
 *     사람들이 여기 머무는 건, “가족” 때문입니다.                     ← headline (한 줄 결론)
 *     ( 차트 )                                                      ← html
 *     머무는 사람 23명 중 61%가 골랐습니다                              ← extra
 *     9월 14일 – 9월 27일 · 문장 128개 기준                 [범례]   ← period · legend
 * ========================================================================== */

import { METRIC, METRICS, rowsOf } from "./metrics.js";
import { INSIGHTS, liveInsight } from "./insights.js";
import { VIEWS } from "./views.js";
import { fmtDay, fmtClock, num } from "./text.js";
import { STAT_ROTATE_SEC } from "../config.js";

/**
 * 한 장 = 무엇을 세고(metric) · 어떻게 읽고(insight) · 어떻게 그리는가(view).
 * 같은 지표를 다른 모양으로 두 번 넣어도 된다.
 *
 * 순서는 "결론 → 근거 → 해석 → 지금 → 다시 개인"이다. 첫 장이 이 화면의 한 줄 결론을
 * 내고, 뒤의 장들이 그 근거를 펼치고, 정착 온도가 이 프로젝트만의 해석을 얹고, 유입
 * 속도와 문장 벽이 다시 개인으로 돌아온다 (기획서의 개인→집단→아카이브 순환).
 *
 * sec 을 주면 그 장만 더 머문다. 칸이 많은 그림(히트맵·네트워크)은 결론 문장을 읽고
 * 그림에서 그 칸을 찾아갈 시간이 더 든다. 문장 벽은 몇 문장은 읽혀야 한다.
 * tagline 은 레퍼런스 카드의 이탤릭 머리글처럼 한/영을 겹친다.
 */
export const SLIDES = [
  { metric: "stayReason", insight: "stayTop", view: "bubble", tagline: "Why people stay" },
  { metric: "motives", insight: "motiveContrast", view: "motives", tagline: "Same word, other reasons" },
  { metric: "reason", insight: "concentration", view: "ranking", tagline: "What people chose" },
  { metric: "keywordPairs", insight: "strongestPair", view: "network", sec: 10, tagline: "Chosen together" },
  { metric: "state", insight: "topState", view: "bars", tagline: "Where people stand" },
  { metric: "regionState", insight: "regionalColor", view: "heatmap", sec: 11, tagline: "Place and position" },
  { metric: "settleTemp", insight: "settle", view: "thermo", tagline: "Settling temperature" },
  { metric: "inflow", insight: "inflow", view: "pulse", tagline: "Arrivals, last hour" },
  { metric: "sentences", insight: "voices", view: "textwall", sec: 22, tagline: "Voices" },
];

/**
 * 각주의 기간 — 레퍼런스의 data.period 줄. 결론이 "언제부터 언제까지, 몇 명"을
 * 두고 한 말인지 밝혀 둔다. 같은 날이면 날짜를 한 번만 쓴다.
 */
export function periodOf(records) {
  let lo = Infinity, hi = -Infinity;
  for (const r of records) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t)) continue;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const n = `문장 ${num(records.length)}개 기준`;
  if (!Number.isFinite(lo)) return n;
  const a = fmtDay(lo), b = fmtDay(hi);
  return `${a === b ? a : `${a} – ${b}`} · ${n}`;
}

export class StatDeck {
  constructor(slides = SLIDES) {
    // 잘못된 짝을 조용히 빈 화면으로 넘기지 않는다 — 전시 중에 한 장이 백지가 되면
    // 그게 고장인지 데이터가 없는 건지 구분할 방법이 없다. 켜는 순간 콘솔에서 걸린다.
    for (const s of slides) {
      const m = METRIC[s.metric], v = VIEWS[s.view], ins = INSIGHTS[s.insight];
      if (!m) throw new Error(`[stats] 모르는 지표: ${s.metric}`);
      if (!v) throw new Error(`[stats] 모르는 표시 방식: ${s.view}`);
      if (!ins) throw new Error(`[stats] 모르는 해석: ${s.insight}`);
      if (m.shape !== v.accepts) {
        throw new Error(
          `[stats] 짝이 안 맞는다: 지표 '${s.metric}'는 ${m.shape} 를 내놓는데 ` +
          `표시 방식 '${s.view}'는 ${v.accepts} 를 받는다`
        );
      }
    }
    this.slides = slides;
    this.i = 0;
  }

  /**
   * 지금 장을 보고서 조각으로. 결론 문장이 가리키는 것(highlight)을 차트에도 그대로
   * 넘긴다 — 문장은 "관계"라고 말하는데 차트는 다른 막대를 세우는 일이 없게.
   */
  render(records) {
    const s = this.slides[this.i];
    const metric = METRIC[s.metric];
    const view = VIEWS[s.view];
    const data = metric.build(records, metric);
    const ins = INSIGHTS[s.insight](data, { records, n: records.length, metric });
    return {
      kind: "chapter",
      key: `${s.metric}:${s.view}`,
      view: s.view,
      index: this.i + 1,
      total: this.slides.length,
      tagline: s.tagline,
      label: metric.label,
      value: ins.value,
      headline: ins.headline,
      extra: ins.extra || "",
      period: periodOf(records) + (metric.votes ? " · 키워드는 한 문장에 두 개까지" : ""),
      legend: view.legend ? view.legend(data) : "",
      html: view.render(data, { highlight: ins.highlight }),
      sec: s.sec ?? STAT_ROTATE_SEC,
    };
  }

  /**
   * 방금 도착한 문장 한 장. 그 문장을 전체 속에 놓는다 — 같은 질문에 답한 사람들의
   * 키워드 분포 위에 이 사람의 키워드를 먹색으로 세우고 "+1"을 붙인다.
   * 키워드가 없는 문장은 지역 막대 위에 그 지역을 세운다.
   */
  renderLive(record, records) {
    const li = liveInsight(record, records, rowsOf);
    const kws = li.highlight;
    const upto = li.rows;
    let html, basis;
    if (kws.length && upto.items.length) {
      html = VIEWS.bubble.render(upto, { highlight: kws, ordinals: li.ordinals });
      basis = `${li.motiveLabel ? `${li.motiveLabel}에 답한 ` : ""}문장 ${num(upto.n)}개 기준`;
    } else {
      const idx = records.findIndex((r) => r.record_id === record.record_id);
      const seen = idx >= 0 ? records.slice(0, idx + 1) : records.concat([record]);
      html = VIEWS.bars.render(rowsOf(seen, (r) => r.region), { highlight: [record.region] });
      basis = `문장 ${num(seen.length)}개 기준`;
    }
    const t = Date.parse(record.created_at);
    return {
      kind: "live",
      key: `live:${record.record_id}`,
      view: kws.length ? "bubble" : "bars",
      tagline: "Just arrived",
      stamp: Number.isFinite(t) ? fmtClock(t) : "",
      label: "이 문장이 고른 이유",
      value: li.value,
      headline: li.headline,
      extra: li.extra,
      period: basis,
      legend: "",
      html,
    };
  }

  advance() { this.i = (this.i + 1) % this.slides.length; }
}

export { METRICS, METRIC, VIEWS };
