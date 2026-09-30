/* =============================================================================
 * seed-dummy.mjs — 실DB(records)에 더미 기록 40건을 넣는다 (2026-09-30 사용자 요청).
 *
 * 전시 전에 지도·통계·아카이브가 기록이 쌓인 상태에서 어떻게 보이는지 보려는 것이다.
 * 설문이 쓰는 길과 똑같이 쓴다: 익명 로그인 → records/{record_id} 생성(created_at = 서버 시각).
 * 모양은 설문과 같은 RECORD_SCHEMA.makeRecord / checkNew 로 만들고 검사한다 — 규칙이 거절할 기록은 안 보낸다.
 * 썸네일(thumbs)은 안 넣는다 — 아카이브 카드는 그림 없이 뜬다.
 *
 *   cd firebase && npm install
 *   node seed-dummy.mjs --dry-run     # 40건 검사만 (네트워크 없음)
 *   node seed-dummy.mjs               # 실DB에 쓰기 → 쓴 id를 dummy-records.json 에 남긴다
 *
 * 되돌리기: 규칙이 수정·삭제를 막으므로 콘솔에서 한다(HANDOFF.md 13.0의 7번) —
 * dummy-records.json 의 id마다 moderation_status 를 "hidden" 으로. 지도에서는 바로 사라진다.
 * 모든 기록의 created_at 은 보낸 순간이다(규칙이 request.time 만 받는다) — 과거 날짜로 흩을 수 없다.
 * 지도를 열어 둔 채 넣으면 40척이 차례로 "새 기록" 등장 연출을 한다. 닫고 넣은 뒤 여는 게 낫다.
 * ========================================================================== */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(HERE, "../statistics/shared");
// 분류값·스키마는 클래식 스크립트(전역에 얹는다) — 설문·지도와 같은 파일을 그대로 돌린다
for (const f of ["survey-taxonomy.js", "record-schema.js"]) vm.runInThisContext(fs.readFileSync(path.join(SHARED, f), "utf8"), { filename: f });
const S = globalThis.RECORD_SCHEMA;

// [지역, 상태, 나눔, 문장, 키워드, 이름] — 지역·상태·나눔(시간대)·키워드가 고르게 섞이게 골랐다
const DUMMY = [
  ["아산", "stay", "many", "퇴근길 곡교천 은행나무길을 걸으면 하루가 정리돼요. 그 길 때문에 남아요.", ["익숙함", "자유"], "은행잎"],
  ["아산", "stay", "close", "동네 빵집 사장님이 제 이름을 불러줘요. 그런 곳이 흔치 않잖아요.", ["관계", "소속감"], "익명"],
  ["아산", "leaving", "few", "공장 교대근무가 몸에 안 맞아서, 내년 봄엔 다른 일을 찾아 떠나요.", ["일"], "익명"],
  ["아산", "between", "none", "새벽 KTX로 서울 출근, 밤엔 온양으로. 잠만 자는 집이지만 제 집이에요.", ["일", "주거"], "통근러"],
  ["아산", "returned", "many", "온천 동네 목욕탕 냄새가 그리워서 돌아왔다고 하면 다들 웃어요.", ["익숙함", "우연"], "익명"],
  ["아산", "unsure", "close", "남자친구는 여기 있고 제 꿈은 저기 있어요. 아직 저울질 중이에요.", ["관계", "불안"], "익명"],
  ["아산", "stay", "none", "마당 있는 집을 이 값에 구할 수 있는 곳은 여기뿐이었어요.", ["주거"], "텃밭"],
  ["아산", "leaving", "many", "친구들 결혼식이 다 서울에서 열려요. 제 생활도 이제 그쪽이에요.", ["관계"], "익명"],
  ["천안", "stay", "few", "독립서점을 열었어요. 손님은 적어도 제 이름 걸고 하는 일이에요.", ["창작", "소속감"], "책방지기"],
  ["천안", "stay", "many", "두정동 골목 단골집들이 아직 버텨줘서, 저도 버티고 있어요.", ["익숙함", "관계"], "익명"],
  ["천안", "leaving", "none", "면접 보러 올라갈 때마다 차비가 아까워서, 아예 올라가기로 했어요.", ["일", "불안"], "익명"],
  ["천안", "between", "close", "평일엔 세종 청사, 주말엔 천안 부모님 댁. 반반 사는 사람이에요.", ["가족", "일"], "반반"],
  ["천안", "returned", "few", "서울 원룸 월세면 여기서 투룸이에요. 돌아온 이유는 그게 커요.", ["주거"], "익명"],
  ["천안", "unsure", "many", "호두과자 가게 하시는 부모님이 가게를 물려받을지 물어보세요.", ["가족", "일"], "익명"],
  ["천안", "stay", "close", "밴드 합주실이 싸고 넓어요. 음악 하기엔 여기가 더 자유로워요.", ["창작", "자유"], "베이스"],
  ["천안", "leaving", "few", "대학 동기들이 다 떠났어요. 혼자 남으니 이상하게 쓸쓸해요.", ["관계", "불안"], "익명"],
  ["천안", "between", "none", "천안아산역이 제 두 번째 집 같아요. 대합실 의자까지 익숙해요.", ["익숙함"], "익명"],
  ["기타 충남", "stay", "many", "공주 한옥마을에서 게스트하우스를 해요. 손님보다 제가 더 행복해요.", ["주거", "자유"], "마루"],
  ["기타 충남", "returned", "close", "태안 바다를 보고 자라서 그런지, 도시에선 숨이 막혔어요.", ["익숙함", "자유"], "파도"],
  ["기타 충남", "leaving", "many", "병원이 멀어요. 아이가 아플 때마다 한 시간씩 운전하는 게 무서워요.", ["가족", "불안"], "익명"],
  ["기타 충남", "unsure", "few", "청년 농부 지원금이 끝나면 어떻게 될지 모르겠어요.", ["일", "불안"], "딸기농부"],
  ["기타 충남", "between", "close", "홍성과 대전을 오가며 공방 수업을 해요. 길 위에서 아이디어가 나와요.", ["창작", "일"], "익명"],
  ["기타 충남", "stay", "none", "그냥 여기 사람들이 좋아요. 그 이상 설명이 안 돼요.", ["관계"], "익명"],
  ["기타 충남", "returned", "many", "귀농한 부모님 일손 도우러 왔다가 눌러앉았어요.", ["가족", "우연"], "익명"],
  ["충남 밖", "unsure", "none", "대전에 살지만 고향 논산이 자꾸 생각나요. 돌아갈 용기는 아직이에요.", ["익숙함", "불안"], "익명"],
  ["충남 밖", "returned", "close", "부산에서 10년 살다 왔어요. 바다는 없지만 가족이 있어요.", ["가족"], "익명"],
  ["충남 밖", "between", "many", "서울에 방 하나, 아산에 방 하나. 두 도시 모두 반쯤만 제 거예요.", ["주거", "소속감"], "두집살림"],
  ["충남 밖", "leaving", "close", "일 때문에 충남에 잠깐 왔었는데, 이제 원래 자리로 돌아가요.", ["일"], "익명"],
  ["충남 밖", "stay", "few", "제주에서 왔어요. 우연히 들른 곳에 정이 들어버렸네요.", ["우연", "소속감"], "귤"],
  ["비공개", "unsure", "many", "어디에 있든 불안한 건 똑같더라고요. 그럼 여기가 나아요.", ["불안"], "익명"],
  ["비공개", "stay", "close", "제 그림 속 풍경이 다 이 동네예요. 떠나면 그릴 게 없어요.", ["창작", "익숙함"], "스케치"],
  ["비공개", "leaving", "none", "아무도 저를 모르는 곳에서 처음부터 다시 해보고 싶어요.", ["자유"], "익명"],
  ["아산", "returned", "none", "떠날 땐 지겨웠던 조용함이, 돌아오니 선물 같았어요.", [], "익명"],
  ["천안", "unsure", "close", "청약이 되면 남고, 안 되면 떠날 것 같아요. 운에 맡겼어요.", ["주거", "우연"], "익명"],
  ["아산", "between", "few", "주말마다 할머니 댁 감나무를 돌보러 와요. 감이 저를 불러요.", ["가족", "익숙함"], "감나무"],
  ["기타 충남", "leaving", "close", "하고 싶은 공부가 이 지역엔 없어요. 언젠가 배워서 돌아올게요.", ["창작", "일"], "익명"],
  ["천안", "returned", "many", "동창회에서 다시 만난 친구들 덕분에 돌아올 결심을 했어요.", ["관계", "소속감"], "익명"],
  ["충남 밖", "unsure", "few", "청주에서 일하고 천안에서 자라서, 어디 사람이냐 물으면 머뭇거려요.", ["소속감", "불안"], "익명"],
  ["아산", "stay", "many", "여기 청년 모임에서 처음으로 제 편을 만났어요.", ["관계", "소속감"], "모임장"],
  ["비공개", "between", "none", "매일 두 시간씩 도로 위에 있어요. 그 시간이 제 유일한 혼자만의 시간이에요.", ["자유", "일"], "익명"],
];

const records = DUMMY.map(([region, state, share, text, keywords, name]) =>
  S.makeRecord({ id: S.newId(), region, state, share, text, keywords, name }));

let bad = 0;
records.forEach((r, i) => {
  const p = S.checkNew(r);
  if (p.length) { bad++; console.error(`[${i + 1}] 규칙에 안 맞음: ${p.join(", ")} — ${r.text}`); }
});
const count = (key) => Object.entries(records.reduce((m, r) => { for (const v of [].concat(r[key])) m[v] = (m[v] || 0) + 1; return m; }, {}))
  .map(([k, n]) => `${k} ${n}`).join(" · ");
console.log(`더미 ${records.length}건, 규칙 위반 ${bad}건`);
console.log(`  지역: ${count("region")}\n  상태: ${count("state")}\n  나눔: ${count("share")}\n  키워드: ${count("keywords")}`);
if (bad) process.exit(1);
if (process.argv.includes("--dry-run")) process.exit(0);

// 실DB 쓰기 — 설문과 같은 설정값(db-config.js)·같은 SDK 버전(package.json)
const { FIREBASE_CONFIG, COLLECTIONS } = await import("../statistics/shared/db-config.js");
const { initializeApp } = await import("firebase/app");
const { getAuth, signInAnonymously } = await import("firebase/auth");
const { getFirestore, doc, setDoc, serverTimestamp } = await import("firebase/firestore/lite");
const app = initializeApp(FIREBASE_CONFIG);
await signInAnonymously(getAuth(app));
const db = getFirestore(app);
const out = path.join(HERE, "dummy-records.json");
const written = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : [];
for (const r of records) {
  await setDoc(doc(db, COLLECTIONS.records, r.record_id), { ...r, created_at: serverTimestamp() });
  written.push({ record_id: r.record_id, text: r.text });
  fs.writeFileSync(out, JSON.stringify(written, null, 1));   // 중간에 끊겨도 쓴 것까지는 남게
  process.stdout.write(".");
}
console.log(`\n${records.length}건 썼다 → ${path.relative(process.cwd(), out)} (숨길 때 이 id들)`);
process.exit(0);
