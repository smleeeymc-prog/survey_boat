/* =============================================================================
 * ocean-core.js — 파도의 진실. 두 화면이 이 파일 하나를 같이 본다.
 *
 * 온보딩 씬(../../index.html)과 머무름의 지도(../js/ocean.js)가 둘 다 여기서 읽는다.
 * 예전에는 각자 자기 파일에 같은 수식을 적어 두고 있었고, 그래서 한쪽만 고치면
 * 두 화면의 파도가 소리 없이 갈라졌다. 이제 고칠 곳은 여기 하나뿐이다.
 *
 * ── 이 파일이 statistics/shared/ 에 있는 이유 ────────────────────────────────
 * 지도는 Vercel에서 Root Directory를 statistics 로 잡아 따로 배포된다. Vercel은
 * 그 폴더 밖의 파일을 배포에 포함하지 않으므로, 공유 파일이 레포 루트에 있으면
 * 지도 배포에서 404가 난다. 그래서 공유 코드는 statistics/ 안에 두고, 루트의
 * 온보딩 씬이 ./statistics/shared/ 로 가져다 쓴다. 위치가 이상해 보여도 옮기지 말 것 —
 * 옮기는 순간 지도 배포가 깨진다.
 *
 * ── 반드시 같이 움직여야 하는 두 가지 ────────────────────────────────────────
 * GERSTNER_GLSL(정점 셰이더의 파도)과 waveHeightAt(JS로 읽는 파고)은 같은 수식이다.
 * 한 글자라도 어긋나면 배가 수면에서 뜨거나 잠긴다. 그래서 표(GERSTNER_WAVES)를
 * 원본으로 두고 GLSL을 그 표에서 생성한다 — 손으로 두 벌을 맞출 일이 없어진다.
 * ========================================================================== */

/** 겹쳐 쓰는 Gerstner 파도 셋. 이 표가 GLSL과 JS 양쪽의 원본이다. */
export const GERSTNER_WAVES = [
  { dirX: 1.0, dirZ: 0.15, wavelength: 2.2, ampBase: 0.05, speed: 1.1 },
  { dirX: 0.5, dirZ: -0.85, wavelength: 1.3, ampBase: 0.03, speed: 1.6 },
  { dirX: -0.7, dirZ: 0.4, wavelength: 0.8, ampBase: 0.018, speed: 2.1 },
];

/**
 * float32 정밀도 보호용 랩 도메인.
 * 위상은 k*(dirX*x + dirZ*z) 이므로 축별 "유효 파장"은 wavelength/dir 이다.
 * 1144는 X·Z 양쪽에서 세 파도 모두의 공배수다:
 *   X: 1144/(2.2/1.00)=520, 1144/(1.3/0.50)=440, 1144/(0.8/0.70)=1001
 *   Z: 1144/(2.2/0.15)=78,  1144/(1.3/0.85)=748, 1144/(0.8/0.40)=572
 * 전부 정수 → 랩 순간 위상이 정확히 2π의 배수만큼 옮겨가 화면엔 아무 티도 안 난다.
 * (지도의 selfcheck.js가 매 로드마다 이걸 다시 검산한다)
 */
export const WAVE_WRAP_DOMAIN = 1144;

/** 파도장은 WAVE_WRAP_DOMAIN을 주기로 반복된다. 좌표를 그 안으로 접어 float32를 보호한다. */
export function wrapWave(x) {
  const D = WAVE_WRAP_DOMAIN;
  return x - D * Math.round(x / D);
}

/**
 * 정점 셰이더에 넣을 gerstnerSum 함수 소스.
 * 표에서 생성하므로 GERSTNER_WAVES만 고치면 셰이더와 JS가 같이 따라온다.
 *
 * 쓰는 쪽에서 uChop / uAmpScale / uFlowPhase 유니폼을 선언해 두어야 한다.
 * (온보딩 씬과 지도 둘 다 같은 이름으로 갖고 있다)
 */
// GLSL 실수 리터럴. 정수는 소수점을 붙여야 한다 — GLSL ES에서 1 은 int라
// int * float 연산이 컴파일 오류가 된다. 그 외에는 자릿수를 늘리지 않는다:
// 손으로 적었던 원본과 글자까지 같아야, 셰이더 소스를 문자열로 검사하는
// 자기검증(온보딩 씬의 selfCheck)이 그대로 통한다.
const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const GERSTNER_GLSL = `
        vec3 gerstnerSum (vec2 worldXZ, float t) {
          vec3 r = vec3(0.0);
          float k; float theta; float amp; float c;
${GERSTNER_WAVES.map((w) => `
          k = 6.28318530718 / ${f(w.wavelength)};
          theta = k * (${f(w.dirX)} * worldXZ.x + ${f(w.dirZ)} * worldXZ.y) - (${f(w.speed)} * t + uFlowPhase);
          amp = ${f(w.ampBase)} * uAmpScale; c = cos(theta);
          r.x += uChop * amp * ${f(w.dirX)} * c; r.z += uChop * amp * ${f(w.dirZ)} * c; r.y += amp * sin(theta);`).join("")}

          return r;
        }
`;

/**
 * 임의 좌표의 파고. 위 GERSTNER_GLSL의 y성분과 값이 반드시 같다 (같은 표에서 나온다).
 * @param {number} flowPhase 이미 누적된 흐름 "위상" (세기가 아니다 — 셰이더 uFlowPhase와 동일)
 * @param {number} ampScale  바람 세기에서 나온 진폭 배수 (0.5 + 0.9 * windT)
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
