/* =============================================================================
 * ocean.js — 바다.
 *
 * 온보딩 씬(루트 index.html)의 GPU 셰이더 파도를 그대로 가져와서, 지도에 필요한
 * 만큼만 넓혔다. 손댄 곳은 딱 두 가지다.
 *
 *  1) 재중심이 1축 → 2축.
 *     온보딩은 배가 +X로만 나아가서 uBoatX(float) 하나면 됐다. 지도는 카메라가
 *     XZ 평면 위를 자유롭게 흐르므로 uCenter(vec2)로 바꿨다. 수식은 그대로다.
 *  2) 유리병 클리핑(uClip*) 제거.
 *     지도엔 병이 없다. 남겨두면 프래그먼트마다 안 쓰는 분기를 도는 값이라 뺐다.
 *
 * 재질·색·파도 상수(파장 2.2/1.3/0.8, 진폭, 프레넬/램버트/스펙큘러 조합)는
 * 한 글자도 바꾸지 않았다 — 인수인계 문서의 "3D 시각 언어 유지" 원칙.
 * ========================================================================== */

import * as THREE from "three";
import {
  GERSTNER_WAVES, WAVE_WRAP_DOMAIN,
  WATER_TILE_SIZE, WATER_TILE_SEGMENTS,
  WATER_FADE_NEAR, WATER_FADE_FAR,
} from "./config.js";

export const RIPPLE_MAX = 8;   // 셰이더 루프 상한이라 상수여야 한다 (원본과 동일)

/** 파도장은 WAVE_WRAP_DOMAIN을 주기로 반복된다. 좌표를 그 안으로 접어 float32를 보호한다. */
export function wrapWave(x) {
  const D = WAVE_WRAP_DOMAIN;
  return x - D * Math.round(x / D);
}

/**
 * 임의 좌표의 파고. 셰이더 gerstnerSum의 y성분과 값이 반드시 같아야 한다 —
 * 어긋나면 배가 수면에서 뜨거나 잠긴다. (selfcheck.js가 랩 정합성을 검산한다)
 * @param {number} flowPhase 이미 누적된 흐름 "위상" (세기가 아니다 — 원본 [버그6] 참고)
 */
export function waveHeightAt(x, z, t, flowPhase, ampScale) {
  let dy = 0;
  for (let w = 0; w < GERSTNER_WAVES.length; w++) {
    const wave = GERSTNER_WAVES[w];
    const k = (2 * Math.PI) / wave.wavelength;
    const theta = k * (wave.dirX * x + wave.dirZ * z) - (wave.speed * t + (flowPhase || 0));
    dy += wave.ampBase * ampScale * Math.sin(theta);
  }
  return dy;
}

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
        // 온보딩의 uBoatX(float)를 2축으로 넓힌 것. 타일이 매 프레임 여기로 재중심되고,
        // 파도 위상만 "진짜 월드좌표"(로컬 + uCenter)로 계산된다 → 이음매 없는 무한 바다.
        uCenter: { value: new THREE.Vector2(0, 0) },
        uChop: { value: 0.13 },
        uAmpScale: { value: 0.5 },
        uFlowPhase: { value: 0 },
        uSpecOn: { value: 1.0 },
        uSpecPower: { value: 400.0 },
        uSpecStrength: { value: 3.0 },
        uSpecColor: { value: new THREE.Color(0xaecbff) },
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

      vec3 gerstnerSum (vec2 worldXZ, float t) {
        vec3 r = vec3(0.0);
        float k; float theta; float amp; float c;

        k = 6.28318530718 / 2.2;
        theta = k * (1.0 * worldXZ.x + 0.15 * worldXZ.y) - (1.1 * t + uFlowPhase);
        amp = 0.05 * uAmpScale; c = cos(theta);
        r.x += uChop * amp * 1.0 * c; r.z += uChop * amp * 0.15 * c; r.y += amp * sin(theta);

        k = 6.28318530718 / 1.3;
        theta = k * (0.5 * worldXZ.x + -0.85 * worldXZ.y) - (1.6 * t + uFlowPhase);
        amp = 0.03 * uAmpScale; c = cos(theta);
        r.x += uChop * amp * 0.5 * c; r.z += uChop * amp * -0.85 * c; r.y += amp * sin(theta);

        k = 6.28318530718 / 0.8;
        theta = k * (-0.7 * worldXZ.x + 0.4 * worldXZ.y) - (2.1 * t + uFlowPhase);
        amp = 0.018 * uAmpScale; c = cos(theta);
        r.x += uChop * amp * -0.7 * c; r.z += uChop * amp * 0.4 * c; r.y += amp * sin(theta);

        return r;
      }

      void main () {
        // 무한 바다: 타일은 매 프레임 카메라 발밑으로 재중심되고(JS: waterMesh.position),
        // 파도 위상만 "진짜 월드좌표"로 계산한다. 타일은 언제나 카메라를 덮고 있고,
        // 파도는 월드에 고정된 것처럼 배들 사이를 지나간다.
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
        vec3 water = (1.0 - fresnel) * uOceanColor * diffuse;

        // 반짝임만 별도의 태양 방향을 쓴다 — 수면 반사는 거울이라 확산광과 같은 방향에
        // 두면 반짝이는 띠가 화면 뒤로 빠져 보이지 않는다.
        vec3 reflectDir = reflect(-normalize(uSpecSunDir), normal);
        float spec = pow(max(dot(reflectDir, viewDir), 0.0), uSpecPower);
        vec3 sparkle = uSpecColor * spec * uSpecStrength * uSpecOn;

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
 * 바다 타일 하나. 카메라를 따라다니므로 "화면에 보이는 만큼"만 크면 된다.
 * 정점을 셀 크기의 60% 안에서 흔들어 놔야 격자 무늬가 눈에 띄지 않는다(원본과 동일).
 */
export function buildWater() {
  const SIZE = WATER_TILE_SIZE, SEGMENTS = WATER_TILE_SEGMENTS;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const cellSize = SIZE / SEGMENTS;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.array[i * 3] += (Math.random() - 0.5) * cellSize * 0.6;
    pos.array[i * 3 + 2] += (Math.random() - 0.5) * cellSize * 0.6;
  }
  pos.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, buildWaterMaterial());
  // 타일이 매 프레임 카메라 밑으로 옮겨다니므로 절두체 컬링 판정이 의미가 없다.
  mesh.frustumCulled = false;
  return mesh;
}
