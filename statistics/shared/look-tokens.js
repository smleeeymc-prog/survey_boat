/* =============================================================================
 * look-tokens.js — 같은 배·같은 아틀라스가 두 화면에서 같은 색으로 보이게 하는 조명 비율.
 *
 * 09-27 사용자가 폰에서 고른 "필름 룩" 중 두 화면이 똑같아야 하는 부분만 여기 둔다.
 *   - 조명 비율·톤 매핑·거칠기 상한 → 같은 GLB 텍스처가 어떤 색으로 찍히는지를 정한다.
 *     한쪽만 바꾸면 설문에서 본 배와 지도에 뜬 배가 다른 색이 된다.
 *   - 구운 AO(_AO 정점 속성) 세기 → GLB에 같이 들어 있는 값이라 보이는 정도도 같아야 한다.
 * 화면 색보정(CSS 필터)·비네트는 CSS라 ./tokens.css 의 --scene-grade · --scene-vignette.
 *
 * 여기 없는 것 — 설문 화면 전용이라 index.html 에 남겼다:
 *   광택·테두리 빛·면 색 변주(병 속 근접 화면용 셰이더), 틸트시프트, 부드러운 그림자, 등대.
 *
 * 쓰는 법 (두 화면 공통):
 *   AmbientLight  세기 = 팔레트 ambI × SCENE_BRIGHTNESS × ambScale
 *   Directional(해) 세기 = 팔레트 sunI × SCENE_BRIGHTNESS × sunScale
 *   HemisphereLight 세기 = 팔레트 ambI × SCENE_BRIGHTNESS × hemiScale
 *     하늘색 = 팔레트 sky[HEMI.skyBand] 를 휘도 쪽으로 HEMI.skyDesat 만큼 뺀 색
 *     땅색   = 팔레트 ocean × HEMI.groundMul
 *   재질 roughness = min(원래 값, roughnessCap)   (재질을 복제한 뒤에 — 공유 재질이면 다른 곳도 바뀐다)
 *   renderer.toneMapping: tone === "none" → THREE.NoToneMapping
 *
 * 이 파일이 statistics/shared/ 에 있는 이유는 ocean-core.js 머리말 참고. 옮기지 말 것.
 * ========================================================================== */

export const SCENE_LOOK = {
  tone: "none",        // 톤 매핑 없음 — AgX·ACES는 밝은 텍스처를 바래게 해서 사용자가 "없음"을 골랐다
  ambScale: 0.25,      // 평평한 채움광은 반구광이 대신하므로 조금만 남긴다 (0이면 안 됨 — 설문이 이 값으로 나눈다)
  hemiScale: 0.9,      // 반구광 — 위는 하늘색, 아래는 바닷색이라 면 방향마다 채움광 색이 다르다
  sunScale: 1.5,       // 채움광을 줄인 만큼 해를 올린다
  roughnessCap: 0.68,  // 이보다 거친 재질은 여기까지 매끈하게 — 해 하이라이트가 은은하게 돈다
};

// 반구광 색을 팔레트에서 뽑는 규칙. 시간대마다 팔레트가 바뀌면 같이 따라간다.
export const HEMI = {
  skyBand: 1,          // palette.sky 의 몇 번째 띠를 하늘색으로 쓰나 (0 = 맨 위)
  skyDesat: 0.5,       // 그 색을 회색 쪽으로 얼마나 뺄까 — 원색 그대로면 배가 하늘색으로 물든다
  groundMul: 0.5,      // 바닷색을 얼마나 어둡게 해서 아래 채움광으로 쓸까
};

// 구운 AO 세기. 셰이더에서 vAO(= geometry.attributes._ao)를 이렇게 먹인다:
//   ao = mix(1, vAO, amount)
//   indirectDiffuse *= ao;  directDiffuse *= mix(1, ao, direct);  directSpecular *= ao;
// direct를 1로 올리면 해를 정면으로 받는 면까지 구석처럼 까매진다.
export const AO = {
  amount: 0.85,
  direct: 0.45,
};
