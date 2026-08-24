/* =============================================================================
 * store.js — 기록 저장소.
 *
 * 지금까지의 코드는 전부 클라이언트 안에서만 도는 씬이었다. 여러 참여자의 제출을
 * 모아 실시간으로 뿌리는 부분은 아직 없다(인수인계 4장). 그래서 여기서는
 * "화면이 저장소에 요구하는 것"만 인터페이스로 못박고, 지금은 목업 구현을 쓴다.
 * 백엔드가 정해지면 SupabaseStore / FirestoreStore 를 채워 넣고 main.js에서
 * 한 줄만 갈아끼우면 된다 — 씬 쪽 코드는 전혀 손대지 않는다.
 *
 * ── 저장소가 지켜야 하는 계약 ─────────────────────────────────────────────
 *   store.subscribe({ onReady(records), onInsert(record), onRemove(recordId) })
 *   · onReady   최초 1회. 이미 쌓여 있는 공개 기록 전부 (created_at 오름차순)
 *   · onInsert  새 제출이 공개될 때마다 1건씩
 *   · onRemove  관리자가 숨김 처리했을 때 (moderation_status가 공개→비공개)
 *
 * 화면은 이 셋 말고는 저장소에 대해 아무것도 모른다.
 *
 * ── 레코드 스키마 (기획 문서 기준) ────────────────────────────────────────
 *   record_id, created_at, region, state, text(≤80), keywords(≤2),
 *   display_name, consent_public, consent_archive, moderation_status
 * 화면에 띄우는 조건은 consent_public === true && moderation_status === "public".
 * 그 판정은 저장소 쪽(쿼리/보안규칙)에서 끝내는 게 맞다 — 비공개 문장이 브라우저까지
 * 내려온 뒤 JS가 거르는 구조면, 개발자도구만 열면 다 보인다.
 * ========================================================================== */

import { REGIONS, STATES, KEYWORDS } from "./config.js";
import { makeRng } from "./motion.js";

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
      consent_public: true,
      consent_archive: true,
      moderation_status: "public",
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
 * 실제 백엔드 어댑터 — 백엔드가 정해지면 이 자리를 채운다.
 *
 * 어느 쪽이든 씬 코드는 안 바뀐다. main.js의 저장소 한 줄만 갈아끼우면 된다.
 * 아래 두 스텁은 "무엇을 구현해야 하는지"를 코드로 남겨둔 것이지 동작하는 코드가
 * 아니다 — SDK를 importmap에 추가하고 주석을 풀면 된다.
 *
 * [Supabase] (추천 — 이유는 README 참고)
 *   const sb = createClient(URL, ANON_KEY);
 *   // 최초 적재: 공개 조건은 서버에서 건다(RLS 정책 + 뷰). 클라이언트가 거르지 않는다.
 *   const { data } = await sb.from("records_public").select("*").order("created_at");
 *   onReady(data);
 *   sb.channel("records")
 *     .on("postgres_changes", { event: "INSERT", schema: "public", table: "records" },
 *         (p) => { if (p.new.moderation_status === "public") onInsert(p.new); })
 *     .on("postgres_changes", { event: "UPDATE", schema: "public", table: "records" },
 *         (p) => { if (p.new.moderation_status !== "public") onRemove(p.new.record_id); })
 *     .subscribe();
 *
 * [Firestore]
 *   const q = query(collection(db, "records"),
 *                   where("moderation_status", "==", "public"), orderBy("created_at"));
 *   onSnapshot(q, (snap) => snap.docChanges().forEach((c) => {
 *     if (c.type === "added")   onInsert(c.doc.data());
 *     if (c.type === "removed") onRemove(c.doc.id);
 *   }));
 *   // 주의: Firestore의 첫 스냅샷은 기존 문서 전부를 "added"로 준다.
 *   //       그대로 두면 시작할 때 46척이 한 척씩 등장 연출을 하며 쏟아진다.
 *   //       첫 스냅샷만 모아서 onReady로 넘길 것.
 * -------------------------------------------------------------------------- */

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
