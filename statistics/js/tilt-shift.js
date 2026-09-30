/* =============================================================================
 * tilt-shift.js — 틸트시프트 띠(css/tilt-shift.css)를 구도에 맞춰 옮긴다.
 *
 * 설문은 화면 구도(FRAMING.shift)만큼 띠를 옮겨 흐림이 늘 같은 풍경 자리에 걸리게 한다.
 * 지도는 구도 대신 "또렷해야 할 것"의 화면 높이를 매 프레임 투영해서 초점 띠 가운데로 둔다:
 *   평소 — 배들이 흐르는 깊이 띠의 가운데(FLOW_DEPTH_MIN~MAX 중간) 수면. 먼 배·가까운 배가 반반 흐려지고
 *          수평선 위 하늘과 화면 맨 아래 가까운 바다가 흐려진다
 *   도착 제시 — 줌하는 만큼 그 배의 몸통 높이로 옮긴다(카메라가 배를 ARRIVAL_FRAME_Y 에 둔다)
 * 값(띠 높이·흐림·마스크)은 shared/look-tokens.js TILT_SHIFT — 설문과 같다.
 * ========================================================================== */

import * as THREE from "three";
import { TILT_SHIFT, FLOW_DEPTH_MIN, FLOW_DEPTH_MAX } from "./config.js";

const FOCUS_DEPTH = (FLOW_DEPTH_MIN + FLOW_DEPTH_MAX) / 2;
const BOAT_MID_Y = 0.35;   // 배 몸통 가운데 높이(배 좌표, 흘수선 위) — 갑판·캐빈쯤
// 띠가 초점 가운데를 따라 옮겨도 이 범위 밖으로는 안 민다 — 한쪽 띠가 0이나 화면 절반을 넘지 않게
const SHIFT_MAX = TILT_SHIFT.band - 0.08;

export class TiltShift {
  /** @param {Document} doc 띠 두 장(.tiltBlur.top/.bottom)이 index.html 에 있다 */
  constructor(doc) {
    this.root = doc.documentElement;
    this.layers = [...doc.querySelectorAll(".tiltBlur")];
    for (const el of this.layers) {
      el.style.setProperty("--tilt-band", String(TILT_SHIFT.band));
      el.style.setProperty("--tilt-blur", `${TILT_SHIFT.blur}px`);
      el.style.setProperty("--tilt-mid-at", `${TILT_SHIFT.midAt * 100}%`);
      el.style.setProperty("--tilt-mid", String(TILT_SHIFT.mid));
    }
    this.enabled = this.layers.length > 0;
    this._shift = null;
    this._v = new THREE.Vector3();
  }

  /** 워치독이 끈다. 한 번 끄면 다시 켜지 않는다(다른 절전 단계와 같다). */
  disable() {
    this.enabled = false;
    this.root.dataset.tilt = "off";
  }

  /**
   * 매 프레임. 초점 가운데의 화면 높이를 재서 띠를 옮긴다. 값이 거의 안 바뀌면 스타일을 안 건드린다
   * (CSS 변수를 바꾸면 레이아웃·합성을 다시 한다).
   * @param {THREE.Camera} camera
   * @param {{x:number,z:number,renderScale?:number}|null} boat 도착 제시 중인 배
   * @param {number} zoomT 도착 줌 진행(0 평소 ~ 1 다 당김)
   * @param {number} shipScale 지도 배율(FLEET_SHIP_SCALE)
   */
  update(camera, boat, zoomT, shipScale) {
    if (!this.enabled) return;
    let y = this._screenY(camera, 0, 0, FOCUS_DEPTH, true);
    if (boat && zoomT > 0) {
      const s = shipScale * (boat.renderScale || 1);
      const yb = this._screenY(camera, boat.x, BOAT_MID_Y * s, boat.z, false);
      y += (yb - y) * zoomT;
    }
    // 초점 띠 가운데 = 0.5 − shift  →  shift = 0.5 − y
    const shift = Math.max(-SHIFT_MAX, Math.min(SHIFT_MAX, 0.5 - y));
    if (this._shift !== null && Math.abs(shift - this._shift) < 0.002) return;
    this._shift = shift;
    for (const el of this.layers) el.style.setProperty("--view-shift", shift.toFixed(4));
  }

  /** 월드 점의 화면 높이(위 0 ~ 아래 1). ahead=true 면 x·z 를 카메라 기준 앞쪽 거리로 본다. */
  _screenY(camera, x, y, z, ahead) {
    const v = this._v;
    if (ahead) v.set(camera.position.x + x, y, camera.position.z + z);
    else v.set(x, y, z);
    v.project(camera);
    return 0.5 - v.y * 0.5;
  }
}
