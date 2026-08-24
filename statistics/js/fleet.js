/* =============================================================================
 * fleet.js — 배 80척을 InstancedMesh로.
 *
 * 온보딩 씬은 배 1척 = THREE.Group 하나였다. 그대로 80척으로 늘리면 draw call이
 * 80배가 된다. 여기서는 Scene.glb의 "Ship" 노드를 통째로 인스턴싱한다.
 *
 * ── 미결정 사항 결정: "배당 색 1개 vs 선체/캐빈 분리" ────────────────────────
 * 둘 중 하나를 고르는 대신, GLB의 메쉬 노드마다 InstancedMesh를 하나씩 만들고
 * 전부 같은 인스턴스 행렬을 공유하게 했다.
 *   · 선체(Kapal)·굴뚝 재질은 GLB 원본 그대로 유지된다 — 색을 임의로 바꾸지 않는다는 원칙
 *   · 캐빈 그룹에만 instanceColor를 걸어 "첫 번째 키워드 = 캐빈 색"이라는
 *     온보딩의 규칙을 그대로 재현한다
 *   · draw call은 재질 수(약 8)로 고정 — 배가 80척이든 800척이든 늘지 않는다
 * 즉 "배당 색 1개"의 제약도, "메쉬를 둘로 쪼개는" 수고도 없이 둘 다 얻는다.
 *
 * ── 소품(갈매기/구명튜브) ──────────────────────────────────────────────────
 * 온보딩의 키워드 소품 규칙(자유→갈매기, 관계→튜브)을 지도에서도 유지한다.
 * 소품 그룹은 해당 키워드가 없는 배 자리에 "0 행렬"을 써서 지운다. 삼각형이
 * 한 점으로 뭉개져 래스터라이즈되지 않으므로, 인스턴스를 빼는 것과 비용이 같으면서
 * 인덱스 매핑을 따로 관리하지 않아도 된다.
 *
 * ── 그림자 ────────────────────────────────────────────────────────────────
 * 켜지 않는다. 온보딩은 배 1척 주변으로 절두체를 바짝 조여서 또렷한 그림자를
 * 얻었지만(±5), 지도는 반경 38의 바다 전체를 덮어야 해서 같은 1024맵으로는
 * 그림자가 뭉개진 얼룩이 된다. 그림자 패스 자체를 빼는 쪽이 화질도 성능도 낫다.
 * ========================================================================== */

import * as THREE from "three";
import {
  SHIP_FORWARD_OFFSET, SHIP_DRAFT, FLEET_SHIP_SCALE,
  KEYWORD_COLOR, CABIN_BASE_COLOR, KEYWORD_PROP,
} from "./config.js";

// GLB 노드 이름 → 역할. 이름이 바뀌면 조용히 역할이 사라지므로 selfCheck가 확인한다.
const CABIN_NODE = "Cabin";
const PROP_NODES = { Seagull: "gull", Tube: "tube" };

/** 메쉬에서 위로 거슬러 올라가며 역할을 찾는다. 아무 데도 안 걸리면 선체 취급. */
function roleOf(mesh, shipRoot) {
  for (let o = mesh; o && o !== shipRoot.parent; o = o.parent) {
    if (PROP_NODES[o.name]) return PROP_NODES[o.name];
    if (o.name === CABIN_NODE) return "cabin";
  }
  return "body";
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

    const ship = gltfRoot.getObjectByName("Ship");
    if (!ship) {
      this.missing.push("Ship");
      return;
    }

    // 소품은 GLB상 Ship의 형제지만 실제 좌표는 배 위·뱃전이다. attach()는 월드 변환을
    // 유지한 채 부모만 바꾸므로, 블렌더에서 잡아둔 상대 위치 그대로 배의 자식이 된다.
    // (add()를 쓰면 로컬 좌표로 재해석돼 엉뚱한 데로 날아간다)
    for (const name of Object.keys(PROP_NODES)) {
      const obj = gltfRoot.getObjectByName(name);
      if (!obj) { this.missing.push(name); continue; }
      ship.attach(obj);
    }
    if (!ship.getObjectByName(CABIN_NODE)) this.missing.push(CABIN_NODE);

    // 배의 로컬 변환을 비우고 뱃머리 보정만 남긴다 → 자식들의 matrixWorld가 곧
    // "배 원점 기준 지오메트리"가 된다. 보정 회전을 지오메트리에 구워두면 인스턴스
    // 행렬에는 진짜 헤딩만 들어가고, "0 = +X를 향함"이라는 의미가 그대로 유지된다.
    ship.removeFromParent();
    ship.position.set(0, 0, 0);
    ship.rotation.set(0, SHIP_FORWARD_OFFSET, 0);
    ship.scale.setScalar(1);
    ship.updateMatrixWorld(true);

    // 메쉬마다 InstancedMesh 하나. 지오메트리에는 배 원점 기준 변환을 구워 넣는다.
    /** @type {{role:string, mesh:THREE.InstancedMesh, mat:Float32Array}[]} */
    this.groups = [];
    this.cabinMeshes = [];
    ship.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const role = roleOf(child, ship);

      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);

      // 재질은 clone한다 — GLB의 원본 인스턴스를 건드리면 나중에 같은 파일을 쓰는
      // 다른 화면(온보딩 씬)까지 물든다.
      const mat = Array.isArray(child.material)
        ? child.material[0].clone() : child.material.clone();
      mat.fog = true;

      const inst = new THREE.InstancedMesh(geo, mat, this.capacity);
      inst.name = `fleet:${role}:${child.name}`;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // 인스턴스가 바다 전체에 흩어져 매 프레임 움직인다. 지오메트리 하나 기준으로
      // 잡히는 기본 바운딩으로는 컬링 판정이 틀리므로 아예 끈다 (그룹 8개뿐이라 무해).
      inst.frustumCulled = false;
      inst.castShadow = false;
      inst.receiveShadow = false;
      inst.count = 0;

      if (role === "cabin") {
        // 온보딩과 같은 처리: 재질을 갈아끼우지 않고 color만 다룬다. three.js는 color를
        // map에 곱하므로 나중에 UV 아틀라스 텍스처가 붙어도 키워드 색이 틴트로 남는다.
        // 다만 지도에서는 재질 색을 흰색으로 두고 instanceColor가 색 전체를 들고 간다.
        // 재질에 크림색을 두고 거기에 키워드 색을 또 곱하면 두 색이 겹쳐 곱해져서
        // 원래 키워드 색보다 어둡고 탁한 색이 나온다(실측: 관계 #e28ea0 → 거의 팥죽색).
        mat.color.setHex(0xffffff);
        inst.instanceColor = new THREE.InstancedBufferAttribute(
          new Float32Array(this.capacity * 3).fill(1), 3
        );
        inst.instanceColor.setUsage(THREE.DynamicDrawUsage);

        // [함정] instanceColor를 넣는 것만으로는 아무 일도 일어나지 않는다.
        // three.js의 color_vertex 청크는 USE_INSTANCING_COLOR만 있어도 vColor를 채우지만,
        // color_fragment 청크는 USE_COLOR(=material.vertexColors)일 때만 그 vColor를
        // diffuseColor에 곱한다. 즉 vertexColors를 켜지 않으면 인스턴스 색이 조용히 버려진다
        // — 화면은 멀쩡히 그려지고 캐빈만 원래 색으로 남아서 한참 뒤에나 눈치챈다.
        mat.vertexColors = true;

        // [함정 2] GLB의 Cabin 노드에는 재질이 없다. 그러면 GLTFLoader가 기본 재질을
        // 만들어 주는데, 그 기본값이 metalness:1(완전 금속)이다. 금속은 확산광이 없고
        // 환경맵 반사만 보이는데 이 씬에는 환경맵이 없어서, 직사광이 강한 낮에는
        // 색이 스페큘러로 어른거리다가 밤 팔레트에서는 캐빈이 통째로 새까매진다.
        // 즉 "키워드 → 캐빈 색"이라는 규칙이 기본 설정(밤)에서 아무 일도 안 하게 된다.
        // 이건 누가 의도해서 칠한 재질이 아니라 로더의 기본값이므로, 캐빈 그룹에 한해
        // 확산 재질로 되돌린다. (색·지오메트리는 그대로다. 온보딩 씬도 같은 기본값을
        // 쓰고 있어서 같은 증상이 잠재해 있다 — 거기는 낮 계열이 기본이라 안 드러날 뿐이다)
        mat.metalness = 0;
        mat.roughness = 0.8;
        // vertexColors를 켜면 셰이더가 지오메트리의 color 어트리뷰트도 같이 읽는다.
        // 없으면 기본값이 들어가 캐빈이 새까매지므로, 전부 1인 어트리뷰트를 깔아 둔다
        // (곱셈의 항등원이라 결과에 영향이 없다). 캐빈은 12삼각형뿐이라 비용도 없다.
        const vcount = geo.attributes.position.count;
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(vcount * 3).fill(1), 3));

        this.cabinMeshes.push(inst);
      }

      this.groups.push({ role, mesh: inst, mat: inst.instanceMatrix.array });
      this.group.add(inst);
    });

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    // 배마다 어떤 소품을 다는지 — writeMatrix가 매 프레임 참조한다.
    this.props = new Array(this.capacity).fill(null).map(() => ({ gull: false, tube: false }));
  }

  get triangleCount() {
    return this.groups.reduce((n, g) => n + g.mesh.geometry.index.count / 3, 0);
  }

  /** 화면에 띄울 배의 수. 인스턴스 버퍼를 다시 만들지 않고 count만 늘린다. */
  setCount(n) {
    this.count = Math.min(n, this.capacity);
    for (const g of this.groups) g.mesh.count = this.count;
  }

  /**
   * 기록 하나가 배 i에 배정될 때 한 번만 부르는 것들 — 색과 소품.
   * @param {{keywords:string[]}} record
   */
  applyRecord(i, record) {
    const kws = record.keywords || [];
    // 첫 번째 키워드가 캐빈 색 (온보딩 규칙 그대로). 없으면 기본 크림색.
    const hex = KEYWORD_COLOR[kws[0]];
    this._c.setHex(hex === undefined ? CABIN_BASE_COLOR : hex);
    for (const m of this.cabinMeshes) {
      this._c.toArray(m.instanceColor.array, i * 3);
      m.instanceColor.needsUpdate = true;
    }

    const props = this.props[i];
    props.gull = false; props.tube = false;
    for (const k of kws) {
      const p = KEYWORD_PROP[k];
      if (p) props[p] = true;
    }
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
    for (const g of this.groups) {
      const hidden = (g.role === "gull" && !this.props[i].gull)
        || (g.role === "tube" && !this.props[i].tube);
      if (hidden) {
        // 이 배에는 이 소품이 없다 → 지오메트리를 한 점으로 뭉갠다.
        // 주의: 행렬 전체를 0으로 채우면 안 된다. 그러면 클립 좌표의 w까지 0이 되어
        // 원근 나눗셈이 0으로 나누기가 되고, 드라이버에 따라 화면을 가로지르는 가는
        // 선들이 그려진다(실측: 수평선 쪽으로 뻗는 어두운 줄). 회전·스케일 부분만 0으로
        // 비우고 위치와 w(=1)는 살려 둬야 "부피 없는 점"으로 제대로 접힌다.
        for (let k = 0; k < 12; k++) g.mat[o + k] = 0;
        g.mat[o + 12] = src[12]; g.mat[o + 13] = src[13]; g.mat[o + 14] = src[14];
        g.mat[o + 15] = 1;
      } else {
        for (let k = 0; k < 16; k++) g.mat[o + k] = src[k];
      }
    }
  }

  /** 한 프레임의 쓰기가 끝났음을 알린다. 이걸 빼먹으면 배가 그 자리에 굳는다. */
  commit() {
    for (const g of this.groups) g.mesh.instanceMatrix.needsUpdate = true;
  }
}
