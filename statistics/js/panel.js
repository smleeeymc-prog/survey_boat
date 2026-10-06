/* =============================================================================
 * panel.js — 화면 위의 글자들과, 그것들이 나오는 시간.
 *
 * 미결정이던 "문장을 3D 씬 안에 띄울지, 별도 UI 레이어로 뺄지"는 UI 레이어로
 * 확정됐다(인수인계 6장). 그래서 3D에는 배 실루엣만 있고, 숫자·통계·문장은 전부
 * 여기서 처리한다. 씬 쪽 모듈은 이 파일을 모르고, 이 파일도 three.js를 모른다.
 *
 * 구성 (톤은 설문 시안 B′와 같다 — css/panel.css 머리말):
 *   위쪽 제목   위에서 짙어지는 어둠 위에 제목 · 누적 문장 수 · 다음 통계 장 예고. 늘 떠 있다.
 *   통계 카드   화면 가운데 어두운 유리. 장 번호 · 진행선 · 한 줄 결론 · 차트 · 각주.
 *              통계 시간에만 뜬다. 레퍼런스(dh-learning.kr)의 "Data Analysis" 카드 구성.
 *              무엇을 세고 어떻게 그리는지는 js/stats/ 에 있고, 여기는 받은 조각을 꽂는다.
 *   아래 문장   새 기록이 도착하면 화면 아래 자막으로 뜬다(설문의 질문 판과 같은 꼴).
 *              그 문장과 출발한 곳 · 지금의 자리 · 싣고 온 것 · 기록 시각.
 *
 * ── 화면의 두 시간 ─────────────────────────────────────────────────────────
 * 통계를 크게 보여주려면 화면 한가운데를 내줘야 하고, 그러면 바다가 가려진다. 그래서
 * 둘을 겹치지 않고 번갈아 보낸다 — 한 편의 필름처럼.
 *
 *   풍경   LANDSCAPE_SEC 초. 수평선까지 트인 바다와 흐르는 배들. 제목 아래 금색 선이
 *          차오르며 다음 장을 예고한다("다음 장 02 같은 낱말, 다른 이유").
 *   통계   바다가 한 톤 가라앉고 가운데 카드가 떠서 SESSION_CHAPTERS 장을 차례로 보여준다.
 *          다 보여주면 카드가 내려가고 다시 풍경. 다음 통계 시간은 그다음 장부터 잇는다.
 *
 * ── 새 배가 들어오면 — 딜레마를 푸는 규칙 ──────────────────────────────────
 * 통계 시간에도 배는 들어온다. 방금 제출한 사람은 화면에서 자기 배를 찾는다 — 이 화면에서
 * 가장 중요한 순간이다. 그래서 새 배가 언제나 먼저다:
 *
 *   incoming()   카메라가 그 배로 고개를 돌리기 시작   통계 카드가 바로 비켜선다(바다도 다시 밝게).
 *                                                     풍경이었다면 예고 선이 그 자리에 멈춘다
 *   showArrival  줌이 끝나 배가 선 순간                숫자 +1, 아래에 방금 도착한 문장
 *   hideArrival  줌을 푸는 중                          카드만 내린다
 *   endLive()    연출 끝                               끊긴 시간으로 돌아간다 — 통계였다면 카드가
 *                                                     다시 뜨고, 그 장을 절반도 못 보여줬으면 처음부터,
 *                                                     넘게 보여줬으면 다음 장으로. 풍경이었다면 남은 시간만큼
 *
 * 통계는 잃어버리지 않고 밀릴 뿐이다. 새 배가 잇달아 들어오면(줄 최대 3척) 그동안 통계는
 * 기다린다 — 그 시간엔 사람이 곧 통계다.
 *
 * 숫자도 같은 박자에 맞춘다. 기록은 제출되는 순간 들어오지만, 화면의 숫자와 통계는 그
 * 배가 관람객 눈앞에 나타날 때 +1 된다(expect/reveal). 숫자가 먼저 올라가고 몇 초 뒤에
 * 배가 오면, 관람객에게는 둘이 서로 다른 사건으로 보인다.
 * ========================================================================== */

import {
  STAT_ROTATE_SEC, STATE_LABEL, ARRIVAL_HOLD_SEC,
  LANDSCAPE_SEC, LANDSCAPE_FIRST_SEC, SESSION_CHAPTERS,
} from "./config.js";
import { StatDeck } from "./stats/index.js";
import { fmtStamp } from "./stats/text.js";

/** 장이 물러나는 시간(ms). css/panel.css 의 .report.out 과 맞춘다 */
const OUT_MS = 460;
/** 제출은 됐는데 연출 차례가 안 온 기록을 숫자에서 빼 두는 최대 시간(초). 넘으면 그냥 센다 —
 *  연출 쪽에서 무슨 일이 생겨도 숫자가 영영 모자란 채로 남지 않게 하는 안전장치다. */
const EXPECT_MAX_SEC = 40;

export class Panel {
  /**
   * @param {Document} root
   * @param {{auto?: boolean}} [o] auto=false — 시간표(풍경/통계)를 돌리지 않는다. 인터랙티브 입구(explore.html)는
   *        관람객이 통계를 직접 열고, 이 패널에서는 누적 수·아래 문장 카드·보고서 채우기만 쓴다.
   */
  constructor(root = document, { auto = true } = {}) {
    this.auto = auto;
    const $ = (id) => root.getElementById(id);
    this.el = {
      count: $("countNum"), plus: $("countPlus"),
      next: $("mNext"), nextBar: $("mBarFill"), nextIdx: $("mNextIdx"), nextLabel: $("mNextLabel"),
      nextTag: $("mNextTag"),
      dim: $("stageDim"),
      report: $("report"), num: $("rNum"), idx: $("rIdx"),
      label: $("rLabel"), headline: $("rHeadline"),
      chart: $("statRows"), extra: $("rExtra"), period: $("rPeriod"), legend: $("rLegend"),
      arrival: $("arrival"), logNo: $("logNo"), text: $("arrivalText"), sign: $("arrivalSign"),
      from: $("logFrom"), status: $("logStatus"), cargo: $("logCargo"), logged: $("logLogged"),
    };
    this.records = [];
    this.deck = new StatDeck();
    this._expected = new Map();   // record_id → 기다린 시간(초)
    this._mode = "boot";          // boot | landscape | session | arrival | pin
    this._landT = 0;
    this._landSec = LANDSCAPE_FIRST_SEC;
    this._session = null;         // { left } — 이번 통계 시간에 남은 장 수
    this._paused = null;          // 새 배 때문에 끊긴 시간
    this._rotateT = 0;
    this._dwell = STAT_ROTATE_SEC;
    this._shownCount = 0;
    this._targetCount = 0;
    this._countT = 1;
    this._tok = 0;
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
    if (this._mode === "boot") {
      if (this.auto) this._enterLandscape(LANDSCAPE_FIRST_SEC);
      else this._mode = "free";
      return;
    }
    if (removed && this._mode === "session") this._showChapter("still");
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

  /* ── 화면의 시간 ───────────────────────────────────────────────────────── */

  /** 무대 — 어느 카드가 떠 있고 바다가 가라앉았는가 */
  _stage(kind) {
    const e = this.el;
    e.report && e.report.classList.toggle("show", kind === "session" || kind === "pin");
    e.dim && e.dim.classList.toggle("on", kind === "session");
    e.next && e.next.classList.toggle("on", kind === "landscape");
  }

  /** 풍경. fromT 초가 이미 지난 것으로 시작한다(새 배 때문에 끊겼다 이어질 때). */
  _enterLandscape(sec, fromT = 0) {
    this._mode = "landscape";
    this._landSec = sec;
    this._landT = fromT;
    const p = this.deck.peek();
    if (this.el.nextIdx) this.el.nextIdx.textContent = pad2(p.index);
    if (this.el.nextLabel) this.el.nextLabel.textContent = p.label;
    if (this.el.nextTag) this.el.nextTag.textContent = "다음 장";
    if (this.el.nextBar) {
      this.el.nextBar.style.setProperty("--land", `${sec}s`);
      this.el.nextBar.style.setProperty("--land-from", `${-fromT}s`);
      restart(this.el.nextBar, "run");
    }
    this._stage("landscape");
  }

  _startSession() {
    this._mode = "session";
    this._session = { left: SESSION_CHAPTERS };
    this._stage("session");
    this._showChapter("fresh");
  }

  _nextChapter() {
    this.deck.advance();
    this._session.left--;
    if (this._session.left <= 0) { this._endSession(); return; }
    this._showChapter("swap");
  }

  _endSession() {
    this._session = null;
    this._enterLandscape(LANDSCAPE_SEC);
  }

  /**
   * 시간을 멈추고 제목 아랫줄(다음 장 예고 자리)에 고정 안내를 적는다. 보정 화면(?depths=1)처럼 통계가
   * 의미 없는 상태에서, 빈 통계를 띄워 고장처럼 보이게 하지 않으려고 둔다.
   * 가운데 카드는 띄우지 않는다 — 보정 화면에서 보려는 배들이 바로 그 뒤에 있다.
   */
  pin(label, text) {
    this._mode = "pin";
    const e = this.el;
    if (e.nextIdx) e.nextIdx.textContent = "—";
    if (e.nextLabel) e.nextLabel.textContent = label;
    if (e.nextTag) e.nextTag.textContent = text;
    if (e.nextBar) e.nextBar.classList.remove("run");
    this._stage("landscape");
  }

  /* ── 통계 카드 한 장 ───────────────────────────────────────────────────── */

  _showChapter(how) {
    // 차트 자리의 비율을 재서 넘긴다. 카드가 숨어 있어도(visibility) 자리 크기는 잡혀 있다.
    const box = this.el.chart;
    const aspect = box && box.clientHeight ? box.clientWidth / box.clientHeight : undefined;
    const c = this.deck.render(this._visible(), { aspect });
    this._dwell = c.sec || STAT_ROTATE_SEC;
    // 바로 바꿔 끼울 때(가려진 기록을 뺄 때)는 같은 장을 다시 그리는 것뿐이라 시계를 두고
    // 간다 — 진행 막대도 멈추지 않고 이어서 차므로 둘이 어긋나지 않는다.
    if (how !== "still") this._rotateT = 0;
    this._show(c, how);
  }

  /**
   * 한 장을 꽂는다.
   *   swap   물러남(.out) → 갈아끼움 → 들어옴(.in). 통계 시간 안에서 장이 넘어갈 때
   *   fresh  바로 갈아끼우고 들어옴. 카드가 막 뜰 때(물러날 옛 장이 화면에 없다)
   *   still  움직임 없이 바꿔 끼움. 보정 화면, 가려진 기록을 뺄 때
   * 들어오는 단계는 css 가 순번(--i)대로 늦춰 차례로 올린다: 선 → 라벨·값 → 결론 → 표식 → 각주.
   * 토큰이 있는 이유: 물러나는 0.46초 사이에 새 배가 끼어들 수 있다. 늦게 도착한 갈아끼우기가
   * 비켜선 카드에 옛 장을 다시 채우면 안 된다.
   */
  _show(c, how) {
    const tok = ++this._tok;
    const el = this.el.report;
    if (!el) return;
    const swap = () => {
      if (tok !== this._tok) return;
      this._fill(c);
      el.classList.remove("out");
      el.dataset.kind = c.kind;
      el.classList.toggle("still", how === "still");
      el.style.setProperty("--dwell", `${c.sec || this._dwell}s`);
      if (how === "still") el.classList.add("in");
      else restart(el, "in");
    };
    if (how !== "swap" || !el.classList.contains("in")) { swap(); return; }
    el.classList.remove("in");
    el.classList.add("out");
    setTimeout(swap, OUT_MS);
  }

  /** 인터랙티브가 고른 장을 꽂는다 — 전시와 같은 카드·같은 들어오는 연출(swap · fresh · still) */
  showReport(c, how = "swap") { this._show(c, how); }

  _fill(c) {
    fillReport(this.el, c);
    // 지금 화면에 걸린 기록들 — 나중에 이 중 하나가 가려지면 바로 다시 그린다
    this._shownIds = new Set(c.kind === "chapter" && c.view === "textwall"
      ? this._visible().slice(-12).map((r) => r.record_id) : []);
  }

  /* ── 새 배 ──────────────────────────────────────────────────────────────── */

  /** 카메라가 새 배로 고개를 돌리기 시작했다. 통계 카드는 바로 비켜선다(머리말의 규칙). */
  incoming() {
    if (!this.auto) return;   // 시간표가 없으니 멈출 것도 없다
    if (this._mode === "pin" || this._mode === "arrival") return;
    this._paused = this._mode === "session"
      ? { mode: "session", frac: this._rotateT / (this._dwell || STAT_ROTATE_SEC) }
      : { mode: "landscape", landT: this._landT, landSec: this._landSec };
    this._mode = "arrival";
    this._tok++;                  // 물러나는 중이던 장의 갈아끼우기를 취소
    this._stage("arrival");
  }

  /**
   * 줌이 끝나 배가 섰다 — 숫자를 올리고 아래에 방금 도착한 문장을 띄운다.
   * 카드는 배가 다 선 뒤에 뜬다(css 의 지연). 레퍼런스: 카메라 먼저, 카드는 그다음.
   */
  showArrival(record, { hold = ARRIVAL_HOLD_SEC } = {}) {
    this.reveal(record.record_id);
    if (this._mode !== "pin" && this._mode !== "arrival") this.incoming();
    this._fillLog(record);
    // 금색 가는 선이 카드가 떠 있는 시간(머무는 시간)에 걸쳐 찬다. 정해진 시간이 없으면(인터랙티브에서
    // 관람객이 고른 배 — 닫을 때까지 머문다) 선을 채우지 않는다
    if (this.el.arrival) {
      const timed = Number.isFinite(hold);
      this.el.arrival.style.setProperty("--hold", `${timed ? hold : 0}s`);
      this.el.arrival.classList.toggle("untimed", !timed);
      restart(this.el.arrival, "on");
    }
  }

  hideArrival() {
    if (this.el.arrival) this.el.arrival.classList.remove("on");
  }

  /** 연출이 끝났다. 끊긴 시간으로 돌아간다(머리말의 규칙). */
  endLive() {
    this.hideArrival();
    if (!this.auto || this._mode !== "arrival") return;
    const p = this._paused || { mode: "landscape", landT: 0, landSec: LANDSCAPE_SEC };
    this._paused = null;
    if (p.mode === "session" && this._session) {
      this._mode = "session";
      this._stage("session");
      if (p.frac >= 0.5) {
        this.deck.advance();
        this._session.left--;
        if (this._session.left <= 0) { this._endSession(); return; }
      }
      this._showChapter("fresh");
      return;
    }
    this._enterLandscape(p.landSec || LANDSCAPE_SEC, p.landT || 0);
  }

  /** 방금 도착한 문장과 그 기록(출발한 곳 · 지금의 자리 · 싣고 온 것 · 기록 시각). */
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

    if (!this.auto) return;
    if (this._mode === "landscape") {
      this._landT += dt;
      if (this._landT >= this._landSec) this._startSession();
    } else if (this._mode === "session") {
      this._rotateT += dt;
      if (this._rotateT >= this._dwell) this._nextChapter();
    }
  }
}

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * 보고서 한 장(stats/index.js StatDeck.render 의 조각)을 카드 요소들에 꽂는다. 전시 패널과 인터랙티브
 * 보고서가 같이 쓴다 — 통계를 두 벌로 그리지 않고 같은 조각을 같은 자리에 꽂기만 한다(HANDOFF-map 25.2).
 * @param {object} e  num · idx · label · headline · chart · extra · period · legend 요소
 */
export function fillReport(e, c) {
  // 설문의 단계 표시줄과 같은 꼴 — 명조 장 번호 · 자간 넓은 이름 · 오른쪽 "01 / 09"
  e.num.textContent = c.index ? pad2(c.index) : "";
  e.idx.textContent = c.index ? `${pad2(c.index)} / ${pad2(c.total)}` : "";
  e.label.textContent = c.label || "";
  e.headline.innerHTML = keepTogether(c.headline || "");   // insights.js 가 참여자 글을 이미 esc 했다
  e.chart.innerHTML = c.html || "";
  e.chart.dataset.view = c.view || "";
  e.extra.textContent = c.extra || "";
  e.period.textContent = c.period || "";
  e.legend.innerHTML = c.legend || "";
}

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
