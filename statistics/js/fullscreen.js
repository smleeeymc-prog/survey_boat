/* =============================================================================
 * fullscreen.js — 전시 화면을 브라우저 전체화면으로(주소창·툴바 없이).
 *
 * 10-30 사용자: 크롬 태블릿에서 전체화면 보기가 안 된다. 브라우저는 페이지가 혼자 전체화면이 되는 걸 막는다 —
 * 사람이 화면을 한 번 눌러야(사용자 동작) requestFullscreen 이 받아들여진다. 전시 화면은 누를 데가 없는
 * 송출 화면이라 아무 데나 한 번 누르면 전체화면으로 들어가게 한다. 처음 몇 초는 오른쪽 아래에 작은 안내를 띄운다.
 *
 * 전체화면에 들어가면 같이 한다:
 *   · 화면 꺼짐 막기(Wake Lock) — 태블릿이 몇 분 뒤 어두워지거나 잠기면 전시가 멈춘다. 탭을 숨겼다 돌아오면 브라우저가
 *     풀어 버리므로 다시 건다.
 *   · 가로 고정(screen.orientation.lock) — 무대가 16:9 라서. 안드로이드 크롬은 전체화면일 때만 받아 준다.
 * 둘 다 안 되는 브라우저면 조용히 넘어간다. 전체화면에서 나오면(뒤로 가기·아래로 쓸기) 안내가 다시 뜬다.
 * 아이폰 사파리는 페이지 전체화면을 지원하지 않는다 — 그때는 안내도 띄우지 않는다.
 * ========================================================================== */

// 안내가 떠 있는 시간(초)
const FS_HINT_SEC = 8;

export function setupFullscreen(doc = document) {
  const root = doc.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  // 막힌 곳(아이폰 사파리, allowfullscreen 없는 iframe — 단일 파일 시안)에서는 안내도 띄우지 않는다
  if (!request || !(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)) return;
  const isFull = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);

  const hint = doc.createElement("p");
  hint.className = "fsHint";
  hint.textContent = "화면을 누르면 전체화면";
  (doc.getElementById("stage") || doc.body).appendChild(hint);
  let hideTimer = 0;
  const showHint = () => {
    hint.classList.add("on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hint.classList.remove("on"), FS_HINT_SEC * 1000);
  };

  let lock = null;
  const keepAwake = async () => {
    if (!("wakeLock" in navigator) || lock || doc.visibilityState !== "visible") return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch { /* 배터리 절약 모드 등에서 거절될 수 있다 — 전체화면은 그대로 */ }
  };

  const enter = () => {
    if (isFull()) return;
    try {
      const p = request.call(root, { navigationUI: "hide" });
      if (p && p.catch) p.catch(() => {});
    } catch { /* 막힌 브라우저 — 그대로 둔다 */ }
  };
  doc.addEventListener("click", enter);
  doc.addEventListener("keydown", (e) => { if (e.key === "f" || e.key === "F") enter(); });

  const onChange = () => {
    if (isFull()) {
      hint.classList.remove("on");
      keepAwake();
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
    } else {
      showHint();
    }
  };
  doc.addEventListener("fullscreenchange", onChange);
  doc.addEventListener("webkitfullscreenchange", onChange);
  doc.addEventListener("visibilitychange", () => { if (isFull()) keepAwake(); });

  if (!isFull()) showHint();
}
