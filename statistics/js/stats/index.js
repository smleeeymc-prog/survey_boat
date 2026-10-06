/* =============================================================================
 * stats/index.js — 무엇을 어떻게, 어떤 순서로 보여줄지.
 *
 * 패널(../panel.js)이 아는 건 이 파일 하나다. 지표를 늘리거나 모양을 바꾸는 일은
 * 여기와 metrics.js / insights.js / views.js 안에서 끝나고, 패널도 3D 쪽도 건드릴 일이 없다.
 *
 * 한 장(chapter)은 보고서 한 쪽이다 — 레퍼런스(dh-learning.kr 전시 화면)의 "Data Analysis"
 * 카드 구성을 설문(시안 B′)의 말투로 옮겼다. 패널은 이 파일이 준 조각을 정해진 자리에 꽂기만 한다.
 *
 *     01  머무르게 하는 이유                               01 / 09   ← index · label · total
 *     ─────────────────────────────────────────────────────────────   ← 흰 실선 위 금색 진행선
 *     사람들이 여기 머무는 건, “가족” 때문입니다.                     ← headline (한 줄 결론)
 *     ( 차트 )                                                      ← html
 *     머무는 사람 23명 중 61%가 골랐습니다                              ← extra
 *     9월 14일 – 9월 27일 · 문장 128개 기준                 [범례]   ← period · legend
 * ========================================================================== */

import { METRIC, METRICS } from "./metrics.js";
import { INSIGHTS } from "./insights.js";
import { VIEWS } from "./views.js";
import { fmtDay, num } from "./text.js";
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
 *
 * explore 는 인터랙티브 입구(explore.html)의 통계 보기에서 이 장을 어떻게 다룰지다(HANDOFF-map 25·26장).
 * 장 목록은 여기 하나뿐이다 — 인터랙티브는 이 목록을 걸러 쓰므로, 장을 더하면 저절로 따라 들어간다.
 *   (없음)               지역·상태 필터 어느 쪽에서도 보여준다
 *   false                인터랙티브에서는 뺀다 — 지역끼리 견주는 장(관람객이 고른 범위의 통계가 아니라 지역 비교다)
 *   { state: false }     상태 필터가 걸려 있으면 목록에서 감춘다 — 상태 하나로 거르면 그 장이 무의미해진다
 *                        (머무는 사람의 이유·동기별 이유·상태 막대 100% 한 줄). region 도 같은 식.
 */
export const SLIDES = [
  { metric: "stayReason", insight: "stayTop", view: "bubble", tagline: "Why people stay", explore: { state: false } },
  { metric: "motives", insight: "motiveContrast", view: "motives", tagline: "Same word, other reasons", explore: { state: false } },
  { metric: "reason", insight: "concentration", view: "spread", tagline: "What people chose" },
  { metric: "regionReason", insight: "placeTop", view: "places", sec: 10, tagline: "Reasons by place", explore: false },
  { metric: "keywordPairs", insight: "strongestPair", view: "network", sec: 10, tagline: "Chosen together" },
  { metric: "state", insight: "topState", view: "bars", tagline: "Where people stand", explore: { state: false } },
  { metric: "regionState", insight: "regionalColor", view: "heatmap", sec: 11, tagline: "Place and position", explore: false },
  { metric: "settleTemp", insight: "settle", view: "thermo", tagline: "Settling temperature", explore: false },
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
  render(records, box = {}) {
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
      // box.aspect = 차트 자리의 가로/세로 — 무리 짓는 그림(버블)이 자리 모양을 닮게 한다
      html: view.render(data, { highlight: ins.highlight, aspect: box.aspect }),
      sec: s.sec ?? STAT_ROTATE_SEC,
    };
  }

  /** 다음에 나올 장 — 풍경 시간에 위쪽 제목 아래에서 예고한다("02 같은 낱말, 다른 이유 · 다음 장") */
  peek() {
    const s = this.slides[this.i];
    return { index: this.i + 1, total: this.slides.length, label: METRIC[s.metric].label, tagline: s.tagline };
  }

  advance() { this.i = (this.i + 1) % this.slides.length; }

  /** 장을 직접 고른다 — 인터랙티브는 자동으로 넘기지 않고 관람객이 목차·이전/다음으로 고른다 */
  goTo(i) { this.i = ((i % this.slides.length) + this.slides.length) % this.slides.length; }
}

/** 인터랙티브 통계 보기의 장들 — SLIDES 에서 explore:false 만 뺀 것(목록은 여기 하나뿐이다) */
export const EXPLORE_SLIDES = SLIDES.filter((s) => s.explore !== false);

/** 지금 필터({region, state} — 비면 전체)에서 이 장을 보여줄 수 있는가 (SLIDES 머리말의 explore 표) */
export function exploreFits(slide, filter = {}) {
  const e = slide.explore || {};
  if (filter.region && e.region === false) return false;
  if (filter.state && e.state === false) return false;
  return true;
}

export { METRICS, METRIC, VIEWS };
