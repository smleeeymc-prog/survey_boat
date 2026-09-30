/* =============================================================================
 * boat-look.js — 배 겉모습 값·판정. 두 화면이 이 파일 하나를 같이 본다(2026-09-30~).
 *
 * 설문 화면(../../index.html)에서 사용자가 고른 배 모습 — 레퍼런스 예인선 색(마스트·계단·갑판·캐빈),
 * 튜브 톤, 램프 한 쌍·밤 불빛, 번짐 모양 — 의 "값"과 "모양을 재는 순수 함수"만 여기 둔다.
 * three.js에 기대는 부분(셰이더 패치, 텍스처 만들기, 조명)은 화면마다 따로 둔다 — 설문은 배 1척을
 * 가까이서, 지도는 InstancedMesh로 80척을 멀리서 그려서 방법이 다르다(HANDOFF-map 18장).
 *
 * 이 파일은 three를 import하지 않는다(다른 shared 파일과 같다). 지도 standalone 빌드에 넣으려면
 * statistics/tools/build-standalone.mjs 의 SHARED_ORDER 에 이 파일을 더할 것.
 * 이 파일이 statistics/shared/ 에 있는 이유는 ocean-core.js 머리말 참고. 옮기지 말 것.
 * ========================================================================== */

/**
 * 배 색 (재질 색, sRGB hex). 레퍼런스(로우폴리 예인선 렌더 세 장, 09-30 사용자)에 맞췄다.
 *
 * 주의: 이 값은 "설문 화면의 낮 조명에서 렌더됐을 때 레퍼런스 색이 되도록" 거꾸로 푼 재질 색이다.
 * 설문 낮 조명은 레퍼런스보다 어둡고 푸르러 재질 색의 약 40%만 화면에 나온다 — 그래서 값만 보면 밝고 붉다.
 * 조명이 다른 화면(지도)에서 쓰면 렌더 결과를 다시 재서 REFERENCE에 맞출 것(설문 HANDOFF 6.17 재는 법).
 *   설문 렌더 결과(낮, 가운데 값): 마스트 #935f4c · 갑판 #784f3d
 */
export const BOAT_PAINT = {
  mast: 0xed9377,        // 마스트(기둥·가로대 둘) — 무늬 없이 단색
  stairRail: 0xd08a70,   // 계단 옆판 — 갑판보다 밝은 나무
  stairTread: 0xecb294,  // 계단 디딤판 — 옆판보다 한 단 밝게, 계단이 갑판에서 도드라지게
  deck: 0xbf7a60,        // 갑판 판자 — 붉은 갈색(예전 꿀색 원목 대신)
  cabin: 0xfcdcb9,       // 캐빈 페인트 — 레퍼런스 색상(#f8ca98)으로 맞추면 황토색으로 가라앉아 채도를 덜었다
  cabinRoof: 0x7d5243,   // 캐빈 지붕 판자
  glass: 0x3a2632,       // 창·둥근 창 유리 (짙은 자줏빛 갈색)
  trim: 0xecd6b4,        // 둥근 창 테
  handle: 0x8d6a55,      // 문손잡이
  funnelStep: 0xf3dcc6,  // 굴뚝 받침 — 캐빈보다 조금 회색빛
};

/** 조명 받은 뒤 화면에 나와야 하는 색 — 레퍼런스 렌더에서 잰 값(가운데 값). 다른 조명에서 눈금 맞출 때의 목표. */
export const BOAT_PAINT_REFERENCE = {
  mast: 0xa0654f, deck: 0x845044, stairRail: 0x925c4c, stairTread: 0xa57662,
  cabin: 0xf8ca98, funnelStep: 0xd2b294, hull: 0x421e27,
};

// 튜브(가족)만 톤을 누른다 — 순백·순홍 아틀라스라 어두운 선체 위에서 혼자 떠 보였다(09-30 사용자).
// 색 배수(재질 color)와, 광택·테두리 빛을 받는 몫(설문 표면 효과의 uFxEdge). 설문 실측: 낮 196 → 156, 밤 123 → 96.
export const TUBE_TINT = [0.62, 0.59, 0.55];
export const TUBE_FX_EDGE = 0.3;

/**
 * 램프('관계') 한 쌍 — 마스트 가로대 양 끝에 하나씩, 앞뒤로 서로 반대로 흔들리고 밤에 켜진다.
 * GLB에는 한쪽 끝에만 있다. 반대쪽 자리는 lampTwinZ()로 잰다.
 */
export const LAMP = {
  swing: 0.26,        // 흔들리는 각도(라디안, ≈15도). 고리(램프 노드 원점)를 축으로 배 폭 축(z)으로 돈다
  period: 2.6,        // 한 번 갔다 오는 시간(초). 두 램프는 반대 위상(+sin / −sin)
  color: 0xffc98a,    // 불빛 색 — 등대(거의 흰색)보다 따뜻하게
  glass: 1.3,         // 유리가 빛나는 세기(emissive) — 텍스처의 노란 유리 부분만
  glowSize: 1.1,      // 번짐 크기(월드, 설문 배율 SHIP_SCALE 3.38 기준 — 다른 배율이면 비례해서)
  intensity: 2.2,     // 조명 세기(칸델라, 거리 제곱 감쇠)
  distance: 3.0,      // 조명이 닿는 거리(월드, 설문 기준)
  water: 0.8,         // 수면에 비치는 빛의 세기
  waterRadius: 1.1,   // 수면에 비치는 빛의 번짐 반지름(월드, 설문 기준)
  flicker: 0.12,      // 번짐의 옅은 일렁임 몫 — 두 램프가 같은 박자로 깜빡이지 않게 위상을 어긋낸다
};

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * 번짐 모양 — 가운데(r=0) → 가장자리(r=1) 거리에서의 알파(0~1). 흰색 + 이 알파로 텍스처를 만든다.
 * 텍스처는 2D 캔버스 그라데이션으로 만들지 말 것 — 캔버스는 알파를 곱해 저장하고 그라데이션에 떨림을 넣어서,
 * GPU에 올리며 다시 나누면 옅은 가장자리에서 R·G·B가 제각각 튄다(폰에서 무지개 점, 09-30). 픽셀마다 계산해 넣는다.
 */
// 등대 — 가운데 1 → 반지름 25%에서 0.55 → 가장자리 0 (직선)
export const GLOW_LIGHTHOUSE = (r) => (r >= 1 ? 0 : r < 0.25 ? 1 - 1.8 * r : 0.55 * (1 - (r - 0.25) / 0.75));
// 램프 — 가장자리가 가우시안 꼬리로 사라진다. 등대 모양을 쓰면 원 테두리에서 뚝 끊겨 "빛의 공"이 보였다.
export const GLOW_LAMP = (r) => (r >= 1 ? 0 : Math.min(1,
  (0.5 * Math.exp(-((r / 0.15) ** 2)) + 0.55 * Math.exp(-((r / 0.5) ** 2))) * (1 - smooth(0.8, 1.0, r))));

/**
 * 선체 메쉬 안의 마스트·계단 판정. 선체는 재질 하나(단색 Kapal)라 색으로 못 가르고, 좌표로 이어진 덩어리로 나눈다
 * (09-30 GLB: 덩어리 14개 — 몸통 1, 마스트 3, 계단 옆판 2, 디딤판 6, 갑판 해치 2).
 *   - 가장 큰 덩어리 = 선체 몸통
 *   - 마스트 = 몸통 윗단보다 2cm 넘게 솟은 덩어리 (기둥, 캐빈 지붕 위 가로대, 꼭대기 가로대)
 *   - 계단 옆판 = 길고 높은데 얇은 판 (길이·높이 > 0.1, 두께 < 0.02)
 *   - 계단 디딤판 = 옆판 두 장이 감싸는 상자 안에 든 나머지 덩어리
 * 단위는 배 좌표(Ship 노드 로컬, 배율 적용 전 — 배 길이 약 0.85)여야 위 문턱값이 맞는다.
 *
 * @param {ArrayLike<number>} P 인덱스를 푼(non-indexed) 삼각형 정점 좌표 xyz 나열, 배 좌표
 * @returns {{part: Float32Array, mast: number, rails: number, treads: number}}
 *   part = 정점마다 0 선체 · 1 마스트 · 2 계단 옆판 · 3 디딤판 (정점 속성 _part로 넣는다)
 */
export function markHullParts(P) {
  const nVert = P.length / 3, nTri = nVert / 3;
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
  const parent = new Int32Array(nTri).map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const firstTri = new Map();
  for (let t = 0; t < nTri; t++) for (let k = 0; k < 3; k++) {
    const kk = key(t * 3 + k);
    if (!firstTri.has(kk)) { firstTri.set(kk, t); continue; }
    const a = find(firstTri.get(kk)), b = find(t);
    if (a !== b) parent[a] = b;
  }
  const comps = new Map();
  for (let t = 0; t < nTri; t++) {
    const r = find(t);
    if (!comps.has(r)) comps.set(r, { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const c = comps.get(r);
    c.tris.push(t);
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) {
      const v = P[(t * 3 + k) * 3 + a];
      if (v < c.min[a]) c.min[a] = v;
      if (v > c.max[a]) c.max[a] = v;
    }
  }
  const list = [...comps.values()].sort((a, b) => b.tris.length - a.tris.length);
  const main = list[0], rest = list.slice(1);
  const size = (c) => [0, 1, 2].map((a) => c.max[a] - c.min[a]);
  const mast = rest.filter((c) => c.max[1] > main.max[1] + 0.02);
  const rails = rest.filter((c) => { const d = size(c); return d[0] > 0.1 && d[1] > 0.1 && Math.min(d[0], d[2]) < 0.02; });
  const bmin = [Infinity, Infinity, Infinity], bmax = [-Infinity, -Infinity, -Infinity];
  rails.forEach((c) => { for (let a = 0; a < 3; a++) { bmin[a] = Math.min(bmin[a], c.min[a] - 0.004); bmax[a] = Math.max(bmax[a], c.max[a] + 0.004); } });
  const inside = (c) => [0, 1, 2].every((a) => c.min[a] >= bmin[a] && c.max[a] <= bmax[a]);
  const treads = rails.length >= 2 ? rest.filter((c) => !rails.includes(c) && !mast.includes(c) && inside(c)) : [];
  const part = new Float32Array(nVert);
  const mark = (cs, v) => cs.forEach((c) => c.tris.forEach((t) => { part[t * 3] = part[t * 3 + 1] = part[t * 3 + 2] = v; }));
  mark(mast, 1); mark(rails, 2); mark(treads, 3);
  return { part, mast: mast.length, rails: rails.length, treads: treads.length };
}

/**
 * 램프 복제본 자리 — 마스트 가로대의 반대쪽 끝. 가로대는 배 폭 방향(z)이다.
 * 램프 고리 높이(램프 노드 원점 y)에서 조금 위까지, 램프와 같은 x 근처의 선체 정점을 모아 가로대 z 범위를 잰다.
 * 09-30 GLB: 가로대 z −0.062 ~ +0.047, 램프 +0.036 → 복제본 −0.051.
 * @param {ArrayLike<number>} P 선체 정점 xyz 나열(배 좌표)
 * @param {{x:number,y:number,z:number}} lampPos 램프 노드 위치(배 좌표)
 * @returns {{z:number, ok:boolean}} ok=false면 가로대를 못 찾아 배 중심선(z=0) 대칭으로 물러난 값
 */
export function lampTwinZ(P, lampPos) {
  let zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (y < lampPos.y - 0.005 || y > lampPos.y + 0.03 || Math.abs(x - lampPos.x) > 0.03) continue;
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
  }
  const ok = zMax > zMin && lampPos.z > zMin && lampPos.z < zMax;
  const mid = ok ? (zMin + zMax) / 2 : 0;
  return { z: 2 * mid - lampPos.z, ok };
}
