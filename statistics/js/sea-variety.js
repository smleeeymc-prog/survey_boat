/* =============================================================================
 * sea-variety.js — 바다의 반복 무늬 끊기 (지도 전용). 값은 config.js SEA_VARIETY.
 *
 * 왜: 파도는 짧은 Gerstner 셋(파장 2.2/1.3/0.8, shared/ocean-core.js)뿐이다. 설문은 배 근처 몇 칸만
 * 비춰서 잔물결로 보이지만, 지도는 깊이 150·폭 80을 한 화면에 담아 같은 물결이 수백 번 되풀이되고
 * (벽지 같은 빗금), 줌 구역 밖 큰 칸에서는 파도가 건너뛰어 찍혀 면이 들쭉날쭉했다. 파도 표는 설문과
 * 같이 쓰므로 고치지 않고, 파도마다 진폭에 배수(seaGain)를 곱한다 — makeGerstnerGLSL(gain) 참고.
 *
 * 같은 식이 두 벌 있다: GLSL(물 정점 셰이더)과 JS(배가 파도를 타는 높이, main.js). 어긋나면 배가
 * 수면에서 뜨거나 잠긴다 — 고칠 때는 아래 SEA_GAIN_GLSL 과 seaGain 을 같이 고칠 것.
 * 둘 다 지도 월드 좌표(카메라가 원점에 서 있다)로 계산한다 — 바다가 월드에 고정이라 정점마다 값이 늘 같다.
 *
 * 조각 셰이더 쪽 물빛 얼룩(SEA_TINT_GLSL)은 색만 바꾸므로 JS 짝이 없다.
 * ========================================================================== */

import {
  SEA_VARIETY, WATER_CELL, WATER_CELL_GROWTH, WATER_CELL_MAX, WATER_CORE_X, WATER_CORE_Z,
} from "./config.js";

const V = SEA_VARIETY;
// 칸이 줌 구역에서 멀어질수록 얼마나 커지는가 — 등비로 커지는 칸들의 합이 s 일 때 마지막 칸은
// 대략 CELL + s·(g−1)/g 다(ocean.js gradedAxis 와 같은 규칙을 거꾸로 푼 근사).
const GROW = (WATER_CELL_GROWTH - 1) / WATER_CELL_GROWTH;
// 물결 센 곳/잔잔한 곳 — [방향 x, 방향 z, 길이(월드), 무게]. 길이가 서로 나누어떨어지지 않게 골랐다.
const PATCH = [[0.83, 0.56, 23, 0.5], [-0.42, 0.91, 37, 0.3], [0.97, -0.24, 61, 0.2]];
// 물빛 얼룩 — 같은 방식, 다른 방향·길이(물결 얼룩과 겹치지 않게)
const TINT = [[0.31, 0.95, 29, 0.5], [-0.88, 0.47, 47, 0.3], [0.64, -0.77, 83, 0.2]];

const glslNum = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const smoothJS = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 긴 사인 셋의 가중합(−1~1). drift 는 얼룩이 흐르는 속도(월드/초). */
function wavesJS(list, x, z, t, drift) {
  let s = 0;
  for (const [dx, dz, len, w] of list) s += w * Math.sin((2 * Math.PI * (dx * x + dz * z - drift * t)) / len);
  return s;
}
function wavesGLSL(list, drift) {
  return list.map(([dx, dz, len, w]) =>
    `${glslNum(w)} * sin(6.28318530718 * (${glslNum(dx)} * p.x + ${glslNum(dz)} * p.y - ${glslNum(drift)} * t) / ${glslNum(len)})`).join(" + ");
}

/**
 * 파도 하나의 진폭 배수 (JS). 아래 SEA_GAIN_GLSL 과 같은 식이다.
 * @param {number} wl 파장  @param {number} x  @param {number} z 월드 좌표  @param {number} t 시간(초)
 */
export function seaGain(wl, x, z, t) {
  const r = Math.hypot(x, z);
  const lod = 1 - (1 - V.lod.floor) * smoothJS(V.lod.start, V.lod.end, r);
  const out = Math.max(Math.abs(x) - WATER_CORE_X, WATER_CORE_Z[0] - z, z - WATER_CORE_Z[1], 0);
  const cell = Math.min(WATER_CELL_MAX, WATER_CELL + out * GROW);
  const coarse = 1 - (1 - V.coarse.floor) * smoothJS(wl * V.coarse.from, wl * V.coarse.to, cell);
  const k = 0.5 + 0.5 * wavesJS(PATCH, x, z, t, V.patch.drift);
  const patch = V.patch.min + (V.patch.max - V.patch.min) * k;
  return Math.min(lod, coarse) * patch;
}

/** 물 정점 셰이더에 넣는 같은 식 — float seaGain(float wl, vec2 p, float t) */
export const SEA_GAIN_GLSL = `
        float seaGain (float wl, vec2 p, float t) {
          float r = length(p);
          float lod = 1.0 - ${glslNum(1 - V.lod.floor)} * smoothstep(${glslNum(V.lod.start)}, ${glslNum(V.lod.end)}, r);
          float outside = max(max(abs(p.x) - ${glslNum(WATER_CORE_X)}, ${glslNum(WATER_CORE_Z[0])} - p.y), max(p.y - ${glslNum(WATER_CORE_Z[1])}, 0.0));
          float cell = min(${glslNum(WATER_CELL_MAX)}, ${glslNum(WATER_CELL)} + outside * ${glslNum(GROW)});
          float coarse = 1.0 - ${glslNum(1 - V.coarse.floor)} * smoothstep(wl * ${glslNum(V.coarse.from)}, wl * ${glslNum(V.coarse.to)}, cell);
          float k = 0.5 + 0.5 * (${wavesGLSL(PATCH, V.patch.drift)});
          float calm = ${glslNum(V.patch.min)} + ${glslNum(V.patch.max - V.patch.min)} * k;
          return min(lod, coarse) * calm;
        }
`;

/** 물빛 얼룩 — 바다색 배수. 조각 셰이더용 float seaTint(vec2 p, float t) */
export const SEA_TINT_GLSL = `
        float seaTint (vec2 p, float t) {
          float k = 0.5 + 0.5 * (${wavesGLSL(TINT, V.patch.drift * 0.6)});
          return ${glslNum(V.tint.min)} + ${glslNum(V.tint.max - V.tint.min)} * k;
        }
`;
