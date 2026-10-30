/* =============================================================================
 * dummy/rows.mjs — 2차 더미 기록 44건(10-30 사용자 요청: "적어도 40명, 실제 사람들 말투로").
 *
 * 1차(09-30, 다듬은 긴 문장 40건)는 실제 참여자 글과 결이 너무 달랐다. 실DB의 실제 답을 보고 내용 말고 **말투만** 따랐다:
 *   · 문장은 짧은 명사구·"~음/~해서"로 끝나는 메모 투. 마침표 거의 없음, 가끔 오타·ㅋㅋ·말줄임표
 *   · 이름은 대부분 익명, 가끔 짧은 별명이나 이름
 *   · 배 색은 반쯤 컬러휠 색 코드(#rrggbb), 반쯤 팔레트 색. 투톤은 드물게
 * 마음(Ⅳ, 10-30 새 문항)은 선택이라 열에 일곱 정도만 쓴다.
 *
 * 색·소품 칠·고양이 무늬·보내는 차례는 고정 씨앗 난수로 정한다 — 다시 돌려도 같은 44척이 나온다.
 * 여기선 값만 만든다. 그림(썸네일)은 dummy/thumbs.mjs, 쓰기는 seed-dummy.mjs.
 * ========================================================================== */

// [지역, 세부 지역, 상태, 나눔, 문장(Ⅲ), 마음(Ⅳ — null 이면 비움), 키워드, 이름]
export const ROWS = [
  ["아산", null, "stay", "many", "가족", "편안해요", ["가족"], "익명"],
  ["아산", null, "stay", "close", "월세가 싸서", "그냥 그래요", ["주거"], "익명"],
  ["아산", null, "stay", "none", "회사가 여기잇음", null, ["일"], "익명"],
  ["아산", null, "stay", "many", "친구들 다 여기 있어서ㅎㅎ", "행복해요ㅎ", ["관계", "소속감"], "쭈니"],
  ["아산", null, "stay", "few", "고양이 두마리랑 사는 집", "든든함", ["주거"], "냥집사"],
  ["아산", null, "returned", "close", "서울 생활에 지쳐서", "후련한데 좀 허전", ["자유"], "익명"],
  ["아산", null, "leaving", "many", "문화생활 할게 너무 없다", null, ["자유"], "익명"],
  ["아산", null, "between", "none", "직장은 서울 집은 아산", "피곤해요 진짜", ["일", "주거"], "익명"],
  ["아산", null, "unsure", "few", "여기 좋은데 미래가 안보여", "막막함", ["불안"], "익명"],
  ["아산", null, "stay", "close", "곡교천 산책길", null, ["익숙함"], "산책러"],
  ["아산", null, "returned", "many", "엄마 아프셔서 내려옴", "걱정 반 다행 반", ["가족"], "익명"],
  ["아산", null, "unsure", "close", "남친이 여기 살아서..", null, ["관계", "우연"], "익명"],

  ["천안", null, "stay", "many", "학교 다니는중 (디자인과)", "그럭저럭?", ["소속감", "창작"], "익명"],
  ["천안", null, "stay", "close", "부모님 가게 도와드림", "책임감", ["가족", "일"], "익명"],
  ["천안", null, "leaving", "few", "일자리가 없음", "씁쓸해요", ["일"], "익명"],
  ["천안", null, "leaving", "close", "연애하려고 ㅋㅋ", "두근두근", ["관계", "우연"], "ㅎㅎ"],
  ["천안", null, "returned", "none", "취업 실패하고 돌아옴...", "조금 부끄러움", ["불안", "가족"], "익명"],
  ["천안", null, "between", "many", "직장때문에 평택 왔다갔다", "길에서 하루가 다 감", ["일"], "익명"],
  ["천안", null, "unsure", "none", "모르겟음", null, [], "익명"],
  ["천안", null, "stay", "few", "그냥 익숙해서", null, ["익숙함"], "익명"],
  ["천안", null, "stay", "many", "두정동 단골 술집", "즐거워요ㅋㅋ", ["관계", "익숙함"], "하이볼"],
  ["천안", null, "unsure", "close", "돈 모이면 생각해볼래요", null, ["주거", "불안"], "익명"],
  ["천안", null, "returned", "close", "고향이니까", "포근함", ["익숙함", "가족"], "익명"],

  ["기타 충남", "공주", "stay", "many", "조용해서 좋음", "평화로움", ["주거", "익숙함"], "익명"],
  ["기타 충남", "서산", "leaving", "close", "병원이 너무 멀어요", "불안해요", ["가족", "불안"], "익명"],
  ["기타 충남", "당진", "between", "few", "교대근무 출퇴근", "지침", ["일"], "익명"],
  ["기타 충남", "태안", "returned", "many", "바다", "숨 쉬어지는 기분", ["자유", "익숙함"], "파도"],
  ["기타 충남", "홍성", "unsure", "none", "청년지원금 끝나면 어떡하지", null, ["불안", "일"], "익명"],
  ["기타 충남", "논산", "stay", "close", "군대 끝나고 눌러앉음 ㅋㅋ", "웃기고 좋음", ["우연"], "익명"],
  ["기타 충남", "보령", "leaving", "none", "할게 없음", null, [], "익명"],
  ["기타 충남", "예산", "stay", "few", "사과 농사 가업", "뿌듯", ["가족", "일"], "사과"],
  ["기타 충남", "부여", "returned", "close", "할머니집", "그리움", ["가족"], "익명"],

  ["충남 밖", null, "between", "many", "주말부부라서", "보고싶음", ["가족", "관계"], "익명"],
  ["충남 밖", null, "leaving", "close", "원래 살던 데로 돌아감", "홀가분", ["익숙함"], "익명"],
  ["충남 밖", null, "between", "none", "대전 사는데 공연때문에 자주옴", null, ["창작", "일"], "익명"],
  ["충남 밖", null, "unsure", "few", "이사 갈까 말까", "갈팡질팡", ["주거", "불안"], "익명"],
  ["충남 밖", null, "returned", "close", "서울 집값", null, ["주거"], "익명"],
  ["충남 밖", null, "stay", "many", "여기 사람들이 좋음", "고마워요", ["관계", "소속감"], "이서진"],
  ["충남 밖", null, "between", "none", "기숙사랑 본가", "어디가 집인지 모르겠음", ["소속감"], "익명"],
  ["충남 밖", null, "leaving", "few", "더 큰데서 일해보고 싶음", "기대돼요!!", ["일", "자유"], "익명"],

  ["비공개", null, "unsure", "many", "그냥..", "복잡미묘", [], "익명"],
  ["비공개", null, "stay", "close", "작업실이 여기 있음", null, ["창작"], "그림쟁이"],
  ["비공개", null, "leaving", "none", "아무도 모르는 곳에서 다시 시작하고 싶어서", "답답한데 괜찮아", ["자유"], "익명"],
  ["비공개", null, "returned", "few", "결국 다시 여기", null, ["우연", "익숙함"], "익명"],
];

/** 고정 씨앗 난수(mulberry32) — 같은 씨앗이면 같은 수열 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 행 → { record(makeRecord 결과), scene(설문 state 와 같은 모양 — 썸네일 그릴 때 씬에 입힌다) }.
 * 보내는 차례는 섞는다 — 같은 지역이 줄줄이 들어오지 않게.
 */
export function buildDummies(S, T, { seed = 1030 } = {}) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const PALETTE = T.BOAT_COLORS.map((c) => c.id).filter((id) => id !== "base");
  // 컬러휠에서 고른 듯한 색 — 채도·명도를 너무 바래거나 새까맣지 않은 범위에서
  const wheelHex = () => {
    const h = rand() * 360, s = 0.3 + rand() * 0.6, v = 0.35 + rand() * 0.65;
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  };
  const color = () => (rand() < 0.5 ? wheelHex() : pick(PALETTE));
  const propColor = () => { const r = rand(); return r < 0.4 ? "base" : r < 0.7 ? pick(PALETTE) : wheelHex(); };

  const out = ROWS.map(([region, detail, state, share, text, feeling, keywords, name]) => {
    const two = rand() < 0.2;
    const hull = color();
    const deck = two ? color() : "auto";
    const props = Object.fromEntries(T.PROP_PAINTS.filter((p) => p.kind !== "coat").map((p) => [p.id, propColor()]));
    const catCoat = pick(T.CAT_COATS.map((c) => c.id));
    const record = S.makeRecord({ id: S.newId(), region, regionDetail: detail, state, share, text, feeling, keywords, name,
      hullColor: hull, deckColor: deck, props, catCoat });
    const scene = { region, regionDetail: detail, stateId: state, share, keywords: record.keywords,
      tone: two ? "two" : "one", hullColor: hull, deckColor: two ? deck : "base", props, catCoat };
    return { record, scene };
  });
  // 섞기(Fisher–Yates)
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
