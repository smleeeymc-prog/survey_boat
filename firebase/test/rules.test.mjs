/* =============================================================================
 * rules.test.mjs — 보안 규칙 단위 테스트 (Firestore·Auth 에뮬레이터 + rules-unit-testing).
 *
 * 실행 (firebase/ 에서):  npm install && npm run test:rules
 *   emulators:exec 가 에뮬레이터를 띄우고 이 파일을 돌린 뒤 내린다. 프로젝트 id가 demo- 로
 *   시작해서 로그인·실제 프로젝트 없이 돈다. Java 11+ 필요.
 *
 * 무엇을 증명하나: 정상 제출은 통과하고, 필드를 하나씩 틀리게 하면 전부 거절된다.
 * 규칙이 survey-taxonomy.js 와 어긋나면(생성 안 하고 값만 바꾼 경우) 맨 앞 테스트가 실패한다.
 * ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  serverTimestamp, Timestamp, limit, orderBy,
} from "firebase/firestore";
import { buildRules, loadShared } from "../build-rules.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RULES = fs.readFileSync(path.join(HERE, "..", "firestore.rules"), "utf8");
const { schema: S, taxonomy: T } = loadShared({ inThisRealm: true });

let env;
test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yeogi",
    firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
  });
});
test.after(async () => { await env?.cleanup(); });
test.beforeEach(async () => { await env.clearFirestore(); });

const user = () => env.authenticatedContext("anon-user", { firebase: { sign_in_provider: "anonymous" } }).firestore();
const guest = () => env.unauthenticatedContext().firestore();

/** 규칙이 받아야 하는 정상 기록 (created_at 은 serverTimestamp) */
function good(over = {}) {
  const id = over.record_id ?? S.newId();
  return {
    ...S.makeRecord({ id, region: "아산", state: "stay", share: "many", text: "여기서 나고 자랐어요.", keywords: ["일", "관계"], name: "익명" }),
    created_at: serverTimestamp(),
    ...over,
  };
}
const put = (db, rec, id = rec.record_id) => setDoc(doc(db, "records", id), rec);

/** 규칙을 우회해 문서를 심는다 (운영자·콘솔 역할) */
async function seed(id, data) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "records", id), data));
}
async function seedPublic(over = {}) {
  const r = { ...good(over), created_at: Timestamp.now() };
  await seed(r.record_id, r);
  return r;
}

// ── 규칙–분류값 일치 ─────────────────────────────────────────────────────────
test("firestore.rules 가 survey-taxonomy.js · record-schema.js 에서 생성된 그대로다", async () => {
  assert.equal(RULES, await buildRules(), "node firebase/build-rules.mjs 로 다시 생성할 것");
  // 분류값이 전부 규칙에 들어 있는지 한 번 더 (생성기 자체가 값을 빠뜨리는 회귀)
  for (const v of [...T.REGIONS, ...T.KEYWORDS, ...T.STATES.map((s) => s.id), ...T.SHARES.map((s) => s.id), ...T.BOAT_COLORS.map((c) => c.id)]) {
    assert.ok(RULES.includes(`"${v}"`), `규칙에 ${v} 가 없다`);
  }
});

// ── records 생성 ─────────────────────────────────────────────────────────────
test("정상 기록은 생성된다 (익명 로그인)", async () => {
  await assertSucceeds(put(user(), good()));
});

test("키워드 0개·별칭 12자·모든 분류값 조합의 경계도 통과한다", async () => {
  const db = user();
  await assertSucceeds(put(db, good({ keywords: [] })));
  await assertSucceeds(put(db, good({ display_name: "가".repeat(12) })));
  for (const region of T.REGIONS) await assertSucceeds(put(db, good({ region })));
  for (const s of T.STATES) await assertSucceeds(put(db, good({ state: s.id })));
  for (const s of T.SHARES) await assertSucceeds(put(db, good({ share: s.id })));
  for (const k of T.KEYWORDS) await assertSucceeds(put(db, good({ keywords: [k] })));
});

test("한글·이모지가 섞인 80자는 통과하고 81자는 거절된다 (UTF-16 단위)", async () => {
  const db = user();
  // 한글 78자 + 이모지 1개(UTF-16 2단위) = .length 80
  const t80 = "가".repeat(78) + "😀";
  assert.equal(t80.length, 80);
  // 클라이언트 검사(record-schema)와 서버 규칙이 같은 판정을 내리는지
  const { created_at: _t, ...plain } = good({ text: t80 });
  assert.deepEqual(S.checkNew(plain), []);
  assert.deepEqual(S.checkNew({ ...plain, text: "가".repeat(79) + "😀" }), ["text"]);
  await assertSucceeds(put(db, good({ text: t80 })));
  await assertSucceeds(put(db, good({ text: "나".repeat(80) })));
  await assertSucceeds(put(db, good({ text: "👨‍👩‍👧".repeat(10) })));   // 8단위 × 10
  await assertFails(put(db, good({ text: "가".repeat(79) + "😀" })));     // 81
  await assertFails(put(db, good({ text: "나".repeat(81) })));
});

test("필드를 하나씩 틀리게 하면 전부 거절된다", async () => {
  const db = user();
  const cases = {
    "모르는 키": good({ extra: 1 }),
    "필드 빠짐(share)": (() => { const r = good(); delete r.share; return r; })(),
    "필드 빠짐(consent_archive)": (() => { const r = good(); delete r.consent_archive; return r; })(),
    "빈 문장": good({ text: "" }),
    "공백 문장": good({ text: "   " }),
    "전각 공백 문장": good({ text: "　　" }),
    "앞 공백": good({ text: " 앞에 공백" }),
    "문장이 숫자": good({ text: 42 }),
    "키워드 3개": good({ keywords: ["일", "관계", "가족"] }),
    "키워드 중복": good({ keywords: ["일", "일"] }),
    "키워드 목록 밖": good({ keywords: ["돈"] }),
    "키워드가 문자열": good({ keywords: "일" }),
    "지역 목록 밖": good({ region: "서울" }),
    "상태 목록 밖": good({ state: "gone" }),
    "share 목록 밖": good({ share: "all" }),
    "이름 13자": good({ display_name: "가".repeat(13) }),
    "이름 빈칸": good({ display_name: "" }),
    "created_at ≠ request.time": good({ created_at: Timestamp.fromMillis(Date.now() - 60_000) }),
    "created_at 문자열": good({ created_at: new Date().toISOString() }),
    "공개 상태 위조(hidden)": good({ moderation_status: "hidden" }),
    "공개 상태 위조(pending)": good({ moderation_status: "pending" }),
    "consent_public false": good({ consent_public: false }),
    "consent_archive false": good({ consent_archive: false }),
    "schema_version 2": good({ schema_version: 2 }),
    "선체 색 목록 밖": good({ hull_color: "pink", deck_color: "auto" }),
    "선체 색에 auto": good({ hull_color: "auto", deck_color: "auto" }),
    "갑판 색 목록 밖": good({ hull_color: "red", deck_color: "gold" }),
    "선체 색이 숫자": good({ hull_color: 3, deck_color: "auto" }),
    "색 코드 대문자": good({ hull_color: "#A35C2E", deck_color: "auto" }),
    "색 코드 3자리": good({ hull_color: "#a3c", deck_color: "auto" }),
    "색 코드 # 없음": good({ hull_color: "a35c2e", deck_color: "auto" }),
    "색 코드 뒤에 글자": good({ hull_color: "#a35c2e;x", deck_color: "auto" }),
    "갑판 색 코드 틀림": good({ hull_color: "red", deck_color: "#zzzzzz" }),
    "튜브 색 목록 밖": good({ tube_color: "pink" }),
    "보드 색에 auto": good({ board_color: "auto" }),
    "클로버 색 코드 대문자": good({ clover_color: "#4E9F4B" }),
    "고양이 무늬 목록 밖": good({ cat_coat: "tabby" }),
    "고양이 무늬에 색": good({ cat_coat: "#ffffff" }),
    "모르는 소품 필드": good({ lamp_color: "red" }),
  };
  for (const [label, rec] of Object.entries(cases)) {
    await assert.doesNotReject(assertFails(put(db, rec)), `통과하면 안 되는데 통과: ${label}`);
  }
});

test("배 색: 없어도(옛 기록) · 원톤(auto) · 투톤 · 모든 색 id 가 통과한다", async () => {
  const db = user();
  await assertSucceeds(put(db, good()));                                          // 색 없음
  await assertSucceeds(put(db, good({ hull_color: "navy", deck_color: "auto" })));  // 원톤
  await assertSucceeds(put(db, good({ hull_color: "base", deck_color: "yellow" }))); // 투톤
  await assertSucceeds(put(db, good({ hull_color: "#a35c2e", deck_color: "auto" })));    // 컬러휠 원톤
  await assertSucceeds(put(db, good({ hull_color: "navy", deck_color: "#0f8a7e" })));    // 투톤 갑판만 컬러휠
  for (const c of T.BOAT_COLORS) await assertSucceeds(put(db, good({ hull_color: c.id, deck_color: c.id })));
  // makeRecord 가 색을 실은 기록도 그대로 통과 (설문이 실제로 보내는 모양)
  const id = S.newId();
  const rec = { ...S.makeRecord({ id, region: "천안", state: "leaving", share: "few", text: "색을 고른 배", keywords: [], name: "익명",
    hullColor: "green", deckColor: "auto" }), created_at: serverTimestamp() };
  assert.deepEqual(S.checkNew(rec), []);
  await assertSucceeds(put(db, rec));
});

test("소품 칠(10-07): 튜브·서핑보드·클로버 색과 고양이 무늬 — 있을 때만 값을 본다", async () => {
  const db = user();
  await assertSucceeds(put(db, good({ tube_color: "blue", board_color: "#ffd400", clover_color: "base", cat_coat: "tuxedo" })));
  for (const c of T.CAT_COATS) await assertSucceeds(put(db, good({ cat_coat: c.id })));
  for (const c of T.BOAT_COLORS) await assertSucceeds(put(db, good({ tube_color: c.id })));
  // makeRecord 는 고른 키워드의 소품만 싣는다
  const id = S.newId();
  const rec = { ...S.makeRecord({ id, region: "아산", state: "stay", share: "many", text: "튜브와 고양이", keywords: ["가족", "주거"], name: "익명",
    hullColor: "base", deckColor: "auto", props: { tube: "purple", board: "red", clover: "red" }, catCoat: "cheese" }), created_at: serverTimestamp() };
  assert.equal(rec.tube_color, "purple");
  assert.equal(rec.cat_coat, "cheese");
  assert.ok(!("board_color" in rec) && !("clover_color" in rec));
  assert.deepEqual(S.checkNew(rec), []);
  await assertSucceeds(put(db, rec));
});

test("record_id ≠ 문서 id, id 모양이 다르면 거절된다", async () => {
  const db = user();
  const r = good();
  await assertFails(put(db, r, S.newId()));
  const short = "abc";
  await assertFails(put(db, good({ record_id: short }), short));
  const dashed = "a".repeat(19) + "-";
  await assertFails(put(db, good({ record_id: dashed }), dashed));
});

test("비로그인은 생성할 수 없다", async () => {
  await assertFails(put(guest(), good()));
});

// ── records 수정·삭제·읽기 ───────────────────────────────────────────────────
test("수정·삭제는 거절된다 (본인이 방금 쓴 것도)", async () => {
  const db = user();
  const r = good();
  await assertSucceeds(put(db, r));
  await assertFails(updateDoc(doc(db, "records", r.record_id), { text: "고침" }));
  await assertFails(updateDoc(doc(db, "records", r.record_id), { moderation_status: "public" }));
  await assertFails(setDoc(doc(db, "records", r.record_id), { ...r, created_at: serverTimestamp() }));  // 재전송 = 덮어쓰기
  await assertFails(deleteDoc(doc(db, "records", r.record_id)));
});

test("공개 문서는 누구나 읽고, 숨긴 문서는 누구도 못 읽는다", async () => {
  const pub = await seedPublic();
  const hid = await seedPublic({ moderation_status: "hidden" });
  for (const db of [guest(), user()]) {
    await assertSucceeds(getDoc(doc(db, "records", pub.record_id)));
    await assertFails(getDoc(doc(db, "records", hid.record_id)));
  }
});

test("없는 문서의 get은 허용된다 (재전송 확인용) — 결과는 '없음'", async () => {
  const snap = await assertSucceeds(getDoc(doc(guest(), "records", S.newId())));
  assert.equal(snap.exists(), false);
});

test("status 조건 있는 쿼리는 되고, 없는 쿼리는 통째로 거절된다", async () => {
  await seedPublic();
  await seedPublic({ moderation_status: "hidden" });
  const db = guest();
  const col = collection(db, "records");
  const ok = await assertSucceeds(getDocs(query(col, where("moderation_status", "==", "public"))));
  assert.equal(ok.size, 1);
  await assertSucceeds(getDocs(query(col, where("moderation_status", "==", "public"), orderBy("created_at", "desc"), limit(100))));
  await assertFails(getDocs(col));
  await assertFails(getDocs(query(col, orderBy("created_at", "desc"), limit(100))));
  await assertFails(getDocs(query(col, where("moderation_status", "==", "hidden"))));
});

// ── thumbs ──────────────────────────────────────────────────────────────────
const B64 = "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
function thumb(id, over = {}) {
  return { record_id: id, data: `data:image/webp;base64,${B64}`, created_at: serverTimestamp(), ...over };
}
const putThumb = (db, t, id = t.record_id) => setDoc(doc(db, "thumbs", id), t);

test("썸네일: 기록이 있으면 생성되고(WebP·JPEG), 공개 기록이면 누구나 읽는다", async () => {
  const r = await seedPublic();
  const r2 = await seedPublic();
  const db = user();
  await assertSucceeds(putThumb(db, thumb(r.record_id)));
  await assertSucceeds(putThumb(db, thumb(r2.record_id, { data: `data:image/jpeg;base64,${B64}` })));
  await assertSucceeds(getDoc(doc(guest(), "thumbs", r.record_id)));
});

test("썸네일: 상한 근처 크기는 통과, 넘으면 거절", async () => {
  const r = await seedPublic();
  const r2 = await seedPublic();
  const head = "data:image/webp;base64,";
  const big = head + "A".repeat(S.THUMB.MAX_CHARS - head.length);
  await assertSucceeds(putThumb(user(), thumb(r.record_id, { data: big })));
  await assertFails(putThumb(user(), thumb(r2.record_id, { data: big + "A" })));
});

test("썸네일: 틀린 것은 전부 거절된다", async () => {
  const r = await seedPublic();
  const db = user();
  const id = r.record_id;
  const cases = {
    "기록 없음": thumb(S.newId()),
    "비로그인": null,
    "PNG": thumb(id, { data: `data:image/png;base64,${B64}` }),
    "SVG": thumb(id, { data: `data:image/svg+xml;base64,${B64}` }),
    "base64 아닌 글자": thumb(id, { data: `data:image/webp;base64,${B64}"><script>` }),
    "http 주소": thumb(id, { data: "https://example.com/a.webp" }),
    "모르는 키": thumb(id, { extra: 1 }),
    "record_id 다름": thumb(id, { record_id: S.newId() }),
    "created_at 위조": thumb(id, { created_at: Timestamp.fromMillis(0) }),
  };
  for (const [label, t] of Object.entries(cases)) {
    const p = t ? putThumb(db, t, label === "record_id 다름" ? id : t.record_id) : putThumb(guest(), thumb(id));
    await assert.doesNotReject(assertFails(p), `통과하면 안 되는데 통과: ${label}`);
  }
});

test("썸네일: 수정·삭제 금지, 숨긴 기록의 썸네일은 못 읽는다, 목록 금지", async () => {
  const r = await seedPublic();
  const db = user();
  await assertSucceeds(putThumb(db, thumb(r.record_id)));
  await assertFails(putThumb(db, thumb(r.record_id)));   // 덮어쓰기
  await assertFails(deleteDoc(doc(db, "thumbs", r.record_id)));
  await assertFails(getDocs(collection(guest(), "thumbs")));
  // 운영자가 기록을 숨기면 썸네일도 같이 안 보인다
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "records", r.record_id), { moderation_status: "hidden" }));
  await assertFails(getDoc(doc(guest(), "thumbs", r.record_id)));
});

test("그 밖의 경로는 전부 거부", async () => {
  const db = user();
  await assertFails(setDoc(doc(db, "entries", "x"), { a: 1 }));
  await assertFails(getDoc(doc(db, "entries", "x")));
  await assertFails(setDoc(doc(db, "records", S.newId(), "sub", "x"), { a: 1 }));
});
