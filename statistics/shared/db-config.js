/* =============================================================================
 * db-config.js — Firebase 웹 설정값 · SDK 버전 · 컬렉션 이름. 두 화면이 같이 읽는다.
 *
 * ── 여기에 넣어도 되는 것과 안 되는 것 ─────────────────────────────────────
 * 아래 FIREBASE_CONFIG(apiKey·authDomain·projectId·appId …)는 **공개 식별자**다.
 * 브라우저가 어차피 다 받아 가는 값이라 레포에 커밋해도 된다. 누가 무엇을 쓰고 읽을지는
 * 보안 규칙(firebase/firestore.rules)이 정한다.
 * 서비스 계정 JSON, `firebase login:ci` 토큰, 비밀번호는 **절대 여기에 넣지 않는다.**
 *
 * ── 비어 있으면 ─────────────────────────────────────────────────────────────
 * apiKey·projectId·appId 중 하나라도 비어 있으면 두 화면은 예전처럼 목업으로 돈다
 * (설문: ui/survey.js 의 entries, 지도: store.js 의 MockStore). 값을 채우는 것만으로
 * 실DB에 붙는다. 사용자가 할 일은 HANDOFF.md 13장 맨 앞.
 *
 * 이 파일이 statistics/shared/ 에 있는 이유는 ocean-core.js 머리말 참고. 옮기지 말 것.
 * ========================================================================== */

// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → "SDK 설정 및 구성"의 firebaseConfig 를 그대로
export const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// SDK는 gstatic CDN의 ES 모듈을 동적 import()로 받는다(빌드 도구 없음).
// 정적 import가 아닌 이유: 지도의 build-standalone.mjs 가 import 줄을 지우고 이어붙이는데,
// 동적 import는 그대로 살아남는다. 버전을 올릴 땐 `npm view firebase version` 으로 확인하고
// firebase/package.json 의 firebase 버전(테스트가 이 URL을 npm 사본으로 대체한다)도 같이 올린다.
export const FIREBASE_SDK_VERSION = "12.19.0";
export const FIREBASE_SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

export const COLLECTIONS = { records: "records", thumbs: "thumbs" };

// 로컬 에뮬레이터 (?emu=1, localhost 에서만). 포트는 firebase/firebase.json 과 같아야 한다.
// demo- 로 시작하는 프로젝트 id는 에뮬레이터가 로그인 없이 받아 준다.
export const EMULATOR = { host: "127.0.0.1", firestorePort: 8080, authPort: 9099, projectId: "demo-yeogi" };

/** 실DB 설정이 채워져 있는가 */
export function dbConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}

/**
 * 이 화면이 어느 저장소를 쓰나 — "mock" | "emu" | "live".
 *   ?mock=1                          → 목업 (설정이 있어도)
 *   ?emu=1 이고 localhost 에서 열었을 때 → 에뮬레이터 (설정이 비어 있어도)
 *   설정이 채워져 있으면                → 실DB
 *   그 밖                              → 목업
 * ?emu=1 을 localhost 로 묶는 이유: 배포된 주소에서 누가 붙여도 참여자 브라우저가
 * 제 기기의 127.0.0.1 로 기록을 보내 버리는 일이 없게.
 */
export function dbMode(search = globalThis.location ? location.search : "", hostname = globalThis.location ? location.hostname : "") {
  const qs = new URLSearchParams(search);
  if (qs.get("mock") === "1") return "mock";
  if (qs.get("emu") === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname)) return "emu";
  return dbConfigured() ? "live" : "mock";
}
