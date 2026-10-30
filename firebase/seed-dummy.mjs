/* =============================================================================
 * seed-dummy.mjs — 실DB(records + thumbs)에 더미 기록을 넣는다.
 *
 * 전시 전에 지도·통계·아카이브가 기록이 쌓인 상태에서 어떻게 보이는지 보려는 것이다.
 *   1차(09-30): 다듬은 긴 문장 40건, 썸네일 없음 — 실제 참여자 글과 결이 달라 내렸다.
 *   2차(10-30): 실제 참여자 말투를 따른 44건(dummy/rows.mjs) + 실제 설문 화면으로 찍은 배 그림(dummy/thumbs.mjs)
 *               + 새 문항 마음(Ⅳ, feeling)도 열에 일곱쯤 채운다.
 * 설문이 쓰는 길과 똑같이 쓴다: 익명 로그인 → records/{id} 생성(created_at = 서버 시각) → thumbs/{id} 생성.
 * 모양은 설문과 같은 RECORD_SCHEMA.makeRecord / checkNew 로 만들고 검사한다 — 규칙이 거절할 기록은 안 보낸다.
 *
 *   cd firebase && npm install
 *   node seed-dummy.mjs --dry-run              # 44건 검사만 (네트워크·브라우저 없음)
 *   node seed-dummy.mjs --preview ../tmp-thumbs   # 썸네일만 찍어 폴더에 (DB 안 씀)
 *   NODE_USE_ENV_PROXY=1 node seed-dummy.mjs   # 실DB에 쓰기 → 쓴 id를 dummy-records.json 에 남긴다
 *     --gap 20   한 척씩 넣는 간격(초, 기본 20). 지도는 시계로 도는 한 바다라 한꺼번에 넣으면 등장 자리에 몰린다
 *
 * 마음(feeling)은 10-30 규칙에 새로 들어간 필드다 — **콘솔에 새 firestore.rules 를 게시한 뒤에** 돌린다.
 * 그 전이면 첫 기록에서 거절되고 멈춘다(마음이 있는 기록을 맨 앞에 둔다).
 *
 * 되돌리기: 규칙이 수정·삭제를 막으므로 콘솔에서 한다(HANDOFF.md 13.0의 7번) —
 * dummy-records.json 의 id마다 moderation_status 를 "hidden" 으로. 지도에서는 바로 사라진다(썸네일은 기록을 따라 숨는다).
 * 모든 기록의 created_at 은 보낸 순간이다(규칙이 request.time 만 받는다) — 과거 날짜로 흩을 수 없다.
 * ========================================================================== */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDummies } from "./dummy/rows.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(HERE, "../statistics/shared");
// 분류값·스키마는 클래식 스크립트(전역에 얹는다) — 설문·지도와 같은 파일을 그대로 돌린다
for (const f of ["survey-taxonomy.js", "record-schema.js"]) vm.runInThisContext(fs.readFileSync(path.join(SHARED, f), "utf8"), { filename: f });
const S = globalThis.RECORD_SCHEMA;
const T = globalThis.SURVEY_TAXONOMY;
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i < 0 ? dflt : process.argv[i + 1]; };

const items = buildDummies(S, T);
// 규칙 확인용으로 마음이 있는 기록을 맨 앞에 — 옛 규칙이면 여기서 거절된다
const probe = items.findIndex((x) => x.record[S.FEELING_FIELD]);
items.unshift(...items.splice(probe, 1));

let bad = 0;
items.forEach(({ record: r }, i) => {
  const p = S.checkNew(r);
  if (p.length) { bad++; console.error(`[${i + 1}] 규칙에 안 맞음: ${p.join(", ")} — ${r.text}`); }
});
const records = items.map((x) => x.record);
const count = (key) => Object.entries(records.reduce((m, r) => { for (const v of [].concat(r[key] ?? [])) m[v] = (m[v] || 0) + 1; return m; }, {}))
  .map(([k, n]) => `${k} ${n}`).join(" · ");
console.log(`더미 ${records.length}건, 규칙 위반 ${bad}건`);
console.log(`  지역: ${count("region")}\n  세부: ${count("region_detail")}\n  상태: ${count("state")}\n  나눔: ${count("share")}\n  키워드: ${count("keywords")}`);
console.log(`  마음: ${records.filter((r) => r.feeling).length}건 채움 · 이름: ${records.filter((r) => r.display_name !== S.ANON_NAME).length}건 별칭`);
console.log(`  배 색: 색 코드 ${records.filter((r) => /^#/.test(r.hull_color)).length} · 팔레트 ${records.filter((r) => !/^#/.test(r.hull_color)).length} · 투톤 ${records.filter((r) => r.deck_color !== "auto").length}`);
if (bad) process.exit(1);
if (process.argv.includes("--dry-run")) process.exit(0);

// ── 썸네일 ──────────────────────────────────────────────────────────────────
const { renderThumbs } = await import("./dummy/thumbs.mjs");
const timeOf = (share) => (T.SHARES.find((s) => s.id === share) || {}).time;
console.log("배 그림 찍는 중…");
const thumbs = await renderThumbs(items.map((x) => ({ scene: x.scene, time: timeOf(x.record.share) })), {
  THUMB: S.THUMB, onEach: (i, d) => process.stdout.write(d ? "." : "x"),
});
console.log(`\n썸네일 ${thumbs.filter(Boolean).length}/${thumbs.length}장`);
const preview = arg("--preview");
if (preview) {
  fs.mkdirSync(preview, { recursive: true });
  thumbs.forEach((d, i) => d && fs.writeFileSync(path.join(preview, `${String(i + 1).padStart(2, "0")}.webp`), Buffer.from(d.split(",")[1], "base64")));
  fs.writeFileSync(path.join(preview, "records.json"), JSON.stringify(records, null, 1));
  console.log(`→ ${preview} (DB 는 안 썼다)`);
  process.exit(0);
}

// ── 실DB 쓰기 — 설문과 같은 설정값(db-config.js)·같은 SDK 버전(package.json) ─────────────
const gapMs = Number(arg("--gap", 20)) * 1000;
const { FIREBASE_CONFIG, COLLECTIONS } = await import("../statistics/shared/db-config.js");
const { initializeApp } = await import("firebase/app");
const { getAuth, signInAnonymously } = await import("firebase/auth");
const { getFirestore, doc, setDoc, serverTimestamp } = await import("firebase/firestore/lite");
const app = initializeApp(FIREBASE_CONFIG);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const out = path.join(HERE, "dummy-records.json");
const written = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [i, r] of records.entries()) {
  try {
    await setDoc(doc(db, COLLECTIONS.records, r.record_id), { ...r, created_at: serverTimestamp() });
  } catch (err) {
    if (i === 0 && /permission/i.test(String(err && (err.code || err.message)))) {
      console.error("\n첫 기록이 거절됐다 — 콘솔의 규칙이 아직 마음(feeling)을 모른다. firebase/firestore.rules 를 게시한 뒤 다시 돌린다.");
      process.exit(1);
    }
    throw err;
  }
  let thumb = false;
  if (thumbs[i]) {
    try { await setDoc(doc(db, COLLECTIONS.thumbs, r.record_id), { record_id: r.record_id, data: thumbs[i], created_at: serverTimestamp() }); thumb = true; }
    catch (err) { console.warn(`\n[${i + 1}] 썸네일 실패 — 기록은 들어갔다: ${err && err.message}`); }
  }
  written.push({ record_id: r.record_id, text: r.text, batch: "10-30", thumb });
  fs.writeFileSync(out, JSON.stringify(written, null, 1));   // 중간에 끊겨도 쓴 것까지는 남게
  process.stdout.write(thumb ? "." : "o");
  if (i < records.length - 1) await sleep(gapMs);
}
console.log(`\n${records.length}건 썼다 → ${path.relative(process.cwd(), out)} (숨길 때 이 id들)`);
process.exit(0);
