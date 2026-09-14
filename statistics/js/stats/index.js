/* =============================================================================
 * stats/index.js — 무엇을 어떻게, 어떤 순서로 보여줄지.
 *
 * 패널(../panel.js)이 아는 건 이 파일 하나다. 지표를 늘리거나 모양을 바꾸는 일은
 * 여기와 metrics.js / views.js 안에서 끝나고, 패널도 3D 쪽도 건드릴 일이 없다.
 * ========================================================================== */

import { METRIC, METRICS } from "./metrics.js";
import { VIEWS } from "./views.js";
import { STAT_ROTATE_SEC } from "../config.js";

/**
 * 한 칸이 "무엇을(metric) 어떻게(view)" 한 쌍이다. 같은 지표를 다른 모양으로 두 번
 * 넣어도 된다 — 실제로 '이유'는 버블(한 줄 결론)과 랭킹(분포) 둘로 나온다.
 *
 * sec 을 주면 그 칸만 더 머문다. 문장 벽처럼 읽어야 하는 칸은 5.2초로는 한 문장도
 * 다 못 읽는다. 안 주면 STAT_ROTATE_SEC.
 *
 * 순서는 "결론 → 근거 → 해석"으로 짰다. 버블이 한 줄 결론을 내고, 랭킹·히트맵·
 * 네트워크가 그 근거를 펼치고, 정착 온도가 이 프로젝트만의 해석을 얹고, 속도와
 * 문장 벽이 다시 개인으로 돌아온다 (기획서의 개인→집단→아카이브 순환).
 */
export const SLIDES = [
  { metric: "reason", view: "bubble" },                 // 결론: 사람들이 머무는 건 "관계" 때문
  { metric: "reason", view: "ranking" },                // 근거: 이유의 분포
  { metric: "regionState", view: "heatmap", sec: 8 },   // 근거: 지역마다 다른 자리
  { metric: "keywordPairs", view: "network", sec: 8 },  // 근거: 함께 고른 이유들
  { metric: "settleTemp", view: "thermo", sec: 7 },     // 해석: 정착 온도
  { metric: "inflow", view: "pulse" },                  // 지금 이 순간
  { metric: "sentences", view: "textwall", sec: 20 },   // 다시 개인으로
  { metric: "state", view: "bars" },
  { metric: "region", view: "bars" },
];

export class StatDeck {
  constructor(slides = SLIDES) {
    // 잘못된 짝을 조용히 빈 화면으로 넘기지 않는다 — 전시 중에 한 칸이 백지가 되면
    // 그게 고장인지 데이터가 없는 건지 구분할 방법이 없다. 켜는 순간 콘솔에서 걸린다.
    for (const s of slides) {
      const m = METRIC[s.metric], v = VIEWS[s.view];
      if (!m) throw new Error(`[stats] 모르는 지표: ${s.metric}`);
      if (!v) throw new Error(`[stats] 모르는 표시 방식: ${s.view}`);
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

  /** 지금 칸을 {label, html, sec} 로. 패널은 이 셋을 제자리에 꽂기만 한다. */
  render(records) {
    const s = this.slides[this.i];
    const metric = METRIC[s.metric];
    return {
      label: metric.label,
      html: VIEWS[s.view].render(metric.build(records), metric),
      sec: s.sec ?? STAT_ROTATE_SEC,
    };
  }

  advance() { this.i = (this.i + 1) % this.slides.length; }
}

export { METRICS, METRIC, VIEWS };
