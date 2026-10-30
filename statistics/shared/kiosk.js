/* =============================================================================
 * kiosk.js — 전시장 기기(태블릿)용 운영자 설정: "이 기기는 늘 전체화면". (클래식 스크립트, 전역 Kiosk)
 *
 * 10-30 사용자: 태블릿으로 설문을 계속 받는데 위쪽 상태바·브라우저 툴바가 안 보이는 전체화면이었으면 —
 * 운영자용 설정에서 체크해 두면 그 기기는 늘 전체화면으로.
 *
 * 브라우저 규칙 때문에 할 수 있는 것과 없는 것:
 *   · 페이지가 혼자 전체화면이 될 수는 없다 — 사람이 화면을 한 번 눌러야 한다(사용자 동작). 그래서 켜 둔 기기는
 *     "아무 데나 누르는 순간" 전체화면으로 들어간다. 참여자가 처음 누르는 버튼(시작하기 등)이 곧 그 한 번이다.
 *   · 다른 페이지로 넘어가면(설문 → 둘러보기 지도, "처음으로") 브라우저가 전체화면을 푼다 — 넘어간 페이지에서 다음에
 *     누를 때 다시 들어간다. 이 깜빡임까지 없애려면 **홈 화면에 추가**(설치)해서 연다: manifest.webmanifest 가
 *     display: fullscreen 이라 안드로이드에선 상태바·주소창 없이 앱처럼 뜨고, 페이지를 넘겨도 그대로다(아이패드는 주소창만 빠진다).
 *   · 아이폰 사파리는 페이지 전체화면이 아예 없다 — 거기선 아무것도 안 한다(홈 화면에 추가만 된다).
 * 켜 두면 화면 꺼짐도 막는다(Wake Lock — 태블릿이 몇 분 뒤 어두워지거나 잠기지 않게).
 *
 * 설정 여는 법(운영자만): 주소에 ?operator=1 을 붙여 한 번 열거나, 화면 왼쪽 위 구석을 3초 안에 다섯 번 누른다.
 * 값은 그 기기 그 브라우저에만 남는다(localStorage) — 참여자 폰에는 영향이 없다.
 * 설문(index.html)과 둘러보기(statistics/explore.html)가 같이 읽는다. 전시 송출 화면은 js/fullscreen.js 가 따로 한다.
 * ========================================================================== */

var Kiosk = (function () {
  const KEY = "yeogi.kiosk.v1";
  const CORNER = 64;           // 왼쪽 위 구석(px) — 운영자 설정 숨은 입구
  const TAPS = 5, TAP_WINDOW = 3000;

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (_) { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* 저장이 막힌 브라우저 — 이번 페이지만 */ } };
  let conf = read();

  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const canFull = !!request && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  // 홈 화면에 '설치'한 앱으로 열렸나(바로가기는 아니다 — 바로가기는 그냥 크롬 탭으로 열린다). 이미 전체화면 앱이면 할 게 없다
  const standalone = () => matchMedia("(display-mode: fullscreen), (display-mode: standalone), (display-mode: minimal-ui)").matches || navigator.standalone === true;
  const fullApp = () => matchMedia("(display-mode: fullscreen)").matches;
  // 설치된 앱으로 열었으면 설정을 안 켜도 전체화면을 노린다(10-30 사용자: 갤럭시 탭 S7 FE 크롬 — 홈 화면에 추가해도 전체화면이 안 됐다)
  const wanted = () => !!conf.fullscreen || standalone();

  /* ── 전체화면 유지 ─────────────────────────────────────── */
  function enter() {
    if (!wanted() || !canFull || isFull() || fullApp()) return;
    try {
      const p = request.call(root, { navigationUI: "hide" });
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* 막힌 브라우저 */ }
  }
  // 터치는 pointerdown 이 "사용자 동작"으로 치지 않는다 — 손을 뗄 때(pointerup)·click 에서 부른다. 잡기 단계라 어느 버튼을 눌러도 먼저 온다
  document.addEventListener("pointerup", enter, true);
  document.addEventListener("click", enter, true);
  document.addEventListener("keydown", enter, true);

  let lock = null;
  async function keepAwake() {
    if (!wanted() || !("wakeLock" in navigator) || lock || document.visibilityState !== "visible") return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch (_) { /* 배터리 절약 모드 등 — 전체화면은 그대로 */ }
  }
  document.addEventListener("visibilitychange", keepAwake);
  document.addEventListener("fullscreenchange", keepAwake);
  document.addEventListener("webkitfullscreenchange", keepAwake);
  if (wanted()) keepAwake();

  /* ── 앱으로 설치 ───────────────────────────────────────────
     크롬 메뉴의 "홈 화면에 추가"는 '바로가기'로 만들어질 때가 있다 — 그러면 아이콘을 눌러도 주소창 있는 탭으로 열린다.
     크롬이 주는 설치 기회(beforeinstallprompt)를 잡아 두었다가 운영자 설정의 "앱으로 설치" 버튼으로 진짜 설치(WebAPK)를 한다.
     설치된 앱은 manifest 의 display: fullscreen 으로 상태바·주소창 없이 뜬다. 참여자 폰에 설치 안내 띠가 뜨지 않게 기본 안내는 막는다. */
  let installEvt = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; });
  addEventListener("appinstalled", () => { installEvt = null; });
  // 설치 조건을 확실히 채우려고 서비스 워커를 둔다(루트 sw.js — 캐시는 안 한다). 지도 도메인처럼 없는 곳에선 조용히 실패
  if ("serviceWorker" in navigator && document.currentScript) {
    const sw = new URL("../../sw.js", document.currentScript.src);
    if (sw.origin === location.origin) navigator.serviceWorker.register(sw, { scope: new URL("./", sw).pathname }).catch(() => {});
  }

  /* ── 운영자 설정 창 ─────────────────────────────────────── */
  const CSS = `
    #kioskPanel{ position:fixed; inset:0; z-index:2000; display:flex; align-items:center; justify-content:center;
      background:rgba(5,7,11,.62); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); font-family:"IBM Plex Sans KR",system-ui,sans-serif; }
    #kioskPanel .kp{ width:min(360px, calc(100vw - 32px)); padding:22px 22px 18px; border-radius:18px; background:#14171e; color:#f6f2ea;
      box-shadow:0 18px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(246,242,234,.14); }
    #kioskPanel h2{ font-size:15px; font-weight:600; letter-spacing:.06em; color:#e6c79a; margin:0 0 14px; }
    #kioskPanel label{ display:flex; gap:12px; align-items:flex-start; font-size:15px; line-height:1.45; cursor:pointer; }
    #kioskPanel input{ width:22px; height:22px; margin:1px 0 0; accent-color:#e6c79a; flex:0 0 auto; }
    #kioskPanel p{ font-size:12.5px; line-height:1.55; color:rgba(246,242,234,.66); margin:12px 0 0; }
    #kioskPanel .st{ font-size:12.5px; color:#e6c79a; margin-top:10px; }
    #kioskPanel button.install{ background:#e6c79a; }
    #kioskPanel button{ margin-top:16px; width:100%; height:44px; border:0; border-radius:22px; background:#f6f2ea; color:#111318;
      font:600 15px/1 "IBM Plex Sans KR",system-ui,sans-serif; cursor:pointer; }`;
  function openPanel() {
    if (document.getElementById("kioskPanel")) return;
    if (!document.getElementById("kioskCss")) {
      const st = document.createElement("style"); st.id = "kioskCss"; st.textContent = CSS; document.head.appendChild(st);
    }
    const wrap = document.createElement("div");
    wrap.id = "kioskPanel";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "운영자 설정");
    const mode = fullApp() ? "설치된 앱(전체화면)" : standalone() ? "설치된 앱(창 — 누르면 전체화면으로)" : "브라우저 탭";
    const status = `지금: ${mode}` + (!canFull && !fullApp() ? " · 이 브라우저는 페이지 전체화면을 지원하지 않아요(아이폰 등) — 홈 화면에 추가해서 여세요." : "");
    wrap.innerHTML = `<div class="kp">
      <h2>운영자 설정 · 이 기기</h2>
      <label><input type="checkbox" ${conf.fullscreen ? "checked" : ""}><span>이 기기는 늘 전체화면으로<br><small style="opacity:.7">상태바·주소창·툴바를 숨기고, 화면 꺼짐도 막아요</small></span></label>
      <p>브라우저 규칙상 페이지를 열 때마다 화면을 한 번 눌러야 전체화면이 돼요(참여자가 처음 누르는 버튼이면 충분해요). 설문 ↔ 지도로 넘어갈 때도 다음 터치에서 다시 들어갑니다.
      깜빡임 없이 쓰려면 <b>앱으로 설치</b>해서 홈 화면 아이콘으로 여세요. 크롬 메뉴의 "홈 화면에 추가"가 <b>바로가기</b>로 만들어지면 탭으로 열려 전체화면이 안 돼요 —
      그 아이콘은 지우고 아래 버튼(또는 크롬 메뉴의 <b>앱 설치</b>)으로 다시 설치하세요.</p>
      <p class="st">${status}</p>
      ${installEvt && !standalone() ? `<button type="button" class="install">앱으로 설치</button>` : ""}
      <button type="button" class="close">닫기</button></div>`;
    const box = wrap.querySelector("input");
    box.addEventListener("change", () => {
      conf = { ...conf, fullscreen: box.checked };
      write(conf);
      if (box.checked) { enter(); keepAwake(); }
      else { if (lock) lock.release().catch(() => {}); if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    });
    wrap.querySelector(".close").addEventListener("click", () => wrap.remove());
    const inst = wrap.querySelector(".install");
    if (inst) inst.addEventListener("click", async () => {
      const ev = installEvt; installEvt = null;
      try { await ev.prompt(); const r = await ev.userChoice; inst.textContent = r && r.outcome === "accepted" ? "설치했어요 — 홈 화면 아이콘으로 여세요" : "설치를 취소했어요"; }
      catch (_) { inst.textContent = "설치 창을 못 열었어요 — 크롬 메뉴 → 앱 설치"; }
      inst.disabled = true;
    });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    wrap.querySelector(".close").focus();
  }

  // 숨은 입구 — 왼쪽 위 구석을 3초 안에 다섯 번. click 으로 센다: pointerup 에서 열면 같은 탭의 뒤따르는 click 이
  // 막 생긴 창의 바깥(어두운 바탕)에 떨어져 창이 바로 닫혔다
  let taps = [];
  document.addEventListener("click", (e) => {
    if (e.clientX > CORNER || e.clientY > CORNER) { taps = []; return; }
    const now = Date.now();
    taps = taps.filter((t) => now - t < TAP_WINDOW).concat(now);
    if (taps.length >= TAPS) { taps = []; openPanel(); }
  }, true);
  const boot = () => { if (new URLSearchParams(location.search).get("operator") === "1") openPanel(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  return { get on() { return wanted(); }, openPanel, enter };
})();
