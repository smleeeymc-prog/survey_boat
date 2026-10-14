/* =============================================================================
 * world.js — '머무름의 지도'의 장면. 두 입구가 같이 쓴다.
 *
 *   index.html   (js/main.js)          전시 송출 — 시간표대로 저절로 돈다
 *   explore.html (js/explore/main.js)  인터랙티브 — 관람객이 끌고 당기고 배를 누른다
 *
 * 여기 있는 것: 렌더러·조명·하늘·바다·함대·등대 섬·틸트시프트·카메라, 배를 띄우고 흘리는 것,
 * 배 한 척을 크게 보여주는 연출(present), 물결 슬롯, 성능 워치독, 한 프레임(tick).
 * 여기 없는 것: 언제 무엇을 보여줄지(전시 시간표·인터랙티브 조작), 화면 글자(패널).
 * 연출의 고비마다 onPresent(사건, 배)를 불러 입구가 글자를 맞춘다 — 장면은 글자를 모른다.
 *
 * [10-06] 예전엔 main.js 의 MapScene 하나가 장면 조립과 전시 진행을 같이 했다. 인터랙티브 지도
 * (HANDOFF-map 25장)가 같은 바다·같은 배·같은 줌 연출을 써야 해서 장면만 떼어 냈다. 전시 화면의
 * 동작은 그대로다 — 코드를 옮겼을 뿐 값과 순서는 바꾸지 않았다.
 * ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as C from "./config.js";
import { buildWater, seaHeightAt, RIPPLE_MAX } from "./ocean.js";
import { ShipFleet } from "./fleet.js";
import { buildLandmarks } from "./landmarks.js";
import { makeSkyDome, skyDir } from "./sky.js";
import { setSurfaceFxSky, setSurfaceFxViewport, setBoatGrade } from "./surface-fx.js";
import { TiltShift } from "./tilt-shift.js";
import { arrivalSlot, makeBoat, swayBoat, wrapCorridor, makeRng, hashSeed, clockFlow, stageHalfWidthAt } from "./motion.js";
import { makeStyle } from "./style.js";
import { TourCamera } from "./camera.js";

// 바람 세기는 지도에서는 고정이다. 온보딩은 상태 선택에 따라 파도가 세지고 잦아들었지만,
// 여기서는 배마다 상태가 달라서 바다 하나에 하나의 값만 쓸 수 있다.
// 0.35 = 잔잔하되 죽지는 않은 정도 (ampScale 0.82, chop 0.20).
const WIND_T = 0.35;
// 배 기울기 상한(라디안) — config.js BOAT_TILT(도)
const TILT_KNEE = (C.BOAT_TILT.knee * Math.PI) / 180, TILT_CAP = (C.BOAT_TILT.cap * Math.PI) / 180;
// 줌이 겨누는 높이 — 흘수선이 아니라 선체·캐빈의 가운데쯤 (배 몸 높이 약 0.9)
const ARRIVAL_AIM_Y = 0.45;

/** 9:16 무대(#stage)의 크기 — 캔버스·카메라 비율은 창이 아니라 무대를 따른다(css/panel.css #stage). */
export function stageSize() {
  const el = document.getElementById("stage");
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: window.innerWidth, h: window.innerHeight };
}

export class MapWorld {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   * @param {string}  o.timeKey      시간대 팔레트 키
   * @param {boolean} [o.interactive] 리허설용 고개 돌리기(?interactive=1, camera.js attachPointer)
   * @param {string|null} [o.glassPin] 유리 단계를 고정했는가(?glass=) — 워치독이 유리는 안 건드린다
   * @param {boolean} [o.still]      흐름을 세운다(보정 화면 ?depths=1)
   */
  constructor(canvas, { timeKey, interactive = false, glassPin = null, still = false }) {
    const P = C.TIME_OF_DAY[timeKey];
    this.timeKey = timeKey;
    this.palette = P;
    this.glassPin = glassPin;
    this.still = still;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    // 온보딩과 같은 이유로 상한 1.5 — 파도 프래그먼트 셰이더가 전체화면을 덮는
    // 반투명 평면이라 픽셀비가 커질수록 비용이 거의 제곱으로 는다.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    // 그림자는 쓰지 않는다 (fleet.js 머리말 참고) — 패스 자체를 켜지 않는다.
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.sky = makeSkyDome(P, timeKey);   // 그라디언트·수평선 안개·해안선·구름·해 번짐(sky.js)
    this.scene.add(this.sky);
    // 안개 = 바다 타일의 끝을 가리는 유일한 장치. 타일 반경(70)보다 확실히 안쪽에서
    // 끝나야 경계가 드러나지 않는다.
    this.scene.fog = new THREE.Fog(P.fog, C.FOG_NEAR, C.FOG_FAR);

    // 조명 비율은 설문과 같은 값을 쓴다(shared/look-tokens.js). 설문은 평평한 채움광(Ambient)을
    // 줄이고 반구광(위 = 하늘색, 아래 = 바닷색)으로 대신했다 — 면이 위를 보느냐 옆을 보느냐에 따라
    // 채움광 색이 달라져서 입체가 산다. 이걸 안 따라가면 같은 텍스처가 지도에서만 평평하고
    // 밝게 뜬다. 톤 매핑은 없음(SCENE_LOOK.tone "none") = three 기본값이라 따로 안 건드린다.
    // 조명 개수는 처음부터 고정한다. three.js는 조명 수가 바뀌면 모든 재질을 다시 컴파일한다.
    // 물은 커스텀 셰이더라 이 조명들을 안 받는다(설문도 같다).
    const B = C.SCENE_BRIGHTNESS, L = C.SCENE_LOOK;
    this.scene.add(new THREE.AmbientLight(P.amb, P.ambI * B * L.ambScale));
    // 해·테두리광 자리는 팔레트 값의 z를 뒤집어 쓴다. 설문 카메라는 배의 +Z 쪽(좌현)에서, 지도 카메라는
    // −Z 쪽(우현)에서 본다 — 지도 화면은 설문 화면을 배 중심선에 대해 거울에 비춘 것이다. 팔레트 값을
    // 그대로 쓰면 해가 배 뒤로 가서 카메라 쪽 옆면이 전부 그늘이 됐다(선체·마스트·캐빈이 설문 실측의
    // 0.6~0.7배 — HANDOFF-map 18.9). 조명도 같이 비춰야 두 화면의 배가 같은 색으로 찍힌다.
    // 물은 이 조명을 안 받고 반짝임 방향을 따로 가진다(ocean.js uSunDirection) — 그대로 둔다.
    const sun = new THREE.DirectionalLight(P.sun, P.sunI * B * L.sunScale);
    sun.position.set(P.sunPos[0], P.sunPos[1], -P.sunPos[2]).multiplyScalar(6);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(P.rim, P.rimI * B);   // 테두리광은 설문도 배수 없이 팔레트 값
    rim.position.set(-3, 1, 2).multiplyScalar(6);                // 설문 (-3, 1, -2)의 z 거울상 (위 참고)
    this.scene.add(rim);
    // 반구광 — 하늘 쪽은 팔레트 하늘 띠 하나를 회색 쪽으로 조금 뺀 색(원색 그대로면 배가
    // 하늘색으로 물든다), 바닥 쪽은 바닷색을 어둡게 한 색.
    const H = C.HEMI;
    const hemiSky = new THREE.Color(P.sky[H.skyBand]);
    const lum = hemiSky.r * 0.2126 + hemiSky.g * 0.7152 + hemiSky.b * 0.0722;
    hemiSky.lerp(new THREE.Color(lum, lum, lum), H.skyDesat);
    const hemiGround = new THREE.Color(P.ocean).multiplyScalar(H.groundMul);
    this.scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, P.ambI * B * L.hemiScale));
    // 배 광택·테두리 빛이 비칠 하늘색 — 지금 시간대 하늘 띠(surface-fx.js, 설문과 같은 규칙)
    setSurfaceFxSky(P.sky);
    // 배 색을 바다에 앉히기 — 멀수록 그 시간대 안개색으로(config.js BOAT_GRADE, surface-fx.js 머리말)
    setBoatGrade({ ...C.BOAT_GRADE, hazeColor: P.fog });

    this.water = buildWater();
    this.scene.add(this.water);
    const wu = this.water.material.uniforms;
    wu.uOceanColor.value.setHex(P.ocean);
    wu.uSkyColor.value.setHex(P.skyRefl);
    wu.uSpecColor.value.setHex(P.spec);
    // 윤슬 — 하늘의 해(달) 번짐과 같은 방향·색(config.js SKY_LOOK)
    const SL = C.SKY_LOOK[timeKey] || C.SKY_LOOK.day;
    wu.uGlintDir.value.copy(skyDir(SL.sun.az, SL.sun.el));
    wu.uGlintColor.value.set(SL.sun.color);
    wu.uGlintAmt.value = SL.sun.glint;
    wu.uSpecStrength.value = P.specI;
    wu.uExposure.value = P.exposure * B;
    wu.uChop.value = 0.32 * (0.4 + 0.6 * WIND_T);
    wu.uAmpScale.value = 0.5 + 0.9 * WIND_T;
    this.ampScale = wu.uAmpScale.value;
    this.scene.fog.color.setHex(P.fog);
    wu.fogColor.value.setHex(P.fog);
    wu.fogNear.value = C.FOG_NEAR;
    wu.fogFar.value = C.FOG_FAR;

    this.cam = new TourCamera(stageSize().w / stageSize().h, interactive);
    this.cam.attachPointer(canvas);

    this.tilt = new TiltShift(document);
    this.boats = [];
    this.fleet = null;
    this.landmarks = null;
    this.presenting = null;       // 지금 크게 보여주는 배 (동시에 하나뿐)
    /** 연출의 고비 — (사건, 배). incoming · shown · hiding · done · cancel (present 머리말) */
    this.onPresent = null;
    /** 매 프레임 카메라를 갱신하기 직전 — 인터랙티브가 시점을 여기서 밀어 넣는다 */
    this.onFrame = null;
    /** 관람객이 렌즈를 당긴 정도(0~1, 인터랙티브) — 틸트시프트 초점을 화면 가운데로 옮긴다 */
    this.lensT = 0;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    // 흐름이 지금 띠를 얼마나 밀었는가. 배는 전부 "자리 + 이 값"에 있다(latticeX).
    // [10-14] 벽시계에서 계산한다(motion.js clockFlow) — 전시 화면·둘러보기·새로고침이 같은 바다를 본다.
    // 배를 보여주느라 흐름을 늦춘 만큼은 시계보다 뒤처지고(_lag, 월드 단위), 끝나면 조금 빨리 흘러 따라잡는다.
    this.flowDist = 0;
    this._lag = 0;
    this._flowMul = 1;

    // 성능 워치독 — 온보딩과 같은 패턴이되, 리퀴드 글래스까지 같은 스위치에 물린다.
    // 배경이 매 프레임 변하는 WebGL 캔버스라 backdrop-filter가 정적 배경보다 훨씬 비싸다.
    // 판정 시계는 elapsed(장면 시간)가 아니라 실제 벽시계다 — dt를 0.05로 자르기 때문에,
    // 정말 느린 기기에서는 장면 시간이 벽시계의 몇 분의 일로만 흐른다. 그걸 기준으로 재면
    // 렉이 심할수록 절전이 늦게 켜지는, 정확히 반대 방향의 동작이 된다.
    this._perf = { samples: [], wall: 0, checkAt: 2.0, step: 0 };

    this._rippleScratch = [];
    // 흐름 속도는 "기준 깊이의 배가 FLOW_CROSS_SEC초에 화면을 건넌다"로 정의돼 있다. 화면은 9:16 무대라
    // 무대 폭에서 한 번 계산하고 기기·창 크기와 상관없이 고정한다 — 화면마다 다르면 시계를 맞춰도 자리가 어긋난다.
    this.flowSpeed = (2 * stageHalfWidthAt(C.FLOW_REF_DEPTH)) / C.FLOW_CROSS_SEC;
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const { w, h } = stageSize();
    this.renderer.setSize(w, h, false);
    this._syncFxViewport();
    this.cam.setAspect(w / h);
  }

  /** 표면 효과가 "배가 화면에서 몇 픽셀인가"를 재는 기준 — 그리기 버퍼 높이(픽셀비 포함). */
  _syncFxViewport() {
    setSurfaceFxViewport(this.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  }

  async load() {
    const gltf = await loadShipGltf();
    this.fleet = new ShipFleet(gltf.scene, C.FLEET_CAPACITY);
    this.scene.add(this.fleet.group);
    // 먼 바다의 등대 섬 — fleet 이 Ship 쪽 노드를 가져간 뒤에 남은 섬 노드로 만든다(landmarks.js)
    this.landmarks = buildLandmarks(gltf.scene, this.timeKey);
    this.scene.add(this.landmarks.group);
  }

  /* ── 배 띄우기 ──────────────────────────────────────────────────────────── */

  /** 그 자리가 "지금" 있는 곳. 흐름이 띠를 민 만큼 더해서 접는다. */
  latticeX(slot) { return wrapCorridor(slot.x0 + this.flowDist); }

  /**
   * 기록 하나를 바다에 놓는다. 처음 쌓여 있던 기록(쓰인 차례대로 — store.js onReady)도, 방금 도착한 기록도 같은 길이다.
   * 자리는 그 기록이 쓰인 시각에 화면 왼쪽 등장 구역에서 이웃과 먼 곳(motion.js arrivalSlot) —
   * 방금 쓴 기록이면 지금 왼쪽이라 거기서 떠오르고, 오래된 기록은 그 뒤로 흘러간 만큼 가 있다.
   * 난수(과녁)는 record_id 에서 — 같은 기록이면 어느 화면에서 열어도 같은 자리다.
   * [10-14] 예전엔 쌓인 기록은 섞어 둔 순서대로, 새 기록은 그때 빈 곳을 따로 찾아(pickArrivalSpot) 놓고
   * 보여주는 동안 그 배만 세워 뒀다. 그래서 화면마다·켤 때마다 바다가 달랐다.
   */
  placeRecord(record) {
    const now = Date.now();
    const t = Date.parse(record.created_at);
    const at = (Number.isFinite(t) ? Math.min(t, now) : now) / 1000;
    const rng = makeRng(hashSeed(String(record.record_id)) ^ 0x5f3a);
    const slot = arrivalSlot(this.boats, clockFlow(at, this.flowSpeed), rng);
    return this._addBoat(record, slot, this.latticeX(slot));
  }

  /** 등장 연출을 받을 새 기록 — 놓는 법은 placeRecord 와 같다(이름은 부르는 쪽 읽기 좋으라고 둔다). */
  spawnArrival(record) { return this.placeRecord(record); }

  _addBoat(record, slot, spawnX) {
    const boat = makeBoat(record, slot, spawnX);
    // "이 배가 어떻게 생겼는지"는 전부 여기서 한 번 정해진다 (style.js — 키워드 요소·배 색·소품 칠·고양이 무늬).
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
      if (this.presenting === gone) this._cancelPresent();
    }
    this.reindex();
    return boat;
  }

  /** 기록이 지워졌다(운영자가 가림). 그 배를 뺀다. 보여주던 배였으면 연출을 끊는다. */
  removeBoat(recordId) {
    const i = this.boats.findIndex((b) => b.record.record_id === recordId);
    if (i < 0) return null;
    const gone = this.boats[i];
    if (this.presenting === gone) this._cancelPresent();
    this.boats.splice(i, 1);
    this.reindex();
    return gone;
  }

  boatOf(recordId) { return this.boats.find((b) => b.record.record_id === recordId) || null; }

  /** 배 목록이 바뀌면 인스턴스 인덱스가 밀린다 — 색·소품을 다시 써 준다. */
  reindex() {
    if (!this.fleet) return;
    this.fleet.setCount(this.boats.length);
    for (let i = 0; i < this.boats.length; i++) this.fleet.applyStyle(i, this.boats[i].style);
  }

  /* ── 배 한 척을 크게 보여주기 ──────────────────────────────────────────── */

  /**
   * 기획서 연출: 새 기록은 5~8초간 크게 제시된 뒤 기존 기록들 사이에 남는다.
   *
   * 배는 자기 자리에 생겨서 그대로 있고, 카메라는 제자리에서 그쪽으로 고개를 돌려 렌즈를
   * 당긴다(camera.js 머리말 — 수면 위를 날아가지 않는다).
   *   approach  고개를 돌리며 줌. 줌이 끝나기 0.3초 전에 배가 나타난다       → onPresent("incoming") 시작할 때
   *   hold      문장 카드를 띄우고 머문다. 흐름이 늦춰진다(카메라가 따라간다) → ("shown") 줌이 끝났을 때
   *   return    카드를 내리고 줌을 푼다. 흐름이 제 속도로 돌아온다          → ("hiding") · 다 풀리면 ("done")
   *
   * 줌 배율은 "예전 제시 화면보다 배가 3배 크게"(config.js ARRIVAL_ZOOM). 배가 화면에서
   * 차지하는 크기는 거리 × tan(화각/2) 에 반비례하므로 배까지 거리로 화각을 정한다.
   * 배는 화면 가운데보다 조금 위(ARRIVAL_FRAME_Y)에 둔다 — 아래에 방금 도착한 문장이 뜬다.
   *
   * 인터랙티브는 이미 떠 있는 배도 이렇게 본다(opts.appear = false — 나타나는 연출이 없다).
   * 어느 쪽이든 배를 혼자 세우지 않는다: 혼자 서 있으면 이웃이 옆을 지나가 격자 간격이 깨진다. 대신 흐름
   * 전체를 늦추고(ARRIVAL_FLOW_MUL) 카메라가 그 배를 따라간다 — 상대 위치가 그대로다.
   * [10-14] 새 배도 이제 그렇다(예전엔 새 배만 세워 두고 다시 흐를 때 격자 좌표를 새로 줬다 — 시계 흐름과 안 맞는다).
   * 머무는 시간도 정해져 있지 않을 수 있다(hold = Infinity) — release() 로 푼다.
   *
   * @param {object} boat
   * @param {{appear?: boolean, hold?: number, zoomSec?: number}} [opts] appear 새로 나타나는 배인가(기본 true) ·
   *   hold 머무는 초 · zoomSec 줌인·줌아웃 초(인터랙티브의 누른 배는 더 빠르다 — config.js EXPLORE_PICK)
   */
  present(boat, { appear = true, hold = C.ARRIVAL_HOLD_SEC, zoomSec = C.ARRIVAL_ZOOM_SEC } = {}) {
    boat.phase = "approach";
    boat.phaseT = 0;
    boat.hop = false;
    boat.appear = appear;
    boat.holdSec = hold;
    boat.renderScale = appear ? 0 : 1;      // 새 배는 줌이 거의 끝날 때까지 안 보인다
    const slant = Math.hypot(boat.x, C.CAM_HEIGHT - ARRIVAL_AIM_Y, boat.z);
    boat.zoomTan = (C.ARRIVAL_REF_SLANT * Math.tan((C.CAM_FOV * Math.PI) / 360)) / C.ARRIVAL_ZOOM / slant;
    this.cam.setZoomTarget(boat.x, ARRIVAL_AIM_Y, boat.z, boat.zoomTan, C.ARRIVAL_FRAME_Y);
    boat.camSec = zoomSec;
    this.presenting = boat;
    // 카메라가 먼저 움직인다. 화면의 통계 카드는 지금 바로 비켜서고(panel.js), 줌이 끝나
    // 배가 선 뒤에(hold) 문장 카드가 뜬다 — 레퍼런스의 순서.
    this._emit("incoming", boat);
  }

  /**
   * 보는 중인 배에서 다른 떠 있는 배로 바로 옮겨 간다(인터랙티브 — 10-11 사용자: 줌아웃했다 다시 줌인하지 말고
   * 곧장 그 배로). 카메라는 지금 보고 있는 데서 새 배의 줌으로 hopSec 동안 옮겨 간다(camera.js hopFrom) —
   * 렌즈도 새 배 거리에 맞춰 당기거나 푼다. 보던 배는 그 자리에서 다시 흐른다(떠 있던 배라 격자 그대로).
   * 새로 나타나는 중인 배(appear — 나타나는 연출 중)를 보는 중이면 옮겨 가지 않는다 → false(예전처럼 닫고 다시).
   * 이벤트: 보던 배 "hiding" → 새 배 "incoming" → 옮겨 가기가 끝나면 "shown".
   * @returns {boolean} 옮겨 갔는가
   */
  switchTo(boat, { hold = Infinity, hopSec = C.ARRIVAL_ZOOM_SEC, zoomSec = C.ARRIVAL_ZOOM_SEC } = {}) {
    const a = this.presenting;
    if (!a || a.appear || boat === a || boat.phase) return false;
    a.phase = null; a.renderScale = 1; a.hop = false;
    this._emit("hiding", a);
    this.cam.hopFrom();
    boat.phase = "approach";
    boat.phaseT = 0;
    boat.hop = true;
    boat.appear = false;
    boat.holdSec = hold;
    boat.renderScale = 1;
    const slant = Math.hypot(boat.x, C.CAM_HEIGHT - ARRIVAL_AIM_Y, boat.z);
    boat.zoomTan = (C.ARRIVAL_REF_SLANT * Math.tan((C.CAM_FOV * Math.PI) / 360)) / C.ARRIVAL_ZOOM / slant;
    this.cam.setZoomTarget(boat.x, ARRIVAL_AIM_Y, boat.z, boat.zoomTan, C.ARRIVAL_FRAME_Y);
    boat.camSec = hopSec;
    boat.returnSec = zoomSec;   // 닫을 때 줌아웃은 이 배의 보통 줌 시간으로
    this.presenting = boat;
    this._emit("incoming", boat);
    return true;
  }

  /** 머무는 중인 연출을 지금 푼다(인터랙티브의 닫기). 다가가는 중이었으면 그 자리에서 되돌아간다. */
  release() {
    const b = this.presenting;
    if (!b || b.phase === "return") return;
    // 옮겨 가던 중이면 지금 보고 있는 데를 줌 끝으로 굳히고 거기서부터 푼다
    if (b.hop) { this.cam.endHop(); b.hop = false; if (b.returnSec) b.camSec = b.returnSec; this._startReturn(b, 1); return; }
    // 다가가던 중이면 그만큼 당겨진 데서부터 풀어야 카메라가 튀지 않는다
    const k = b.phase === "approach" ? Math.min(1, b.phaseT / b.camSec) : 1;
    this._startReturn(b, k);
  }

  _startReturn(b, from = 1) {
    b.phase = "return";
    b.phaseT = (1 - from) * b.camSec;
    b.renderScale = b.appear ? C.ARRIVAL_SCALE : 1;
    this._emit("hiding", b);
  }

  _cancelPresent() {
    const b = this.presenting;
    this.presenting = null;
    if (b) { b.phase = null; b.renderScale = 1; b.hop = false; }
    this.cam.endHop();
    this._emit("cancel", b);
  }

  _emit(ev, b) { if (this.onPresent) this.onPresent(ev, b); }

  _updatePresent(dt) {
    const b = this.presenting;
    if (!b) { this.cam.setZoomProgress(0); return; }
    b.phaseT += dt;
    // 카메라가 그 배를 따라간다(흐름이 늦춰졌을 뿐 멈추진 않았다 — present 머리말)
    if (b.phase !== "return") this.cam.setZoomTarget(b.x, ARRIVAL_AIM_Y, b.z, b.zoomTan, C.ARRIVAL_FRAME_Y);

    if (b.phase === "approach" && b.hop) {
      this.cam.setZoomProgress(1);
      this.cam.setHopProgress(b.phaseT / b.camSec);
      if (b.phaseT >= b.camSec) {
        this.cam.endHop();
        b.hop = false;
        if (b.returnSec) b.camSec = b.returnSec;
        b.phase = "hold"; b.phaseT = 0;
        this._emit("shown", b);
      }
      return;
    }

    if (b.phase === "approach") {
      this.cam.setZoomProgress(b.phaseT / b.camSec);
      if (b.appear) {
        // 줌이 끝나기 직전에 배가 나타난다. 0에서 시작해 살짝 넘겼다가 제 크기로 앉는다 —
        // 아무것도 없던 수면에 배가 그냥 툭 나타나면 렌더 오류처럼 보인다.
        const lead = b.phaseT - (b.camSec - C.ARRIVAL_APPEAR_LEAD);
        const a = Math.max(0, Math.min(1, lead / C.ARRIVAL_APPEAR_LEAD));
        b.renderScale = C.ARRIVAL_SCALE * easeOutBack(a);
      }
      if (b.phaseT >= b.camSec) {
        b.phase = "hold"; b.phaseT = 0;
        this._emit("shown", b);
      }
      return;
    }

    if (b.phase === "hold") {
      this.cam.setZoomProgress(1);
      if (b.appear) b.renderScale = C.ARRIVAL_SCALE;
      if (b.phaseT >= b.holdSec) this._startReturn(b);
      return;
    }

    // 줌을 푸는 길. 흐름이 제 속도로 돌아온다 (tick()의 _flowMul).
    const k = Math.min(1, b.phaseT / b.camSec);
    this.cam.setZoomProgress(1 - k);
    const wake = this.water.material.uniforms.uWake.value;
    if (b.appear) {
      b.renderScale = C.ARRIVAL_SCALE + (1 - C.ARRIVAL_SCALE) * easeInOutCubic(k);
      // 항적은 막 출발하는 이 배에만 준다 (셰이더 슬롯이 하나뿐이고, 지금 "떠나는"
      // 배도 이것뿐이다). 앞쪽에서 부풀었다가 잦아든다.
      wake.set(b.x, b.z, b.heading, Math.sin(Math.PI * Math.min(1, k / 0.8)) * 0.7);
    }

    if (k >= 1) {
      b.phase = null; b.renderScale = 1;
      wake.set(0, 0, 0, 0);
      this.presenting = null;
      this.cam.setZoomProgress(0);
      this._emit("done", b);
    }
  }

  /* ── 매 프레임 ──────────────────────────────────────────────────────────── */

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
    if (this.glassPin && p.step === 0) p.step = 1;   // 유리를 고정했으면 3D 절전만 판단한다
    p.wall += rawDt;
    p.samples.push(rawDt);
    if (p.wall < p.checkAt) return;

    const avg = p.samples.reduce((a, b) => a + b, 0) / p.samples.length;
    p.samples.length = 0;
    p.checkAt = p.wall + 3.0;

    // 0차: 틸트시프트가 가장 먼저 꺼진다 — 매 프레임 바뀌는 캔버스 위 backdrop-filter라 비싸고,
    // 없어도 화면 내용은 그대로다. 끈 뒤 3초를 다시 재서 나머지 단계를 판단한다.
    if (this.tilt.enabled && avg > 0.026) { this.tilt.disable(); return; }

    if (p.step === 0) {
      // 1차: 온보딩과 같은 기준(33fps 미만). 3D 쪽 사치품부터 끈다.
      if (avg > 0.030) {
        const u = this.water.material.uniforms;
        u.uSpecOn.value = 0.0;
        u.uRippleOn.value = 0.0;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
        this._syncFxViewport();
        document.documentElement.dataset.glass = "blur";   // 굴절도 같이 내린다
        p.step = 2;
      } else p.step = 1;
      return;
    }
    // 2차: 3D는 멀쩡한데 프레임이 모자라면 범인은 유리다(굴절 → 블러 → 없음).
    if (this.glassPin) { if (p.wall > 20) p.step = 3; return; }
    if (avg > 0.026) {
      const cur = document.documentElement.dataset.glass;
      document.documentElement.dataset.glass = cur === "lens" ? "blur" : "flat";
      if (cur !== "lens") p.step = 3;
    } else if (p.wall > 20) p.step = 3;        // 20초 넘게 멀쩡하면 그만 본다
  }

  /** 한 프레임 — 흐름·연출·카메라를 굴리고 그린다. 장면 시간 dt(상한 0.05)를 돌려준다. */
  tick() {
    // 원본과 같은 이유로 dt에 상한을 둔다 — 탭이 백그라운드에 있다가 돌아오면
    // 한 프레임에 몇 초가 밀려들어와 배가 순간이동한다.
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.elapsed += dt;
    const t = this.elapsed;

    this._watchdog(Math.min(1, rawDt));
    if (this.onFrame) this.onFrame(dt);
    this.cam.update(dt);
    this._updatePresent(dt);

    // 바다는 월드에 고정이다 — 카메라를 따라 옮기지 않는다(ocean.js buildWater 머리말).
    this.water.material.uniforms.uTime.value = t;
    // 하늘 돔은 방향만 의미가 있다. 카메라가 숨쉬기로 오르내려도 하늘이 따라 흔들리지 않게 붙여 둔다.
    this.sky.position.copy(this.cam.pos);
    this.sky.material.uniforms.uTime.value = t;   // 구름이 아주 천천히 흐른다

    if (this.fleet) {
      const d = 0.5;   // 파도 기울기를 재는 간격
      // 보정 화면(?depths=1)에서는 흐름을 세운다 — 깊이마다 어떻게 보이는지 재는 게
      // 목적이라 배가 지나가 버리면 볼 수가 없다.
      // 배를 보여주는 동안(줌·머묾)은 흐름을 늦춘다 — 이웃이 줌 화면을 쓸고 지나가지 않게(ARRIVAL_FLOW_MUL)
      // 흐름은 시계를 따르고(constructor 의 flowDist 주석), 늦춘 만큼(_lag) 뒤처졌다가 FLOW_CATCHUP 까지 빨리 흘러 따라잡는다.
      // 따라잡는 속도는 남은 차이에 비례해 줄어 — 시계에 닿을 때 툭 느려지지 않는다. 차이는 띠 한 바퀴로 접는다(앞서 있으면 늦춘다).
      const a = this.presenting;
      const slow = a && (a.phase === "approach" || a.phase === "hold");
      const W = C.FLOW_CORRIDOR_W;
      this._lag -= W * Math.round(this._lag / W);
      const mulTo = slow ? C.ARRIVAL_FLOW_MUL
        : 1 + Math.max(-C.FLOW_CATCHUP, Math.min(C.FLOW_CATCHUP, this._lag / (this.flowSpeed * 4)));
      this._flowMul += (mulTo - this._flowMul) * Math.min(1, dt * 2.5);
      this._lag += (1 - this._flowMul) * this.flowSpeed * dt;
      this.flowDist = this.still ? 0
        : wrapCorridor(clockFlow(Date.now() / 1000, this.flowSpeed) - C.FLOW_DIR * this._lag);
      for (let i = 0; i < this.boats.length; i++) {
        const b = this.boats[i];
        // 배는 자리를 떠나지 않는다 — 자리 + 흐름. 뱃머리 흔들림은 거의 서 있을 때도 돌려야 죽은 물체로 안 보인다.
        b.x = this.latticeX(b.slot);
        swayBoat(b, t);
        const x = b.x, z = b.z, heading = b.heading;
        const scale = b.phase ? b.renderScale : 1;

        // 파고와 기울기. 셋만 재서 기울기를 얻고(전진차분), 뱃머리 방향으로 투영한다.
        const h0 = seaHeightAt(x, z, t, 0, this.ampScale);
        const gxh = (seaHeightAt(x + d, z, t, 0, this.ampScale) - h0) / d;
        const gzh = (seaHeightAt(x, z + d, t, 0, this.ampScale) - h0) / d;
        const ch = Math.cos(heading), sh = Math.sin(heading);
        // 뱃머리가 +X라 앞뒤 흔들림(피치)은 Z축 회전, 좌우 흔들림(롤)은 X축 회전이다.
        let pitch = -(gxh * ch + gzh * sh) * 1.5;
        let roll = (-gxh * sh + gzh * ch) * 1.5;
        // 기울기 상한 — 앞뒤·좌우를 합친 기울기가 TILT.cap 을 넘지 않게 부드럽게 누른다(방향은 그대로).
        const tilt = Math.hypot(pitch, roll);
        if (tilt > TILT_KNEE) {
          const k = (TILT_KNEE + (TILT_CAP - TILT_KNEE) * Math.tanh((tilt - TILT_KNEE) / (TILT_CAP - TILT_KNEE))) / tilt;
          pitch *= k; roll *= k;
        }
        this.fleet.writeMatrix(i, x, h0, z, heading, scale, pitch, roll);
      }
      this.fleet.commit();
    }

    this._updateRipples();
    // 틸트시프트 초점 띠 — 평소엔 배들이 흐르는 수면, 배를 보여주는 중엔 줌하는 만큼 그 배로(tilt-shift.js)
    this.tilt.update(this.cam.camera, this.presenting, this.cam._zoomT, C.FLEET_SHIP_SCALE, this.lensT);
    this.renderer.render(this.scene, this.cam.camera);
    return dt;
  }

  /** 월드 점의 무대 위 위치(px). 카메라 뒤면 null. */
  toStage(x, y, z, out = {}) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(x, y, z).project(this.cam.camera);
    if (v.z > 1) return null;
    const { w, h } = stageSize();
    out.x = (v.x * 0.5 + 0.5) * w;
    out.y = (-v.y * 0.5 + 0.5) * h;
    return out;
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

// 나타날 때만 쓰는 오버슈트. 제 크기를 살짝 넘겼다가 앉아야 "나타났다"로 읽힌다.
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smoothstep = (a, b, x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
