/* =============================================================================
 * record-store.test.mjs — 공유 어댑터(statistics/shared/record-store.js)를 에뮬레이터에 붙여 본다.
 *
 * 증명하는 것
 *   · 재전송은 중복 문서를 만들지 않는다 — 같은 기록을 두 번·세 번 보내도 문서는 1건,
 *     두 번째부터는 "already"(규칙이 덮어쓰기를 거절 → 존재 확인 → 성공으로 처리)
 *   · 운영자가 숨긴 뒤에 재전송이 와도 성공으로 끝난다(영원히 재시도하지 않는다)
 *   · 규칙에 어긋나는 기록은 서버에 가기 전에 거절된다(대기열에 쌓이지 않게)
 *   · 아카이브 쿼리·개수·썸네일, 인덱스가 없을 때의 물러나기
 * 실행: npm run test:rules (rules.test.mjs 와 같이 돈다)
 * ========================================================================== */

import test from "node:test";
import assert from "node:assert/strict";
import * as app from "firebase/app";
import * as fs from "firebase/firestore";
import * as auth from "firebase/auth";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { loadShared } from "../build-rules.mjs";

const { schema: S } = loadShared({ inThisRealm: true });   // RECORD_SCHEMA 전역을 만든다
const store = await import("../../statistics/shared/record-store.js");
store.dbUseSdk({ app, fs, auth });

let env;
test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-yeogi", firestore: { host: "127.0.0.1", port: 8080 } });
  await store.dbConnect("emu");
});
test.after(async () => {
  const ctx = await store.dbConnect("emu");
  await fs.waitForPendingWrites(ctx.db);
  await fs.terminate(ctx.db);
  await env?.cleanup();
});
test.beforeEach(async () => { await env.clearFirestore(); });

const rec = (over = {}) => S.makeRecord({
  id: S.newId(), region: "천안", state: "between", share: "few",
  text: "  가족은 여기, 일은 저기.  ", keywords: ["가족", "일", "가족"], name: "  ", ...over,
});
async function countDocs(col) {
  let n = 0;
  await env.withSecurityRulesDisabled(async (ctx) => { n = (await fs.getDocs(fs.collection(ctx.firestore(), col))).size; });
  return n;
}

test("makeRecord 가 값을 정리한다 (trim·키워드 중복·빈 이름 → 익명)", () => {
  const r = rec();
  assert.equal(r.text, "가족은 여기, 일은 저기.");
  assert.deepEqual(r.keywords, ["가족", "일"]);
  assert.equal(r.display_name, "익명");
  assert.deepEqual(S.checkNew(r), []);
});

test("재전송은 중복 문서를 만들지 않는다", async () => {
  const r = rec();
  assert.equal(await store.dbSubmitRecord(r), "created");
  assert.equal(await store.dbSubmitRecord(r), "already");
  assert.equal(await store.dbSubmitRecord({ ...r }), "already");
  assert.equal(await countDocs("records"), 1);
});

test("숨김 처리된 뒤의 재전송도 성공으로 끝난다", async () => {
  const r = rec();
  await store.dbSubmitRecord(r);
  await env.withSecurityRulesDisabled((ctx) =>
    fs.updateDoc(fs.doc(ctx.firestore(), "records", r.record_id), { moderation_status: "hidden" }));
  assert.equal(await store.dbSubmitRecord(r), "already");
  assert.equal(await countDocs("records"), 1);
});

test("규칙에 어긋나는 기록은 보내기 전에 거절된다", async () => {
  await assert.rejects(store.dbSubmitRecord({ ...rec(), text: "가".repeat(81) }), (e) => e.code === "invalid-record");
  await assert.rejects(store.dbSubmitRecord({ ...rec(), region: "서울" }), (e) => e.code === "invalid-record");
  assert.equal(await countDocs("records"), 0);
});

test("최신순 n건·개수·숨김 제외 (created_at 은 ISO 문자열로 온다)", async () => {
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = rec({ text: `문장 ${i}` });
    ids.push(r.record_id);
    await store.dbSubmitRecord(r);
    await new Promise((res) => setTimeout(res, 15));   // 서버 시각이 확실히 갈리게
  }
  await env.withSecurityRulesDisabled((ctx) =>
    fs.updateDoc(fs.doc(ctx.firestore(), "records", ids[4]), { moderation_status: "hidden" }));
  const recent = await store.dbFetchRecent(3);
  assert.deepEqual(recent.map((r) => r.text), ["문장 3", "문장 2", "문장 1"]);
  for (const r of recent) assert.deepEqual(S.checkRecord(r), [], JSON.stringify(r));
  assert.equal(await store.dbCountPublic(), 4);
});

test("인덱스가 없으면(failed-precondition) 인덱스 없는 쿼리로 물러나 같은 결과를 낸다", async () => {
  for (let i = 0; i < 4; i++) {
    await store.dbSubmitRecord(rec({ text: `문장 ${i}` }));
    await new Promise((res) => setTimeout(res, 15));
  }
  // 에뮬레이터는 복합 인덱스를 강제하지 않는다 — orderBy 가 든 쿼리만 실패하게 SDK를 감싼다
  let ordered = false, fellBack = false;
  const fake = {
    ...fs,
    orderBy: (...a) => { ordered = true; return fs.orderBy(...a); },
    getDocs: (q) => {
      if (ordered) {
        ordered = false;
        const e = new Error("The query requires an index. You can create it here: https://console.firebase.google.com/x");
        e.code = "failed-precondition";
        return Promise.reject(e);
      }
      fellBack = true;
      return fs.getDocs(q);
    },
  };
  const ctx = await store.dbConnect("emu");
  const real = ctx.sdk.fs;
  ctx.sdk.fs = fake;
  const warn = console.warn; const warned = [];
  console.warn = (...a) => warned.push(a.join(" "));
  try {
    const recent = await store.dbFetchRecent(2);
    assert.deepEqual(recent.map((r) => r.text), ["문장 3", "문장 2"]);
  } finally {
    ctx.sdk.fs = real;
    console.warn = warn;
  }
  assert.ok(fellBack);
  assert.ok(warned.some((w) => w.includes("https://console.firebase.google.com/x")), "인덱스 링크를 남겨야 한다");
});

test("썸네일: 기록 뒤에 올리고, 재전송은 already, 읽기는 안전한 data URL만", async () => {
  const r = rec();
  await store.dbSubmitRecord(r);
  const url = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
  assert.equal(await store.dbSubmitThumb(r.record_id, url), "created");
  assert.equal(await store.dbSubmitThumb(r.record_id, url), "already");
  assert.equal(await store.dbGetThumb(r.record_id), url);
  assert.equal(await store.dbGetThumb(S.newId()), null);
  await assert.rejects(store.dbSubmitThumb(r.record_id, "data:image/png;base64,AAAA"), (e) => e.code === "invalid-thumb");
  assert.equal(await countDocs("thumbs"), 1);
});

test("실시간 구독: 첫 스냅샷에 기존 공개 기록, 이후 추가·숨김이 온다", async () => {
  await store.dbSubmitRecord(rec({ text: "처음부터 있던 것" }));
  // 스냅샷은 추가·숨김 말고도 온다(내 쓰기의 서버 시각이 확정될 때 "modified").
  // 그래서 "다음 스냅샷"이 아니라 "조건을 만족하는 스냅샷"을 기다린다.
  let last = null;
  const waiters = [];
  const waitFor = (pred) => new Promise((res, rej) => {
    if (last && pred(last)) return res(last);
    const t = setTimeout(() => rej(new Error("구독이 기대한 상태에 도달하지 않음: " + JSON.stringify(last))), 8000);
    waiters.push((s) => { if (pred(s)) { clearTimeout(t); res(s); return true; } return false; });
  });
  const texts = (s) => s.records.map((r) => r.text).sort();
  const unsub = await store.dbListenPublic((s) => {
    if (s.fromCache) return;
    last = s;
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i](s)) waiters.splice(i, 1);
  }, (e) => assert.fail(e));
  await waitFor((s) => texts(s).join() === "처음부터 있던 것");
  const r2 = rec({ text: "새로 온 것" });
  await store.dbSubmitRecord(r2);
  await waitFor((s) => texts(s).join() === ["새로 온 것", "처음부터 있던 것"].sort().join());
  await env.withSecurityRulesDisabled((ctx) =>
    fs.updateDoc(fs.doc(ctx.firestore(), "records", r2.record_id), { moderation_status: "hidden" }));
  await waitFor((s) => texts(s).join() === "처음부터 있던 것");
  unsub();
});
