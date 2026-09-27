/* =============================================================================
 * look-lab.js — 테스트 메뉴 (임시). 오른쪽 위 "룩" 버튼.
 *
 * 그림 톤은 09-27에 사용자가 고른 조합으로 index.html에 고정했다(LOOK_DEFAULT·FX_DEFAULT·CSS).
 * 여기에는 부드러운 그림자 켜고 끄기와 FPS만 남았다 — 폰에서 그림자 비용을 보고 정하려고.
 *
 * 지우는 법: 이 파일을 지우고 index.html 의 `import("./dev/look-lab.js")` 한 줄을 지운다.
 * 그림자를 기본으로 켤지 끌지는 index.html 의 SOFT_SHADOWS_DEFAULT.
 * 고른 값은 이 기기 브라우저에만 기억한다(localStorage).
 * ========================================================================== */

const STORE_KEY = "lookLab.v2";

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
  #lookLabPanel .hint{ font-size:10.5px; opacity:.55; margin-top:3px; }
  #lookLabPanel .fps{ margin-top:6px; padding-top:7px; border-top:1px solid rgba(255,255,255,.15); opacity:.8; font-variant-numeric:tabular-nums; }
`;

export function installLookLab(bottleScene) {
  if (!bottleScene || document.getElementById("lookLabBtn")) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  let state = { shadows: !!bottleScene._softShadows };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") }; } catch (e) { /* 기억 못 해도 된다 */ }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ } };
  const apply = () => {
    if (!!bottleScene._softShadows !== state.shadows) bottleScene.setSoftShadows(state.shadows);
  };

  const btn = document.createElement("button");
  btn.id = "lookLabBtn";
  btn.type = "button";
  btn.textContent = "룩 ▾";
  const panel = document.createElement("div");
  panel.id = "lookLabPanel";

  const row = document.createElement("label");
  row.innerHTML = `<span>부드러운 그림자<div class="hint">무거움 — 매 프레임 그림자 맵</div></span>`;
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = state.shadows;
  box.addEventListener("change", () => { state.shadows = box.checked; save(); apply(); });
  row.appendChild(box);
  panel.appendChild(row);

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
