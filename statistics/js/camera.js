/* =============================================================================
 * camera.js — 전시장용 카메라. 한 자리에 선 촬영 장비다.
 *
 * 바다·하늘·조명·배는 실제 공간처럼 월드에 고정돼 있고, 카메라는 그 공간 밖에서 따로
 * 움직인다. 할 수 있는 건 두 가지뿐이다: 고개 돌리기(팬·틸트)와 렌즈 당기기(줌).
 *
 * [변경 이력] 처음엔 카메라가 바다 위를 순회했고, 그다음엔 새 기록을 제시할 때만 그 배
 * 앞까지 수면 위를 날아갔다(돌리). 날아가는 카메라에는 시차가 생긴다 — 가까운 바다는
 * 빨리, 먼 배는 느리게 지나가서 "바다가 배보다 더 움직인다"로 보였다. 게다가 예전 바다는
 * 카메라를 따라 옮겨 다니는 판이라 면이 매 프레임 다시 만들어지며 빛이 따로 놀았다.
 * 지금은 카메라가 원점에 서서 돌고 당기기만 한다. 제자리 회전·줌에는 시차가 없어서
 * 화면 속 모든 것이 한 장의 사진처럼 같이 커지고 같이 움직인다.
 *
 * 흐름 규칙이 깨지지 않는 이유: 평소 시선은 +Z 이고 흐름 축(X)은 화면 가로축과 나란하다.
 * 줌할 때만 잠깐 고개를 돌리고, 끝나면 정확히 원래 시선으로 돌아온다.
 *
 * 평소 구성(세로 FOV 50): 수평선이 화면 위에서 28%, 그 위 하늘 띠에 제목 카드가 앉는다.
 *   수평선 화면 위치 = 0.5 − 0.5·tan(pitch)/tan(fov/2),  pitch = atan(높이/시선거리)
 *
 * [10-06] 인터랙티브 입구(explore.html)는 관람객이 고개(좌우·위아래)와 렌즈를 직접 움직인다 — view.
 * 카메라는 여전히 원점에 서 있다(돌고 당기기만). 전시 화면은 view 를 안 건드려 예전과 같다.
 * 배를 크게 보여주는 줌은 "평소 시선" 대신 "지금 view" 에서 출발해 돌아온다.
 * ========================================================================== */

import * as THREE from "three";
import {
  CAM_FOV, CAM_HEIGHT, CAM_LOOK_AHEAD,
  CAM_BOB, CAM_BOB_SEC, CAM_SWAY, CAM_SWAY_SEC,
} from "./config.js";

const HOME_PITCH = Math.atan2(CAM_HEIGHT, CAM_LOOK_AHEAD);   // 평소 시선이 수평에서 내려간 각
const TAN_HALF = Math.tan((CAM_FOV * Math.PI) / 360);

export class TourCamera {
  constructor(aspect, interactive = false) {
    // far는 바다가 다 지워지는 거리(160)와 하늘 돔(300)보다 뒤에 있어야 한다.
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 0.1, 400);
    this.aspect = aspect;
    this.t = 0;
    this.speedMul = 1;        // 줌 중에는 여기를 낮춰 숨쉬기까지 거의 세운다
    this._speedTarget = 1;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this._zoom = null;        // { yaw, pitch, tanHalf } — 줌 끝에서 볼 방향과 렌즈
    this._zoomT = 0;          // 0 = 평소, 1 = 완전히 당긴 상태
    this._fov = CAM_FOV;
    this.interactive = interactive;
    this.yawOffset = 0;
    this.pitchOffset = 0;
    // 관람객이 움직인 시점 — 평소 시선에서 고개를 yaw(+ = 화면 왼쪽)·pitch(+ = 아래)만큼, 렌즈는 tan(화각/2)
    this.view = { yaw: 0, pitch: 0, tan: TAN_HALF };
  }

  /** 평소 렌즈 tan(화각/2) — 인터랙티브가 줌 한계를 이것의 배수로 잡는다 */
  static get HOME_TAN() { return TAN_HALF; }

  /**
   * 카메라 앞 depth 만큼 떨어진 수면에서, 화면 가로 절반이 월드로 몇 단위인지 (평소 화각).
   * 흐름 속도("기준 깊이의 배가 40초에 화면을 건넌다")를 여기서 역산하고,
   * 배를 화면 밖에서 감기게 할 경계도 여기서 얻는다.
   *
   * 화면 폭은 카메라로부터의 "직선 거리"에 비례하지 수면 위 거리에 비례하지 않는다.
   * 카메라가 수면 위 CAM_HEIGHT에 떠 있으므로 빗변으로 계산해야 한다.
   */
  frameHalfWidthAt(depth) {
    const slant = Math.hypot(depth, CAM_HEIGHT);
    return slant * TAN_HALF * this.aspect;
  }

  /**
   * 줌 목표를 정한다. 월드의 점 (x, y, z) 를 화면 가로 한가운데, 세로 frameY(위에서 0~1)
   * 자리에 두고, 렌즈를 tan(화각/2) = tanHalf 까지 당긴다. 진행은 setZoomProgress 가 한다.
   */
  setZoomTarget(x, y, z, tanHalf, frameY = 0.5) {
    const dx = x, dz = z, dy = y - CAM_HEIGHT;
    const flat = Math.hypot(dx, dz);
    // 점을 세로 frameY 에 두려면 시선을 그만큼 더 숙인다 (화면 가운데보다 위에 두려면 아래를 본다)
    const lift = Math.atan((0.5 - frameY) * 2 * tanHalf);
    this._zoom = {
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(-dy, flat) + lift,
      tanHalf,
    };
  }

  /**
   * 0 → 1 로 당기고, 1 → 0 으로 푼다. 고개 돌리기와 렌즈를 같은 속도로 섞지 않는다:
   * 고개는 앞 75% 안에 다 돌리고, 렌즈는 15%부터 당긴다. 반대로 풀 때는 렌즈가 먼저
   * 풀리고 고개가 나중에 돌아온다(같은 곡선을 거꾸로 밟으므로 저절로 그렇게 된다).
   * 둘을 똑같이 섞으면 중간쯤에서 화각이 좁아지는 속도가 시선이 따라가는 속도보다 빨라,
   * 배가 화면 가장자리 밖으로 잠깐 빠졌다 돌아온다.
   */
  setZoomProgress(t) {
    this._zoomT = Math.max(0, Math.min(1, t));
    this._speedTarget = 1 - 0.85 * this._zoomT;
  }

  update(dt) {
    this.speedMul += (this._speedTarget - this.speedMul) * Math.min(1, dt * 1.2);
    this.t += dt * this.speedMul;

    // 완전히 고정하면 화면이 죽는다. 파도에 얹힌 정도로만 흔든다.
    const bob = Math.sin((this.t / CAM_BOB_SEC) * Math.PI * 2) * CAM_BOB;
    const sway = Math.sin((this.t / CAM_SWAY_SEC) * Math.PI * 2) * CAM_SWAY;
    this.pos.set(0, CAM_HEIGHT + bob, 0);

    const V = this.view;
    const yaw0 = sway + V.yaw, pitch0 = HOME_PITCH + V.pitch, tan0 = V.tan;
    let yaw = yaw0, pitch = pitch0, tanHalf = tan0;
    const z = this._zoom, k = this._zoomT;
    if (z && k > 0) {
      const pan = camEase(Math.min(1, k / 0.75));
      const lens = camEase(Math.max(0, (k - 0.15) / 0.85));
      yaw = yaw0 + (z.yaw - yaw0) * pan;
      pitch = pitch0 + (z.pitch - pitch0) * pan;
      // 렌즈는 배율이 고르게 변하도록 tan(화각/2) 의 로그로 섞는다 — 화각을 직선으로 섞으면
      // 끝으로 갈수록 확 당겨진다.
      tanHalf = Math.exp(Math.log(tan0) + (Math.log(z.tanHalf) - Math.log(tan0)) * lens);
    }
    // 시선 = 원점에서 (yaw, pitch) 방향. yaw 0 이 +Z.
    const c = Math.cos(pitch);
    this.target.set(Math.sin(yaw) * c * 100, CAM_HEIGHT + bob - Math.sin(pitch) * 100, Math.cos(yaw) * c * 100);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    if (this.interactive && (this.yawOffset || this.pitchOffset)) {
      this.camera.rotateY(this.yawOffset);
      this.camera.rotateX(this.pitchOffset);
    }
    const fov = (Math.atan(tanHalf) * 360) / Math.PI;
    if (Math.abs(fov - this._fov) > 1e-4) {
      this._fov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
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

const camEase = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
