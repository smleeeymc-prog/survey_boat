/* =============================================================================
 * stats/insights.js — 어떻게 읽는가. 차트 한 장에서 "한 줄 결론"을 뽑는다.
 *
 * 레퍼런스(국립현대미술관 《데미안 허스트》 디지털 러닝 dh-learning.kr 의 전시 화면)는 통계
 * 장마다 결론을 한 문장으로 먼저 말한다 — "사람들이 가장 원하는 건, “○○” 입니다."
 * 관람객은 차트를 읽으러 오지 않는다. 문장이 결론을 주고, 차트는 그 근거로 곁에 선다.
 *
 * 함수마다 (data, ctx) → { value, headline, extra, highlight } 를 돌려준다.
 *   value      보고서 머리줄 "부제 ········ 값"의 값 자리 (짧게)
 *   headline   한 줄 결론 (HTML — 강조할 낱말은 <em>). 참여자가 쓴 글은 반드시 esc 를 거친다
 *   extra      결론을 받치는 수치 한 토막 (각주 앞에 붙는다)
 *   highlight  차트에서 강조할 것 (표시 방식이 해석한다)
 *
 * ── 틀린 결론을 내지 않기 위한 규칙 ─────────────────────────────────────────
 *   · 표본이 적으면(MIN_N 미만) 경향을 말하지 않는다 — "아직 이르다"고 말한다
 *   · 1위가 동률이면 하나를 고르지 않고 둘 다 말한다
 *   · 비율의 분모를 밝힌다 — 키워드는 한 문장이 여러 개를 골라 "표"와 "사람"이 다르다
 *   · 지역색(리프트)은 칸이 작으면 우연히 튄다 — 최소 칸 수·지역 표본을 넘은 것만 말한다
 *   · 조사는 받침을 보고 붙인다(text.js) — "천안은 / 비공개는", "가족을 / 자유를"
 * ========================================================================== */

import { esc, q, josa, pick, pct, num } from "./text.js";
import { MOTIVE_OF, MOTIVES } from "./metrics.js";

/** 경향을 말하기 시작하는 최소 문장 수 */
export const MIN_N = 5;
/** 묶음(동기별·지역별)을 비교할 때 한 묶음에 필요한 최소 문장 수 */
export const MIN_GROUP = 3;
/** 지역색이라 부를 만한 최소 배율. 1.3배 미만은 "비슷하다"로 본다 */
export const MIN_LIFT = 1.3;
/** '비공개'는 지역이 아니라 "안 밝힘"이다 — 지역색·정착 온도의 결론에서는 뺀다(차트엔 남는다) */
const NOT_A_PLACE = "비공개";

const em = (s) => `<em>${esc(s)}</em>`;
const qe = (s) => `<em>${esc(q(s))}</em>`;
const early = (n) => ({
  value: "—",
  headline: `아직 문장이 ${num(n)}개뿐이라 경향을 말하기 이릅니다.`,
});

/** 기록 가운데 이 키워드를 고른 "사람" 수 (한 문장에 같은 키워드가 두 번 있어도 한 번) */
const peopleWith = (records, kw) => records.filter((r) => (r.keywords || []).includes(kw)).length;

export const INSIGHTS = {
  /** 머무는 사람이 꼽은 1위 — 레퍼런스 2장 "사람들이 가장 원하는 건, “○○” 입니다" */
  stayTop(d, ctx) {
    const [a, b] = d.items;
    if (!a || d.n < MIN_N) return early(d.n);
    const tie = b && b.count === a.count;
    const who = ctx.records.filter((r) => ctx.metric.scope.includes(r.state));
    return {
      value: tie ? `${a.label} · ${b.label}` : a.label,
      headline: tie
        ? `사람들이 여기 머무는 건, ${qe(a.label)}${josa(a.label, "과와")} ${qe(b.label)} 때문입니다.`
        : `사람들이 여기 머무는 건, ${qe(a.label)} 때문입니다.`,
      extra: `머무는 사람 ${num(d.n)}명 중 ${pct(peopleWith(who, a.label) / d.n)}${josa(pct(peopleWith(who, a.label) / d.n), "이가")} 골랐습니다`,
      highlight: tie ? [a.label, b.label] : [a.label],
    };
  },

  /** 같은 키워드 풀이 동기에 따라 어떻게 갈리는가 */
  motiveContrast(d, ctx) {
    const ok = d.groups.filter((g) => g.n >= MIN_GROUP && g.items.length);
    if (ctx.n < MIN_N || ok.length < 2) {
      return ctx.n < MIN_N ? early(ctx.n)
        : { value: "—", headline: "동기끼리 견주기에는 아직 문장이 적습니다." };
    }
    const stay = ok.find((g) => g.key === (MOTIVE_OF.stay || {}).key);
    const leave = ok.find((g) => g.key === (MOTIVE_OF.leaving || {}).key);
    const [g1, g2] = stay && leave ? [stay, leave] : ok.slice(0, 2);
    const t1 = g1.items[0].label, t2 = g2.items[0].label;
    const headline = t1 === t2
      // 같은 낱말이 반대 방향의 이유가 되는 경우 — 이 장이 존재하는 이유다
      ? `${qe(t1)}${josa(t1, "은는")} 사람을 ${short(g1.label)}도, ${short(g2.label)}도 합니다.`
      : `${esc(g1.label)}${josa(g1.label, "은는")} ${qe(t1)}, ${esc(g2.label)}${josa(g2.label, "은는")} ${qe(t2)}입니다.`;
    return {
      value: `${t1} ↔ ${t2}`,
      headline,
      extra: ok.map((g) => `${short(g.label)} ${num(g.n)}명`).join(" · "),
      highlight: [g1.key, g2.key],
    };
  },

  /** 전체 이유가 몇 개로 모이는가 (집중도) */
  concentration(d, ctx) {
    if (d.n < MIN_N || !d.items.length) return early(d.n);
    const top3 = d.items.slice(0, 3).reduce((a, r) => a + r.count, 0) / (d.total || 1);
    const k = d.items.length;
    const p = pct(top3);
    return {
      value: `상위 3개 ${p}`,
      headline: top3 >= 0.5
        ? `${num(k)}가지 이유 가운데 세 가지가 전체의 ${em(p)}${josa(p, "을를")} 차지합니다.`
        : `이유가 한쪽으로 모이지 않고 고르게 퍼져 있습니다.`,
      extra: `키워드 ${num(d.total)}표 기준 — 한 문장이 여러 개를 고를 수 있습니다`,
      // 고르게 퍼졌다고 말할 때는 아무것도 금색으로 세우지 않는다 — 상위 셋만 칠하면 4위와 같은 값이어도
      // 셋이 튀어 보여 문장과 그림이 반대로 말한다. 그때는 "고르게 나뉘면" 기준선이 주인공이다(views.js spread).
      highlight: top3 >= 0.5 ? d.items.slice(0, 3).map((r) => r.label) : [],
    };
  },

  /** 가장 자주 함께 고른 짝 — 조건부 비율로 말한다("A를 고른 사람의 N%가 B도") */
  strongestPair(d, ctx) {
    const l = d.links[0];
    if (ctx.n < MIN_N) return early(ctx.n);
    if (!l || l.count < 2) return { value: "—", headline: "아직 함께 고른 짝이 뚜렷하지 않습니다." };
    // 두 방향 중 비율이 높은 쪽으로 말한다 — 드문 쪽에서 보면 짝이 더 선명하다
    const pa = l.count / (d.freq[l.a] || 1), pb = l.count / (d.freq[l.b] || 1);
    const [from, to, p] = pa >= pb ? [l.a, l.b, pa] : [l.b, l.a, pb];
    const ps = pct(p);
    return {
      value: `${l.a} + ${l.b}`,
      headline: `${qe(from)}${josa(from, "을를")} 고른 사람의 ${em(ps)}${josa(ps, "이가")} ${qe(to)}도 골랐습니다.`,
      extra: `함께 고른 문장 ${num(l.count)}개`,
      highlight: { a: l.a, b: l.b },
    };
  },

  /** 가장 많은 상태 */
  topState(d) {
    const [a, b] = d.items;
    if (!a || d.n < MIN_N) return early(d.n);
    const tie = b && b.count === a.count;
    return {
      value: tie ? `${a.label} · ${b.label}` : a.label,
      headline: tie
        ? `${qe(a.label)}${josa(a.label, "과와")} ${qe(b.label)}${pick(b.label, "이", "가")} 나란히 가장 많습니다.`
        : `가장 많은 사람이 ${qe(a.label)}${pick(a.label, "이라고", "라고")} 답했습니다.`,
      extra: `${num(d.n)}명 중 ${pct(a.share)}`,
      highlight: tie ? [a.label, b.label] : [a.label],
    };
  },

  /** 지역색 — 어떤 지역에서 어떤 상태가 평균보다 두드러지는가 (리프트) */
  regionalColor(d) {
    if (d.total < MIN_N * 2) return early(d.total);
    let best = null;
    d.cols.forEach((region, j) => {
      if (region === NOT_A_PLACE) return;
      const rt = d.colTotals[j];
      if (rt < MIN_N) return;                         // 지역 표본이 작으면 한 명에 크게 흔들린다
      d.rows.forEach((state, i) => {
        const c = d.cells[i][j];
        if (c < MIN_GROUP) return;                    // 칸이 작으면 우연히 튄다
        const lift = (c / rt) / (d.rowTotals[i] / d.total);
        if (!best || lift > best.lift) best = { region, state, i, j, c, rt, lift };
      });
    });
    if (!best || best.lift < MIN_LIFT) {
      return { value: "—", headline: "지역마다 서 있는 자리가 아직 크게 다르지 않습니다." };
    }
    const x = best.lift.toFixed(1);
    return {
      value: `${best.region} · ${best.state}`,
      headline: `${em(best.region)}${josa(best.region, "은는")} ${qe(best.state)}${josa(best.state, "이가")} 평균보다 ${em(x + "배")} 많습니다.`,
      extra: `${best.region} ${num(best.rt)}명 중 ${pct(best.c / best.rt)} · 전체 평균 ${pct(d.rowTotals[best.i] / d.total)}`,
      highlight: { row: best.i, col: best.j },
    };
  },

  /** 정착 온도 — 사람을 가장 붙잡고 있는 곳 */
  settle(d) {
    const ok = d.items.filter((it) => it.n >= MIN_GROUP && it.label !== NOT_A_PLACE);
    if (ok.length < 2) return { value: "—", headline: "지역을 견주기에는 아직 문장이 적습니다." };
    const top = ok[0], low = ok[ok.length - 1];
    const sg = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
    return {
      value: `${top.label} ${sg(top.score)}`,
      headline: `사람을 가장 붙잡고 있는 곳은 ${em(top.label)}입니다.`,
      extra: `가장 낮은 곳은 ${low.label} ${sg(low.score)} · 지역별 ${MIN_GROUP}명 이상만 비교`,
      highlight: [top.label],
    };
  },

  /** 유입 속도 */
  inflow(d) {
    if (!d.recent) {
      return { value: `0개 / ${d.windowMin}분`, headline: "지난 한 시간은 바다가 조용했습니다." };
    }
    const n = `${num(d.recent)}개`;
    const base = { value: `${n} / ${d.windowMin}분`, headline: `지난 한 시간 동안 ${em(n)}의 문장이 도착했습니다.` };
    // "가장 붐빈 때"는 한 칸이 혼자 높을 때만 말한다. 1·1·1 처럼 동률이면 어느 칸을 골라도
    // 거짓이 된다 — 그때는 가장 최근 문장이 언제 왔는지를 말하고, 그 칸을 가리킨다.
    const max = Math.max(...d.buckets);
    const per = d.windowMin / d.buckets.length;
    if (max >= 2 && d.buckets.filter((v) => v === max).length === 1) {
      const peak = d.buckets.indexOf(max);
      const ago = Math.round((d.buckets.length - peak - 0.5) * per / 5) * 5;
      return { ...base, extra: ago <= 5 ? "가장 붐빈 때는 방금 전입니다" : `가장 붐빈 때는 ${ago}분 전입니다`, highlight: peak };
    }
    let last = d.buckets.length - 1;
    while (last > 0 && !d.buckets[last]) last--;
    const m = d.lastAgoMin == null ? null : Math.round(d.lastAgoMin);
    return {
      ...base,
      extra: m == null ? "" : m < 1 ? "가장 최근 문장은 방금 도착했습니다" : `가장 최근 문장은 ${num(m)}분 전에 도착했습니다`,
      highlight: last,
    };
  },

  /** 문장 벽 */
  voices(d) {
    if (!d.items.length) return { value: "—", headline: "아직 남겨진 문장이 없습니다." };
    return { value: `최근 ${num(d.items.length)}개`, headline: "가장 최근에 남겨진 문장부터 흘러갑니다." };
  },
};

/** "머무르게 하는 것" → "머무르게" (문장 안에서 짧게 부를 때) */
function short(label) {
  const m = String(label).match(/^(\S+게)/);
  return m ? m[1] : label;
}

export { MOTIVES };
