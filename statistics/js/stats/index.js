/* =============================================================================
 * stats/index.js — 무엇을 어떻게, 어떤 순서로 보여줄지.
 *
 * 패널(../panel.js)이 아는 건 이 파일 하나다. 지표를 늘리거나 모양을 바꾸는 일은
 * 여기와 metrics.js / views.js 안에서 끝나고, 패널도 3D 쪽도 건드릴 일이 없다.
 *
 * [대기] 실제로 보여줄 통계 항목은 사용자가 확정해서 알려주기로 했다. 지금 SLIDES에
 * 있는 셋은 시안 스크린샷에 있던 것들이고, 값이 정해지면 이 배열만 갈아끼우면 된다.
 * ========================================================================== */

import { METRIC, toRows } from "./metrics.js";
import { VIEWS } from "./views.js";

/** 한 칸이 "무엇을(metric) 어떻게(view)" 한 쌍. 같은 지표를 다른 모양으로 두 번 넣어도 된다. */
export const SLIDES = [
  { metric: "reason", view: "ranking" },
  { metric: "state",  view: "bars" },
  { metric: "region", view: "bars" },
];

export class StatDeck {
  constructor(slides = SLIDES) {
    // 잘못된 id를 조용히 빈 화면으로 넘기지 않는다 — 전시 중에 한 칸이 백지가 되면
    // 그게 고장인지 데이터가 없는 건지 구분이 안 된다.
    for (const s of slides) {
      if (!METRIC[s.metric]) throw new Error(`[stats] 모르는 지표: ${s.metric}`);
      if (!VIEWS[s.view]) throw new Error(`[stats] 모르는 표시 방식: ${s.view}`);
    }
    this.slides = slides;
    this.i = 0;
  }

  /** 지금 칸을 {label, html} 로. 패널은 이 둘을 제자리에 꽂기만 한다. */
  render(records) {
    const s = this.slides[this.i];
    const metric = METRIC[s.metric];
    const view = VIEWS[s.view];
    return { label: metric.label, html: view.render(toRows(records, metric, view.limit), metric) };
  }

  advance() { this.i = (this.i + 1) % this.slides.length; }
}
