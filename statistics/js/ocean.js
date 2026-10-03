/* =============================================================================
 * ocean.js — 바다.
 *
 * 온보딩 씬(루트 index.html)의 GPU 셰이더 파도를 그대로 가져와서, 지도에 필요한
 * 만큼만 넓혔다. 손댄 곳은 딱 두 가지다.
 *
 *  1) 바다를 월드에 고정했다(재중심 없음). 온보딩은 배를 따라 타일을 옮기지만,
 *     지도는 카메라가 제자리에서 돌고 당기기만 해서 옮길 이유가 없다. 옮기면 면이
 *     카메라를 따라 미끄러진다 — buildWater 머리말. 격자는 곳곳의 칸 크기가 다르다.
 *  2) 유리병 클리핑(uClip*) 제거.
 *     지도엔 병이 없다. 남겨두면 프래그먼트마다 안 쓰는 분기를 도는 값이라 뺐다.
 *
 * 재질·색·파도 상수(파장 2.2/1.3/0.8, 진폭, 프레넬/램버트/스펙큘러 조합)는
 * 한 글자도 바꾸지 않았다 — 인수인계 문서의 "3D 시각 언어 유지" 원칙.
 *  3) [10-01] 반복 무늬 끊기 — 파도마다 진폭 배수(seaGain)와 물빛 얼룩(seaTint). 파도 표는 그대로다.
 *     지도는 깊이 150을 한 화면에 담아 같은 물결이 수백 번 되풀이됐다(sea-variety.js 머리말).
 * ========================================================================== */

import * as THREE from "three";
import {
  WATER_CELL, WATER_CELL_GROWTH, WATER_CELL_MAX, WATER_CORE_X, WATER_CORE_Z,
  WATER_EXTENT_X, WATER_Z_MIN, WATER_Z_MAX,
  WATER_FADE_NEAR, WATER_FADE_FAR,
} from "./config.js";
// 파도 수식은 온보딩 씬과 같은 파일에서 온다 — 한쪽만 고쳐 두 화면이 갈라지는 걸 막는다.
// GERSTNER_GLSL(정점 셰이더)과 waveHeightAt(JS 파고)은 같은 표에서 생성되므로
// 손으로 두 벌을 맞출 일이 없다.
import { makeGerstnerGLSL, waveHeightAt, wrapWave } from "../shared/ocean-core.js";
// 지도만 파도마다 진폭 배수를 곱한다(멀리서 잔물결 줄이기·물결 센 곳/잔잔한 곳 — sea-variety.js).
// 셰이더와 배 들썩임이 같은 배수를 써야 배가 수면과 맞는다 → 둘 다 여기서 같은 seaGain 을 건다.
import { seaGain, seaWarp, SEA_GAIN_GLSL, SEA_WARP_GLSL, SEA_TINT_GLSL } from "./sea-variety.js";
// (이름을 따로 짓는 이유: 시안 빌드가 모든 모듈을 한 스코프에 이어붙여서 공유 파일의 이름과 겹치면 죽는다)
export { wrapWave };
const MAP_GERSTNER_GLSL = makeGerstnerGLSL("seaGain", "seaWarp");

/** 지도 바다의 파고 — 물 셰이더와 같은 식(공유 파도 표 × seaGain, 위상 + seaWarp). 배 들썩임이 쓴다. */
export function seaHeightAt(x, z, t, flowPhase, ampScale) {
  return waveHeightAt(x, z, t, flowPhase, ampScale, seaGain, seaWarp);
}

export const RIPPLE_MAX = 8;   // 셰이더 루프 상한이라 상수여야 한다 (원본과 동일)

/**
 * 물 재질.
 * 프레넬 + 램버트 + 스펙큘러 조합은 dli/waves의 Tessendorf 오션 데모를 참고한 원본 그대로.
 * 표면 변위는 Gerstner 파도 세 개(파장 2.2 / 1.3 / 0.8)를 겹쳐 만든다.
 */
export function buildWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    // 물은 커스텀 ShaderMaterial이라 fog:true를 선언해야 scene.fog가 먹는다.
    // 안 하면 섬·배만 흐려지고 바다는 타일 끝까지 원래 색이라 수평선이 직선으로 잘린다.
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uOceanColor: { value: new THREE.Color(0x16345f) },
        uSkyColor: { value: new THREE.Color(0xa8c2ee) },
        uSunDirection: { value: new THREE.Vector3(0.30, 0.72, -0.62).normalize() },
        uSpecSunDir: { value: new THREE.Vector3(0.30, 0.72, -0.62).normalize() },
        uExposure: { value: 1.12 },
        uTime: { value: 0 },
        // 온보딩의 uBoatX(float)를 2축으로 넓힌 것. 지도에서는 바다가 월드에 고정돼 있어
        // 늘 0이다(buildWater 머리말). 셰이더는 온보딩과 같은 모양으로 남겨 둔다.
        uCenter: { value: new THREE.Vector2(0, 0) },
        uChop: { value: 0.13 },
        uAmpScale: { value: 0.5 },
        uFlowPhase: { value: 0 },
        uSpecOn: { value: 1.0 },
        uSpecPower: { value: 400.0 },
        uSpecStrength: { value: 3.0 },
        uSpecColor: { value: new THREE.Color(0xaecbff) },
        // 해(달) 쪽 반짝이는 길(윤슬) — 하늘 돔의 해 번짐과 같은 방향(sky.js · config.js SKY_LOOK).
        // 면마다 법선이 달라(플랫 셰이딩) 길 위의 면들이 하나씩 반짝인다. 워치독이 uSpecOn 을 끄면 같이 꺼진다.
        uGlintDir: { value: new THREE.Vector3(0, 0.2, 1).normalize() },
        uGlintColor: { value: new THREE.Color(0xffffff) },
        uGlintAmt: { value: 0.0 },
        // 물결 — xy는 월드 XZ 중심, z는 반지름, w는 세기(0이면 그 자리는 건너뛴다)
        uRippleOn: { value: 1.0 },
        uRipples: { value: Array.from({ length: RIPPLE_MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uRippleArc: { value: Array.from({ length: RIPPLE_MAX }, () => new THREE.Vector4(1, 0, 1, 0)) },
        uRippleColor: { value: new THREE.Color(0xffffff) },
        // 배 항적 — xy는 배 월드 XZ, z는 진행 방향(라디안), w는 세기.
        // 슬롯이 하나뿐이라 지도에서는 "지금 자기 자리로 이동 중인 새 기록"에만 준다.
        uWake: { value: new THREE.Vector4(0, 0, 0, 0) },
        // 먼 바다를 아예 투명하게 지운다. 안개만으로는 '안개색 판'이 남아
        // 하늘과 만나는 자리에 경계선이 보인다.
        uFadeNear: { value: WATER_FADE_NEAR },
        uFadeFar: { value: WATER_FADE_FAR },
      },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform vec2 uCenter;
      uniform float uChop;
      uniform float uAmpScale;
      // 흐름 가속분은 "속도"가 아니라 이미 쌓인 "위상"으로 들어온다.
      uniform float uFlowPhase;
      varying vec3 vWorldPos;

      ${SEA_GAIN_GLSL}
      ${SEA_WARP_GLSL}
      ${MAP_GERSTNER_GLSL}

      void main () {
        // 파도 위상은 월드 좌표로 계산한다. 지도에서는 바다 자체가 월드에 고정이라
        // uCenter 는 0이다 — 정점도, 면도, 면이 받는 빛도 실제 공간처럼 제자리에 있다.
        vec2 worldXZ = position.xz + uCenter;
        vec3 wave = gerstnerSum(worldXZ, uTime);

        vec4 worldPos = modelMatrix * vec4(position + wave, 1.0);
        vWorldPos = worldPos.xyz;
        // fog_vertex 청크가 mvPosition을 그대로 참조하므로 이름을 맞춰서 미리 만들어둔다.
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 uOceanColor;
      uniform vec3 uSkyColor;
      uniform vec3 uSunDirection;
      uniform vec3 uSpecSunDir;
      uniform float uExposure;
      uniform float uSpecOn;
      uniform float uSpecPower;
      uniform float uSpecStrength;
      uniform vec3 uSpecColor;
      uniform vec3 uGlintDir;
      uniform vec3 uGlintColor;
      uniform float uGlintAmt;
      uniform float uFadeNear;
      uniform float uFadeFar;
      uniform float uTime;
      uniform float uRippleOn;
      uniform vec4 uRipples[8];
      // xy = 드러나는 방향(단위벡터), z = 그 방향에서 잘라내는 각, w = 바깥 링 반지름
      uniform vec4 uRippleArc[8];
      uniform vec3 uRippleColor;
      uniform vec4 uWake;
      varying vec3 vWorldPos;

      /** 거리 d가 반지름 r에서 halfW 안쪽이면 1, 밖이면 0. 가장자리는 부드럽게. */
      float ringAt(float d, float r, float halfW) {
        return 1.0 - smoothstep(0.0, halfW, abs(d - r));
      }

      /**
       * 물체 둘레의 물결. 새 지오메트리를 만들지 않고 이미 화면을 덮고 있는 물 셰이더
       * 안에서 그린다. 울렁임은 원마다 재지 않고 수면 전체에 깔린 무늬 하나를 나눠 쓴다
       * (원마다 계산하면 sin이 원 개수만큼 돌아 소프트웨어 렌더러에서 48% 느려졌다).
       */
      float rippleAt(vec2 p, float waveH) {
        float acc = 0.0;
        float shift = waveH * 0.9;
        float halfW = 0.13 * 0.5 * (1.0 + 0.45 * sin(p.x * 5.0 + p.y * 3.7 + uTime * 0.6));
        for (int i = 0; i < 8; i++) {
          vec4 src = uRipples[i];
          if (src.w <= 0.001) continue;
          vec4 arcv = uRippleArc[i];
          vec2 rel = p - src.xy;
          float len = length(rel);
          float d = len + shift;
          // 화면 대부분은 어느 링 근처도 아니다. 바깥 링보다 멀면 곧장 건너뛴다.
          if (d - src.z > 0.60) continue;
          float base = ringAt(d, src.z, halfW);
          // 바깥 링은 정해진 한 방향의 일부만 드러난다. 각도를 쓰면 atan이 픽셀마다
          // 들어가므로 방향 벡터와의 내적으로 대신한다.
          float side = dot(rel / max(len, 1e-4), arcv.xy);
          float arc = smoothstep(arcv.z, arcv.z + 0.10, side);
          float outer = ringAt(d, arcv.w, 0.075) * 0.6 * arc;
          acc = max(acc, (base + outer) * src.w);
        }
        return acc;
      }

      /** 나아가는 배 뒤로 끌리는 V자 항적. 배 기준 좌표로 옮겨 놓고 그린다. */
      float wakeAt(vec2 p) {
        if (uWake.w <= 0.001) return 0.0;
        vec2 rel = p - uWake.xy;
        float c = cos(-uWake.z), s = sin(-uWake.z);
        vec2 loc = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
        float behind = -loc.x;                       // 진행 방향 반대쪽만
        if (behind <= 0.0) return 0.0;
        float spread = 0.42 * behind;
        float arm = 1.0 - smoothstep(0.0, 0.13, abs(abs(loc.y) - spread));
        return arm * exp(-behind * 0.55) * uWake.w;
      }

      ${SEA_TINT_GLSL}

      vec3 hdr (vec3 color, float exposure) {
        return 1.0 - exp(-color * exposure);
      }

      void main () {
        // 플랫 셰이딩: 픽셀별 스크린공간 미분으로 삼각형 "면" 노멀을 직접 계산 → 로우폴리 각진 느낌
        vec3 normal = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
        if (normal.y < 0.0) normal = -normal;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 sunDir = normalize(uSunDirection);

        float fresnel = 0.03 + 0.65 * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
        vec3 sky = fresnel * uSkyColor;
        float diffuse = clamp(dot(normal, sunDir), 0.0, 1.0);
        // 물빛 얼룩 — 넓게 짙고 옅은 곳이 섞여야 먼 바다가 한 장의 벽지처럼 안 보인다(sea-variety.js)
        vec3 water = (1.0 - fresnel) * uOceanColor * seaTint(vWorldPos.xz, uTime) * diffuse;

        // 반짝임만 별도의 태양 방향을 쓴다 — 수면 반사는 거울이라 확산광과 같은 방향에
        // 두면 반짝이는 띠가 화면 뒤로 빠져 보이지 않는다.
        vec3 reflectDir = reflect(-normalize(uSpecSunDir), normal);
        float spec = pow(max(dot(reflectDir, viewDir), 0.0), uSpecPower);
        vec3 sparkle = uSpecColor * spec * uSpecStrength * uSpecOn;
        // 윤슬 — 보는 방향을 면에 비춘 방향이 해 쪽이면 밝다. 좁은 항(반짝이는 면) + 넓은 항(옅은 빛길)
        float glintC = max(dot(reflect(-viewDir, normal), normalize(uGlintDir)), 0.0);
        sparkle += uGlintColor * (pow(glintC, 700.0) * 2.2 + pow(glintC, 36.0) * 0.16) * uGlintAmt * uSpecOn;

        vec3 color = sky + water + sparkle;
        if (uRippleOn > 0.5) {
          vec2 pXZ = vWorldPos.xz;
          float foam = rippleAt(pXZ, vWorldPos.y) + wakeAt(pXZ);
          color += uRippleColor * min(1.0, foam) * 0.55;
        }
        // 거리 페이드: 안개가 다 낀 지점에서 바다를 완전히 지워 타일 경계가 드러나지 않게 한다.
        float edgeFade = 1.0 - smoothstep(uFadeNear, uFadeFar, length(cameraPosition - vWorldPos));
        gl_FragColor = vec4(hdr(color, uExposure), 0.92 * edgeFade);
        #include <fog_fragment>
      }
    `,
  });
}

/**
 * 한 축의 격자 좌표. [coreMin, coreMax] 는 cell 간격으로 촘촘하게 두고, 그 밖으로는 한 칸마다
 * growth 배씩 넓혀 cellMax 까지 키운다. 칸 크기가 서서히 변해야 로우폴리 면의 크기 변화가
 * 띠처럼 보이지 않는다(한 칸에 4.5%씩).
 */
function gradedAxis(min, max, coreMin, coreMax, cell, growth, cellMax) {
  const n = Math.max(1, Math.round((coreMax - coreMin) / cell));
  const step = (coreMax - coreMin) / n;
  const core = Array.from({ length: n + 1 }, (_, i) => coreMin + i * step);
  const walk = (from, limit, dir) => {
    const out = [];
    let x = from, s = step;
    // 마지막 칸이 실처럼 가늘어지지 않게, 남은 거리가 한 칸 반보다 짧으면 끝점으로 닫는다
    while (Math.abs(limit - x) > s * growth * 1.5) {
      s = Math.min(cellMax, s * growth);
      x += dir * s;
      out.push(x);
    }
    out.push(limit);
    return out;
  };
  return [...walk(coreMin, min, -1).reverse(), ...core, ...walk(coreMax, max, 1)];
}

/**
 * 바다 한 장. 월드에 고정돼 있다 — 카메라가 움직이지 않으므로(제자리에서 돌고 당길 뿐,
 * camera.js) 따라다닐 필요가 없다.
 *
 * [변경] 예전에는 이 타일이 매 프레임 카메라 발밑으로 옮겨 다녔다. 파도의 높이는 월드
 * 좌표로 계산했지만 그 높이를 재는 "정점"들이 카메라와 함께 미끄러져서, 카메라가 움직이는
 * 동안 삼각형 면이 매 프레임 다른 자리에서 다시 만들어졌다. 플랫 셰이딩이라 면마다 빛이
 * 달라 보여서, 줌 인·아웃 때 "바다가 배보다 더 움직이고 빛이 면과 따로 논다"로 보였다.
 * 이제 정점이 월드에 박혀 있어 면도, 면이 받는 빛도 실제 공간처럼 제자리에 있다.
 *
 * 칸 크기가 곳곳이 다르다. 새 배를 망원으로 당겨 보는 구역(카메라 앞 8~46, 좌우 ±16)은
 * WATER_CELL(0.32)로 촘촘하게 — 균일한 0.83 칸이었다면 3배 줌에서 삼각형 하나가 화면 폭의
 * 3분의 1을 차지한다. 멀어질수록 칸을 키워 먼 바다는 2.6까지. 원근 때문에 먼 칸은 작게
 * 보이므로 화면에서의 면 크기는 오히려 고르게 된다. 정점 수는 예전과 같은 5만 남짓이다.
 * 정점을 칸 크기의 60% 안에서 흔드는 건 원본과 같다(격자 무늬가 안 보이게).
 */
export function buildWater() {
  const xs = gradedAxis(-WATER_EXTENT_X, WATER_EXTENT_X, -WATER_CORE_X, WATER_CORE_X,
    WATER_CELL, WATER_CELL_GROWTH, WATER_CELL_MAX);
  const zs = gradedAxis(WATER_Z_MIN, WATER_Z_MAX, WATER_CORE_Z[0], WATER_CORE_Z[1],
    WATER_CELL, WATER_CELL_GROWTH, WATER_CELL_MAX);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  // 흔드는 폭은 그 정점 양옆 칸 중 좁은 쪽 기준 — 칸이 뒤집히지 않는다
  const room = (a, i) => Math.min(i > 0 ? a[i] - a[i - 1] : Infinity, i < a.length - 1 ? a[i + 1] - a[i] : Infinity);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      const edge = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      pos[k] = xs[i] + (edge ? 0 : (Math.random() - 0.5) * room(xs, i) * 0.6);
      pos[k + 1] = 0;
      pos[k + 2] = zs[j] + (edge ? 0 : (Math.random() - 0.5) * room(zs, j) * 0.6);
    }
  }
  const index = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      index[t++] = a; index[t++] = c; index[t++] = b;
      index[t++] = b; index[t++] = c; index[t++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));

  const mesh = new THREE.Mesh(geo, buildWaterMaterial());
  // 정점을 셰이더가 파도로 밀어 올리므로 기하의 경계 상자가 실제와 다르다
  mesh.frustumCulled = false;
  mesh.userData.grid = { nx, nz, vertices: nx * nz };
  return mesh;
}
