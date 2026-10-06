/* =============================================================================
 * explore/main.js — 인터랙티브 '머무름의 지도'(explore.html)의 진행.
 *
 * 장면은 전시와 같은 world.js, 글자 카드는 같은 panel.js(시간표 없이 — auto:false), 통계는 같은 stats/.
 * 여기서 정하는 건 "관람객이 무엇을 하고 있나"(mode)와 그에 따른 반응뿐이다.
 *
 *   browse   바다를 둘러보는 중 — 끌기·핀치(view-control), 배 누르기, "통계 보기" 버튼
 *   focus    배 한 척을 크게 보는 중 — 누른 배(pick, 닫을 때까지) · 새로 온 배(arrival, 전시처럼 8초) ·
 *            설문에서 막 넘어온 사람의 자기 배(me, 8초 뒤 줌아웃 → 둘러보기 안내)
 *   stats    통계 보기 — 바다 조작은 꺼지고 보고서 틀이 손을 받는다(report.js)
 *
 * 새 기록이 오면(10-06 사용자 결정): 둘러보는 중이면 전시처럼 그 배로 줌. 다른 배를 보거나 통계를 보는 중이면
 * 끊지 않고 알림("새 배가 도착했어요 · 보기")과 숫자만. 새로 온 배를 보여주는 중에 또 오면 전시처럼 줄을 세운다.
 * ========================================================================== */

import * as C from "../config.js";
import { MapWorld } from "../world.js";
import { Panel } from "../panel.js";
import { pickStore } from "../store.js";
import { runSelfChecks } from "../selfcheck.js";
import { ViewControl } from "./view-control.js";
import { pickBoat } from "./pick.js";
import { ReportView } from "./report.js";
import { Guide, Toast } from "./notice.js";

const qs = new URLSearchParams(location.search);
const TIME_KEY = C.TIME_OF_DAY[qs.get("time")] ? qs.get("time") : C.DEFAULT_TIME_KEY;
const DEBUG = qs.get("debug") === "1";
if (DEBUG) document.documentElement.dataset.debug = "1";
const GLASS_PIN = ["lens", "blur", "flat"].includes(qs.get("glass")) ? qs.get("glass") : null;
if (GLASS_PIN) document.documentElement.dataset.glass = GLASS_PIN;
// 설문을 막 끝내고 넘어온 사람의 기록 id(ui/survey.js mapUrl). 공개 문서 id 라 비밀이 아니다.
const ME = qs.get("me") || null;

const ARRIVAL_QUEUE_MAX = 3;   // 새 배 연출 줄의 상한(전시와 같다)
// 카드 머리 이름표 — 어떤 배를 보고 있는지
const TAG = { arrival: "방금 도착한 문장", pick: "바다에 떠 있는 문장", me: "나의 문장" };
// 이 페이지에 꼭 있어야 하는 요소(selfcheck 8) — 하나만 빠져도 조작 하나가 조용히 죽는다
const EXPLORE_IDS = ["panel", "countNum", "countPlus", "stageDim", "report", "rNum", "rIdx", "rLabel",
  "rHeadline", "statRows", "rExtra", "rPeriod", "rLegend", "arrival", "logTag", "logNo", "arrivalText",
  "arrivalSign", "logFrom", "logStatus", "logCargo", "logLogged", "exTouch", "exGuide", "exToast", "exOpen",
  "exCardClose", "exStats", "exStatsClose", "exRegion", "exState", "exFrame", "exSizer", "exPrev", "exNext",
  "exToc", "exPos", "exTocList"];

class Explore {
  constructor(canvas) {
    const $ = (id) => document.getElementById(id);
    this.world = new MapWorld(canvas, { timeKey: TIME_KEY, glassPin: GLASS_PIN });
    this.panel = new Panel(document, { auto: false });
    this.records = [];
    this.pending = [];             // 새 배 연출 줄(기록)
    this.focus = null;             // { kind: "arrival" | "pick" | "me", boat }
    this.next = null;              // 지금 배를 풀고 이어서 볼 배(다른 배를 눌렀을 때 · 알림의 "보기")
    this.me = { id: ME, wait: ME ? C.EXPLORE_TIME.meWait : 0 };
    this.el = { open: $("exOpen"), tag: $("logTag"), dim: $("stageDim") };

    this.view = new ViewControl($("exTouch"), this.world.cam, {
      onTap: (x, y) => this._tap(x, y),
      onTouch: () => this.guide.touched(),
    });
    this.world.onFrame = (dt) => {
      this.view.update(dt);
      // 렌즈를 1.5배쯤 당기면 틸트시프트 초점이 화면 가운데로 다 옮겨 간다(tilt-shift.js lensT)
      this.world.lensT = Math.min(1, (this.view.zoom - 1) / 0.5);
    };
    this.world.onPresent = (ev, b) => this._onPresent(ev, b);
    this.guide = new Guide($("exGuide"));
    this.toast = new Toast($("exToast"), (r) => this._openRecord(r));
    this.report = new ReportView(this.panel, () => this.records);

    this.el.open.addEventListener("click", () => this._openStats());
    $("exStatsClose").addEventListener("click", () => this._closeStats());
    $("exCardClose").addEventListener("click", () => this.world.release());
    this._setMode("boot");
  }

  // 콘솔에서 들여다보는 이름들 — 전시(main.js)와 같게
  get boats() { return this.world.boats; }
  get fleet() { return this.world.fleet; }
  get arriving() { return this.world.presenting; }
  get cam() { return this.world.cam; }
  get tilt() { return this.world.tilt; }

  async load() {
    await this.world.load();
    runSelfChecks(this.world, { domIds: EXPLORE_IDS });
  }

  /** 화면 상태 — css/explore.css 가 html[data-ex] 로 버튼·제목·어둠을 맞춘다 */
  _setMode(m) {
    this.mode = m;
    document.documentElement.dataset.ex = m;
    this.view.enabled = m === "browse";
    if (m !== "browse") this.view.reset();
    this.el.dim.classList.toggle("on", m === "stats");
  }

  connect(store) {
    store.subscribe({
      onReady: (records) => {
        // 시작할 때 이미 쌓여 있던 기록은 연출 없이 바다에 놓는다(전시와 같다)
        for (const r of records) this.world.placeRecord(r);
        this.records = records.slice();
        this.panel.setRecords(this.records);
        this._setMode("browse");
        // 설문에서 막 넘어왔으면 자기 배부터. 아직 안 보이면(DB 반영이 늦으면) 잠시 기다린다(update)
        const mine = this.me.id && this.world.boatOf(this.me.id);
        if (mine) { this.me.wait = 0; this._present(mine, "me"); }
        else if (!this.me.id) this.guide.show();
      },
      onInsert: (record) => this._insert(record),
      onRemove: (id) => this._remove(id),
    });
  }

  _insert(record) {
    this.records.push(record);
    // 숫자는 배가 눈앞에 나타날 때 +1 된다(panel.js 머리말) — 연출을 안 하면 아래에서 바로 센다
    this.panel.expect(record);
    this.panel.setRecords(this.records);

    if (this.me.wait > 0 && record.record_id === this.me.id && !this.world.presenting) {
      this.me.wait = 0;
      this._present(this.world.spawnArrival(record), "me", true);
      return;
    }
    if (this.mode === "browse" && !this.world.presenting && this.me.wait <= 0) {
      this._present(this.world.spawnArrival(record), "arrival", true);
      return;
    }
    if (this.focus && this.focus.kind === "arrival" && this.mode === "focus") {
      // 새로 온 배를 보여주는 중 — 전시처럼 줄을 세운다. 줄이 길면 가장 오래 기다린 것부터 연출 없이 놓는다
      this.pending.push(record);
      while (this.pending.length > ARRIVAL_QUEUE_MAX) this._place(this.pending.shift());
      return;
    }
    // 고른 배·자기 배·통계를 보는 중 — 끊지 않고 알림과 숫자만
    this._place(record);
    // 알림이 아직 떠 있는 동안 또 오면 몇 척인지 센다
    this._unseen = this.toast.record ? (this._unseen || 1) + 1 : 1;
    this.toast.show(record, this._unseen);
    if (this.mode === "stats") this.report.render("still");
  }

  /** 연출 없이 바다에 놓고 센다 */
  _place(record) {
    this.world.placeRecord(record);
    this.panel.reveal(record.record_id);
  }

  _remove(id) {
    if (this.next && this.next.record.record_id === id) this.next = null;
    this.world.removeBoat(id);   // 보고 있던 배면 world 가 "cancel"
    const q = this.pending.findIndex((r) => r.record_id === id);
    if (q >= 0) this.pending.splice(q, 1);
    const j = this.records.findIndex((r) => r.record_id === id);
    if (j >= 0) { this.records.splice(j, 1); this.panel.setRecords(this.records); }
    this.toast.forget(id);
    if (this.mode === "stats") this.report.render("still");
  }

  /* ── 배 보기 ──────────────────────────────────────────────────────────── */

  /**
   * @param {object} boat
   * @param {"arrival"|"pick"|"me"} kind
   * @param {boolean} [appear] 새로 나타나는 배인가(새 기록) — 아니면 이미 떠 있는 배를 보러 간다
   */
  _present(boat, kind, appear = false) {
    this.focus = { kind, boat };
    this._setMode("focus");
    this.guide.hide();
    // 누른 배는 닫을 때까지 머문다. 새로 온 배·자기 배는 전시처럼 정해진 시간 뒤 줌아웃
    this.world.present(boat, { appear, hold: kind === "pick" ? Infinity : C.ARRIVAL_HOLD_SEC });
  }

  _onPresent(ev, b) {
    if (ev === "shown") {
      this.el.tag.textContent = TAG[this.focus ? this.focus.kind : "pick"];
      this.panel.showArrival(b.record, { hold: b.holdSec });
      return;
    }
    if (ev === "hiding") { this.panel.hideArrival(); return; }
    if (ev !== "done" && ev !== "cancel") return;
    // 연출이 끝났다(또는 그 배가 지워졌다) — 이어서 볼 배 → 줄 선 새 배 → 둘러보기
    this.panel.hideArrival();
    const was = this.focus && this.focus.kind;
    this.focus = null;
    const nb = this.next;
    this.next = null;
    if (nb && this.world.boats.includes(nb)) { this._present(nb, "pick"); return; }
    if (this.pending.length) { this._present(this.world.spawnArrival(this.pending.shift()), "arrival", true); return; }
    this._setMode("browse");
    // 자기 배를 보고 나온 사람은 여기서부터 둘러보기 — 안내를 띄운다
    if (was === "me" || !this.guide.shown) this.guide.show();
  }

  _tap(x, y) {
    if (this.mode !== "browse" && this.mode !== "focus") return;
    const b = pickBoat(this.world, x, y);
    if (this.world.presenting) {
      // 보는 중에 바다를 누르면 닫는다. 다른 배를 눌렀으면 닫고 그 배로
      if (b && b !== this.world.presenting) this.next = b;
      this.world.release();
      return;
    }
    if (b) this._present(b, "pick");
  }

  /** 알림의 "보기" — 그 배로 간다. 통계 중이면 닫고, 다른 배를 보는 중이면 그걸 풀고 */
  _openRecord(record) {
    const b = this.world.boatOf(record.record_id);
    if (!b) return;
    if (this.mode === "stats") this._closeStats();
    if (this.world.presenting) { if (b !== this.world.presenting) this.next = b; this.world.release(); return; }
    this._present(b, "pick");
  }

  /* ── 통계 보기 ─────────────────────────────────────────────────────────── */

  _openStats() {
    if (this.mode !== "browse" || this.world.presenting) return;
    this._setMode("stats");
    this.guide.hide();
    this.report.show();
  }

  _closeStats() {
    if (this.mode !== "stats") return;
    this.report.hide();
    this._setMode("browse");
  }

  /* ── 매 프레임 ─────────────────────────────────────────────────────────── */

  frame() {
    requestAnimationFrame(() => this.frame());
    const dt = this.world.tick();
    this.panel.update(dt);
    this.guide.update(dt);
    this.toast.update(dt);
    // 자기 배를 기다리는 중 — 시간이 다 되면 그냥 둘러보기로
    if (this.me.wait > 0 && this.mode === "browse") {
      this.me.wait -= dt;
      if (this.me.wait <= 0) this.guide.show();
    }
    if (DEBUG) this._hud(dt);
  }

  _hud(dt) {
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT < 0.4) return;
    this._hudT = 0;
    const W = this.world, v = W.cam.view, info = W.renderer.info.render;
    document.getElementById("hud").textContent =
      `${(1 / Math.max(dt, 1e-4)).toFixed(0)} fps  mode ${this.mode}\n` +
      `boats ${W.boats.length} / records ${this.records.length}\n` +
      `view yaw ${(v.yaw * 57.3).toFixed(1)}° pitch ${(v.pitch * 57.3).toFixed(1)}° ×${this.view.zoom.toFixed(2)}\n` +
      `draw calls ${info.calls}  glass ${document.documentElement.dataset.glass}`;
  }
}

// ── 부팅 ────────────────────────────────────────────────────────────────────
const app = new Explore(document.getElementById("scene"));
app.frame();
app.load()
  .then(() => app.connect(pickStore(qs, Number(qs.get("seed") ?? 46), Number(qs.get("interval") ?? 14))))
  .catch((err) => {
    console.error("모델(GLB) 로드 실패:", err);
    app.connect(pickStore(qs, Number(qs.get("seed") ?? 46), 0));
  });

window.__map = app;   // 콘솔에서 들여다볼 수 있게
