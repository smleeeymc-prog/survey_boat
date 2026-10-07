/* =============================================================================
 * fleet.js — 배 80척을 InstancedMesh로.
 *
 * 온보딩 씬은 배 1척 = THREE.Group 하나였다. 그대로 80척으로 늘리면 draw call이
 * 80배가 된다. 여기서는 Scene.glb의 "Ship" 노드를 통째로 인스턴싱한다.
 *
 * ── 배 몸체: 메쉬 조각마다 InstancedMesh 하나 ────────────────────────────────
 * GLB의 메쉬 조각(재질 하나 = 조각 하나)마다 InstancedMesh를 하나씩 만들고 전부 같은
 * 인스턴스 행렬을 공유한다. draw call은 조각 수(선체·캐빈·굴뚝·굴뚝 받침 = 4)로 고정 —
 * 배가 80척이든 800척이든 늘지 않는다. 재질은 GLB 원본을 복제해 설문 배와 같은 칠
 * (boat-paint.js)을 얹는다. 배마다 다른 칠(참여자가 고른 배 색·소품 칠·고양이 무늬, 10-07)은
 * 배 칸 표(boat-paint.js BoatPaintTable)에 적고, 칠하는 조각은 정점 속성 _slot 으로 자기 배의 칸을 읽는다.
 * (예전엔 선체에만 instanceColor로 난수 색조를 곱했다 — 고른 색이 생겨 걷어냈다)
 *
 * 캐빈 색은 키워드에 따라 바뀌지 않는다. 키워드는 배에 나타나는 요소로만 표현한다(사용자 결정,
 * 설문 화면과 같은 규칙). 캐빈·갑판·마스트·계단은 설문 배와 같은 칠(모든 배 공통)을 입는다 —
 * boat-paint.js, HANDOFF-map 18장.
 *
 * ── 키워드 요소: 그 요소를 단 배에만 인스턴스를 둔다 ─────────────────────────
 * 키워드마다 배에 붙는 요소(공구함·램프·튜브·고양이…)가 있다(shared/glb-nodes.js
 * KEYWORD_NODES). 요소 하나 = InstancedMesh 하나 = draw call 하나다.
 *
 * 예전에는 소품 그룹마다 인스턴스를 배 수만큼 깔아 두고, 그 소품이 없는 배 자리는
 * 크기 0 행렬로 뭉개서 지웠다. 소품이 둘(갈매기·튜브)일 때는 괜찮았지만, 요소가
 * 열한 개로 늘면 정점 셰이더가 "안 보이는 소품"까지 다 돈다 — 요소 삼각형 합계
 * 6,894 × 80척 = 약 55만 개를 매 프레임 헛돈다. 그래서 요소마다 인스턴스 목록을 따로
 * 두고, 그 키워드를 가진 배만 채운다. 배 한 척이 키워드를 둘 고르면 요소 인스턴스도
 * 둘뿐이다. 아무 배도 안 쓰는 요소는 count 0 → draw call 자체가 없다.
 *
 * ── 뱃전 요소는 카메라 쪽으로 ───────────────────────────────────────────────
 * 서핑보드·종·튜브·고양이는 뱃전에 걸려 있어서, 카메라 반대쪽에 있으면 선체에 가려진다.
 * 설문은 드래그로 둘러보므로 카메라 쪽이 바뀔 때마다 거울상 자리로 옮긴다. 지도는
 * 모든 배가 같은 방향으로 흘러 카메라가 늘 같은 뱃전을 보므로, 로드할 때 한 번만
 * 정해서 지오메트리에 구워 넣는다(SIDE_PROPS, FACE_SIGN).
 *
 * ── 그림자 ────────────────────────────────────────────────────────────────
 * 켜지 않는다. 온보딩은 배 1척 주변으로 절두체를 바짝 조여서 또렷한 그림자를
 * 얻었지만(±5), 지도는 반경 38의 바다 전체를 덮어야 해서 같은 1024맵으로는
 * 그림자가 뭉개진 얼룩이 된다. 그림자 패스 자체를 빼는 쪽이 화질도 성능도 낫다.
 * ========================================================================== */

import * as THREE from "three";
import {
  SHIP_FORWARD_OFFSET, SHIP_DRAFT, FLEET_SHIP_SCALE, FLOW_DIR,
  GLB_NODES, KEYWORD_NODES, CODE_MADE_NODES, SIDE_PROPS, SCENE_LOOK, AO,
} from "./config.js";
import { buildCloverGeometry, makeCloverMaterial } from "./clover.js";
import { patchMaterial } from "./material-patch.js";
import { prepareBoatGeometry, applyBoatPaint, applyCloverPaint, BoatPaintTable } from "./boat-paint.js";
import { applySurfaceFx } from "./surface-fx.js";
import { TUBE_FX_EDGE } from "../shared/boat-look.js";

// GLB 노드 이름은 shared/glb-nodes.js 한 곳에서 온다 — 설문 화면도 같은 값을 읽는다.
// 이름이 바뀌면 조용히 역할이 사라지므로 selfCheck가 존재를 확인한다.
const CABIN_NODE = GLB_NODES.cabin;
const HULL_NODE = GLB_NODES.hull;
const CLOVER_NODE = "Clover";

// GLB 노드 이름 → 키워드. 한 키워드가 여러 노드일 수 있다(익숙함 = Chair + Cup).
// 코드로 만드는 요소(클로버)는 GLB에서 찾지 않는다.
const NODE_KEYWORD = {};
for (const [kw, names] of Object.entries(KEYWORD_NODES)) {
  for (const n of names) if (!CODE_MADE_NODES.includes(n)) NODE_KEYWORD[n] = kw;
}
const CLOVER_KEYWORD = Object.keys(KEYWORD_NODES).find((kw) => KEYWORD_NODES[kw].includes(CLOVER_NODE));

// 카메라가 보는 뱃전. 지오메트리는 "뱃머리 = +X, 우현 = +Z"로 구워진다. 배는 모두 같은
// 헤딩(FLOW_DIR로 정해진다)으로 흐르고, 우현 벡터(0,0,1)를 헤딩 a만큼 돌리면 월드 z 성분이
// cos(a)다. 카메라는 배들보다 -Z 쪽에서 +Z를 본다 → cos(a) < 0 이면 우현이 카메라 쪽.
// (FLOW_DIR = -1 → 헤딩 π → 우현이 카메라 쪽. 흐름 방향을 뒤집으면 저절로 좌현이 된다)
const BASE_HEADING = FLOW_DIR > 0 ? 0 : Math.PI;
const FACE_SIGN = Math.cos(BASE_HEADING) < 0 ? 1 : -1;

const EMPTY = Object.freeze([]);

/** 메쉬에서 위로 거슬러 올라가며 역할을 찾는다. 아무 데도 안 걸리면 몸체 부속 취급. */
function roleOf(mesh, shipRoot) {
  for (let o = mesh; o && o !== shipRoot.parent; o = o.parent) {
    if (NODE_KEYWORD[o.name]) return { role: "prop", kw: NODE_KEYWORD[o.name], node: o.name };
    if (o.name === CABIN_NODE) return { role: "cabin" };
    if (HULL_NODE.test(o.name)) return { role: "hull" };
  }
  return { role: "body" };
}

/**
 * 배 중심선(z = midZ)에 대해 거울상으로 뒤집는다. 뒤집으면 면의 감김 방향도 뒤집히므로
 * 삼각형 꼭짓점 순서를 바꿔 준다 — 안 바꾸면 앞면·뒷면이 뒤바뀌어 조명이 안쪽에서 비친다.
 * (설문은 행렬식이 음수인 행렬을 쓰고 three.js가 알아서 뒤집게 두지만, 그건 일반 Mesh 얘기다.
 *  InstancedMesh는 인스턴스 행렬의 행렬식을 안 보므로 지오메트리에 직접 구워야 한다)
 */
function mirrorAcrossCenterline(geo, midZ) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 2 * midZ - p.getZ(i));
  p.needsUpdate = true;
  const n = geo.attributes.normal;
  if (n) { for (let i = 0; i < n.count; i++) n.setZ(i, -n.getZ(i)); n.needsUpdate = true; }
  const t = geo.attributes.tangent;
  if (t) { for (let i = 0; i < t.count; i++) { t.setZ(i, -t.getZ(i)); t.setW(i, -t.getW(i)); } t.needsUpdate = true; }
  flipWinding(geo);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

/** 삼각형 꼭짓점 순서를 뒤집는다(앞면·뒷면이 바뀐다). 법선은 건드리지 않는다. */
export function flipWinding(geo) {
  if (geo.index) {
    const a = geo.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) { const tmp = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = tmp; }
    geo.index.needsUpdate = true;
  } else {
    for (const attr of Object.values(geo.attributes)) {
      const w = attr.itemSize, arr = attr.array;
      for (let i = 0; i + 2 < attr.count; i += 3) {
        for (let c = 0; c < w; c++) {
          const x = (i + 1) * w + c, y = (i + 2) * w + c;
          const tmp = arr[x]; arr[x] = arr[y]; arr[y] = tmp;
        }
      }
      attr.needsUpdate = true;
    }
  }
}

/** 인스턴스 버퍼를 한 번 잡아 두는 InstancedMesh. 컬링은 끈다(바다 전체에 흩어진다). */
function makeInstanced(geo, mat, capacity, name) {
  const inst = new THREE.InstancedMesh(geo, mat, capacity);
  inst.name = name;
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // 인스턴스가 바다 전체에 흩어져 매 프레임 움직인다. 지오메트리 하나 기준으로
  // 잡히는 기본 바운딩으로는 컬링 판정이 틀리므로 아예 끈다.
  inst.frustumCulled = false;
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.count = 0;
  return inst;
}

/**
 * GLB 재질을 지도용으로 복제한다. 룩 값은 shared/look-tokens.js 에서 온다(설문과 같은 값).
 * 복제하는 이유: GLB 재질은 공유 객체라 원본을 건드리면 같은 재질을 쓰는 다른 메쉬까지 바뀐다.
 */
export function cloneMaterial(src) {
  const mat = (Array.isArray(src) ? src[0] : src).clone();
  mat.fog = true;
  // 재질이 빠진 메쉬에는 GLTFLoader가 기본 재질을 만들어 주는데, 그 기본값이
  // metalness:1(완전 금속)이다. 이 씬에는 환경맵이 없어서 금속은 확산광 없이 새까매진다
  // (예전 GLB의 Cabin이 그랬다 — 밤 팔레트에서 캐빈이 통째로 검었다). 지금 GLB는 빈 재질을
  // 굽기 단계에서 비금속으로 채워 두지만(tools/build_scene_glb.py), 모델을 다시 뽑다가
  // 재질이 또 빠질 수 있으니 안전장치로 남겨 둔다.
  if (mat.metalness === 1) { mat.metalness = 0; mat.roughness = 0.8; }
  // 거칠기 상한 — 이보다 거친 재질은 여기까지 매끈하게 해서 해 하이라이트가 은은하게 돈다.
  // 위 안전장치가 0.8로 올린 값도 여기서 눌린다(순서가 이래야 한다).
  mat.roughness = Math.min(mat.roughness, SCENE_LOOK.roughnessCap);
  return mat;
}

/**
 * 구운 AO — 배 틈·캐빈 밑·요소가 갑판에 닿는 자리에 구석 그늘을 넣는다.
 * GLB의 모든 메쉬에 굽기 단계에서 넣어 둔 정점 속성 _AO(three.js에서는 _ao)를 읽는다
 * (tools/build_scene_glb.py). 식과 세기는 설문과 같다(shared/look-tokens.js AO,
 * 설문 index.html _surfaceFxShader). 코드는 화면마다 따로, 값은 shared에서.
 *
 * 정점 속성은 인스턴스가 공유하므로 InstancedMesh에서도 그대로 된다.
 * _ao 가 없는 지오메트리에 이 재질을 쓰면 셰이더가 깨지므로, 부르는 쪽이 속성을 확인한다.
 * 같은 재질에 배 칠(boat-paint.js)도 걸리므로 onBeforeCompile 을 직접 대입하지 않고
 * patchMaterial 로 겹쳐 건다 — 대입하면 뒤에 건 것이 앞의 것을 지운다(HANDOFF-map 18.3).
 */
export function patchBakedAO(mat) {
  patchMaterial(mat, "bakedAO", (shader) => {
    shader.uniforms.uAOAmt = { value: AO.amount };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _ao;\nvarying float vAO;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAO = _ao;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uAOAmt;\nvarying float vAO;")
      .replace("#include <aomap_fragment>", `
        float ao = mix(1.0, clamp(vAO, 0.0, 1.0), uAOAmt);
        reflectedLight.indirectDiffuse *= ao;
        reflectedLight.directDiffuse *= mix(1.0, ao, ${AO.direct.toFixed(3)});
        reflectedLight.directSpecular *= ao;
        #include <aomap_fragment>`);
  });
}

export class ShipFleet {
  /**
   * @param {THREE.Object3D} gltfRoot GLTFLoader가 준 gltf.scene
   * @param {number} capacity 인스턴스 버퍼 크기 (한 번 잡으면 다시 만들지 않는다)
   */
  constructor(gltfRoot, capacity) {
    this.capacity = capacity;
    this.count = 0;
    this.group = new THREE.Group();
    this.missing = [];          // selfCheck용 — GLB에서 못 찾은 노드 이름
    this.mirrored = [];         // 카메라 쪽 뱃전으로 옮긴 요소 이름 (확인용)
    /** 배 몸체 조각들 — 인스턴스 i = 배 i. @type {{role:string, mesh:THREE.InstancedMesh}[]} */
    this.body = [];
    /**
     * 키워드 요소들 — 인스턴스는 그 요소를 단 배에만. slot = 인스턴스마다 몇 번 배인지(칠하는 요소만, 배 칸 표를 읽는다)
     * @type {{kw:string, node:string, mesh:THREE.InstancedMesh, n:number, slot:THREE.InstancedBufferAttribute|null}[]}
     */
    this.props = [];

    const ship = gltfRoot.getObjectByName(GLB_NODES.ship);
    if (!ship) {
      this.missing.push(GLB_NODES.ship);
      return;
    }

    // 요소들은 GLB상 Ship의 형제지만 실제 좌표는 갑판 위·뱃전이다. attach()는 월드 변환을
    // 유지한 채 부모만 바꾸므로, 블렌더에서 잡아둔 상대 위치 그대로 배의 자식이 된다.
    // (add()를 쓰면 로컬 좌표로 재해석돼 엉뚱한 데로 날아간다)
    for (const name of Object.keys(NODE_KEYWORD)) {
      const obj = gltfRoot.getObjectByName(name);
      if (!obj) { this.missing.push(name); continue; }
      ship.attach(obj);
    }
    if (!ship.getObjectByName(CABIN_NODE)) this.missing.push(CABIN_NODE);

    // 배의 로컬 변환을 비우고 뱃머리 보정만 남긴다 → 자식들의 matrixWorld가 곧
    // "배 원점 기준 지오메트리"가 된다. 보정 회전을 지오메트리에 구워두면 인스턴스
    // 행렬에는 진짜 헤딩만 들어가고, "0 = +X를 향함"이라는 의미가 그대로 유지된다.
    // (GLB의 Ship 노드에는 회전 π·배율 3.38이 들어 있다. 더하지 않고 "설정"하므로 상관없다 —
    //  += 로 돌리면 두 번 돌아 뒤집힌다)
    ship.removeFromParent();
    ship.position.set(0, 0, 0);
    ship.rotation.set(0, SHIP_FORWARD_OFFSET, 0);
    ship.scale.setScalar(1);
    ship.updateMatrixWorld(true);

    // 1) 전부 배 원점 기준으로 구워 모은다. 거울상 판정에 선체 중심선이 필요해서
    //    InstancedMesh를 만들기 전에 한 번 다 훑는다.
    const baked = [];
    ship.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      // 배율이 음수인(거울상) 노드는 굽고 나면 삼각형 감김이 법선과 반대가 된다. 일반 Mesh는 three가
      // 행렬식을 보고 앞면을 뒤집어 주지만 구운 지오메트리는 그렇지 않다 — 감김을 직접 되돌린다.
      // (GLB의 굴뚝이 그랬다: 바깥 벽이 잘려 나가고 안쪽 먼 벽이 그려져, 법선이 카메라 반대를 보며
      //  늘 까맣게 찍혔다. 광택을 넣자 그 면이 프레넬 최대로 번쩍여서 드러났다 — 09-30)
      if (child.matrixWorld.determinant() < 0) flipWinding(geo);
      baked.push({ child, geo, ...roleOf(child, ship) });
    });
    const hull = baked.find((b) => b.role === "hull");
    const hullBox = hull ? new THREE.Box3().setFromBufferAttribute(hull.geo.attributes.position) : null;
    const midZ = hullBox ? (hullBox.min.z + hullBox.max.z) / 2 : 0;

    // 2) 뱃전 요소가 카메라 반대쪽에 있으면 중심선 대칭으로 옮긴다.
    for (const b of baked) {
      if (b.role !== "prop" || !SIDE_PROPS.includes(b.node)) continue;
      b.geo.computeBoundingBox();
      const cz = (b.geo.boundingBox.min.z + b.geo.boundingBox.max.z) / 2;
      if ((cz - midZ) * FACE_SIGN < 0) {
        mirrorAcrossCenterline(b.geo, midZ);
        b.mirrored = true;   // 고양이 털 무늬가 얼굴 방향을 다시 잴 때 본다(boat-paint.js catFrame)
        this.mirrored.push(b.node);
      }
    }

    // 2.5) 설문 배와 같은 칠을 할 준비 — 선체 부품·갑판 판정, 램프 한 쌍(boat-paint.js).
    //      선체 지오메트리가 인덱스를 푼 것으로 바뀌므로, 아래(칠 속성·클로버 투영)는 바뀐 것을 쓴다.
    this.look = prepareBoatGeometry(baked, ship);

    // 2.7) 배마다 칠 — 배 칸 표. 선체 옆면의 기본 색은 GLB 선체 재질 색(지금까지 모든 배가 그 색이었다)
    const hullSrc = hull ? (Array.isArray(hull.child.material) ? hull.child.material[0] : hull.child.material) : null;
    this.paint = new BoatPaintTable(capacity, { hull: hullSrc ? hullSrc.color.clone() : new THREE.Color(0x60322a) });

    // 3) InstancedMesh를 만든다.
    for (const b of baked) {
      const mat = cloneMaterial(b.child.material);
      if (b.geo.attributes._ao) patchBakedAO(mat);
      const painted = applyBoatPaint(b, mat, this.paint);
      // 칠하는 조각은 _slot(몇 번 배인지)을 읽는다 — 몸체는 인스턴스 i = 배 i 로 고정, 요소는 배정할 때 적는다(_layoutProps)
      const slot = painted ? slotAttribute(b.geo, this.capacity, b.role !== "prop") : null;
      // 광택·테두리 빛·면 색 변주 — AO 값을 같이 쓰므로 AO 패치가 걸린 재질에만, 칠 뒤에(surface-fx.js).
      // 튜브만 광택·테두리 몫을 줄인다(설문과 같다 — 순백·순홍이라 혼자 번쩍였다).
      if (b.geo.attributes._ao) applySurfaceFx(mat, b.node === GLB_NODES.tube ? TUBE_FX_EDGE : 1);
      const inst = makeInstanced(b.geo, mat, this.capacity, `fleet:${b.kw || b.role}:${b.child.name}`);

      if (b.role === "prop") {
        inst.visible = false;
        this.props.push({ kw: b.kw, node: b.node, mesh: inst, n: 0, slot });
        this.group.add(inst);
        continue;
      }
      this.body.push({ role: b.role, mesh: inst });
      this.group.add(inst);
    }

    // 4) '우연' 클로버 — GLB에 없는 요소라 선체 표면에 투영해서 만든다(clover.js).
    //    늘 카메라 쪽 뱃전에 만든다 — 설문이 둘러볼 때 옮겨 주는 것과 같은 결과다.
    if (CLOVER_KEYWORD) {
      const cg = hull ? buildCloverGeometry(hull.geo, FACE_SIGN) : null;   // hull.geo = 2.5)에서 바뀐 것
      if (!cg) {
        this.missing.push(`${CLOVER_NODE}(선체 투영 실패 — CLOVER.along/height 확인)`);
      } else {
        const mat = makeCloverMaterial();
        mat.fog = true;
        applyCloverPaint(mat, this.paint);   // 고른 잎 색
        const slot = slotAttribute(cg, this.capacity, false);
        const inst = makeInstanced(cg, mat, this.capacity, `fleet:${CLOVER_KEYWORD}:${CLOVER_NODE}`);
        inst.renderOrder = 1;          // 선체를 먼저 그리고 그 위에 얹는다
        inst.visible = false;
        this.props.push({ kw: CLOVER_KEYWORD, node: CLOVER_NODE, mesh: inst, n: 0, slot });
        this.group.add(inst);
      }
    }

    /** 키워드 → 그 키워드의 요소 그룹들 */
    this.byKeyword = {};
    for (const p of this.props) (this.byKeyword[p.kw] ||= []).push(p);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    // 배마다 고른 키워드, 그리고 그 배의 요소들이 각 요소 그룹의 몇 번째 인스턴스인지.
    this.keywordsOf = new Array(this.capacity).fill(EMPTY);
    this._slots = Array.from({ length: this.capacity }, () => []);
    this._dirty = true;
  }

  /** 배 1척 몸체의 삼각형 수 (요소는 배마다 달라서 뺀다) */
  get triangleCount() {
    return this.body.reduce((n, g) => n + triCount(g.mesh.geometry), 0);
  }

  /** 요소별 삼각형 수 — 요소를 단 배 한 척당 늘어나는 양 */
  get propTriangles() {
    return Object.fromEntries(this.props.map((p) => [p.node, triCount(p.mesh.geometry)]));
  }

  /** 지금 그려지는 요소 인스턴스 수 (확인용) */
  get propInstances() {
    return this.props.reduce((n, p) => n + p.n, 0);
  }

  /** 화면에 띄울 배의 수. 인스턴스 버퍼를 다시 만들지 않고 count만 늘린다. */
  setCount(n) {
    this.count = Math.min(n, this.capacity);
    for (const g of this.body) g.mesh.count = this.count;
    this._dirty = true;
  }

  /**
   * 배 i의 "모습"을 쓴다. 자리가 밀릴 때마다 다시 부르면 되고, 매 프레임 부를 필요는 없다.
   * style이 어떻게 정해졌는지는 여기서 알 필요가 없다 — style.js 몫이다.
   * @param {{keywords:string[], paint:object, props:object, catCoat:string}} style
   */
  applyStyle(i, style) {
    if (this.paint) this.paint.write(i, style);
    this.keywordsOf[i] = style.keywords || EMPTY;
    this._dirty = true;
  }

  /**
   * 요소 인스턴스를 다시 배정한다. 배 목록이 바뀌면(추가·삭제·정원 초과) 인덱스가 밀리므로
   * 그때마다 한 번. 배 80척 × 키워드 두어 개라 순식간이다.
   */
  _layoutProps() {
    for (const p of this.props) p.n = 0;
    for (let i = 0; i < this.count; i++) {
      const slots = this._slots[i];
      slots.length = 0;
      for (const kw of this.keywordsOf[i]) {
        const groups = this.byKeyword[kw];
        if (!groups) continue;
        for (const p of groups) {
          if (p.slot) p.slot.array[p.n] = i;   // 이 요소 인스턴스는 배 i 의 것 — 배 칸 표에서 i 열을 읽는다
          slots.push(p, p.n++);
        }
      }
    }
    for (const p of this.props) {
      if (p.slot) p.slot.needsUpdate = true;
      p.mesh.count = p.n;
      // 아무 배도 안 쓰는 요소는 그리지 않는다 — draw call이 아예 안 생긴다.
      p.mesh.visible = p.n > 0;
    }
    this._dirty = false;
  }

  /**
   * 매 프레임 배 i의 자리를 쓴다.
   * @param {number} y 수면 높이 (흘수는 여기서 더한다)
   * @param {number} headingY 뱃머리 방향(라디안). 0이면 +X.
   * @param {number} scaleMul 등장 연출용 배율 (평소 1)
   * @param {number} pitch 앞뒤 들썩임. 뱃머리가 +X라 Z축 회전이다.
   * @param {number} roll  좌우 흔들림. 같은 이유로 X축 회전이다.
   */
  writeMatrix(i, x, y, z, headingY, scaleMul, pitch, roll) {
    if (this._dirty) this._layoutProps();
    const s = FLEET_SHIP_SCALE * (scaleMul === undefined ? 1 : scaleMul);
    this._p.set(x, y + SHIP_DRAFT * s, z);
    // YXZ 순서라 R = Ry(heading) · Rx(roll) · Rz(pitch) 가 된다 —
    // 헤딩을 먼저 돌리고 그 배의 로컬 축에서 기울인다는 뜻.
    this._e.set(roll || 0, headingY, pitch || 0, "YXZ");
    this._q.setFromEuler(this._e);
    this._s.setScalar(s);
    this._m.compose(this._p, this._q, this._s);

    const src = this._m.elements;
    const o = i * 16;
    for (const g of this.body) {
      const dst = g.mesh.instanceMatrix.array;
      for (let k = 0; k < 16; k++) dst[o + k] = src[k];
    }
    const slots = this._slots[i];
    for (let j = 0; j < slots.length; j += 2) {
      const dst = slots[j].mesh.instanceMatrix.array, po = slots[j + 1] * 16;
      for (let k = 0; k < 16; k++) dst[po + k] = src[k];
    }
  }

  /** 한 프레임의 쓰기가 끝났음을 알린다. 이걸 빼먹으면 배가 그 자리에 굳는다. */
  commit() {
    for (const g of this.body) g.mesh.instanceMatrix.needsUpdate = true;
    for (const p of this.props) if (p.n > 0) p.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * 배 칸 번호 속성(_slot) — 인스턴스마다 몇 번 배인지. 칠하는 재질이 배 칸 표에서 그 열을 읽는다(boat-paint.js).
 * fixed = 몸체 조각(인스턴스 i = 배 i), 아니면 요소(_layoutProps 가 채운다).
 */
function slotAttribute(geo, capacity, fixed) {
  const arr = new Float32Array(capacity);
  if (fixed) for (let i = 0; i < capacity; i++) arr[i] = i;
  const attr = new THREE.InstancedBufferAttribute(arr, 1);
  attr.setUsage(fixed ? THREE.StaticDrawUsage : THREE.DynamicDrawUsage);
  geo.setAttribute("_slot", attr);
  return attr;
}

function triCount(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}
