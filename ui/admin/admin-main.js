/* =============================================================================
 * admin-main.js — 관리자 페이지(admin.html) 흐름: 로그인 → 목록 · 거르기 · 고르기 → 숨기기·되살리기·완전 삭제.
 * DB 는 admin-db.js, 카드 한 줄은 admin-view.js.
 * ========================================================================== */

import * as DB from "./admin-db.js";
import { renderRow, haystack } from "./admin-view.js";

const S = globalThis.RECORD_SCHEMA;
const $ = (id) => document.getElementById(id);

const st = {
  rows: [],              // 받은 기록(최신순)
  cursor: null,          // 다음 쪽 커서
  dummies: new Map(),    // record_id → 배치("09-30" · "10-30")
  selected: new Set(),
  filter: { status: "all", kind: "all", q: "" },
  thumbs: new Map(),
};

/* ── 로그인 ─────────────────────────────────────────────── */
const AUTH_MSG = {
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/user-not-found": "이메일 또는 비밀번호가 맞지 않아요.",
  "auth/invalid-email": "이메일 모양이 아니에요.",
  "auth/too-many-requests": "여러 번 틀려서 잠시 막혔어요. 조금 뒤에 다시 해 주세요.",
  "auth/operation-not-allowed": "콘솔에서 이메일/비밀번호 로그인이 꺼져 있어요(Authentication → 로그인 방법).",
  "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
  "not-admin": "관리자 계정이 아니에요.",
};

function showLogin(msg = "") {
  $("login").hidden = false;
  $("app").hidden = true;
  $("who").textContent = "";
  $("logout").hidden = true;
  $("loginMsg").textContent = msg;
  if (!$("email").value) $("email").value = DB.ADMIN_EMAILS[0] || "";
  $("password").focus();
}

async function enter(email) {
  $("login").hidden = true;
  $("app").hidden = false;
  $("who").textContent = email;
  $("logout").hidden = false;
  st.dummies = await DB.dummyIds();
  await reload();
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("loginBtn");
  btn.disabled = true;
  $("loginMsg").textContent = "";
  try {
    await enter(await DB.signIn($("email").value, $("password").value));
    $("password").value = "";
  } catch (err) {
    $("loginMsg").textContent = AUTH_MSG[err && err.code] || `로그인 실패: ${err && (err.code || err.message)}`;
  } finally { btn.disabled = false; }
});
$("logout").addEventListener("click", async () => { await DB.signOut(); st.rows = []; st.selected.clear(); showLogin(); });

/* ── 목록 ───────────────────────────────────────────────── */
function status(msg, bad = false) {
  const s = $("status");
  s.textContent = msg;
  s.classList.toggle("bad", bad);
}

async function reload() {
  status("불러오는 중…");
  try {
    const { rows, cursor } = await DB.fetchPage();
    st.rows = rows;
    st.cursor = cursor;
    st.selected.clear();
    draw();
    status("");
  } catch (err) {
    status(`목록을 못 받았어요 — ${err && (err.code || err.message)}${err && err.code === "permission-denied" ? " (규칙이 관리자 권한을 모른다 — 새 firestore.rules 를 게시했는지)" : ""}`, true);
  }
}

async function more() {
  if (!st.cursor) return;
  $("more").disabled = true;
  try {
    const { rows, cursor } = await DB.fetchPage(st.cursor);
    st.rows = st.rows.concat(rows);
    st.cursor = cursor;
    draw();
  } catch (err) { status(`더 받지 못했어요 — ${err && (err.code || err.message)}`, true); }
  finally { $("more").disabled = false; }
}

function visible() {
  const { status: s, kind, q } = st.filter;
  const needle = q.trim().toLowerCase();
  return st.rows.filter((r) =>
    (s === "all" || (s === "public" ? r.moderation_status === S.STATUS.PUBLIC : r.moderation_status !== S.STATUS.PUBLIC))
    && (kind === "all" || (kind === "dummy" ? st.dummies.has(r.id) : !st.dummies.has(r.id)))
    && (!needle || haystack(r).includes(needle)));
}

const on = {
  select(id, checked) { checked ? st.selected.add(id) : st.selected.delete(id); drawBar(); },
  hide(id) { return act([id], "hide"); },
  show(id) { return act([id], "show"); },
  remove(id) { return act([id], "remove"); },
  thumb(id) {
    if (!st.thumbs.has(id)) st.thumbs.set(id, DB.getThumb(id).catch((e) => { st.thumbs.delete(id); throw e; }));
    return st.thumbs.get(id);
  },
};

function draw() {
  const pub = st.rows.filter((r) => r.moderation_status === S.STATUS.PUBLIC).length;
  const dum = st.rows.filter((r) => st.dummies.has(r.id)).length;
  $("summary").textContent = `받은 기록 ${st.rows.length}${st.cursor ? "+" : ""} · 공개 ${pub} · 숨김 ${st.rows.length - pub} · 그중 더미 ${dum}`;
  const list = $("list");
  list.textContent = "";
  const rows = visible();
  for (const r of rows) list.appendChild(renderRow(r, { selected: st.selected.has(r.id), dummy: st.dummies.get(r.id), on }));
  if (!rows.length) { const p = document.createElement("p"); p.className = "empty"; p.textContent = "보여 줄 기록이 없어요."; list.appendChild(p); }
  $("more").hidden = !st.cursor;
  drawBar();
}

function drawBar() {
  const n = st.selected.size;
  $("selCount").textContent = n ? `${n}개 고름` : "고른 것 없음";
  for (const id of ["selHide", "selShow", "selRemove", "selClear"]) $(id).disabled = !n;
}

/* ── 숨기기 · 되살리기 · 삭제 ───────────────────────────── */
async function act(ids, kind) {
  if (!ids.length) return;
  const many = ids.length > 1 ? `${ids.length}개를 ` : "";
  if (kind === "remove" && !confirm(`${many}완전히 지울까요?\n기록과 배 그림이 DB에서 사라지고 되돌릴 수 없어요.\n(나중에 되살릴 수도 있게 하려면 '숨기기')`)) return;
  if (kind === "hide" && ids.length > 1 && !confirm(`${ids.length}개를 숨길까요? (지도·아카이브에서 빠지고, 되살릴 수 있어요)`)) return;
  status(kind === "remove" ? "지우는 중…" : "바꾸는 중…");
  try {
    if (kind === "remove") {
      await DB.removeRecords(ids);
      const gone = new Set(ids);
      st.rows = st.rows.filter((r) => !gone.has(r.id));
    } else {
      const to = kind === "hide" ? S.STATUS.HIDDEN : S.STATUS.PUBLIC;
      await DB.setStatus(ids, to);
      for (const r of st.rows) if (ids.includes(r.id)) r.moderation_status = to;
    }
    for (const id of ids) st.selected.delete(id);
    draw();
    status(`${ids.length}개 ${kind === "remove" ? "지웠어요" : kind === "hide" ? "숨겼어요" : "되살렸어요"}.`);
  } catch (err) {
    status(`실패 — ${err && (err.code || err.message)}`, true);
  }
}

/* ── 도구 막대 ──────────────────────────────────────────── */
$("fStatus").addEventListener("change", (e) => { st.filter.status = e.target.value; draw(); });
$("fKind").addEventListener("change", (e) => { st.filter.kind = e.target.value; draw(); });
$("fQ").addEventListener("input", (e) => { st.filter.q = e.target.value; draw(); });
$("reload").addEventListener("click", reload);
$("more").addEventListener("click", more);
$("selAll").addEventListener("click", () => { for (const r of visible()) st.selected.add(r.id); draw(); });
$("selClear").addEventListener("click", () => { st.selected.clear(); draw(); });
$("selHide").addEventListener("click", () => act([...st.selected], "hide"));
$("selShow").addEventListener("click", () => act([...st.selected], "show"));
$("selRemove").addEventListener("click", () => act([...st.selected], "remove"));

/* ── 시작 ───────────────────────────────────────────────── */
(async () => {
  const mode = DB.dbMode();
  if (mode === "mock") { showLogin("목업 모드(?mock=1 또는 DB 설정 없음)에선 관리할 DB가 없어요."); $("loginBtn").disabled = true; return; }
  if (mode === "emu") $("modeBadge").hidden = false;
  try {
    const who = await DB.currentAdmin();
    who ? await enter(who) : showLogin();
  } catch (err) {
    showLogin(`DB에 붙지 못했어요 — ${err && (err.code || err.message)}`);
  }
})();
