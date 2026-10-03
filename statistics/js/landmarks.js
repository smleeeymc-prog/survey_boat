/* =============================================================================
 * landmarks.js — 먼 바다의 등대 섬 (지도 전용 풍경).
 *
 * 왜: 지도는 끝없는 평면 바다와 하늘뿐이라 눈이 머물 기준점이 없었다(10-03 사용자: "풍경이 안 예쁘다").
 * 설문 화면이 예쁜 건 섬·등대·오두막이 배 뒤를 채워서다. 같은 GLB의 섬(Rock·Beachhouse)과 등대를
 * 지도 먼 바다에 하나 세운다 — 새 모델 없이, 두 화면이 "같은 장소"로 이어진다.
 *
 * 섬은 흐르는 배들 뒤(깊이 띠 10~48)보다 훨씬 먼 수평선 가까이에 둔다. 안개가 반쯤 덮어 공기 원근이 생기고,
 * 배와 겹치거나 부딪힐 일이 없다. 자리·크기는 config.js LANDMARK.
 * 밤·저녁에는 등대 창이 켜진다(재질 emissive — 조명을 늘리지 않는다).
 * ========================================================================== */

import * as THREE from "three";
import { GLB_NODES, LANDMARK } from "./config.js";
import { cloneMaterial, patchBakedAO, flipWinding } from "./fleet.js";
import { concatGeometries } from "./boat-paint.js";

const WINDOW_MAT = "Lighthouse_Window";

/**
 * GLB에서 섬·등대를 떼어 지도 먼 바다에 세운다. 원본 노드는 옮기므로 fleet 생성 뒤에 부를 것
 * (fleet 은 Ship 쪽 노드만 쓴다).
 * @param {THREE.Object3D} gltfRoot
 * @param {string} timeKey 시간대 — 밤·저녁이면 등대 창을 켠다
 * @returns {{group: THREE.Group, missing: string[]}}
 */
export function buildLandmarks(gltfRoot, timeKey) {
  const group = new THREE.Group();
  group.name = "landmarks";
  const missing = [];
  gltfRoot.updateMatrixWorld(true);
  const island = gltfRoot.getObjectByName(GLB_NODES.island);
  if (!island) { missing.push(GLB_NODES.island); return { group, missing }; }

  // 섬 좌표계 기준으로 모은다 — 설문 plantOnIsland 와 같다(블렌더에서 잡은 상대 자리 그대로)
  const toIsland = new THREE.Matrix4().copy(island.matrixWorld).invert();
  const local = new THREE.Group();
  const plant = (obj) => {
    new THREE.Matrix4().multiplyMatrices(toIsland, obj.matrixWorld).decompose(obj.position, obj.quaternion, obj.scale);
    local.add(obj);
  };
  for (const name of [GLB_NODES.rock, GLB_NODES.beachhouse, GLB_NODES.lighthouse]) {
    const obj = gltfRoot.getObjectByName(name);
    if (!obj) { missing.push(name); continue; }
    plant(obj);
  }
  // 등대 받침 바위 — 설문에서 등대는 뒷산 위에 서 있었는데 지금 GLB에는 뒷산이 없어, 지도에서는
  // 등대가 맨 바다에 서 있었다. 섬 바위를 작게 하나 더 복제해 등대 밑에 깐다(작은 바위섬 + 등대).
  const lh = local.getObjectByName(GLB_NODES.lighthouse);
  const rock = local.getObjectByName(GLB_NODES.rock);
  if (lh && rock) {
    const base = rock.clone(true);
    const rb = new THREE.Box3().setFromObject(rock), lb = new THREE.Box3().setFromObject(lh);
    const rs = rb.getSize(new THREE.Vector3()), ls = lb.getSize(new THREE.Vector3());
    // 바위 높이를 등대 높이의 LANDMARK.lighthouseRock 배로, 등대 발치가 바위 꼭대기 조금 아래에 묻히게
    const k = (ls.y * LANDMARK.lighthouseRock) / Math.max(rs.y, 1e-6);
    base.scale.multiplyScalar(k);
    base.position.set(0, 0, 0);
    base.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(base);
    const c = lb.getCenter(new THREE.Vector3()), bc = bb.getCenter(new THREE.Vector3());
    // 받침 바위 바닥 = 섬 바위 바닥(물에 잠긴 깊이가 같게), 가로는 등대 발치 가운데
    base.position.set(c.x - bc.x, rb.min.y - bb.min.y, c.z - bc.z);
    local.add(base);
    // 등대 발치를 받침 바위 높이의 70% 자리에 — 꼭대기에 얹으면 바위 틈으로 떠 보인다
    const h = bb.max.y - bb.min.y;
    lh.position.y += rb.min.y + h * 0.7 - lb.min.y;
  }

  // 재질은 섬 전용으로 복제 — 아틀라스 재질은 배 소품과 원본을 같이 쓴다
  const own = new Map();
  const night = timeKey === "night" || timeKey === "evening";
  local.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!own.has(o.material)) {
      const m = cloneMaterial(o.material);
      if (o.geometry.attributes._ao) patchBakedAO(m);
      if (m.name === WINDOW_MAT && night) {
        // 등대 창 — 밤엔 따뜻하게 켠다. 빛을 뿌리지는 않는다(조명 수를 늘리면 모든 재질이 다시 컴파일된다)
        m.emissive = new THREE.Color(LANDMARK.windowColor);
        m.emissiveIntensity = LANDMARK.windowGlow;
      }
      own.set(o.material, m);
    }
    o.material = own.get(o.material);
    o.castShadow = o.receiveShadow = false;
  });

  // 크기: 섬 가로 폭을 LANDMARK.width(월드)로. 높이 0(수면)은 그대로 수면에 남게 원점 기준으로 키운다.
  const box = new THREE.Box3().setFromObject(local);
  const size = box.getSize(new THREE.Vector3());
  const s = LANDMARK.width / Math.max(size.x, size.z, 1e-6);
  local.scale.setScalar(s);
  local.rotation.y = LANDMARK.rotY;
  // LANDMARK.x·z 가 섬 덩어리의 가운데가 되게 — 섬 좌표계 원점은 덩어리 한쪽 끝일 수 있다
  local.updateMatrixWorld(true);
  const mid = new THREE.Box3().setFromObject(local).getCenter(new THREE.Vector3());
  local.position.set(-mid.x, 0, -mid.z);
  group.add(local);
  group.position.set(LANDMARK.x, LANDMARK.y, LANDMARK.z);
  group.updateMatrixWorld(true);
  return { group: mergeByMaterial(group), missing };
}

/**
 * 움직이지 않는 섬이라 재질별로 한 덩어리씩 굽는다 — 메쉬 그대로면 조각마다 draw call 이라
 * 바위 스무 개 남짓 + 오두막 + 등대로 20개가 넘게 는다. 구우면 재질 수(바위·아틀라스·등대 창 = 3)만큼.
 */
function mergeByMaterial(root) {
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // 배율이 음수인 노드는 감김이 뒤집힌다(fleet.js 굴뚝과 같은 이유)
    if (o.matrixWorld.determinant() < 0) flipWinding(g);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  out.name = "landmarks";
  for (const [mat, geos] of byMat) {
    // 조각마다 속성 목록이 다를 수 있다 — 모두에 있는 것만 남긴다(빠지면 이어붙일 때 어긋난다)
    const common = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
    for (const g of geos) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
    let merged = geos[0];
    for (let i = 1; i < geos.length; i++) merged = concatGeometries(merged, geos[i]);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `landmarks:${mat.name || "mat"}`;
    out.add(mesh);
  }
  out.updateMatrixWorld(true);
  return out;
}
