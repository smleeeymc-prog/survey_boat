/* =============================================================================
 * dummy/thumbs.mjs — 더미 기록의 배 그림(썸네일)을 실제 설문 화면으로 찍는다.
 *
 * 참여자 썸네일과 같은 길이다: 설문(index.html, ?mock=1 — DB 에 안 붙는다)을 헤드리스 크롬으로 열어 바다로 내려앉은 뒤,
 * 기록마다 씬에 지역·상태·키워드·배 색·소품 칠·시간대를 입히고 결과 화면 구도로 BottleScene.capture() 를 부른다.
 * 줄이는 건 ui/record-sync.js encodeThumb 과 같다(긴 변 360 · WebP 0.8 · 상한 넘으면 더 줄인다).
 * capture() 는 정해 둔 순간(SNAP_POSE)으로 찍어서, 같은 답이면 같은 그림이다.
 *
 * three 는 unpkg 대신 firebase/node_modules 사본을 쓴다(테스트 e2e.mjs 와 같은 대체). 글꼴은 안 받는다 — 그림엔 글자가 없다.
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const THREE_DIR = path.resolve(HERE, "..", "node_modules", "three");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json" };

function serve(port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

/**
 * items: [{ scene, time }] — scene 은 설문 state 모양(rows.mjs buildDummies), time 은 나눔의 시간대(day·afternoon·evening·night).
 * → 같은 차례의 data URL 배열(못 찍은 칸은 null)
 */
export async function renderThumbs(items, { THUMB, port = 5191, onEach = () => {} } = {}) {
  const { chromium } = await import("playwright");
  const server = await serve(port);
  const exe = process.env.CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  const browser = await chromium.launch({ executablePath: exe,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    // 폰 세로 화면 · 2배 밀도 — 참여자 폰에서 찍히는 크기와 비슷하게(줄여서 올리므로 더 커도 의미 없다)
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await ctx.route("https://unpkg.com/three@0.160.1/**", (route) => {
      const rel = new URL(route.request().url()).pathname.replace(/^\/three@0\.160\.1\//, "");
      return route.fulfill({ path: path.join(THREE_DIR, rel), contentType: "text/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await ctx.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ body: "", contentType: "text/css" }));
    await ctx.route("https://fonts.gstatic.com/**", (route) => route.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?mock=1`);
    // 첫 화면 → 하늘 → 바다로 내려앉아 첫 질문이 뜰 때까지(배·섬·소품 모델이 다 올라온 뒤)
    await page.locator(".ob-bottom .cta").click();
    await page.locator(".pr-next.show").click({ timeout: 60000 });
    await page.locator(".qnext").waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);

    const out = [];
    for (const [i, { scene, time }] of items.entries()) {
      await page.evaluate(({ scene, time }) => {
        const sc = window.BottleScene;
        sc.show("result", scene);
        sc.setTimeOfDay(time);
        sc.revealBottle();
      }, { scene, time });
      // 시간대 전환(2초 — 느린 소프트웨어 렌더라 실제로는 더 걸린다)이 끝나고 소품이 다 떠오른 뒤에 찍는다
      await page.waitForFunction(() => window.BottleScene._timeT >= 1, null, { timeout: 60000 });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(async (T) => {
        const png = window.BottleScene.capture();
        const img = new Image();
        await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = png; });
        for (const edge of [T.MAX_EDGE, Math.round(T.MAX_EDGE * 0.7), Math.round(T.MAX_EDGE * 0.5)]) {
          const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const url = c.toDataURL("image/webp", T.QUALITY);
          if (url.startsWith("data:image/webp") && url.length <= T.MAX_CHARS) return url;
        }
        return null;
      }, THUMB);
      out.push(data);
      onEach(i, data);
    }
    if (errors.length) console.warn("[thumbs] 페이지 오류:", errors.slice(0, 3).join(" | "));
    return out;
  } finally {
    await browser.close();
    server.close();
  }
}
