/* =============================================================================
 * glb-nodes.js — GLB에서 찾아 쓰는 노드 이름. 두 화면이 이 파일 하나를 같이 본다.
 *
 * 블렌더에서 오브젝트 이름을 바꾸면 두 화면이 **조용히** 깨진다. 씬은 멀쩡히 돌아가고
 * 갈매기만 없어지거나 캐빈 색만 안 먹는다 — 전시장에서 발견하면 늦다. 그래서 이름을
 * 코드 여기저기에 문자열로 박지 않고 여기 한 곳에 모은다.
 *
 * 양쪽 selfCheck가 로드마다 존재를 확인한다:
 *   · 설문(../../index.html)  소품 노드를 못 찾으면 console.assert
 *   · 지도(../js/selfcheck.js) fleet.missing 이 비어 있는지 확인
 *
 * three.js는 노드 이름의 공백을 _ 로 바꾼다 — 블렌더의 "Ship Body"는 "Ship_Body"로
 * 들어온다. hull 만 정규식인 이유가 그것이다.
 *
 * 이 파일이 statistics/shared/ 에 있는 이유는 ocean-core.js 머리말 참고. 옮기지 말 것.
 * ========================================================================== */

export const GLB_NODES = {
  // 배 — 양쪽이 다 쓴다
  ship:   "Ship",
  cabin:  "Cabin",
  funnel: "Funnel",
  hull:   /^Ship[_ ]?Body/,   // 선체 — 지도: 인스턴스 틴트 그룹 / 설문: '우연' 클로버 데칼을 붙이는 면

  // 배에 붙는 소품 — 양쪽이 다 쓴다 (키워드에 따라 켜고 끈다)
  gull: "Seagull",
  tube: "Tube",

  // 섬 — 설문 화면만 쓴다 (지도에는 섬이 없다)
  // island는 Rock·Beachhouse의 부모(블렌더 빈 오브젝트). 뒷산·등대는 GLB상 씬 바로 아래에
  // 있지만 섬 풍경이라 이 좌표계로 옮겨서 섬과 같이 움직인다.
  island:       "Island",
  rock:         "Rock",
  beachhouse:   "Beachhouse",
  backMountain: "Back_Mountain",   // 블렌더 이름 "Back Mountain" (공백 → _)
  lighthouse:   "Lighthouse",

  // 키워드 요소 중 코드가 이름으로 따로 찾는 것
  cat: "Cat",
};

// 키워드 → 배에 나타나는 요소 (GLB 노드 이름). 두 화면이 같이 쓴다.
// 고른 키워드의 요소가 켜지고, 나머지는 꺼진다. 캐빈 색은 키워드와 무관하다(두 화면 다).
// 둘 이상 적힌 것은 세트라 같이 켜지고 같이 꺼진다.
// "Clover"는 GLB에 없다 — 코드가 선체에 투영하는 데칼이다(아래 CLOVER).
// 지도는 요소마다 InstancedMesh 하나를 만들고, 그 요소를 실제로 단 배에만 인스턴스를 둔다.
export const KEYWORD_NODES = {
  "일":     ["Toolbox"],
  "관계":   ["Lamp"],
  "가족":   [GLB_NODES.tube],
  "주거":   [GLB_NODES.cat],     // 예전엔 Plant. Plant는 GLB에 남아 있지만 화면에 안 쓴다
  "소속감": ["Surfboard"],
  "우연":   ["Clover"],
  "자유":   [GLB_NODES.gull],
  "불안":   ["Bell"],
  "익숙함": ["Chair", "Cup"],
  "창작":   ["Easel", "Easelchair"],
};
// 코드가 만드는 요소 — GLB에서 찾지 않는다.
export const CODE_MADE_NODES = ["Clover"];

// 뱃전에 걸린 요소. 카메라 반대쪽 뱃전에 있으면 선체에 가려지므로, 그쪽이 안 보일 때는
// 배 중심선에 대칭인 자리(거울상)로 옮긴다. 갑판 위 요소는 중심선 근처라 해당 없다.
// Cat은 굴뚝 옆 갑판이라 반대편이면 굴뚝에 가린다.
//   설문: 드래그로 둘러보므로 카메라 쪽이 바뀔 때마다 옮긴다
//   지도: 모든 배가 같은 방향으로 흘러 카메라가 늘 같은 뱃전을 보므로, 로드할 때 한 번 정한다
// 설문 index.html 의 SIDE_SWAP 은 이 값을 그대로 쓴다(09-27부터 한 곳).
export const SIDE_PROPS = ["Surfboard", "Bell", "Tube", "Clover", "Cat"];

// '우연' — 뱃머리 옆면에 붙는 네잎클로버 데칼. GLB에 없는 요소라 코드가 그려서 붙인다.
// 전부 눈으로 맞춘 값이다. 방향은 블렌더 기준: 뱃머리가 +X일 때 우현(오른쪽) = +Z.
// 단위는 설문 화면의 월드 단위다 — 배 배율 refScale(설문 SHIP_SCALE = GLB Ship 노드 배율)
// 기준. 배를 다른 크기로 그리는 화면(지도)은 refScale 로 나눠 배 좌표로 옮겨 쓴다.
// 설문 index.html 도 이 값을 그대로 쓴다(09-27부터 한 곳). refScale 은 설문 SHIP_SCALE 과 같아야 한다(설문 selfCheck).
export const CLOVER = {
  side: "starboard",   // "starboard"(우현) | "port"(좌현) — 지도는 늘 카메라 쪽 뱃전을 쓴다
  along: 0.62,         // 배 가운데(0) → 뱃머리 끝(1) 사이 어디쯤
  height: 0.33,        // 수면 위 높이 (월드 단위, refScale 기준)
  size: 0.30,          // 데칼 한 변 (월드 단위, refScale 기준)
  spin: -0.35,         // 데칼 면 안에서 돌리는 각도 (라디안, +는 반시계)
  leaf: "#4e9f4b",     // 잎
  vein: "#2f6f33",     // 잎맥·테두리
  refScale: 3.38,      // 위 단위의 기준이 된 배 배율
};
