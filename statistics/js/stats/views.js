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
 *   ordinals   방금 도착한 문장의 키워드 → 몇 번째 (LIVE 에서만)
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

import { esc, num, pct } from "./text.js";

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
   * 버블 — 강조한 것을 먹색으로, 나머지는 옅은 회색으로 한 줄에 세운다(레퍼런스 2장:
   * 최다 이유를 가운데 검게). 넓이가 빈도에 비례한다.
   *
   * LIVE(방금 도착한 문장)에서는 그 문장의 키워드를 먹색으로 세우고 "+1"을 붙인다 —
   * 이 사람의 선택이 모두의 선택 가운데 어디쯤에 있는지 한눈에 보인다.
   *
   * 배치는 가로 한 줄이다. 패널이 폭 대 높이 3:1 넘게 납작해서, 둘러싸는 원형으로 두면
   * 높이에 맞춰 축소되고 좌우가 텅 빈다. 1위를 가운데 두고 좌우로 번갈아 놓는다.
   * 시뮬레이션이 아니라 접선 계산이라 매번 같은 그림이 나오고 겹칠 일이 구조적으로 없다.
   */
  bubble: {
    accepts: "rows",
    render({ items }, ctx = {}) {
      if (!items.length) return `<span class="sv-bubble"></span>`;
      const hl = asSet(ctx.highlight);
      // 강조할 것이 7위 밖에 있어도 빠지면 안 된다 — LIVE에서 내 키워드가 안 보이는 일이 없게
      const top = items.slice(0, 7);
      for (const r of items) if (hl.has(r.label) && !top.includes(r)) top.push(r);
      const lead = hl.size ? hl : new Set([top[0].label]);
      const live = !!ctx.ordinals;
      const pack = packBubbles(top);
      const circles = pack.nodes.map((n) => {
        const on = lead.has(n.label);
        // 원 안에 글자가 들어가는지 먼저 본다. 안 들어가면 원 아래에 적는다 — 잘린 라벨은 없느니만 못하다.
        const fit = (1.76 * n.r) / Math.max(1, n.label.length);
        const inside = fit >= 0.19;
        const fs = inside ? Math.min(fit, n.r * 0.66) : 0.21;
        const plus = live && on
          ? `<g class="sv-bub-plus"><circle cx="${svgNum(n.x + n.r * 0.72)}" cy="${svgNum(-n.r * 0.72)}" r="0.2"></circle>
             <text x="${svgNum(n.x + n.r * 0.72)}" y="${svgNum(-n.r * 0.72 + 0.075)}">+1</text></g>` : "";
        return `<g class="sv-bub${on ? " lead" : ""}" style="--i:${n.order}">
          <circle cx="${svgNum(n.x)}" cy="${svgNum(n.y)}" r="${svgNum(n.r)}"></circle>
          <text class="${inside ? "in" : "out"}" x="${svgNum(n.x)}"
                y="${svgNum(inside ? n.y + fs * 0.35 : n.y + n.r + fs * 1.05)}"
                style="font-size:${svgNum(fs)}px">${esc(n.label)}</text>${plus}
        </g>`;
      }).join("");
      const b = pack.box;
      return `<span class="sv-bubble">
        <svg viewBox="${svgNum(b.x)} ${svgNum(b.y - (live ? 0.22 : 0))} ${svgNum(b.w)} ${svgNum(b.h + (live ? 0.22 : 0))}"
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
        <span class="sv-tw-belt" style="--tw-sec:${sec}s">${one}${one}</span>
      </span>`;
    },
  },
};

const isPair = (l, h) => (h && ((l.a === h.a && l.b === h.b) || (l.a === h.b && l.b === h.a)) ? 1 : 0);

/* ── 버블 배치 ────────────────────────────────────────────────────────────── */

/**
 * 1위를 가운데, 나머지를 좌우로 번갈아 접선으로 붙인다.
 * 반지름은 넓이가 빈도에 비례하도록 √(count) 로 잡는다 — 반지름을 빈도에 비례시키면
 * 넓이가 제곱으로 커져서 1위가 실제 차이보다 훨씬 압도적으로 보인다.
 * @returns {{nodes, box:{x,y,w,h}}} box 는 라벨까지 포함한 실제 내용 범위다.
 */
function packBubbles(items) {
  const GAP = 0.17;
  const base = items[0].count || 1;
  const nodes = items.map((it, k) => ({ ...it, r: Math.max(0.18, Math.sqrt(it.count / base)), x: 0, y: 0, order: k }));
  const left = [], right = [];
  nodes.slice(1).forEach((b, i) => (i % 2 === 0 ? right : left).push(b));
  left.reverse();
  const row = [...left, nodes[0], ...right];
  const c = left.length;
  for (let i = c + 1; i < row.length; i++) row[i].x = row[i - 1].x + row[i - 1].r + GAP + row[i].r;
  for (let i = c - 1; i >= 0; i--) row[i].x = row[i + 1].x - row[i + 1].r - GAP - row[i].r;
  const maxR = Math.max(...nodes.map((n) => n.r));
  const x0 = row[0].x - row[0].r;
  const x1 = row[row.length - 1].x + row[row.length - 1].r;
  return { nodes, box: { x: x0 - 0.05, y: -maxR - 0.06, w: (x1 - x0) + 0.10, h: maxR * 2 + 0.52 } };
}

/**
 * 소수점을 짧게. SVG 속성에 12자리를 적어 봐야 읽기만 어렵다.
 * 이름이 긴 이유: 단일 파일 시안(tools/build-standalone.mjs)은 모든 모듈을 한 스코프로
 * 펴는데, shared/ocean-core.js 에도 GLSL 리터럴용 f 가 있어서 짧게 두면 부딪힌다.
 */
const svgNum = (n) => (Math.round(n * 1000) / 1000).toString();

export { pct };
