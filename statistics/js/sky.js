/* =============================================================================
 * sky.js — 하늘 돔: 그라디언트 + 수평선 안개 + 먼 해안선 + 구름 + 해(달) 번짐.
 *
 * 하늘은 월드의 돔이다 — 색은 "그 방향이 수평선에서 몇 도 위인가"로 정한다(예전 main.js makeSkyDome 그대로).
 * 10-03(사용자: "풍경이 안 예쁘다")에 그 위에 얹은 것:
 *   · 수평선 안개 — 수평선 아래 방향(바다가 끝난 뒤 돔이 비치는 띠)을 안개색으로 채우고, 수평선 바로 위를
 *     안개색으로 녹인다. 예전엔 바다 끝과 돔 사이에 밝은 줄이 한 줄 그어져 화면이 잘린 것처럼 보였다.
 *   · 먼 해안선 — 수평선에 낮은 산줄기 실루엣(공기 원근으로 안개색에 거의 녹은 색). 끝없는 평면 바다에
 *     "저 너머 땅"이 생긴다. 지오메트리 없이 돔 셰이더 안에서 그려 draw call 이 늘지 않는다.
 *   · 구름 — 수평선 위 낮은 하늘에 가로로 길게 흐르는 구름 띠. 아주 천천히 흐른다.
 *   · 해(달) 번짐 — 화면 오른쪽 낮은 하늘. 물 위 반짝이는 길(ocean.js uGlint)도 같은 방향이다.
 * 값은 config.js SKY_LOOK(시간대별). 색은 팔레트처럼 sRGB 값 그대로 섞는다(돔은 색 변환 없이 내보낸다).
 * ========================================================================== */

import * as THREE from "three";
import { CAM_HEIGHT, CAM_LOOK_AHEAD, CAM_FOV, SKY_LOOK } from "./config.js";

const srgb = (v) => {
  const h = new THREE.Color(v).getHex();
  return new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
};
const rad = (d) => (d * Math.PI) / 180;

/** 방위(+는 화면 왼쪽 = +X 쪽)·고도(도) → 월드 방향. 카메라는 +Z 를 본다. */
export function skyDir(azDeg, elDeg) {
  const az = rad(azDeg), el = rad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * @param {object} P 팔레트(TIME_OF_DAY[key])
 * @param {string} timeKey
 */
export function makeSkyDome(P, timeKey) {
  const L = SKY_LOOK[timeKey] || SKY_LOOK.day;
  const colors = P.sky;
  const coast = L.coast;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      c0: { value: srgb(colors[0]) }, c1: { value: srgb(colors[1]) },
      c2: { value: srgb(colors[2]) }, c3: { value: srgb(colors[3]) },
      uPitch: { value: Math.atan2(CAM_HEIGHT, CAM_LOOK_AHEAD) },
      uTanHalf: { value: Math.tan((CAM_FOV * Math.PI) / 360) },
      uTime: { value: 0 },
      uFog: { value: srgb(P.fog) },
      uHaze: { value: L.haze },
      uCoastFar: { value: srgb(coast.far) }, uCoastNear: { value: srgb(coast.near) },
      uCloudLit: { value: srgb(L.clouds.lit) }, uCloudShade: { value: srgb(L.clouds.shade) },
      uCloudAmt: { value: L.clouds.amount },
      uSunDir: { value: skyDir(L.sun.az, L.sun.el) },
      uSunCol: { value: srgb(L.sun.color) },
      uSunGlow: { value: L.sun.glow }, uSunDisc: { value: L.sun.disc },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 c0, c1, c2, c3;
      uniform float uPitch, uTanHalf, uTime, uHaze, uCloudAmt, uSunGlow, uSunDisc;
      uniform vec3 uFog, uCoastFar, uCoastNear, uCloudLit, uCloudShade, uSunDir, uSunCol;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
        return s;
      }
      // 로우폴리 산줄기 — 방위를 일정 칸으로 나눠 칸 끝마다 높이를 정하고 그 사이를 곧게 잇는다(각진 실루엣).
      // 높이는 바다 쪽(음수)에서 시작한다 — 바다가 끝나는 고도(약 −2.9°) 아래로 내려가야 바다와 이어진다.
      float ridge(float az, float seg, float seed, float lo, float hi) {
        float x = az / seg;
        float i = floor(x), f = fract(x);
        float a = mix(lo, hi, hash(vec2(i, seed))), b = mix(lo, hi, hash(vec2(i + 1.0, seed)));
        return mix(a, b, f);
      }
      // 방위 구간 [a0, a1](라디안) 안에서만 1, 끝은 부드럽게 낮아진다(섬 끝이 바다로 잦아들게)
      float span(float az, float a0, float a1, float soft) {
        return smoothstep(a0, a0 + soft, az) * (1.0 - smoothstep(a1 - soft, a1, az));
      }

      void main() {
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0));
        float az = atan(d.x, d.z);   // 0 = 화면 정면(+Z), + = 왼쪽

        // 이 방향이 평소 화면에서 세로 어디(위 0 ~ 아래 1)에 오는가 — 예전 그라디언트 그대로
        float a = el + uPitch;
        float y = clamp(0.5 - 0.5 * tan(clamp(a, -1.35, 1.35)) / uTanHalf, 0.0, 1.0);
        vec3 col = y < 0.48 ? mix(c0, c1, y / 0.48)
                 : y < 0.78 ? mix(c1, c2, (y - 0.48) / 0.30)
                 :            mix(c2, c3, (y - 0.78) / 0.22);

        // 해(달) 번짐 — 넓은 빛무리 + 작은 원반
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        // 더하지 않고 해 색 쪽으로 섞는다 — 청록 하늘에 노란빛을 더하면 초록·회색으로 뜬다
        col = mix(col, uSunCol, clamp((pow(sd, 22.0) * 0.45 + pow(sd, 240.0) * 0.6) * uSunGlow, 0.0, 1.0));
        col = mix(col, uSunCol, smoothstep(0.99955, 0.99985, sd) * uSunDisc);

        // 구름 — 수평선 위 2~25도, 가로로 길게. 윗면은 밝게(빛을 받는 쪽), 아랫면은 그늘색
        // 수평선 위 낮은 하늘만 — 제목 카드 뒤 어두운 띠에 걸리면 탁해진다. 띠 밖은 잡음을 아예 안 잰다(픽셀마다 비싸다)
        float band = smoothstep(0.015, 0.05, el) * (1.0 - smoothstep(0.09, 0.17, el));
        if (uCloudAmt > 0.0 && band > 0.0) {
          vec2 q = vec2(az * 5.5 + uTime * 0.0035, el * 26.0);
          float n = fbm(q);
          float c = smoothstep(0.52, 0.72, n) * band * uCloudAmt;
          float lit = clamp((fbm(q + vec2(0.0, 0.35)) - n) * 3.0 + 0.6, 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit);
          cc += uSunCol * pow(sd, 10.0) * 0.4 * uSunGlow;   // 해 쪽 구름 가장자리가 물든다
          col = mix(col, cc, c);
        }

        // 수평선 안개 — 바로 위를 안개색으로 녹이고, 수평선 아래(바다가 끝난 뒤 비치는 띠)는 안개색으로 채운다
        col = mix(col, uFog, uHaze * exp(-max(el, 0.0) / 0.045));
        if (el < 0.0) col = uFog;

        // 먼 해안선 — 먼 산줄기(안개에 더 녹음) 앞에 가까운 산줄기. 정면 바다(섬 쪽)는 비워 둔다.
        // 구간 밖에서는 높이가 바다 밑(BASE)으로 잦아든다 — 섬 끝이 바다로 비스듬히 내려간다.
        const float BASE = -0.07;   // 바다가 불투명해지는 고도(약 −3.7°)보다 아래
        // 바다(투명도 0.92)를 통해 돔이 조금 비친다 — 해안선을 BASE 아래까지 칠하면 바다 위에 세로 줄로 비친다
        if (el > BASE && el < 0.02) {   // 산줄기가 있을 수 있는 고도에서만
          // 왼쪽: 길게 이어지는 해안(먼 산 + 앞 산), 오른쪽 먼 곳: 작은 섬 몇 개. 정면과 해 아래(오른쪽 앞)는 트인 바다
          float s1 = span(az, 0.10, 1.25, 0.10), s2 = span(az, -0.66, -0.44, 0.05);
          float s3 = span(az, 0.24, 1.05, 0.12);
          float hFar = max(mix(BASE, ridge(az, 0.045, 3.0, -0.036, 0.004), s1),
                           mix(BASE, ridge(az, 0.030, 7.0, -0.040, -0.004), s2));
          float hNear = mix(BASE, ridge(az, 0.028, 11.0, -0.042, -0.006), s3);
          if (max(s1, s2) > 0.001 && el < hFar) col = uCoastFar;
          if (s3 > 0.001 && el < hNear) col = uCoastNear;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), mat);
  dome.renderOrder = -1000;       // 맨 먼저 그린다 (깊이를 안 쓰므로 무엇도 가리지 않는다)
  dome.frustumCulled = false;
  return dome;
}
