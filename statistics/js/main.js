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
import { SlotPool, makeBoat, stepBoat, swayBoat, wrapCorridor, makeRng, hashSeed } from "./motion.js";
import { makeStyle } from "./style.js";
import { TourCamera } from "./camera.js";
import { Panel } from "./panel.js";
import { MockStore } from "./store.js";
import { runSelfChecks } from "./selfcheck.js";

const qs = new URLSearchParams(location.search);
const TIME_KEY = C.TIME_OF_DAY[qs.get("time")] ? qs.get("time") : C.DEFAULT_TIME_KEY;
const DEBUG = qs.get("debug") === "1";
// ?depths=1 — 등장 깊이를 눈으로 정하기 위한 보정 화면. 흐름을 세우고 주요 깊이마다
// 배를 한 척씩 같은 화면 가로 위치에 놓은 뒤, 각 배 위에 그 깊이 숫자를 띄운다.
const CALIB = qs.get("depths") === "1";
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
    this.pending = [];            // 연출이 밀렸을 때 줄 세워 둔 '기록'들 (배가 아니다)
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    // 흐름이 지금까지 띠를 얼마나 밀었는가. 도중에 들어오는 배도 이만큼 밀린 자리를
    // 받아야 푸아송 격자가 유지된다 — 예전에는 자리의 원래 좌표(x0)에서 그냥 시작해서,
    // 오래 켜 둘수록 새 배가 기존 배 사이에 끼어들 수 있었다.
    this.flowDist = 0;

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

  /** 그 자리가 "지금" 있는 곳. 흐름이 띠를 민 만큼 더해서 접는다. */
  _latticeX(slot) { return wrapCorridor(slot.x0 + this.flowDist); }

  /**
   * 등장 연출을 할 배의 자리를 직접 고른다.
   *
   * 미리 뽑아둔 푸아송 자리에서 고르지 않는 이유: 화면에 보이는 바다는 띠(80) 중
   * 10 남짓이고, 그중 왼쪽 절반이면 4 정도다. 224개 자리 가운데 그 창에 들어와 있는
   * 건 한순간에 서너 개뿐이라, 그것들이 이미 차 있으면 조건을 만족하는 빈 자리가
   * 아예 없다 — 실제로 그래서 배가 화면 밖 깊이 43에 등장하고 카메라가 28 단위를
   * 날아갔다. 그래서 조건(왼쪽 절반·깊이 범위)을 먼저 만족시켜 놓고 겹침은 직접 잰다.
   *
   * 난수는 record_id에서 유도한다. 같은 기록이면 새로고침해도 같은 자리에 뜬다 —
   * 이 화면의 다른 난수들과 같은 원칙이다(motion.js 머리말).
   */
  _pickArrivalSpot(record) {
    const rng = makeRng(hashSeed(String(record.record_id)) ^ 0x5f3a);
    // 제시하는 동안 이 배만 멈춰 서 있고 나머지는 계속 흐른다. 그 시간만큼 흐름
    // 방향으로 격자가 밀리므로, 얼어 있는 자리가 곧 "연출이 끝났을 때의 격자 자리"다.
    // 배가 얼어 있는 시간은 카메라 이동 시간 + 머무는 시간이다. 이동 시간은 거리에서
    // 나오므로 자리를 정하기 전에는 모른다 — 겹침 검사에는 상한을 쓴다(길게 잡을수록 안전).
    const freeze = C.CAM_TRAVEL_MAX_SEC + C.ARRIVAL_HOLD_SEC;
    const lead = C.FLOW_DIR * this.flowSpeed * freeze;
    let best = null, bestClear = -Infinity;
    for (let n = 0; n < 64; n++) {
      const depth = C.ARRIVAL_DEPTH_MIN + rng() * (C.ARRIVAL_DEPTH_MAX - C.ARRIVAL_DEPTH_MIN);
      const hw = this.cam.frameHalfWidthAt(depth);
      const spawnX = hw * (C.ARRIVAL_X_MIN + rng() * (C.ARRIVAL_X_MAX - C.ARRIVAL_X_MIN));
      // 얼어 있는 동안 이웃들이 옆을 흘러 지나간다. 한 점이 아니라 그 구간 전체에서
      // 간격이 유지돼야 한다 — 지금 비어 있어도 3초 뒤에 옆구리를 스칠 수 있다.
      // 한쪽으로만 쓸면 된다: 이 배는 서 있고 남들만 흐른다. 제시는 한 번에 하나뿐이고
      // 이 자리를 고르는 시점엔 앞 연출이 이미 끝나 있으므로, 서 있는 다른 배는 없다.
      let clear = Infinity;
      for (let k = 0; k <= 6; k++) {
        const x = spawnX - lead * (k / 6);
        for (const o of this.boats) {
          const d = Math.hypot(wrapCorridor(x - o.x), depth - o.z);
          if (d < clear) clear = d;
        }
      }
      if (clear > bestClear) { bestClear = clear; best = { spawnX, depth }; }
      if (clear >= C.FLEET_MIN_GAP) break;   // 넉넉하면 더 볼 것 없다
    }
    return best;
  }

  _addRecord(record, announce) {
    // 앞 연출이 아직 안 끝났으면 배를 만들지 않고 기록만 줄 세운다.
    // 예전에는 배를 먼저 바다에 놓고 줄을 세웠는데, 그러면 차례를 기다리는 동안 배가
    // 흘러가 버려서 "얼어 있을 시간만큼 미리 밀어 둔" 보정이 통째로 어긋났다. 게다가
    // 줄에서 밀려난 배까지 전부 화면 왼쪽의 좁은 창에 놓여 서로 겹쳤다(실측 간격 0.08).
    if (announce && this.arriving) {
      this.pending.push(record);
      // 제시는 한 번에 10초 남짓 걸린다. 관람객이 몰려 제출이 그보다 빨리 들어오면
      // 줄이 계속 길어져서, "방금 도착한 문장" 카드가 몇 분 전 문장을 보여주게 된다.
      // 줄이 길면 가장 오래 기다린 것부터 연출 없이 바다에 놓는다 — 버리는 건 연출뿐이다.
      while (this.pending.length > ARRIVAL_QUEUE_MAX) this._addRecord(this.pending.shift(), false);
      return;
    }

    let slot = null, spawnX;
    if (announce) {
      const spot = this._pickArrivalSpot(record);
      spawnX = spot.spawnX;
      // 연출이 끝나면 이 배는 여기서부터 그냥 흐른다. 격자 좌표(x0)로 환산해 자리를
      // 만들어 둔다 — 푸아송 풀에서 꺼낸 게 아니라 새로 만든 자리이고, 겹치지 않는다는
      // 보장은 위에서 직접 잰 것이다. 이후 stepBoat/감김은 다른 배와 똑같이 돈다.
      // x0(격자 좌표)는 얼어 있는 시간이 정확히 정해지는 _beginArrival 에서 확정한다.
      slot = { x0: 0, depth: spot.depth, used: true };
    } else {
      // 처음 쌓여 있던 기록들은 푸아송 격자에 고르게 놓는다. 수십 척을 한꺼번에
      // 놓는 데는 거절 샘플링보다 이쪽이 훨씬 낫다.
      slot = this.slots.take();
      if (!slot) return;
      spawnX = this._latticeX(slot);
    }
    const boat = makeBoat(record, slot, spawnX);
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
      if (this.arriving === gone) { this.arriving = null; this.panel.hideArrival(); }
    }
    this._reindex();

    if (announce) this._beginArrival(boat);
  }

  _removeRecord(recordId) {
    const i = this.boats.findIndex((b) => b.record.record_id === recordId);
    if (i >= 0) {
      const gone = this.boats[i];
      this.slots.release(gone.slot);
      if (this.arriving === gone) { this.arriving = null; this.panel.hideArrival(); }
      this.boats.splice(i, 1);
      this._reindex();
    }
    const q = this.pending.findIndex((r) => r.record_id === recordId);
    if (q >= 0) this.pending.splice(q, 1);   // 아직 제시 못 한 기록이 지워진 경우
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
   * 기획서 연출: 새 기록은 5~8초간 크게 제시된 뒤 기존 기록들 사이에 남는다.
   *
   * 움직이는 건 카메라다. 배는 자기 자리에 생겨서 그 자리에 그대로 있는다.
   *   approach  카메라가 배 앞 ARRIVAL_DIST 까지 간다. 도착 0.3초 전에 배가 나타난다
   *   hold      문장 카드를 띄우고 머문다. 배는 흐르지 않는다
   *   return    카드를 내리고 카메라가 제자리로. 배는 여기서부터 흐르기 시작한다
   *
   * 카메라가 배를 정면으로 겨누면 배가 화면 세로 한가운데(=패널 바로 아래 경계)에
   * 걸리거나, 반대로 너무 내려와 문장 카드에 가린다. 그래서 시선은 배가 아니라
   * "배보다 조금 더 먼 수면"에 둔다 — 그만큼 배가 화면에서 위로 올라온다.
   * 계수 1.17은 세로 화면(FOV 50, 카메라 높이 8, 제시 거리 11) 기준으로 배가
   * 화면 58% 자리에 오도록 역산한 값이다. 카드는 78%부터 시작하므로 겹치지 않는다.
   */
  _beginArrival(boat) {
    boat.phase = "approach";
    boat.phaseT = 0;
    boat.renderScale = 0;                    // 카메라가 거의 다 갈 때까지 안 보인다
    // 배 앞 ARRIVAL_DIST 에 서면 배가 화면 한가운데에 온다 (카메라는 +Z를 본다).
    boat.camToX = boat.x;
    boat.camToZ = boat.z - C.ARRIVAL_DIST;
    boat.camFromX = this.cam.eyeX;
    boat.camFromZ = this.cam.eyeZ;
    // 이동 시간은 거리에서 얻는다. 가까운 배까지 늘어지지도, 먼 배까지 휙 날아가지도
    // 않게 하려면 "시간"이 아니라 "속도"를 고정하는 쪽이 맞다.
    const d = Math.hypot(boat.camToX - boat.camFromX, boat.camToZ - boat.camFromZ);
    boat.camSec = Math.max(C.CAM_TRAVEL_MIN_SEC,
                  Math.min(C.CAM_TRAVEL_MAX_SEC, d / C.CAM_TRAVEL_SPEED));
    // 이 배는 지금부터 camSec + 머무는 시간 동안 멈춰 있고, 그 동안 격자만 흘러간다.
    // 연출이 끝나는 순간의 격자 좌표를 역산해 자리에 적어 둔다 — 그래야 이후 이 배도
    // 나머지와 똑같은 한 격자 위에서 흐른다 (_latticeX).
    const frozen = boat.camSec + C.ARRIVAL_HOLD_SEC;
    boat.slot.x0 = wrapCorridor(boat.x - this.flowDist - C.FLOW_DIR * this.flowSpeed * frozen);
    this.arriving = boat;
  }

  _updateArrival(dt) {
    const b = this.arriving;
    if (!b) { this.cam.setEye(0, 0); this.cam.setFocus(0, 0, 0); return; }
    b.phaseT += dt;

    if (b.phase === "approach") {
      const e = easeInOutCubic(Math.min(1, b.phaseT / b.camSec));
      this.cam.setEye(b.camFromX + (b.camToX - b.camFromX) * e,
                      b.camFromZ + (b.camToZ - b.camFromZ) * e);
      this._focusBeyond(b.x, b.z, e);
      // 도착 직전에 배가 나타난다. 0에서 시작해 살짝 넘겼다가 제 크기로 앉는다 —
      // 아무것도 없던 수면에 배가 그냥 툭 나타나면 렌더 오류처럼 보인다.
      const lead = b.phaseT - (b.camSec - C.ARRIVAL_APPEAR_LEAD);
      const a = Math.max(0, Math.min(1, lead / C.ARRIVAL_APPEAR_LEAD));
      b.renderScale = C.ARRIVAL_SCALE * easeOutBack(a);
      if (b.phaseT >= b.camSec) {
        b.phase = "hold"; b.phaseT = 0;
        this.panel.showArrival(b.record);
      }
      return;
    }

    if (b.phase === "hold") {
      this.cam.setEye(b.camToX, b.camToZ);
      this._focusBeyond(b.x, b.z, 1);
      b.renderScale = C.ARRIVAL_SCALE;
      if (b.phaseT >= C.ARRIVAL_HOLD_SEC) {
        b.phase = "return"; b.phaseT = 0;
        this.panel.hideArrival();
      }
      return;
    }

    // 돌아가는 길. 이 구간부터 배도 흐르기 시작한다 (frame()의 stepBoat 조건).
    const k = Math.min(1, b.phaseT / b.camSec);
    const e = easeInOutCubic(k);
    this.cam.setEye(b.camToX * (1 - e), b.camToZ * (1 - e));
    this._focusBeyond(b.x, b.z, 1 - e);
    b.renderScale = C.ARRIVAL_SCALE + (1 - C.ARRIVAL_SCALE) * e;

    // 항적은 막 출발하는 이 배에만 준다 (셰이더 슬롯이 하나뿐이고, 지금 "떠나는"
    // 배도 이것뿐이다). 앞쪽에서 부풀었다가 잦아든다.
    const wake = this.water.material.uniforms.uWake.value;
    wake.set(b.x, b.z, b.heading, Math.sin(Math.PI * Math.min(1, k / 0.8)) * 0.7);

    if (k >= 1) {
      b.phase = null; b.renderScale = 1;
      wake.set(0, 0, 0, 0);
      this.arriving = null;
      this.cam.setEye(0, 0);
      this.cam.setFocus(0, 0, 0);
      const next = this.pending.shift();
      if (next) this._addRecord(next, true);   // 배는 차례가 온 지금 만들어진다
    }
  }

  /* ── 보정 화면 (?depths=1) ────────────────────────────────────────────────
   * 등장 배의 깊이 범위(ARRIVAL_DEPTH_MIN/MAX)를 숫자로 정하기 어려워서 만든 화면.
   * 주요 깊이마다 배를 한 척씩, 전부 같은 화면 가로 위치(왼쪽 절반의 한가운데)에
   * 놓는다. 깊이만 다르므로 화면에서 달라지는 건 크기와 세로 위치뿐이고, 그게 바로
   * 고르려는 값이다. 흐름은 세워 둔다(frame()의 speed).
   * 각 배 위에 그 깊이 숫자를 띄운다 — 보고 마음에 드는 범위를 고르면 된다.
   */
  _setupCalibration() {
    const depths = C.CALIBRATION_DEPTHS;
    this.calibLabels = [];
    const layer = document.createElement("div");
    layer.id = "calibLayer";
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40";
    document.body.appendChild(layer);

    for (const depth of depths) {
      // 화면 왼쪽 절반의 한가운데. 깊이마다 화면 반폭이 다르므로 월드 좌표도 달라진다.
      const x = this.cam.frameHalfWidthAt(depth) * 0.5;
      const record = {
        record_id: `calib-${depth}`, text: "", region: "아산", state: "stay",
        keywords: [], display_name: "익명", created_at: new Date().toISOString(),
      };
      const boat = makeBoat(record, { x0: x, depth, used: true }, x);
      boat.style = makeStyle(record);
      boat.arcX = 1; boat.arcZ = 0; boat.arcCut = Math.cos(Math.PI * 0.25);
      this.boats.push(boat);

      const tag = document.createElement("div");
      tag.textContent = String(depth);
      // 배 옆에 붙인다. 위에 놓으면 먼 배는 실루엣이 작아서 숫자가 배를 덮어 버린다.
      tag.style.cssText =
        "position:absolute;transform:translate(-125%,-50%);font:600 15px/1 ui-monospace,monospace;" +
        "color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:5px;white-space:nowrap";
      layer.appendChild(tag);
      this.calibLabels.push({ boat, tag });
    }
    this._reindex();
    // 통계 자리는 보정 안내로 바꿔 둔다. 가짜 기록으로 통계를 돌리면 빈 칸이 뜨는데,
    // 그게 고장인지 데이터가 없는 건지 구분이 안 된다.
    this.panel.pin(
      "등장 깊이 보정",
      `<span class="sv-headline"><span class="sv-head-word">${depths[0]}–${depths[depths.length - 1]}</span>` +
      `<span class="sv-head-rest">숫자는 카메라에서의 거리. 지금 설정은 ` +
      `${C.ARRIVAL_DEPTH_MIN}–${C.ARRIVAL_DEPTH_MAX} 사이에서 무작위로 고른다.</span></span>`
    );
  }

  /** 보정 화면의 숫자표를 각 배 위에 붙여 둔다 (월드 → 화면 투영). */
  _updateCalibLabels() {
    if (!this.calibLabels) return;
    const v = new THREE.Vector3();
    const w = window.innerWidth, h = window.innerHeight;
    for (const { boat, tag } of this.calibLabels) {
      v.set(boat.x, 0.35, boat.z).project(this.cam.camera);
      // 카메라 뒤로 넘어간 점은 투영이 뒤집힌다. 그냥 감춘다.
      if (v.z > 1) { tag.style.display = "none"; continue; }
      tag.style.display = "";
      tag.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      tag.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
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
      const d = Math.hypot(b.x - cx, b.z - cz);
      if (d > 24) continue;   // 24 밖은 어차피 세기가 0이다
      near.push({ b, x: b.x, z: b.z, d });
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
      // 보정 화면(?depths=1)에서는 흐름을 세운다 — 깊이마다 어떻게 보이는지 재는 게
      // 목적이라 배가 지나가 버리면 볼 수가 없다.
      const speed = CALIB ? 0 : this.flowSpeed;
      this.flowDist = wrapCorridor(this.flowDist + C.FLOW_DIR * speed * dt);
      for (let i = 0; i < this.boats.length; i++) {
        const b = this.boats[i];
        // 제시 중인 배는 흐르지 않는다. 카메라가 돌아가기 시작하는 'return'부터 다시 흐른다.
        // 뱃머리 흔들림은 멈춰 있는 동안에도 돌려야 혼자 죽은 물체로 보이지 않는다.
        if (!b.phase || b.phase === "return") stepBoat(b, dt, t, speed);
        else swayBoat(b, t);
        const x = b.x, z = b.z, heading = b.heading;
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
    if (CALIB) this._updateCalibLabels();

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
// 시선을 배보다 얼마나 더 멀리 둘지 (_beginArrival 머리말 참고)
const ARRIVAL_LOOK_FACTOR = 1.17;

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
// 나타날 때만 쓰는 오버슈트. 제 크기를 살짝 넘겼다가 앉아야 "나타났다"로 읽힌다.
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
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
    if (CALIB) { scene._setupCalibration(); return; }
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
