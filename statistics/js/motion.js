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
 * 푸아송 디스크 샘플링(Bridson)을 원반이 아니라 직사각형 띠에 돌린다. 난수는 고정
 * 시드라 같은 데이터면 새로고침해도 바다 모양이 같다(전시 중 재시작에 중요하다).
 *
 * ── 상태별 움직임은? ───────────────────────────────────────────────────────
 * [시안 단계] 지금은 흐름 하나뿐이다. 어떤 답변이 배의 무엇을 바꿀지가 아직
 * 확정되지 않아서(config.js의 STYLE_SOURCE 참고), 상태에 따라 자리를 나누던 띠
 * 배치는 잠시 뺐다. 확정되면 여기 stepBoat에 분기를 넣거나, 깊이·속도 배수를
 * style.js가 정하게 하면 된다.
 * ========================================================================== */

import {
  FLOW_CORRIDOR_W, FLOW_DEPTH_MIN, FLOW_DEPTH_MAX, FLOW_DIR, FLEET_MIN_GAP,
} from "./config.js";

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
 * 격자 셀 한 변을 minGap/√2로 잡으면 셀 하나에 점이 최대 하나라, 이웃 5×5 셀만
 * 봐도 최소 간격을 보장할 수 있다 — 전수 비교(O(n²))를 피하는 표준 트릭.
 *
 * x는 흐름 방향(띠 폭), y는 깊이(카메라에서의 거리)다.
 */
export function poissonRect(w, h, minGap, rng, tries = 24) {
  const cell = minGap / Math.SQRT2;
  const gw = Math.ceil(w / cell) + 1;
  const gh = Math.ceil(h / cell) + 1;
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];
  const gi = (x, y) => Math.floor(x / cell) + gw * Math.floor(y / cell);

  const fits = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let j = Math.max(0, cy - 2); j <= Math.min(gh - 1, cy + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(gw - 1, cx + 2); i++) {
        const k = grid[i + gw * j];
        if (k < 0) continue;
        const dx = pts[k].x - x, dy = pts[k].y - y;
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
      const x = p.x + Math.cos(ang) * r, y = p.y + Math.sin(ang) * r;
      if (!fits(x, y)) continue;
      push(x, y); placed = true; break;
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}

/**
 * 자리 배정기. 띠 안에 미리 뽑아둔 자리를 섞어 두고 순서대로 꺼낸다.
 * 앞에서부터 순서대로 주면 띠 한쪽부터 차곡차곡 차서 부자연스럽다.
 */
export class SlotPool {
  constructor(seed = 20260824) {
    const rng = makeRng(seed);
    const depthSpan = FLOW_DEPTH_MAX - FLOW_DEPTH_MIN;
    this.slots = poissonRect(FLOW_CORRIDOR_W, depthSpan, FLEET_MIN_GAP, rng).map((p) => ({
      // 띠 좌표를 월드로 옮긴다. x는 띠 가운데가 0이 되도록, y는 깊이로.
      x0: p.x - FLOW_CORRIDOR_W / 2,
      depth: FLOW_DEPTH_MIN + p.y,
      used: false,
    }));
    this.order = this.slots.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
  }

  take() {
    for (const i of this.order) {
      const s = this.slots[i];
      if (!s.used) { s.used = true; return s; }
    }
    return null;
  }

  release(slot) { if (slot) slot.used = false; }
}

/**
 * 기록 하나를 "배"로 만든다. 흔들림의 위상 같은 개성은 record_id에서 유도해서
 * 같은 기록이면 언제 다시 켜도 같은 움직임을 갖게 한다.
 */
export function makeBoat(record, slot) {
  const rng = makeRng(hashSeed(String(record.record_id)));
  return {
    record,
    slot,
    // 띠 안에서의 진행 거리. 흐름은 이 값만 키우고, 화면 좌표는 여기서 파생된다.
    x: slot.x0,
    z: slot.depth,
    // 뱃머리는 진행 방향. 파도에 따라 아주 조금씩만 흔들린다.
    heading: FLOW_DIR > 0 ? 0 : Math.PI,
    yawPhase: rng() * Math.PI * 2,
    yawAmp: 0.04 + rng() * 0.05,
    yawSpeed: 0.08 + rng() * 0.10,
    // 등장 연출 상태. 'arriving' → 'travelling' → null
    phase: null,
    phaseT: 0,
  };
}

/**
 * 한 프레임의 흐름.
 * @param {number} speed 월드 단위/초 (main.js가 카메라 화각에서 역산해 넘긴다)
 */
export function stepBoat(b, dt, t, speed) {
  b.x += FLOW_DIR * speed * dt;
  // 띠 폭을 다 지나면 반대편 끝으로. 정확히 폭만큼 옮기므로 이웃과의 간격이 유지된다.
  const half = FLOW_CORRIDOR_W / 2;
  if (b.x > half) b.x -= FLOW_CORRIDOR_W;
  else if (b.x < -half) b.x += FLOW_CORRIDOR_W;

  const base = FLOW_DIR > 0 ? 0 : Math.PI;
  b.heading = base + Math.sin(t * b.yawSpeed + b.yawPhase) * b.yawAmp;
}
