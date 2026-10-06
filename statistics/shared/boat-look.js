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

/* ── 배 색 (설문 Ⅵ 색 단계, 10-06) ─────────────────────────────────────────────
 * 색 값은 둘 중 하나: 팔레트 id(survey-taxonomy.js BOAT_COLORS — 보안 규칙과 묶여 있다) 또는 "#rrggbb"(컬러휠).
 *
 *   팔레트·컬러휠 모두  기본 배에서 고른 색 쪽으로 채도·밝기를 일부만 옮겨 띤다(seenTarget). 볕 받는 면은 눈에 더 밝게 읽혀서
 *            이렇게 옮긴 배가 동그라미와 비슷하게 보이고, 원색을 골라도 지도 톤에 맞는다. 휠의 아주 쨍한·밝은 색은 팔레트가 닿는
 *            범위 위에서 한 번 더 눌린다(SEEN_C_* · SEEN_L_*). 그 부분이 낼 수 없는 색은 낼 수 있는 데까지(fitSeen).
 *            재질: 팔레트는 표(PAINT_TABLE), 휠은 응답 격자(PAINT_LUT)를 거꾸로 읽어 푼다.
 *   원톤     갑판은 "사진 전체에 색조·채도를 건 것처럼" 선체를 따라 물든다(deckSeenForHull). deck = "auto".
 *   투톤     선체·갑판을 각각. 갑판 'base' = 지금 갑판 그대로.
 *
 * "보이는 색"은 설문 색 단계 화면(낮)에서 그 부분 픽셀 중 휘도 50~75% 띠의 평균이다(그늘·판자 이음매와 광택 반사를 뺀 볕 받는 면).
 * 조명이 다른 화면(지도)은 표·곡선을 자기 조명에서 다시 잴 것(HANDOFF-map 26장).
 * 재질 함수가 돌려주는 null 은 "건드리지 말고 원래 재질 색 그대로"다(기본).
 */
export const PAINT_RENDER_GAIN = 0.64;
// 기본 배가 색 단계 화면(낮)에서 보이는 색 — 선체·갑판 픽셀 중 휘도 50~75% 띠의 평균 실측(10-06).
// 그늘·판자 이음매(아래)와 광택·하늘 반사(위)를 뺀, 볕 받는 면의 제 색이다. 팔레트 '기본' 동그라미도 이 색.
export const BASE_HULL_SEEN = 0x483431;
export const BASE_DECK_SEEN = 0x835e4f;
// 동그라미 색 → 배가 실제로 띨 색. 기본 배는 화면에서 채도 0.19 남짓으로 꽤 차분한데(눈엔 밤색으로 읽힌다),
// 동그라미(채도 0.4~0.55)를 그대로 따라가면 배만 장난감처럼 쨍하게 뜬다 — 처음 시도에서 그랬다.
// 그래서 기본 배에서 동그라미 쪽으로 채도는 55%, 밝기는 85%만 옮긴다(OKLCH). 색조는 동그라미 그대로.
const SEEN_SAT_K = 0.55, SEEN_LIGHT_K = 0.85;
// 컬러휠 원색은 위 비율로 옮겨도 팔레트보다 훨씬 쨍하다(빨강 원색 채도 0.155 — 팔레트는 0.087까지). 팔레트가 닿는 곳(무릎) 위로는
// 부드럽게 눌러 상한에 붙인다. 팔레트는 무릎 아래라 거의 그대로다.
const SEEN_C_KNEE = 0.08, SEEN_C_CAP = 0.10;
const SEEN_L_KNEE = 0.55, SEEN_L_CAP = 0.60;
const softCap = (x, knee, cap) => (x <= knee ? x : knee + (cap - knee) * Math.tanh((x - knee) / (cap - knee)));
// 원톤 갑판(OKLCH): 색조는 선체가 옮겨 간 만큼 그대로 옮기고, 채도는 선체 채도가 늘어난 비율을 따르되 1.4배·0.09에서 멈춘다
// (그 이상이면 판자가 형광으로 뜬다 — HSL로 한 처음 세 번이 그랬다). 선체가 회색에 가까우면(검정) 갑판도 회색 나무.
// 밝기는 선체 밝기 차의 60%만 더하고 0.62에서 멈춘다(OKLab L).
const DECK_SAT_RATIO_MAX = 1.4, DECK_SAT_MAX = 0.09;
const DECK_LIGHT_FOLLOW = 0.6, DECK_LIGHT_MAX = 0.62;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// OKLCH — 눈에 고른 색 공간. HSL 채도는 색마다 쨍한 정도가 달라서(같은 0.38이라도 초록·보라는 형광으로 뜬다)
// 채도 계산은 여기서 한다. L 밝기 0~1 · C 채도(대략 0~0.32) · h 색조(도).
const sLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const sGam = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function hexToOklch(hex) {
  const r = sLin(((hex >> 16) & 255) / 255), g = sLin(((hex >> 8) & 255) / 255), b = sLin((hex & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}
function oklchToHex({ L, C, h }) {
  const A = C * Math.cos(h * Math.PI / 180), B = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const to = (v) => Math.max(0, Math.min(255, Math.round(sGam(clamp01(v)) * 255)));
  return (to(r) << 16) | (to(g) << 8) | to(b);
}
/** 화면 색 → 재질 색 (채널마다 GAIN 으로 나누고 1에서 자른다) */
function seenToMaterial(hex) {
  const ch = (k) => Math.min(255, Math.round((((hex >> k) & 255) / PAINT_RENDER_GAIN)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * 설문 색 단계(낮) 조명에서 재서 푼 재질 색 — 배가 띨 목표색(seenTarget·deckSeenForHull)이 그 부분 픽셀(휘도 50~75% 띠의
 * 평균)이 되도록 렌더 → 재기 → 고치기를 여섯 번 되풀이했다(10-06, 고정 자세 SNAP_POSE, 오차 0~3 / 255 —
 * 진남·자두 투톤 갑판만 12·7: 어두운 갑판은 이음매가 밝은 선으로 바뀌어(woodSeamTone) 재는 띠에 섞인다).
 * 표가 우선이고, 표에 없는 id(팔레트에 새로 더한 색)는 아래 PAINT_RENDER_GAIN 식으로 어림한다.
 * 팔레트 hex·SEEN_*·DECK_* 를 바꾸면 이 표를 다시 풀 것:  node tools/calibrate-paint.mjs (설문 HANDOFF.md 6.25)
 *   hull 선체 · deckAuto 원톤 갑판(선체를 따라 물든 색) · deck 투톤 갑판
 */
export const PAINT_TABLE = {
  red:     { hull: 0xd35b3e, deckAuto: 0xdb8c66, deck: 0xcb4d29 },
  orange:  { hull: 0xe08056, deckAuto: 0xe09f67, deck: 0xcd7040 },
  yellow:  { hull: 0xcfa95c, deckAuto: 0xc0b05a, deck: 0xbb943d },
  green:   { hull: 0x94882e, deckAuto: 0x99b56b, deck: 0x867e25 },
  blue:    { hull: 0x4278b8, deckAuto: 0x859ae0, deck: 0x456fa6 },
  navy:    { hull: 0x2b3d73, deckAuto: 0x8279c1, deck: 0x101361 },
  purple:  { hull: 0x933c6b, deckAuto: 0xd07087, deck: 0x852458 },
  black:   { hull: 0x2f1d34, deckAuto: 0x976983, deck: 0x1a0313 },
};

/** 동그라미 색 → 그 부분(기본 색 base)이 띨 화면 색 — 위 SEEN_* 만큼만 옮긴다 */
export function seenTarget(padHex, baseSeen) {
  const p = hexToOklch(padHex), b = hexToOklch(baseSeen);
  return oklchToHex({
    h: p.h,
    C: softCap(Math.max(0, b.C + (p.C - b.C) * SEEN_SAT_K), SEEN_C_KNEE, SEEN_C_CAP),
    L: softCap(clamp01(b.L + (p.L - b.L) * SEEN_LIGHT_K), SEEN_L_KNEE, SEEN_L_CAP),
  });
}

/**
 * 응답 격자 — 재질 색을 채널마다 PAINT_LUT_LEVELS 다섯 단계로 바꿔 가며(5×5×5) 칠했을 때 보이는 색(0xRRGGBB), 빨강이 가장 바깥 순.
 * 컬러휠 색을 재질로 풀 때 이 격자를 사이값으로 읽어 거꾸로 푼다(materialFromSeen). 채널별 곡선 하나로는 안 됐다 —
 * 보이는 색이 세 채널에 같이 걸려 있어(재는 밝기 띠·톤 매핑) 오차가 최대 47이었다. tools/calibrate-paint.mjs 가 같이 잰다.
 */
export const PAINT_LUT_LEVELS = [0, 64, 128, 192, 255];
export const PAINT_LUT = {
  hull: [
    0x252929, 0x252938, 0x252a56, 0x252a7a, 0x252aa1,
    0x233b2a, 0x233b3b, 0x233b5e, 0x233b86, 0x233bb0,
    0x285b2b, 0x285b3d, 0x295a5b, 0x2a5a7a, 0x2a5a99,
    0x247c2a, 0x247c3b, 0x247d58, 0x237d7b, 0x237d9f,
    0x1ea520, 0x1ea533, 0x1ea555, 0x1ea57a, 0x1ea5a0,
    0x342929, 0x342939, 0x35285a, 0x362884, 0x3627ad,
    0x363a27, 0x363a3a, 0x363a5e, 0x363a85, 0x363aab,
    0x37592c, 0x37593c, 0x365959, 0x355a7b, 0x355a9d,
    0x357c28, 0x347c39, 0x347d57, 0x337d7a, 0x327d9f,
    0x31a41f, 0x32a433, 0x32a455, 0x32a47a, 0x31a4a0,
    0x582526, 0x58253a, 0x57255d, 0x572585, 0x5725ae,
    0x573925, 0x553938, 0x543958, 0x533a7b, 0x533a9e,
    0x545826, 0x545837, 0x525858, 0x50597b, 0x50599e,
    0x537c20, 0x537c32, 0x537c53, 0x537c79, 0x537c9f,
    0x53a31e, 0x53a331, 0x53a353, 0x53a379, 0x53a39e,
    0x7a2424, 0x7c2336, 0x7e225a, 0x7e2281, 0x7d23a9,
    0x773724, 0x783735, 0x783755, 0x77387a, 0x77389f,
    0x70592c, 0x71593c, 0x735858, 0x73587a, 0x75589e,
    0x797c1d, 0x797c31, 0x797c52, 0x797c78, 0x797c9f,
    0x79a41e, 0x79a431, 0x7aa454, 0x7aa479, 0x7aa49f,
    0xa42525, 0xa42538, 0xa3255b, 0xa12682, 0x9d28a6,
    0x963a29, 0x953b3a, 0x963b58, 0x973b7a, 0x933c9d,
    0x97592a, 0x98593a, 0x9b5957, 0x9b587b, 0x9d589f,
    0xa07e1f, 0xa07e33, 0xa07e55, 0xa07e7a, 0xa07ea0,
    0x9ea425, 0x9ea43b, 0x9ca460, 0x9ca481, 0x9ba4a3,
  ],
  deck: [
    0x243842, 0x243851, 0x24396e, 0x24398d, 0x2439ae,
    0x234b44, 0x234b54, 0x234b70, 0x234b90, 0x234bb1,
    0x216b43, 0x206b54, 0x206b71, 0x206b94, 0x1e6bbd,
    0x1c972b, 0x1c9741, 0x1d9768, 0x1f9693, 0x2196bd,
    0x22c030, 0x21c043, 0x23c068, 0x24bf91, 0x24bfba,
    0x373641, 0x373650, 0x37356d, 0x37358f, 0x3734b2,
    0x38473c, 0x38464d, 0x38466d, 0x384692, 0x3845b9,
    0x366a3c, 0x366a4e, 0x356a6f, 0x356a95, 0x366abb,
    0x379529, 0x38953f, 0x389567, 0x399491, 0x3b94ba,
    0x3cbe2f, 0x3cbe43, 0x3cbe67, 0x3cbe90, 0x3dbdb8,
    0x64262a, 0x64253e, 0x652566, 0x652495, 0x6524c4,
    0x653d27, 0x653d3e, 0x653d66, 0x653d94, 0x633dc0,
    0x62672a, 0x5f6741, 0x5e6666, 0x5e6690, 0x5e66b9,
    0x62912c, 0x639140, 0x639165, 0x64918c, 0x6491b3,
    0x61bb2e, 0x61bb41, 0x61bc64, 0x61bb8d, 0x61bbb6,
    0x952427, 0x95233e, 0x952366, 0x952394, 0x9523c2,
    0x953d27, 0x903e40, 0x8c3f68, 0x874092, 0x8143b8,
    0x8a662d, 0x896742, 0x8b6666, 0x8c668e, 0x8d66ba,
    0x8c912e, 0x8c9241, 0x8c9266, 0x8c9390, 0x8b93b8,
    0x8aba3f, 0x8bbb4f, 0x8cbb6c, 0x8cbc91, 0x8dbcb8,
    0xc32428, 0xc4243e, 0xc52466, 0xc62395, 0xc225c2,
    0xab4336, 0xa7444c, 0xaa446c, 0xac4393, 0xb042bc,
    0xbe6728, 0xbe673e, 0xbe6766, 0xbc6891, 0xba69bc,
    0xb89431, 0xb99444, 0xb89469, 0xb89491, 0xb894b9,
    0xb6be38, 0xb7be4a, 0xb7be6d, 0xb7be93, 0xb7beb9,
  ],
};

/** 원톤 갑판 — 기본 선체→고른 선체의 색조·채도·밝기 변화를 기본 갑판에 그대로 (화면 색 기준, 결과도 화면 색) */
export function deckSeenForHull(hullSeen, baseHullSeen = BASE_HULL_SEEN, baseDeckSeen = BASE_DECK_SEEN) {
  const b = hexToOklch(baseHullSeen), t = hexToOklch(hullSeen), d = hexToOklch(baseDeckSeen);
  const h = (((d.h + (t.h - b.h)) % 360) + 360) % 360;
  const C = Math.min(DECK_SAT_MAX, d.C * Math.min(DECK_SAT_RATIO_MAX, b.C > 1e-3 ? t.C / b.C : 1));
  const L = Math.max(0.2, Math.min(DECK_LIGHT_MAX, d.L + (t.L - b.L) * DECK_LIGHT_FOLLOW));
  return oklchToHex({ L, C, h });   // 갑판이 낼 수 있는 범위로 맞추는 건 paintSeen(fitSeen)이 한다
}

export const COLOR_HEX_RE = /^#[0-9a-f]{6}$/;
const hexNum = (h) => parseInt(String(h).slice(1), 16);

/**
 * 그 부분이 띨 화면 색. value = 팔레트 id | "#rrggbb", part = "hull" | "deck". 기본('base'·빈 값)이면 null.
 * 팔레트·컬러휠 같은 식(seenTarget) — 팔레트는 고르기 쉽게 미리 골라 둔 동그라미일 뿐이다.
 */
export function paintTarget(value, part, palette, pure = false) {
  if (!value || value === "base") return null;
  let pad = null;
  if (COLOR_HEX_RE.test(value)) pad = hexNum(value);
  else { const c = (palette || []).find((x) => x.id === value); if (c && c.id !== "base") pad = hexNum(c.hex); }
  if (pad === null) return null;
  // 원색 그대로(시험, 10-06 사용자): 고른 색을 누르지 않고 그대로 띤다
  return pure ? pad : seenTarget(pad, part === "deck" ? BASE_DECK_SEEN : BASE_HULL_SEEN);
}

/** 원색 그대로일 때 원톤 갑판 — 선체와 같은 색조·채도, 밝기만 기본 배처럼 갑판이 한 톤 밝게(판자가 선체와 구별되게) */
function deckPureForHull(hullSeen) {
  const o = hexToOklch(hullSeen), b = hexToOklch(BASE_HULL_SEEN), d = hexToOklch(BASE_DECK_SEEN);
  return oklchToHex({ h: o.h, C: o.C, L: clamp01(o.L + (d.L - b.L)) });
}

/**
 * 그 부분이 낼 수 있는 범위로 — 재질을 흰색(1,1,1)으로 칠해도 보이는 색은 격자의 마지막 칸만큼이 한계다(선체 빨강 154 남짓).
 * 넘는 채널이 있으면 세 채널을 같은 비율로 낮춘다(색조 유지). 컬러휠의 밝은 노랑·분홍이 여기서 걸린다.
 */
function fitSeen(part, hex) {
  const L = PAINT_LUT[part];
  if (!L || hex === null) return hex;
  const ch = (v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  const max = ch(L[L.length - 1]).map((v) => v * 0.97);
  let c = ch(hex);
  const k = Math.min(1, ...c.map((v, i) => max[i] / Math.max(1, v)));
  c = c.map((v) => Math.round(v * k));
  let out = (c[0] << 16) | (c[1] << 8) | c[2];
  // 어두운 쪽 한계 — 재질을 검정으로 칠해도 하늘 반사·주변광이 남아 아주 어두운 색은 못 낸다(컬러휠의 검정).
  // 팔레트 먹색(#2c2b30, OKLab L 0.28)은 맞춰지므로 밝기 0.26 밑으로는 내리지 않는다(색조·채도는 그대로).
  const o = hexToOklch(out);
  if (o.L < SEEN_L_MIN) out = oklchToHex({ ...o, L: SEEN_L_MIN });
  return out;
}
const SEEN_L_MIN = 0.26;

/** 선체·갑판이 띨 화면 색 → { hull, deck } (null = 기본). deckValue "auto" = 원톤. opts.pure = 원색 그대로(시험) */
export function paintSeen(hullValue, deckValue, palette, opts = {}) {
  const pure = !!opts.pure;
  const hull = fitSeen("hull", paintTarget(hullValue, "hull", palette, pure));
  const deck = deckValue === "auto" || deckValue === undefined
    ? (hull === null ? null : fitSeen("deck", pure ? deckPureForHull(hull) : deckSeenForHull(hull)))
    : fitSeen("deck", paintTarget(deckValue, "deck", palette, pure));
  return { hull, deck };
}

/** 응답 격자 앞으로 읽기 — 재질 [r,g,b](0~255) → 보이는 [r,g,b] (세 방향 사이값) */
function lutForward(L, m) {
  const G = PAINT_LUT_LEVELS, n = G.length;
  const cell = (v) => { let i = 0; while (i < n - 2 && v > G[i + 1]) i++; return [i, Math.max(0, Math.min(1, (v - G[i]) / (G[i + 1] - G[i])))]; };
  const [ri, rt] = cell(m[0]), [gi, gt] = cell(m[1]), [bi, bt] = cell(m[2]);
  const out = [0, 0, 0];
  for (let dr = 0; dr < 2; dr++) for (let dg = 0; dg < 2; dg++) for (let db = 0; db < 2; db++) {
    const w = (dr ? rt : 1 - rt) * (dg ? gt : 1 - gt) * (db ? bt : 1 - bt);
    if (!w) continue;
    const v = L[((ri + dr) * n + (gi + dg)) * n + (bi + db)];
    out[0] += w * ((v >> 16) & 255); out[1] += w * ((v >> 8) & 255); out[2] += w * (v & 255);
  }
  return out;
}
const linC = (v) => sLin(Math.max(0, Math.min(255, v)) / 255);
const gamC = (v) => Math.round(sGam(clamp01(v)) * 255);

/**
 * 화면 색(hex) → 재질 색. 응답 격자를 거꾸로 — 도구(calibrate-paint)가 렌더로 하던 "칠해 보고 재서 고치기"를 격자 위에서 되풀이한다.
 * 낼 수 없는 색(격자 밖)은 가장 가까운 곳에서 멈춘다.
 */
export function materialFromSeen(part, seenHex) {
  const L = PAINT_LUT[part];
  if (!L) return seenToMaterial(seenHex);
  const T = [(seenHex >> 16) & 255, (seenHex >> 8) & 255, seenHex & 255];
  let m = T.map((v) => Math.min(255, v / PAINT_RENDER_GAIN));
  for (let it = 0; it < 12; it++) {
    const f = lutForward(L, m);
    m = m.map((v, k) => gamC(linC(v) * (linC(T[k]) + 1e-4) / (linC(f[k]) + 1e-4)));
  }
  return (m[0] << 16) | (m[1] << 8) | m[2];
}

/**
 * 고른 색 → 재질 색 { hull, deck } (null = 원래 재질 그대로). 팔레트 id 는 표, 컬러휠·원색 그대로는 응답 격자.
 */
export function paintMaterials(hullValue, deckValue, palette, opts = {}) {
  const T = opts.pure ? {} : PAINT_TABLE;   // 표는 누른 목표색에 맞춰 푼 것이라 원색 그대로엔 격자로
  const seen = paintSeen(hullValue, deckValue, palette, opts);
  const auto = deckValue === "auto" || deckValue === undefined;
  const hull = seen.hull === null ? null : (T[hullValue] ? T[hullValue].hull : materialFromSeen("hull", seen.hull));
  let deck = null;
  if (seen.deck !== null) {
    if (auto) deck = T[hullValue] ? T[hullValue].deckAuto : materialFromSeen("deck", seen.deck);
    else deck = T[deckValue] ? T[deckValue].deck : materialFromSeen("deck", seen.deck);
  }
  return { hull, deck };
}

/* ── 나머지 부분도 톤에 맞춘다 (10-06 사용자) ─────────────────────────────────
 *   원톤  캐빈 벽·굴뚝 받침·마스트·계단 — 선체가 기본에서 옮겨 간 만큼 색조를 옮기고 채도는 비율로, **밝기는 그대로**.
 *         캐빈 지붕은 갑판과 같은 색.
 *   투톤  선체 묶음 = 선체 · 캐빈 벽 · 굴뚝 받침,  갑판 묶음 = 갑판 · 계단 · 마스트 · 캐빈 지붕(= 갑판 색).
 * 재질 색에 바로 건다(밝기를 지키므로 눈금 표가 필요 없다). 원색 그대로(시험)는 색조·채도를 고른 색 그대로 쓴다.
 */
const TINT_RATIO_MAX = 1.4, TINT_C_MAX = 0.12;
export function tintKeepLight(baseMat, fromSeen, toSeen, pure = false) {
  const e = hexToOklch(baseMat), f = hexToOklch(fromSeen), t = hexToOklch(toSeen);
  const h = pure ? t.h : (((e.h + (t.h - f.h)) % 360) + 360) % 360;
  const C = pure ? t.C : Math.min(TINT_C_MAX, e.C * Math.min(TINT_RATIO_MAX, f.C > 1e-3 ? t.C / f.C : 1));
  return oklchToHex({ L: e.L, C, h });
}

/**
 * 배 전체의 재질 색 — { hull, deck, cabin, funnelStep, mast, stairRail, stairTread, cabinRoof } (null = 원래 그대로).
 * 화면(설문 씬)은 이것만 부르면 된다. 지도도 같은 식으로 나머지 부분을 칠할 수 있다(HANDOFF-map 26).
 */
export function paintParts(hullValue, deckValue, palette, opts = {}) {
  const pure = !!opts.pure;
  const auto = deckValue === "auto" || deckValue === undefined;
  const seen = paintSeen(hullValue, deckValue, palette, opts);
  const mats = paintMaterials(hullValue, deckValue, palette, opts);
  const P = BOAT_PAINT;
  const tint = (base, from, to) => (to === null ? null : tintKeepLight(base, from, to, pure));
  const deckFrom = auto ? BASE_HULL_SEEN : BASE_DECK_SEEN, deckTo = auto ? seen.hull : seen.deck;
  return {
    hull: mats.hull, deck: mats.deck,
    cabin: tint(P.cabin, BASE_HULL_SEEN, seen.hull),
    funnelStep: tint(P.funnelStep, BASE_HULL_SEEN, seen.hull),
    mast: tint(P.mast, deckFrom, deckTo),
    stairRail: tint(P.stairRail, deckFrom, deckTo),
    stairTread: tint(P.stairTread, deckFrom, deckTo),
    cabinRoof: mats.deck,
  };
}

