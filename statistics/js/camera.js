/* =============================================================================
 * camera.js — 전시장용 자동 순회 카메라.
 *
 * 온보딩의 카메라는 배 1척을 중심으로 고정 오빗(±0.85 rad)에 망원 FOV 34도였다.
 * 1척만 보이게 하려고 일부러 좁힌 설정이라, 넓은 바다에는 그대로 쓸 수 없다.
 *
 * 여기서는 카메라가 바다 중심을 도는 궤도 위를 천천히 흐르고, 시선은 언제나
 * 바다 안쪽을 향한다. 진행 방향을 그대로 바라보게 해 봤더니(리사주 + 전방 주시)
 * 화면이 빈 바다만 비추는 구간이 길게 생겼다 — 배는 안쪽에 있는데 카메라는
 * 바깥을 보고 있었다. 그래서 "어디를 보는지"는 궤도와 분리했다.
 *
 * 대신 같은 그림이 돌아오지 않도록 세 가지를 서로 다른 주기로 겹쳐 놓았다.
 *   궤도 각도(240초) · 궤도 반지름의 들숨날숨(167초) · 시선의 좌우 흔들림(97초)
 * 세 주기가 서로 안 떨어지므로 한 바퀴 돌 때마다 매번 다른 자리를, 다른 각도로 본다.
 *
 * 화면 구성상 위쪽 절반은 리퀴드 글래스 패널이 덮는다. 그래서 수평선이 화면
 * 21% 부근(패널 뒤)에 오도록 높이와 시선 거리를 잡았다 — 유리 뒤로 하늘과
 * 수평선이 비쳐 굴절되고, 패널 아래 열린 절반은 전부 바다가 된다.
 *   수평선 화면 위치 = 0.5 − 0.5·tan(pitch)/tan(fov/2),  pitch = atan(높이/시선거리)
 * ========================================================================== */

import * as THREE from "three";
import {
  CAM_FOV, CAM_HEIGHT, CAM_LOOK_AHEAD, CAM_PITCH_BOB,
  CAM_ORBIT_SEC, CAM_BREATH_SEC, CAM_SWING_SEC,
  CAM_ORBIT_MIN, CAM_ORBIT_MAX, CAM_SWING,
} from "./config.js";

export class TourCamera {
  constructor(aspect, interactive = false) {
    // far는 안개가 바다를 다 지운 지점보다 뒤에 있어야 한다. 그러지 않으면 안개보다
    // far 평면이 먼저 잘라서 타일 경계가 드러난다.
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 0.1, 400);
    this.t = 0;
    this.speedMul = 1;        // 새 기록 연출 중에는 여기를 낮춰 카메라를 거의 세운다
    this._speedTarget = 1;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this._dir = new THREE.Vector2(1, 0);
    this._focus = null;       // {x, z, w} — 연출 중 시선을 끌어당기는 지점
    this.interactive = interactive;
    this.yawOffset = 0;
    this.pitchOffset = 0;
  }

  /** 시각 t에서의 궤도 각도·반지름·시선 각도. 셋 다 여기서만 정해진다. */
  _orbitAt(t) {
    const theta = ((Math.PI * 2) / CAM_ORBIT_SEC) * t;
    const breath = Math.sin(((Math.PI * 2) / CAM_BREATH_SEC) * t);
    const mid = (CAM_ORBIT_MIN + CAM_ORBIT_MAX) / 2;
    const half = (CAM_ORBIT_MAX - CAM_ORBIT_MIN) / 2;
    const radius = mid + breath * half;
    // 시선은 "바다 중심 쪽"(theta + π)을 기준으로 좌우로만 흔들린다.
    const swing = Math.sin(((Math.PI * 2) / CAM_SWING_SEC) * t) * CAM_SWING;
    return { theta, radius, phi: theta + Math.PI + swing };
  }

  /** 연출 중인 배 쪽으로 시선을 끌어당긴다. w=0이면 평소대로. */
  setFocus(x, z, w) {
    this._focus = w > 0.001 ? { x, z, w } : null;
    // 주인공이 화면에 서 있는 동안 카메라까지 흐르면 산만하다 — 거의 세운다.
    this._speedTarget = w > 0.001 ? 1 - 0.85 * w : 1;
  }

  update(dt) {
    this.speedMul += (this._speedTarget - this.speedMul) * Math.min(1, dt * 1.2);
    this.t += dt * this.speedMul;

    const o = this._orbitAt(this.t);
    const px = Math.cos(o.theta) * o.radius;
    const pz = Math.sin(o.theta) * o.radius;
    this._dir.set(Math.cos(o.phi), Math.sin(o.phi));

    const bob = Math.sin(this.t * 0.11) * CAM_PITCH_BOB;
    this.pos.set(px, CAM_HEIGHT + bob, pz);

    let tx = px + this._dir.x * CAM_LOOK_AHEAD;
    let tz = pz + this._dir.y * CAM_LOOK_AHEAD;
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
