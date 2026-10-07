/* =============================================================================
 * record-store.js — Firestore 어댑터. 설문과 지도가 같이 쓴다 (ES 모듈).
 *
 * 화면 코드는 Firestore를 모른다. 지도는 js/store.js 의 FirestoreStore 가, 설문은
 * ui/record-sync.js 가 이 파일의 함수만 부른다. 컬렉션·필드 이름과 "공개 판정은 쿼리에서"
 * 같은 약속이 이 파일 하나에만 있게 하려는 것이다.
 *
 * ── SDK를 동적 import() 로 받는 이유 ───────────────────────────────────────
 *   · 빌드 도구가 없다 — gstatic CDN의 ES 모듈을 그대로 받는다(버전은 db-config.js).
 *   · 지도의 build-standalone.mjs 는 정적 import 줄을 지우고 파일을 이어붙인다. 동적
 *     import는 그대로 살아남아서, 목업으로 도는 시안 파일은 SDK 없이도 열린다.
 *   · 목업으로 도는 동안(설정이 비었거나 ?mock=1)에는 SDK를 아예 받지 않는다.
 *   · 설문은 클래식 스크립트라 이 파일 자체도 동적 import 한다(ui/record-sync.js).
 * 지도는 읽기만 하므로 auth 모듈(157KB)은 받지 않는다 — 쓰기 직전에만 받는다.
 * [주의] 한 번 실패한 import 는 그 페이지에서 다시 성공하지 않는다(dbLoadSdk 주석). 그래서
 * 설문은 페이지를 열 때 SDK를 미리 받아 두고, 지도는 SDK 주소에 닿으면 새로고침한다.
 *
 * 기록의 모양·검사는 record-schema.js(클래식 전역 RECORD_SCHEMA)에 있다. 두 화면 모두
 * 이 모듈보다 먼저 <script src>로 불러 둔다.
 *
 * 이 파일의 최상위 이름은 전부 db 로 시작한다 — build-standalone.mjs 가 지도 코드와 한
 * 스코프에 이어붙이므로 이름이 겹치면 시안 파일이 그 자리에서 죽는다.
 * ========================================================================== */

import { FIREBASE_CONFIG, FIREBASE_SDK_BASE, COLLECTIONS, EMULATOR, dbMode } from "./db-config.js";

const dbSchema = () => {
  const s = globalThis.RECORD_SCHEMA;
  if (!s) throw new Error("[db] record-schema.js 를 먼저 불러올 것 (RECORD_SCHEMA 전역이 없다)");
  return s;
};

let dbSdk = null;          // { app, fs, auth? } — 테스트는 dbUseSdk 로 npm 사본을 넣는다
let dbCtxPromise = null;   // 연결은 한 번만 (실패하면 비워서 다음에 다시)
let dbAuthPromise = null;

/**
 * SDK를 직접 넣는다 (node 테스트용 — node는 https:// 모듈을 import 못 한다).
 * 브라우저에서는 부르지 않는다. { app, fs, auth } 각각 firebase/app·firestore·auth 네임스페이스.
 */
export function dbUseSdk(sdk) { dbSdk = sdk; dbCtxPromise = null; dbAuthPromise = null; }

async function dbLoadSdk() {
  if (dbSdk) return dbSdk;
  // app 과 firestore 를 같이 받는다. firestore 모듈은 app 모듈을 같은 URL로 import 해서
  // 하나의 인스턴스를 공유한다 — 버전이 다르면 "Service firestore is not available".
  try {
    const [app, fs] = await Promise.all([
      import(`${FIREBASE_SDK_BASE}/firebase-app.js`),
      import(`${FIREBASE_SDK_BASE}/firebase-firestore.js`),
    ]);
    dbSdk = { app, fs };
    return dbSdk;
  } catch (err) {
    // [주의] 브라우저는 한 번 실패한 모듈 주소를 그 문서가 살아 있는 동안 기억한다(크로미움 실측).
    // 이 페이지에서 다시 import 해도 같은 실패가 돌아온다 — 다시 받으려면 새로고침뿐이다.
    // 부르는 쪽이 구별할 수 있게 코드를 붙인다(지도는 SDK 주소에 닿으면 새로고침한다).
    const e = new Error("[db] Firebase SDK를 받지 못했다 — 이 페이지에서는 새로고침해야 다시 받는다");
    e.code = "sdk-unavailable";
    e.cause = err;
    throw e;
  }
}

/**
 * SDK 주소에 지금 닿는가 (fetch 는 모듈처럼 실패를 기억하지 않는다).
 * sdk-unavailable 뒤에 새로고침할 때를 고르는 데 쓴다.
 */
export async function dbSdkReachable() {
  try {
    const r = await fetch(`${FIREBASE_SDK_BASE}/firebase-app.js`, { method: "GET", cache: "no-store" });
    return r.ok;
  } catch { return false; }
}

/**
 * Firestore에 붙는다. mode: "live" | "emu" (기본은 db-config.dbMode()).
 * 목업 모드에서 부르면 오류 — 부르는 쪽이 먼저 dbMode()를 보고 목업이면 부르지 않는다.
 */
export function dbConnect(mode = dbMode()) {
  if (dbCtxPromise) return dbCtxPromise;
  dbCtxPromise = (async () => {
    if (mode !== "live" && mode !== "emu") throw new Error(`[db] 저장소 모드가 ${mode} — 연결하지 않는다`);
    const sdk = await dbLoadSdk();
    const config = mode === "emu"
      ? { apiKey: "demo-key", projectId: EMULATOR.projectId, appId: "demo-app", authDomain: `${EMULATOR.projectId}.firebaseapp.com` }
      : FIREBASE_CONFIG;
    // 이름 붙인 앱 — 페이지에 다른 Firebase 앱이 있어도 부딪히지 않게
    const existing = sdk.app.getApps().find((a) => a.name === "yeogi");
    const app = existing || sdk.app.initializeApp(config, "yeogi");
    const db = sdk.fs.getFirestore(app);
    if (mode === "emu" && !existing) sdk.fs.connectFirestoreEmulator(db, EMULATOR.host, EMULATOR.firestorePort);
    return { app, db, mode, sdk };
  })();
  dbCtxPromise.catch(() => { dbCtxPromise = null; });   // SDK 로드 실패(와이파이) → 다음 호출에서 다시
  return dbCtxPromise;
}

/**
 * 익명 로그인. 쓰기 규칙이 request.auth != null 을 요구한다.
 * 한 번 로그인한 익명 사용자는 브라우저(IndexedDB)에 남아 다음 방문에도 같은 사람이다.
 */
function dbEnsureAuth(ctx) {
  if (dbAuthPromise) return dbAuthPromise;
  dbAuthPromise = (async () => {
    const A = ctx.sdk.auth || (ctx.sdk.auth = await import(`${FIREBASE_SDK_BASE}/firebase-auth.js`));
    const auth = A.getAuth(ctx.app);
    if (ctx.mode === "emu" && !auth.emulatorConfig) {
      A.connectAuthEmulator(auth, `http://${EMULATOR.host}:${EMULATOR.authPort}`, { disableWarnings: true });
    }
    await auth.authStateReady();   // 저장된 익명 사용자를 되살릴 시간을 준다
    if (!auth.currentUser) {
      try {
        await A.signInAnonymously(auth);
      } catch (err) {
        if (err && err.code === "auth/operation-not-allowed") {
          console.error("[db] 익명 로그인이 꺼져 있다 — Firebase 콘솔 → Authentication → 로그인 방법에서 " +
            "'익명'을 켤 것. 그 전까지 기록은 이 브라우저의 대기열에만 쌓인다.");
        }
        throw err;
      }
    }
    return auth.currentUser;
  })();
  dbAuthPromise.catch(() => { dbAuthPromise = null; });
  return dbAuthPromise;
}

/**
 * Firestore 문서 → 저장소 계약 기록 (created_at 은 ISO 문자열). 모르는 필드는 버린다.
 * 선택 필드(배 색·소품 칠 — record-schema.js PAINT_FIELDS)도 싣는다. [버그 10-07] 예전엔 FIELDS 만 옮겨서
 * DB 에 저장된 배 색이 지도·아카이브까지 오지 못했다(E2E 는 DB 문서를 직접 읽어 못 잡았다 — 지금은 지도 쪽도 본다).
 */
export function dbDocToRecord(snap) {
  // 서버 시각이 아직 안 박힌 로컬 스냅샷에선 created_at 이 null 이다 — 추정값으로 읽는다
  const d = snap.data({ serverTimestamps: "estimate" }) || {};
  const out = {};
  const S = dbSchema();
  for (const k of S.FIELDS.concat(S.PAINT_FIELDS || [])) if (k in d) out[k] = d[k];
  out.record_id = snap.id;
  const ts = d.created_at;
  out.created_at = ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : new Date().toISOString();
  return out;
}

const dbPublicWhere = (F) => F.where("moderation_status", "==", dbSchema().STATUS.PUBLIC);

/**
 * 공개 기록 실시간 구독. cb({ fromCache, records }) 가 스냅샷마다 공개 기록 전부를 받는다.
 * 공개 판정은 쿼리(where)와 규칙이 한다 — 규칙은 필터가 아니라서 이 where 가 없으면
 * 쿼리 전체가 거절된다. 등호 조건 하나라 복합 인덱스가 필요 없다(정렬은 받는 쪽에서).
 * 반환: 구독 해제 함수. onError 를 반드시 넘길 것 — 안 넘기면 끊겼을 때 조용히 멈춘다.
 */
export async function dbListenPublic(cb, onError) {
  const ctx = await dbConnect();
  const F = ctx.sdk.fs;
  const q = F.query(F.collection(ctx.db, COLLECTIONS.records), dbPublicWhere(F));
  return F.onSnapshot(q,
    (snap) => cb({ fromCache: snap.metadata.fromCache, records: snap.docs.map(dbDocToRecord) }),
    (err) => onError(err));
}

/**
 * 최신 공개 기록 n건 (설문 아카이브). 복합 인덱스 (moderation_status ASC, created_at DESC)가
 * 필요하다 — firebase/firestore.indexes.json. 아직 배포 전이면(failed-precondition) 인덱스
 * 없는 쿼리로 전부 받아 여기서 정렬·자른다. 읽기 비용이 전체 건수만큼 들므로 경고를 남긴다.
 */
export async function dbFetchRecent(n = 100) {
  const ctx = await dbConnect();
  const F = ctx.sdk.fs;
  const col = F.collection(ctx.db, COLLECTIONS.records);
  try {
    const snap = await F.getDocs(F.query(col, dbPublicWhere(F), F.orderBy("created_at", "desc"), F.limit(n)));
    return snap.docs.map(dbDocToRecord);
  } catch (err) {
    if (!err || err.code !== "failed-precondition") throw err;
    const link = (String(err.message).match(/https:\/\/\S+/) || [""])[0];
    console.warn("[db] 아카이브용 복합 인덱스가 아직 없다 — 전부 받아 정렬하는 쿼리로 대신한다(읽기가 " +
      "전체 건수만큼 든다). firestore.indexes.json 을 배포하거나 이 링크를 눌러 만들 것:", link);
    const snap = await F.getDocs(F.query(col, dbPublicWhere(F)));
    return snap.docs.map(dbDocToRecord)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, n);
  }
}

/** 공개 기록 수. count 쿼리는 1,000건당 읽기 1회로 셈한다(문서를 받지 않는다). */
export async function dbCountPublic() {
  const ctx = await dbConnect();
  const F = ctx.sdk.fs;
  const snap = await F.getCountFromServer(F.query(F.collection(ctx.db, COLLECTIONS.records), dbPublicWhere(F)));
  return snap.data().count;
}

/** 문서가 서버에 있나: "exists" | "hidden"(있는데 공개가 아니라 못 읽음) | "missing" */
async function dbProbe(F, ref) {
  try {
    return (await F.getDoc(ref)).exists() ? "exists" : "missing";
  } catch (err) {
    // 규칙이 없는 문서의 get은 허용하므로, 거절됐다면 "있는데 숨김"이다
    if (err && err.code === "permission-denied") return "hidden";
    throw err;
  }
}

/**
 * 새 기록 보내기. 반환: "created" | "already".
 *
 * 재전송이 안전한 이유: id를 클라이언트가 미리 정하므로(record_id) 몇 번을 보내도 같은
 * 문서를 향한다. 그런데 규칙이 수정을 금지해서, 이미 들어간 문서를 다시 쓰면
 * permission-denied 가 난다 — 그때 문서가 있는지 물어서 있으면(숨김 포함) 성공으로 친다.
 * 없는데도 거절됐다면 기록이 규칙에 어긋난 것이므로 그대로 던진다.
 *
 * 오프라인이면 SDK는 쓰기를 붙들고 약속을 끝내지 않는다(온라인이 되면 그때 끝난다).
 * 기다릴 시간을 정하는 건 부르는 쪽 몫이다.
 */
export async function dbSubmitRecord(record) {
  const S = dbSchema();
  const problems = S.checkNew(record);
  if (problems.length) {
    const err = new Error(`[db] 규칙에 맞지 않는 기록: ${problems.join(", ")}`);
    err.code = "invalid-record";
    err.problems = problems;
    throw err;
  }
  const ctx = await dbConnect();
  await dbEnsureAuth(ctx);
  const F = ctx.sdk.fs;
  const ref = F.doc(ctx.db, COLLECTIONS.records, record.record_id);
  try {
    await F.setDoc(ref, { ...record, created_at: F.serverTimestamp() });
    return "created";
  } catch (err) {
    if (!err || err.code !== "permission-denied") throw err;
    if ((await dbProbe(F, ref)) !== "missing") return "already";
    throw err;
  }
}

/**
 * 병 스냅샷 보내기 — 기록이 서버에 들어간 **뒤에** 부를 것(규칙이 기록의 존재를 본다).
 * 반환: "created" | "already". 재전송 처리는 dbSubmitRecord 와 같다.
 */
export async function dbSubmitThumb(recordId, dataUrl) {
  const T = dbSchema().THUMB;
  const ok = typeof dataUrl === "string" && dataUrl.length <= T.MAX_CHARS &&
    T.TYPES.some((t) => dataUrl.startsWith(`data:image/${t};base64,`));
  if (!ok) {
    const err = new Error("[db] 썸네일 형식·크기가 규칙에 맞지 않는다");
    err.code = "invalid-thumb";
    throw err;
  }
  const ctx = await dbConnect();
  await dbEnsureAuth(ctx);
  const F = ctx.sdk.fs;
  const ref = F.doc(ctx.db, COLLECTIONS.thumbs, recordId);
  try {
    await F.setDoc(ref, { record_id: recordId, data: dataUrl, created_at: F.serverTimestamp() });
    return "created";
  } catch (err) {
    if (!err || err.code !== "permission-denied") throw err;
    if ((await dbProbe(F, ref)) !== "missing") return "already";
    throw err;
  }
}

/** 공개 기록의 썸네일 data URL. 없거나 못 읽으면 null. 화면에 넣기 전에 형식을 한 번 더 거른다. */
export async function dbGetThumb(recordId) {
  const ctx = await dbConnect();
  const F = ctx.sdk.fs;
  try {
    const snap = await F.getDoc(F.doc(ctx.db, COLLECTIONS.thumbs, recordId));
    return snap.exists() ? dbSchema().safeImage(snap.get("data")) : null;
  } catch (err) {
    if (err && err.code === "permission-denied") return null;   // 기록이 숨겨졌다
    throw err;
  }
}
