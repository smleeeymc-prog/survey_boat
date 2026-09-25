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

  // 배에 늘 타고 있는 것 — 설문 화면만 쓴다. 키워드와 무관하게 항상 보인다.
  cat: "Cat",
};

// 소품: GLB 노드 이름 → 역할 키. 순회 순서가 곧 붙이는 순서다.
export const GLB_PROPS = {
  [GLB_NODES.gull]: "gull",
  [GLB_NODES.tube]: "tube",
};

// 키워드 → 배에 나타나는 요소 (GLB 노드 이름). 설문 화면만 쓴다.
// 고른 키워드 두 개의 요소가 켜지고, 나머지는 꺼진다. 캐빈 색은 키워드와 무관하다.
// 둘 이상 적힌 것은 세트라 같이 켜지고 같이 꺼진다.
// "Clover"는 GLB에 없다 — 설문 화면이 코드로 만들어 뱃머리에 붙이는 데칼이다(index.html CLOVER).
// 지도는 아직 이걸 안 쓰고 GLB_PROPS(갈매기·튜브)만 인스턴싱한다 — 팔레트의 KEYWORD_PROP 참고.
export const KEYWORD_NODES = {
  "일":     ["Toolbox"],
  "관계":   ["Lamp"],
  "가족":   [GLB_NODES.tube],
  "주거":   ["Plant"],
  "소속감": ["Surfboard"],
  "우연":   ["Clover"],
  "자유":   [GLB_NODES.gull],
  "불안":   ["Bell"],
  "익숙함": ["Chair", "Cup"],
  "창작":   ["Easel", "Easelchair"],
};
// 코드가 만드는 요소 — GLB에서 찾지 않는다.
export const CODE_MADE_NODES = ["Clover"];
