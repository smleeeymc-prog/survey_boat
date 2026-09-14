/* =============================================================================
 * stats/metrics.js — 무엇을 세는가.
 *
 * "무엇을 세는가"와 "어떻게 그리는가"를 따로 둔다. 같은 값을 다른 모양으로 여러 번
 * 보여줄 수도 있고, 새 지표가 생겨도 그리는 쪽은 손댈 일이 없다.
 *   metrics.js  무엇을      ← 여기
 *   views.js    어떻게
 *   index.js    무엇을 어떻게, 어떤 순서로
 *
 * ── 모양(shape) ────────────────────────────────────────────────────────────
 * 지표마다 나오는 데이터의 구조가 다르다(1차원 집계 / 교차표 / 짝 / 문장 / 시계열).
 * 그래서 지표는 자기 shape 을 선언하고, 뷰는 받을 수 있는 shape 을 선언한다.
 * index.js가 짝을 지을 때 맞는지 검사하므로, 안 맞는 조합은 전시 중이 아니라
 * 켜는 순간 콘솔에서 걸린다.
 *
 *   rows    {items:[{label,count,share}], total}          랭킹 · 막대 · 버블
 *   matrix  {rows, cols, cells, max, total}               히트맵
 *   pairs   {nodes:[{label,count}], links:[{a,b,count}]}  동시출현 네트워크
 *   scores  {items:[{label,score,n}], min, max}           정착 온도 (다이버징)
 *   pulse   {total, buckets, recent, windowMin}           누적 + 유입 속도
 *   stream  {items:[{text, meta}]}                        자유응답 벽
 * ========================================================================== */

import { STATE_LABEL, STATES, REGIONS } from "../config.js";
import { tally } from "../store.js";

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
    id: "reason", label: "가장 많이 선택된 이유", shape: "rows",
    // 버블 뷰가 1위를 한 문장으로 만든다. 문구가 지표마다 다르므로 뷰가 아니라
    // 지표가 들고 있어야 한다 — 뷰는 어떤 지표였는지 몰라야 갈아끼울 수 있다.
    headline: (top) => `사람들이 여기 머무는 건, "${top.label}" 때문입니다`,
    build: (rs) => rowsOf(rs, (r) => r.keywords),
  },
  {
    id: "state", label: "지금 사람들이 서 있는 자리", shape: "rows",
    headline: (top) => `가장 많은 답은 "${top.label}"입니다`,
    build: (rs) => rowsOf(rs, (r) => STATE_LABEL[r.state] || r.state),
  },
  {
    id: "region", label: "문장이 도착한 곳", shape: "rows",
    headline: (top) => `문장이 가장 많이 온 곳은 ${top.label}입니다`,
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
    // 개인은 몰라도 집단에서 발견되는 패턴. "일+가족"이 묶이는지 "불안+주거"가 묶이는지.
    id: "keywordPairs", label: "함께 고른 이유들", shape: "pairs",
    build: (rs) => coOccurrence(rs, (r) => r.keywords, 8, 14),
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

/** rows — 1차원 빈도. share 의 분모는 응답자 수가 아니라 표 수다(키워드는 복수 선택). */
function rowsOf(records, pick, limit = 10) {
  const t = tally(records, pick);
  const total = t.reduce((a, r) => a + r.count, 0) || 1;
  return { items: t.slice(0, limit).map((r) => ({ ...r, share: r.count / total })), total };
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
  return { rows: rowLabels, cols: colLabels, cells, max, total };
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
  const nodes = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxNodes)
    .map(([label, count]) => ({ label, count }));
  const keep = new Set(nodes.map((n) => n.label));
  const links = [...pairs.entries()]
    .map(([key, count]) => { const [a, b] = JSON.parse(key); return { a, b, count }; })
    .filter((l) => keep.has(l.a) && keep.has(l.b))
    .sort((x, y) => y.count - x.count).slice(0, maxLinks);
  return { nodes, links, maxLink: links.length ? links[0].count : 1 };
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
    .sort((a, b) => b.score - a.score);
  return { items, min: -SETTLE_RANGE, max: SETTLE_RANGE };
}

/** pulse — 최근 windowMin 분을 bucketCount 칸으로. 누적 수와 최근 유입 속도. */
function pulseOf(records, windowMin = 60, bucketCount = 12) {
  const now = Date.now();
  const span = windowMin * 60000;
  const buckets = new Array(bucketCount).fill(0);
  let recent = 0;
  for (const r of records) {
    const t = Date.parse(r.created_at);
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    if (age < 0 || age >= span) continue;
    recent++;
    // 0번 칸이 가장 오래된 쪽 — 왼쪽에서 오른쪽으로 시간이 흐른다.
    const i = Math.min(bucketCount - 1, Math.floor(((span - age) / span) * bucketCount));
    buckets[i]++;
  }
  return { total: records.length, buckets, recent, windowMin, perHour: recent * (60 / windowMin) };
}

/** stream — 최신 문장부터. 가려진 기록과 빈 문장은 뺀다. */
function streamOf(records, limit = 12) {
  const items = records
    .filter((r) => r.text && r.moderation_status !== "hidden")
    .slice(-limit).reverse()
    .map((r) => ({ text: r.text, meta: `${r.region} · ${STATE_LABEL[r.state] || r.state}` }));
  return { items };
}
