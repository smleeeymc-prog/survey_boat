/* =============================================================================
 * panel.js — 상단 리퀴드 글래스 패널.
 *
 * 미결정이던 "문장을 3D 씬 안에 띄울지, 별도 UI 레이어로 뺄지"는 UI 레이어로
 * 확정됐다(인수인계 6장). 그래서 3D에는 배 실루엣만 있고, 숫자·통계·문장은 전부
 * 여기서 처리한다. 씬 쪽 모듈은 이 파일을 모르고, 이 파일도 three.js를 모른다.
 *
 * 구성(시안 스크린샷 그대로):
 *   1) 헤더    타이틀(작게) → 누적 문장 수(초대형) → "개의 문장이 이곳에 머물러 있습니다"
 *   2) 통계    얇은 구분선 아래, 라벨 + 자동으로 넘어가는 통계 한 칸
 *   3) 그 아래는 3D 씬(패널이 덮지 않는 화면 절반)
 *
 * 통계를 "무엇을 세고 어떻게 그리는가"는 이 파일에 없다. js/stats/ 안에 있고, 이
 * 파일은 StatDeck 에게 {label, html} 을 받아 제자리에 꽂고 주기적으로 넘기기만 한다.
 * 그래서 지표를 늘리거나 표시 방식을 바꾸는 일이 패널 껍데기와 완전히 분리돼 있다.
 * ========================================================================== */

import { STAT_ROTATE_SEC, STATE_LABEL } from "./config.js";
import { StatDeck } from "./stats/index.js";

export class Panel {
  constructor(root = document) {
    this.el = {
      count: root.getElementById("countNum"),
      statLabel: root.getElementById("statLabel"),
      statRows: root.getElementById("statRows"),
      arrival: root.getElementById("arrival"),
      arrivalText: root.getElementById("arrivalText"),
      arrivalMeta: root.getElementById("arrivalMeta"),
    };
    this.records = [];
    this.deck = new StatDeck();
    this._rotateT = 0;
    this._shownCount = 0;
    this._targetCount = 0;
    this._countT = 1;
  }

  /** 저장소가 준 전체 기록. 숫자와 통계가 여기서 파생된다. */
  setRecords(records) {
    this.records = records;
    this._targetCount = records.length;
    // 처음 적재는 애니메이션 없이 바로 (전시 시작할 때 0부터 428까지 올라가면 산만하다)
    if (this._shownCount === 0 && this._countT >= 1) {
      this._shownCount = this._targetCount;
      this._renderCount(this._targetCount);
    } else {
      this._countFrom = this._shownCount;
      this._countT = 0;
    }
    this._renderStat(true);
  }

  _renderCount(n) {
    if (this.el.count) this.el.count.textContent = String(Math.round(n));
  }

  /**
   * 통계 자리를 고정 문구로 바꾸고 자동 전환을 멈춘다. 보정 화면(?depths=1)처럼
   * 통계가 의미 없는 상태에서, 빈 칸을 띄워 고장처럼 보이게 하지 않으려고 둔다.
   */
  pin(label, html) {
    this.pinned = { label, html };
    this._renderStat(true);
  }

  _renderStat(instant) {
    const { label, html } = this.pinned || this.deck.render(this.records);

    const apply = () => {
      if (this.el.statLabel) this.el.statLabel.textContent = label;
      if (this.el.statRows) this.el.statRows.innerHTML = html;
      if (this.el.statRows) this.el.statRows.classList.remove("fading");
      if (this.el.statLabel) this.el.statLabel.classList.remove("fading");
    };
    if (instant) { apply(); return; }
    // 크로스페이드: 내용은 그대로 두고 opacity만 떨어뜨렸다가, 다 사라지면 갈아끼운다.
    this.el.statRows && this.el.statRows.classList.add("fading");
    this.el.statLabel && this.el.statLabel.classList.add("fading");
    clearTimeout(this._fadeTimer);
    this._fadeTimer = setTimeout(apply, 520);
  }

  /** 새 기록이 도착했을 때 문장을 유리 위에 띄운다. */
  showArrival(record) {
    if (!this.el.arrival) return;
    this.el.arrivalText.textContent = record.text || "";
    const who = record.display_name && record.display_name !== "익명" ? record.display_name : "익명";
    this.el.arrivalMeta.textContent = `${record.region} · ${STATE_LABEL[record.state] || record.state} · ${who}`;
    this.el.arrival.classList.add("on");
  }

  hideArrival() {
    if (this.el.arrival) this.el.arrival.classList.remove("on");
  }

  update(dt) {
    // 숫자 카운트업 — 새 문장이 도착했을 때만 돈다.
    if (this._countT < 1) {
      this._countT = Math.min(1, this._countT + dt / 1.1);
      const e = 1 - Math.pow(1 - this._countT, 3);
      this._shownCount = this._countFrom + (this._targetCount - this._countFrom) * e;
      this._renderCount(this._shownCount);
    }

    this._rotateT += dt;
    if (!this.pinned && this._rotateT >= STAT_ROTATE_SEC) {
      this._rotateT = 0;
      this.deck.advance();
      this._renderStat(false);
    }
  }
}
