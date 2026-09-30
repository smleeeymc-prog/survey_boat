/* =============================================================================
 * material-patch.js — 한 재질에 셰이더 패치를 여러 개 겹쳐 건다.
 *
 * three.js 재질의 onBeforeCompile 은 하나뿐이라, 패치마다 그냥 대입하면 앞의 패치가 조용히
 * 사라진다. 지도 배는 구운 AO(fleet.js) 위에 배 칠(boat-paint.js)이 같이 걸리므로 목록을 두고
 * 차례로 돌린다. 설문 index.html 의 patchMaterial 과 같은 방식이다(HANDOFF-map 18.3).
 *
 * 패치는 셰이더 조각 앞뒤에 코드를 덧붙이는 식으로 써야 서로 겹쳐도 된다
 * — replace(X, X + 코드) 또는 replace(X, 코드 + X). X 를 지우면 뒤의 패치가 자리를 못 찾는다.
 * ========================================================================== */

const PATCHES = new WeakMap();

/**
 * @param {THREE.Material} mat
 * @param {string} key 패치 이름 — 같은 이름은 한 번만 걸린다. 셰이더 프로그램 캐시 키에도 들어간다
 * @param {(shader: object, renderer: object) => void} fn onBeforeCompile 본문
 */
export function patchMaterial(mat, key, fn) {
  let list = PATCHES.get(mat);
  if (!list) { list = new Map(); PATCHES.set(mat, list); }
  if (list.has(key)) return;
  list.set(key, fn);
  mat.onBeforeCompile = (shader, renderer) => { for (const f of list.values()) f(shader, renderer); };
  // 같은 종류의 재질끼리 셰이더 프로그램을 나눠 쓰는데, 패치 조합이 다른 것끼리 섞이지 않게.
  // 캐빈·굴뚝 받침처럼 같은 패치 이름이라도 셰이더 코드가 다르면 이름에 그 차이를 넣어 부른다.
  mat.customProgramCacheKey = () => [...list.keys()].join("|");
  mat.needsUpdate = true;
}
