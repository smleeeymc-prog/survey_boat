#!/usr/bin/env node
/* =============================================================================
 * check-insights.mjs — 통계 "한 줄 결론"이 틀리지 않는지 확인한다.
 *
 *   node statistics/tools/check-insights.mjs      (다 맞으면 exit 0, 하나라도 틀리면 exit 1)
 *
 * 결론 문장은 데이터에서 자동으로 만들어져 전시장 화면에 그대로 뜬다. 숫자·조사·방향이
 * 틀리면 관람객이 그대로 읽는다. 브라우저 없이 돈다 — 통계 층(js/stats/*)은 three.js를
 * 모르므로 node에서 바로 불러올 수 있다. 설문 분류값만 전역에 먼저 올려 둔다.
 * ========================================================================== */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STAT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 설문 분류값은 클래식 스크립트(var SURVEY_TAXONOMY)라 전역에 올려 둔다 (브라우저와 같은 조건)
vm.runInThisContext(fs.readFileSync(path.join(STAT, "shared", "survey-taxonomy.js"), "utf8"));
globalThis.SURVEY_TAXONOMY = SURVEY_TAXONOMY; // eslint-disable-line no-undef

const imp = (p) => import(pathToFileURL(path.join(STAT, p)).href);
const { hasFinal, josa, pct } = await imp("js/stats/text.js");
const { METRIC, MOTIVES, rowsOf } = await imp("js/stats/metrics.js");
const { INSIGHTS, liveInsight, MIN_N } = await imp("js/stats/insights.js");

let fail = 0, pass = 0;
const strip = (h) => String(h).replace(/<[^>]+>/g, "");
function eq(name, got, want) {
  if (got === want) { pass++; return; }
  fail++; console.log(`✗ ${name}\n    기대: ${want}\n    실제: ${got}`);
}
function ok(name, cond, detail = "") {
  if (cond) { pass++; return; }
  fail++; console.log(`✗ ${name} ${detail}`);
}

// ── 조사 ─────────────────────────────────────────────────────────────────
eq("받침 있음(천안)", josa("천안", "은는"), "은");
eq("받침 없음(비공개)", josa("비공개", "은는"), "는");
eq("가족을", josa("가족", "을를"), "을");
eq("자유를", josa("자유", "을를"), "를");
eq("관계와", josa("관계", "과와"), "와");
eq("일과", josa("일", "과와"), "과");
eq("따옴표 무시", josa("“소속감”", "을를"), "을");
eq("31%가 (퍼센트로 읽는다)", josa("31%", "이가"), "가");
eq("1% 미만이", josa("1% 미만", "이가"), "이");
eq("3개 — 받침 없음(3개를)", hasFinal("3개"), false);
eq("3명 — 받침 있음(3명을)", hasFinal("3명"), true);
eq("숫자 7(칠)", hasFinal("7"), true);
eq("숫자 2(이)", hasFinal("2"), false);
eq("0.4% → 1% 미만", pct(0.004), "1% 미만");
eq("0% ", pct(0), "0%");

// ── 동기 묶음은 설문 질문 문구에서 나온다 ───────────────────────────────────
const stayMotive = MOTIVES.find((m) => m.states.includes("stay"));
ok("머무르는 중·돌아온 사람은 한 묶음(같은 질문)", stayMotive && stayMotive.states.includes("returned"),
   JSON.stringify(MOTIVES));
eq("묶음 이름", stayMotive && stayMotive.label, "머무르게 하는 것");
ok("떠날 준비 중은 따로", MOTIVES.some((m) => m.states.length === 1 && m.states[0] === "leaving"));

// ── 데이터 만들기 ─────────────────────────────────────────────────────────
let id = 0;
const rec = (state, region, keywords, minsAgo = 10) => ({
  record_id: `t${++id}`, state, region, keywords, text: "문장",
  created_at: new Date(Date.now() - minsAgo * 60000).toISOString(),
});
const run = (metricId, insightId, records) => {
  const m = METRIC[metricId];
  return INSIGHTS[insightId](m.build(records, m), { records, n: records.length, metric: m });
};

// ── 머무는 이유는 머무는 사람의 답만 센다 ─────────────────────────────────────
{
  // 떠나는 사람 8명이 '일'을, 머무는 사람 5명이 '가족'을 골랐다.
  // 전체를 세면 1위가 '일'이 되어 "머무는 건 일 때문"이라는 거꾸로 된 결론이 나온다.
  const rs = [
    ...Array.from({ length: 8 }, () => rec("leaving", "천안", ["일"])),
    ...Array.from({ length: 4 }, () => rec("stay", "아산", ["가족"])),
    rec("returned", "아산", ["가족", "관계"]),
  ];
  const r = run("stayReason", "stayTop", rs);
  eq("머무는 이유 = 가족 (떠나는 사람의 '일'이 섞이면 안 된다)", r.value, "가족");
  eq("머무는 이유 문장", strip(r.headline), "사람들이 여기 머무는 건, “가족” 때문입니다.");
  eq("분모는 머무는 사람 5명", strip(r.extra), "머무는 사람 5명 중 100%가 골랐습니다");
}
// 동률
{
  const rs = [
    ...Array.from({ length: 3 }, () => rec("stay", "아산", ["가족"])),
    ...Array.from({ length: 3 }, () => rec("stay", "아산", ["관계"])),
  ];
  const r = run("stayReason", "stayTop", rs);
  eq("동률이면 둘 다", strip(r.headline), "사람들이 여기 머무는 건, “가족”과 “관계” 때문입니다.");
}
// 표본 부족
{
  const r = run("stayReason", "stayTop", [rec("stay", "아산", ["가족"])]);
  ok("표본이 적으면 결론을 말하지 않는다", /이릅니다/.test(strip(r.headline)), strip(r.headline));
}

// ── 같은 낱말, 다른 이유 ───────────────────────────────────────────────────
{
  const rs = [
    ...Array.from({ length: 4 }, () => rec("stay", "아산", ["가족"])),
    ...Array.from({ length: 4 }, () => rec("leaving", "천안", ["일"])),
  ];
  const r = run("motives", "motiveContrast", rs);
  eq("머무르게 vs 떠나게", strip(r.headline), "머무르게 하는 것은 “가족”, 떠나게 하는 것은 “일”입니다.");
  const same = [
    ...Array.from({ length: 4 }, () => rec("stay", "아산", ["가족"])),
    ...Array.from({ length: 4 }, () => rec("leaving", "천안", ["가족"])),
  ];
  eq("같은 낱말이 양쪽 1위", strip(run("motives", "motiveContrast", same).headline),
     "“가족”은 사람을 머무르게도, 떠나게도 합니다.");
}

// ── 지역색(리프트) ─────────────────────────────────────────────────────────
{
  // 천안 10명 중 6명이 오가는 중(60%), 전체 평균은 20명 중 7명(35%) → 1.7배
  const rs = [
    ...Array.from({ length: 6 }, () => rec("between", "천안", [])),
    ...Array.from({ length: 4 }, () => rec("stay", "천안", [])),
    ...Array.from({ length: 1 }, () => rec("between", "아산", [])),
    ...Array.from({ length: 9 }, () => rec("stay", "아산", [])),
  ];
  const r = run("regionState", "regionalColor", rs);
  eq("지역색 문장", strip(r.headline), "천안은 “오가는 중”이 평균보다 1.7배 많습니다.");
  eq("근거 수치", strip(r.extra), "천안 10명 중 60% · 전체 평균 35%");
  // '비공개'는 지역이 아니다
  const rs2 = [
    ...Array.from({ length: 6 }, () => rec("between", "비공개", [])),
    ...Array.from({ length: 14 }, () => rec("stay", "아산", [])),
  ];
  ok("'비공개'는 지역색으로 말하지 않는다", !/비공개/.test(strip(run("regionState", "regionalColor", rs2).headline)));
}

// ── 동시출현(조건부 비율) ───────────────────────────────────────────────────
{
  // 가족 10명, 그중 4명이 일도 → 40%. 일은 5명 중 4명이 가족도 → 80% (더 선명한 쪽으로 말한다)
  const rs = [
    ...Array.from({ length: 4 }, () => rec("stay", "아산", ["가족", "일"])),
    ...Array.from({ length: 6 }, () => rec("stay", "아산", ["가족"])),
    rec("stay", "아산", ["일"]),
  ];
  const r = run("keywordPairs", "strongestPair", rs);
  eq("조건부 비율 문장", strip(r.headline), "“일”을 고른 사람의 80%가 “가족”도 골랐습니다.");
}

// ── 상태 ─────────────────────────────────────────────────────────────────
{
  const rs = [...Array.from({ length: 5 }, () => rec("stay", "아산", [])), rec("leaving", "아산", [])];
  eq("상태 문장(이라고)", strip(run("state", "topState", rs).headline), "가장 많은 사람이 “머무르는 중”이라고 답했습니다.");
}

// ── 유입 속도 ─────────────────────────────────────────────────────────────
{
  eq("조용할 때", strip(run("inflow", "inflow", [rec("stay", "아산", [], 200)]).headline),
     "지난 한 시간은 바다가 조용했습니다.");
  const rs = [rec("stay", "아산", [], 2), rec("stay", "아산", [], 3), rec("stay", "아산", [], 40)];
  eq("유입 문장", strip(run("inflow", "inflow", rs).headline), "지난 한 시간 동안 3개의 문장이 도착했습니다.");
  // 2분 전·3분 전은 같은 칸(마지막 5분), 40분 전은 다른 칸 → 한 칸이 혼자 2개라 "가장 붐빈 때"
  eq("붐빈 때(혼자 높은 칸)", strip(run("inflow", "inflow", rs).extra), "가장 붐빈 때는 방금 전입니다");
  // 칸마다 하나씩(동률)이면 붐빈 때를 지어내지 않는다
  const flat = [rec("stay", "아산", [], 12), rec("stay", "아산", [], 32), rec("stay", "아산", [], 52)];
  eq("동률이면 가장 최근 문장", strip(run("inflow", "inflow", flat).extra), "가장 최근 문장은 12분 전에 도착했습니다");
}

// ── 방금 도착한 문장 ─────────────────────────────────────────────────────
{
  const rs = [
    ...Array.from({ length: 6 }, () => rec("leaving", "천안", ["일"])),
    ...Array.from({ length: 3 }, () => rec("stay", "아산", ["일"])),     // 머무는 사람의 '일'은 세지 않는다
  ];
  const mine = rec("leaving", "아산", ["일", "주거"]);
  rs.push(mine);
  rs.push(rec("leaving", "천안", ["일"]));                               // 내 뒤에 온 문장도 세지 않는다
  const r = liveInsight(mine, rs, rowsOf);
  eq("같은 동기 안에서 순번(뒤에 온 문장 제외)", strip(r.headline), "이 문장은 “일” 때문에 떠나려는 7번째 이야기입니다.");
  eq("두 번째 키워드·지역 순번", strip(r.extra), "“주거” 1번째 · 아산에서 온 4번째 문장");
  const none = rec("stay", "비공개", []);
  eq("키워드 없는 문장", strip(liveInsight(none, [none], rowsOf).headline), "이 문장은 비공개에서 온 1번째 이야기입니다.");
}

ok("MIN_N 은 양수", MIN_N > 0);
console.log(`\n[check-insights] 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
