/* =============================================================================
 * stats/views.js — 통계를 어떻게 그리는가.
 *
 * 한 항목이 한 모듈이고, 서로를 모른다. 계약은 이것뿐이다:
 *
 *     accepts: "rows" | "matrix" | "pairs" | "scores" | "pulse" | "stream"
 *     render(data, metric) → HTML 문자열
 *
 * data 의 구조는 accepts 가 정한다 (metrics.js 머리말의 shape 표). three.js도,
 * 패널의 DOM 구조도, 어떤 지표였는지도 모른다. 그래서 나중에 이 화면 밖 — 다른
 * 레이아웃, 다른 페이지, 인쇄물 — 으로 옮길 때 같이 가져갈 것은 여기 함수 하나와
 * css/stats.css 의 같은 이름 블록 하나, 딱 둘뿐이다.
 *
 * 각 뷰는 자기 바깥 상자에 sv-<id> 클래스를 붙인다. 배치(가로로 흐를지, 줄로 쌓일지)도
 * 그 블록 안에서 정한다 — 패널 쪽 .p-rows 는 글자 크기 기준만 주고 배치는 비워 뒀다.
 *
 * ── 이 화면에는 hover 가 없다 ──────────────────────────────────────────────
 * 전시장 TV/프로젝터에는 입력장치가 없다(README의 결정표). 그래서 값을 툴팁에 숨길
 * 수가 없고, 모든 뷰가 숫자를 화면에 직접 적는다 — 히트맵 칸의 숫자, 막대 끝의 %,
 * 온도 축의 점수. 색은 보조 부호일 뿐이고 색만으로 읽어야 하는 값은 하나도 없다.
 *
 * ── 색 ────────────────────────────────────────────────────────────────────
 * 크기 비교(히트맵)는 한 색상의 밝기 계단 하나만 쓴다(시퀀셜). 정착 온도처럼 0을
 * 기준으로 양쪽으로 갈리는 값만 따뜻함/차가움 두 색에 중립 회색 중앙을 쓴다(다이버징).
 * 카테고리 색을 돌려 쓰지 않는다 — 이 화면에서 색이 "정체성"을 나타내는 지표는 없다.
 * 값은 css/stats.css 의 --sv-* 토큰에 있다.
 * ========================================================================== */

/** 순위별 글자 크기 배수. 1위만 크고, 뒤로 갈수록 계단식으로 작아진다. */
const TIERS = [1.00, 0.90, 0.76, 0.76, 0.58, 0.58];
const TIER_TAIL = 0.46;

export const VIEWS = {
  /* ── rows ──────────────────────────────────────────────────────────────── */

  /**
   * 낱말이 빈도순으로 작아지는 한 문단 (시안 스크린샷). 숫자를 하나도 쓰지 않고
   * 분포를 보여주는 게 요점이다 — 관람객이 읽는 건 "몇 명"이 아니라 "무엇이 많은가"다.
   */
  ranking: {
    accepts: "rows",
    render({ items }) {
      const html = items.slice(0, 9).map((r, i) => {
        const size = TIERS[i] ?? TIER_TAIL;
        const tier = `t${i === 0 ? 1 : i === 1 ? 2 : i <= 3 ? 3 : i <= 5 ? 4 : 5}`;
        return `<span class="sv-rank-item ${tier}" style="font-size:calc(var(--stat-base) * ${size})">${esc(r.label)}</span>`;
      }).join("");
      return `<span class="sv-ranking">${html}</span>`;
    },
  },

  /**
   * 비율 막대. 항목이 적고(지역 5, 상태 5) 서로의 크기 차이가 중요한 지표에 쓴다.
   * 막대 길이는 1위 대비가 아니라 전체 대비다 — 1위 기준으로 늘리면 어떤 분포든
   * 맨 위가 꽉 차서 "고르게 퍼져 있다"와 "하나로 쏠렸다"가 같아 보인다.
   * 색은 1위만 강조하고 나머지는 한 회색이다(강조형). 값마다 색을 달리하면 막대
   * 길이가 이미 보여주는 걸 색으로 한 번 더 칠하는 셈이라 채널만 낭비한다.
   */
  bars: {
    accepts: "rows",
    render({ items }) {
      const html = items.slice(0, 6).map((r, i) => `
        <span class="sv-bar-row${i === 0 ? " lead" : ""}">
          <span class="sv-bar-label">${esc(r.label)}</span>
          <span class="sv-bar-track"><span class="sv-bar-fill" style="width:${(r.share * 100).toFixed(1)}%"></span></span>
          <span class="sv-bar-pct">${Math.round(r.share * 100)}<i>%</i></span>
        </span>`).join("");
      return `<span class="sv-bars">${html}</span>`;
    },
  },

  /**
   * 버블 — 1위 하나를 먹색으로 가운데 두고 나머지는 회색으로 둘러 세운다.
   * 그리고 지표가 준 문장으로 한 줄 결론을 만든다. 여덟 색으로 칠하면 "무엇이
   * 가장 많은가"라는 하나의 결론이 오히려 묻힌다 — 그래서 강조형이다.
   *
   * 배치는 가로 한 줄이다. 처음엔 가운데를 둘러싸는 원형으로 뒀는데, 패널이 폭 대
   * 높이가 3:1 넘게 납작해서 정사각 그림이 높이에 맞춰 축소되고 좌우가 텅 비었다.
   * 한 줄로 펴면 같은 높이에서 원이 서너 배 커진다. 1위를 가운데 두고 좌우로
   * 번갈아 놓으므로 바깥으로 갈수록 작아지는 모양은 그대로다.
   *
   * 시뮬레이션이 아니라 접선 계산이라 매번 같은 그림이 나오고(전시 중 새로고침해도
   * 화면이 안 흔들린다) 겹칠 일이 구조적으로 없다.
   */
  bubble: {
    accepts: "rows",
    render({ items }, metric) {
      const top = items[0];
      if (!top) return `<span class="sv-bubble"></span>`;
      const pack = packBubbles(items.slice(0, 7));
      const circles = pack.nodes.map((n, i) => {
        const cls = i === 0 ? "lead" : "";
        // 원 안에 글자가 들어가는지 먼저 본다. 안 들어가면 원 아래에 적는다 —
        // 잘린 라벨은 없느니만 못하다.
        const fit = (1.76 * n.r) / Math.max(1, n.label.length);
        const inside = fit >= 0.19;
        const fs = inside ? Math.min(fit, n.r * 0.66) : 0.21;
        return `<g class="sv-bub ${cls}">
          <circle cx="${svgNum(n.x)}" cy="${svgNum(n.y)}" r="${svgNum(n.r)}"></circle>
          <text class="${inside ? "in" : "out"}" x="${svgNum(n.x)}"
                y="${svgNum(inside ? n.y + fs * 0.35 : n.y + n.r + fs * 1.05)}"
                style="font-size:${svgNum(fs)}px">${esc(n.label)}</text>
        </g>`;
      }).join("");
      const head = metric.headline ? metric.headline(top) : "";
      return `<span class="sv-bubble">
        <svg viewBox="${svgNum(pack.box.x)} ${svgNum(pack.box.y)} ${svgNum(pack.box.w)} ${svgNum(pack.box.h)}"
             role="img" aria-label="${esc(top.label)} 이(가) 가장 많음">${circles}</svg>
        ${head ? `<span class="sv-bub-head">${esc(head)}</span>` : ""}
      </span>`;
    },
  },

  /** 1위 하나만 크게, 나머지는 아래 한 줄. 쏠림 자체가 메시지일 때. */
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

  /* ── matrix ────────────────────────────────────────────────────────────── */

  /**
   * 히트맵 — 크기 비교라 한 색상의 밝기 계단 하나만 쓴다(시퀀셜). 칸마다 숫자를
   * 같이 적는다: hover 가 없는 화면이라 색만으로 값을 읽게 두면 읽을 방법이 없고,
   * 그 숫자가 곧 표 대체물이다. 진한 칸에서는 글자를 크림색으로 뒤집는다.
   */
  heatmap: {
    accepts: "matrix",
    render({ rows, cols, cells, max }) {
      const head = cols.map((c) => `<span class="sv-hm-col">${esc(c)}</span>`).join("");
      const body = rows.map((r, i) => {
        const line = cells[i].map((v) => {
          const t = max ? v / max : 0;
          return `<span class="sv-hm-cell${t > 0.68 ? " deep" : ""}${v === 0 ? " zero" : ""}"
                        style="--t:${t.toFixed(3)}">${v || ""}</span>`;
        }).join("");
        return `<span class="sv-hm-row"><span class="sv-hm-rowlabel">${esc(r)}</span>${line}</span>`;
      }).join("");
      return `<span class="sv-heatmap">
        <span class="sv-hm-grid" style="--cols:${cols.length}">
          <span class="sv-hm-corner"></span>${head}${body}
        </span>
        <span class="sv-hm-legend">
          <span class="sv-hm-swatches">${[0, .25, .5, .75, 1].map((t) =>
            `<i style="--t:${t}"></i>`).join("")}</span>
          <span class="sv-hm-legend-txt">0 → ${max}명</span>
        </span>
      </span>`;
    },
  },

  /* ── pairs ─────────────────────────────────────────────────────────────── */

  /**
   * 동시출현 — 낱말을 가로 한 줄에 세우고, 함께 고른 짝을 그 위로 넘어가는 호로 잇는다.
   * 호의 굵기가 그 짝이 몇 번 같이 나왔는지다 (아크 다이어그램).
   *
   * 원 둘레에 세우고 가운데를 지나는 선으로 잇는 방식을 먼저 해 봤는데, 패널이 폭 대
   * 높이 3:1 넘게 납작해서 정사각 그림이 높이에 맞춰 쪼그라들고 좌우가 텅 비었다.
   * 게다가 선이 전부 한가운데를 지나 별 모양으로 엉켰다. 한 줄로 펴면 폭을 다 쓰고,
   * 호가 위쪽 빈 공간으로 흩어져서 어느 낱말끼리 묶였는지가 그대로 보인다.
   *
   * 힘 기반 배치(force-directed)를 안 쓴 이유: 매 프레임 흔들리고, 새로고침할 때마다
   * 다른 그림이 나오고, 수렴에 시간이 걸린다. 전시장 화면은 늘 같은 모양이어야 하고
   * 관람객이 보는 동안 계속 꿈틀대면 안 된다. 한 줄 배치는 계산 한 번이면 끝난다.
   */
  network: {
    accepts: "pairs",
    render({ nodes, links, maxLink }) {
      if (nodes.length < 2) return `<span class="sv-network"></span>`;
      // viewBox 를 패널 비율(폭:높이 약 3.3:1)에 맞춰 잡는다. 안 맞으면 높이에 맞춰
      // 축소되면서 좌우가 비는데, 그게 원형 배치를 버린 이유다.
      const W = 10, H = 3.0, BASE = 2.12, APEX_MAX = 1.86;
      const step = W / nodes.length;
      const pos = new Map(nodes.map((n, i) => [n.label, step * (i + 0.5)]));
      const arcs = links.map((l) => {
        const a = pos.get(l.a), b = pos.get(l.b);
        const w = l.count / maxLink;
        // 멀리 떨어진 짝일수록 높이 넘어간다. 다만 상한을 둬서 화면 밖으로 안 나간다.
        const apex = Math.min(APEX_MAX, Math.abs(b - a) * 0.62 + 0.30);
        return `<path d="M${svgNum(a)},${BASE} Q${svgNum((a + b) / 2)},${svgNum(BASE - apex * 2)} ${svgNum(b)},${BASE}"
                      style="stroke-width:${svgNum(0.022 + w * 0.10)};opacity:${svgNum(0.28 + w * 0.55)}"></path>`;
      }).join("");
      const top = nodes[0].count || 1;
      const dots = nodes.map((n) => `
        <g class="sv-net-node">
          <circle cx="${svgNum(pos.get(n.label))}" cy="${BASE}" r="${svgNum(0.07 + 0.10 * Math.sqrt(n.count / top))}"></circle>
          <text x="${svgNum(pos.get(n.label))}" y="${svgNum(BASE + 0.46)}">${esc(n.label)}</text>
        </g>`).join("");
      const strongest = links[0];
      return `<span class="sv-network">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="함께 고른 이유들의 연결">
          <g class="sv-net-links">${arcs}</g>${dots}
        </svg>
        ${strongest ? `<span class="sv-net-note">가장 자주 함께 고른 짝 —
          <b>${esc(strongest.a)} + ${esc(strongest.b)}</b> ${strongest.count}번</span>` : ""}
      </span>`;
    },
  },

  /* ── scores ────────────────────────────────────────────────────────────── */

  /**
   * 정착 온도 — 0을 기준으로 양쪽으로 갈리는 값이라 다이버징이다. 따뜻함(머무름)과
   * 차가움(떠남) 두 색에 중앙은 무채색. 가운데에 색을 두면 "0 = 아무것도 아님"이
   * 안 읽히고, 양극을 둘 다 차가운 색으로 두면 서로 반대라는 게 안 읽힌다.
   * 값(+1.2 같은)을 막대 끝에 직접 적는다 — 이 화면에는 툴팁이 없다.
   */
  thermo: {
    accepts: "scores",
    render({ items, min, max }) {
      const span = max - min;
      const html = items.map((it) => {
        const warm = it.score >= 0;
        // 0을 화면 한가운데(50%)에 두고 좌우로 뻗는다.
        const half = Math.abs(it.score) / span * 100;
        return `<span class="sv-th-row ${warm ? "warm" : "cool"}">
          <span class="sv-th-label">${esc(it.label)}</span>
          <span class="sv-th-track">
            <i class="sv-th-zero"></i>
            <i class="sv-th-fill" style="${warm ? "left:50%" : `right:50%`};width:${half.toFixed(1)}%"></i>
          </span>
          <span class="sv-th-val">${it.score > 0 ? "+" : ""}${it.score.toFixed(1)}</span>
        </span>`;
      }).join("");
      return `<span class="sv-thermo">
        ${html}
        <span class="sv-th-axis"><span>떠남 −2</span><span>0</span><span>머무름 +2</span></span>
      </span>`;
    },
  },

  /* ── pulse ─────────────────────────────────────────────────────────────── */

  /**
   * 유입 속도 — 하나의 현재값 + 추세라서 차트가 아니라 스탯 타일이 맞는 모양이다.
   * 누적 수는 패널 머리에 이미 초대형으로 있으므로 여기서는 반복하지 않고 속도만 본다.
   * 큰 숫자에는 tabular-nums 를 쓰지 않는다 — 큰 크기에서 자릿수가 벌어져 보인다.
   */
  pulse: {
    accepts: "pulse",
    render({ buckets, recent, windowMin, total }) {
      const peak = Math.max(1, ...buckets);
      const bars = buckets.map((n, i) => `
        <i style="height:${Math.max(4, (n / peak) * 100).toFixed(1)}%"
           class="${i === buckets.length - 1 ? "now" : ""}"></i>`).join("");
      const per = windowMin >= 60 ? `${Math.round(recent * (60 / windowMin))}개` : `${recent}개`;
      return `<span class="sv-pulse">
        <span class="sv-pulse-head">
          <span class="sv-pulse-num">${recent}</span>
          <span class="sv-pulse-unit">개 도착 · 최근 ${windowMin}분</span>
        </span>
        <span class="sv-pulse-spark" role="img"
              aria-label="최근 ${windowMin}분을 ${buckets.length}칸으로 나눈 도착 수">${bars}</span>
        <span class="sv-pulse-foot">시간당 ${per} 꼴 · 모두 ${total}개가 쌓였습니다</span>
      </span>`;
    },
  },

  /* ── stream ────────────────────────────────────────────────────────────── */

  /**
   * 자유응답 벽 — 문장을 그대로 흘려보낸다. 워드클라우드로 쪼개지 않는 건 이 프로젝트가
   * 사적 고백의 아카이브이기 때문이다. 낱말로 분해하는 순간 남는 건 통계뿐이고
   * 정작 남기려던 것이 사라진다.
   *
   * 같은 목록을 두 번 이어 붙이고 정확히 절반만큼 올려서 이음매가 안 보이게 한다.
   * 움직임을 줄이도록 설정한 환경에서는 CSS 쪽에서 애니메이션을 끈다.
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
      // 한 줄 높이가 아니라 개수에 비례해 시간을 준다 — 문장이 많아져도 읽는 속도는 같다.
      const sec = Math.max(16, items.length * 3.4);
      return `<span class="sv-textwall">
        <span class="sv-tw-belt" style="--tw-sec:${sec}s">${one}${one}</span>
      </span>`;
    },
  },
};

/* ── 버블 배치 ────────────────────────────────────────────────────────────── */

/**
 * 1위를 가운데, 나머지를 좌우로 번갈아 접선으로 붙인다.
 *
 * 반지름은 넓이가 빈도에 비례하도록 √(count) 로 잡는다 — 반지름을 빈도에 비례시키면
 * 넓이가 제곱으로 커져서 1위가 실제 차이보다 훨씬 압도적으로 보인다.
 *
 * @returns {{nodes, box:{x,y,w,h}}} box 는 라벨까지 포함한 실제 내용 범위다.
 *   viewBox 를 내용에 딱 맞춰야 납작한 상자 안에서 그림이 쪼그라들지 않는다.
 */
function packBubbles(items) {
  const GAP = 0.17;
  const base = items[0].count || 1;
  const nodes = items.map((it) => ({ ...it, r: Math.sqrt(it.count / base), x: 0, y: 0 }));
  // 좌우 개수를 최대한 맞춘다. 한쪽으로 몰리면 1위가 가운데로 안 읽힌다.
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
  // 아래쪽 여유는 원 밖으로 나가는 라벨 몫이다.
  return { nodes, box: { x: x0 - 0.05, y: -maxR - 0.06, w: (x1 - x0) + 0.10, h: maxR * 2 + 0.52 } };
}

/**
 * 소수점을 짧게. SVG 속성에 12자리를 적어 봐야 읽기만 어렵다.
 * 이름이 긴 이유: 단일 파일 시안(tools/build-standalone.mjs)은 모든 모듈을 한 스코프로
 * 펴는데, shared/ocean-core.js 에도 GLSL 리터럴용 f 가 있어서 짧게 두면 부딪힌다.
 */
const svgNum = (n) => (Math.round(n * 1000) / 1000).toString();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
