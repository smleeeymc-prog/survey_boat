/* =============================================================================
 * store.js — 기록 저장소.
 *
 * "화면이 저장소에 요구하는 것"만 인터페이스로 못박아 두고, 구현은 둘이다.
 *   · FirestoreStore — 실DB. 백엔드는 **Firebase(Firestore + 익명 인증)로 확정**됐다(09-30).
 *     Firestore 호출은 전부 ../shared/record-store.js 에 있고(설문과 같이 쓴다), 여기서는
 *     그 스냅샷을 아래 계약(onReady/onInsert/onRemove)으로 바꾸기만 한다.
 *   · MockStore — DB 설정(../shared/db-config.js)이 비었거나 ?mock=1 일 때.
 * 어느 쪽을 쓸지는 pickStore() 한 곳에서 정한다 — 씬 쪽 코드는 저장소를 모른다.
 *
 * ── 저장소가 지켜야 하는 계약 ─────────────────────────────────────────────
 *   store.subscribe({ onReady(records), onInsert(record), onRemove(recordId) })
 *   · onReady   최초 1회. 이미 쌓여 있는 공개 기록 전부 (created_at 오름차순)
 *   · onInsert  새 제출이 공개될 때마다 1건씩
 *   · onRemove  관리자가 숨김 처리했을 때 (moderation_status가 공개→비공개)
 *
 * 화면은 이 셋 말고는 저장소에 대해 아무것도 모른다.
 *
 * ── 레코드 스키마 — 원본은 ../shared/record-schema.js (설문·보안 규칙과 같이 본다) ──
 *   record_id, created_at(ISO 문자열), region, state, share, text(≤80), keywords(≤2),
 *   display_name, consent_public, consent_archive, moderation_status, schema_version
 * share(나눔 → 시간대)는 09-30 DB 연동 때 더해졌다. 지도는 안 써도 된다.
 * 화면에 띄우는 조건은 consent_public === true && moderation_status === "public".
 * 그 판정은 저장소 쪽(쿼리/보안규칙)에서 끝낸다 — 비공개 문장이 브라우저까지
 * 내려온 뒤 JS가 거르는 구조면, 개발자도구만 열면 다 보인다.
 * 두 구현 모두 화면에 넘기기 전에 RECORD_SCHEMA.checkRecord 를 통과한 것만 넘긴다.
 * ========================================================================== */

import { REGIONS, STATES, KEYWORDS } from "./config.js";
import { makeRng, hashSeed } from "./motion.js";
import { dbMode } from "../shared/db-config.js";
import { dbListenPublic, dbSdkReachable } from "../shared/record-store.js";

// 목업 문장 — 루트 index.html의 시연용 시드에서 가져왔고, 80척을 채우려고 늘렸다.
const MOCK_TEXTS = [
  ["아산", "stay", "여기서 나고 자란 친구들이 아직 다 있어서, 떠날 이유를 못 찾겠어요.", ["관계", "익숙함"], "익명"],
  ["천안", "leaving", "괜찮은 일자리가 여기엔 없어서, 결국 서울로 가게 될 것 같아요.", ["일", "불안"], "익명"],
  ["기타 충남", "returned", "서울 살아보니 알겠더라고요, 제가 있을 곳은 여기였다는 걸.", ["소속감", "익숙함"], "바다"],
  ["아산", "between", "평일엔 일 때문에 나가지만 주말엔 항상 이곳으로 돌아와요.", ["일", "가족"], "익명"],
  ["충남 밖", "unsure", "고향이 그립긴 한데, 지금 자리 잡은 곳을 버리기도 애매해요.", ["불안", "우연"], "익명"],
  ["천안", "stay", "작업실 월세가 여기서만 가능해서 계속 남아있어요.", ["창작", "주거"], "단단"],
  ["아산", "leaving", "부모님이 여기 계시지만, 제 커리어는 다른 도시에 있는 것 같아요.", ["가족", "일"], "익명"],
  ["기타 충남", "stay", "딱히 이유는 없지만 여길 떠난다는 상상이 잘 안 돼요.", ["익숙함"], "익명"],
  ["천안", "unsure", "매년 떠난다고 말만 하고 벌써 5년째 여기 살고 있네요.", ["우연", "익숙함"], "익명"],
  ["충남 밖", "returned", "타지에서 지치고 나서야 이 동네의 조용함이 그리웠다는 걸 알았어요.", ["소속감", "불안"], "강"],
  ["아산", "stay", "출근길에 보이는 논이 아직도 좋아서요. 그거면 됐다 싶어요.", ["익숙함", "자유"], "익명"],
  ["천안", "between", "가족은 여기, 일은 저기. 매주 짐을 두 번 쌉니다.", ["가족", "일"], "익명"],
  ["아산", "returned", "떠나봐야 아는 것들이 있더라고요. 그래서 다시 왔어요.", ["소속감", "관계"], "익명"],
  ["기타 충남", "leaving", "여기선 하고 싶은 걸 계속할 자신이 없어서요.", ["창작", "불안"], "노을"],
  ["천안", "stay", "월세가 감당되는 유일한 도시예요. 그게 이유의 전부입니다.", ["주거", "불안"], "익명"],
  ["아산", "unsure", "아직은 모르겠어요. 그냥 올해는 여기 있어보려고요.", ["우연"], "익명"],
  ["충남 밖", "between", "주중엔 타지, 주말엔 여기. 어느 쪽도 완전히 제 집은 아니에요.", ["일", "소속감"], "익명"],
  ["기타 충남", "stay", "아이 어린이집이 여기라, 앞으로 몇 년은 못 움직여요.", ["가족", "주거"], "익명"],
  ["아산", "leaving", "친구들이 하나둘 떠나니까 저도 마음이 흔들려요.", ["관계", "불안"], "익명"],
  ["천안", "returned", "결국 아는 얼굴이 있는 데가 편하더라고요.", ["관계", "익숙함"], "익명"],
  ["비공개", "stay", "여기서 만든 것들이 아까워서 못 떠나요.", ["창작", "소속감"], "익명"],
  ["충남 밖", "unsure", "돌아갈지 말지 3년째 고민만 하고 있어요.", ["불안", "가족"], "익명"],
  ["아산", "between", "일주일에 세 번은 고속버스를 탑니다.", ["일", "자유"], "익명"],
  ["기타 충남", "returned", "부모님이 편찮으셔서 내려왔는데, 지금은 제가 여기 사람이 됐어요.", ["가족", "소속감"], "익명"],
];

/** 목업 저장소 — 백엔드 없이 화면을 통째로 굴려보기 위한 것. */
/**
 * 목업 배 색·소품 칠·고양이 무늬(10-07) — 지도에서 배마다 다른 칠이 보이게. 실제처럼 기본 배도 꽤 남긴다.
 * 순번에서 시드를 따로 뽑는다 — MockStore 의 rng 를 더 부르면 뒤따르는 목업 기록(문장·지역·키워드)이 전부 달라진다.
 */
function mockPaint(n, kws) {
  const T = globalThis.SURVEY_TAXONOMY || {};
  const ids = (T.BOAT_COLORS || []).map((c) => c.id).filter((id) => id !== "base");
  const coats = (T.CAT_COATS || []).map((c) => c.id);
  if (!ids.length) return {};
  const r = makeRng(hashSeed(`paint-${n}`));
  const hex = () => {   // 컬러휠로 고른 색 흉내 — HSL 에서
    const h = r() * 360, sat = 0.45 + 0.45 * r(), l = 0.3 + 0.4 * r();
    const f = (k) => { const a = sat * Math.min(l, 1 - l), t = (k + h / 30) % 12; return l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)); };
    return "#" + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  };
  const pick = () => { const x = r(); return x < 0.3 ? "base" : x < 0.85 ? ids[(r() * ids.length) | 0] : hex(); };
  const out = { hull_color: pick(), deck_color: r() < 0.3 ? pick() : "auto" };
  for (const p of T.PROP_PAINTS || []) {
    if (!kws.includes(p.keyword)) continue;
    out[p.field] = p.kind === "coat" ? coats[(r() * coats.length) | 0] : (r() < 0.4 ? "base" : pick());
  }
  return out;
}

export class MockStore {
  /**
   * @param {number} seedCount 시작할 때 이미 쌓여 있는 기록 수
   * @param {number} intervalSec 새 기록이 들어오는 간격(초). 0이면 안 들어온다.
   */
  constructor(seedCount = 46, intervalSec = 14) {
    this.seedCount = seedCount;
    this.intervalSec = intervalSec;
    this.rng = makeRng(70425);
    this.n = 0;
    this._timer = null;
  }

  _make(ageSec) {
    const src = MOCK_TEXTS[(this.rng() * MOCK_TEXTS.length) | 0];
    // 목업이라도 분포가 한쪽으로 쏠려야 통계 화면이 실제처럼 보인다.
    // 문장은 시드에서 가져오되 지역·상태·키워드는 조금씩 섞는다.
    const swap = this.rng();
    const region = swap < 0.7 ? src[0] : REGIONS[(this.rng() * REGIONS.length) | 0];
    const state = swap < 0.7 ? src[1] : STATES[(this.rng() * STATES.length) | 0].id;
    const kws = swap < 0.55 ? src[3] : [KEYWORDS[(this.rng() * KEYWORDS.length) | 0]];
    return {
      record_id: `mock-${++this.n}`,
      created_at: new Date(Date.now() - ageSec * 1000).toISOString(),
      region,
      state,
      text: src[2],
      keywords: kws.filter((k) => KEYWORDS.includes(k)).slice(0, 2),
      display_name: src[4],
      // share·schema_version 은 스키마 검사를 통과하려고 붙였다. share 는 난수를 쓰지 않고
      // 순번에서 뽑는다 — rng 를 한 번 더 부르면 뒤따르는 목업 기록이 전부 달라진다.
      share: globalThis.RECORD_SCHEMA.SHARE_IDS[this.n % globalThis.RECORD_SCHEMA.SHARE_IDS.length],
      consent_public: true,
      consent_archive: true,
      moderation_status: "public",
      schema_version: globalThis.RECORD_SCHEMA.SCHEMA_VERSION,
      ...mockPaint(this.n, kws),
    };
  }

  subscribe({ onReady, onInsert }) {
    const seeded = [];
    for (let i = this.seedCount; i > 0; i--) seeded.push(this._make(i * 900));
    onReady(seeded);
    if (this.intervalSec > 0) {
      const tick = () => {
        onInsert(this._make(0));
        // 간격을 ±35% 흔들어 놔야 "사람이 제출하는 것"처럼 보인다.
        this._timer = setTimeout(tick, this.intervalSec * 1000 * (0.65 + this.rng() * 0.7));
      };
      this._timer = setTimeout(tick, this.intervalSec * 1000);
    }
    return () => clearTimeout(this._timer);
  }
}

/* -----------------------------------------------------------------------------
 * FirestoreStore — 실DB (Firebase로 확정, 09-30).
 *
 * record-store.js 의 dbListenPublic 이 스냅샷마다 "지금 공개된 기록 전부"를 준다.
 * 여기서는 그걸 계약으로 바꾼다:
 *   · 첫 서버 스냅샷 → onReady 한 번 (Firestore는 첫 스냅샷에서 기존 문서 전부를 "added"로
 *     준다 — 그대로 onInsert 로 보내면 시작할 때 수십 척이 한 척씩 등장 연출을 한다)
 *   · 그 뒤로는 "이미 화면에 준 id 집합"과 비교해 새 것 → onInsert, 빠진 것 → onRemove
 *     (docChanges 대신 전체 비교를 쓰는 이유: 끊겼다 다시 붙거나 캐시로 먼저 띄운 뒤에도
 *      같은 코드로 차이만 정확히 보낸다. 수천 건이라도 집합 비교는 순간이다)
 *   · 캐시(fromCache) 스냅샷은 무시한다 — 오프라인일 때 SDK가 빈 목록을 "현재 상태"처럼 준다
 *
 * 전시장 와이파이 대비
 *   · 마지막으로 받은 공개 목록을 localStorage(yeogi.map.cache.v1)에 둔다. BOOT_WAIT_SEC 안에
 *     서버가 답하지 않으면 캐시로 onReady를 부르고, 나중에 서버가 붙으면 차이만 보낸다.
 *     캐시도 없으면(이 기기 첫 부팅) 서버를 계속 기다린다 — 빈 바다로 먼저 띄우면 붙는 순간
 *     전부가 "새 기록"으로 쏟아진다.
 *   · 구독 오류(onSnapshot 의 error 콜백)는 백오프(2·4·8…60초)로 다시 붙는다.
 *     error 콜백이 없으면 끊긴 구독이 조용히 멈춘다.
 *   · SDK 자체를 못 받았으면(부팅 때 와이파이가 없었다) 다시 import 해도 소용없다 — 브라우저가
 *     실패한 모듈 주소를 문서가 살아 있는 동안 기억한다(크로미움 실측). 그래서 같은 백오프로
 *     SDK 주소에 fetch 로 닿는지만 보고, 닿으면 새로고침한다. 새로고침은 2분에 한 번까지 —
 *     그 사이 화면은 캐시로 돈다.
 * -------------------------------------------------------------------------- */
const CACHE_KEY = "yeogi.map.cache.v1";
const BOOT_WAIT_SEC = 8;
const RELOAD_KEY = "yeogi.map.reloadAt";
const RELOAD_MIN_GAP_SEC = 120;

/** 새로고침해도 되나 — 연달아 새로고침하며 깜빡이지 않게 (sessionStorage 는 새로고침을 건너 남는다) */
function mayReload() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_MIN_GAP_SEC * 1000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch { return false; }
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return c && Array.isArray(c.records) ? c.records : [];
  } catch { return []; }
}
function writeCache(records) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: new Date().toISOString(), records })); }
  catch { /* 용량 초과·사생활 보호 모드 — 캐시는 없어도 화면은 돈다 */ }
}
function validRecord(r) {
  const problems = globalThis.RECORD_SCHEMA.checkRecord(r);
  if (problems.length) console.warn(`[store] 스키마에 맞지 않아 건너뜀 (${problems.join(", ")}):`, r.record_id);
  return problems.length === 0;
}
const byCreated = (a, b) => a.created_at.localeCompare(b.created_at);

export class FirestoreStore {
  subscribe({ onReady, onInsert, onRemove }) {
    const shown = new Set();   // 화면에 넘긴 record_id
    let ready = false, stopped = false, attempt = 0;
    let unsub = null, retryTimer = null, bootTimer = null;

    const markReady = (records) => {
      ready = true;
      clearTimeout(bootTimer);
      const list = records.filter(validRecord).sort(byCreated);
      for (const r of list) shown.add(r.record_id);
      onReady(list);
    };
    const fromCacheIfAny = () => {
      if (ready) return;
      const cached = readCache();
      if (cached.length) {
        console.warn(`[store] 서버가 아직 답하지 않아 마지막으로 받은 공개 기록 ${cached.length}건으로 먼저 띄운다`);
        markReady(cached);
      }
    };
    bootTimer = setTimeout(fromCacheIfAny, BOOT_WAIT_SEC * 1000);

    const apply = (records) => {
      const list = records.filter(validRecord);
      writeCache(list);
      if (!ready) return markReady(list);
      const now = new Set(list.map((r) => r.record_id));
      for (const id of [...shown]) if (!now.has(id)) { shown.delete(id); onRemove(id); }
      for (const r of list.filter((x) => !shown.has(x.record_id)).sort(byCreated)) {
        shown.add(r.record_id);
        onInsert(r);
      }
    };

    const retry = (why, err) => {
      console.warn(`[store] ${why} — 다시 붙는다`, err);
      fromCacheIfAny();
      if (stopped) return;
      const sec = Math.min(60, 2 ** ++attempt) * (0.8 + Math.random() * 0.4);
      const sdkGone = err && err.code === "sdk-unavailable";
      retryTimer = setTimeout(sdkGone ? reloadWhenReachable : listen, sec * 1000);
    };
    const reloadWhenReachable = async () => {
      if (stopped) return;
      if (await dbSdkReachable() && mayReload()) {
        console.warn("[store] SDK 주소에 다시 닿는다 — 새로고침해서 받는다");
        location.reload();
        return;
      }
      retry("SDK 주소에 아직 닿지 않는다", { code: "sdk-unavailable" });
    };
    const listen = async () => {
      try {
        const u = await dbListenPublic(
          (snap) => { if (!snap.fromCache) { attempt = 0; apply(snap.records); } },
          (err) => { unsub = null; retry("구독이 끊겼다", err); }
        );
        if (stopped) u(); else unsub = u;
      } catch (err) {
        retry("Firebase SDK를 받지 못했다", err);
      }
    };
    listen();

    return () => {
      stopped = true;
      clearTimeout(bootTimer);
      clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }
}

/**
 * 저장소 고르기 — 설정이 채워져 있으면 Firestore, 비었거나 ?mock=1 이면 목업.
 * ?emu=1 은 localhost 에서만 에뮬레이터 (db-config.js 의 dbMode).
 * @param {URLSearchParams} qs  화면이 읽은 쿼리 (시안 파일은 location.search 가 없어 따로 받는다)
 */
export function pickStore(qs, seedCount, intervalSec) {
  const mode = dbMode(qs.toString(), location.hostname);
  if (mode === "mock") return new MockStore(seedCount, intervalSec);
  console.info(`[store] Firestore (${mode})`);
  return new FirestoreStore();
}

// ── 집계 ────────────────────────────────────────────────────────────────────
/** [{label, count}] 를 많은 순으로. 같은 수면 label 사전순(전환할 때마다 순서가 튀지 않게). */
export function tally(records, pick) {
  const m = new Map();
  for (const r of records) {
    const vals = pick(r);
    for (const v of (Array.isArray(vals) ? vals : [vals])) {
      if (v === undefined || v === null || v === "") continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
}
