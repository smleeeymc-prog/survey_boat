/* =============================================================================
 * clover.js — '우연'의 네잎클로버 데칼.
 *
 * 다른 키워드 요소는 GLB에 모델이 있지만, 클로버만 GLB에 없다. 설문 화면이 코드로
 * 그려서 선체 뱃머리 옆면에 투영해 붙인다(index.html _buildClover). 여기는 그걸 지도의
 * 좌표계로 옮긴 것이다. 자리·크기·색은 shared/glb-nodes.js 의 CLOVER 한 곳에서 온다.
 *
 * 설문과 다른 점은 좌표계 하나뿐이다. 설문은 배 노드에 배율 3.38이 걸린 월드에서 투영하고,
 * 지도는 fleet.js가 "배 원점 기준, 배율 1"로 구워 둔 선체 지오메트리 위에서 투영한다.
 * 그래서 CLOVER의 월드 단위 값을 refScale 로 나눠 배 좌표로 옮겨 쓴다.
 *
 * 구운 공간의 축: 뱃머리 = +X (fleet.js가 SHIP_FORWARD_OFFSET을 지오메트리에 구워 넣는다),
 * 위 = +Y, 우현 = 뱃머리 × 위 = +Z.
 * ========================================================================== */

import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { CLOVER, SHIP_DRAFT } from "./config.js";

/**
 * 선체 표면에 클로버 데칼 지오메트리를 만든다.
 * @param {THREE.BufferGeometry} hullGeo 배 원점 기준으로 구운 선체 지오메트리
 * @param {number} sideSign +1 = 우현(+Z), -1 = 좌현. 지도는 카메라 쪽 뱃전을 넘긴다.
 * @returns {THREE.BufferGeometry|null} 못 만들면 null — 화면을 멈추지 않고 건너뛴다
 */
export function buildCloverGeometry(hullGeo, sideSign) {
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  hull.updateMatrixWorld(true);

  const bow = new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3(0, 0, sideSign);

  // 선체가 뱃머리 방향으로 어디까지 뻗는지 잰다. "가운데 → 뱃머리 끝"의 비율로 자리를 잡는다.
  const p = hullGeo.attributes.position;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i);
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const center = (lo + hi) / 2;
  const along = center + (hi - center) * CLOVER.along;

  // 수면 위 높이(설문 월드 단위) → 배 좌표. 배 원점은 수면에서 흘수만큼 위에 있다
  // (fleet.js writeMatrix가 y + SHIP_DRAFT·배율 로 올린다 — 설문도 같은 규칙).
  const k = 1 / CLOVER.refScale;
  const onAxis = new THREE.Vector3(along, CLOVER.height * k - SHIP_DRAFT, 0);

  // 옆 바깥에서 선체 쪽으로 광선을 쏴 표면 점과 법선을 얻는다.
  const from = onAxis.clone().addScaledVector(right, 5);
  const aim = onAxis.clone().sub(from).normalize();
  const hit = new THREE.Raycaster(from, aim).intersectObject(hull, false)[0];
  if (!hit || !hit.face) return null;
  // 구운 지오메트리라 면 법선이 이미 배 좌표다. 양면 재질이라 안쪽 면에 맞았을 수도 있다.
  const n = hit.face.normal.clone().normalize();
  if (n.dot(aim) > 0) n.negate();

  const helper = new THREE.Object3D();
  helper.position.copy(hit.point);
  helper.lookAt(hit.point.clone().add(n));
  helper.rotateZ(CLOVER.spin);
  const s = CLOVER.size * k;
  const geo = new DecalGeometry(hull, hit.point, helper.rotation, new THREE.Vector3(s, s, s * 0.5));

  // 투영 상자 안에 든 면은 방향과 상관없이 다 찍힌다 — 뱃전 안쪽 면에 거울상 클로버가
  // 생기지 않게, 바깥(법선 n)을 등진 삼각형은 버린다. (설문과 같은 처리)
  const gp = geo.attributes.position, gn = geo.attributes.normal, gu = geo.attributes.uv;
  const keep = { position: [], normal: [], uv: [] };
  for (let i = 0; i + 2 < gp.count; i += 3) {
    let d = 0;
    for (let j = 0; j < 3; j++) d += gn.getX(i + j) * n.x + gn.getY(i + j) * n.y + gn.getZ(i + j) * n.z;
    if (d <= 0) continue;
    for (let j = 0; j < 3; j++) {
      keep.position.push(gp.getX(i + j), gp.getY(i + j), gp.getZ(i + j));
      keep.normal.push(gn.getX(i + j), gn.getY(i + j), gn.getZ(i + j));
      keep.uv.push(gu.getX(i + j), gu.getY(i + j));
    }
  }
  geo.dispose();
  hull.material.dispose();
  if (!keep.position.length) return null;

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(keep.position, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(keep.normal, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(keep.uv, 2));
  return out;
}

/** 클로버 재질. 설문과 같은 설정이다(투명·깊이 안 씀·선체보다 앞으로 밀기). */
export function makeCloverMaterial() {
  const tex = new THREE.CanvasTexture(drawClover());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.02, depthWrite: false, roughness: 0.85,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

/**
 * 네잎클로버 그림. 설문 index.html 의 _drawClover 와 같은 그림이다 — 모양은 코드라
 * shared로 못 옮기고, 색만 CLOVER에서 온다. 모양을 바꾸면 두 곳을 같이 고칠 것.
 */
function drawClover() {
  const N = 256, c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  g.translate(N / 2, N / 2);
  // 하트 한 장: 뾰족한 끝이 가운데(원점)를 향하고 둥근 쪽이 바깥(-y)으로
  const heart = (r) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-r * 0.15, -r * 0.35, -r * 1.05, -r * 0.55, -r * 0.62, -r * 1.02);
    g.bezierCurveTo(-r * 0.36, -r * 1.28, -r * 0.04, -r * 1.12, 0, -r * 0.86);
    g.bezierCurveTo(r * 0.04, -r * 1.12, r * 0.36, -r * 1.28, r * 0.62, -r * 1.02);
    g.bezierCurveTo(r * 1.05, -r * 0.55, r * 0.15, -r * 0.35, 0, 0);
    g.closePath();
  };
  // 줄기
  g.strokeStyle = CLOVER.vein; g.lineWidth = N * 0.035; g.lineCap = "round";
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(N * 0.06, N * 0.28, N * 0.16, N * 0.44); g.stroke();
  const r = N * 0.3;
  for (let k = 0; k < 4; k++) {
    g.save();
    g.rotate(k * Math.PI / 2 + Math.PI / 4);
    heart(r);
    g.fillStyle = CLOVER.leaf; g.fill();
    g.lineWidth = N * 0.018; g.strokeStyle = CLOVER.vein; g.stroke();
    // 잎맥
    g.beginPath(); g.moveTo(0, -r * 0.08); g.lineTo(0, -r * 0.78);
    g.lineWidth = N * 0.012; g.stroke();
    g.restore();
  }
  return c;
}
