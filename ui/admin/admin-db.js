/* =============================================================================
 * admin-db.js — 관리자 페이지(admin.html)의 DB 쪽. 화면 코드는 Firestore 를 모른다 — 이 파일 함수만 부른다.
 *
 * 연결은 설문·지도와 같은 dbConnect(statistics/shared/record-store.js — 같은 설정·SDK 버전·?emu=1)를 쓰고,
 * 로그인만 다르다: 익명이 아니라 이메일/비밀번호(db-config.js ADMIN_EMAILS 계정). 규칙(firebase/build-rules.mjs isAdmin)이
 * 이 계정에만 숨긴 기록 읽기 · moderation_status 바꾸기 · 기록·썸네일 삭제를 허락한다.
 * ========================================================================== */

import { FIREBASE_SDK_BASE, COLLECTIONS, EMULATOR, ADMIN_EMAILS, dbMode } from "../../statistics/shared/db-config.js";
import { dbConnect } from "../../statistics/shared/record-store.js";

export const PAGE = 300;          // 한 번에 받는 기록 수 — 무료 요금제 읽기(하루 5만)를 생각해 나눠 받는다
export { ADMIN_EMAILS, dbMode };

let ctx = null, A = null, auth = null;

async function ready() {
  if (auth) return;
  ctx = await dbConnect();
  A = ctx.sdk.auth || (ctx.sdk.auth = await import(`${FIREBASE_SDK_BASE}/firebase-auth.js`));
  auth = A.getAuth(ctx.app);
  if (ctx.mode === "emu" && !auth.emulatorConfig) {
    A.connectAuthEmulator(auth, `http://${EMULATOR.host}:${EMULATOR.authPort}`, { disableWarnings: true });
  }
  await auth.authStateReady();
}

/** 지금 로그인한 관리자 이메일 — 아니면 null(익명 사용자가 남아 있어도 null) */
export async function currentAdmin() {
  await ready();
  const u = auth.currentUser;
  return u && u.email && ADMIN_EMAILS.includes(u.email) ? u.email : null;
}

export async function signIn(email, password) {
  await ready();
  await A.signInWithEmailAndPassword(auth, email.trim(), password);
  const who = await currentAdmin();
  if (!who) { await A.signOut(auth); const e = new Error("관리자 계정이 아니에요"); e.code = "not-admin"; throw e; }
  return who;
}

export async function signOut() { await ready(); await A.signOut(auth); }

/** 기록 한 쪽(최신순). after = 앞 쪽의 마지막 커서 → { rows, cursor(다음 쪽 없으면 null) } */
export async function fetchPage(after = null) {
  await ready();
  const F = ctx.sdk.fs;
  const parts = [F.collection(ctx.db, COLLECTIONS.records), F.orderBy("created_at", "desc")];
  if (after) parts.push(F.startAfter(after));
  parts.push(F.limit(PAGE));
  const snap = await F.getDocs(F.query(...parts));
  const rows = snap.docs.map((d) => {
    const x = d.data();
    const t = x.created_at && x.created_at.toDate ? x.created_at.toDate() : null;
    return { ...x, id: d.id, created: t };
  });
  return { rows, cursor: snap.docs.length === PAGE ? snap.docs[snap.docs.length - 1] : null };
}

/** 숨기기·되살리기 — 여러 개는 한 묶음(batch)으로 */
export async function setStatus(ids, status) {
  await ready();
  const F = ctx.sdk.fs;
  for (let i = 0; i < ids.length; i += 400) {
    const b = F.writeBatch(ctx.db);
    for (const id of ids.slice(i, i + 400)) b.update(F.doc(ctx.db, COLLECTIONS.records, id), { moderation_status: status });
    await b.commit();
  }
}

/** 완전 삭제 — 썸네일 먼저, 그 다음 기록(없는 썸네일 삭제는 그냥 통과한다). 되돌릴 수 없다 */
export async function removeRecords(ids) {
  await ready();
  const F = ctx.sdk.fs;
  for (let i = 0; i < ids.length; i += 200) {
    const b = F.writeBatch(ctx.db);
    for (const id of ids.slice(i, i + 200)) {
      b.delete(F.doc(ctx.db, COLLECTIONS.thumbs, id));
      b.delete(F.doc(ctx.db, COLLECTIONS.records, id));
    }
    await b.commit();
  }
}

/** 배 그림 — data URL 또는 null */
export async function getThumb(id) {
  await ready();
  const F = ctx.sdk.fs;
  const s = await F.getDoc(F.doc(ctx.db, COLLECTIONS.thumbs, id));
  const d = s.exists() ? s.data().data : null;
  return typeof d === "string" && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(d) ? d : null;
}

/** 더미로 넣은 기록 id(firebase/dummy-records.json — 배포에 같이 올라간다). 못 받으면 빈 집합 */
export async function dummyIds() {
  try {
    const r = await fetch(new URL("../../firebase/dummy-records.json", import.meta.url), { cache: "no-store" });
    if (!r.ok) return new Map();
    return new Map((await r.json()).map((x) => [x.record_id, x.batch || "09-30"]));
  } catch { return new Map(); }
}
