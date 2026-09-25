/* =============================================================================
 * look-lab.js — 그림 톤 테스트 메뉴 (임시). 오른쪽 위 "룩" 버튼.
 *
 * 폰에서 켜고 끄며 비교해 보려고 만든 것이다. 정해지면 지운다:
 *   1) 이 파일(dev/look-lab.js)을 지우고
 *   2) index.html 의 `import("./dev/look-lab.js")` 한 줄을 지운다.
 * 고른 룩을 기본으로 남기려면 index.html 의 LOOK_DEFAULT 를 바꾼다.
 *
 * 켜고 끌 수 있는 것
 *   필름 룩   BottleScene.setLook("film" | "basic") — AgX 톤 매핑 + 반구광 + 명암 대비
 *   블룸      밝은 곳이 번지는 빛. 화면을 그린 뒤 1/4 해상도로 한 번 더 그려 밝은 부분만 흐리게
 *             만들어 위에 더한다(기존 렌더는 그대로). 켜면 장면을 두 번 그리므로 가장 무겁다.
 *   색보정    캔버스에 CSS 필터(대비·채도·따뜻함). GPU 합성 단계라 거의 공짜.
 *   그레인    필름 입자. 노이즈 타일을 화면 위에 overlay로 얹고 흔든다. 거의 공짜.
 *   FPS       지금 초당 프레임 — 무엇을 켰을 때 버벅이는지 보기용.
 * 고른 값은 이 기기 브라우저에만 기억한다(localStorage).
 * ========================================================================== */
import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";

const STORE_KEY = "lookLab.v1";
const GRADE_FILTER = "contrast(1.07) saturate(1.1) sepia(0.08) hue-rotate(-6deg) brightness(1.03)";
const BLOOM = { scale: 0.25, threshold: 0.78, knee: 0.12, strength: 0.9 };

// ── 블룸 ────────────────────────────────────────────────────────────────────
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

class OverlayBloom {
  constructor(renderer) {
    this.r = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opt);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opt);
    this.rtC = new THREE.WebGLRenderTarget(1, 1, opt);
    this.rtD = new THREE.WebGLRenderTarget(1, 1, opt);
    this.bright = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: BLOOM.threshold }, uKnee: { value: BLOOM.knee } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uThreshold, uKnee; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * smoothstep(uThreshold - uKnee, uThreshold + uKnee, l), 1.0);
        }`,
    }));
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
          c += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.316216;
          c += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.070270;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    this.comp = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tC: { value: null }, uStrength: { value: BLOOM.strength } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tA, tC; uniform float uStrength; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tA, vUv).rgb + texture2D(tC, vUv).rgb * 1.3;
          gl_FragColor = vec4(c * uStrength, 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    }));
    this._size = new THREE.Vector2();
  }

  _ensure(w, h) {
    const w4 = Math.max(1, Math.round(w * BLOOM.scale)), h4 = Math.max(1, Math.round(h * BLOOM.scale));
    if (this.rtScene.width === w4 && this.rtScene.height === h4) return;
    this.rtScene.setSize(w4, h4); this.rtA.setSize(w4, h4); this.rtB.setSize(w4, h4);
    const w8 = Math.max(1, w4 >> 1), h8 = Math.max(1, h4 >> 1);
    this.rtC.setSize(w8, h8); this.rtD.setSize(w8, h8);
  }

  _pass(quad, src, dst) {
    quad.material.uniforms.tDiffuse.value = src.texture;
    this.r.setRenderTarget(dst);
    quad.render(this.r);
  }

  _blur(src, tmp, dirScale) {
    const u = this.blur.material.uniforms;
    u.uDir.value.set(dirScale / src.width, 0); this._pass(this.blur, src, tmp);
    u.uDir.value.set(0, dirScale / src.height); this._pass(this.blur, tmp, src);
  }

  render(scene, camera) {
    const r = this.r;
    r.getDrawingBufferSize(this._size);
    this._ensure(this._size.x, this._size.y);
    const prev = { target: r.getRenderTarget(), auto: r.autoClear, shadow: r.shadowMap.autoUpdate, bg: scene.background };
    // 그림자 맵은 방금 본 화면을 그리면서 이미 갱신됐다 — 또 그리지 않는다.
    // 하늘 배경은 빼고 그린다(검정) — 밝은 하늘 전체가 번져 화면이 뿌옇게 뜨지 않게.
    r.shadowMap.autoUpdate = false;
    scene.background = null;
    r.setRenderTarget(this.rtScene);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, camera);
    scene.background = prev.bg;
    r.setClearColor(0x000000, 0);
    this._pass(this.bright, this.rtScene, this.rtA);
    this._blur(this.rtA, this.rtB, 1.0);
    this._pass(this.blur, this.rtA, this.rtC);      // 반 해상도로 내리면서 한 번 더 넓게
    this._blur(this.rtC, this.rtD, 1.5);
    const cu = this.comp.material.uniforms;
    cu.tA.value = this.rtA.texture; cu.tC.value = this.rtC.texture;
    r.setRenderTarget(null);
    r.autoClear = false;
    this.comp.render(r);
    r.autoClear = prev.auto;
    r.shadowMap.autoUpdate = prev.shadow;
    r.setRenderTarget(prev.target);
  }
}

// ── 그레인 ──────────────────────────────────────────────────────────────────
function makeGrainLayer() {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d");
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const el = document.createElement("div");
  el.id = "lookLabGrain";
  el.style.backgroundImage = `url(${c.toDataURL()})`;
  return el;
}

// ── 메뉴 ────────────────────────────────────────────────────────────────────
const CSS = `
  #lookLabBtn{ position:fixed; top:42px; right:10px; z-index:1000; border:0; cursor:pointer;
    background:rgba(20,22,30,.78); color:#f3e6cf; font:600 11px/1 var(--font, sans-serif);
    padding:7px 11px; border-radius:20px; letter-spacing:.02em; backdrop-filter:blur(6px); }
  #lookLabPanel{ position:fixed; top:74px; right:10px; z-index:1000; display:none; min-width:168px;
    background:rgba(20,22,30,.86); color:#f3e6cf; font:12px/1.4 var(--font, sans-serif);
    padding:10px 12px; border-radius:14px; backdrop-filter:blur(8px); box-shadow:0 6px 20px rgba(0,0,0,.25); }
  #lookLabPanel.show{ display:block; }
  #lookLabPanel label{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:5px 0; cursor:pointer; }
  #lookLabPanel input{ width:18px; height:18px; accent-color:#d6b25e; }
  #lookLabPanel .fps{ margin-top:6px; padding-top:7px; border-top:1px solid rgba(255,255,255,.15); opacity:.8; font-variant-numeric:tabular-nums; }
  #lookLabPanel .hint{ font-size:10.5px; opacity:.55; margin-top:3px; }
  #lookLabGrain{ position:fixed; inset:-50%; z-index:1; pointer-events:none; display:none;
    mix-blend-mode:overlay; opacity:.07; background-size:160px 160px;
    animation:lookLabGrain .6s steps(6) infinite; }
  #lookLabGrain.show{ display:block; }
  @keyframes lookLabGrain{
    0%{transform:translate(0,0)} 17%{transform:translate(-7%,4%)} 33%{transform:translate(5%,-6%)}
    50%{transform:translate(-3%,7%)} 67%{transform:translate(8%,2%)} 83%{transform:translate(-6%,-4%)} 100%{transform:translate(0,0)} }
`;

export function installLookLab(bottleScene) {
  if (!bottleScene || document.getElementById("lookLabBtn")) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  let state = { film: false, bloom: false, grade: false, grain: false };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; } catch (e) { /* 기억 못 해도 된다 */ }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ } };

  const grain = makeGrainLayer();
  document.body.appendChild(grain);
  let bloom = null;

  const apply = () => {
    bottleScene.setLook(state.film ? "film" : "basic");
    bottleScene.canvas.style.filter = state.grade ? GRADE_FILTER : "";
    grain.classList.toggle("show", state.grain);
    if (state.bloom) {
      bloom = bloom || new OverlayBloom(bottleScene.renderer);
      bottleScene.postRender = () => bloom.render(bottleScene.scene, bottleScene.camera);
    } else {
      bottleScene.postRender = null;
    }
  };

  const btn = document.createElement("button");
  btn.id = "lookLabBtn";
  btn.type = "button";
  btn.textContent = "룩 ▾";
  const panel = document.createElement("div");
  panel.id = "lookLabPanel";
  const items = [
    ["film", "필름 룩", "AgX 톤 · 반구광 · 명암"],
    ["bloom", "블룸", "가장 무거움 — 장면을 두 번 그림"],
    ["grade", "색보정", "대비·채도·따뜻함"],
    ["grain", "그레인", "필름 입자"],
  ];
  for (const [key, label, hint] of items) {
    const row = document.createElement("label");
    row.innerHTML = `<span>${label}<div class="hint">${hint}</div></span>`;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!state[key];
    box.addEventListener("change", () => { state[key] = box.checked; save(); apply(); });
    row.appendChild(box);
    panel.appendChild(row);
  }
  const fps = document.createElement("div");
  fps.className = "fps";
  fps.textContent = "FPS —";
  panel.appendChild(fps);
  btn.addEventListener("click", () => {
    const open = panel.classList.toggle("show");
    btn.textContent = open ? "룩 ▴" : "룩 ▾";
  });
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // FPS — 0.5초마다 센 프레임 수
  let frames = 0, since = performance.now();
  const tick = (now) => {
    frames++;
    if (now - since >= 500) {
      fps.textContent = `FPS ${Math.round((frames * 1000) / (now - since))}`;
      frames = 0; since = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  apply();
}
