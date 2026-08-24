/* =============================================================================
 * camera.js — 전시장용 고정 카메라.
 *
 * 온보딩의 카메라는 배 1척을 중심으로 고정 오빗(±0.85 rad)에 망원 FOV 34도였다.
 * 1척만 보이게 하려고 일부러 좁힌 설정이라, 넓은 바다에는 그대로 쓸 수 없다.
 *
 * [변경 이력] 처음엔 카메라가 바다 위를 순회했다. 하지만 배가 한 방향으로 흐르는
 * 연출로 바꾸면서 카메라를 세웠다 — 카메라가 도는 동안 흐름 방향이 화면 안에서
 * 계속 바뀌면 "화면 끝에서 등장해 반대쪽으로 퇴장"이라는 규칙 자체가 성립하지 않고,
 * 배의 속도와 카메라의 속도가 더해져 화면에서의 체감 속도가 들쭉날쭉해진다.
 * 이제 움직이는 건 배고, 카메라는 눈치채지 못할 만큼만 숨쉰다.
 *
 * 화면 구성상 위쪽 절반은 리퀴드 글래스 패널이 덮는다. 그래서 수평선이 화면
 * 15% 부근(패널 뒤)에 오도록 높이와 시선 거리를 잡았다 — 유리 뒤로 하늘과
 * 수평선이 비쳐 굴절되고, 패널 아래 열린 절반은 전부 바다가 된다.
 *   수평선 화면 위치 = 0.5 − 0.5·tan(pitch)/tan(fov/2),  pitch = atan(높이/시선거리)
 * ========================================================================== */

import * as THREE from "three";
import {
  CAM_FOV, CAM_HEIGHT, CAM_LOOK_AHEAD,
  CAM_BOB, CAM_BOB_SEC, CAM_SWAY, CAM_SWAY_SEC,
} from "./config.js";

export class TourCamera {
  constructor(aspect, interactive = false) {
    // far는 안개가 바다를 다 지운 지점보다 뒤에 있어야 한다. 그러지 않으면 안개보다
    // far 평면이 먼저 잘라서 타일 경계가 드러난다.
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 0.1, 400);
    this.aspect = aspect;
    this.t = 0;
    this.speedMul = 1;        // 새 기록 연출 중에는 여기를 낮춰 숨쉬기까지 거의 세운다
    this._speedTarget = 1;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    // 카메라는 +Z를 바라본다. 그러면 배가 흐르는 축(X)이 화면 가로축과 나란해진다 —
    // "화면 끝에서 끝까지"를 계산할 수 있는 건 이 정렬 덕분이다.
    this._dir = new THREE.Vector2(0, 1);
    this._focus = null;
    this.interactive = interactive;
    this.yawOffset = 0;
    this.pitchOffset = 0;
  }

  /**
   * 카메라 앞 depth 만큼 떨어진 수면에서, 화면 가로 절반이 월드로 몇 단위인지.
   * 흐름 속도("기준 깊이의 배가 40초에 화면을 건넌다")를 여기서 역산하고,
   * 배를 화면 밖에서 감기게 할 경계도 여기서 얻는다.
   *
   * 화면 폭은 카메라로부터의 "직선 거리"에 비례하지 수면 위 거리에 비례하지 않는다.
   * 카메라가 수면 위 CAM_HEIGHT에 떠 있으므로 빗변으로 계산해야 한다.
   */
  frameHalfWidthAt(depth) {
    const slant = Math.hypot(depth, CAM_HEIGHT);
    return slant * Math.tan((CAM_FOV * Math.PI) / 360) * this.aspect;
  }

  /** 연출 중인 배 쪽으로 시선을 끌어당긴다. w=0이면 평소대로. */
  setFocus(x, z, w) {
    this._focus = w > 0.001 ? { x, z, w } : null;
    this._speedTarget = w > 0.001 ? 1 - 0.85 * w : 1;
  }

  update(dt) {
    this.speedMul += (this._speedTarget - this.speedMul) * Math.min(1, dt * 1.2);
    this.t += dt * this.speedMul;

    // 완전히 고정하면 화면이 죽는다. 파도에 얹힌 정도로만 흔든다.
    const bob = Math.sin((this.t / CAM_BOB_SEC) * Math.PI * 2) * CAM_BOB;
    const sway = Math.sin((this.t / CAM_SWAY_SEC) * Math.PI * 2) * CAM_SWAY;
    this.pos.set(0, CAM_HEIGHT + bob, 0);
    this._dir.set(Math.sin(sway), Math.cos(sway));

    let tx = this._dir.x * CAM_LOOK_AHEAD;
    let tz = this._dir.y * CAM_LOOK_AHEAD;
    if (this._focus) {
      // 연출 중에는 시선을 이 점으로 끌어당긴다. 어느 점을 줄지는 부르는 쪽이 정한다
      // (main.js의 _focusBeyond — 배가 아니라 배보다 조금 더 먼 수면을 준다).
      tx += (this._focus.x - tx) * this._focus.w;
      tz += (this._focus.z - tz) * this._focus.w;
    }
    this.target.set(tx, 0, tz);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    if (this.interactive && (this.yawOffset || this.pitchOffset)) {
      this.camera.rotateY(this.yawOffset);
      this.camera.rotateX(this.pitchOffset);
    }
  }

  /** 물 타일을 재중심할 지점 — 카메라 발밑이다. */
  groundX() { return this.pos.x; }
  groundZ() { return this.pos.z; }

  /** 새 기록을 세울 자리: 카메라 앞 dist 만큼, 화면 한가운데. */
  stagePoint(dist) {
    return {
      x: this.pos.x + this._dir.x * dist,
      z: this.pos.z + this._dir.y * dist,
      heading: Math.atan2(this._dir.y, this._dir.x) + Math.PI * 0.62,
    };
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** ?interactive=1 일 때만. 리허설·디버깅용이고 전시 기본값은 무조작이다. */
  attachPointer(el) {
    if (!this.interactive) return;
    let dragging = false, lx = 0, ly = 0;
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; el.style.cursor = "grabbing"; });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      this.yawOffset = Math.max(-1.2, Math.min(1.2, this.yawOffset - (e.clientX - lx) * 0.004));
      this.pitchOffset = Math.max(-0.5, Math.min(0.5, this.pitchOffset + (e.clientY - ly) * 0.003));
      lx = e.clientX; ly = e.clientY;
    });
    const end = () => { dragging = false; el.style.cursor = "grab"; };
    ["pointerup", "pointercancel", "pointerleave"].forEach((k) => el.addEventListener(k, end));
  }
}
