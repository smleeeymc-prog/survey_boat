/* =============================================================================
 * surface-fx.js — 광택(하늘 반사)·테두리 빛·면 색 변주 (HANDOFF-map 5.4, 09-30 사용자 결정으로 옮김).
 *
 * 설문 index.html _surfaceFxShader 와 같은 식·같은 세기(shared/look-tokens.js SURFACE_FX)다.
 * 지도에 맞게 바꾼 것 세 가지:
 *   1) 구운 AO는 fleet.js patchBakedAO 가 이미 빛에 곱한다. 설문 패치는 AO 곱하기까지 한 몸이라
 *      그대로 옮기면 두 번 곱해진다 → 여기서는 광택·테두리에 곱하는 AO 값만 다시 계산한다.
 *   2) 면 색 변주의 해시를 인스턴스 행렬 전(물체 공간) 면 법선으로 낸다. 설문은 월드 법선인데,
 *      지도 배 80척은 매 프레임 파도에 기울어서 월드 법선이 해시 칸 경계를 넘을 때마다 면 색이 깜빡인다.
 *      (InstancedMesh라 modelMatrix만 곱한 설문의 vFxWorld 는 애초에 인스턴스 자리도 빠진다)
 *   3) 멀리 작은 배에서 테두리 빛·광택을 줄인다(아래 FAR_FADE). 5.4의 걱정 — 작은 배는 거의 전부가
 *      가장자리라 테두리 빛이 번쩍이는 점이 된다 — 을 빼지 않고 화면 크기에 따라 푸는 식으로 맞췄다.
 *
 * 재질 패치는 material-patch.js 로 AO·배 칠 위에 겹쳐 건다(onBeforeCompile 은 하나뿐).
 * 삽입 자리: 면 변주 = normal_fragment_maps 뒤(칠·색조가 다 들어간 diffuseColor에 곱한다),
 *           광택·테두리 = opaque_fragment 앞(빛 계산이 끝난 outgoingLight 에 더한다). 설문과 같다.
 * ========================================================================== */

import * as THREE from "three";
import { SURFACE_FX, FLEET_SHIP_SCALE } from "./config.js";
import { patchMaterial } from "./material-patch.js";

// 멀리 있는 배에서 광택·테두리 빛을 줄이는 구간 — 배 길이(배 좌표 0.85 × 지도 배율)가 화면에서 몇 픽셀인지로 잰다.
// 정점 셰이더에서 깊이와 투영으로 잰다(줌하면 화각이 바뀌므로 매 프레임 맞다). fwidth 로 재면 안 된다 —
// 비스듬한 면일수록 값이 커져, 정작 테두리 빛이 도는 실루엣 쪽에서 가까운 배까지 꺼진다.
// FULL 이상이면 설문과 같은 세기, GONE 이하면 0. 1080×1920 기준 평소 가장 가까운 배가 약 150px,
// 도착 제시(3배 줌)가 약 620px다. 값은 스크린숏을 보고 정했다(HANDOFF-map 5.4 답신).
const FAR_FADE = { fullPx: 130, gonePx: 45, boatLen: 0.85 };

/**
 * 모든 재질이 같이 보는 uniform — 객체를 공유하므로 하늘색을 한 번 바꾸면 전부 따라간다.
 * 세기는 shared 값 그대로. 시간대 하늘색은 main.js 가 setSurfaceFxSky 로 넣는다.
 */
const U = {
  uSheenAmt: { value: SURFACE_FX.sheen },
  uRimAmt: { value: SURFACE_FX.rim },
  uFacetAmt: { value: SURFACE_FX.facet },
  uSkyTop: { value: new THREE.Color() },
  uSkyHor: { value: new THREE.Color() },
  uRimColor: { value: new THREE.Color() },
  uFxViewH: { value: 1080 },   // 그리기 버퍼 높이(px) — main.js 가 창 크기 바뀔 때 넣는다
};

/** 그리기 버퍼 높이(px). 배가 화면에서 몇 픽셀인지 재는 데 쓴다. */
export function setSurfaceFxViewport(heightPx) {
  U.uFxViewH.value = heightPx;
}

/**
 * 광택·테두리 빛이 비칠 하늘색 — 설문과 같은 규칙: 위 = 팔레트 첫 띠, 수평선 = 마지막 띠, 테두리 = 셋째 띠.
 * 팔레트 값은 sRGB hex, THREE.Color 가 선형으로 바꿔 둔다(outgoingLight 가 선형이라).
 * @param {(string|number)[]} sky 팔레트 sky 네 띠
 */
export function setSurfaceFxSky(sky) {
  U.uSkyTop.value.set(sky[0]);
  U.uSkyHor.value.set(sky[3]);
  U.uRimColor.value.set(sky[2]);
}

/**
 * 재질에 표면 효과를 건다. 구운 AO 패치(vAO·uAOAmt)가 먼저 걸려 있어야 한다 — 광택·테두리가
 * 구석에서 떠 보이지 않게 AO 값을 같이 곱한다. _ao 가 없는 지오메트리(클로버)에는 부르지 않는다.
 * @param {THREE.Material} mat
 * @param {number} edge 광택·테두리 몫 배수 (튜브만 TUBE_FX_EDGE, 나머지 1)
 */
export function applySurfaceFx(mat, edge = 1) {
  if (!mat.isMeshStandardMaterial) return;
  // 배수가 다른 재질도 셰이더 코드는 같다 → 프로그램은 공유되고 uFxEdge 값만 재질마다 따로 들어간다
  patchMaterial(mat, "surface-fx", (shader) => surfaceFxShader(shader, edge));
}

function surfaceFxShader(shader, edge) {
  Object.assign(shader.uniforms, U);
  shader.uniforms.uFxEdge = { value: edge };
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `
      uniform float uFxViewH;
      varying vec3 vFxObjP;
      varying float vFxPx;
      void main() {`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      vFxObjP = transformed;   // 인스턴스 행렬 전 = 배 좌표. 면 변주 해시가 배가 기울어도 안 바뀌게`)
    .replace("#include <project_vertex>", `#include <project_vertex>
      // 이 깊이에서 배 한 척 길이가 화면 몇 픽셀인가 (projectionMatrix[1][1] = 1 / tan(화각/2))
      vFxPx = ${(FAR_FADE.boatLen * FLEET_SHIP_SCALE).toFixed(3)} * projectionMatrix[1][1] * 0.5 * uFxViewH / max(-mvPosition.z, 1e-3);`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `
      uniform float uSheenAmt, uRimAmt, uFacetAmt, uFxEdge;
      uniform vec3 uSkyTop, uSkyHor, uRimColor;
      varying vec3 vFxObjP;
      varying float vFxPx;
      void main() {`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      // 면마다 색 변주 — 면 법선(화면 미분)으로 해시를 내서 밝기 ±10%, 따뜻함/차가움을 살짝 돌린다.
      // 물체 공간 법선이라 배가 기울어도 면 색이 그대로다(머리말 2).
      if (uFacetAmt > 0.0) {
        vec3 fxFN = normalize(cross(dFdx(vFxObjP), dFdy(vFxObjP)));
        float fxH = fract(sin(dot(floor(fxFN * 9.0 + 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float fxH2 = fract(fxH * 7.31 + 0.13);
        vec3 fxTint = mix(vec3(0.93, 0.98, 1.07), vec3(1.07, 0.99, 0.90), fxH2);
        diffuseColor.rgb *= mix(vec3(1.0), fxTint * (0.9 + fxH * 0.2), uFacetAmt);
      }`)
    .replace("#include <opaque_fragment>", `
      {
        float fxNear = smoothstep(${FAR_FADE.gonePx.toFixed(1)}, ${FAR_FADE.fullPx.toFixed(1)}, vFxPx);
        // AO는 patchBakedAO 가 빛에 이미 곱했다 — 여기서는 광택·테두리에 곱할 값만(머리말 1)
        float fxAO = mix(1.0, clamp(vAO, 0.0, 1.0), uAOAmt);
        vec3 fxN = inverseTransformDirection(normal, viewMatrix);
        vec3 fxV = inverseTransformDirection(normalize(vViewPosition), viewMatrix);
        float fxNdV = clamp(dot(fxN, fxV), 0.0, 1.0);
        // 광택: 하늘 반사. 비스듬히 볼 때만(프레넬 지수 3), 매끈한 만큼(거친 재질도 바닥 0.35)
        if (uSheenAmt > 0.0) {
          vec3 fxR = reflect(-fxV, fxN);
          vec3 fxSky = mix(uSkyHor, uSkyTop, smoothstep(-0.05, 0.75, fxR.y));
          float fxFres = pow(1.0 - fxNdV, 3.0);
          float fxGloss = mix(0.35, 1.0, smoothstep(0.1, 0.6, 1.0 - material.roughness));
          outgoingLight += fxSky * fxFres * fxGloss * 0.45 * uSheenAmt * fxAO * uFxEdge * fxNear;
        }
        // 테두리 빛: 실루엣 바로 가장자리의 좁은 띠만
        if (uRimAmt > 0.0) {
          float fxRim = smoothstep(0.72, 0.97, 1.0 - fxNdV);
          outgoingLight += uRimColor * fxRim * fxRim * 0.35 * uRimAmt * fxAO * uFxEdge * fxNear;
        }
      }
      #include <opaque_fragment>`);
}
