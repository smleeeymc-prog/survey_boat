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
  hull:   /^Ship[_ ]?Body/,   // 지도만: 인스턴스 틴트를 받는 선체 그룹

  // 배에 붙는 소품 — 양쪽이 다 쓴다 (키워드에 따라 켜고 끈다)
  gull: "Seagull",
  tube: "Tube",

  // 섬 — 설문 화면만 쓴다 (지도에는 섬이 없다)
  rock:       "Rock",
  beachhouse: "Beachhouse",
};

// 소품: GLB 노드 이름 → 역할 키. 순회 순서가 곧 붙이는 순서다.
export const GLB_PROPS = {
  [GLB_NODES.gull]: "gull",
  [GLB_NODES.tube]: "tube",
};
