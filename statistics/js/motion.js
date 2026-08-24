/* =============================================================================
 * motion.js — 배를 어디에 놓고 어떻게 움직일지.
 *
 * ── 미결정 사항 결정: "상태별 차이를 위치/움직임/형태 중 무엇으로?" ──────────
 * 기획서가 "상태별 차이는 색상보다 위치·움직임·형태 중 하나로" 라고 못박았으므로
 * 색은 쓰지 않는다(색은 키워드 몫이다). 여기서는 위치와 움직임 둘 다 쓴다 —
 * 바다 한가운데를 '이곳'으로 두고, 상태마다 중심에서 떨어진 거리(띠)와 움직임이 다르다.
 *
 *   머무르는 중  안쪽 띠에 정박. 뱃머리는 중심을 향하고 거의 움직이지 않는다
 *   돌아온 사람  중간 안쪽에서 중심을 향해 아주 천천히 다가온다
 *   오가는 중    중간 띠를 계속 돈다 — 화면에서 유일하게 "진짜로 이동하는" 배
 *   떠날 준비 중 바깥 띠에서 뱃머리를 밖으로 두고 아주 느리게 멀어진다(끝까지 안 나간다)
 *   아직 모르겠음 띠를 가리지 않고 흩어져, 제자리에서 뱃머리만 좌우로 흔들린다
 *
 * 속도는 전부 "한참 봐야 움직인 걸 아는" 수준으로 잡았다. 전시장에서 몇 시간
 * 틀어놓는 화면이라, 눈에 띄게 움직이면 금방 산만해진다.
 *
 * ── 겹침 방지 ──────────────────────────────────────────────────────────────
 * 푸아송 디스크 샘플링(Bridson)으로 최소 간격이 보장된 자리를 미리 뽑아두고,
 * 기록이 오면 그 상태의 띠에 남아 있는 자리 중 하나를 준다. 난수는 고정 시드라
 * 같은 데이터면 새로고침해도 바다 모양이 같다(전시 중 재시작에 중요하다).
 * ========================================================================== */

import { SEA_RADIUS, FLEET_MIN_GAP } from "./config.js";

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

/** 문자열 → 32비트 정수. 기록마다 "성격"(속도·위상)을 고정하는 데 쓴다. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * 원반 안에 최소 간격 minGap을 지키는 점들을 뽑는다 (Bridson 푸아송 디스크).
 * 격자 셀 한 변을 minGap/√2로 잡으면 셀 하나에 점이 최대 하나라, 이웃 5×5 셀만
 * 봐도 최소 간격을 보장할 수 있다 — 전수 비교(O(n²))를 피하는 표준 트릭.
 */
export function poissonDisc(radius, minGap, rng, tries = 24) {
  const cell = minGap / Math.SQRT2;
  const gw = Math.ceil((radius * 2) / cell) + 1;
  const grid = new Int32Array(gw * gw).fill(-1);
  const pts = [];
  const active = [];
  const gi = (x, z) => Math.floor((x + radius) / cell) + gw * Math.floor((z + radius) / cell);

  const fits = (x, z) => {
    if (x * x + z * z > radius * radius) return false;
    const cx = Math.floor((x + radius) / cell), cz = Math.floor((z + radius) / cell);
    for (let j = Math.max(0, cz - 2); j <= Math.min(gw - 1, cz + 2); j++) {
      for (let i = Math.max(0, cx - 2); i <= Math.min(gw - 1, cx + 2); i++) {
        const k = grid[i + gw * j];
        if (k < 0) continue;
        const dx = pts[k].x - x, dz = pts[k].z - z;
        if (dx * dx + dz * dz < minGap * minGap) return false;
      }
    }
    return true;
  };
  const push = (x, z) => { grid[gi(x, z)] = pts.length; pts.push({ x, z }); active.push(pts.length - 1); };

  push(0, 0);
  while (active.length) {
    const ai = (rng() * active.length) | 0;
    const p = pts[active[ai]];
    let placed = false;
    for (let t = 0; t < tries; t++) {
      const ang = rng() * Math.PI * 2;
      const r = minGap * (1 + rng());            // [minGap, 2·minGap) 고리 안에서만 시도
      const x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
      if (!fits(x, z)) continue;
      push(x, z); placed = true; break;
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}

// 상태별 띠 — SEA_RADIUS에 대한 비율. 서로 조금씩 겹치게 둬서 경계가 눈에 띄지 않게 한다.
export const STATE_BAND = {
  stay: [0.00, 0.34],
  returned: [0.22, 0.50],
  between: [0.40, 0.70],
  leaving: [0.56, 0.86],
  unsure: [0.10, 0.95],
};

/**
 * 자리 배정기. 미리 뽑아둔 푸아송 자리를 반지름 순으로 정렬해 들고 있다가,
 * 기록이 오면 그 상태의 띠 안에서 아직 안 쓴 자리를 하나 준다.
 */
export class SlotPool {
  constructor(seed = 20260824) {
    const rng = makeRng(seed);
    this.slots = poissonDisc(SEA_RADIUS, FLEET_MIN_GAP, rng)
      .map((p) => ({ ...p, r: Math.hypot(p.x, p.z), used: false }))
      .sort((a, b) => a.r - b.r);
    // 띠 안에서 순서대로 주면 안쪽부터 차곡차곡 차서 바다가 부자연스럽게 채워진다.
    // 띠별로 한 번 섞어두고 순서대로 꺼내면 흩어진 순서가 고정되면서도 고르게 찬다.
    this.order = this.slots.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this._cursor = 0;
  }

  /** 상태에 맞는 빈 자리. 띠가 꽉 찼으면 아무 빈 자리나 준다(기록을 버리지 않는다). */
  take(stateId) {
    const band = STATE_BAND[stateId] || STATE_BAND.unsure;
    const lo = band[0] * SEA_RADIUS, hi = band[1] * SEA_RADIUS;
    for (const i of this.order) {
      const s = this.slots[i];
      if (!s.used && s.r >= lo && s.r <= hi) { s.used = true; return s; }
    }
    for (const i of this.order) {
      const s = this.slots[i];
      if (!s.used) { s.used = true; return s; }
    }
    return null;
  }

  release(slot) { if (slot) slot.used = false; }
}

/**
 * 기록 하나를 "배"로 만든다. 속도·위상 같은 개성은 record_id에서 유도해서
 * 같은 기록이면 언제 다시 켜도 같은 움직임을 갖게 한다.
 */
export function makeBoat(record, slot) {
  const rng = makeRng(hashSeed(String(record.record_id)));
  const r = Math.max(0.001, Math.hypot(slot.x, slot.z));
  const angle = Math.atan2(slot.z, slot.x);
  return {
    record,
    slot,
    state: record.state,
    // 극좌표로 들고 있는다 — 띠(반지름)와 궤도(각도)가 상태별 움직임의 축이라 계산이 곧다.
    r, angle,
    // 중심을 향하는 방향이 기준. 뱃머리는 상태에 따라 이 값에서 파생된다.
    heading: angle + Math.PI,
    yawWobble: rng() * Math.PI * 2,
    yawSpeed: 0.02 + rng() * 0.03,
    orbitDir: rng() < 0.5 ? -1 : 1,
    orbitSpeed: 0.008 + rng() * 0.010,     // rad/s — 한 바퀴에 6~13분
    creep: 0.010 + rng() * 0.014,          // 안팎으로 기어가는 속도 (월드/초)
    // 등장 연출 상태. 'arriving' → 'travelling' → null
    phase: null,
    phaseT: 0,
    fromX: 0, fromZ: 0,
  };
}

/** 한 프레임의 움직임. 위치는 극좌표로 굴리고 마지막에 xz로 편다. */
export function stepBoat(b, dt, t) {
  switch (b.state) {
    case "between":
      // 유일하게 진짜로 이동하는 상태. 중심 둘레를 돈다.
      b.angle += b.orbitDir * b.orbitSpeed * dt;
      // 뱃머리는 진행 방향(접선)
      b.heading = b.angle + b.orbitDir * Math.PI * 0.5;
      break;
    case "returned":
      // 중심을 향해 아주 천천히. 안쪽 띠에 닿으면 멈춘다 — 돌아온 뒤에도 계속
      // 파고들면 결국 한 점에 모여서 겹친다.
      b.r = Math.max(SEA_RADIUS * 0.16, b.r - b.creep * dt);
      b.heading = b.angle + Math.PI;
      break;
    case "leaving":
      // 바깥으로. 화면 밖으로는 안 내보낸다 — "떠날 준비 중"이지 떠난 게 아니다.
      b.r = Math.min(SEA_RADIUS * 0.94, b.r + b.creep * dt);
      b.heading = b.angle;
      break;
    case "unsure":
      // 제자리에서 뱃머리만 좌우로. 어느 쪽으로 갈지 못 정한 배.
      b.yawWobble += b.yawSpeed * dt;
      b.heading = b.angle + Math.PI + Math.sin(b.yawWobble) * 0.9;
      break;
    default: // stay
      // 닻을 내린 배. 파도에 따라 뱃머리가 아주 조금씩만 흔들린다.
      b.heading = b.angle + Math.PI + Math.sin(t * 0.12 + b.yawWobble) * 0.06;
      break;
  }
  b.x = Math.cos(b.angle) * b.r;
  b.z = Math.sin(b.angle) * b.r;
}
