/* =============================================================================
 * panel.js — 상단 리퀴드 글래스 패널.
 *
 * 미결정이던 "문장을 3D 씬 안에 띄울지, 별도 UI 레이어로 뺄지"는 UI 레이어로
 * 확정됐다(인수인계 6장). 그래서 3D에는 배 실루엣만 있고, 숫자·통계·문장은 전부
 * 여기서 처리한다. 씬 쪽 모듈은 이 파일을 모르고, 이 파일도 three.js를 모른다.
 *
 * 구성(시안 스크린샷 그대로):
 *   1) 헤더    타이틀(작게) → 누적 문장 수(초대형) → "개의 문장이 이곳에 머물러 있습니다"
 *   2) 통계    얇은 구분선 아래, 라벨 → 빈도순으로 크기·색이 계단식으로 작아지는 한 문단
 *   3) 그 아래는 3D 씬(패널이 덮지 않는 화면 절반)
 * ========================================================================== */

import { STATE_LABEL, STAT_ROTATE_SEC } from "./config.js";
import { tally } from "./store.js";

// 통계는 일정 주기로 다른 지표로 자동 전환된다. 지표를 늘리려면 여기만 고치면 된다.
const METRICS = [
  { label: "가장 많이 선택된 이유", pick: (r) => r.keywords },
  { label: "지금 사람들이 서 있는 자리", pick: (r) => STATE_LABEL[r.state] || r.state },
  { label: "문장이 도착한 곳", pick: (r) => r.region },
];

// 순위별 글자 크기 배수와 색. 1위만 마젠타, 2위는 흰색 대형, 이후 점점 작고 흐리게.
// (--stat-base 를 기준으로 곱해지므로 화면 크기가 달라져도 계단이 유지된다)
const TIERS = [
  { size: 1.00, cls: "t1" },
  { size: 0.90, cls: "t2" },
  { size: 0.76, cls: "t3" },
  { size: 0.76, cls: "t3" },
  { size: 0.58, cls: "t4" },
  { size: 0.58, cls: "t4" },
];
const TIER_TAIL = { size: 0.46, cls: "t5" };

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
    this.metricIdx = 0;
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

  _renderStat(instant) {
    const m = METRICS[this.metricIdx];
    const rows = tally(this.records, m.pick).slice(0, 9);
    const html = rows.map((r, i) => {
      const tier = TIERS[i] || TIER_TAIL;
      return `<span class="stat-item ${tier.cls}" style="font-size:calc(var(--stat-base) * ${tier.size})">${escapeHtml(r.label)}</span>`;
    }).join("");

    const apply = () => {
      if (this.el.statLabel) this.el.statLabel.textContent = m.label;
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
    if (this._rotateT >= STAT_ROTATE_SEC) {
      this._rotateT = 0;
      this.metricIdx = (this.metricIdx + 1) % METRICS.length;
      this._renderStat(false);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
