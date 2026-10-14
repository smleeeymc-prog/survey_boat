/* =============================================================================
 * motion.js — 배를 어디에 놓고 어떻게 움직일지.
 *
 * ── 흐름 ──────────────────────────────────────────────────────────────────
 * 배는 전부 같은 방향으로, 같은 속도로 흐른다. 화면 한쪽 끝에서 나타나 반대쪽으로
 * 빠지고, 띠 폭을 다 지나면 반대편 끝으로 감겨 다시 들어온다.
 *
 * 속도를 하나로 통일한 건 겉보기보다 중요한 결정이다.
 *   · 상대 위치가 절대 변하지 않는다 → 처음 한 번 안 겹치게 놓으면 영원히 안 겹친다
 *   · 감기는 것도 정확히 띠 폭만큼이라(토러스) 감긴 뒤에도 그 성질이 유지된다
 *   · 깊이마다 속도를 달리 주면 원근이 사라져 평면 스크롤처럼 보인다
 * 대신 가까운 배는 화면을 빨리, 먼 배는 천천히 지나간다 — 그게 깊이감이다.
 *
 * ── 겹침 방지 ──────────────────────────────────────────────────────────────
 * 새 배는 놓일 때 이웃과의 간격을 직접 재서 자리를 고른다(arrivalSlot). 모두 같이 흐르니 그 간격이 영원히 간다.
 * 난수는 record_id 에서 — 같은 데이터면 새로고침해도 바다 모양이 같다(전시 중 재시작에 중요하다).
 * poissonRect 는 "띠가 정원만큼의 배를 최소 간격으로 품을 수 있나"를 재는 데만 쓴다(selfcheck 6).
 *
 * ── 상태별 움직임은? ───────────────────────────────────────────────────────
 * 지금은 흐름 하나뿐이다. 상태에 따라 자리를 나누던 띠 배치는 시안 단계에 뺐다
 * (배의 모습 채널은 style.js — 키워드 요소·배 색·소품 칠·고양이 무늬). 상태별 움직임을 넣으려면
 * world.js tick 의 배 좌표(latticeX)에 분기를 넣거나, 깊이·속도 배수를 style.js가 정하게 하면 된다.
 *
 * ── 시계 ──────────────────────────────────────────────────────────────────
 * [10-14] 흐름은 벽시계를 따른다(clockFlow). 기록마다 "쓰인 순간 화면 왼쪽의 빈 곳"을
 * 받으므로(arrivalSlot) 전시 화면·둘러보기·새로고침 어디서 열어도 같은 배가 같은 데 떠 있고,
 * 새 배는 늘 왼쪽에서 떠오른다. 예전엔 화면을 켤 때마다 흐름을 0부터 세고 섞어 둔 순서대로 자리를 줘서
 * 두 화면이 서로 달랐다.
 * ========================================================================== */

import {
  FLOW_CORRIDOR_W, FLOW_DIR, FLEET_MIN_GAP, FLOW_EPOCH,
  CAM_FOV, CAM_HEIGHT, STAGE_ASPECT, ARRIVAL_CLEAR, ARRIVAL_TRIES,
  ARRIVAL_DEPTH_MIN, ARRIVAL_DEPTH_MAX, ARRIVAL_X_MIN, ARRIVAL_X_MAX,
} from "./config.js";

const STAGE_TAN_HALF = Math.tan((CAM_FOV * Math.PI) / 360);

/** 띠 폭을 주기로 좌표를 접는다. 토러스라 정확히 폭만큼 옮겨야 간격이 유지된다. */
export function wrapCorridor(x) {
  const W = FLOW_CORRIDOR_W;
  return x - W * Math.round(x / W);
}

/**
 * 벽시계 시각 tSec(초)에 흐름이 띠를 민 거리(접은 값). 같은 시각이면 어느 화면에서든 같은 값이다.
 * 한 바퀴 시간으로 먼저 접고 곱한다 — 그냥 곱하면 값이 수억이 돼 소수점이 뭉개진다.
 */
export function clockFlow(tSec, speed) {
  if (!(speed > 0)) return 0;
  const period = FLOW_CORRIDOR_W / speed;
  const e = tSec - FLOW_EPOCH;
  return wrapCorridor(FLOW_DIR * speed * (e - period * Math.floor(e / period)));
}

/** 그 깊이에서 9:16 무대 화면의 가로 절반(월드) — camera.js frameHalfWidthAt 과 같은 식을 기기와 상관없이 */
export function stageHalfWidthAt(depth) {
  return Math.hypot(depth, CAM_HEIGHT) * STAGE_TAN_HALF * STAGE_ASPECT;
}

/** 고정 시드 난수 (mulberry32). 같은 시드면 언제나 같은 수열. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 → 32비트 정수. 기록마다 "성격"(색·소품·위상)을 고정하는 데 쓴다. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * 직사각형 안에 최소 간격 minGap을 지키는 점들을 뽑는다 (Bridson 푸아송 디스크).
 * 격자 셀 한 변을 minGap/√2로 잡으면 셀 하나에 점이 최대 하나라, 이웃 몇 칸만
 * 봐도 최소 간격을 보장할 수 있다 — 전수 비교(O(n²))를 피하는 표준 트릭.
 *
 * x는 흐름 방향(띠 폭), y는 깊이(카메라에서의 거리)다.
 *
 * x축은 원통처럼 감긴다. 배는 띠 끝에 닿으면 반대편 끝으로 넘어가므로, 이음매를
 * 보지 않고 뽑으면 x=0.2 인 자리와 x=79.8 인 자리가 "79.6 떨어져 있다"고 판정된다.
 * 실제로는 0.6이다 — 그래서 예전에는 바다 어딘가에 배 두 척이 겹쳐 떠 있었다
 * (실측 간격 1.94, 목표 4.4). 거리도 이웃 탐색도 접어서 센다.
 */
export function poissonRect(w, h, minGap, rng, tries = 24) {
  const cell = minGap / Math.SQRT2;
  const gw = Math.ceil(w / cell);          // 감기려면 격자 폭도 딱 한 바퀴여야 한다
  const gh = Math.ceil(h / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const wrapX = (x) => x - w * Math.floor(x / w);
  const dxTorus = (a, b) => { const d = a - b; return d - w * Math.round(d / w); };
  const gi = (x, y) => Math.floor(x / cell) + gw * Math.floor(y / cell);

  const fits = (x, y) => {
    if (y < 0 || y >= h) return false;      // x는 감기므로 범위를 벗어날 수가 없다
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    // 가로로 ±3칸을 보는 건 마지막 칸이 w/cell 나머지만큼 좁을 수 있기 때문이다.
    // 좁은 칸을 사이에 두면 ±2로는 minGap 안의 점을 놓칠 수 있다.
    for (let j = Math.max(0, cy - 2); j <= Math.min(gh - 1, cy + 2); j++) {
      for (let di = -3; di <= 3; di++) {
        const i = (((cx + di) % gw) + gw) % gw;
        const k = grid[i + gw * j];
        if (k < 0) continue;
        const dx = dxTorus(pts[k].x, x), dy = pts[k].y - y;
        if (dx * dx + dy * dy < minGap * minGap) return false;
      }
    }
    return true;
  };
  const push = (x, y) => { grid[gi(x, y)] = pts.length; pts.push({ x, y }); active.push(pts.length - 1); };

  push(rng() * w, rng() * h);
  while (active.length) {
    const ai = (rng() * active.length) | 0;
    const p = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < tries; t++) {
      const ang = rng() * Math.PI * 2;
      const r = minGap * (1 + rng());            // [minGap, 2·minGap) 고리 안에서만 시도
      const x = wrapX(p.x + Math.cos(ang) * r), y = p.y + Math.sin(ang) * r;
      if (!fits(x, y)) continue;
      push(x, y); placed = true; break;
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}

/**
 * 새 기록의 자리(띠 좌표 x0 · 깊이). 그 기록이 쓰인 순간(phase — 그때 흐름이 민 거리, clockFlow) 화면 왼쪽
 * 등장 구역(깊이 ARRIVAL_DEPTH_MIN~MAX · 그 깊이 9:16 화면 반폭의 ARRIVAL_X_MIN~MAX)에서 이웃과 먼 곳을 고른다.
 *   1. 최소 간격 FLEET_MIN_GAP 을 먼저 지키고  2. 그다음 줌 화면에 이웃이 덜 잡히게(ARRIVAL_CLEAR 타원)
 * 구역 안에서 ARRIVAL_TRIES 번 뽑아 보고 둘 다 만족하는 첫 자리, 없으면 가장 나은 자리.
 * 배는 전부 같이 흐르니(토러스) 한 번 벌어진 간격은 영원히 그대로다 — 언제 재도 같다.
 * 난수는 record_id 에서, 이웃은 그때 떠 있던 배 — 같은 기록·같은 차례면 어느 화면에서든 같은 자리가 나온다.
 *
 * [10-14] 처음엔 미리 뽑은 푸아송 자리(116개)에서 골랐는데, 80척이 떠 있으면 등장 구역을 지나는 빈 자리가
 * 없는 때가 절반이라(모의 실험 2000건 중 1005건) 새 배가 왼쪽이 아닌 데 떴다. 직접 고르면 늘 구역 안이고,
 * 간격은 같은 모의 실험에서 99.5%가 2.0 이상(배 길이 1.3 — 안 겹친다).
 * @param {{slot: {x0: number, depth: number}}[]} boats 지금 떠 있는 배
 * @param {number} phase
 * @param {() => number} rng
 */
export function arrivalSlot(boats, phase, rng) {
  let best = null, bestScore = -Infinity;
  for (let n = 0; n < ARRIVAL_TRIES; n++) {
    const depth = ARRIVAL_DEPTH_MIN + rng() * (ARRIVAL_DEPTH_MAX - ARRIVAL_DEPTH_MIN);
    const x = stageHalfWidthAt(depth) * (ARRIVAL_X_MIN + rng() * (ARRIVAL_X_MAX - ARRIVAL_X_MIN));
    let gap = Infinity, ell = Infinity;
    for (const b of boats) {
      const dx = wrapCorridor(x - b.slot.x0 - phase), dz = depth - b.slot.depth;
      const g = Math.hypot(dx, dz);
      if (g < gap) gap = g;
      const e = Math.hypot(dx / ARRIVAL_CLEAR.x, dz / ARRIVAL_CLEAR.z);
      if (e < ell) ell = e;
    }
    const score = Math.min(1, gap / FLEET_MIN_GAP) * 2 + Math.min(1, ell);
    if (score > bestScore) { bestScore = score; best = { x0: wrapCorridor(x - phase), depth }; }
    if (score >= 3) break;
  }
  return best;
}

/**
 * 기록 하나를 "배"로 만든다. 흔들림의 위상 같은 개성은 record_id에서 유도해서
 * 같은 기록이면 언제 다시 켜도 같은 움직임을 갖게 한다.
 */
export function makeBoat(record, slot, startX) {
  const rng = makeRng(hashSeed(String(record.record_id)));
  return {
    record,
    slot,
    // 지금 가로 좌표. 매 프레임 자리 + 흐름이 민 거리로 다시 쓴다(world.js latticeX) — 배는 자리를 떠나지 않는다.
    x: startX !== undefined ? startX : slot.x0,
    z: slot.depth,
    // 뱃머리는 진행 방향. 파도에 따라 아주 조금씩만 흔들린다.
    heading: FLOW_DIR > 0 ? 0 : Math.PI,
    yawPhase: rng() * Math.PI * 2,
    yawAmp: 0.04 + rng() * 0.05,
    yawSpeed: 0.08 + rng() * 0.10,
    // 등장 연출 상태. 'approach' → 'hold' → 'return' → null
    // (main.js의 _updateArrival. 'return'부터 다시 흐르기 시작한다)
    phase: null,
    phaseT: 0,
  };
}

/**
 * 뱃머리 흔들림. 흐름이 늦춰져 거의 서 있는 배도 이건 계속 돌려야 한다 —
 * 완전히 굳어 있으면 바다 위에서 혼자 죽은 물체로 보인다.
 */
export function swayBoat(b, t) {
  const base = FLOW_DIR > 0 ? 0 : Math.PI;
  b.heading = base + Math.sin(t * b.yawSpeed + b.yawPhase) * b.yawAmp;
}
