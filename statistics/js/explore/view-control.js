/* =============================================================================
 * explore/view-control.js — 인터랙티브 바다 조작: 좌우 끌기 · 핀치 줌 · 관성 · 한계 · 탭.
 *
 * 카메라는 전시와 같이 원점에 서서 돌고 당기기만 한다(camera.js 머리말). 끌기는 고개 돌리기,
 * 핀치는 렌즈 당기기다 — 카메라를 옆으로 옮기면(돌리) 가까운 바다와 먼 배가 다른 빠르기로 지나가
 * 바다만 미끄러지거나 배만 미끄러져 보인다. 제자리 회전에는 시차가 없어 그림 한 장을 미는 것처럼 보이고,
 * 바다·배·하늘이 다 월드에 고정이라 물결이 배와 따로 놀 일도 없다.
 *
 * 한계(10-06 사용자 결정, config.js EXPLORE_VIEW):
 *   · 좌우는 끝이 있다 — 평소 화면 양옆으로 화면 폭의 pan(20%)씩 더. 그 바깥(보이는 가로의 끝)을 넘지 않는다
 *   · 위아래는 평소 화면 안에서만 — 그래서 평소 렌즈에선 위아래로 안 움직이고, 당겼을 때만 움직인다
 *   · 렌즈는 평소 ~ zoomMax 배
 * 한계 밖으로 끌면 고무줄처럼 조금만 늘고(over), 손을 떼면 되돌아온다.
 *
 * 각도 계산은 정확한 화각으로 한다: 렌즈 tan(화각/2) = t 일 때 화면 가로 반이 보는 각은 atan(t·a).
 * ========================================================================== */

import { TourCamera } from "../camera.js";
import { EXPLORE_VIEW } from "../config.js";

const TAP_MOVE = 8;        // px — 이보다 덜 움직였으면 탭
const TAP_MS = 450;
const FRICTION = 4.2;      // 관성 감쇠(1/초)
const SPRING = 10;         // 한계로 되돌아오는 빠르기(1/초)

export class ViewControl {
  /**
   * @param {HTMLElement} el 손짓을 받는 층(#exTouch)
   * @param {import("../camera.js").TourCamera} cam
   * @param {{onTap?: (x:number, y:number) => void, onTouch?: () => void}} [hooks]
   *        onTap 무대 좌표(px)의 탭 · onTouch 손이 처음 닿은 순간(안내를 걷는다)
   */
  constructor(el, cam, hooks = {}) {
    this.el = el;
    this.cam = cam;
    this.hooks = hooks;
    this.enabled = true;        // false 면 끌기·줌을 안 받는다(배를 보는 중). 탭은 늘 받는다
    this.home = TourCamera.HOME_TAN;
    this.ptr = new Map();       // pointerId → {x, y}
    this.vel = { yaw: 0, pitch: 0 };
    this._gesture = null;
    this._lastMove = 0;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    for (const k of ["pointerup", "pointercancel"]) el.addEventListener(k, (e) => this._up(e));
    el.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
  }

  get view() { return this.cam.view; }

  /** 무대 크기·비율 */
  _box() {
    const r = this.el.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width || 1, h: r.height || 1, a: (r.width || 1) / (r.height || 1) };
  }

  /** 렌즈 t 에서 고개가 갈 수 있는 끝 — 보이는 가로 끝이 평소 화면 + 양옆 pan 을 넘지 않게 */
  limits(t = this.view.tan) {
    const a = this.cam.aspect;
    const edgeX = Math.atan(this.home * a * (1 + 2 * EXPLORE_VIEW.pan));
    const edgeY = Math.atan(this.home);
    return {
      yaw: Math.max(0, edgeX - Math.atan(t * a)),
      pitch: Math.max(0, edgeY - Math.atan(t)),
    };
  }

  /** 렌즈 배율(1 = 평소) */
  get zoom() { return this.home / this.view.tan; }

  _local(e) {
    const b = this._box();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  _down(e) {
    try { this.el.setPointerCapture(e.pointerId); } catch { /* 합성 포인터(테스트)에는 잡을 대상이 없다 */ }
    const p = this._local(e);
    this.ptr.set(e.pointerId, p);
    if (this.hooks.onTouch) this.hooks.onTouch();
    this.vel.yaw = this.vel.pitch = 0;
    if (this.ptr.size === 1) {
      // 시각은 이벤트가 생긴 때(timeStamp)로 잰다 — 느린 기기에선 프레임이 길어 처리하는 때가 한참 늦다
      this._tap = { id: e.pointerId, x: p.x, y: p.y, t: e.timeStamp, moved: false };
    } else {
      this._tap = null;           // 두 손가락이 닿으면 탭이 아니다
    }
    this._startGesture();
  }

  /** 지금 닿아 있는 손가락으로 몸짓 시작점을 다시 잡는다(손가락 수가 바뀔 때마다) */
  _startGesture() {
    const pts = [...this.ptr.values()];
    if (!pts.length) { this._gesture = null; return; }
    const v = this.view;
    const mid = centroid(pts);
    this._gesture = {
      n: pts.length, mid, dist: pts.length > 1 ? spread(pts) : 0,
      yaw: v.yaw, pitch: v.pitch, tan: v.tan,
    };
  }

  _move(e) {
    if (!this.ptr.has(e.pointerId)) return;
    const p = this._local(e);
    this.ptr.set(e.pointerId, p);
    if (this._tap && this._tap.id === e.pointerId && Math.hypot(p.x - this._tap.x, p.y - this._tap.y) > TAP_MOVE) this._tap.moved = true;
    if (!this.enabled || !this._gesture) return;
    const g = this._gesture;
    const pts = [...this.ptr.values()];
    if (pts.length !== g.n) { this._startGesture(); return; }
    const b = this._box();
    const mid = centroid(pts);
    const v = this.view;
    const prevYaw = v.yaw, prevPitch = v.pitch;

    // 렌즈 — 두 손가락 사이가 벌어진 만큼 당긴다. 손가락 가운데 아래의 바다가 손가락을 따라오게
    // 고개를 같이 돌린다(그 점의 방향을 줌 전후로 같게 둔다).
    let tan = g.tan;
    if (g.n > 1 && g.dist > 0) {
      tan = clamp(g.tan * (g.dist / Math.max(1, spread(pts))), this.home / EXPLORE_VIEW.zoomMax, this.home);
    }
    const nx0 = (g.mid.x / b.w) * 2 - 1, ny0 = (g.mid.y / b.h) * 2 - 1;     // 시작 때 손가락 가운데(NDC, 아래 +)
    const nx1 = (mid.x / b.w) * 2 - 1, ny1 = (mid.y / b.h) * 2 - 1;         // 지금 손가락 가운데
    // 그 점이 가리키던 방향(고개 기준 각) — 화면 오른쪽이 yaw −, 아래가 pitch +
    const yawAt = g.yaw - Math.atan(nx0 * g.tan * b.a);
    const pitchAt = g.pitch + Math.atan(ny0 * g.tan);
    v.tan = tan;
    let yaw = yawAt + Math.atan(nx1 * tan * b.a);
    let pitch = pitchAt - Math.atan(ny1 * tan);

    // 한계 밖은 고무줄 — 넘친 만큼의 일부만, 그것도 over 까지만
    const L = this.limits(tan);
    const overYaw = EXPLORE_VIEW.over * 2 * Math.atan(tan * b.a);
    const overPitch = EXPLORE_VIEW.over * 2 * Math.atan(tan);
    v.yaw = rubber(yaw, L.yaw, overYaw);
    v.pitch = rubber(pitch, L.pitch, overPitch);

    // 관성용 속도(라디안/초) — 마지막 몇 프레임의 평균
    const now = e.timeStamp;
    const dt = Math.max(1, now - (this._lastMove || now - 16)) / 1000;
    this._lastMove = now;
    const k = 0.35;
    this.vel.yaw = this.vel.yaw * (1 - k) + ((v.yaw - prevYaw) / dt) * k;
    this.vel.pitch = this.vel.pitch * (1 - k) + ((v.pitch - prevPitch) / dt) * k;
  }

  _up(e) {
    if (!this.ptr.has(e.pointerId)) return;
    const tap = this._tap;
    this.ptr.delete(e.pointerId);
    if (tap && tap.id === e.pointerId && !tap.moved && e.timeStamp - tap.t < TAP_MS && this.hooks.onTap) {
      this.vel.yaw = this.vel.pitch = 0;
      this.hooks.onTap(tap.x, tap.y);
    }
    this._tap = null;
    // 손가락 하나를 떼고 하나가 남으면 거기서부터 다시 끈다(줌 뒤 끌기로 매끄럽게)
    this._startGesture();
    // 한동안 안 움직이다 뗐으면 관성 없음
    if (e.timeStamp - this._lastMove > 90) this.vel.yaw = this.vel.pitch = 0;
  }

  /** 데스크톱 — 휠로 렌즈를 당긴다(커서 아래가 따라오게). 전시 리허설·확인용 */
  _wheel(e) {
    e.preventDefault();
    if (!this.enabled) return;
    const b = this._box();
    const p = this._local(e);
    const v = this.view;
    const nx = (p.x / b.w) * 2 - 1, ny = (p.y / b.h) * 2 - 1;
    const yawAt = v.yaw - Math.atan(nx * v.tan * b.a);
    const pitchAt = v.pitch + Math.atan(ny * v.tan);
    const tan = clamp(v.tan * Math.exp(e.deltaY * 0.0015), this.home / EXPLORE_VIEW.zoomMax, this.home);
    v.tan = tan;
    const L = this.limits(tan);
    v.yaw = clamp(yawAt + Math.atan(nx * tan * b.a), -L.yaw, L.yaw);
    v.pitch = clamp(pitchAt - Math.atan(ny * tan), -L.pitch, L.pitch);
  }

  /** 매 프레임 — 관성과 한계로 되돌아오기. 손이 닿아 있는 동안은 손이 정한다 */
  update(dt) {
    if (this.ptr.size) return;
    const v = this.view, L = this.limits();
    v.yaw += this.vel.yaw * dt;
    v.pitch += this.vel.pitch * dt;
    const f = Math.exp(-FRICTION * dt);
    this.vel.yaw *= f; this.vel.pitch *= f;
    if (Math.abs(this.vel.yaw) < 1e-4) this.vel.yaw = 0;
    if (Math.abs(this.vel.pitch) < 1e-4) this.vel.pitch = 0;
    // 한계 밖이면 속도를 죽이고 되돌린다
    const s = Math.min(1, dt * SPRING);
    if (Math.abs(v.yaw) > L.yaw) { this.vel.yaw = 0; v.yaw += (Math.sign(v.yaw) * L.yaw - v.yaw) * s; }
    if (Math.abs(v.pitch) > L.pitch) { this.vel.pitch = 0; v.pitch += (Math.sign(v.pitch) * L.pitch - v.pitch) * s; }
  }

  /** 손을 놓게 한다(배를 보러 들어갈 때 — 끌던 손이 남아 있으면 돌아왔을 때 튄다) */
  reset() {
    this.ptr.clear();
    this._gesture = null;
    this._tap = null;
    this.vel.yaw = this.vel.pitch = 0;
  }
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const centroid = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const spread = (pts) => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
/** 한계 ±lim 을 넘으면 넘친 만큼을 over 안으로 눌러 담는다(넘칠수록 덜 늘어난다) */
function rubber(x, lim, over) {
  const ax = Math.abs(x);
  if (ax <= lim) return x;
  const ex = ax - lim;
  return Math.sign(x) * (lim + over * (1 - Math.exp(-ex / Math.max(over, 1e-6))));
}
