/* =============================================================================
 * admin-view.js — 관리자 페이지의 기록 한 줄(카드)을 그린다. DB 는 모른다.
 *
 * 참여자 글(문장·마음·이름)은 전부 textContent 로만 넣는다 — innerHTML 금지(아카이브·지도와 같은 원칙).
 * 라벨은 설문과 같은 분류표(SURVEY_TAXONOMY)·RECORD_SCHEMA.placeOf 에서.
 * ========================================================================== */

const T = globalThis.SURVEY_TAXONOMY;
const S = globalThis.RECORD_SCHEMA;
const label = (list, id) => (list.find((x) => x.id === id) || {}).label || id || "—";
const colorHex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : (T.BOAT_COLORS.find((c) => c.id === v) || {}).hex);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}

export function fmtTime(d) {
  if (!d) return "시각 없음";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 검색에 쓰는 글 — 문장·마음·이름·지역·키워드·id */
export function haystack(r) {
  return [r.text, r.feeling, r.display_name, S.placeOf(r), r.region, ...(r.keywords || []), r.id].join(" ").toLowerCase();
}

/**
 * 기록 → 카드. on = { select(id, checked), hide(id), show(id), remove(id), thumb(id) → Promise<url|null> }
 */
export function renderRow(r, { selected, dummy, on }) {
  const hidden = r.moderation_status !== S.STATUS.PUBLIC;
  const card = el("article", "row" + (hidden ? " is-hidden" : ""));
  card.dataset.id = r.id;

  const pick = el("input");
  pick.type = "checkbox";
  pick.className = "pick";
  pick.checked = selected;
  pick.setAttribute("aria-label", "선택");
  pick.addEventListener("change", () => on.select(r.id, pick.checked));
  card.appendChild(pick);

  // 배 그림 — 누르면 받는다(한 장 20KB 남짓, 다 받으면 읽기·데이터가 는다)
  const fig = el("button", "thumb");
  fig.type = "button";
  fig.textContent = "그림";
  fig.title = "배 그림 보기";
  fig.addEventListener("click", async () => {
    fig.disabled = true;
    fig.textContent = "…";
    try {
      const url = await on.thumb(r.id);
      fig.textContent = "";
      if (url) { const img = el("img"); img.alt = "배 그림"; img.src = url; fig.appendChild(img); }
      else fig.textContent = "없음";
    } catch { fig.textContent = "실패"; fig.disabled = false; }
  });
  card.appendChild(fig);

  const body = el("div", "body");
  const meta = el("p", "meta");
  meta.append(
    el("span", "badge " + (hidden ? "b-hidden" : "b-public"), hidden ? (r.moderation_status === S.STATUS.HIDDEN ? "숨김" : r.moderation_status) : "공개"),
    ...(dummy ? [el("span", "badge b-dummy", `더미 ${dummy}`)] : []),
    el("span", "", fmtTime(r.created)),
    el("span", "", S.placeOf(r) || "—"),
    el("span", "", label(T.STATES, r.state)),
    el("span", "", label(T.SHARES, r.share)),
  );
  body.appendChild(meta);
  body.appendChild(el("p", "text", r.text || "(문장 없음)"));
  if (r.feeling) body.appendChild(el("p", "feeling", r.feeling));
  const foot = el("p", "foot");
  foot.appendChild(el("span", "", `— ${r.display_name || "익명"}`));
  if ((r.keywords || []).length) foot.appendChild(el("span", "", r.keywords.join(" · ")));
  for (const v of [r.hull_color, r.deck_color !== "auto" ? r.deck_color : null]) {
    const hex = colorHex(v);
    if (!hex) continue;
    const chip = el("i", "chip");
    chip.style.background = hex;
    chip.title = v;
    foot.appendChild(chip);
  }
  const idEl = el("code", "rid", r.id);
  idEl.title = "누르면 id 복사";
  idEl.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(r.id).catch(() => {}));
  foot.appendChild(idEl);
  body.appendChild(foot);
  card.appendChild(body);

  const acts = el("div", "acts");
  const toggle = el("button", "btn", hidden ? "되살리기" : "숨기기");
  toggle.type = "button";
  toggle.addEventListener("click", () => (hidden ? on.show(r.id) : on.hide(r.id)));
  const del = el("button", "btn danger", "삭제");
  del.type = "button";
  del.addEventListener("click", () => on.remove(r.id));
  acts.append(toggle, del);
  card.appendChild(acts);
  return card;
}
