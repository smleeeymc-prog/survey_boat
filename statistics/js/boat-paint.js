/* =============================================================================
 * boat-paint.js — 지도 배를 설문 배와 같은 모습으로 칠한다 (HANDOFF-map 18장).
 *
 * 설문에서 사용자가 고른 배 모습 — 레퍼런스 예인선 색(마스트·계단·갑판·캐빈), 튜브 톤, 램프 한 쌍 —
 * 을 지도 배(InstancedMesh 80척)에 옮긴다. 값과 모양 판정은 두 화면이 같이 보는
 * shared/boat-look.js 에서 온다. 여기는 three.js에 기대는 부분(지오메트리 속성, 셰이더 패치)만 둔다 —
 * 설문은 배 1척을 가까이서, 지도는 80척을 멀리서 그려서 방법이 다르다.
 *
 * ── 좌표계 (18.2) ─────────────────────────────────────────────────────────
 * fleet.js 는 Ship 노드의 뱃머리 보정 회전(π)까지 지오메트리에 구워서 "뱃머리 = +X, 우현 = +Z"다.
 * 설문 코드는 그 회전 전 좌표(뱃머리 = −X)로 적혀 있다. 그래서 설문에서 "뱃머리 쪽 = −X 면",
 * "x가 커질수록 선미"인 곳은 여기서 부호가 반대다(캐빈 창·문 — paintBoxShader 참고).
 * 모양 판정(markHullParts·markDeckFaces·lampTwinZ)은 높이·크기만 보므로 회전과 무관하다.
 * 배율은 1(배 길이 약 0.85)이어야 문턱값이 맞는다 — fleet.js 가 Ship 배율을 1로 비우고 굽는다.
 *
 * ── 재질 패치 (18.3) ──────────────────────────────────────────────────────
 * 재질의 onBeforeCompile 은 하나뿐이다. 구운 AO 가 이미 쓰므로 material-patch.js 로 겹쳐 건다.
 * 칠은 #include <map_fragment> 바로 뒤에 넣는다.
 *
 * ── 배마다 다른 칠 (10-07, HANDOFF-map 28장) ─────────────────────────────────
 * 참여자가 설문에서 고른 배 색(선체·갑판 + 캐빈 벽·창·마스트·계단 톤)·소품 칠(튜브·서핑보드·클로버)·고양이 털 무늬를
 * 배마다 그린다. 색은 style.js 가 기록에서 설문과 같은 식(shared/boat-look.js paintParts·propPaint)으로 풀고,
 * 여기 BoatPaintTable 이 **배 칸(인스턴스 i)마다 한 열**인 작은 표 텍스처(80 × PAINT_ROWS)에 적는다.
 * 셰이더는 정점 속성 _slot(그 인스턴스가 몇 번 배인지)으로 자기 배의 열을 읽는다 — 몸체 조각은 인스턴스 i = 배 i,
 * 키워드 요소는 그 요소를 단 배만 채우므로 _slot 이 따로 필요하다(fleet.js _layoutProps).
 * uniform 이 아니라 표인 이유: 배 80척이 draw call 하나를 나눠 쓰므로 배마다 다른 값은 인스턴스 쪽에서 와야 하고,
 * 칠할 곳이 열 몇 개라 정점 속성으로 하나씩 실으면 속성 한도(16)에 닿는다.
 * 고른 색이 없으면(옛 기록·목업 일부) 지금까지의 기본 칠 그대로다.
 * ========================================================================== */

import * as THREE from "three";
import { BOAT_PAINT, TUBE_TINT, markHullParts, lampTwinZ, PROP_KEYS, PROP_RECOLOR_GLSL,
  CAT_COAT_GLSL, CAT_COAT_LOOK, CAT_LINE_LIGHT } from "../shared/boat-look.js";
import { GLB_NODES, KEYWORD_NODES, MAP_PAINT_GAIN, CABIN_DECOR, CLOVER } from "./config.js";
import { patchMaterial } from "./material-patch.js";

const LAMP_NODE = KEYWORD_NODES["관계"][0];
const FUNNEL_STEP_NODE = "Funnel_step";   // 설문 _installPaint 와 같은 이름 (GLB 노드)

/** 지도 조명용 배수(MAP_PAINT_GAIN)를 곱한다. 고른 색에도 같은 배수 — 기본 배와 칠한 배가 같은 조명 눈금에 선다 */
function gained(c, key) {
  const g = MAP_PAINT_GAIN[key];
  if (g) c.multiply(Array.isArray(g) ? new THREE.Color(g[0], g[1], g[2]) : new THREE.Color(g, g, g));
  return c;
}
/** 칠 색 — 설문 값(BOAT_PAINT)에 지도 조명용 배수를 곱한다. BOAT_PAINT 는 고치지 않는다(18.7). */
function paintColor(key) {
  return gained(new THREE.Color(BOAT_PAINT[key]), key);
}

/* ── 0) 배마다 칠 — 배 칸 표 ──────────────────────────────────────────────── */

/** 표의 행(칠할 곳). 배 색 열한 칸 + 소품 셋(알파 = 칠함) + 고양이 넷 */
export const PAINT_ROWS = [
  "hull", "deck", "mast", "stairRail", "stairTread", "cabin", "funnelStep", "cabinRoof", "glass", "trim", "handle",
  "tube", "board", "clover", "catFur", "catStripe", "catWhite", "catParam",
];
const ROW = Object.fromEntries(PAINT_ROWS.map((k, i) => [k, i]));
const BOAT_KEYS = PAINT_ROWS.slice(0, ROW.tube);
// 칠한 캐빈 지붕은 갑판과 같은 색(설문 paintParts) — 지도에서도 갑판과 같아 보이게 갑판 배수를 쓴다
const GAIN_KEY = { cabinRoof: "deck" };

/** 셰이더 쪽 — 표와 그 크기, 배 칸 하나 읽기. 행 번호는 글자로 박는다 */
const PAINT_TABLE_GLSL = `
uniform sampler2D uBoatPaint; uniform vec2 uBoatPaintSize;
vec4 boatPaint(float slot, float row) { return texture2D(uBoatPaint, (vec2(slot, row) + 0.5) / uBoatPaintSize); }
`;
const rowOf = (k) => `${ROW[k].toFixed(1)}`;

/**
 * 배 칸 표. 열 = 배 칸(인스턴스 i), 행 = PAINT_ROWS. 선형 색을 그대로 담는다(배수가 1을 넘을 수 있어 실수 텍스처).
 * 재질마다 patch 때 uniforms 를 같은 객체로 쥐므로 write 한 번이면 모든 조각이 같이 바뀐다.
 */
export class BoatPaintTable {
  /**
   * @param {number} capacity 배 칸 수(FLEET_CAPACITY)
   * @param {{hull: THREE.Color}} glb GLB에서 온 기본 색(선체 옆면 = GLB 선체 재질 색)
   */
  constructor(capacity, glb) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * PAINT_ROWS.length * 4);
    this.texture = new THREE.DataTexture(this.data, capacity, PAINT_ROWS.length, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.uniforms = {
      uBoatPaint: { value: this.texture },
      uBoatPaintSize: { value: new THREE.Vector2(capacity, PAINT_ROWS.length) },
    };
    // 기본 칠 — 고른 색이 없는 칸(옛 기록)은 이 색. 지금까지 모든 배에 같이 칠하던 값이다
    this.base = {};
    for (const k of BOAT_KEYS) this.base[k] = k === "hull" ? glb.hull.clone() : paintColor(k);
    this._c = new THREE.Color();
    this._tubeDiv = new THREE.Color().setRGB(...TUBE_TINT);
    this._leaf = new THREE.Color(CLOVER.leaf);
    for (let i = 0; i < capacity; i++) this.write(i, null);
  }

  _set(i, row, r, g, b, a = 1) {
    const o = (row * this.capacity + i) * 4;
    this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = a;
  }
  _setColor(i, row, c, a = 1) { this._set(i, row, c.r, c.g, c.b, a); }

  /**
   * 배 칸 i 에 칠을 적는다. style = style.js makeStyle 결과(null 이면 기본 배).
   *   style.paint  = paintParts 결과 — 칠할 곳마다 재질 hex(설문 조명 기준) 또는 null(기본)
   *   style.props  = { tube, board, clover } 재질 hex 또는 null,  style.catCoat = CAT_COATS id
   */
  write(i, style) {
    const paint = (style && style.paint) || {}, props = (style && style.props) || {};
    const c = this._c;
    for (const k of BOAT_KEYS) {
      const hex = paint[k];
      if (hex === null || hex === undefined) this._setColor(i, ROW[k], this.base[k]);
      else this._setColor(i, ROW[k], gained(c.setHex(hex), GAIN_KEY[k] || k));
    }
    // 튜브 — 재질 색에 톤 누름(TUBE_TINT)이 곱해지므로 그만큼 미리 나눈다(설문 setProps 와 같다)
    if (props.tube == null) this._set(i, ROW.tube, 0, 0, 0, 0);
    else { c.setHex(props.tube); this._set(i, ROW.tube, c.r / this._tubeDiv.r, c.g / this._tubeDiv.g, c.b / this._tubeDiv.b, 1); }
    if (props.board == null) this._set(i, ROW.board, 0, 0, 0, 0);
    else this._setColor(i, ROW.board, c.setHex(props.board));
    // 클로버 — 그림(잎 CLOVER.leaf·잎맥)에 곱할 배수. 잎은 고른 색, 잎맥은 그만큼 같이 옮겨 짙은 채로
    if (props.clover == null) this._set(i, ROW.clover, 1, 1, 1, 0);
    else { c.setHex(props.clover); this._set(i, ROW.clover, c.r / this._leaf.r, c.g / this._leaf.g, c.b / this._leaf.b, 1); }
    // 고양이 — 바탕 털(알파 = 칠함) · 줄(알파 = 줄무늬) · 흰 털(알파 = 흰 털 자리 0·1·2) · 흰 털 높이
    const coat = CAT_COAT_LOOK[style && style.catCoat];
    if (!coat) this._set(i, ROW.catFur, 0, 0, 0, 0);   // 삼색 = 텍스처 그대로
    else {
      this._setColor(i, ROW.catFur, c.setHex(coat.fur), 1);
      this._setColor(i, ROW.catStripe, c.setHex(coat.stripe ?? coat.fur), coat.stripeOn ? 1 : 0);
      this._setColor(i, ROW.catWhite, c.setHex(coat.white ?? coat.fur), coat.whiteMode);
      this._set(i, ROW.catParam, coat.whiteH ?? 0.4, 0, 0, 1);
    }
    this.texture.needsUpdate = true;
  }
}

/** 재질에 배 칸 표를 붙이는 공통 부분 — 정점 속성 _slot → vBoatSlot, 표 uniform */
function withPaintTable(shader, table) {
  Object.assign(shader.uniforms, table.uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `attribute float _slot; varying float vBoatSlot;
      void main() {`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      vBoatSlot = _slot;`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `varying float vBoatSlot;
${PAINT_TABLE_GLSL}
      void main() {`);
}

/* ── 1) 지오메트리: 굽는 단계에서 한 번 ──────────────────────────────────── */

/**
 * 선체·램프 지오메트리를 칠할 수 있게 준비한다. InstancedMesh 를 만들기 전에 부른다.
 *   선체: 인덱스를 풀고(면 단위 속성이라) 부품(_part)·갑판(_deck) 속성을 넣는다
 *   램프: 마스트 가로대 반대쪽 끝에 같은 램프를 하나 더 — 같은 지오메트리에 합쳐 굽는다
 *        (요소를 따로 두면 '관계' 배가 있을 때 draw call 이 하나 는다. 흔들지 않으니 합친다 —
 *         흔들림·밤 불빛은 지도 거리에서 거의 안 보여 뺐다, 2026-09-30 사용자. 넣으려면 둘을 다시 나눠야 한다)
 * @param {{role:string, node?:string, child:THREE.Object3D, geo:THREE.BufferGeometry}[]} baked
 * @param {THREE.Object3D} ship 뱃머리 보정만 남기고 비운 Ship 노드 (matrixWorld 최신)
 * @returns {{mast:number, rails:number, treads:number, deckShare:number, lampTwin:boolean|null}} 판정 결과(selfCheck)
 */
export function prepareBoatGeometry(baked, ship) {
  const info = { mast: 0, rails: 0, treads: 0, deckShare: 0, lampTwin: null };
  const hull = baked.find((b) => b.role === "hull");
  if (!hull) return info;
  if (hull.geo.index) {
    const old = hull.geo;
    hull.geo = old.toNonIndexed();
    old.dispose();
  }
  const P = hull.geo.attributes.position.array;   // 이미 배 좌표(구운 값), 인덱스를 푼 삼각형 나열
  const parts = markHullParts(P);
  hull.geo.setAttribute("_part", new THREE.BufferAttribute(parts.part, 1));
  const deck = markDeckFaces(P);
  hull.geo.setAttribute("_deck", new THREE.BufferAttribute(deck.deck, 1));
  Object.assign(info, { mast: parts.mast, rails: parts.rails, treads: parts.treads, deckShare: deck.share });

  const lamp = baked.find((b) => b.node === LAMP_NODE);
  const lampNode = ship.getObjectByName(LAMP_NODE);
  if (lamp && lampNode) {
    // 램프 노드 원점(고리) — 선체와 같은 구운 좌표로 잰다(18.2)
    const at = new THREE.Vector3().setFromMatrixPosition(lampNode.matrixWorld);
    const twin = lampTwinZ(P, at);
    const copy = lamp.geo.clone();
    copy.translate(0, 0, twin.z - at.z);   // 원점이 고리라 z로만 옮기면 모양 그대로 반대쪽 끝에 매달린다
    lamp.geo = concatGeometries(lamp.geo, copy);
    info.lampTwin = twin.ok;
  }
  return info;
}

/**
 * 선체에서 '갑판 바닥'인 면을 고른다 — 설문 index.html _markDeckFaces 를 그대로 옮겼다(순수 함수로).
 * 선체는 재질 하나(단색)라 색으로 못 가르고 모양으로 가른다:
 * 위를 보는 면(법선 y > 0.65)을 모서리로 이어진 덩어리로 묶고, 두 조건이 맞는 덩어리만 갑판이다.
 *   - 옆에 자기보다 높이 솟은 벽이 있다 → 바닥이다 (뱃전 안쪽 벽에 둘러싸인 면)
 *   - 띠처럼 가늘지 않다: 평균 폭(2 × 위에서 본 넓이 ÷ 둘레) ≥ DECK_MIN_WIDTH
 *     → 뱃전 윗단·계단 디딤판·돛대 가로대는 가는 띠라 빠진다
 * 이웃은 좌표로 찾는다 — 면마다 정점이 따로 있어서 인덱스로는 안 이어진다.
 * three를 안 쓰므로 shared/boat-look.js 로 옮겨 두 화면이 같이 쓸 수 있다(HANDOFF-map 18장 답신).
 * @param {ArrayLike<number>} P 인덱스를 푼 삼각형 정점 xyz (배 좌표, 배율 1)
 * @returns {{deck: Float32Array, share: number}} deck = 정점마다 1(갑판)/0, share = 위를 보는 면 중 갑판 넓이 비율
 */
export function markDeckFaces(P) {
  const DECK_MIN_WIDTH = 0.04;   // 배 로컬 단위 (배 길이 약 0.85)
  const nVert = P.length / 3, nTri = nVert / 3;
  const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1], Z = (i) => P[i * 3 + 2];
  const key = (i) => `${Math.round(X(i) * 1e4)},${Math.round(Y(i) * 1e4)},${Math.round(Z(i) * 1e4)}`;
  const edgeKey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
  const edgesOf = (t) => [[t * 3, t * 3 + 1], [t * 3 + 1, t * 3 + 2], [t * 3 + 2, t * 3]];
  const up = new Uint8Array(nTri), topY = new Float32Array(nTri), byEdge = new Map();
  for (let t = 0; t < nTri; t++) {
    const a = t * 3, b = a + 1, c = a + 2;
    const e1x = X(b) - X(a), e1y = Y(b) - Y(a), e1z = Z(b) - Z(a);
    const e2x = X(c) - X(a), e2y = Y(c) - Y(a), e2z = Z(c) - Z(a);
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    up[t] = ny / (Math.hypot(nx, ny, nz) || 1) > 0.65 ? 1 : 0;
    topY[t] = Math.max(Y(a), Y(b), Y(c));
    for (const [p, q] of edgesOf(t)) {
      const k = edgeKey(p, q);
      if (!byEdge.has(k)) byEdge.set(k, []);
      byEdge.get(k).push(t);
    }
  }
  // 위를 보는 면끼리 모서리로 이어진 덩어리
  const comp = new Int32Array(nTri).fill(-1);
  let nComp = 0;
  for (let s = 0; s < nTri; s++) {
    if (!up[s] || comp[s] >= 0) continue;
    const stack = [s];
    comp[s] = nComp;
    while (stack.length) {
      const t = stack.pop();
      for (const [p, q] of edgesOf(t)) for (const o of byEdge.get(edgeKey(p, q))) {
        if (up[o] && comp[o] < 0) { comp[o] = nComp; stack.push(o); }
      }
    }
    nComp++;
  }
  const area = new Float32Array(nComp), perim = new Float32Array(nComp), rises = new Uint8Array(nComp);
  for (let t = 0; t < nTri; t++) {
    if (!up[t]) continue;
    const c = comp[t], a = t * 3;
    const e1x = X(a + 1) - X(a), e1z = Z(a + 1) - Z(a), e2x = X(a + 2) - X(a), e2z = Z(a + 2) - Z(a);
    area[c] += Math.abs(e1x * e2z - e1z * e2x) / 2;
    for (const [p, q] of edgesOf(t)) {
      const others = byEdge.get(edgeKey(p, q)).filter((o) => o !== t);
      if (!others.some((o) => comp[o] === c)) perim[c] += Math.hypot(X(p) - X(q), Z(p) - Z(q));
      if (others.some((o) => !up[o] && topY[o] > topY[t] + 0.008)) rises[c] = 1;
    }
  }
  const isDeck = new Uint8Array(nComp);
  let deckArea = 0, upArea = 0;
  for (let c = 0; c < nComp; c++) {
    isDeck[c] = rises[c] && (2 * area[c]) / Math.max(perim[c], 1e-9) >= DECK_MIN_WIDTH ? 1 : 0;
    upArea += area[c];
    if (isDeck[c]) deckArea += area[c];
  }
  const deck = new Float32Array(nVert);
  for (let t = 0; t < nTri; t++) if (up[t] && isDeck[comp[t]]) deck[t * 3] = deck[t * 3 + 1] = deck[t * 3 + 2] = 1;
  return { deck, share: deckArea / Math.max(upArea, 1e-9) };
}

/**
 * 같은 속성을 가진 지오메트리 둘을 하나로 잇는다(램프 한 쌍). BufferGeometryUtils.mergeGeometries 대신 직접 —
 * GLB 속성이 인터리브일 수 있어 getX 계열로 읽는다(merge 는 인터리브를 못 받는다).
 */
export function concatGeometries(a, b) {
  const out = new THREE.BufferGeometry();
  const na = a.attributes.position.count, nb = b.attributes.position.count;
  for (const name of Object.keys(a.attributes)) {
    const A = a.attributes[name], B = b.attributes[name];
    if (!B) continue;
    const w = A.itemSize, arr = new Float32Array((na + nb) * w);
    const get = ["getX", "getY", "getZ", "getW"];
    for (let i = 0; i < na; i++) for (let c = 0; c < w; c++) arr[i * w + c] = A[get[c]](i);
    for (let i = 0; i < nb; i++) for (let c = 0; c < w; c++) arr[(na + i) * w + c] = B[get[c]](i);
    out.setAttribute(name, new THREE.BufferAttribute(arr, w, A.normalized));
  }
  if (a.index && b.index) {
    const ia = a.index, ib = b.index, idx = new Uint32Array(ia.count + ib.count);
    for (let i = 0; i < ia.count; i++) idx[i] = ia.getX(i);
    for (let i = 0; i < ib.count; i++) idx[ia.count + i] = ib.getX(i) + na;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  } else if (a.index || b.index) {
    // 한쪽만 인덱스가 있으면 둘 다 푼다 — 같은 지오메트리의 복제라 실제로는 안 온다
    return concatGeometries(a.index ? a.toNonIndexed() : a, b.index ? b.toNonIndexed() : b);
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/* ── 2) 재질: InstancedMesh 를 만들 때 ──────────────────────────────────── */

/**
 * 재질에 배 칠을 건다. fleet.js 가 재질을 복제·AO 패치한 뒤 부른다.
 * 역할에 해당하지 않는 재질은 그대로 둔다. 칠하는 재질은 배 칸 표(table)를 읽는다 — 그 지오메트리엔 _slot 이 있어야 한다(fleet.js).
 * @returns {boolean} 배 칸 표를 읽는 재질인가(= _slot 속성이 필요한가)
 */
export function applyBoatPaint(b, mat, table) {
  if (b.role === "hull" && b.geo.attributes._part) {
    patchMaterial(mat, "boat-hull", (s) => hullShader(s, table));
  } else if (b.role === "cabin") {
    const level = CABIN_DECOR ? 2 : 1;
    mat.color.set(0xffffff);
    patchMaterial(mat, `boat-paint-cabin${level}`, (s) => paintBoxShader(s, b.geo, level, "cabin", table));
  } else if (b.child && b.child.name === FUNNEL_STEP_NODE) {
    mat.color.set(0xffffff);
    patchMaterial(mat, "boat-paint-funnelStep", (s) => paintBoxShader(s, b.geo, 0, "funnelStep", table));
  } else if (b.node === GLB_NODES.tube) {
    // 튜브(가족)만 톤을 누른다 — 순백·순홍이라 어두운 선체 위에서 혼자 떠 보였다(설문 6.15).
    // 광택·테두리 빛 몫(TUBE_FX_EDGE)은 fleet.js 가 surface-fx.js 에 넘긴다.
    mat.color.setRGB(...TUBE_TINT);
    patchMaterial(mat, "boat-paint-tube", (s) => propRecolorShader(s, table, "tube", PROP_KEYS.tube.key, 0.16));
  } else if (b.node === "Surfboard") {
    patchMaterial(mat, "boat-paint-board", (s) => propRecolorShader(s, table, "board", PROP_KEYS.board.key, 0.16));
  } else if (b.node === GLB_NODES.cat) {
    const frame = catFrame(b);
    patchMaterial(mat, "boat-paint-cat", (s) => catCoatShader(s, table, frame));
  } else return false;
  return true;
}

/** 클로버 데칼 재질 — 고른 잎 색을 그림에 곱한다(설문은 캔버스를 다시 그리지만 지도는 80척이 한 그림을 나눠 쓴다) */
export function applyCloverPaint(mat, table) {
  patchMaterial(mat, "boat-paint-clover", (shader) => {
    withPaintTable(shader, table);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      { vec4 cp = boatPaint(vBoatSlot, ${rowOf("clover")}); if (cp.a > 0.5) diffuseColor.rgb *= cp.rgb; }`);
  });
}

/** 튜브·서핑보드 — 아틀라스 텍셀 중 열쇠 색(빨강·하늘색)인 곳만 고른 색으로(boat-look.js PROP_RECOLOR_GLSL) */
function propRecolorShader(shader, table, row, keyHex, tol) {
  withPaintTable(shader, table);
  shader.uniforms.uRcKey = { value: new THREE.Color(keyHex) };   // sRGB hex → 선형(텍스처 값과 같은 공간)
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `uniform vec3 uRcKey;
${PROP_RECOLOR_GLSL}
      void main() {`)
    .replace("#include <map_fragment>", `#include <map_fragment>
      #ifdef USE_MAP
      {
        vec4 pc = boatPaint(vBoatSlot, ${rowOf(row)});
        if (pc.a > 0.5) {
          vec4 rc = propRecolor(sampledDiffuseColor.rgb, uRcKey, pc.rgb, ${tol.toFixed(3)});
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * rc.rgb, rc.a);
        }
      }
      #endif`);
}

/**
 * 고양이 메시의 틀 — 털 무늬 식(CAT_COAT_GLSL)이 받는 좌표(높이 0~1, 말린 중심 기준·반지름으로 나눈·얼굴 방향 +x 인 xz)를 만들 값.
 * 지도 지오메트리는 배 좌표로 구워져 있어(뱃머리 보정 회전·카메라 쪽 거울상까지) 고양이 메시 +x(얼굴 쪽)가 어디를 보는지 다시 잰다.
 */
function catFrame(b) {
  b.geo.computeBoundingBox();
  const bb = b.geo.boundingBox;
  const f = new THREE.Vector3(1, 0, 0).transformDirection(b.child.matrixWorld);
  if (b.mirrored) f.z = -f.z;   // 거울상으로 옮겼으면 얼굴 방향도 뒤집힌다(fleet.js mirrorAcrossCenterline)
  const face = new THREE.Vector2(f.x, f.z).normalize();
  return {
    y: new THREE.Vector2(bb.min.y, bb.max.y),
    c: new THREE.Vector2((bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2),
    r: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2,
    face,
  };
}

/** 고양이 털 무늬 — 설문과 같은 식(boat-look.js CAT_COAT_GLSL), 무늬 값은 배 칸 표에서 */
function catCoatShader(shader, table, frame) {
  withPaintTable(shader, table);
  Object.assign(shader.uniforms, {
    uCatY: { value: frame.y }, uCatC: { value: frame.c }, uCatR: { value: frame.r }, uCatFace: { value: frame.face },
    uCatLine: { value: new THREE.Color(CAT_LINE_LIGHT) },
  });
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `varying vec3 vCatP;
      void main() {`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      vCatP = transformed;   // 인스턴스 행렬 전 = 구운 배 좌표`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `uniform vec2 uCatY, uCatC, uCatFace; uniform float uCatR; uniform vec3 uCatLine;
      varying vec3 vCatP;
${CAT_COAT_GLSL}
      void main() {`)
    .replace("#include <map_fragment>", `#include <map_fragment>
      #ifdef USE_MAP
      {
        vec4 fur = boatPaint(vBoatSlot, ${rowOf("catFur")});
        if (fur.a > 0.5) {
          vec4 st = boatPaint(vBoatSlot, ${rowOf("catStripe")}), wh = boatPaint(vBoatSlot, ${rowOf("catWhite")});
          float whiteH = boatPaint(vBoatSlot, ${rowOf("catParam")}).r;
          vec2 d = (vCatP.xz - uCatC) / uCatR;
          vec2 q = vec2(dot(d, uCatFace), uCatFace.x * d.y - uCatFace.y * d.x);
          float h = (vCatP.y - uCatY.x) / max(uCatY.y - uCatY.x, 1e-4);
          diffuseColor.rgb = diffuse * catCoat(sampledDiffuseColor.rgb, h, q, fur.rgb, st.rgb, wh.rgb, uCatLine, wh.a, whiteH, st.a);
        }
      }
      #endif`);
}

/**
 * 선체 — 갑판 붉은 갈색 판자, 마스트·계단 단색 (설문 _installWood 의 갑판·부품 부분).
 * 옆면은 GLB 선체색 그대로다(설문도 옆면 판자 몫 0).
 * 판자 이음매는 fwidth 로 픽셀보다 가늘면 흐리게 한다 — 지도는 배가 작아 대부분 흐려져 붉은 갈색 면으로
 * 보이지만, 판자마다 다른 색 단계는 남는다.
 */
function hullShader(shader, table) {
  withPaintTable(shader, table);
  hullShader.uniforms = shader.uniforms;   // 색 눈금 잴 때 검증 스크립트가 만진다(18.7) — 지금 색은 표(table.base)에
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `
      attribute float _deck;
      attribute float _part;
      varying vec3 vBoatP; varying vec3 vBoatN; varying float vBoatDeck; varying float vBoatPart;
      void main() {`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      // 인스턴스 행렬이 곱해지기 전 = 구운 배 좌표 (뱃머리 +X, 배율 1)
      vBoatP = transformed;
      vBoatN = objectNormal;
      vBoatDeck = _deck;
      vBoatPart = _part;`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `
      varying vec3 vBoatP; varying vec3 vBoatN; varying float vBoatDeck; varying float vBoatPart;
      float boatHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      // 판자 이음매: 판자 안쪽은 1, 이음매 선에서 0 (선이 픽셀보다 가늘면 흐리게 — 반짝임 방지)
      float boatSeam(float v, float w) {
        float f = fract(v), aa = max(w, fwidth(v) * 1.5);
        return smoothstep(0.0, aa, f) * smoothstep(1.0, 1.0 - aa, f);
      }
      void main() {`)
    .replace("#include <map_fragment>", `#include <map_fragment>
      {
        // 이 배의 칠(배 칸 표) — 고른 색이 없으면 기본 칠. 옆면은 선체 색(기본 = GLB 선체 재질 색)
        vec3 uDeckCol = boatPaint(vBoatSlot, ${rowOf("deck")}).rgb;
        vec3 uMastCol = boatPaint(vBoatSlot, ${rowOf("mast")}).rgb;
        vec3 uStairRailCol = boatPaint(vBoatSlot, ${rowOf("stairRail")}).rgb;
        vec3 uStairTreadCol = boatPaint(vBoatSlot, ${rowOf("stairTread")}).rgb;
        diffuseColor.rgb = boatPaint(vBoatSlot, ${rowOf("hull")}).rgb;
        // 갑판 = 위를 보는 면 중 markDeckFaces 가 바닥으로 고른 것 (뱃전 윗단·계단·돛대는 빠진다)
        float deck = step(0.65, vBoatN.y) * step(0.5, vBoatDeck);
        if (deck > 0.5) {
          // 폭 0.024마다 한 장(배 폭 방향으로 늘어선 판자), 판자 끝 이음매는 판자마다 어긋난 자리에서
          float v = vBoatP.z / 0.024, idx = floor(v), f = fract(v);
          float seam = boatSeam(v, 0.09);
          float bu = (vBoatP.x + boatHash(idx * 3.7 + 1.0) * 0.13) / 0.13;
          float butt = boatSeam(bu, 0.02);
          // 색 단계 0.84/0.97/1.10 — 레퍼런스 갑판은 판자마다 차이가 크다. 판자 윗단에 옅은 밝은 띠
          float tone = 0.84 + floor(boatHash(idx + floor(bu) * 7.13 + 17.0) * 3.0) * 0.13;
          float bevel = smoothstep(0.62, 0.9, f) * (1.0 - smoothstep(0.9, 0.93, f));
          diffuseColor.rgb = uDeckCol * tone * (1.0 + bevel * 0.10) * mix(0.6, 1.0, seam) * mix(0.62, 1.0, butt);
        }
        // 마스트·계단 — 무늬 없이 제 색 (markHullParts: 1 마스트 · 2 계단 옆판 · 3 디딤판)
        if (vBoatPart > 0.5) {
          diffuseColor.rgb = vBoatPart < 1.5 ? uMastCol : (vBoatPart < 2.5 ? uStairRailCol : uStairTreadCol);
        }
      }`);
}

/**
 * 캐빈·굴뚝 받침 페인트 — 설문 _paintShader 를 옮겼다. 둘 다 GLB에선 텍스처 없는 단색 상자라,
 * 상자 좌표(0~1)와 법선으로 면을 가르고 면 위 실제 치수로 모양을 그린다(늘어나지 않게).
 * 지도의 구운 지오메트리는 이미 배 좌표라 노드 배율을 따로 곱하지 않는다(치수 = 상자 크기).
 * @param {0|1|2} level 0 굴뚝 받침(페인트·결) · 1 캐빈 색(페인트·결·지붕 판자) · 2 캐빈 창·문까지
 */
function paintBoxShader(shader, geo, level, key, table) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, size = bb.getSize(new THREE.Vector3());
  withPaintTable(shader, table);
  Object.assign(shader.uniforms, {
    uPaintMin: { value: bb.min.clone() }, uPaintSize: { value: size.clone() }, uPaintDim: { value: size.clone() },
  });
  (paintBoxShader.uniforms ||= {})[key] = shader.uniforms;   // 18.7 색 눈금 — 지금 색은 표(table.base)에
  shader.vertexShader = shader.vertexShader
    .replace("void main() {", `
      uniform vec3 uPaintMin, uPaintSize;
      varying vec3 vPaintP; varying vec3 vPaintN;
      void main() {`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      vPaintP = (position - uPaintMin) / uPaintSize;   // 상자 안 0~1 (구운 배 좌표 기준)
      vPaintN = objectNormal;`);
  shader.fragmentShader = shader.fragmentShader
    .replace("void main() {", `
      uniform vec3 uPaintDim;
      // 이 배의 칠 — main 첫머리에서 배 칸 표로 채운다(창 그리는 함수가 같이 쓰므로 전역)
      vec3 uPaintCol, uPaintRoof, uPaintGlass, uPaintTrim, uPaintHandle;
      varying vec3 vPaintP; varying vec3 vPaintN;
      float paintHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      // 둥근 모서리 사각형까지의 거리 (안쪽 음수). b = 반폭·반높이, r = 모서리 반지름
      float paintRR(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      // 거리 d의 안쪽을 1로 — 경계는 한 픽셀 폭으로 부드럽게(멀리서 반짝이지 않게)
      float paintFill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
      // 창 하나: 바깥 그림자 선 → 밝은 테 → 유리(위가 조금 밝고 비스듬한 반사 한 줄)
      vec3 paintWindow(vec3 col, vec2 q, vec2 c, vec2 hb, float r, float aa) {
        float d = paintRR(q - c, hb, r);
        col = mix(col, uPaintCol * 0.72, paintFill(d - 0.0052, aa));
        col = mix(col, min(uPaintCol * 1.06, vec3(1.0)), paintFill(d - 0.0038, aa));
        vec2 g = (q - c) / hb;
        vec3 glass = uPaintGlass * mix(0.8, 1.25, g.y * 0.5 + 0.5);
        float streak = smoothstep(0.18, 0.0, abs(g.x + g.y * 0.6 - 0.2)) * 0.9;
        glass += uPaintTrim * 0.10 * streak;
        return mix(col, glass, paintFill(d, aa));
      }
      void main() {`)
    .replace("#include <map_fragment>", `#include <map_fragment>
      {
        uPaintCol = boatPaint(vBoatSlot, ${rowOf(key)}).rgb;
        uPaintRoof = boatPaint(vBoatSlot, ${rowOf("cabinRoof")}).rgb;
        uPaintGlass = boatPaint(vBoatSlot, ${rowOf("glass")}).rgb;
        uPaintTrim = boatPaint(vBoatSlot, ${rowOf("trim")}).rgb;
        uPaintHandle = boatPaint(vBoatSlot, ${rowOf("handle")}).rgb;
        vec3 P = clamp(vPaintP, 0.0, 1.0);
        vec3 an = abs(vPaintN);
        // 면 가르기: 법선이 가장 큰 축. X면은 (z, y), Z면은 (x, y), 위아래는 (x, z)
        int face = an.x > an.y && an.x > an.z ? 0 : (an.z > an.y ? 2 : 1);
        // 옆면(Z면)의 가로는 "선미 쪽이 클수록"으로 맞춘다 — 설문 좌표(뱃머리 −X)에서는 x가 곧 그 값이지만
        // 지도는 뱃머리가 +X라 뒤집는다(18.2). 그래야 창은 뱃머리 쪽, 문은 선미 쪽에 선다.
        vec2 uv = face == 0 ? P.zy : (face == 2 ? vec2(1.0 - P.x, P.y) : P.xz);
        vec2 dimF = face == 0 ? uPaintDim.zy : (face == 2 ? uPaintDim.xy : uPaintDim.xz);
        vec2 q = uv * dimF;                                        // 면 위 실제 좌표(배 단위)
        float aa = max(max(fwidth(q.x), fwidth(q.y)), 1e-5);
        vec3 col = uPaintCol;
        if (face != 1) {
          // 옅은 세로 결 — 칠 아래 나무가 살짝 비치는 정도(±2%, "덜 낡게")
          float gx = q.x * 260.0;
          col *= 0.985 + 0.02 * sin(gx + sin(q.x * 37.0) * 2.0) * (0.6 + 0.4 * sin(q.y * 23.0 + gx * 0.1));
        }
        if (${level >= 1 ? "true" : "false"} && face == 1 && vPaintN.y > 0.0) {
          // 지붕 — 짙은 판자 (배 길이 방향으로 길게, 폭 0.022마다 이음매)
          float v = q.y / 0.022, idx = floor(v), f = fract(v);
          float seam = smoothstep(0.0, max(0.08, fwidth(v) * 1.5), f) * smoothstep(1.0, 1.0 - max(0.08, fwidth(v) * 1.5), f);
          col = uPaintRoof * (0.9 + floor(paintHash(idx + 3.0) * 3.0) * 0.08) * mix(0.62, 1.0, seam);
        }
        if (${level >= 2 ? "true" : "false"}) {
          float W = dimF.x, H = dimF.y;
          if (face == 0 && vPaintN.x > 0.0) {
            // 뱃머리 쪽 면(지도에서는 +X) — 창 넷을 한 줄로
            float m = 0.12 * W, slot = (W - 2.0 * m) / 4.0;
            vec2 hb = vec2(slot * 0.36, 0.13 * H);
            for (int i = 0; i < 4; i++) {
              col = paintWindow(col, q, vec2(m + slot * (float(i) + 0.5), 0.64 * H), hb, 0.3 * hb.x, aa);
            }
          } else if (face == 2) {
            // 양옆 면 — 뱃머리 쪽에 창 하나, 선미 쪽에 문
            col = paintWindow(col, q, vec2(0.21 * W, 0.64 * H), vec2(0.10 * W, 0.13 * H), 0.035 * W, aa);
            vec2 dc = vec2(0.68 * W, 0.415 * H), dh = vec2(0.15 * W, 0.385 * H);
            float dd = paintRR(q - dc, dh, 0.25 * dh.x);
            col = mix(col, uPaintCol * 0.965, paintFill(dd, aa));                          // 문짝
            col = mix(col, uPaintCol * 0.66, paintFill(abs(dd) - 0.0011, aa));             // 문틈
            vec2 pc = vec2(dc.x, 0.62 * H);
            float R = 0.085 * W, dp = length(q - pc) - R;                                  // 둥근 창
            col = mix(col, uPaintCol * 0.7, paintFill(dp - 0.0012, aa));
            col = mix(col, uPaintTrim, paintFill(dp, aa));
            col = mix(col, uPaintGlass * 1.1, paintFill(dp + 0.36 * R, aa));
            col = mix(col, uPaintHandle, paintFill(paintRR(q - vec2(dc.x - 0.07 * W, 0.40 * H), vec2(0.035 * W, 0.006 * H), 0.004), aa));
          }
        }
        diffuseColor.rgb = col;
      }`);
}
