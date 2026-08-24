/* =============================================================================
 * main.js — '머무름의 지도' 조립.
 *
 * 각 모듈이 하는 일은 파일 머리말에 적어 두었다. 여기서는 그것들을 이어 붙이고
 * 프레임 루프를 돈다. 이 파일이 아는 것:
 *   · 저장소(store) → 기록이 오면 배를 만든다
 *   · 배치·움직임(motion) → 매 프레임 배의 자리를 굴린다
 *   · 인스턴싱(fleet) → 그 자리를 GPU 버퍼에 쓴다
 *   · 카메라(camera) / 패널(panel)
 * ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as C from "./config.js";
import { buildWater, waveHeightAt, wrapWave, RIPPLE_MAX } from "./ocean.js";
import { ShipFleet } from "./fleet.js";
import { SlotPool, makeBoat, stepBoat, makeRng } from "./motion.js";
import { makeStyle } from "./style.js";
import { TourCamera } from "./camera.js";
import { Panel } from "./panel.js";
import { MockStore } from "./store.js";
import { runSelfChecks } from "./selfcheck.js";

const qs = new URLSearchParams(location.search);
const TIME_KEY = C.TIME_OF_DAY[qs.get("time")] ? qs.get("time") : C.DEFAULT_TIME_KEY;
const DEBUG = qs.get("debug") === "1";
if (DEBUG) document.documentElement.dataset.debug = "1";
// ?glass=lens|blur|flat 로 유리 단계를 고정한다. 전시장 기기가 정해지면 거기서 한 번
// 재보고 값을 박아두는 쪽이, 매번 워치독의 판단에 맡기는 것보다 예측 가능하다.
const GLASS_PIN = ["lens", "blur", "flat"].includes(qs.get("glass")) ? qs.get("glass") : null;
if (GLASS_PIN) document.documentElement.dataset.glass = GLASS_PIN;

// 바람 세기는 지도에서는 고정이다. 온보딩은 상태 선택에 따라 파도가 세지고 잦아들었지만,
// 여기서는 배마다 상태가 달라서 바다 하나에 하나의 값만 쓸 수 있다.
// 0.35 = 잔잔하되 죽지는 않은 정도 (ampScale 0.82, chop 0.20).
const WIND_T = 0.35;

/** 하늘 그라디언트 텍스처 (온보딩과 같은 방식·같은 정지점). */
function makeSkyTexture(colors) {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(0.48, colors[1]);
  grad.addColorStop(0.78, colors[2]);
  grad.addColorStop(1, colors[3]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class MapScene {
  constructor(canvas) {
    const P = C.TIME_OF_DAY[TIME_KEY];
    this.palette = P;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // 온보딩과 같은 이유로 상한 1.5 — 파도 프래그먼트 셰이더가 전체화면을 덮는
    // 반투명 평면이라 픽셀비가 커질수록 비용이 거의 제곱으로 는다.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    // 그림자는 쓰지 않는다 (fleet.js 머리말 참고) — 패스 자체를 켜지 않는다.
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture(P.sky);
    // 안개 = 바다 타일의 끝을 가리는 유일한 장치. 타일 반경(70)보다 확실히 안쪽에서
    // 끝나야 경계가 드러나지 않는다.
    this.scene.fog = new THREE.Fog(P.fog, C.FOG_NEAR, C.FOG_FAR);

    const B = C.SCENE_BRIGHTNESS;
    this.scene.add(new THREE.AmbientLight(P.amb, P.ambI * B));
    const sun = new THREE.DirectionalLight(P.sun, P.sunI * B);
    sun.position.set(P.sunPos[0], P.sunPos[1], P.sunPos[2]).multiplyScalar(6);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(P.rim, P.rimI * B);
    rim.position.set(-3, 1, -2).multiplyScalar(6);
    this.scene.add(rim);

    this.water = buildWater();
    this.scene.add(this.water);
    const wu = this.water.material.uniforms;
    wu.uOceanColor.value.setHex(P.ocean);
    wu.uSkyColor.value.setHex(P.skyRefl);
    wu.uSpecColor.value.setHex(P.spec);
    wu.uSpecStrength.value = P.specI;
    wu.uExposure.value = P.exposure * B;
    wu.uChop.value = 0.32 * (0.4 + 0.6 * WIND_T);
    wu.uAmpScale.value = 0.5 + 0.9 * WIND_T;
    this.ampScale = wu.uAmpScale.value;
    this.scene.fog.color.setHex(P.fog);
    wu.fogColor.value.setHex(P.fog);
    wu.fogNear.value = C.FOG_NEAR;
    wu.fogFar.value = C.FOG_FAR;

    this.cam = new TourCamera(window.innerWidth / window.innerHeight, qs.get("interactive") === "1");
    this.cam.attachPointer(canvas);

    this.panel = new Panel(document);
    this.slots = new SlotPool();
    this.boats = [];
    this.records = [];
    this.fleet = null;
    this.arriving = null;         // 지금 연출 중인 배 (동시에 하나뿐)
    this.pending = [];            // 연출이 밀렸을 때 줄 세워 둔다
    this.clock = new THREE.Clock();
    this.elapsed = 0;

    // 성능 워치독 — 온보딩과 같은 패턴이되, 리퀴드 글래스까지 같은 스위치에 물린다.
    // 배경이 매 프레임 변하는 WebGL 캔버스라 backdrop-filter가 정적 배경보다 훨씬 비싸다.
    // 판정 시계는 elapsed(장면 시간)가 아니라 실제 벽시계다 — dt를 0.05로 자르기 때문에,
    // 정말 느린 기기에서는 장면 시간이 벽시계의 몇 분의 일로만 흐른다. 그걸 기준으로 재면
    // 렉이 심할수록 절전이 늦게 켜지는, 정확히 반대 방향의 동작이 된다.
    this._perf = { samples: [], wall: 0, checkAt: 2.0, step: 0 };

    this._rippleScratch = [];
    this.flowSpeed = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.setAspect(w / h);
    // 흐름 속도는 "기준 깊이의 배가 FLOW_CROSS_SEC초에 화면을 건넌다"로 정의돼 있다.
    // 화면 폭은 기기 화면비마다 다르므로 상수로 박을 수 없고, 카메라에서 역산한다.
    // (창 크기를 바꾸면 속도도 따라 바뀐다 — 전시장에서는 한 번 고정되므로 무해하다)
    this.flowSpeed = (2 * this.cam.frameHalfWidthAt(C.FLOW_REF_DEPTH)) / C.FLOW_CROSS_SEC;
  }

  async load() {
    const gltf = await loadShipGltf();
    this.fleet = new ShipFleet(gltf.scene, C.FLEET_CAPACITY);
    this.scene.add(this.fleet.group);
    runSelfChecks(this);
  }

  connect(store) {
    store.subscribe({
      onReady: (records) => {
        // 시작할 때 이미 쌓여 있던 기록은 연출 없이 바로 바다에 놓는다.
        for (const r of records) this._addRecord(r, false);
        this.records = records.slice();
        this.panel.setRecords(this.records);
      },
      onInsert: (record) => {
        this.records.push(record);
        this.panel.setRecords(this.records);
        this._addRecord(record, true);
      },
      onRemove: (recordId) => this._removeRecord(recordId),
    });
  }

  _addRecord(record, announce) {
    const slot = this.slots.take();
    if (!slot) return;
    const boat = makeBoat(record, slot);
    // "이 배가 어떻게 생겼는지"는 전부 여기서 한 번 정해진다 (style.js).
    // 지금은 난수에서 뽑지만, config.js의 STYLE_SOURCE만 바꾸면 실제 답변에서 온다.
    boat.style = makeStyle(record);
    // 물결의 "드러나는 방향"은 배마다 한 번 정해 두고 바꾸지 않는다 —
    // 계속 돌면 눈이 그걸 쫓게 된다(온보딩 주석).
    const rng = makeRng(boat.slot.x0 * 1000 + boat.slot.depth * 7919 + 13);
    const a = rng() * Math.PI * 2;
    boat.arcX = Math.cos(a); boat.arcZ = Math.sin(a);
    boat.arcCut = Math.cos(Math.PI * (0.20 + rng() * 0.10));   // 둘레의 20~30%만 보인다

    this.boats.push(boat);
    // 자리를 넘기면 가장 오래된 배부터 물러난다. 패널의 누적 수는 그대로다 —
    // "바다에 떠 있는 배"와 "쌓인 문장"은 다른 값이고, 화면에도 그렇게 적혀 있다.
    while (this.boats.length > C.FLEET_CAPACITY) {
      const gone = this.boats.shift();
      this.slots.release(gone.slot);
      if (this.arriving === gone) this.arriving = null;
      const q = this.pending.indexOf(gone);
      if (q >= 0) this.pending.splice(q, 1);   // 이미 물러난 배를 뒤늦게 제시하지 않는다
    }
    this._reindex();

    if (announce) {
      if (!this.arriving) { this._beginArrival(boat); return; }
      // 제시는 한 번에 9초 남짓 걸린다. 관람객이 몰려 제출이 그보다 빨리 들어오면
      // 줄이 계속 길어져서, "방금 도착한 문장" 카드가 몇 분 전 문장을 보여주게 된다.
      // 줄이 길면 앞쪽(가장 오래 기다린 것)부터 버린다 — 배는 이미 바다에 놓였고,
      // 버리는 건 등장 연출뿐이다.
      this.pending.push(boat);
      while (this.pending.length > ARRIVAL_QUEUE_MAX) this.pending.shift();
    }
  }

  _removeRecord(recordId) {
    const i = this.boats.findIndex((b) => b.record.record_id === recordId);
    if (i >= 0) {
      const gone = this.boats[i];
      this.slots.release(gone.slot);
      if (this.arriving === gone) { this.arriving = null; this.panel.hideArrival(); }
      const q = this.pending.indexOf(gone);
      if (q >= 0) this.pending.splice(q, 1);
      this.boats.splice(i, 1);
      this._reindex();
    }
    const j = this.records.findIndex((r) => r.record_id === recordId);
    if (j >= 0) { this.records.splice(j, 1); this.panel.setRecords(this.records); }
  }

  /** 배 목록이 바뀌면 인스턴스 인덱스가 밀린다 — 색·소품을 다시 써 준다. */
  _reindex() {
    if (!this.fleet) return;
    this.fleet.setCount(this.boats.length);
    for (let i = 0; i < this.boats.length; i++) this.fleet.applyStyle(i, this.boats[i].style);
  }

  /**
   * 기획서 연출: 새 기록은 5~8초간 크게 제시된 뒤 기존 기록들 사이로 이동한다.
   *
   * 카메라가 배를 정면으로 겨누면 배가 화면 세로 한가운데(=패널 바로 아래 경계)에
   * 걸리거나, 반대로 너무 내려와 문장 카드에 가린다. 그래서 시선은 배가 아니라
   * "배보다 조금 더 먼 수면"에 둔다 — 그만큼 배가 화면에서 위로 올라온다.
   * 계수 1.17은 세로 화면(FOV 50, 카메라 높이 8, 제시 거리 11) 기준으로 배가
   * 화면 58% 자리에 오도록 역산한 값이다. 카드는 78%부터 시작하므로 겹치지 않는다.
   */
  _beginArrival(boat) {
    const stage = this.cam.stagePoint(ARRIVAL_DIST);
    boat.phase = "arriving";
    boat.phaseT = 0;
    boat.stageX = stage.x; boat.stageZ = stage.z; boat.stageHeading = stage.heading;
    this.arriving = boat;
    this.panel.showArrival(boat.record);
  }

  _updateArrival(dt) {
    const b = this.arriving;
    if (!b) { this.cam.setFocus(0, 0, 0); return; }
    b.phaseT += dt;

    if (b.phase === "arriving") {
      // 들어오는 1초는 크기가 부풀고, 나가는 0.8초는 시선이 풀린다.
      const inT = Math.min(1, b.phaseT / 1.0);
      b.renderScale = C.ARRIVAL_SCALE * easeOutCubic(inT);
      b.renderX = b.stageX; b.renderZ = b.stageZ; b.renderHeading = b.stageHeading;
      this._focusBeyond(b.stageX, b.stageZ, easeOutCubic(inT));
      if (b.phaseT >= C.ARRIVAL_HOLD_SEC) {
        b.phase = "travelling"; b.phaseT = 0;
        this.panel.hideArrival();
      }
      return;
    }

    // 자기 자리로 미끄러져 간다. 도착 지점은 매 프레임 갱신되는 "지금의 자리"라
    // 이동하는 상태(오가는 중)의 배도 어색하지 않게 합류한다.
    const k = Math.min(1, b.phaseT / C.ARRIVAL_TRAVEL_SEC);
    const e = easeInOutCubic(k);
    b.renderX = b.stageX + (b.x - b.stageX) * e;
    b.renderZ = b.stageZ + (b.z - b.stageZ) * e;
    b.renderHeading = Math.atan2(b.z - b.stageZ, b.x - b.stageX);
    b.renderScale = C.ARRIVAL_SCALE + (1 - C.ARRIVAL_SCALE) * e;
    this._focusBeyond(b.renderX, b.renderZ, (1 - e) * 0.9);

    // 항적은 이 배에만 준다 (셰이더 슬롯이 하나뿐이고, 실제로 나아가는 배도 이것뿐이다).
    const wake = this.water.material.uniforms.uWake.value;
    wake.set(b.renderX, b.renderZ, b.renderHeading, Math.sin(Math.PI * k) * 0.9);

    if (k >= 1) {
      b.phase = null; b.renderScale = 1;
      wake.set(0, 0, 0, 0);
      this.arriving = null;
      this.cam.setFocus(0, 0, 0);
      const next = this.pending.shift();
      if (next) this._beginArrival(next);
    }
  }

  /** 배보다 조금 더 먼 수면을 본다 (위 _beginArrival 주석 참고). */
  _focusBeyond(x, z, w) {
    const px = this.cam.pos.x, pz = this.cam.pos.z;
    this.cam.setFocus(px + (x - px) * ARRIVAL_LOOK_FACTOR, pz + (z - pz) * ARRIVAL_LOOK_FACTOR, w);
  }

  /**
   * 물결 슬롯 배정. 셰이더 루프 상한이 8이라 전부에게 줄 수 없다.
   * 카메라에 가까운 순으로 8척을 고르고, 세기를 거리로 페이드해서 슬롯이
   * 바뀌는 순간 링이 툭 나타나거나 사라지지 않게 한다.
   */
  _updateRipples() {
    const u = this.water.material.uniforms;
    if (u.uRippleOn.value < 0.5) return;
    const arr = u.uRipples.value, arc = u.uRippleArc.value;
    const cx = this.cam.target.x, cz = this.cam.target.z;

    const near = this._rippleScratch;
    near.length = 0;
    for (const b of this.boats) {
      const x = b.renderX !== undefined ? b.renderX : b.x;
      const z = b.renderZ !== undefined ? b.renderZ : b.z;
      const d = Math.hypot(x - cx, z - cz);
      if (d > 24) continue;   // 24 밖은 어차피 세기가 0이다
      near.push({ b, x, z, d });
    }
    near.sort((p, q) => p.d - q.d);

    let n = 0;
    for (const it of near) {
      if (n >= RIPPLE_MAX) break;
      const s = C.FLEET_SHIP_SCALE * (it.b.renderScale || 1);
      // 12 안쪽이면 그대로, 24에서 0. 슬롯이 바뀌는 자리에서 이미 세기가 0에 가깝다.
      // 여덟 척 모두에 같은 세기를 주면 화면이 하얀 고리로 얼룩덜룩해진다 —
      // 가장 가까운 몇 척만 또렷하고 나머지는 물에 배어드는 정도가 맞다.
      const w = (1 - smoothstep(12, 24, it.d)) * 0.8;
      // 링 반지름은 선체 반길이(0.49)에 맞춘다. 온보딩은 배가 주인공이라 넉넉했지만
      // 여기서는 조금만 커도 배에서 떨어진 흰 후광처럼 보인다.
      arr[n].set(it.x, it.z, 0.50 * s, w);
      arc[n].set(it.b.arcX, it.b.arcZ, it.b.arcCut, 0.50 * s + 0.22 * s);
      n++;
    }
    for (; n < RIPPLE_MAX; n++) arr[n].set(0, 0, 0, 0);
  }

  _watchdog(rawDt) {
    const p = this._perf;
    if (p.step > 2) return;
    if (GLASS_PIN && p.step === 0) p.step = 1;   // 유리를 고정했으면 3D 절전만 판단한다
    p.wall += rawDt;
    p.samples.push(rawDt);
    if (p.wall < p.checkAt) return;

    const avg = p.samples.reduce((a, b) => a + b, 0) / p.samples.length;
    p.samples.length = 0;
    p.checkAt = p.wall + 3.0;

    if (p.step === 0) {
      // 1차: 온보딩과 같은 기준(33fps 미만). 3D 쪽 사치품부터 끈다.
      if (avg > 0.030) {
        const u = this.water.material.uniforms;
        u.uSpecOn.value = 0.0;
        u.uRippleOn.value = 0.0;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
        document.documentElement.dataset.glass = "blur";   // 굴절도 같이 내린다
        p.step = 2;
      } else p.step = 1;
      return;
    }
    // 2차: 3D는 멀쩡한데 프레임이 모자라면 범인은 유리다(굴절 → 블러 → 없음).
    if (GLASS_PIN) { if (p.wall > 20) p.step = 3; return; }
    if (avg > 0.026) {
      const cur = document.documentElement.dataset.glass;
      document.documentElement.dataset.glass = cur === "lens" ? "blur" : "flat";
      if (cur !== "lens") p.step = 3;
    } else if (p.wall > 20) p.step = 3;        // 20초 넘게 멀쩡하면 그만 본다
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    // 원본과 같은 이유로 dt에 상한을 둔다 — 탭이 백그라운드에 있다가 돌아오면
    // 한 프레임에 몇 초가 밀려들어와 배가 순간이동한다.
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.elapsed += dt;
    const t = this.elapsed;

    this._watchdog(Math.min(1, rawDt));
    this.cam.update(dt);
    this.panel.update(dt);
    this._updateArrival(dt);

    // 바다 타일을 카메라 발밑으로 재중심. 파도 위상은 월드좌표로 계산되므로 이음매가 없다.
    // uCenter는 랩을 거쳐 들어간다 — 파도장이 WAVE_WRAP_DOMAIN 주기라 값만 작게 유지되고
    // 화면에는 아무 티도 안 난다(selfcheck가 이 성질을 검산한다).
    const gx = this.cam.groundX(), gz = this.cam.groundZ();
    this.water.position.set(gx, 0, gz);
    const wu = this.water.material.uniforms;
    wu.uTime.value = t;
    wu.uCenter.value.set(wrapWave(gx), wrapWave(gz));

    if (this.fleet) {
      const d = 0.5;   // 파도 기울기를 재는 간격
      for (let i = 0; i < this.boats.length; i++) {
        const b = this.boats[i];
        stepBoat(b, dt, t, this.flowSpeed);
        const x = b.phase ? b.renderX : b.x;
        const z = b.phase ? b.renderZ : b.z;
        const heading = b.phase ? b.renderHeading : b.heading;
        const scale = b.phase ? b.renderScale : 1;

        // 파고와 기울기. 셋만 재서 기울기를 얻고(전진차분), 뱃머리 방향으로 투영한다.
        const h0 = waveHeightAt(x, z, t, 0, this.ampScale);
        const gxh = (waveHeightAt(x + d, z, t, 0, this.ampScale) - h0) / d;
        const gzh = (waveHeightAt(x, z + d, t, 0, this.ampScale) - h0) / d;
        const ch = Math.cos(heading), sh = Math.sin(heading);
        // 뱃머리가 +X라 앞뒤 흔들림(피치)은 Z축 회전, 좌우 흔들림(롤)은 X축 회전이다.
        const pitch = -(gxh * ch + gzh * sh) * 1.5;
        const roll = (-gxh * sh + gzh * ch) * 1.5;
        this.fleet.writeMatrix(i, x, h0, z, heading, scale, pitch, roll);
      }
      this.fleet.commit();
    }

    this._updateRipples();
    this.renderer.render(this.scene, this.cam.camera);

    if (DEBUG) this._hud(dt);
  }

  _hud(dt) {
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT < 0.4) return;
    this._hudT = 0;
    const info = this.renderer.info.render;
    document.getElementById("hud").textContent =
      `${(1 / Math.max(dt, 1e-4)).toFixed(0)} fps  dt ${(dt * 1000).toFixed(1)}ms\n` +
      `boats ${this.boats.length} / records ${this.records.length}\n` +
      `draw calls ${info.calls}  tris ${info.triangles.toLocaleString()}\n` +
      `glass ${document.documentElement.dataset.glass}  time ${TIME_KEY}\n` +
      `flow ${this.flowSpeed.toFixed(3)} u/s  (깊이 ${C.FLOW_REF_DEPTH}에서 ${C.FLOW_CROSS_SEC}초에 화면 횡단)`;
  }
}

/** 후보 경로를 순서대로 시도한다. 먼저 성공한 것을 쓰고, 다 실패하면 마지막 오류를 던진다. */
async function tryLoadFirst(urls) {
  const loader = new GLTFLoader();
  let lastErr;
  for (const url of urls) {
    try { return await loader.loadAsync(url); } catch (err) { lastErr = err; }
  }
  throw lastErr;
}
// 배포 형태에 따라 GLB 경로가 다르다 (config.js의 MODEL_URLS 참고).
// 단일 파일 시안에서는 build-standalone.mjs가 이 한 줄을 "파일 안의 GLB 파싱"으로 바꾼다.
const loadShipGltf = () => tryLoadFirst(C.MODEL_URLS);

// 등장 연출을 기다리는 줄의 상한 (_addRecord 참고)
const ARRIVAL_QUEUE_MAX = 3;
// 새 기록을 세우는 거리와, 시선을 그보다 얼마나 더 멀리 둘지 (_beginArrival 참고)
const ARRIVAL_DIST = 11;
const ARRIVAL_LOOK_FACTOR = 1.17;

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smoothstep = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// ── 부팅 ────────────────────────────────────────────────────────────────────
const scene = new MapScene(document.getElementById("scene"));
scene.frame();
scene.load()
  .then(() => {
    // 목업 저장소. 백엔드가 정해지면 이 한 줄만 갈아끼운다 (store.js 머리말 참고).
    scene.connect(new MockStore(
      Number(qs.get("seed") ?? 46),
      Number(qs.get("interval") ?? 14)
    ));
  })
  .catch((err) => {
    console.error("모델(GLB) 로드 실패:", err);
    // 배가 없어도 바다와 패널은 계속 돈다 — 전시 중 모델 하나 때문에 화면이
    // 통째로 검게 죽는 것보다 낫다.
    scene.connect(new MockStore(Number(qs.get("seed") ?? 46), 0));
  });

window.__map = scene;   // 콘솔에서 들여다볼 수 있게
