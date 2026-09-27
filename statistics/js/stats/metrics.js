/* =============================================================================
 * stats/metrics.js — 무엇을 세는가.
 *
 * 통계는 네 층으로 나뉜다. 한 층을 바꿔도 다른 층은 손댈 일이 없다.
 *   metrics.js   무엇을 세는가        ← 여기
 *   insights.js  어떻게 읽는가 (값 · 한 줄 결론)
 *   views.js     어떻게 그리는가
 *   index.js     무엇을 어떻게, 어떤 순서로
 *
 * ── 모양(shape) ────────────────────────────────────────────────────────────
 * 지표는 자기 shape 을 선언하고, 그리는 쪽은 받을 수 있는 shape 을 선언한다.
 * index.js가 짝을 지을 때 맞는지 검사하므로, 안 맞는 조합은 켜는 순간 콘솔에서 걸린다.
 *
 *   rows    {items:[{label,count,share}], total, n}          랭킹 · 막대 · 버블
 *   groups  {groups:[{key,label,n,items:[…rows]}]}           동기별 이유
 *   matrix  {rows, cols, cells, colTotals, max, total}       히트맵
 *   pairs   {nodes:[{label,count}], links:[{a,b,count}]}     동시출현
 *   scores  {items:[{label,score,n}], min, max}              정착 온도 (다이버징)
 *   pulse   {total, buckets, recent, windowMin}              유입 속도
 *   stream  {items:[{text, meta}]}                           문장 벽
 *
 * ── 키워드는 상태마다 다른 질문의 답이다 ─────────────────────────────────────
 * 설문은 키워드를 "그 문장을 설명하는 키워드"로 받는다. 그 문장이 답하는 질문(Q3)은
 * 상태마다 다르다 — 머무르게 하는 것 / 떠나게 하는 것 / 오가게 하는 것 / 망설이게 하는 것.
 * 그래서 같은 '가족'이라도 누구의 답이냐에 따라 뜻이 반대다. "사람들이 여기 머무는 건
 * 가족 때문"이라고 말하려면 머무는 사람의 답만 세야 한다. 모두 합쳐 세면 떠나는 이유까지
 * 머무는 이유로 둔갑한다(예전 화면이 그랬다).
 * ========================================================================== */

import { STATE_LABEL, STATES, REGIONS, SENTENCE_Q } from "../config.js";
import { tally } from "../store.js";

/**
 * 동기 묶음 — Q3 질문 문구가 같은 상태끼리 한 묶음이다. 문구에서 자동으로 만든다:
 * 설문이 문구를 바꾸거나 상태를 늘려도 여기를 고칠 필요가 없다.
 *   머무르는 중 · 돌아온 사람 → "머무르게 하는 것" (같은 문장을 묻는다)
 *   떠날 준비 중 → "떠나게 하는 것" …
 * 문구가 없으면(분류값 파일이 옛날 것이면) 상태마다 한 묶음으로 물러선다.
 */
export const MOTIVES = (() => {
  const byQ = new Map();
  for (const s of STATES) {
    const qtext = SENTENCE_Q[s.id] || s.id;
    if (!byQ.has(qtext)) {
      const m = String(qtext).match(/(\S+게 하는 것)/);
      byQ.set(qtext, { key: s.id, label: m ? m[1] : s.label, states: [] });
    }
    byQ.get(qtext).states.push(s.id);
  }
  return [...byQ.values()];
})();
/** 상태 id → 그 상태가 속한 동기 묶음 */
export const MOTIVE_OF = Object.fromEntries(MOTIVES.flatMap((m) => m.states.map((s) => [s, m])));
/** "머무르게 하는 것" 묶음 — 머무는 이유를 셀 때 쓴다 */
const STAY_MOTIVE = MOTIVE_OF.stay;

/**
 * 정착 온도 점수 — 머무름 +2 · 돌아온 사람 +1 · 오가는 중/아직 모르겠음 0 · 떠날 준비 −2.
 * 지역별 평균을 내면 "이 지역이 사람을 붙잡고 있는 정도"가 한 축으로 나온다.
 * 다른 지표는 세기만 하지만 이건 해석이 들어간 축이다 — 여기 숫자가 곧 편집 판단이라,
 * 화면에서 뭔가 이상해 보이면 집계 코드가 아니라 이 다섯 숫자를 먼저 의심할 것.
 */
export const SETTLE_SCORE = { stay: 2, returned: 1, between: 0, unsure: 0, leaving: -2 };
export const SETTLE_RANGE = 2;   // 점수의 절댓값 상한 = 다이버징 축의 양 끝

export const METRICS = [
  {
    // 머무는 사람(머무르는 중 + 돌아온 사람)이 고른 키워드만 센다 — 위 머리말 참고.
    id: "stayReason", label: "머무르게 하는 이유", shape: "rows", votes: true,
    scope: STAY_MOTIVE ? STAY_MOTIVE.states : ["stay"],
    build: (rs, m) => rowsOf(rs.filter((r) => m.scope.includes(r.state)), (r) => r.keywords),
  },
  {
    // 같은 키워드 풀이 동기에 따라 어떻게 갈리는가. 이 프로젝트에서만 나오는 축이다.
    id: "motives", label: "같은 낱말, 다른 이유", shape: "groups", votes: true,
    build: (rs) => ({
      groups: MOTIVES.map((mo) => {
        const sub = rs.filter((r) => mo.states.includes(r.state));
        return { key: mo.key, label: mo.label, n: sub.length, ...rowsOf(sub, (r) => r.keywords) };
      }),
    }),
  },
  {
    // 동기를 가리지 않은 전체 분포. 방향(머묾/떠남)이 아니라 "무엇이 사람들의 자리를
    // 정하는가"를 본다 — 그래서 제목도 '머무는 이유'가 아니라 '이유'다.
    id: "reason", label: "사람들이 고른 이유", shape: "rows", votes: true,
    build: (rs) => rowsOf(rs, (r) => r.keywords),
  },
  {
    // 개인은 몰라도 집단에서 발견되는 패턴. "일+가족"이 묶이는지 "불안+주거"가 묶이는지.
    // 한 문장 안의 키워드끼리 짝을 짓는다 — 같은 질문에 대한 답이라 동기를 섞지 않는다.
    id: "keywordPairs", label: "함께 고른 이유들", shape: "pairs",
    build: (rs) => coOccurrence(rs, (r) => r.keywords, 8, 14),
  },
  {
    id: "state", label: "지금 사람들이 서 있는 자리", shape: "rows",
    build: (rs) => rowsOf(rs, (r) => STATE_LABEL[r.state] || r.state),
  },
  {
    id: "region", label: "문장이 도착한 곳", shape: "rows",
    build: (rs) => rowsOf(rs, (r) => r.region),
  },
  {
    // 지역마다 사람들이 서 있는 자리가 다른가. "아산은 머무름이 많고 천안은 오가는
    // 중이 많다" 같은 지역색은 한쪽만 세어서는 절대 안 나온다 — 교차해야 나온다.
    id: "regionState", label: "지역마다 다른 자리", shape: "matrix",
    build: (rs) => crossTab(rs, (r) => STATE_LABEL[r.state] || r.state, (r) => r.region,
      STATES.map((s) => s.label), REGIONS),
  },
  {
    id: "settleTemp", label: "정착 온도", shape: "scores",
    build: (rs) => scoresBy(rs, (r) => r.region, (r) => SETTLE_SCORE[r.state]),
  },
  {
    id: "inflow", label: "문장이 도착하는 속도", shape: "pulse",
    build: (rs) => pulseOf(rs, 60, 12),
  },
  {
    // 워드클라우드가 아니라 문장 그대로. 이 프로젝트는 사적 고백의 아카이브라,
    // 낱말로 쪼개는 순간 남는 건 통계뿐이고 정작 남기려던 것이 사라진다.
    id: "sentences", label: "지금 바다에 떠 있는 문장들", shape: "stream",
    build: (rs) => streamOf(rs, 12),
  },
];

export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m]));

/* ── shape 별 집계 ────────────────────────────────────────────────────────── */

/**
 * rows — 1차원 빈도.
 * share 의 분모는 "표 수"다. 키워드는 한 문장이 여러 개를 고를 수 있어서 표 수가 문장 수보다
 * 많다 — 그래서 막대 합이 100%가 되는 표 수를 기준으로 삼고, 결론 문장에서 "몇 %의 사람이"
 * 라고 말할 때는 따로 사람 수(n) 기준으로 다시 계산한다(insights.js).
 */
export function rowsOf(records, pick, limit = 10) {
  const t = tally(records, pick);
  const total = t.reduce((a, r) => a + r.count, 0);
  const d = total || 1;
  return { items: t.slice(0, limit).map((r) => ({ ...r, share: r.count / d })), total, n: records.length };
}

/**
 * matrix — 교차표. 축 라벨을 밖에서 받아 순서를 고정한다.
 * 빈도순으로 정렬하면 새 문장이 들어올 때마다 행이 자리를 바꿔서, 어제 본 화면과
 * 오늘 본 화면을 비교할 수가 없다. 설문의 선택지 순서를 그대로 쓴다.
 */
function crossTab(records, pickRow, pickCol, rowLabels, colLabels) {
  const ri = new Map(rowLabels.map((l, i) => [l, i]));
  const ci = new Map(colLabels.map((l, i) => [l, i]));
  const cells = rowLabels.map(() => colLabels.map(() => 0));
  let total = 0;
  for (const r of records) {
    const a = ri.get(pickRow(r)), b = ci.get(pickCol(r));
    if (a === undefined || b === undefined) continue;
    cells[a][b]++; total++;
  }
  let max = 0;
  for (const row of cells) for (const v of row) if (v > max) max = v;
  const rowTotals = cells.map((row) => row.reduce((a, v) => a + v, 0));
  const colTotals = colLabels.map((_, j) => cells.reduce((a, row) => a + row[j], 0));
  return { rows: rowLabels, cols: colLabels, cells, rowTotals, colTotals, max, total };
}

/** pairs — 같은 기록 안에서 함께 고른 값들의 짝. */
function coOccurrence(records, pick, maxNodes = 8, maxLinks = 14) {
  const freq = new Map();
  const pairs = new Map();
  for (const r of records) {
    const vals = [...new Set((pick(r) || []).filter(Boolean))];
    for (const v of vals) freq.set(v, (freq.get(v) || 0) + 1);
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        // 짝은 순서가 없다. 정렬해서 한 방향으로만 센다.
        const key = JSON.stringify([vals[i], vals[j]].sort());
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }
  const nodes = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, maxNodes).map(([label, count]) => ({ label, count }));
  const keep = new Set(nodes.map((n) => n.label));
  const links = [...pairs.entries()]
    .map(([key, count]) => { const [a, b] = JSON.parse(key); return { a, b, count }; })
    .filter((l) => keep.has(l.a) && keep.has(l.b))
    .sort((x, y) => y.count - x.count || (x.a + x.b).localeCompare(y.a + y.b, "ko"))
    .slice(0, maxLinks);
  return { nodes, links, maxLink: links.length ? links[0].count : 1, freq: Object.fromEntries(freq) };
}

/** scores — 그룹별 평균 점수. 표본이 없는 그룹은 뺀다 (0점과 "없음"은 다르다). */
function scoresBy(records, pickGroup, pickScore) {
  const sum = new Map(), n = new Map();
  for (const r of records) {
    const g = pickGroup(r), v = pickScore(r);
    if (g === undefined || v === undefined) continue;
    sum.set(g, (sum.get(g) || 0) + v);
    n.set(g, (n.get(g) || 0) + 1);
  }
  const items = [...n.keys()]
    .map((label) => ({ label, score: sum.get(label) / n.get(label), n: n.get(label) }))
    .sort((a, b) => b.score - a.score || b.n - a.n);
  return { items, min: -SETTLE_RANGE, max: SETTLE_RANGE };
}

/** pulse — 최근 windowMin 분을 bucketCount 칸으로. 누적 수와 최근 유입 속도. */
function pulseOf(records, windowMin = 60, bucketCount = 12, now = Date.now()) {
  const span = windowMin * 60000;
  const buckets = new Array(bucketCount).fill(0);
  let recent = 0, newest = -Infinity;
  for (const r of records) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t)) continue;
    if (t > newest) newest = t;
    const age = now - t;
    if (age < 0 || age >= span) continue;
    recent++;
    // 0번 칸이 가장 오래된 쪽 — 왼쪽에서 오른쪽으로 시간이 흐른다.
    const i = Math.min(bucketCount - 1, Math.floor(((span - age) / span) * bucketCount));
    buckets[i]++;
  }
  // 가장 최근 문장이 몇 분 전인가 — 칸끼리 동률이라 "가장 붐빈 때"를 말할 수 없을 때 쓴다
  const lastAgoMin = Number.isFinite(newest) ? Math.max(0, (now - newest) / 60000) : null;
  return { total: records.length, buckets, recent, windowMin, lastAgoMin };
}

/** stream — 최신 문장부터. 가려진 기록과 빈 문장은 뺀다. */
function streamOf(records, limit = 12) {
  const items = records
    .filter((r) => r.text && r.moderation_status !== "hidden")
    .slice(-limit).reverse()
    .map((r) => ({ text: r.text, meta: `${r.region} · ${STATE_LABEL[r.state] || r.state}` }));
  return { items };
}
