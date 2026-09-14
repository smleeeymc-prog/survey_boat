/* =============================================================================
 * stats/views.js — 통계를 어떻게 그리는가.
 *
 * 한 항목이 한 모듈이고, 서로를 모른다. 계약은 이것뿐이다:
 *
 *     render(rows, metric) → HTML 문자열
 *     rows: [{ label, count, share }]   빈도 내림차순 (metrics.js의 rows())
 *
 * three.js도, 패널의 DOM 구조도 모른다. 그래서 나중에 이 화면 밖 — 다른 레이아웃,
 * 다른 페이지, 인쇄물 — 으로 옮길 때 같이 가져갈 것은 여기 함수 하나와
 * css/stats.css 의 같은 이름 블록 하나, 딱 둘뿐이다.
 *
 * 각 뷰는 자기 바깥 상자에 sv-<id> 클래스를 붙인다. 배치(가로로 흐를지, 줄로 쌓일지)도
 * 그 블록 안에서 정한다 — 패널 쪽 .p-rows 는 글자 크기 기준만 주고 배치는 비워 뒀다.
 * ========================================================================== */

/** 순위별 글자 크기 배수. 1위만 크고, 뒤로 갈수록 계단식으로 작아진다. */
const TIERS = [1.00, 0.90, 0.76, 0.76, 0.58, 0.58];
const TIER_TAIL = 0.46;

export const VIEWS = {
  /**
   * 시안 스크린샷의 그 모양. 한 문단처럼 이어 붙인 낱말들이 빈도순으로 작아지고
   * 흐려진다. 숫자를 하나도 쓰지 않고 분포를 보여주는 게 이 뷰의 요점이다 —
   * 관람객이 읽는 건 "몇 명"이 아니라 "무엇이 많은가"다.
   */
  ranking: {
    limit: 9,
    render(rows) {
      const items = rows.map((r, i) => {
        const size = TIERS[i] ?? TIER_TAIL;
        const tier = `t${Math.min(5, i === 0 ? 1 : i === 1 ? 2 : i <= 3 ? 3 : i <= 5 ? 4 : 5)}`;
        return `<span class="sv-rank-item ${tier}" style="font-size:calc(var(--stat-base) * ${size})">${esc(r.label)}</span>`;
      }).join("");
      return `<span class="sv-ranking">${items}</span>`;
    },
  },

  /**
   * 비율 막대. 항목 수가 적고(지역 5, 상태 5) 서로의 크기 차이가 중요한 지표에 쓴다.
   * 막대 길이는 1위 대비가 아니라 전체 대비다 — 1위 기준으로 늘리면 어떤 분포든
   * 맨 위가 꽉 차서, "고르게 퍼져 있다"와 "하나로 쏠렸다"가 같아 보인다.
   */
  bars: {
    limit: 6,
    render(rows) {
      const items = rows.map((r, i) => `
        <span class="sv-bar-row${i === 0 ? " lead" : ""}">
          <span class="sv-bar-label">${esc(r.label)}</span>
          <span class="sv-bar-track"><span class="sv-bar-fill" style="width:${(r.share * 100).toFixed(1)}%"></span></span>
          <span class="sv-bar-pct">${Math.round(r.share * 100)}<i>%</i></span>
        </span>`).join("");
      return `<span class="sv-bars">${items}</span>`;
    },
  },

  /**
   * 1위 하나만 크게. 문장이 적은 전시 초반이나, 쏠림 자체가 메시지인 지표에 쓴다.
   * 나머지는 아래 한 줄로만 스친다.
   */
  headline: {
    limit: 4,
    render(rows) {
      if (!rows.length) return `<span class="sv-headline"></span>`;
      const [top, ...rest] = rows;
      const tail = rest.map((r) => esc(r.label)).join(" · ");
      return `<span class="sv-headline">
          <span class="sv-head-word">${esc(top.label)}</span>
          <span class="sv-head-share">${Math.round(top.share * 100)}<i>%</i></span>
          ${tail ? `<span class="sv-head-rest">${tail}</span>` : ""}
        </span>`;
    },
  },
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
