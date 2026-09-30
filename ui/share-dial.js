/* =============================================================================
 * share-dial.js — 나눔 질문의 바늘 다이얼. (클래식 스크립트, 전역 함수)
 *
 * 시안 E3의 계기판을 B′ 톤(금색 바늘·명조)으로 옮긴 것. 반원 위에 선택지 네 칸이 있고
 * 바늘이 고른 칸을 가리킨다. 고른 답은 다이얼 아래에 크게 적힌다. 양 끝에는 첫·마지막
 * 선택지 이름만 작게 — 바늘이 어느 쪽으로 가는지 알 수 있게. (시간대 이름은 적지 않는다:
 * 사용자 결정 — 고른 것에 딸린 설명은 빼고, 시간은 풍경이 대신 보여준다)
 *
 * 고르는 법: 칸을 누르거나, 바늘을 돌리듯 끌거나, 방향키(라디오 묶음이라 기본 동작).
 * 고른 것이 바뀔 때만 onPick(id)를 부른다.
 *
 * items  : [{id, label}] — 왼쪽(많이 나눔)부터 오른쪽(나눈 적 없음) 순서
 * ========================================================================== */

const DIAL = { w: 338, h: 92, cx: 169, cy: 74, r: 70, needle: 52 };

function shareDial(items, value, onPick){
  const n = items.length;
  // 반원을 n칸으로 나눈 가운데 각도 (왼쪽 끝 180° → 오른쪽 끝 0°)
  const angle = (i) => 180 - (180 / n) * (i + 0.5);
  const pt = (deg, r) => {
    const a = deg * Math.PI / 180;
    return { x: DIAL.cx + r * Math.cos(a), y: DIAL.cy - r * Math.sin(a) };
  };
  const f = (v) => v.toFixed(1);

  const wrap = document.createElement("div");
  wrap.className = "dial";
  wrap.setAttribute("role", "radiogroup");
  wrap.setAttribute("aria-label", "이 마음을 나눈 사람");

  const L = pt(180, DIAL.r), R = pt(0, DIAL.r);
  let svg = `<svg viewBox="0 0 ${DIAL.w} ${DIAL.h}" aria-hidden="true">`
    + `<path d="M${f(L.x)} ${f(L.y)} A${DIAL.r} ${DIAL.r} 0 0 1 ${f(R.x)} ${f(R.y)}" fill="none" stroke="rgba(246,242,234,0.26)" stroke-width="1.5"/>`;
  items.forEach((_, i) => {
    const p = pt(angle(i), DIAL.r);
    svg += `<circle class="dial-halo" data-i="${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="9.5"/>`
         + `<circle class="dial-dot" data-i="${i}" cx="${f(p.x)}" cy="${f(p.y)}" r="4.5"/>`;
  });
  svg += `<g class="dial-needle" style="transform-origin:${DIAL.cx}px ${DIAL.cy}px">`
    + `<line x1="${DIAL.cx}" y1="${DIAL.cy}" x2="${DIAL.cx}" y2="${DIAL.cy - DIAL.needle}" stroke="#E6C79A" stroke-width="2.5" stroke-linecap="round"/></g>`
    + `<circle cx="${DIAL.cx}" cy="${DIAL.cy}" r="5" fill="#E6C79A"/>`
    + `<text x="${f(L.x)}" y="${DIAL.h - 2}" text-anchor="middle" font-size="11" fill="rgba(246,242,234,0.6)">${items[0].label}</text>`
    + `<text x="${f(R.x)}" y="${DIAL.h - 2}" text-anchor="middle" font-size="11" fill="rgba(246,242,234,0.6)">${items[n - 1].label}</text>`
    + `</svg>`;
  wrap.innerHTML = svg;

  // 칸마다 누를 자리(44px) — 실제 라디오라 방향키·스크린리더가 그대로 된다
  const radios = items.map((it, i) => {
    const p = pt(angle(i), DIAL.r);
    const lab = document.createElement("label");
    lab.className = "dial-stop";
    lab.style.left = (p.x / DIAL.w * 100) + "%";
    lab.style.top = (p.y / DIAL.h * 100) + "%";
    const r = document.createElement("input");
    r.type = "radio"; r.name = "share-dial"; r.value = it.id;
    r.setAttribute("aria-label", it.label);
    r.addEventListener("change", () => { if (r.checked) select(i); });
    lab.appendChild(r);
    wrap.appendChild(lab);
    return r;
  });

  const label = document.createElement("p");
  label.className = "dial-label";
  const box = document.createElement("div");
  box.style.display = "flex"; box.style.flexDirection = "column"; box.style.alignItems = "stretch";
  box.appendChild(wrap); box.appendChild(label);

  const needle = wrap.querySelector(".dial-needle");
  let cur = -1;
  function select(i, silent){
    i = Math.max(0, Math.min(n - 1, i));
    if (i === cur) return;
    cur = i;
    wrap.querySelectorAll(".dial-dot, .dial-halo").forEach((c) => c.classList.toggle("on", +c.dataset.i === i));
    needle.style.transform = `rotate(${90 - angle(i)}deg)`;   // 위(90°)를 기준으로 시계 방향
    radios[i].checked = true;
    label.textContent = items[i].label;
    if (!silent && items[i].id !== value) { value = items[i].id; onPick(value); }
  }

  // 끌기 — 다이얼 중심에서 손가락까지의 각도로 가장 가까운 칸을 고른다
  const pick = (e) => {
    const rect = wrap.getBoundingClientRect();
    const s = rect.width / DIAL.w;
    const dx = e.clientX - (rect.left + DIAL.cx * s);
    const dy = (rect.top + DIAL.cy * s) - e.clientY;
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg = dx < 0 ? 180 : 0;                        // 중심보다 아래면 가까운 끝으로
    select(Math.round((180 - deg) / (180 / n) - 0.5));
  };
  let dragging = false;
  wrap.addEventListener("pointerdown", (e) => {
    dragging = true; pick(e);
    try { wrap.setPointerCapture(e.pointerId); } catch (_e) {}
  });
  wrap.addEventListener("pointermove", (e) => { if (dragging) pick(e); });
  const end = () => { dragging = false; };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);

  select(Math.max(0, items.findIndex((it) => it.id === value)), true);
  return box;
}
