/* =============================================================================
 * explore/report.js — 통계 보기(보고서 모드). 레퍼런스 dh-learning "Data Analysis" 보고서를 넘겨 보는 책처럼.
 *
 *   필터     지역(전체 + REGIONS) · 상태(전체 + STATES). 고르면 기록을 거른 뒤 같은 장을 다시 render —
 *            결론 문장·차트·각주(기간·n)가 그 범위 사람들 기준으로 바뀐다. 적은 인원이라고 숨기지 않는다
 *            (10-06 사용자). 5명 미만이면 결론 문장만 "아직 이르다"고 말한다 — 전시와 같은 규칙(insights.js MIN_N).
 *   장       stats/index.js 의 SLIDES 를 걸러 쓴다(EXPLORE_SLIDES · exploreFits). 목록은 거기 하나뿐이라 지도에서
 *            장을 더하면 여기에도 들어온다. 이전/다음 · 목차. 자동 넘김 없음.
 *   틀       카드 한 장을 틀 안에서만 확대(핀치·ctrl+휠)하고 넘치면 틀 안에서 스크롤한다. 페이지 전체 확대는 막혀 있다.
 *
 * 통계를 다시 그리지 않는다. StatDeck.render 가 주는 조각을 전시 패널과 같은 함수로 같은 카드에 꽂기만 한다
 * (panel.js fillReport · showReport). 차트 모양은 views.js + stats.css 하나다.
 * ========================================================================== */

import { REGIONS, STATES, STATE_LABEL } from "../config.js";
import { StatDeck, EXPLORE_SLIDES, exploreFits, METRIC } from "../stats/index.js";

const ZOOM_MAX = 3;

export class ReportView {
  /**
   * @param {import("../panel.js").Panel} panel 카드를 채운다(auto:false 패널)
   * @param {() => object[]} getRecords 지금 바다에 있는 기록 전부
   */
  constructor(panel, getRecords) {
    this.panel = panel;
    this.getRecords = getRecords;
    this.deck = new StatDeck(EXPLORE_SLIDES);
    this.filter = { region: null, state: null };
    this.at = 0;                   // EXPLORE_SLIDES 안의 번호
    this.open = false;
    this.scale = 1;
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $("exStats"), region: $("exRegion"), state: $("exState"), frame: $("exFrame"), sizer: $("exSizer"),
      report: $("report"), prev: $("exPrev"), next: $("exNext"), toc: $("exToc"), pos: $("exPos"),
      list: $("exTocList"), scope: $("exScope"), hint: $("exZoomHint"),
    };
    this._chips(this.el.region, "region", REGIONS.map((r) => [r, r]));
    this._chips(this.el.state, "state", STATES.map((s) => [s.id, s.label]));
    this.el.prev.addEventListener("click", () => this.step(-1));
    this.el.next.addEventListener("click", () => this.step(1));
    this.el.toc.addEventListener("click", () => this._toggleToc());
    this._bindZoom();
    window.addEventListener("resize", () => { if (this.open) this._layout(true); });
  }

  /** 칩 한 줄 — 맨 앞은 "전체". 고른 칩만 금색 테 */
  _chips(row, key, items) {
    const name = key === "region" ? "지역" : "상태";
    row.innerHTML = `<span class="ex-chips-name">${name}</span>` +
      [[null, "전체"], ...items].map(([v, label]) =>
        `<button type="button" class="ex-chip" role="radio" data-v="${v ?? ""}" aria-checked="${v === null}">${label}</button>`).join("");
    row.addEventListener("click", (e) => {
      const b = e.target.closest(".ex-chip");
      if (!b) return;
      this.filter[key] = b.dataset.v || null;
      for (const c of row.querySelectorAll(".ex-chip")) c.setAttribute("aria-checked", String(c === b));
      // 이 필터에서 지금 장을 못 보여주면(예: 상태를 하나로 걸러 "상태 막대"가 무의미) 다음 볼 수 있는 장으로
      if (!this._fits(this.at)) this.at = this._visible()[0] ?? 0;
      this.render("swap");
    });
  }

  _fits(i) { return exploreFits(EXPLORE_SLIDES[i], this.filter); }
  /** 지금 필터에서 볼 수 있는 장들(EXPLORE_SLIDES 번호) */
  _visible() { return EXPLORE_SLIDES.map((_, i) => i).filter((i) => this._fits(i)); }

  /** 걸러진 기록 — 지역·상태 둘 다 맞는 것 */
  records() {
    const { region, state } = this.filter;
    return this.getRecords().filter((r) => (!region || r.region === region) && (!state || r.state === state));
  }

  show() {
    this.open = true;
    this.el.root.classList.add("on");
    this.el.root.setAttribute("aria-hidden", "false");
    this._layout(false);
    this.render("fresh");
  }

  hide() {
    this.open = false;
    this._toggleToc(false);
    this.el.root.classList.remove("on");
    this.el.root.setAttribute("aria-hidden", "true");
  }

  step(d) {
    const vis = this._visible();
    const k = vis.indexOf(this.at);
    const n = vis[(Math.max(0, k) + d + vis.length) % vis.length];
    if (n === undefined) return;
    this.at = n;
    this.render("swap");
  }

  goTo(i) {
    this.at = i;
    this._toggleToc(false);
    this.render("swap");
  }

  /**
   * 지금 장을 지금 필터로 다시 그린다. 장 번호는 이 책 안의 번호(필터에서 볼 수 있는 장 기준)로 바꿔 단다 —
   * 전시의 "04 / 10" 을 그대로 두면 빠진 장 때문에 번호가 건너뛴다.
   * @param {"swap"|"fresh"|"still"} how 패널의 들어오는 연출
   */
  render(how = "still") {
    if (!this.open) return;
    const vis = this._visible();
    const k = Math.max(0, vis.indexOf(this.at));
    this.deck.goTo(this.at);
    // 장·필터가 바뀌면 원래 크기로. 같은 장을 다시 꽂을 때(새 문장이 들어와서)는 보던 확대를 그대로 둔다
    if (how !== "still") this._zoomTo(1);
    const box = this.panel.el.chart;
    const aspect = box && box.clientHeight ? box.clientWidth / box.clientHeight : undefined;
    const recs = this.records();
    const c = this.deck.render(recs, { aspect });
    c.index = k + 1;
    c.total = vis.length;
    const scope = this._scopeLabel();
    if (scope) c.period = `${scope} · ${c.period}`;
    this.panel.showReport(c, how);
    this.el.pos.textContent = ` ${pad2(k + 1)} / ${pad2(vis.length)}`;
    this.el.scope.textContent = scope ? ` · ${scope}` : "";
    this._fillToc(vis);
  }

  _scopeLabel() {
    const { region, state } = this.filter;
    return [region, state && (STATE_LABEL[state] || state)].filter(Boolean).join(" · ");
  }

  /* ── 목차 ──────────────────────────────────────────────────────────────── */

  _fillToc(vis) {
    this.el.list.innerHTML = vis.map((i, k) => {
      const s = EXPLORE_SLIDES[i];
      return `<button type="button" role="menuitem" class="ex-toc-i${i === this.at ? " on" : ""}" data-i="${i}">
        <b>${pad2(k + 1)}</b><span>${METRIC[s.metric].label}</span></button>`;
    }).join("");
    for (const b of this.el.list.querySelectorAll(".ex-toc-i")) b.onclick = () => this.goTo(Number(b.dataset.i));
  }

  _toggleToc(force) {
    const on = force ?? this.el.list.hidden;
    this.el.list.hidden = !on;
    this.el.toc.setAttribute("aria-expanded", String(on));
  }

  /* ── 틀 안 확대·스크롤 ─────────────────────────────────────────────────── */

  /**
   * 카드의 원래 크기 = 틀 크기. 확대는 카드에 scale 을 걸고, 그만큼 큰 빈 상자(sizer)로 틀 안에 스크롤 자리를 만든다.
   * 차트 모양을 자리 비율로 정하는 그림(버블)이 있어서, 틀 크기가 바뀌면 다시 그린다(rerender).
   */
  _layout(rerender) {
    const f = this.el.frame;
    const w = f.clientWidth, h = f.clientHeight;
    if (!w || !h) return;
    const changed = w !== this._baseW || h !== this._baseH;
    this._baseW = w; this._baseH = h;
    this.el.report.style.width = `${w}px`;
    this.el.report.style.height = `${h}px`;
    this._applyZoom();
    if (rerender && changed) this.render("still");
  }

  _applyZoom() {
    const s = this.scale;
    this.el.sizer.style.width = `${this._baseW * s}px`;
    this.el.sizer.style.height = `${this._baseH * s}px`;
    this.el.report.style.transform = s === 1 ? "" : `scale(${s})`;
    this.el.root.classList.toggle("zoomed", s > 1.01);
  }

  /** 배율을 s 로 — 틀 안의 점 (mx, my)(틀 좌표)가 제자리에 있게 스크롤을 맞춘다 */
  _zoomTo(s, mx = 0, my = 0) {
    const f = this.el.frame;
    const s0 = this.scale;
    s = Math.max(1, Math.min(ZOOM_MAX, s));
    if (s === s0) return;
    const cx = (f.scrollLeft + mx) / s0, cy = (f.scrollTop + my) / s0;   // 카드 원래 좌표
    this.scale = s;
    this._applyZoom();
    f.scrollLeft = cx * s - mx;
    f.scrollTop = cy * s - my;
  }

  _bindZoom() {
    const f = this.el.frame;
    // 한 손가락은 브라우저의 스크롤(틀 안), 두 손가락은 여기서 받아 확대한다
    let pinch = null;
    const rel = (t) => { const r = f.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    f.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 2) return;
      const a = rel(e.touches[0]), b = rel(e.touches[1]);
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.scale };
      this.el.hint.classList.add("gone");
    }, { passive: true });
    f.addEventListener("touchmove", (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const a = rel(e.touches[0]), b = rel(e.touches[1]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this._zoomTo(pinch.s * (d / Math.max(1, pinch.d)), (a.x + b.x) / 2, (a.y + b.y) / 2);
    }, { passive: false });
    const end = (e) => { if (e.touches.length < 2) pinch = null; };
    f.addEventListener("touchend", end);
    f.addEventListener("touchcancel", end);
    // 데스크톱: ctrl(트랙패드 핀치는 ctrl+휠로 온다) + 휠
    f.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = f.getBoundingClientRect();
      this._zoomTo(this.scale * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      this.el.hint.classList.add("gone");
    }, { passive: false });
    // 두 번 톡 — 2배로 / 원래대로(손가락 하나로도 키워 볼 수 있게)
    let lastTap = 0;
    f.addEventListener("click", (e) => {
      const now = performance.now();
      if (now - lastTap < 320) {
        const r = f.getBoundingClientRect();
        this._zoomTo(this.scale > 1.01 ? 1 : 2, e.clientX - r.left, e.clientY - r.top);
        this.el.hint.classList.add("gone");
        lastTap = 0;
      } else lastTap = now;
    });
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
