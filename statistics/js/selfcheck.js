/* =============================================================================
 * selfcheck.js — 조용히 깨지는 것들을 로드할 때 한 번 잡아낸다.
 *
 * 여기 있는 것들은 전부 "틀려도 화면이 그럴싸하게 계속 도는" 종류의 실수다.
 * 파도 랩이 어긋나면 몇 분 뒤에야 바다가 한 번 튀고, GLB 노드 이름이 바뀌면
 * 갈매기만 조용히 사라진다. 전시장에서 발견하면 늦다.
 * console.assert라 실패해도 화면은 멈추지 않는다 — 콘솔에만 남는다.
 * ========================================================================== */

import * as C from "./config.js";
import { waveHeightAt } from "./ocean.js";
import { SlotPool } from "./motion.js";

export function runSelfChecks(scene) {
  const D = C.WAVE_WRAP_DOMAIN;

  // 1) 랩 도메인이 X·Z 양쪽에서 유효 파장의 공배수인가.
  //    위상은 k*(dirX*x + dirZ*z) 이므로 축별 유효 파장은 wavelength/dir 이다.
  //    온보딩은 배가 +X로만 가서 X만 맞으면 됐지만, 지도는 카메라가 XZ 평면을
  //    자유롭게 흐르므로 Z도 정수여야 한다.
  for (const w of C.GERSTNER_WAVES) {
    for (const [axis, dir] of [["X", w.dirX], ["Z", w.dirZ]]) {
      const cycles = (D * Math.abs(dir)) / w.wavelength;
      console.assert(
        Math.abs(cycles - Math.round(cycles)) < 1e-6,
        `[selfCheck] WAVE_WRAP_DOMAIN(${D})이 ${axis}축 유효파장(${w.wavelength}/${dir})의 공배수가 아님 ` +
        `— 랩 순간 바다가 튄다 (cycles=${cycles})`
      );
    }
  }

  // 2) 실제로 값이 같은지도 확인한다. 1)이 통과해도 수식을 잘못 옮겼으면 여기서 걸린다.
  const amp = 0.5 + 0.9 * 0.35;
  const a = waveHeightAt(3.7, -2.1, 12.5, 0, amp);
  const bx = waveHeightAt(3.7 + D, -2.1, 12.5, 0, amp);
  const bz = waveHeightAt(3.7, -2.1 + D, 12.5, 0, amp);
  console.assert(Math.abs(a - bx) < 1e-4, "[selfCheck] X축 랩에서 파고가 어긋남", a, bx);
  console.assert(Math.abs(a - bz) < 1e-4, "[selfCheck] Z축 랩에서 파고가 어긋남", a, bz);

  // 3) GLB에서 찾아야 할 노드를 다 찾았는가. 블렌더에서 다시 뽑으며 이름이 바뀌면
  //    씬은 멀쩡히 돌아가고 캐빈 색이나 갈매기만 조용히 사라진다.
  const fleet = scene.fleet;
  console.assert(fleet, "[selfCheck] 함대가 만들어지지 않음 — GLB 로드 실패");
  if (!fleet) return;
  console.assert(
    fleet.missing.length === 0,
    `[selfCheck] GLB에 없는 노드: ${fleet.missing.join(", ")} — 이름이 바뀌었는지 확인`
  );
  console.assert(
    fleet.cabinMeshes.length > 0,
    "[selfCheck] 캐빈 그룹이 없음 — 키워드 색이 아무 데도 안 먹는다"
  );

  // 4) 인스턴싱의 요점. draw call이 배 수에 비례하면 인스턴싱이 깨진 것이다.
  console.assert(
    fleet.groups.length <= 12,
    `[selfCheck] 인스턴스 그룹이 ${fleet.groups.length}개 — GLB 재질이 쪼개졌는지 확인`
  );

  // 5) 자리 풀이 정원을 감당하는가. 못 하면 뒤에 온 기록이 조용히 안 그려진다.
  const pool = new SlotPool();
  console.assert(
    pool.slots.length >= C.FLEET_CAPACITY,
    `[selfCheck] 푸아송 자리 ${pool.slots.length}개 < 정원 ${C.FLEET_CAPACITY} ` +
    `— SEA_RADIUS를 키우거나 FLEET_MIN_GAP을 줄일 것`
  );

  // 6) 패널 DOM. id 하나만 오타 나도 통계가 조용히 안 바뀐다.
  for (const id of ["countNum", "statLabel", "statRows", "arrival", "arrivalText", "arrivalMeta"]) {
    console.assert(document.getElementById(id), `[selfCheck] #${id} 엘리먼트가 없음`);
  }

  console.log(
    `[머무름의 지도] 인스턴스 그룹 ${fleet.groups.length}개 / 배 1척 ` +
    `${fleet.triangleCount.toLocaleString()} tri / 자리 ${pool.slots.length}개`
  );
}
