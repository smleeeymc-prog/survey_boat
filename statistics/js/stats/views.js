/* =============================================================================
 * stats/views.js — 통계를 어떻게 그리는가.
 *
 * 한 항목이 한 모듈이고, 서로를 모른다. 계약은 이것뿐이다:
 *
 *     accepts: "rows" | "groups" | "matrix" | "pairs" | "scores" | "pulse" | "stream"
 *     render(data, ctx) → HTML 문자열
 *     legend?(data)     → 각주 줄 오른쪽에 붙는 작은 범례 HTML (선택)
 *
 * data 의 구조는 accepts 가 정한다 (metrics.js 머리말의 shape 표). ctx 에는
 *   highlight  결론 문장이 가리키는 것 (insights.js) — 그것만 강조색, 나머지는 한 회색
 * three.js도, 패널의 DOM 구조도, 어떤 지표였는지도 모른다. 이 화면 밖(다른 레이아웃,
 * 다른 페이지, 인쇄물)으로 옮길 때 가져갈 것은 여기 함수 하나와 css/stats.css 의 같은
 * 이름 블록 하나뿐이다.
 *
 * ── 이 화면에는 hover 가 없다 ──────────────────────────────────────────────
 * 전시장 기기에는 입력장치가 없다. 값을 툴팁에 숨길 수 없으므로 값은 화면에 직접 적는다.
 * 대신 "모든 점에 숫자"는 안 된다 — 결론이 가리키는 값만 진하게, 나머지는 옅게.
 *
 * ── 색 ────────────────────────────────────────────────────────────────────
 * 크기 비교(히트맵)는 한 색상의 밝기 계단 하나(시퀀셜). 0 기준으로 갈리는 값(정착 온도)만
 * 두 색 + 무채색 중앙(다이버징). 나머지는 강조형 — 결론이 가리키는 것만 금색, 나머지는 한 회색.
 * 글자는 데이터 색을 입지 않는다(값·라벨은 먹색 계열). 색은 글자 옆의 표식이 입는다.
 *
 * ── 모션 ───────────────────────────────────────────────────────────────────
 * 모든 표식에 --i(등장 순번)를 붙인다. css/stats.css 가 그 순번만큼 늦춰 차례로 올린다 —
 * 막대는 기준선에서 자라고, 원은 부풀고, 호는 그어지고, 칸은 대각선으로 번진다.
 * 움직임을 줄이도록 설정한 환경에서는 CSS가 전부 끄고 마지막 모습만 보여준다.
 * ========================================================================== */

import { esc, num, pct, josa } from "./text.js";

/** 순위별 글자 크기 배수. 1위만 크고, 뒤로 갈수록 계단식으로 작아진다. */
const TIERS = [1.00, 0.90, 0.76, 0.76, 0.58, 0.58];
const TIER_TAIL = 0.46;

const asSet = (h) => new Set(Array.isArray(h) ? h : []);

export const VIEWS = {
  /* ── rows ──────────────────────────────────────────────────────────────── */

  /**
   * 낱말이 빈도순으로 작아지는 한 문단 (시안 스크린샷). 숫자 없이 분포를 보여준다 —
   * 관람객이 읽는 건 "몇 명"이 아니라 "무엇이 많은가"다. 여기서는 낱말이 곧 표식이라
   * 1위 낱말만 금색이다(시안 그대로).
   */
  ranking: {
    accepts: "rows",
    render({ items }) {
      const html = items.slice(0, 9).map((r, i) => {
        const size = TIERS[i] ?? TIER_TAIL;
        const tier = `t${i === 0 ? 1 : i === 1 ? 2 : i <= 3 ? 3 : i <= 5 ? 4 : 5}`;
        return `<span class="sv-rank-item ${tier}" style="--i:${i};font-size:calc(var(--stat-base) * ${size})">${esc(r.label)}</span>`;
      }).join("");
      return `<span class="sv-ranking">${html}</span>`;
    },
  },

  /**
   * 비율 막대. 막대 길이는 1위 대비가 아니라 전체 대비다 — 1위 기준으로 늘리면 어떤 분포든
   * 맨 위가 꽉 차서 "고르게 퍼져 있다"와 "하나로 쏠렸다"가 같아 보인다.
   * 강조형: 결론이 가리키는 막대만 금색, 나머지는 한 회색.
   */
  bars: {
    accepts: "rows",
    render({ items }, ctx = {}) {
      const hl = asSet(ctx.highlight);
      const html = items.slice(0, 6).map((r, i) => {
        const on = hl.size ? hl.has(r.label) : i === 0;
        return `
        <span class="sv-bar-row${on ? " lead" : ""}" style="--i:${i}">
          <span class="sv-bar-label">${esc(r.label)}</span>
          <span class="sv-bar-track"><span class="sv-bar-fill" style="width:${(r.share * 100).toFixed(1)}%"></span></span>
          <span class="sv-bar-pct">${Math.round(r.share * 100)}<i>%</i></span>
        </span>`;
      }).join("");
      return `<span class="sv-bars">${html}</span>`;
    },
  },

  /**
   * 퍼짐 — "고르게 나뉘었는가"를 보이는 그림. 선택지 전부(아무도 안 고른 것까지)를 한 줄씩 세우고,
   * 모두가 똑같이 골랐다면 막대가 닿을 자리(1/선택지 수)에 점선을 세운다. 막대가 점선 언저리에 모여
   * 있으면 고르게 퍼진 것이고, 몇 개만 멀리 넘어가면 쏠린 것이다 — 결론 문장이 어느 쪽이든 같은 그림이 답한다.
   * 예전 랭킹 문단은 낱말 크기로만 말해서 "얼마나 고른가"가 안 읽혔고, 카드 가운데 두 줄만 차지해
   * 위아래가 비었다(10-03 사용자). 줄이 선택지 수만큼이라 카드 높이를 다 쓴다.
   * 축 끝 = max(1위 비율, 기준의 두 배) — 점선이 늘 트랙 절반 안쪽에 와서 넘고 못 미침이 양쪽으로 다 보인다.
   */
  spread: {
    accepts: "rows",
    render({ items, options }, ctx = {}) {
      const rows = [...items];
      for (const o of options || []) if (!rows.some((r) => r.label === o)) rows.push({ label: o, count: 0, share: 0 });
      if (!rows.length) return `<span class="sv-spread"></span>`;
      const hl = asSet(ctx.highlight);
      // 결론이 빈 강조를 넘기면("고르게 퍼져 있다") 막대는 전부 회색, 기준 점선이 강조색을 입는다
      const evenLead = Array.isArray(ctx.highlight) && !ctx.highlight.length;
      const even = 1 / rows.length;
      const axis = Math.max(even * 2, ...rows.map((r) => r.share));
      const at = (v) => `${((v / axis) * 100).toFixed(1)}%`;
      const html = rows.map((r, i) => {
        const on = Array.isArray(ctx.highlight) ? hl.has(r.label) : i === 0;
        return `
        <span class="sv-sp-row${on ? " lead" : ""}${r.count ? "" : " none"}" style="--i:${i};--r:${i + 2}">
          <span class="sv-sp-label">${esc(r.label)}</span>
          <span class="sv-bar-track"><span class="sv-bar-fill" style="width:${at(r.share)}"></span></span>
          <span class="sv-bar-pct">${Math.round(r.share * 100)}<i>%</i></span>
        </span>`;
      }).join("");
      return `<span class="sv-spread${evenLead ? " even-lead" : ""}" style="--even:${at(even)};--rows:${rows.length}">
        <span class="sv-sp-cap"><span>고르게 나뉘면 ${Math.round(even * 100)}%</span></span>${html}
        <span class="sv-sp-even" aria-hidden="true"></span>
      </span>`;
    },
  },

  /**
   * 버블 — 강조한 것(결론이 가리키는 이유)을 가운데 먹색으로, 나머지는 옅은 회색으로 둘러싼다
   * (레퍼런스 2장: 최다 이유를 가운데 검게). 넓이가 빈도에 비례한다.
   *
   * 배치는 자리의 가로세로 비율(ctx.aspect)에 맞춘 타원형 무리다. 예전 패널은 폭 대 높이가
   * 3:1 넘게 납작해서 한 줄로 늘어놨지만, 가운데 카드는 2:1 안팎이라 한 줄이면 위아래가 빈다.
   * 가장 큰 원을 가운데 두고, 다음 원부터 이미 놓인 원 두 개에 동시에 닿는 자리 가운데
   * 가운데에서 가장 가까운(타원 거리) 곳에 붙인다. 시뮬레이션이 아니라 계산이라 매번 같은
   * 그림이 나오고 겹칠 일이 구조적으로 없다.
   */
  bubble: {
    accepts: "rows",
    render({ items }, ctx = {}) {
      if (!items.length) return `<span class="sv-bubble"></span>`;
      const hl = asSet(ctx.highlight);
      // 강조할 것이 8위 밖에 있어도 빠지면 안 된다
      const top = items.slice(0, 8);
      for (const r of items) if (hl.has(r.label) && !top.includes(r)) top.push(r);
      const lead = hl.size ? hl : new Set([top[0].label]);
      const pack = packCluster(top, ctx.aspect || 2.2);
      const circles = pack.nodes.map((n) => {
        const on = lead.has(n.label);
        const fs = n.inside ? n.fs : 0.2;
        return `<g class="sv-bub${on ? " lead" : ""}" style="--i:${n.order}">
          <circle cx="${svgNum(n.x)}" cy="${svgNum(n.y)}" r="${svgNum(n.r)}"></circle>
          <text class="${n.inside ? "in" : "out"}" x="${svgNum(n.x)}"
                y="${svgNum(n.inside ? n.y + fs * 0.35 : n.y + n.r + fs * 1.05)}"
                style="font-size:${svgNum(fs)}px">${esc(n.label)}</text>
        </g>`;
      }).join("");
      const b = pack.box;
      return `<span class="sv-bubble">
        <svg viewBox="${svgNum(b.x)} ${svgNum(b.y)} ${svgNum(b.w)} ${svgNum(b.h)}"
             role="img" aria-label="${esc([...lead].join(", "))}">${circles}</svg>
      </span>`;
    },
  },

  /** 1위 하나만 크게, 나머지는 아래 한 줄. 보정 화면 안내에 쓴다. */
  headline: {
    accepts: "rows",
    render({ items }) {
      if (!items.length) return `<span class="sv-headline"></span>`;
      const [top, ...rest] = items;
      const tail = rest.slice(0, 3).map((r) => esc(r.label)).join(" · ");
      return `<span class="sv-headline">
          <span class="sv-head-word">${esc(top.label)}</span>
          <span class="sv-head-share">${Math.round(top.share * 100)}<i>%</i></span>
          ${tail ? `<span class="sv-head-rest">${tail}</span>` : ""}
        </span>`;
    },
  },

  /* ── groups ────────────────────────────────────────────────────────────── */

  /**
   * 같은 낱말, 다른 이유 — 동기(머무르게·떠나게·오가게·망설이게)마다 1위 이유와 그 비율.
   * 행마다 분모가 다르다(그 동기의 표 수). 문장이 적은 동기는 막대 대신 "적음"이라고 적는다 —
   * 두 명 중 한 명이 50%로 그려지면 다른 행과 같은 무게로 읽힌다.
   */
  motives: {
    accepts: "groups",
    render({ groups }, ctx = {}) {
      const hl = asSet(ctx.highlight);
      const html = groups.map((g, i) => {
        const [a, ...rest] = g.items;
        const thin = g.n < 3 || !a;
        const verb = String(g.label).replace(/\s*하는 것$/, "");
        return `
        <span class="sv-mo-row${hl.has(g.key) ? " lead" : ""}${thin ? " thin" : ""}" style="--i:${i}">
          <span class="sv-mo-label">${esc(verb)}</span>
          <span class="sv-mo-top">${thin ? "" : esc(a.label)}</span>
          <span class="sv-bar-track">${thin ? "" : `<span class="sv-bar-fill" style="width:${(a.share * 100).toFixed(1)}%"></span>`}</span>
          <span class="sv-mo-pct">${thin ? `<i>적음</i>` : `${Math.round(a.share * 100)}<i>%</i>`}</span>
          <span class="sv-mo-rest">${thin ? "" : rest.slice(0, 2).map((r) => esc(r.label)).join(" · ")}</span>
        </span>`;
      }).join("");
      return `<span class="sv-motives">${html}</span>`;
    },
  },

  /**
   * 지역마다 다른 이유 — 지역 한 줄마다 그곳의 1위 이유를 크게 적고, 그 아래 막대는 그 지역 표 전체(트랙 끝 = 100%)를
   * 1·2·3위 조각으로 나눈 것이다. 1위 낱말이 한 열로 서서 "지역마다 다른 낱말"이 먼저 읽히고, 막대로 그 낱말이
   * 그 지역에서 얼마나 큰 몫인지 견준다(1위가 같은 낱말이어도 몫이 다르면 길이가 다르다).
   * 줄마다 따로 grid 라 열 폭은 em 으로 고정한다(css) — 막대 시작점이 줄마다 같아야 길이를 비교한다.
   * 강조형: 결론이 가리키는 지역의 1위 조각만 금색. 1위가 동점이면 둘 다 1위로 적고 둘 다 1위 조각으로 칠한다.
   * 문장이 적은 지역(3명 미만)은 막대 대신 "적음" — 한두 명의 고름이 다른 지역과 같은 무게로 읽히면 안 된다.
   */
  places: {
    accepts: "groups",
    render({ groups }, ctx = {}) {
      const hl = asSet(ctx.highlight);
      const html = groups.map((g, i) => {
        const items = g.items || [];
        const thin = g.n < 3 || !items.length;
        const tops = items.filter((r) => r.count === items[0]?.count).slice(0, 2);
        const rest = items.slice(tops.length, tops.length + 2);
        const p100 = (r) => `${Math.round(r.share * 100)}<i>%</i>`;
        const segs = [...tops, ...rest].map((r, k) =>
          `<i class="${k < tops.length ? "top" : `s${k - tops.length + 1}`}" style="--k:${k};width:${(r.share * 100).toFixed(1)}%"></i>`).join("");
        return `
        <span class="sv-pl-row${hl.has(g.key) ? " lead" : ""}${thin ? " thin" : ""}${tops.length > 1 ? " tie" : ""}" style="--i:${i}">
          <span class="sv-pl-place">${esc(g.label)}<small>${num(g.n)}명</small></span>
          <span class="sv-pl-main">
            <span class="sv-pl-top">${thin ? "<i>적음</i>" : `${tops.map((r) => esc(r.label)).join(" · ")}<b>${p100(tops[0])}</b>`}</span>
            <span class="sv-pl-bar">${thin ? "" : segs}</span>
          </span>
          <span class="sv-pl-rest">${thin ? "" : rest.map((r) => `<span>${esc(r.label)}<b>${p100(r)}</b></span>`).join("")}</span>
        </span>`;
      }).join("");
      return `<span class="sv-places" style="--rows:${groups.length}">${html}</span>`;
    },
  },

  /* ── matrix ────────────────────────────────────────────────────────────── */

  /**
   * 히트맵 — 크기 비교라 한 색상의 밝기 계단 하나(시퀀셜). 칸 숫자는 옅게 적고(표 대체물),
   * 결론이 가리키는 칸만 테두리와 진한 숫자로 세운다. 열 머리에 지역별 인원을 적어
   * 지역 분포도 여기서 함께 읽힌다.
   */
  heatmap: {
    accepts: "matrix",
    render({ rows, cols, cells, colTotals, max }, ctx = {}) {
      const h = ctx.highlight || {};
      const head = cols.map((c, j) => `
        <span class="sv-hm-col${h.col === j ? " on" : ""}">${esc(c)}<b>${num(colTotals[j])}</b></span>`).join("");
      const body = rows.map((r, i) => {
        const line = cells[i].map((v, j) => {
          const t = max ? v / max : 0;
          const on = h.row === i && h.col === j;
          return `<span class="sv-hm-cell${t > 0.68 ? " deep" : ""}${v === 0 ? " zero" : ""}${on ? " on" : ""}"
                        style="--t:${t.toFixed(3)};--i:${i + j}">${v || ""}</span>`;
        }).join("");
        return `<span class="sv-hm-row"><span class="sv-hm-rowlabel${h.row === i ? " on" : ""}">${esc(r)}</span>${line}</span>`;
      }).join("");
      return `<span class="sv-heatmap"><span class="sv-hm-grid" style="--cols:${cols.length}">
          <span class="sv-hm-corner"></span>${head}${body}</span></span>`;
    },
    legend({ max }) {
      return `<span class="sv-legend">0 <span class="sv-hm-swatches">${[0, .25, .5, .75, 1].map((t) =>
        `<i style="--t:${t}"></i>`).join("")}</span> ${num(max)}명</span>`;
    },
  },

  /* ── pairs ─────────────────────────────────────────────────────────────── */

  /**
   * 동시출현 — 낱말을 가로 한 줄에 세우고, 함께 고른 짝을 그 위로 넘어가는 호로 잇는다
   * (아크 다이어그램). 호의 굵기가 그 짝이 몇 번 같이 나왔는지다. 결론이 말하는 짝 하나만
   * 금색이고 나머지는 회색이다(강조형) — 전부 같은 색이면 굵기 말고는 읽을 게 없다.
   *
   * 원 둘레 배치는 납작한 칸에서 쪼그라들고 선이 가운데서 별 모양으로 엉켜서 버렸다.
   * 힘 기반 배치도 안 쓴다 — 매 프레임 꿈틀대고 새로고침할 때마다 그림이 바뀐다.
   */
  network: {
    accepts: "pairs",
    render({ nodes, links, maxLink }, ctx = {}) {
      if (nodes.length < 2) return `<span class="sv-network"></span>`;
      const h = ctx.highlight || {};
      // 가로 위치는 %로 준다. 칸의 비율이 화면마다 달라서(폰·세로 TV·가로 모니터) 고정
      // viewBox 로 그리면 어느 한쪽에서 위아래나 좌우가 텅 빈다. 호만 SVG 로 그리고
      // (비율을 따라 늘어나도 곡선은 곡선이다), 점과 낱말은 HTML 로 얹어 찌그러지지 않게 한다.
      const step = 100 / nodes.length;
      const pos = new Map(nodes.map((n, i) => [n.label, step * (i + 0.5)]));
      // 강조 짝은 맨 나중에 그려 위에 오게 한다
      const order = [...links].sort((x, y) => isPair(x, h) - isPair(y, h));
      const arcs = order.map((l, i) => {
        const a = pos.get(l.a), b = pos.get(l.b);
        const w = l.count / maxLink;
        // 호의 높이는 두 낱말 사이 거리에 비례한다 — 먼 짝이 가까운 짝을 덮고 넘어간다
        const apex = Math.min(96, Math.abs(b - a) * 1.25 + 14);
        return `<path class="${isPair(l, h) ? "on" : ""}" vector-effect="non-scaling-stroke"
                      style="--i:${i};--w:${svgNum(0.18 + w * 0.62)}"
                      d="M${svgNum(a)},100 Q${svgNum((a + b) / 2)},${svgNum(100 - apex * 2)} ${svgNum(b)},100"></path>`;
      }).join("");
      const top = nodes[0].count || 1;
      const dots = nodes.map((n, i) => `
        <span class="sv-net-node${n.label === h.a || n.label === h.b ? " on" : ""}"
              style="--i:${i};left:${svgNum(pos.get(n.label))}%;--s:${svgNum(0.55 + 0.75 * Math.sqrt(n.count / top))}">
          <i></i><b>${esc(n.label)}</b>
        </span>`).join("");
      return `<span class="sv-network" role="img" aria-label="함께 고른 이유들의 연결">
        <svg class="sv-net-arcs" viewBox="0 0 100 100" preserveAspectRatio="none">${arcs}</svg>
        <span class="sv-net-nodes">${dots}</span>
      </span>`;
    },
  },

  /**
   * 궤도 — 함께 고른 이유들(10-11 사용자). 키워드 열 개가 원 둘레에 둥글게 서 있고, 가운데에 놓는 자리가 있다.
   * 하나를 가운데로 끌어 놓으면(빈자리는 비워 둔 채) 나머지 아홉이 태양계처럼 그 키워드를 중심으로 제 방향의 반지름 위에
   * 다시 선다 — 가운데에서 선이 뻗어 각자에게 이어지고, 거리는 연계(그 키워드를 고른 사람 중 함께 고른 비율)를 따른다.
   * **멀수록 연계가 강하다**(사용자 지정 — ORBIT_FAR_IS_STRONG). 가운데 키워드를 다시 끌어내면 제자리로, 나머지도 원 둘레로.
   * 끄는 손맛: 처음엔 제자리에 버티며 조금만 늘어나다가(고무줄) 일정 거리를 넘으면 "쑥" 손가락을 따라 끌려온다.
   * 전시 화면에는 입력장치가 없어서 결론 문장의 주어 키워드를 스스로 가운데로 끌어오는 시연을 한다(ctx.interactive 가 아닐 때).
   * render 는 자리만 그리고, 움직임은 mount(카드에 꽂힌 뒤 panel.js fillReport 가 부른다)가 맡는다.
   */
  orbit: {
    accepts: "pairs",
    render({ freq = {}, order, nodes = [] }, ctx = {}) {
      const labels = order || nodes.map((n) => n.label);
      const top = Math.max(1, ...labels.map((k) => freq[k] || 0));
      const items = labels.map((k, i) => {
        const [x, y] = orbitHome(i, labels.length);
        const a = -Math.PI / 2 + (i / labels.length) * Math.PI * 2;   // 낱말은 가운데 바깥쪽(제 방향)에 단다 — 안쪽에 몰려도 덜 겹친다
        return `<span class="sv-orb-node" data-k="${esc(k)}" style="--i:${i};left:${svgNum(x)}%;top:${svgNum(y)}%;--s:${svgNum(0.6 + 0.7 * Math.sqrt((freq[k] || 0) / top))};--ax:${svgNum(Math.cos(a))};--ay:${svgNum(Math.sin(a))}">
          <i></i><span class="sv-orb-lab"><b>${esc(k)}</b><em></em></span></span>`;
      }).join("");
      const hint = ctx.interactive ? "키워드 하나를 여기로 끌어 오세요" : "";
      return `<span class="sv-orbit${ctx.interactive ? " live" : ""}" role="img" aria-label="함께 고른 이유들 — 가운데 키워드와의 연계">
        <span class="sv-orb-sq">
          <svg class="sv-orb-lines" viewBox="0 0 100 100"></svg>
          <span class="sv-orb-hub" style="width:${ORBIT.hub * 2}%;height:${ORBIT.hub * 2}%"><span>${hint}</span></span>
          ${items}
        </span>
        <span class="sv-orb-cap">${ctx.interactive ? "멀리 설수록 함께 고른 사람이 많아요" : ""}</span>
      </span>`;
    },
    mount(root, data, ctx = {}) { mountOrbit(root, data, ctx); },
  },

  /* ── scores ────────────────────────────────────────────────────────────── */

  /**
   * 정착 온도 — 0을 기준으로 양쪽으로 갈리는 값이라 다이버징이다. 따뜻함(머무름)과
   * 차가움(떠남) 두 색에 무채색 중앙. 점수 글자는 먹색이다 — 색은 막대가 입는다.
   * 문장이 적은 지역은 막대를 옅게 그려 결론의 비교 대상이 아님을 드러낸다.
   */
  thermo: {
    accepts: "scores",
    render({ items, min, max }, ctx = {}) {
      const hl = asSet(ctx.highlight);
      const span = max - min;
      const html = items.map((it, i) => {
        const warm = it.score >= 0;
        const half = Math.abs(it.score) / span * 100;
        return `<span class="sv-th-row ${warm ? "warm" : "cool"}${hl.has(it.label) ? " lead" : ""}${it.n < 3 ? " thin" : ""}" style="--i:${i}">
          <span class="sv-th-label">${esc(it.label)}</span>
          <span class="sv-th-track">
            <i class="sv-th-zero"></i>
            <i class="sv-th-fill" style="${warm ? "left:50%" : "right:50%"};width:${half.toFixed(1)}%"></i>
          </span>
          <span class="sv-th-val">${it.score > 0 ? "+" : it.score < 0 ? "−" : ""}${Math.abs(it.score).toFixed(1)}</span>
        </span>`;
      }).join("");
      return `<span class="sv-thermo">${html}
        <span class="sv-th-axis"><span>떠날 준비 −2</span><span>0</span><span>머무름 +2</span></span>
      </span>`;
    },
    legend() {
      // 양 끝(−2·+2)은 축에 적혀 있다. 축에 없는 가운데 점수만 여기 적는다.
      return `<span class="sv-legend">돌아온 사람 +1 · 오가는 중·아직 모르겠음 0</span>`;
    },
  },

  /* ── pulse ─────────────────────────────────────────────────────────────── */

  /**
   * 유입 속도 — 스파크라인. 지금 칸만 금색, 나머지는 회색. 큰 숫자는 두지 않는다 —
   * 누적 수가 이미 이 화면의 유일한 큰 숫자이고, 속도 값은 머리줄과 결론 문장에 있다.
   */
  pulse: {
    accepts: "pulse",
    render({ buckets, windowMin }, ctx = {}) {
      const peak = Math.max(1, ...buckets);
      const last = buckets.length - 1;
      const bars = buckets.map((n, i) => {
        // 숫자는 결론이 가리키는 칸(가장 붐빈 때 또는 가장 최근)과 지금 칸에만 —
        // 모든 막대에 숫자를 달면 아무것도 안 읽힌다. 금색도 결론이 가리키는 칸 하나뿐이다.
        const said = i === ctx.highlight || i === last;
        return `
        <i class="${i === ctx.highlight ? "peak" : ""}${i === last && n ? " now" : ""}"
           style="--i:${i};height:${Math.max(3, (n / peak) * 100).toFixed(1)}%">${said && n ? `<b>${n}</b>` : ""}</i>`;
      }).join("");
      return `<span class="sv-pulse">
        <span class="sv-pulse-spark" role="img" aria-label="최근 ${windowMin}분을 ${buckets.length}칸으로 나눈 도착 수">${bars}</span>
        <span class="sv-pulse-axis"><span>${windowMin}분 전</span><span>${windowMin / 2}분 전</span><span>지금</span></span>
      </span>`;
    },
  },

  /* ── stream ────────────────────────────────────────────────────────────── */

  /**
   * 자유응답 벽 — 문장을 그대로 흘려보낸다. 워드클라우드로 쪼개지 않는 건 이 프로젝트가
   * 사적 고백의 아카이브이기 때문이다. 같은 목록을 두 번 이어 붙이고 정확히 절반만큼 올려서
   * 이음매가 안 보이게 한다.
   */
  textwall: {
    accepts: "stream",
    render({ items }) {
      if (!items.length) return `<span class="sv-textwall"></span>`;
      const one = items.map((it) => `
        <span class="sv-tw-item">
          <span class="sv-tw-text">${esc(it.text)}</span>
          <span class="sv-tw-meta">${esc(it.meta)}</span>
        </span>`).join("");
      // 개수에 비례해 시간을 준다 — 문장이 많아져도 읽는 속도는 같다.
      const sec = Math.max(16, items.length * 3.4);
      return `<span class="sv-textwall">
        <span class="sv-tw-belt" style="--tw-sec:${sec}s" data-sec="${sec}">${one}${one}</span>
      </span>`;
    },
    mount(root, data, ctx = {}) { if (ctx.interactive) mountTextwall(root); },
  },
};

const isPair = (l, h) => (h && ((l.a === h.a && l.b === h.b) || (l.a === h.b && l.b === h.a)) ? 1 : 0);

/* ── 버블 배치 ────────────────────────────────────────────────────────────── */

/**
 * 가장 큰 원을 가운데, 나머지를 크기순으로 무리에 붙인다.
 * 반지름은 넓이가 빈도에 비례하도록 √(count) 로 잡는다 — 반지름을 빈도에 비례시키면
 * 넓이가 제곱으로 커져서 1위가 실제 차이보다 훨씬 압도적으로 보인다.
 * 원에 낱말이 안 들어가면 원 아래에 적는데, 그 글자 자리까지 원의 몫으로 쳐서 붙인다
 * (그래야 아래 낱말이 이웃 원에 먹히지 않는다).
 * @param aspect 자리의 가로/세로. 가운데에서의 거리를 (x/aspect, y) 로 재서 무리가 자리 모양을 닮는다.
 * @returns {{nodes, box:{x,y,w,h}}} box 는 글자까지 포함한 실제 내용 범위다.
 */
function packCluster(items, aspect) {
  const GAP = 0.1;
  const base = Math.max(...items.map((it) => it.count)) || 1;
  const nodes = items.map((it, k) => {
    const r = Math.max(0.2, Math.sqrt(it.count / base));
    // 원 안에 글자가 들어가는지 먼저 본다. 안 들어가면 원 아래에 적는다 — 잘린 라벨은 없느니만 못하다.
    const fit = (1.76 * r) / Math.max(1, String(it.label).length);
    const inside = fit >= 0.19;
    return { ...it, r, order: k, inside, fs: inside ? Math.min(fit, r * 0.66) : 0.2,
             reach: r + (inside ? 0 : 0.32), x: 0, y: 0 };
  });
  const order = [...nodes].sort((a, b) => b.r - a.r || a.order - b.order);
  const placed = [order[0]];
  const cost = (x, y) => (x / aspect) ** 2 + y * y;
  const free = (n, x, y) => placed.every((p) => Math.hypot(x - p.x, y - p.y) >= p.reach + n.reach + GAP - 1e-6);
  for (const n of order.slice(1)) {
    let best = null;
    const tryAt = (x, y) => {
      if (!free(n, x, y)) return;
      const c = cost(x, y);
      if (!best || c < best.c - 1e-9) best = { x, y, c };
    };
    // 이미 놓인 원 둘에 동시에 닿는 자리 (두 원의 교점)
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j];
        const ra = a.reach + n.reach + GAP, rb = b.reach + n.reach + GAP;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > ra + rb || d < Math.abs(ra - rb) || d === 0) continue;
        const t = (ra * ra - rb * rb + d * d) / (2 * d);
        const hh = Math.sqrt(Math.max(0, ra * ra - t * t));
        const mx = a.x + (dx * t) / d, my = a.y + (dy * t) / d;
        tryAt(mx - (dy * hh) / d, my + (dx * hh) / d);
        tryAt(mx + (dy * hh) / d, my - (dx * hh) / d);
      }
    }
    // 원 하나에만 닿는 자리 — 두 번째 원이거나 교점이 다 막혔을 때
    for (const a of placed) {
      for (let k = 0; k < 24; k++) {
        const th = (k / 24) * Math.PI * 2;
        const rr = a.reach + n.reach + GAP;
        tryAt(a.x + Math.cos(th) * rr, a.y + Math.sin(th) * rr);
      }
    }
    if (!best) {   // 이론상 없지만 — 자리가 하나도 안 나오면 무리 오른쪽 끝에 붙인다
      const edge = Math.max(...placed.map((p) => p.x + p.reach));
      best = { x: edge + n.reach + GAP, y: 0 };
    }
    n.x = best.x; n.y = best.y;
    placed.push(n);
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r);
    y0 = Math.min(y0, n.y - n.r);
    y1 = Math.max(y1, n.y + n.r + (n.inside ? 0 : n.fs * 1.4));
    // 원 아래 낱말이 원보다 넓을 수 있다
    if (!n.inside) {
      const half = String(n.label).length * n.fs * 0.55;
      x0 = Math.min(x0, n.x - half); x1 = Math.max(x1, n.x + half);
    }
  }
  const pad = 0.06;
  return { nodes, box: { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 } };
}

/**
 * 소수점을 짧게. SVG 속성에 12자리를 적어 봐야 읽기만 어렵다.
 * 이름이 긴 이유: 단일 파일 시안(tools/build-standalone.mjs)은 모든 모듈을 한 스코프로
 * 펴는데, shared/ocean-core.js 에도 GLSL 리터럴용 f 가 있어서 짧게 두면 부딪힌다.
 */
const svgNum = (n) => (Math.round(n * 1000) / 1000).toString();

export { pct };

/* ── 궤도(orbit) — 자리 계산과 끌기 ───────────────────────────────────────────── */

// 정사각 자리 안의 % 좌표(가운데 50,50). ring = 원 둘레, hub = 가운데 자리 반지름, near = 가장 가까이 오는 반지름
const ORBIT = { ring: 38, hub: 10, near: 20, breakAt: 9, stretch: 4.5, catchUp: 0.32 };
// 멀수록 연계가 강하다(10-11 사용자 지정). 반대로 바꾸려면 false
const ORBIT_FAR_IS_STRONG = true;
// 관람객이 가운데에 놓아 둔 키워드 — 새 문장이 들어와 같은 장을 다시 그려도 그대로 둔다(인터랙티브만)
const orbitMemo = { center: null };

function orbitHome(i, n) {
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return [50 + ORBIT.ring * Math.cos(a), 50 + ORBIT.ring * Math.sin(a)];
}

function mountOrbit(root, { freq = {}, links = [], order, nodes = [] }, ctx) {
  const wrap = root.querySelector(".sv-orbit");
  if (!wrap) return;
  const sq = wrap.querySelector(".sv-orb-sq"), svg = wrap.querySelector(".sv-orb-lines"), cap = wrap.querySelector(".sv-orb-cap");
  const labels = order || nodes.map((n) => n.label);
  const els = new Map([...wrap.querySelectorAll(".sv-orb-node")].map((el) => [el.dataset.k, el]));
  const idx = new Map(labels.map((k, i) => [k, i]));
  const pairCount = (a, b) => { for (const l of links) if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l.count; return 0; };

  // 정사각 자리 — 차트 칸의 짧은 변에 맞춘다(원이 찌그러지지 않게). 카드가 확대돼도(transform) 칸 크기는 그대로다
  const fit = () => {
    const s = Math.max(40, Math.min(wrap.clientWidth, wrap.clientHeight - (cap ? cap.offsetHeight : 0)));
    sq.style.width = sq.style.height = `${s}px`;
    svg.style.setProperty("--k", svgNum(100 / s));
  };
  fit();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(wrap);

  const place = (el, x, y) => { el.style.left = `${x}%`; el.style.top = `${y}%`; };
  let center = null;

  /** 가운데가 c 일 때 각 키워드가 설 자리. c 가 없으면 전부 원 둘레 제자리 */
  const targets = (c) => {
    const out = new Map();
    const nc = c ? freq[c] || 0 : 0;
    const ps = new Map(labels.filter((k) => k !== c).map((k) => [k, nc ? pairCount(c, k) / nc : 0]));
    const pmax = Math.max(0, ...ps.values());
    labels.forEach((k, i) => {
      if (k === c) { out.set(k, { x: 50, y: 50, p: null }); return; }
      if (!c) { const [x, y] = orbitHome(i, labels.length); out.set(k, { x, y, p: null }); return; }
      const t = pmax > 0 ? ps.get(k) / pmax : 0;
      const r = ORBIT_FAR_IS_STRONG ? ORBIT.near + (ORBIT.ring - ORBIT.near) * t : ORBIT.ring - (ORBIT.ring - ORBIT.near) * t;
      const a = -Math.PI / 2 + (i / labels.length) * Math.PI * 2;
      out.set(k, { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), p: ps.get(k), t });
    });
    return out;
  };

  /** 가운데를 c 로(없으면 null) — 나머지가 제 반지름으로 옮겨 가고, 가운데에서 선이 뻗는다 */
  const setCenter = (c, { remember = true } = {}) => {
    center = c;
    if (remember && ctx.interactive) orbitMemo.center = c;
    const T = targets(c);
    for (const [k, el] of els) {
      const t = T.get(k);
      el.classList.remove("drag");
      el.classList.toggle("hub", k === c);
      el.classList.toggle("dim", !!c && k !== c && !(t.p > 0));
      place(el, t.x, t.y);
      el.querySelector("em").textContent = c && k !== c ? `${Math.round((t.p || 0) * 100)}%` : "";
    }
    wrap.classList.toggle("has-hub", !!c);
    svg.innerHTML = c ? labels.filter((k) => k !== c).map((k) => {
      const t = T.get(k);
      return `<line class="${t.p > 0 ? "" : "zero"}" x1="50" y1="50" x2="${svgNum(t.x)}" y2="${svgNum(t.y)}"
        style="--i:${idx.get(k)};--w:${svgNum(0.25 + 0.55 * (t.t || 0))}" pathLength="1"></line>`;
    }).join("") : "";
    if (cap) {
      const n = c ? freq[c] || 0 : 0;
      cap.textContent = !c ? (ctx.interactive ? "멀리 설수록 함께 고른 사람이 많아요" : "")
        : n ? `“${c}”${josa(c, "을를")} 고른 ${n}명 기준 · 멀리 설수록 함께 고른 사람이 많아요` : `아직 “${c}”${josa(c, "을를")} 고른 사람이 없어요`;
    }
  };

  // 다시 그려도 관람객이 놓아 둔 키워드는 그대로(인터랙티브)
  if (ctx.interactive && orbitMemo.center && els.has(orbitMemo.center)) setCenter(orbitMemo.center);

  // 전시 — 결론의 주어 키워드를 스스로 가운데로 끌어온다(카드가 다 선 뒤)
  if (!ctx.interactive) {
    const k = ctx.highlight && (ctx.highlight.from || ctx.highlight.a);
    if (k && els.has(k)) setTimeout(() => { if (wrap.isConnected) setCenter(k, { remember: false }); }, 1900);
    return;
  }

  // ── 끌기 (인터랙티브) ──
  const toPct = (e) => { const r = sq.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100]; };
  for (const [k, el] of els) {
    el.addEventListener("click", (e) => e.stopPropagation());   // 틀의 두 번 톡 확대로 새지 않게
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const T = targets(center), home = T.get(k);
      const [sx, sy] = toPct(e);
      let free = false, moved = 0, tx = home.x, ty = home.y, cx = home.x, cy = home.y, raf = 0;
      el.classList.add("drag");
      // 끄는 동안 카드를 다시 그리면(새 문장이 들어와서) 손에 쥔 키워드가 사라진다 — 쓰는 쪽이 미뤄 두게 알린다
      wrap.dataset.dragging = "1";
      // 풀려난 뒤에는 손가락 자리로 매 프레임 빠르게 따라붙는다 — "쑥"
      const follow = () => { cx += (tx - cx) * ORBIT.catchUp; cy += (ty - cy) * ORBIT.catchUp; place(el, cx, cy); raf = requestAnimationFrame(follow); };
      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const [px, py] = toPct(ev);
        const dx = px - sx, dy = py - sy, d = Math.hypot(dx, dy);
        moved = Math.max(moved, d);
        if (!free && d > ORBIT.breakAt) { free = true; raf = requestAnimationFrame(follow); el.classList.add("free"); }
        if (free) { tx = px; ty = py; return; }
        // 버티기 — 제자리에서 고무줄처럼 조금만(최대 stretch) 늘어난다
        const k2 = d ? ORBIT.stretch * Math.tanh(d / ORBIT.breakAt) / d : 0;
        cx = home.x + dx * k2; cy = home.y + dy * k2; place(el, cx, cy);
      };
      const up = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
        cancelAnimationFrame(raf);
        el.classList.remove("free");
        delete wrap.dataset.dragging;
        wrap.dispatchEvent(new CustomEvent("sv-drag-end", { bubbles: true }));
        const [px, py] = toPct(ev);
        const onHub = Math.hypot(px - 50, py - 50) < ORBIT.hub * 1.9;
        if (moved < 1.5) setCenter(center === k ? null : k);               // 톡 — 가운데로 / 가운데 것이면 제자리로
        else if (!free) setCenter(center);                                  // 버티다 놓음 — 원래 자리로 되돌아간다
        else if (k === center) setCenter(onHub ? k : null);                 // 가운데 것을 끌어냈다 → 제자리로
        else setCenter(onHub ? k : center);                                 // 가운데에 놓았으면 새 중심, 아니면 제자리
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }
}

/* ── 문장 띠 — 손으로 넘겨 보기 (인터랙티브, 10-12 사용자) ──────────────────────
   전시는 CSS 애니메이션 그대로(손이 없다). 인터랙티브는 띠를 js 가 굴린다(.js — CSS 애니메이션을 끈다):
   손가락으로 위아래로 끌면 그만큼 따라오고, 손을 떼면 밀던 빠르기에서 원래 속도로 부드럽게 돌아가 다시 흐른다.
   원래 속도 = 목록 한 바퀴(띠 높이의 절반 — 목록을 두 번 이어 붙였다)를 data-sec 초에. 이음매 없이 감긴다.
   새 기록이 와서 다시 그려져도(still) 보던 자리에서 잇는다(twMemo). 끄는 동안은 다시 그리기를 미룬다(data-dragging — report.js). */
const TW = { settle: 2.2, flingMax: 2400 };   // 손 뗀 뒤 원래 속도로 돌아가는 빠르기(1/초) · 튕기는 빠르기 상한(px/초)
const twMemo = { frac: 0 };
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function mountTextwall(root) {
  const wall = root.querySelector(".sv-textwall"), belt = wall && wall.querySelector(".sv-tw-belt");
  if (!belt) return;
  belt.classList.add("js");
  wall.classList.add("live");
  const sec = Number(belt.dataset.sec) || 24;
  const loop = () => belt.offsetHeight / 2;           // 한 바퀴 거리(px)
  const base = () => (reducedMotion() ? 0 : loop() / sec);
  let y = twMemo.frac * loop();                        // 올라간 거리(px) — 0 ≤ y < loop
  let speed = base();
  let drag = null;                                     // { id, lastY, lastT, v }
  const wrapY = () => { const L = loop(); if (L > 0) y = ((y % L) + L) % L; };
  const draw = () => { wrapY(); belt.style.transform = `translateY(${-y}px)`; const L = loop(); if (L > 0) twMemo.frac = y / L; };
  draw();

  let last = performance.now();
  const tick = (now) => {
    if (!belt.isConnected) return;                     // 장이 바뀌어 카드에서 빠졌다
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drag) {
      const b = base();
      speed += (b - speed) * Math.min(1, dt * TW.settle);
      y += speed * dt;
      draw();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  wall.addEventListener("pointerdown", (e) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag = { id: e.pointerId, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: 0 };
    wall.dataset.dragging = "1";
    try { wall.setPointerCapture(e.pointerId); } catch (_e) {}
  });
  wall.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // 카드가 확대돼 있으면(scale) 화면 px 를 카드 px 로 — 손가락 아래 글자가 손가락을 따라오게
    const k = belt.offsetHeight ? belt.getBoundingClientRect().height / belt.offsetHeight : 1;
    const d = (e.clientY - drag.lastY) / (k || 1);
    const dt = Math.max(1, e.timeStamp - drag.lastT) / 1000;
    y -= d;                                            // 손가락을 내리면 문장도 내려온다
    drag.v = drag.v * 0.6 + (-d / dt) * 0.4;           // 최근 빠르기(부드럽게)
    drag.moved += Math.abs(d);
    drag.lastY = e.clientY; drag.lastT = e.timeStamp;
    draw();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // 잠깐 멈췄다 떼면 튕기지 않는다
    const idle = e.timeStamp - drag.lastT > 120;
    speed = idle ? 0 : Math.max(-TW.flingMax, Math.min(TW.flingMax, drag.v));
    wall._moved = drag.moved;
    drag = null;
    delete wall.dataset.dragging;
    wall.dispatchEvent(new CustomEvent("sv-drag-end", { bubbles: true }));
  };
  wall.addEventListener("pointerup", end);
  wall.addEventListener("pointercancel", end);
  wall.addEventListener("lostpointercapture", end);
  // 끈 뒤 떨어지는 click 이 틀의 "두 번 톡 확대"로 읽히지 않게
  wall.addEventListener("click", (e) => { if ((wall._moved || 0) > 4) e.stopPropagation(); wall._moved = 0; });
}
