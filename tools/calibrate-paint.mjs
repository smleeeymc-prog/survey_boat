/* =============================================================================
 * calibrate-paint.mjs — 배 색 표(statistics/shared/boat-look.js PAINT_TABLE)를 다시 푼다.
 *
 * 팔레트(survey-taxonomy.js BOAT_COLORS)의 동그라미 색을 바꿨거나, 조명·배 재질이 바뀌어 배 색이 동그라미와
 * 어긋나면 돌린다. 설문 색 단계 화면(낮)에서 선체·갑판을 렌더 → 그 부분 픽셀(휘도 50~75% 띠의 평균)을 재기 →
 * 재질 색 고치기를 여섯 번 되풀이해, 배가 띨 목표색(boat-look.js paintSeen)에 맞춘다.
 * 컬러휠 색에 쓰는 응답 격자(PAINT_LUT, 5×5×5)도 같이 재고, 그 격자로 푼 색이 얼마나 맞는지 몇 색으로 확인한다.
 *
 *   python3 -m http.server 8000          # 레포 루트에서 (다른 창)
 *   node tools/calibrate-paint.mjs http://localhost:8000/index.html [--table-only]
 *   → 끝에 찍히는 PAINT_TABLE · PAINT_LUT 을 boat-look.js 에 붙여 넣는다. 첫 줄의 "기본 실측"이 BASE_HULL_SEEN·BASE_DECK_SEEN과
 *     크게 다르면 그 둘과 survey-taxonomy.js 의 base 동그라미(hex·deckHex)도 같이 고친다.
 *
 * Playwright 는 firebase/node_modules 의 것을 쓴다(firebase/ 에서 npm install). three·폰트는 CDN에서 받으므로 네트워크가 필요하다.
 * 크로미움: 환경변수 CHROMIUM 이 있으면 그것, 없으면 /opt/pw-browsers/chromium, 없으면 Playwright 기본.
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "firebase", "package.json"));
const { chromium } = require("playwright");
const BL = await import(pathToFileURL(path.join(ROOT, "statistics/shared/boat-look.js")).href);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "statistics/shared/survey-taxonomy.js"), "utf8") + ";this.T=SURVEY_TAXONOMY", ctx);
const PAL = ctx.T.BOAT_COLORS.filter((c) => c.id !== "base");
const URL = (process.argv.slice(2).find((a) => !a.startsWith("--")) || "http://localhost:8000/index.html") + "?mock=1";

const exe = process.env.CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.goto(URL);
await page.waitForFunction(() => window.BottleScene && window.BottleScene._hullMat, null, { timeout: 120000 });
// 색 단계 구도에 바다로 내려앉은 상태로 세운다(인트로 건너뜀), 시간은 굴리지 않고 그리기만
await page.evaluate(() => {
  const s = window.BottleScene; s._perfDecided = true;
  Object.assign(state, { step: "color", region: "아산", stateId: "stay", text: "색 눈금", share: "many", keywords: [] });
  s._lift = 0; s._liftT = 1; s._introPending = false; s.introDone = true; s.boat.visible = true; s.boat.scale.setScalar(1); s._dropT = 1;
  render();
  const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
  const r = s.renderer.render; s.renderer.render = () => {};
  const gd = s.clock.getDelta; s.clock.getDelta = () => 1 / 40;
  for (let t = 0; t < 3; t += 1 / 40) s._animate();
  s.renderer.render = r; s.clock.getDelta = gd; window.requestAnimationFrame = raf;
  // 스냅샷과 같은 고정 자세(SNAP_POSE — 파도 시각·배 자세·연기)로 그린다. 매번 같은 픽셀이라 몇 번을 돌려도 같은 표가 나온다
  window.__snap = async () => {
    s._withSnapPose(() => { s._placeCamera(); s.renderer.render(s.scene, s.camera); });
    const img = new Image(); img.src = s.renderer.domElement.toDataURL("image/png"); await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  window.__set = (part, h) => { s._paintTo = null; (part === "hull" ? s._hullMat.color : s._deckColU.value).setHex(h); };
  window.__base = { hull: s._hullBase.getHex(), deck: s._deckBase.getHex() };
  // 그 부분만: 검정·흰색으로 칠해 보고 바뀌는 픽셀
  window.__mask = async (part) => {
    __set(part, 0x000000); const a = await __snap();
    __set(part, 0xffffff); const b = await __snap();
    __set(part, __base[part]);
    const m = [];
    for (let i = 0; i < a.length; i += 4) if (Math.abs(b[i] - a[i]) + Math.abs(b[i + 1] - a[i + 1]) + Math.abs(b[i + 2] - a[i + 2]) > 120) m.push(i);
    window["__m_" + part] = m; return m.length;
  };
  // 휘도 50~75% 띠의 평균 — 그늘·판자 이음매(아래)와 광택·하늘 반사(위)를 뺀, 볕 받는 면의 제 색
  window.__measure = async (part, h) => {
    __set(part, h); const d = await __snap();
    const px = window["__m_" + part].map((i) => [d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
    px.sort((x, y) => x[3] - y[3]);
    const band = px.slice(Math.floor(px.length * 0.5), Math.floor(px.length * 0.75));
    const avg = (k) => Math.round(band.reduce((a, p) => a + p[k], 0) / band.length);
    return [avg(0), avg(1), avg(2)];
  };
});
await page.evaluate(() => __mask("hull")); await page.evaluate(() => __mask("deck"));
const base = await page.evaluate(() => __base);
const hx = (v) => "0x" + v.toString(16).padStart(6, "0");
const toHex = ([r, g, b]) => (r << 16) | (g << 8) | b;
const seenHull = toHex(await page.evaluate((h) => __measure("hull", h), base.hull));
const seenDeck = toHex(await page.evaluate((h) => __measure("deck", h), base.deck));
console.log(`기본 실측: 선체 ${hx(seenHull)} (지금 BASE_HULL_SEEN ${hx(BL.BASE_HULL_SEEN)}) · 갑판 ${hx(seenDeck)} (지금 BASE_DECK_SEEN ${hx(BL.BASE_DECK_SEEN)})`);

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const unlin = (v) => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
async function solve(part, target) {
  const T = rgb(target);
  let M = T.map((v) => Math.min(255, Math.round(v / BL.PAINT_RENDER_GAIN)));
  let seen;
  for (let it = 0; it < 6; it++) {
    seen = await page.evaluate(([p, h]) => __measure(p, h), [part, toHex(M)]);
    M = M.map((m, k) => unlin(lin(m) * (lin(T[k]) + 1e-4) / (lin(seen[k]) + 1e-4)));
  }
  seen = await page.evaluate(([p, h]) => __measure(p, h), [part, toHex(M)]);
  return { m: toHex(M), err: Math.max(...T.map((v, k) => Math.abs(v - seen[k]))) };
}
const rows = [];
for (const c of PAL) {
  // 표(PAINT_TABLE)는 예전 '누름' 방식({ pure: false })에서만 쓴다 — 원색(기본, 10-07)은 응답 격자로 푼다
  const NP = { pure: false };
  const one = BL.paintSeen(c.id, "auto", ctx.T.BOAT_COLORS, NP), two = BL.paintSeen(c.id, c.id, ctx.T.BOAT_COLORS, NP);
  const hull = await solve("hull", one.hull);
  const deckAuto = await solve("deck", one.deck);
  const deck = await solve("deck", two.deck);
  console.log(`${c.id.padEnd(7)} 오차 선체 ${hull.err} · 원톤 갑판 ${deckAuto.err} · 투톤 갑판 ${deck.err}`);
  rows.push(`  ${(c.id + ":").padEnd(8)} { hull: ${hx(hull.m)}, deckAuto: ${hx(deckAuto.m)}, deck: ${hx(deck.m)} },`);
}

// 응답 격자 — 재질을 채널마다 다섯 단계로(5×5×5) 칠해 보고 보이는 색. 팔레트만 바꿨으면 --table-only 로 건너뛴다(격자는 팔레트와 무관)
if (process.argv.includes("--table-only")) {
  console.log(`\nexport const PAINT_TABLE = {\n${rows.join("\n")}\n};`);
  await browser.close();
  process.exit(0);
}
// 응답 격자 — 재질을 채널마다 다섯 단계로(5×5×5) 칠해 보고 보이는 색
const G = BL.PAINT_LUT_LEVELS;
const lut = {};
for (const part of ["hull", "deck"]) {
  lut[part] = [];
  for (const r of G) for (const g of G) for (const b of G) lut[part].push(toHex(await page.evaluate(([p, h]) => __measure(p, h), [part, (r << 16) | (g << 8) | b])));
}
const lutSrc = `export const PAINT_LUT = {\n` + ["hull", "deck"].map((p) =>
  `  ${p}: [\n` + Array.from({ length: G.length * G.length }, (_, i) => "    " + lut[p].slice(i * G.length, (i + 1) * G.length).map(hx).join(", ") + ",").join("\n") + `\n  ],`).join("\n") + `\n};`;
// 격자 검증 — 컬러휠에서 고를 법한 색 몇 개를 격자로 풀어 칠해 보고 목표와의 차
Object.assign(BL.PAINT_LUT, lut);   // 이 실행에서만 새 격자로
const probe = ["#e0402a", "#30a0ff", "#7a3fd0", "#40c060", "#f0d020", "#808080", "#ff80c0", "#104030"];
const errs = [];
for (const h of probe) {
  const seen = BL.paintSeen(h, "auto", ctx.T.BOAT_COLORS);
  for (const part of ["hull", "deck"]) {
    const got = await page.evaluate(([p, x]) => __measure(p, x), [part, BL.materialFromSeen(part, seen[part])]);
    errs.push(Math.max(...rgb(seen[part]).map((v, k) => Math.abs(v - got[k]))));
  }
}
console.log(`응답 격자 검증(컬러휠 색 ${probe.length}개 × 선체·원톤 갑판): 최대 오차 ${Math.max(...errs)} · 평균 ${(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(1)} · [${errs.join(",")}]`);
console.log(`\nexport const PAINT_TABLE = {\n${rows.join("\n")}\n};\n\n${lutSrc}`);
await browser.close();
