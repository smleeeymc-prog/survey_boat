/* =============================================================================
 * explore/notice.js — 둘러보기 안내와 새 배 알림. 글자 층뿐이라 장면을 모른다.
 *
 * 안내(10-06 사용자): 둘러보기가 시작되면 가운데를 살짝 어둡게 깔고 "밀어 둘러보기 · 두 손가락으로 당기기 ·
 *   배 누르기"를 아이콘과 손가락 움직임으로 보인다. 손이 닿으면 몇 초(EXPLORE_TIME.guideHide) 뒤 사라진다 —
 *   바로 걷으면 첫 손짓을 하면서 읽던 문장이 사라진다.
 * 알림: 다른 배를 보고 있거나 통계를 보는 중에 새 문장이 오면 줌으로 끊지 않고 "새 배가 도착했어요 · 보기"만.
 *   누르면 그 배로 간다. 잠시(EXPLORE_TIME.toast) 뒤 저절로 들어간다.
 * ========================================================================== */

import { EXPLORE_TIME } from "../config.js";

export class Guide {
  constructor(el) {
    this.el = el;
    this.shown = false;
    this._hideAt = null;
  }

  show() {
    if (this.shown) return;
    this.shown = true;
    this._hideAt = null;   // 띄우기 전에 hide() 가 불렸어도(자기 배로 먼저 줌) 손이 닿으면 다시 셀 수 있게
    this.el.classList.add("on");
  }

  /** 손이 처음 닿았다 — 몇 초 뒤 걷는다 */
  touched() {
    if (this.shown && this._hideAt === null) this._hideAt = EXPLORE_TIME.guideHide;
  }

  /** 지금 바로 걷는다(배를 보러 들어갈 때 — 안내가 배를 가린다) */
  hide() {
    this.el.classList.remove("on");
    this._hideAt = -1;
  }

  update(dt) {
    if (this._hideAt === null || this._hideAt < 0) return;
    this._hideAt -= dt;
    if (this._hideAt <= 0) this.hide();
  }
}

export class Toast {
  /** @param {(record) => void} onOpen "보기"를 눌렀을 때 */
  constructor(el, onOpen) {
    this.el = el;
    this.record = null;
    this._t = 0;
    this._text = el.querySelector(".ex-toast-text");
    el.addEventListener("click", () => {
      const r = this.record;
      this.hide();
      if (r) onOpen(r);
    });
  }

  show(record, n = 1) {
    this.record = record;
    this._t = EXPLORE_TIME.toast;
    // 잇달아 오면 가장 최근 배를 가리키고 몇 척인지 적는다
    this._text.textContent = n > 1 ? `새 배 ${n}척이 도착했어요` : "새 배가 도착했어요";
    this.el.classList.remove("on");
    void this.el.offsetWidth;
    this.el.classList.add("on");
  }

  hide() {
    this.record = null;
    this.el.classList.remove("on");
  }

  /** 그 기록이 지워졌으면 알림도 거둔다 */
  forget(recordId) { if (this.record && this.record.record_id === recordId) this.hide(); }

  update(dt) {
    if (!this.record) return;
    this._t -= dt;
    if (this._t <= 0) this.hide();
  }
}
