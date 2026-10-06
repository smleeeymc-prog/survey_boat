/* =============================================================================
 * explore/pick.js — 화면을 누른 자리 → 그 배.
 *
 * 레이캐스트로 선체 삼각형을 맞히지 않고, 배마다 화면 위치와 화면 크기를 재서 가장 가까운 배를 고른다.
 * 지도 배는 작다 — 먼 배는 화면에서 손톱보다 작아서 정확히 그 위를 누르기 어렵다. 그래서 배 둘레에
 * 손가락 크기만큼(최소 반지름 MIN_R, 지름 44px — 손가락 탭의 권장 최소 크기)의 여유를 준다.
 * 여러 배가 그 안에 걸리면 누른 점에 (배 크기 대비) 가장 가까운 배, 같으면 카메라에 가까운 배(앞에 보이는 배).
 * ========================================================================== */

import { FLEET_SHIP_SCALE } from "../config.js";

const MIN_R = 22;          // px — 지름 44px
const HULL_HALF = 0.6;     // 선체 반 길이(배 좌표, FLEET_SHIP_SCALE 곱하기 전)
const AIM_Y = 0.35;        // 배 몸통 가운데 높이

/**
 * @param {import("../world.js").MapWorld} world
 * @param {number} x @param {number} y 무대 좌표(px)
 * @returns {object|null} 배
 */
export function pickBoat(world, x, y) {
  const a = {}, b = {};
  let best = null, bestScore = Infinity;
  for (const boat of world.boats) {
    if (boat.phase && boat.appear && boat.renderScale < 0.5) continue;   // 아직 나타나는 중인 배
    const s = FLEET_SHIP_SCALE * (boat.renderScale || 1);
    if (!world.toStage(boat.x, AIM_Y * s, boat.z, a)) continue;
    if (!world.toStage(boat.x + HULL_HALF * s, AIM_Y * s, boat.z, b)) continue;
    const r = Math.max(MIN_R, Math.hypot(b.x - a.x, b.y - a.y) * 1.15);
    const d = Math.hypot(x - a.x, y - a.y);
    if (d > r) continue;
    // 배 크기로 나눈 거리 — 큰(가까운) 배가 작은 배를 덮을 때도 누른 쪽에 더 맞는 배가 이긴다.
    // 거의 같으면 앞(카메라에 가까운) 배.
    const score = d / r + boat.z * 1e-4;
    if (score < bestScore) { bestScore = score; best = boat; }
  }
  return best;
}
