/* =============================================================================
 * panel.js — 상단 리퀴드 글래스 패널과 "방금 도착한 문장" 카드.
 *
 * 미결정이던 "문장을 3D 씬 안에 띄울지, 별도 UI 레이어로 뺄지"는 UI 레이어로
 * 확정됐다(인수인계 6장). 그래서 3D에는 배 실루엣만 있고, 숫자·통계·문장은 전부
 * 여기서 처리한다. 씬 쪽 모듈은 이 파일을 모르고, 이 파일도 three.js를 모른다.
 *
 * 구성:
 *   1) 헤더     타이틀 → 누적 문장 수(초대형) → "개의 문장이 이곳에 머물러 있습니다"
 *   2) 보고서   한 장씩 넘어가는 통계. 레퍼런스(dh-learning.kr)의 "Data Analysis" 카드를
 *              옮겼다 — 장 번호 · 굵은 선 · 라벨·····값 · 한 줄 결론 · 차트 · 각주.
 *              무엇을 세고 어떻게 그리는지는 js/stats/ 에 있고, 여기는 받은 조각을 꽂는다.
 *   3) 문장 카드 새 기록이 도착하면 아래에 뜬다. 레퍼런스의 "Drug Facts" 라벨을 배의
 *              항해일지(Ship's Log)로 옮겼다 — 출발한 곳 · 지금의 자리 · 싣고 온 것 · 기록 시각.
 *
 * ── 새 문장과 통계는 겹치지 않는다 ─────────────────────────────────────────
 * 레퍼런스 화면은 개인의 이야기와 통계가 번갈아 나오고 절대 동시에 뜨지 않는다. 카메라가
 * 먼저 움직이고, 멈춘 뒤에 카드가 뜬다. 여기서도 같은 순서를 지킨다:
 *
 *   incoming()   카메라가 배로 가는 중   통계 장은 그대로 두고 넘기기만 멈춘다(진행 막대 정지)
 *   live()       카메라 도착 · 배 등장   숫자 +1, 통계 장이 물러나고 LIVE 장이 들어온다.
 *                                        문장 카드가 뜬다. LIVE 장은 그 문장을 전체 속에 놓는다
 *                                        ("이 문장은 ‘일’ 때문에 떠나려는 7번째 이야기입니다")
 *   hideArrival  카메라가 돌아가는 중    카드만 내린다. LIVE 장은 배가 제자리에 갈 때까지 남는다
 *   endLive()    연출 끝                 끊긴 장으로 돌아간다 — 절반도 못 보여줬으면 그 장을
 *                                        처음부터, 절반 넘게 보여줬으면 다음 장으로
 *
 * 숫자도 같은 박자에 맞춘다. 기록은 제출되는 순간 들어오지만, 화면의 숫자와 통계는 그
 * 배가 관람객 눈앞에 나타날 때 +1 된다(expect/reveal). 숫자가 먼저 올라가고 몇 초 뒤에
 * 배가 오면, 관람객에게는 둘이 서로 다른 사건으로 보인다.
 * ========================================================================== */

import { STAT_ROTATE_SEC, STATE_LABEL, ARRIVAL_HOLD_SEC } from "./config.js";
import { StatDeck } from "./stats/index.js";
import { esc, fmtStamp } from "./stats/text.js";

/** 장이 물러나는 시간(ms). css/panel.css 의 .report.out 과 맞춘다 */
const OUT_MS = 460;
/** 제출은 됐는데 연출 차례가 안 온 기록을 숫자에서 빼 두는 최대 시간(초). 넘으면 그냥 센다 —
 *  연출 쪽에서 무슨 일이 생겨도 숫자가 영영 모자란 채로 남지 않게 하는 안전장치다. */
const EXPECT_MAX_SEC = 40;

export class Panel {
  constructor(root = document) {
    const $ = (id) => root.getElementById(id);
    this.el = {
      count: $("countNum"), plus: $("countPlus"),
      report: $("report"), tag: $("rTag"), idx: $("rIdx"),
      label: $("rLabel"), value: $("rValue"), headline: $("rHeadline"),
      chart: $("statRows"), extra: $("rExtra"), period: $("rPeriod"), legend: $("rLegend"),
      arrival: $("arrival"), logNo: $("logNo"), text: $("arrivalText"), sign: $("arrivalSign"),
      from: $("logFrom"), status: $("logStatus"), cargo: $("logCargo"), logged: $("logLogged"),
    };
    this.records = [];
    this.deck = new StatDeck();
    this._expected = new Map();   // record_id → 기다린 시간(초)
    this._rotateT = 0;
    this._dwell = STAT_ROTATE_SEC;
    this._shownCount = 0;
    this._targetCount = 0;
    this._countT = 1;
    this._tok = 0;
    this._mode = "deck";          // deck | incoming | live | pin
    this._shownIds = new Set();
  }

  /* ── 데이터 ─────────────────────────────────────────────────────────────── */

  /** 저장소가 준 전체 기록. 숫자와 통계가 여기서 파생된다. */
  setRecords(records) {
    this.records = records;
    const ids = new Set(records.map((r) => r.record_id));
    for (const id of this._expected.keys()) if (!ids.has(id)) this._expected.delete(id);
    // 가려진(지워진) 기록이 지금 화면에 떠 있으면 다음 장까지 기다리지 않고 바로 뺀다.
    // 문장 벽에 부적절한 문장이 20초 더 흐르는 일이 없게.
    const removed = [...this._shownIds].some((id) => !ids.has(id));
    this._syncCount(false);
    if (!this._rendered) { this._showDeck(false); return; }
    if (removed && this._mode === "deck") this._showDeck(true);
  }

  /** 제출됐지만 아직 배가 나타나지 않은 기록. 숫자·통계에서 잠시 빼 둔다. */
  expect(record) { this._expected.set(record.record_id, 0); }

  /** 기다리던 기록을 센다. 연출 없이 바다에 놓인 기록(줄이 밀린 경우)도 여기로 온다. */
  reveal(recordId) {
    if (!this._expected.delete(recordId)) return;
    this._syncCount(true);
  }

  /** 화면에 보이는 기록 = 전체 − 아직 배가 안 나타난 것 */
  _visible() {
    if (!this._expected.size) return this.records;
    return this.records.filter((r) => !this._expected.has(r.record_id));
  }

  _syncCount(bump) {
    const n = this.records.length - this._expected.size;
    if (n === this._targetCount) return;
    const up = n > this._targetCount;
    this._targetCount = n;
    // 처음 적재는 애니메이션 없이 바로 (전시 시작할 때 0부터 428까지 올라가면 산만하다)
    if (!this._countReady) {
      this._countReady = true;
      this._shownCount = n;
      this._renderCount(n);
      return;
    }
    this._countFrom = this._shownCount;
    this._countT = 0;
    if (bump && up && this.el.plus) restart(this.el.plus, "pop");
  }

  _renderCount(n) {
    if (this.el.count) this.el.count.textContent = Math.round(n).toLocaleString("ko-KR");
  }

  /* ── 보고서 한 장 ──────────────────────────────────────────────────────── */

  /**
   * 통계 자리를 고정 문구로 바꾸고 자동 전환을 멈춘다. 보정 화면(?depths=1)처럼
   * 통계가 의미 없는 상태에서, 빈 칸을 띄워 고장처럼 보이게 하지 않으려고 둔다.
   */
  pin(label, html) {
    this._mode = "pin";
    this._show({ kind: "pin", tagline: "Calibration", label, value: "", headline: "", html,
                 extra: "", period: "", legend: "" }, true);
  }

  _showDeck(instant) {
    const c = this.deck.render(this._visible());
    this._dwell = c.sec || STAT_ROTATE_SEC;
    // 바로 바꿔 끼울 때(가려진 기록을 뺄 때)는 같은 장을 다시 그리는 것뿐이라 시계를 두고
    // 간다 — 진행 막대도 멈추지 않고 이어서 차므로 둘이 어긋나지 않는다.
    if (!instant) this._rotateT = 0;
    this._show(c, instant);
  }

  /**
   * 한 장을 꽂는다. 물러남(.out) → 갈아끼움 → 들어옴(.in) 순서이고, 들어오는 단계는
   * css 가 순번(--i)대로 늦춰 차례로 올린다: 선이 그어지고 → 라벨·값 → 결론 문장 →
   * 차트의 표식들 → 각주.
   * instant 면 움직임 없이 바로 바꾼다(보정 화면, 가려진 기록을 뺄 때).
   * 토큰이 있는 이유: 물러나는 0.46초 사이에 LIVE 가 끼어들 수 있다. 늦게 도착한
   * 예전 장이 LIVE 를 덮어쓰면 안 된다.
   */
  _show(c, instant) {
    const tok = ++this._tok;
    const el = this.el.report;
    if (!el) return;
    const swap = () => {
      if (tok !== this._tok) return;
      this._fill(c);
      el.classList.remove("out");
      el.classList.toggle("live", c.kind === "live");
      el.dataset.kind = c.kind;
      el.classList.toggle("still", !!instant);
      el.style.setProperty("--dwell", `${c.sec || this._dwell}s`);
      if (!instant) restart(el, "in");
      else el.classList.add("in");
    };
    this._rendered = true;
    if (instant || !el.classList.contains("in")) { swap(); return; }
    el.classList.add("out");
    el.classList.remove("hold");
    setTimeout(swap, OUT_MS);
  }

  _fill(c) {
    const e = this.el;
    if (c.kind === "live") {
      e.tag.innerHTML = `<b class="r-live">LIVE</b><i>${esc(c.tagline)}</i> — 방금 도착한 문장`;
      e.idx.textContent = c.stamp || "";
    } else {
      e.tag.innerHTML = `<i>Data Analysis</i>${c.tagline ? ` — ${esc(c.tagline)}` : ""}`;
      e.idx.textContent = c.index ? `${pad2(c.index)} / ${pad2(c.total)}` : "";
    }
    e.label.textContent = c.label || "";
    e.value.textContent = c.value || "";
    e.headline.innerHTML = keepTogether(c.headline || "");   // insights.js 가 참여자 글을 이미 esc 했다
    e.chart.innerHTML = c.html || "";
    e.chart.dataset.view = c.view || "";
    e.extra.textContent = c.extra || "";
    e.period.textContent = c.period || "";
    e.legend.innerHTML = c.legend || "";
    // 지금 화면에 걸린 기록들 — 나중에 이 중 하나가 가려지면 바로 다시 그린다
    this._shownIds = new Set(c.kind === "chapter" && c.view === "textwall"
      ? this._visible().slice(-12).map((r) => r.record_id)
      : c.kind === "live" ? [c.key.slice(5)] : []);
  }

  /* ── 새 문장 ────────────────────────────────────────────────────────────── */

  /** 카메라가 배로 가기 시작했다. 장을 넘기지 않고 그 자리에서 기다린다. */
  incoming() {
    if (this._mode === "pin") return;
    if (this._mode === "deck") this._resume = { frac: this._rotateT / (this._dwell || STAT_ROTATE_SEC) };
    this._mode = "incoming";
    if (this.el.report) this.el.report.classList.add("hold");
  }

  /**
   * 카메라가 도착해 배가 나타났다 — 숫자를 올리고, 문장 카드와 LIVE 장을 띄운다.
   * 문장 카드는 배가 다 선 뒤에 뜬다(css 의 지연). 레퍼런스: 카메라 먼저, 카드는 그다음.
   */
  showArrival(record) {
    this.reveal(record.record_id);
    if (this._mode !== "pin") {
      if (this._mode === "deck") this._resume = { frac: this._rotateT / (this._dwell || STAT_ROTATE_SEC) };
      this._mode = "live";
      const c = this.deck.renderLive(record, this._visible());
      c.sec = ARRIVAL_HOLD_SEC;
      if (this.el.report) this.el.report.classList.remove("hold");
      this._show(c, false);
    }
    this._fillLog(record);
    if (this.el.arrival) restart(this.el.arrival, "on");
  }

  hideArrival() {
    if (this.el.arrival) this.el.arrival.classList.remove("on");
  }

  /** 연출이 끝났다. 끊긴 장으로 돌아간다(머리말의 규칙). */
  endLive() {
    this.hideArrival();
    if (this._mode === "pin" || this._mode === "deck") return;
    const r = this._resume;
    this._resume = null;
    this._mode = "deck";
    if (this.el.report) this.el.report.classList.remove("hold");
    if (r && r.frac >= 0.5) this.deck.advance();
    this._showDeck(false);
  }

  /** 항해일지 카드. 레퍼런스 라벨의 "항목 ······ 값" 줄을 그대로 쓴다. */
  _fillLog(record) {
    const e = this.el;
    if (!e.arrival) return;
    const no = this.records.findIndex((r) => r.record_id === record.record_id) + 1;
    e.logNo.textContent = no > 0 ? `No. ${String(no).padStart(4, "0")}` : "";
    const text = record.text || "";
    e.text.textContent = text;
    // 설문은 80자까지 받는다. 긴 문장은 글자를 한 단계 줄여 카드가 배를 덮지 않게 한다.
    e.text.classList.toggle("long", text.length > 44);
    const who = record.display_name && record.display_name !== "익명" ? record.display_name : "익명";
    e.sign.textContent = `— ${who}`;
    e.from.textContent = record.region || "—";
    e.status.textContent = STATE_LABEL[record.state] || record.state || "—";
    e.cargo.textContent = (record.keywords || []).length ? record.keywords.join(" · ") : "—";
    const t = Date.parse(record.created_at);
    e.logged.textContent = Number.isFinite(t) ? fmtStamp(t) : "—";
  }

  /* ── 매 프레임 ──────────────────────────────────────────────────────────── */

  update(dt) {
    // 숫자 카운트업 — 새 문장이 보일 때만 돈다.
    if (this._countT < 1) {
      this._countT = Math.min(1, this._countT + dt / 1.1);
      const e = 1 - Math.pow(1 - this._countT, 3);
      this._shownCount = this._countFrom + (this._targetCount - this._countFrom) * e;
      this._renderCount(this._shownCount);
    }

    if (this._expected.size) {
      for (const [id, t] of this._expected) {
        if (t + dt > EXPECT_MAX_SEC) this.reveal(id);
        else this._expected.set(id, t + dt);
      }
    }

    if (this._mode !== "deck") return;
    this._rotateT += dt;
    if (this._rotateT >= this._dwell) {
      this.deck.advance();
      this._showDeck(false);
    }
  }
}

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * 강조한 낱말과 그 뒤의 조사를 한 덩어리로 묶는다 — "25%" / "가"나 "“돌아온" / "사람”이라고"
 * 처럼 줄이 강조 낱말 한가운데서 끊기지 않게. 한국어 줄바꿈(keep-all)은 <em> 경계와
 * % 기호 뒤를 끊어도 되는 자리로 본다.
 */
function keepTogether(html) {
  return String(html).replace(/(<em>[^<]*<\/em>[가-힣]*)/g, '<span class="nw">$1</span>');
}

/** 같은 클래스를 다시 붙여 CSS 애니메이션을 처음부터 돌린다 (강제 리플로우 한 번) */
function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
