/* =============================================================================
 * main.js — '머무름의 지도' 전시 송출(index.html)의 진행.
 *
 * 장면(바다·배·하늘·카메라·배를 크게 보여주는 연출)은 world.js 가 만든다 — 인터랙티브 입구
 * (explore.html)와 같이 쓴다. 여기 있는 건 전시 화면만의 진행이다:
 *   · 저장소(store) → 기록이 오면 배를 띄우고, 새 기록이면 차례대로 크게 보여준다(줄은 최대 3)
 *   · 패널(panel) — 풍경/통계 시간표, 누적 수, 방금 도착한 문장
 *   · 보정 화면(?depths=1) · 디버그 오버레이(?debug=1)
 * ========================================================================== */

import * as C from "./config.js";
import * as THREE from "three";
import { MapWorld, stageSize } from "./world.js";
import { makeBoat } from "./motion.js";
import { makeStyle } from "./style.js";
import { Panel } from "./panel.js";
import { pickStore } from "./store.js";
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

// 등장 연출을 기다리는 줄의 상한 (_addRecord 참고)
const ARRIVAL_QUEUE_MAX = 3;

class Exhibit {
  constructor(canvas) {
    this.world = new MapWorld(canvas, {
      timeKey: TIME_KEY, interactive: qs.get("interactive") === "1", glassPin: GLASS_PIN, still: CALIB,
    });
    this.panel = new Panel(document);
    this.records = [];
    this.pending = [];            // 연출이 밀렸을 때 줄 세워 둔 '기록'들 (배가 아니다)
    // 연출의 고비마다 패널을 맞춘다(panel.js 머리말 "새 배가 들어오면")
    this.world.onPresent = (ev, b) => {
      if (ev === "incoming") this.panel.incoming();
      else if (ev === "shown") this.panel.showArrival(b.record);
      else if (ev === "hiding") this.panel.hideArrival();
      else if (ev === "cancel") this.panel.endLive();
      else if (ev === "done") {
        const next = this.pending.shift();
        if (next) this._addRecord(next, true);   // 배는 차례가 온 지금 만들어진다
        else this.panel.endLive();               // 줄이 비었으면 끊긴 장면(풍경·통계)으로 돌아간다
      }
    };
  }

  // 콘솔·E2E(firebase/test/e2e.mjs)가 들여다보는 이름들 — 장면을 world.js 로 옮기기 전과 같게
  get boats() { return this.world.boats; }
  get fleet() { return this.world.fleet; }
  get arriving() { return this.world.presenting; }
  get cam() { return this.world.cam; }
  get tilt() { return this.world.tilt; }
  get landmarks() { return this.world.landmarks; }
  get scene() { return this.world.scene; }

  async load() {
    await this.world.load();
    runSelfChecks(this.world);
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
        // 숫자와 통계는 배가 관람객 눈앞에 나타날 때 +1 된다 (panel.js 머리말)
        this.panel.expect(record);
        this.panel.setRecords(this.records);
        this._addRecord(record, true);
      },
      onRemove: (recordId) => this._removeRecord(recordId),
    });
  }

  _addRecord(record, announce) {
    // 앞 연출이 아직 안 끝났으면 배를 만들지 않고 기록만 줄 세운다.
    // 예전에는 배를 먼저 바다에 놓고 줄을 세웠는데, 그러면 차례를 기다리는 동안 배가
    // 흘러가 버려서 "얼어 있을 시간만큼 미리 밀어 둔" 보정이 통째로 어긋났다. 게다가
    // 줄에서 밀려난 배까지 전부 화면 왼쪽의 좁은 창에 놓여 서로 겹쳤다(실측 간격 0.08).
    if (announce && this.world.presenting) {
      this.pending.push(record);
      // 제시는 한 번에 10초 남짓 걸린다. 관람객이 몰려 제출이 그보다 빨리 들어오면
      // 줄이 계속 길어져서, "방금 도착한 문장" 카드가 몇 분 전 문장을 보여주게 된다.
      // 줄이 길면 가장 오래 기다린 것부터 연출 없이 바다에 놓는다 — 버리는 건 연출뿐이다.
      while (this.pending.length > ARRIVAL_QUEUE_MAX) this._addRecord(this.pending.shift(), false);
      return;
    }
    if (!announce) {
      // 연출 없이 바다에 놓이는 기록은 지금 바로 센다(줄이 밀려 연출을 건너뛴 경우 포함)
      this.panel.reveal(record.record_id);
      this.world.placeRecord(record);
      return;
    }
    this.world.present(this.world.spawnArrival(record));
  }

  _removeRecord(recordId) {
    this.world.removeBoat(recordId);   // 제시 중이던 배면 world 가 "cancel" → panel.endLive()
    const q = this.pending.findIndex((r) => r.record_id === recordId);
    if (q >= 0) this.pending.splice(q, 1);   // 아직 제시 못 한 기록이 지워진 경우
    const j = this.records.findIndex((r) => r.record_id === recordId);
    if (j >= 0) { this.records.splice(j, 1); this.panel.setRecords(this.records); }
    // 제시 중이던 배가 지워졌으면 줄의 다음 차례를 바로 부른다. 안 그러면 줄에 선 기록은
    // 다음 제출이 들어올 때까지 연출을 못 받는다(다음 차례는 원래 연출이 끝날 때 부른다).
    if (!this.world.presenting && this.pending.length) this._addRecord(this.pending.shift(), true);
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
    (document.getElementById("stage") || document.body).appendChild(layer);   // 무대 안 — 위치를 무대 기준 px로 적는다

    for (const depth of depths) {
      // 화면 왼쪽 절반의 한가운데. 깊이마다 화면 반폭이 다르므로 월드 좌표도 달라진다.
      const x = this.world.cam.frameHalfWidthAt(depth) * 0.5;
      const record = {
        record_id: `calib-${depth}`, text: "", region: "아산", state: "stay",
        keywords: [], display_name: "익명", created_at: new Date().toISOString(),
      };
      const boat = makeBoat(record, { x0: x, depth, used: true }, x);
      boat.style = makeStyle(record);
      boat.arcX = 1; boat.arcZ = 0; boat.arcCut = Math.cos(Math.PI * 0.25);
      this.world.boats.push(boat);

      const tag = document.createElement("div");
      tag.textContent = String(depth);
      // 배 옆에 붙인다. 위에 놓으면 먼 배는 실루엣이 작아서 숫자가 배를 덮어 버린다.
      tag.style.cssText =
        "position:absolute;transform:translate(-125%,-50%);font:600 15px/1 ui-monospace,monospace;" +
        "color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:5px;white-space:nowrap";
      layer.appendChild(tag);
      this.calibLabels.push({ boat, tag });
    }
    this.world.reindex();
    // 통계는 멈추고 제목 아랫줄에 보정 안내를 적는다. 가짜 기록으로 통계를 돌리면 빈 칸이 뜨는데,
    // 그게 고장인지 데이터가 없는 건지 구분이 안 된다. 가운데 카드는 띄우지 않는다 — 보려는 배를 덮는다.
    this.panel.pin(
      "등장 깊이 보정",
      `숫자는 카메라에서의 거리 · 지금 설정 ${C.ARRIVAL_DEPTH_MIN}–${C.ARRIVAL_DEPTH_MAX}`
    );
  }

  /** 보정 화면의 숫자표를 각 배 위에 붙여 둔다 (월드 → 화면 투영). */
  _updateCalibLabels() {
    if (!this.calibLabels) return;
    const v = new THREE.Vector3();
    const { w, h } = stageSize();
    for (const { boat, tag } of this.calibLabels) {
      v.set(boat.x, 0.35, boat.z).project(this.world.cam.camera);
      // 카메라 뒤로 넘어간 점은 투영이 뒤집힌다. 그냥 감춘다.
      if (v.z > 1) { tag.style.display = "none"; continue; }
      tag.style.display = "";
      tag.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
      tag.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    }
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const dt = this.world.tick();
    this.panel.update(dt);
    if (CALIB) this._updateCalibLabels();
    if (DEBUG) this._hud(dt);
  }

  _hud(dt) {
    this._hudT = (this._hudT || 0) + dt;
    if (this._hudT < 0.4) return;
    this._hudT = 0;
    const W = this.world, info = W.renderer.info.render;
    document.getElementById("hud").textContent =
      `${(1 / Math.max(dt, 1e-4)).toFixed(0)} fps  dt ${(dt * 1000).toFixed(1)}ms\n` +
      `boats ${W.boats.length} / records ${this.records.length}\n` +
      `draw calls ${info.calls}  tris ${info.triangles.toLocaleString()}\n` +
      `glass ${document.documentElement.dataset.glass}  time ${TIME_KEY}\n` +
      `flow ${W.flowSpeed.toFixed(3)} u/s  (깊이 ${C.FLOW_REF_DEPTH}에서 ${C.FLOW_CROSS_SEC}초에 화면 횡단)`;
  }
}

// ── 부팅 ────────────────────────────────────────────────────────────────────
const scene = new Exhibit(document.getElementById("scene"));
scene.frame();
scene.load()
  .then(() => {
    if (CALIB) { scene._setupCalibration(); return; }
    // 저장소: DB 설정이 있으면 Firestore, 비었거나 ?mock=1 이면 목업 (store.js pickStore).
    // seed·interval 은 목업일 때만 쓴다.
    scene.connect(pickStore(qs,
      Number(qs.get("seed") ?? 46),
      Number(qs.get("interval") ?? 14)
    ));
  })
  .catch((err) => {
    console.error("모델(GLB) 로드 실패:", err);
    // 배가 없어도 바다와 패널은 계속 돈다 — 전시 중 모델 하나 때문에 화면이
    // 통째로 검게 죽는 것보다 낫다.
    scene.connect(pickStore(qs, Number(qs.get("seed") ?? 46), 0));
  });

window.__map = scene;   // 콘솔에서 들여다볼 수 있게
