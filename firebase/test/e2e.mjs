/* =============================================================================
 * e2e.mjs — 헤드리스 끝-끝 검증 (Playwright + SwiftShader, Firestore·Auth 에뮬레이터).
 *
 * 실행 (firebase/ 에서):  npm install && npm run test:e2e
 *   emulators:exec 가 에뮬레이터를 띄운 뒤 이 스크립트를 돈다. 레포 루트를 정적 서버로
 *   127.0.0.1:5173 에 올리고(에뮬레이터 8080·9099 와 겹치지 않게), 두 화면을 ?emu=1 로 연다.
 *
 * 외부 CDN은 테스트에서만 npm 사본으로 바꿔 끼운다 — 앱 코드의 URL은 그대로다.
 *   gstatic firebasejs/<버전>/*  → node_modules/firebase/*  (npm 패키지에 CDN 빌드가 그대로 들어 있다)
 *   unpkg three@0.160.1/*        → node_modules/three/*
 *   구글 폰트                     → 빈 CSS (시스템 서체로 물러남)
 * 크로미움: 환경변수 CHROMIUM 이 있으면 그것, 없으면 /opt/pw-browsers/chromium, 없으면 Playwright 기본.
 *
 * 확인하는 것 (HANDOFF.md 13장 "테스트")
 *   1 설문을 끝까지 → records·thumbs 문서      5 오프라인 제출 → 결과 화면 + 대기열 1건 → 복구 후 1건(중복 없음)
 *   2 지도를 열어 둔 채 제출 → onInsert         6 지도 콜드부팅 실패 → 캐시로 onReady → 붙으면 차이만
 *   3 운영자 숨김 → onRemove                    7 목업(?mock=1) — 두 화면·세 화면 크기, 배지, 콘솔 에러 0
 *   4 아카이브: 새 기록·썸네일, <img onerror>·<script> 문장은 글자 그대로
 *   8 배 색 규칙 배포 전(옛 규칙) — 색을 뺀 기록으로 다시 보내 문장은 들어간다 (10-06)
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDocs, collection, query, where, Timestamp } from "firebase/firestore";
import { loadShared } from "../build-rules.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const FB_DIR = path.dirname(require.resolve("firebase/package.json"));
// three 는 package.json 을 exports 에 내놓지 않아 resolve 로 못 찾는다
const THREE_DIR = path.resolve(HERE, "..", "node_modules", "three");
const FB_VERSION = JSON.parse(fs.readFileSync(path.join(FB_DIR, "package.json"), "utf8")).version;
const PORT = Number(process.env.E2E_PORT || 5173);
const BASE = `http://127.0.0.1:${PORT}`;
const { schema: S } = loadShared({ inThisRealm: true });

// db-config.js 의 SDK 버전과 npm 사본이 같아야 대체가 의미 있다
const cfgSrc = fs.readFileSync(path.join(ROOT, "statistics", "shared", "db-config.js"), "utf8");
const APP_SDK = (cfgSrc.match(/FIREBASE_SDK_VERSION = "([^"]+)"/) || [])[1];
if (APP_SDK !== FB_VERSION) throw new Error(`db-config.js SDK ${APP_SDK} ≠ npm firebase ${FB_VERSION} — firebase/package.json 을 맞출 것`);

// ── 결과 모음 ────────────────────────────────────────────────────────────────
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}
async function waitFor(fn, { timeout = 30000, every = 250, label = "조건" } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`${label} — ${timeout}ms 안에 안 됨 (마지막: ${last instanceof Error ? last.message : JSON.stringify(last)})`);
}

// ── 정적 서버 ────────────────────────────────────────────────────────────────
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// ── 에뮬레이터 관리자(규칙 우회 = 운영자·콘솔 역할) ───────────────────────────
const env = await initializeTestEnvironment({
  projectId: "demo-yeogi",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync(path.join(HERE, "..", "firestore.rules"), "utf8") },
});
const admin = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
/** 에뮬레이터 규칙 갈아끼우기 (8번: 배포 전 옛 규칙 흉내). 에뮬레이터 REST — 프록시를 타지 않게 http 로 직접 */
function putRules(content) {
  const body = JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } });
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 8080, method: "PUT", path: "/emulator/v1/projects/demo-yeogi:securityRules",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
      let out = ""; res.on("data", (c) => (out += c));
      res.on("end", () => (res.statusCode === 200 ? resolve() : reject(new Error(`규칙 교체 실패 ${res.statusCode} ${out.slice(0, 200)}`))));
    });
    req.on("error", reject); req.end(body);
  });
}
async function adminDocs(col, ...wheres) {
  let out = [];
  await admin(async (db) => {
    const q = wheres.length ? query(collection(db, col), ...wheres) : collection(db, col);
    out = (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return out;
}
async function seedRecord(over = {}) {
  const r = { ...S.makeRecord({ id: S.newId(), region: "아산", state: "stay", share: "close",
    text: "처음부터 바다에 있던 문장", keywords: ["익숙함"], name: "익명" }), created_at: Timestamp.now(), ...over };
  await admin((db) => setDoc(doc(db, "records", r.record_id), r));
  return r;
}
const hide = (id) => admin((db) => updateDoc(doc(db, "records", id), { moderation_status: "hidden" }));

// ── 브라우저 ─────────────────────────────────────────────────────────────────
const exe = process.env.CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({
  executablePath: exe,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
let sdkBlocked = false;
const external = [];   // 목업 모드에서 DB·SDK로 나간 요청이 없는지 보려고
async function newContext(viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.route(`https://www.gstatic.com/firebasejs/${FB_VERSION}/**`, (route) => {
    external.push(route.request().url());
    if (sdkBlocked) return route.abort("internetdisconnected");
    const f = path.join(FB_DIR, path.basename(new URL(route.request().url()).pathname));
    return route.fulfill({ path: f, contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await ctx.route("https://unpkg.com/three@0.160.1/**", (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/three@0\.160\.1\//, "");
    return route.fulfill({ path: path.join(THREE_DIR, rel), contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
  });
  await ctx.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
  await ctx.route("https://fonts.gstatic.com/**", (route) => route.abort());
  ctx.on("request", (req) => { if (/:(8080|9099)\//.test(req.url())) external.push(req.url()); });
  return ctx;
}
function watch(page) {
  const logs = [];
  page.on("console", (m) => logs.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => logs.push({ type: "pageerror", text: String(e) }));
  return logs;
}
const errorsIn = (logs, allow = []) => logs.filter((l) =>
  ["error", "assert", "pageerror"].includes(l.type) && !allow.some((re) => re.test(l.text)));

/** 설문을 실제로 눌러서 끝까지 — 결과 화면이 뜨면 돌아온다 */
async function runSurvey(page, { url = `${BASE}/?emu=1`, text, keywordIdx = [0], name = null, goto = true, color = null }) {
  if (goto) await page.goto(url);
  await page.locator(".ob-bottom .cta").click();
  await page.locator(".pr-next.show").click({ timeout: 30000 });
  await page.locator(".qnext").waitFor({ timeout: 30000 });   // 바다로 내려앉은 뒤 첫 질문
  await page.locator(".qnext").click();                        // Ⅰ 지역 (첫 항목)
  await page.locator(".qnext").click();                        // Ⅱ 상태
  await page.locator("textarea.sentence").fill(text);          // Ⅲ 문장
  await page.locator(".qnext").click();
  await page.locator(".qnext").click();                        // Ⅳ 나눔
  for (const i of keywordIdx) await page.locator(".kw-word").nth(i).click();   // Ⅴ 키워드
  await page.locator(".qnext").click();
  await page.locator(".paint-pad").first().waitFor();          // Ⅵ 색 — color: { hull, deck? } (동그라미 순번) | { wheel: [x, y] } (명암 판 위 0~1 자리)
  if (color && color.wheel) {
    const box = await page.locator(".paint-sv").boundingBox();
    await page.mouse.click(box.x + box.width * color.wheel[0], box.y + box.height * color.wheel[1]);
  } else if (color) {
    if (color.deck !== undefined) await page.locator(".paint-mode", { hasText: "투톤" }).click();
    await page.locator(".paint-pad").nth(color.hull).click();
    if (color.deck !== undefined) {
      await page.locator(".paint-part", { hasText: "갑판" }).click();
      await page.locator(".paint-pad").nth(color.deck).click();
    }
  }
  await page.locator(".qnext").click();
  if (name) {                                                  // Ⅶ 공개
    await page.locator(".disc-tab", { hasText: "별칭" }).click();
    await page.locator(".name-input").fill(name);
  }
  await page.locator(".consent-check").click();
  await page.locator(".qnext").click();                        // 제출하기
  await page.locator(".res-sentence").waitFor({ timeout: 30000 });
}
const queueOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("yeogi.queue.v1") || "[]"));

let failedHard = null;
try {
  await env.clearFirestore();

  // ═══ 1·2·3·4 — 지도를 열어 둔 채 설문 제출, 숨김, 아카이브 ═══════════════════
  console.log("\n[1–4] 설문 → Firestore → 지도·아카이브");
  const seeded = await seedRecord();
  const xssImg = await seedRecord({ text: '<img src=x onerror="window.__xss=1">', display_name: "<b>x</b>" });
  const xssScript = await seedRecord({ text: "<script>window.__xss=2</script>" });
  // 썸네일 둘: 정상 하나, 규칙을 우회해 심은 위험한 값 하나(화면이 걸러야 한다)
  const okThumb = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
  await admin((db) => setDoc(doc(db, "thumbs", seeded.record_id), { record_id: seeded.record_id, data: okThumb, created_at: Timestamp.now() }));
  await admin((db) => setDoc(doc(db, "thumbs", xssImg.record_id),
    { record_id: xssImg.record_id, data: 'data:image/webp;base64,AAAA" onerror="window.__xss=3', created_at: Timestamp.now() }));

  const ctxA = await newContext({ width: 1080 / 2, height: 1920 / 2 });
  const map = await ctxA.newPage();
  const mapLogs = watch(map);
  await map.goto(`${BASE}/statistics/?emu=1&interval=0`);
  await waitFor(() => map.evaluate(() => window.__map && window.__map.records.length === 3), { label: "지도 onReady(3건)", timeout: 60000 });
  const mapCount = () => map.evaluate(() => window.__map.records.length);
  check("지도: 첫 스냅샷이 onReady 한 번으로 (기존 3건, 등장 연출 없음)",
    (await map.evaluate(() => window.__map.pending.length === 0 && !window.__map.arriving)) && (await mapCount()) === 3);

  const ctxB = await newContext();
  const survey = await ctxB.newPage();
  const surveyLogs = watch(survey);
  const myText = "지도가 이 문장을 받아야 한다 — 😀 이모지도";
  await runSurvey(survey, { text: myText, keywordIdx: [0, 2], name: "바다", color: { hull: 6 } });   // 원톤 남색
  check("설문: 결과 화면이 뜬다", await survey.locator(".res-sentence").isVisible());
  check("설문: DB로 돌 땐 목업 배지가 없다", await survey.evaluate(() => document.getElementById("proto-badge").hidden));

  const mine = await waitFor(async () => (await adminDocs("records", where("text", "==", myText)))[0], { label: "records 문서" });
  check("records 문서가 생긴다 (스키마 필드 전부·서버 시각)",
    mine && S.FIELDS.every((k) => k in mine) && mine.created_at instanceof Timestamp && mine.display_name === "바다" &&
    mine.share === "many" && mine.keywords.join() === "일,가족", JSON.stringify({ ...mine, created_at: String(mine.created_at) }));
  check("배 색이 기록에 실린다 (원톤 남색 → hull_color navy · deck_color auto)", mine.hull_color === "navy" && mine.deck_color === "auto",
    `${mine.hull_color} / ${mine.deck_color}`);
  const myThumb = await waitFor(async () => (await adminDocs("thumbs")).find((t) => t.id === mine.id), { label: "thumbs 문서", timeout: 40000 });
  check("thumbs 문서가 생긴다 (WebP, 상한 이하)", myThumb && /^data:image\/(webp|jpeg);base64,/.test(myThumb.data) && myThumb.data.length <= S.THUMB.MAX_CHARS,
    myThumb ? `${myThumb.data.slice(0, 22)}… ${myThumb.data.length}자` : "");
  check("설문: 보낸 뒤 대기열이 빈다", (await queueOf(survey)).length === 0);

  await waitFor(async () => (await mapCount()) === 4, { label: "지도 onInsert" });
  const inserted = await map.evaluate((id) => {
    const m = window.__map;
    return { rec: m.records.at(-1).record_id === id, queuedOrArriving: (m.arriving && m.arriving.record.record_id === id) || m.pending.some((r) => r.record_id === id) || m.boats.some((b) => b.record.record_id === id) };
  }, mine.id);
  check("지도: 열어 둔 채 제출하면 onInsert (새 배로 들어온다)", inserted.rec && inserted.queuedOrArriving, JSON.stringify(inserted));
  const arrivalText = await waitFor(() => map.evaluate(() => document.getElementById("arrivalText").textContent), { label: "방금 도착한 문장", timeout: 60000 })
    .catch(() => "");
  check("지도: '방금 도착한 문장'에 그 문장이 뜬다", arrivalText.includes("지도가 이 문장을 받아야 한다"), arrivalText);

  await hide(mine.id);
  await waitFor(async () => (await mapCount()) === 3, { label: "지도 onRemove" });
  check("운영자가 hidden 으로 바꾸면 지도에서 onRemove",
    await map.evaluate((id) => !window.__map.records.some((r) => r.record_id === id) && !window.__map.boats.some((b) => b.record.record_id === id), mine.id));
  check("지도: 참여자 글의 HTML 이 실행되지 않는다", await map.evaluate(() => window.__xss === undefined));

  // 아카이브 — 숨김 전의 내 기록은 로컬에 있으니 여전히 맨 앞 (내 문장이 안 보이면 불안하다)
  await survey.locator(".res-bottom .cta").click();
  await survey.locator(".ar-card").first().waitFor();
  await waitFor(() => survey.evaluate(() => !document.querySelector(".ar-sub").textContent.includes("불러오는")), { label: "아카이브 목록" });
  const arch = await survey.evaluate(() => {
    const cards = [...document.querySelectorAll(".ar-card")];
    return {
      sub: document.querySelector(".ar-sub").textContent,
      first: cards[0] && { mine: cards[0].classList.contains("mine"), text: cards[0].querySelector(".ar-text").textContent, snap: !!cards[0].querySelector("img.ar-snap"), by: cards[0].querySelector(".ar-by").textContent },
      texts: cards.map((c) => c.querySelector(".ar-text").textContent),
      html: document.querySelector(".ar-grid").innerHTML,
    };
  });
  check("아카이브: 맨 앞에 '나의 기록'(문장·병 스냅샷·별칭)", arch.first && arch.first.mine && arch.first.text.includes("지도가 이 문장을") && arch.first.snap && arch.first.by === "— 바다", JSON.stringify(arch.first));
  check("아카이브: 서버의 공개 기록이 이어진다 (개수는 서버 count)", arch.texts.length === 4 && arch.sub.includes("3개"), `${arch.sub} / 카드 ${arch.texts.length}`);
  check("아카이브: <img onerror>·<script> 문장이 글자 그대로 보인다",
    arch.texts.includes("“<img src=x onerror=\"window.__xss=1\">”") && arch.texts.includes("“<script>window.__xss=2</script>”") &&
    !/<img src="?x/.test(arch.html) && !/<script>/.test(arch.html), arch.texts.join(" | "));
  const seededCard = survey.locator(".ar-card", { hasText: "처음부터 바다에 있던 문장" });
  await waitFor(() => seededCard.locator("img.ar-snap").count(), { label: "남의 카드 썸네일(지연 로딩)" });
  check("아카이브: 남의 카드 썸네일은 화면에 들어올 때 받아 붙는다", (await seededCard.getAttribute("class")).includes("has-snap"));
  await survey.waitForTimeout(1500);
  check("아카이브: 규칙을 우회한 위험한 썸네일 값은 붙이지 않는다",
    (await survey.locator(".ar-card", { hasText: "onerror" }).locator("img").count()) === 0);
  check("아카이브: 참여자 글의 HTML 이 실행되지 않는다", await survey.evaluate(() => window.__xss === undefined));
  const sErr = errorsIn(surveyLogs);
  check("설문(에뮬레이터): 콘솔 에러 0", sErr.length === 0, sErr.map((l) => l.text).join(" | ").slice(0, 400));
  const mErr = errorsIn(mapLogs);
  check("지도(에뮬레이터): 콘솔 에러·assert 0", mErr.length === 0, mErr.map((l) => l.text).join(" | ").slice(0, 400));

  // ═══ 6 — 지도 콜드부팅 실패 → 캐시 → 복구 ════════════════════════════════
  console.log("\n[6] 지도 오프라인 부팅");
  const cached = await map.evaluate(() => JSON.parse(localStorage.getItem("yeogi.map.cache.v1") || "{}").records || []);
  check("지도: 받은 공개 목록을 localStorage 에 둔다", cached.length === 3, `${cached.length}건`);
  await ctxA.close();

  // 6a — SDK는 받았는데 Firestore 에 못 닿는다 → 8초 뒤 캐시로 onReady → 붙으면 차이만
  const ctxD = await newContext({ width: 540, height: 960 });
  let fsBlocked = false;
  await ctxD.route(/^http:\/\/127\.0\.0\.1:8080\//, (route) => (fsBlocked ? route.abort("internetdisconnected") : route.continue()));
  const warm = await ctxD.newPage();
  await warm.goto(`${BASE}/statistics/?emu=1`);
  await waitFor(() => warm.evaluate(() => window.__map && window.__map.records.length === 3), { label: "캐시 채우기", timeout: 60000 });
  await warm.close();
  fsBlocked = true;
  const mapA = await ctxD.newPage();
  const mapALogs = watch(mapA);
  const t0 = Date.now();
  await mapA.goto(`${BASE}/statistics/?emu=1`);
  await waitFor(() => mapA.evaluate(() => window.__map && window.__map.records.length === 3), { label: "캐시로 onReady", timeout: 30000 });
  const bootSec = (Date.now() - t0) / 1000;
  check("지도(Firestore 불통): 8초 기다린 뒤 캐시로 onReady", bootSec >= 7 && mapALogs.some((l) => l.text.includes("마지막으로 받은 공개 기록 3건")), `${bootSec.toFixed(1)}초`);
  const late = await seedRecord({ text: "끊긴 동안 들어온 문장" });
  await hide(seeded.record_id);
  const before = await mapA.evaluate(() => window.__map.records.map((r) => r.record_id));
  fsBlocked = false;
  await waitFor(() => mapA.evaluate((ids) => {
    const r = window.__map.records.map((x) => x.record_id);
    return r.includes(ids.late) && !r.includes(ids.gone) && r.length === 3;
  }, { late: late.record_id, gone: seeded.record_id }), { label: "재연결 후 차이", timeout: 120000 });
  const after = await mapA.evaluate((ids) => ({
    boats: window.__map.boats.length + window.__map.pending.length + (window.__map.arriving ? 0 : 0),
    lateAnnounced: (window.__map.arriving && window.__map.arriving.record.record_id === ids.late) ||
      window.__map.boats.some((b) => b.record.record_id === ids.late),
  }), { late: late.record_id });
  check("지도(Firestore 복구): 차이만 — 새 것 onInsert, 숨긴 것 onRemove, 나머지는 그대로",
    before.length === 3 && after.lateAnnounced, JSON.stringify(after));
  await ctxD.close();

  // 6b — SDK 자체를 못 받았다 → 곧바로 캐시로 onReady → SDK 주소에 닿으면 새로고침
  const ctxE = await newContext({ width: 540, height: 960 });
  const warm2 = await ctxE.newPage();
  await warm2.goto(`${BASE}/statistics/?emu=1`);
  await waitFor(() => warm2.evaluate(() => window.__map && window.__map.records.length === 3), { label: "캐시 채우기 2", timeout: 60000 });
  await warm2.close();
  sdkBlocked = true;
  const mapB = await ctxE.newPage();
  const mapBLogs = watch(mapB);
  await mapB.goto(`${BASE}/statistics/?emu=1`);
  await waitFor(() => mapB.evaluate(() => window.__map && window.__map.records.length === 3), { label: "캐시로 onReady 2", timeout: 30000 });
  check("지도(SDK 못 받음): 캐시로 바로 onReady", mapBLogs.some((l) => l.text.includes("마지막으로 받은 공개 기록 3건")));
  const late2 = await seedRecord({ text: "SDK가 없던 동안 들어온 문장" });
  sdkBlocked = false;
  await waitFor(() => mapB.evaluate((id) => window.__map && window.__map.records.some((r) => r.record_id === id), late2.record_id),
    { label: "새로고침 후 서버 목록", timeout: 120000 });
  check("지도(SDK 복구): SDK 주소에 닿으면 새로고침해 서버에 붙는다 (한 번 실패한 import 는 그 페이지에서 다시 안 된다)",
    mapBLogs.some((l) => l.text.includes("새로고침해서 받는다")));
  await ctxE.close();

  // ═══ 5 — 오프라인 제출 ═══════════════════════════════════════════════════
  console.log("\n[5] 설문 오프라인 제출");
  const ctxC = await newContext();
  const off = await ctxC.newPage();
  const offLogs = watch(off);
  sdkBlocked = true;
  const offText = "와이파이가 끊겨도 이 문장은 사라지지 않는다";
  await runSurvey(off, { text: offText, color: { wheel: [0.85, 0.5] } });   // 컬러휠 — 오른쪽 가장자리 근처(초록 계열)
  check("오프라인: 결과 화면이 정상으로 뜬다", await off.locator(".res-sentence").isVisible());
  await waitFor(async () => { const q = await queueOf(off); return q.length === 1 && q[0].record && q[0].thumb; }, { label: "대기열(기록+썸네일)", timeout: 20000 });
  const q1 = await queueOf(off);
  check("오프라인: 대기열에 1건 (기록 + 썸네일)", q1.length === 1 && q1[0].record.text === offText && !!q1[0].thumb);
  await off.locator(".res-bottom .cta").click();
  await off.locator(".ar-card.mine").first().waitFor();
  check("오프라인: 아카이브 맨 앞에 내 문장", (await off.locator(".ar-card").first().locator(".ar-text").textContent()).includes(offText));
  check("오프라인: 서버 문서는 아직 없다", (await adminDocs("records", where("text", "==", offText))).length === 0);
  sdkBlocked = false;
  await off.goto(`${BASE}/?emu=1`);
  await waitFor(async () => (await queueOf(off)).length === 0, { label: "재전송 후 대기열 비움", timeout: 40000 });
  const offDocs = await adminDocs("records", where("text", "==", offText));
  check("복구 후 새로고침: 문서 1건, 대기열 빔", offDocs.length === 1);
  check("컬러휠 색이 색 코드로 실린다 (hull_color #rrggbb · deck_color auto)",
    offDocs[0] && /^#[0-9a-f]{6}$/.test(offDocs[0].hull_color) && offDocs[0].deck_color === "auto", offDocs[0] && `${offDocs[0].hull_color} / ${offDocs[0].deck_color}`);
  check("복구 후: 썸네일도 기록 뒤에 올라간다", (await adminDocs("thumbs")).some((t) => t.id === q1[0].id));
  // "보냈는데 확인을 못 받은" 경우를 흉내 — 같은 기록을 대기열에 다시 넣고 새로고침
  await off.evaluate((item) => localStorage.setItem("yeogi.queue.v1", JSON.stringify([{ ...item, thumb: null }])), q1[0]);
  await off.reload();
  await waitFor(async () => (await queueOf(off)).length === 0, { label: "중복 재전송 처리", timeout: 40000 });
  check("이미 들어간 기록을 다시 보내도 중복 없음 (여전히 1건)", (await adminDocs("records", where("text", "==", offText))).length === 1);
  const offErr = errorsIn(offLogs, [/ERR_INTERNET_DISCONNECTED|net::ERR_FAILED|Failed to fetch dynamically imported module|Failed to load resource/]);
  check("오프라인: SDK 차단 말고는 콘솔 에러 0", offErr.length === 0, offErr.map((l) => l.text).join(" | ").slice(0, 400));
  await ctxC.close();
  await ctxB.close();

  // ═══ 8 — 배 색 규칙 배포 전 ═════════════════════════════════════════════════
  // 새 설문이 먼저 나가고 사용자가 콘솔에서 규칙을 아직 안 바꾼 동안: 옛 규칙은 hull_color·deck_color 를 모르는 키로 거절한다.
  // 설문(record-sync)은 색만 빼고 한 번 더 보내야 한다 — 문장은 들어가고 대기열은 비어야 한다.
  console.log("\n[8] 배 색 규칙 배포 전(옛 규칙)");
  const newRules = fs.readFileSync(path.join(HERE, "..", "firestore.rules"), "utf8");
  const oldRules = newRules
    .replace(/d\.keys\(\)\.hasOnly\(\[[^\]]*\]\)/, `d.keys().hasOnly([${S.FIELDS.map((f) => `"${f}"`).join(", ")}])`)
    .replace(/\n\s*\/\/ 배 색[^\n]*\n[^\n]*hull_color[^\n]*\n[^\n]*deck_color[^\n]*;/, ";")
    .replace(/(d\.schema_version == \d+)\s*;\s*;/, "$1;")
    .replace(/\n    \/\/ 컬러휠로 고른 배 색[^\n]*\n    function paintHex\(v\) \{\n[^\n]*\n    \}\n/, "");
  check("옛 규칙 만들기 (색 필드 빠짐)", !oldRules.includes("hull_color") && oldRules !== newRules && /schema_version == \d+;/.test(oldRules));
  await putRules(oldRules);
  const ctxR = await newContext();
  const rp = await ctxR.newPage();
  const rLogs = watch(rp);
  const oldText = "옛 규칙에서도 문장은 들어가야 한다";
  await runSurvey(rp, { text: oldText, color: { hull: 1, deck: 3 } });   // 투톤 빨강·노랑
  const oldDoc = await waitFor(async () => (await adminDocs("records", where("text", "==", oldText)))[0], { label: "옛 규칙 records 문서", timeout: 40000 });
  check("옛 규칙: 색을 뺀 기록으로 들어간다", oldDoc && !("hull_color" in oldDoc) && !("deck_color" in oldDoc),
    oldDoc ? Object.keys(oldDoc).join(",") : "");
  await waitFor(async () => (await queueOf(rp)).every((x) => !x.record), { label: "옛 규칙: 대기열의 기록이 빈다", timeout: 20000 });
  check("옛 규칙: 대기열의 기록이 빈다", true);
  await putRules(newRules);
  await ctxR.close();

  // ═══ 7 — 목업 ═════════════════════════════════════════════════════════════
  // 원래 "설정이 빈 상태"를 봤는데, 09-30 실제 웹 설정값(ibda-2026-exhibition)이 들어간 뒤로는 주소만 열면 실DB로 간다.
  // dbMode()는 설정이 비었을 때와 ?mock=1 일 때 같은 "mock"을 돌려주므로(db-config.js) ?mock=1 로 같은 길을 본다.
  console.log("\n[7] 목업(?mock=1 — 설정이 빈 상태와 같은 길)");
  external.length = 0;
  for (const vp of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 430, height: 932 }]) {
    const ctx = await newContext(vp);
    const p = await ctx.newPage();
    const logs = watch(p);
    await runSurvey(p, { url: `${BASE}/?mock=1`, text: "목업에서도 그대로" });
    await p.locator(".res-bottom .cta").click();
    await p.locator(".ar-card").first().waitFor();
    const info = await p.evaluate(() => ({
      sub: document.querySelector(".ar-sub").textContent, n: document.querySelectorAll(".ar-card").length,
      mine: document.querySelector(".ar-card").classList.contains("mine"), mode: RecordSync.mode,
      queue: localStorage.getItem("yeogi.queue.v1"),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      badge: !document.getElementById("proto-badge").hidden,   // 목업 배지는 목업일 때만 보인다(설문 survey.js)
    }));
    const errs = errorsIn(logs);
    check(`목업 ${vp.width}×${vp.height}: 설문 끝까지 → 아카이브 11장(목업 10 + 나), 대기열 없음, 가로 넘침 없음, 목업 배지 보임, 콘솔 에러 0`,
      info.mode === "mock" && info.n === 11 && info.sub.includes("11개") && info.mine && info.queue === null && !info.overflow && info.badge && errs.length === 0,
      JSON.stringify(info) + (errs.length ? " / " + errs.map((l) => l.text).join(" | ").slice(0, 300) : ""));
    await p.screenshot({ path: path.join(process.env.E2E_SHOTS || HERE, `mock-archive-${vp.width}.png`) }).catch(() => {});
    await ctx.close();
  }
  const ctxM = await newContext({ width: 540, height: 960 });
  const mm = await ctxM.newPage();
  const mmLogs = watch(mm);
  await mm.goto(`${BASE}/statistics/?mock=1`);
  await waitFor(() => mm.evaluate(() => window.__map && window.__map.records.length === 46 && window.__map.fleet), { label: "목업 지도 46건", timeout: 60000 });
  const mockOk = await mm.evaluate(() => window.__map.records.every((r) => RECORD_SCHEMA.checkRecord(r).length === 0));
  const mmErr = errorsIn(mmLogs);
  check("목업 지도: 46척, 목업 기록이 스키마 검사를 통과, selfcheck assert·콘솔 에러 0", mockOk && mmErr.length === 0,
    mmErr.map((l) => l.text).join(" | ").slice(0, 400));
  check("목업: SDK·에뮬레이터로 나간 요청이 없다", external.length === 0, external.slice(0, 3).join(" "));
  await ctxM.close();
} catch (err) {
  failedHard = err;
  console.error("\n[e2e] 중단:", err);
} finally {
  await browser.close().catch(() => {});
  await env.cleanup().catch(() => {});
  server.close();
}

const bad = results.filter((r) => !r.ok);
console.log(`\n[e2e] ${results.length - bad.length}/${results.length} 통과${failedHard ? " (중간에 멈춤)" : ""}`);
process.exit(bad.length || failedHard ? 1 : 0);
