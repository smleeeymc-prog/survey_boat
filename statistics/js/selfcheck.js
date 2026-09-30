/* =============================================================================
 * selfcheck.js — 조용히 깨지는 것들을 로드할 때 한 번 잡아낸다.
 *
 * 여기 있는 것들은 전부 "틀려도 화면이 그럴싸하게 계속 도는" 종류의 실수다.
 * 파도 랩이 어긋나면 몇 분 뒤에야 바다가 한 번 튀고, GLB 노드 이름이 바뀌면
 * 갈매기만 조용히 사라진다. 전시장에서 발견하면 늦다.
 * console.assert라 실패해도 화면은 멈추지 않는다 — 콘솔에만 남는다.
 * ========================================================================== */

import * as THREE from "three";
import { THREE_VERSION, THREE_REVISION } from "../shared/deps.js";
import * as C from "./config.js";
import { waveHeightAt } from "./ocean.js";
import { SlotPool } from "./motion.js";

export function runSelfChecks(scene) {
  const D = C.WAVE_WRAP_DOMAIN;

  // 0) importmap이 선언한 three 버전과 실제로 로드된 리비전이 같은가.
  //    importmap은 HTML 인라인이라 두 화면에 각각 적힌다 — 한쪽만 올리면 두 화면이
  //    다른 three로 돌면서 셰이더나 로더 동작이 조용히 갈라진다.
  console.assert(
    THREE.REVISION === THREE_REVISION,
    `[selfCheck] three 리비전 불일치 — shared/deps.js는 ${THREE_VERSION}인데 로드된 건 r${THREE.REVISION} ` +
    `(importmap을 고쳤으면 shared/deps.js도 같이 올릴 것)`
  );

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
  //    씬은 멀쩡히 돌아가고 그 키워드의 요소만 조용히 사라진다.
  const fleet = scene.fleet;
  console.assert(fleet, "[selfCheck] 함대가 만들어지지 않음 — GLB 로드 실패");
  if (!fleet) return;
  console.assert(
    fleet.missing.length === 0,
    `[selfCheck] GLB에 없는 노드: ${fleet.missing.join(", ")} — 이름이 바뀌었는지 확인 (shared/glb-nodes.js)`
  );
  console.assert(
    fleet.tintMeshes.length >= 1,
    `[selfCheck] 인스턴스 컬러를 받는 그룹이 없다 — 선체 노드 이름이 바뀌었는지 확인 (선체 색조 채널이 조용히 죽는다)`
  );

  // 4) 키워드 → 요소가 빠짐없이 이어졌는가. 설문 분류값에 키워드가 늘었는데 매핑을 안 적으면
  //    그 키워드를 고른 배만 아무 표시 없이 떠다닌다.
  for (const kw of C.KEYWORDS) {
    console.assert(C.KEYWORD_NODES[kw], `[selfCheck] 키워드 "${kw}"에 요소가 없다 — shared/glb-nodes.js KEYWORD_NODES`);
    console.assert(
      fleet.byKeyword[kw] && fleet.byKeyword[kw].length,
      `[selfCheck] 키워드 "${kw}"의 요소 그룹을 못 만들었다 — 이 키워드를 고른 배는 표시 없이 뜬다`
    );
  }

  // 5) 인스턴싱의 요점. 배 몸체 draw call은 조각 수로 고정이어야 한다 — 배 수에 비례하면
  //    인스턴싱이 깨진 것이고, 조각이 늘었으면 GLB 재질이 쪼개진 것이다.
  //    요소는 요소 수만큼 따로 늘어난다(요소 하나 = draw call 하나, 쓰는 배가 없으면 0).
  console.assert(
    fleet.body.length <= 8,
    `[selfCheck] 배 몸체 그룹이 ${fleet.body.length}개 — GLB 재질이 쪼개졌는지 확인`
  );

  // 5.5) 배 칠 판정(HANDOFF-map 18.8). 모양으로 부품을 가르므로 GLB를 다시 뽑거나 굽는 배율이
  //      바뀌면 조용히 틀린다 — 마스트·계단이 선체색으로 돌아가거나 뱃전 윗단까지 판자가 깔린다.
  const L = fleet.look;
  if (L) {
    console.assert(L.mast >= 1 && L.rails === 2 && L.treads >= 2,
      `[selfCheck] 선체 부품 판정이 어긋남 — 마스트 ${L.mast}(≥1) · 계단 옆판 ${L.rails}(2) · 디딤판 ${L.treads}(≥2). ` +
      `GLB 선체 모양이나 굽는 배율(1)이 바뀌었는지 확인 (shared/boat-look.js markHullParts)`);
    console.assert(L.deckShare >= 0.5 && L.deckShare <= 0.95,
      `[selfCheck] 갑판 넓이 비율 ${L.deckShare.toFixed(2)} — 0.5~0.95 밖. 판자가 뱃전 윗단까지 깔렸거나 갑판이 빠졌다 ` +
      `(boat-paint.js markDeckFaces)`);
    console.assert(L.lampTwin !== false,
      `[selfCheck] 램프 한 쌍의 반대쪽 자리를 못 찾아 기본값을 씀 — 마스트 가로대 모양 확인 (shared/boat-look.js lampTwinZ)`);
  }

  // 6) 자리 풀이 정원을 감당하는가. 못 하면 뒤에 온 기록이 조용히 안 그려진다.
  const pool = new SlotPool();
  console.assert(
    pool.slots.length >= C.FLEET_CAPACITY,
    `[selfCheck] 푸아송 자리 ${pool.slots.length}개 < 정원 ${C.FLEET_CAPACITY} ` +
    `— FLOW_CORRIDOR_W나 깊이 범위를 키우거나 FLEET_MIN_GAP을 줄일 것`
  );

  // 7) 띠 폭이 화면보다 넓은가. 좁으면 배가 화면 안에서 순간이동하듯 감긴다.
  //    가장 먼 배(FLOW_DEPTH_MAX)의 화면 가로 절반보다 띠의 절반이 커야 한다.
  //    폭은 FLOW_ASPECT_MAX에서 역산하므로(config.js), 이게 걸리면 그보다 넓은 화면에서 띄운 것이다.
  const halfFrame = scene.cam.frameHalfWidthAt(C.FLOW_DEPTH_MAX);
  console.assert(
    C.FLOW_CORRIDOR_W / 2 > halfFrame + 2,
    `[selfCheck] 띠 폭 ${C.FLOW_CORRIDOR_W}의 절반이 화면 가로 절반 ${halfFrame.toFixed(1)}보다 ` +
    `충분히 크지 않다 — 배가 화면 안에서 감긴다. 화면비 ${scene.cam.aspect.toFixed(2)}가 ` +
    `FLOW_ASPECT_MAX(${C.FLOW_ASPECT_MAX.toFixed(2)})보다 넓으면 그걸 올릴 것`
  );

  // 8) 패널 DOM. id 하나만 오타 나도 통계가 조용히 안 바뀐다.
  for (const id of ["panel", "countNum", "countPlus", "mNext", "mBarFill", "mNextIdx", "mNextLabel", "stageDim",
                    "mNextTag", "report", "rNum", "rIdx", "rLabel",
                    "rHeadline", "statRows", "rExtra", "rPeriod", "rLegend",
                    "arrival", "logNo", "arrivalText", "arrivalSign",
                    "logFrom", "logStatus", "logCargo", "logLogged"]) {
    console.assert(document.getElementById(id), `[selfCheck] #${id} 엘리먼트가 없음`);
  }

  // 9) 틸트시프트 띠 두 장. 없으면 흐림이 조용히 사라진다(index.html 마크업, css/tilt-shift.css).
  console.assert(scene.tilt && scene.tilt.layers.length === 2,
    `[selfCheck] 틸트시프트 띠(.tiltBlur.top/.bottom)가 ${scene.tilt ? scene.tilt.layers.length : 0}장 — index.html 확인`);

  const propTri = Object.values(fleet.propTriangles);
  console.log(
    `[머무름의 지도] 배 몸체 그룹 ${fleet.body.length}개 · 요소 그룹 ${fleet.props.length}개 / ` +
    `배 1척 ${fleet.triangleCount.toLocaleString()} tri + 요소 ${Math.min(...propTri)}~${Math.max(...propTri)} tri / ` +
    `카메라 쪽으로 옮긴 요소: ${fleet.mirrored.join(", ") || "없음"} / 자리 ${pool.slots.length}개`
  );
}
