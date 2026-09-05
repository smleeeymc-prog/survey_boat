/* =============================================================================
 * build-standalone.mjs — 시안 공유용 단일 HTML 만들기.
 *
 * 이 프로젝트는 빌드 도구가 없다(순수 vanilla + importmap + CDN). 그 원칙은 그대로다 —
 * 이 스크립트는 앱을 빌드하지 않는다. statistics/를 그대로 두고, 리뷰용으로
 * "서버 없이 더블클릭하면 열리는 파일 하나"를 따로 뽑아낼 뿐이다.
 *
 * 왜 필요한가: statistics/index.html은 (1) 로컬 서버 (2) unpkg CDN (3) ../assets/Scene.glb
 * 세 가지가 다 있어야 열린다. 시안을 보여줄 때마다 상대에게 그걸 시키는 건 무리다.
 * 여기서는 셋을 전부 파일 안에 넣는다.
 *   · three.js  → npm 패키지의 UMD 빌드(three.min.js)를 그대로 인라인
 *   · GLTFLoader → ESM이라 import/export 두 줄만 바꿔서 인라인
 *   · Scene.glb → base64로 넣고 loader.parse()로 읽는다 (fetch 없음 = CORS 없음)
 *   · statistics/js/*.js → import/export만 걷어내고 순서대로 이어붙인다
 *
 * 씬 문서 자체는 원본과 동작이 같아야 하므로, 소스를 고치는 건 아래 REWRITES에 적힌
 * 세 군데뿐이다. 그 밖에는 한 글자도 안 바꾼다.
 *
 * 바깥 껍데기는 세로 9:16 액자다. 전시장 화면이 세로라, 가로 모니터에서 그냥 띄우면
 * 레이아웃 판단이 안 된다. 액자 안은 iframe이고 그 안에서는 vw/vh와 position:fixed가
 * 실제 전시 화면과 똑같이 동작한다 — 그래서 CSS를 시안용으로 고칠 필요가 없다.
 *
 * 사용법:  node statistics/tools/build-standalone.mjs [three 패키지 경로] [출력 경로] [씬 base64 출력]
 *   three 패키지 경로 기본값: ./node_modules/three  (npm i three@0.160.1 로 받으면 된다)
 *   세 번째 인자를 주면 씬 문서만 base64로 따로 떨군다 — 다른 껍데기(공유용 페이지 등)에
 *   같은 씬을 끼워 넣을 때 쓴다.
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STAT = path.resolve(HERE, "..");          // statistics/
const ROOT = path.resolve(STAT, "..");          // 레포 루트
const THREE_PKG = process.argv[2] || path.join(ROOT, "node_modules", "three");
const OUT = process.argv[3] || path.join(ROOT, "머무름의지도_시안.html");

// 이어붙이는 순서 = 최상위에서 평가되는 순서. const/class는 호이스팅되지 않으므로
// "먼저 평가돼야 하는 것"이 앞에 와야 한다 (panel.js의 METRICS가 config의 STATE_LABEL을 읽는 식).
const MODULE_ORDER = [
  "config.js", "motion.js", "style.js", "ocean.js",
  "fleet.js", "camera.js", "store.js", "panel.js", "selfcheck.js", "main.js",
];

const read = (p) => fs.readFileSync(p, "utf8");

/** ESM 모듈을 한 스코프에 이어붙일 수 있는 형태로 편다. */
function flatten(src) {
  return src
    // import 문 전부 제거 (여러 줄에 걸친 것 포함). 전부 한 스코프에 놓이므로 필요 없다.
    .replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "")
    .replace(/^import\s+["'][^"']+["'];\s*$/gm, "")
    // export 키워드만 떼어낸다. 선언 자체는 그대로 둔다.
    .replace(/^export\s+(const|let|function|class|async)\b/gm, "$1")
    .replace(/^export\s*\{[\s\S]*?\};?\s*$/gm, "");
}

/**
 * three의 examples/jsm 파일 하나를 자기만의 스코프에 담고 필요한 것만 꺼낸다.
 * 평평하게 이어붙이면 GLTFLoader와 BufferGeometryUtils의 내부 헬퍼 이름이 부딪힐 수 있다
 * — 부딪히면 조용히 엉뚱한 함수가 불린다. IIFE로 감싸면 그 위험이 원천적으로 없어진다.
 */
function jsmModule(file, exports) {
  const raw = read(file);
  if (!/^import\s*\{[\s\S]*?\}\s*from\s*['"]three['"];/m.test(raw)) {
    throw new Error(`[build] ${file}: 'three' import를 못 찾음 — three 버전이 바뀌었는지 확인`);
  }
  const body = flatten(
    raw.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]three['"];/m, "const {$1} = THREE;")
  );
  return `const { ${exports.join(", ")} } = (function () {\n${body}\nreturn { ${exports.join(", ")} };\n})();`;
}

// ── 씬 문서(iframe 안에 들어갈 진짜 화면) ────────────────────────────────────
const css = read(path.join(STAT, "css", "panel.css"));
const glbB64 = fs.readFileSync(path.join(ROOT, "assets", "Scene.glb")).toString("base64");

// three.min.js는 r160의 전역(UMD) 빌드다. 열리자마자 deprecation 경고를 찍는데,
// 시안 콘솔이 지저분해질 뿐이라 지운다. 단, 그 줄은 파일 전체와 쉼표로 이어진
// 하나의 식이다 — `console.warn(...), function(t,e){...}(this,...)`.
// 통째로 지우면 뒤의 함수식이 문장 자리에 놓여 "Function statements require a function name"로
// 죽는다. 그래서 지우는 게 아니라 무해한 식(void 0)으로 바꿔 쉼표 구조를 살려 둔다.
const three = read(path.join(THREE_PKG, "build", "three.min.js"))
  .replace(/^console\.warn\('Scripts[^\n]*?\),/, "void 0,");

// GLTFLoader는 BufferGeometryUtils의 toTrianglesDrawMode도 쓴다. 그것도 같이 넣어야 한다.
const jsmDir = path.join(THREE_PKG, "examples", "jsm");
const gltfLoader = [
  jsmModule(path.join(jsmDir, "utils", "BufferGeometryUtils.js"), ["toTrianglesDrawMode"]),
  jsmModule(path.join(jsmDir, "loaders", "GLTFLoader.js"), ["GLTFLoader"]),
].join("\n");

const configSrc = read(path.join(STAT, "js", "config.js"));
const configNames = [...configSrc.matchAll(/^export\s+const\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);

// REWRITES — 원본과 달라지는 유일한 세 군데.
const REWRITES = [
  // 1) GLB를 fetch하지 않고 파일 안에 심어 둔 것을 파싱한다.
  [
    'const loadShipGltf = () => tryLoadFirst(C.MODEL_URLS);',
    'const loadShipGltf = () => new Promise((res, rej) => new GLTFLoader().parse(__GLB, "", res, rej));',
  ],
  // 2) srcdoc iframe은 location.search가 없다. 껍데기가 넣어주는 값을 대신 읽는다.
  [
    'const qs = new URLSearchParams(location.search);',
    'const qs = new URLSearchParams(location.search || (window.__PARAMS || ""));',
  ],
];

let bundle = MODULE_ORDER.map((f) => {
  let src = read(path.join(STAT, "js", f));
  for (const [from, to] of REWRITES) {
    if (f === "main.js") {
      if (!src.includes(from)) throw new Error(`[build] main.js에서 못 찾음:\n  ${from}\n원본이 바뀌었으면 REWRITES를 고칠 것.`);
      src = src.replace(from, to);
    }
  }
  return `\n/* ══════ ${f} ══════ */\n` + flatten(src);
}).join("\n");

// config.js는 main.js가 `import * as C`로 통째로 쓴다. 평평하게 편 뒤에도 C.가 살아야 한다.
bundle = bundle.replace(
  "/* ══════ motion.js ══════ */",
  `const C = { ${configNames.join(", ")} };\n\n/* ══════ motion.js ══════ */`
);

// index.html에서 <body> 안의 마크업만 가져온다 (importmap·모듈 스크립트·css 링크는 뺀다).
const indexHtml = read(path.join(STAT, "index.html"));
const bodyMarkup = indexHtml
  .slice(indexHtml.indexOf("<body>") + 6, indexHtml.indexOf('<script type="importmap">'))
  .trim();

const sceneDoc = `<!doctype html>
<html lang="ko"data-glass="lens">
<head><meta charset="utf-8"><title>머무름의 지도</title>
<style>${css}</style></head>
<body>
${bodyMarkup}
<script>${three}<\/script>
<script>${gltfLoader}<\/script>
<script>
const __GLB = Uint8Array.from(atob("${glbB64}"), (c) => c.charCodeAt(0)).buffer;
${bundle}
<\/script>
</body></html>`;

// ── 바깥 껍데기(세로 액자 + 설명 + 시간대 전환) ──────────────────────────────
const sceneB64 = Buffer.from(sceneDoc, "utf8").toString("base64");

const shell = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>머무름의 지도 — 시안</title>
<style>
  :root { --font: 'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0a1119; color:#c9d8e2; font-family:var(--font);
         min-height:100vh; display:flex; flex-direction:column; align-items:center;
         gap:18px; padding:26px 20px 34px; }
  h1 { font-size:17px; font-weight:600; color:#e8f0f5; letter-spacing:-.01em; }
  .note { font-size:12.5px; line-height:1.65; color:#7e94a3; max-width:620px; text-align:center; }
  .note b { color:#b9ccd8; font-weight:600; }
  .frame { position:relative; height:min(76vh, 900px); aspect-ratio:9/16;
           border-radius:18px; overflow:hidden; background:#bfe9ef;
           box-shadow:0 18px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.09); }
  .frame iframe { width:100%; height:100%; border:0; display:block; }
  .bar { display:flex; gap:7px; flex-wrap:wrap; justify-content:center; }
  .bar button { font-family:var(--font); font-size:12.5px; padding:7px 15px; border-radius:999px;
                border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.05);
                color:#a9bdc9; cursor:pointer; transition:background .15s, color .15s; }
  .bar button:hover { background:rgba(255,255,255,.1); color:#e2edf3; }
  .bar button[aria-pressed="true"] { background:#e8f0f5; color:#0a1119; border-color:transparent; font-weight:600; }
  .hint { font-size:11.5px; color:#5c7180; }
</style></head>
<body>
  <h1>머무름의 지도 — 시안</h1>
  <p class="note">
    전시장 세로 화면(9:16) 기준입니다. 배는 <b>왼쪽 끝에서 나타나 오른쪽으로 빠지고</b>,
    화면 세로 중앙 근처의 배가 <b>40초</b>에 화면을 건넙니다. 가까운 배는 24초, 먼 배는 90초 —
    그 차이가 깊이감입니다.<br>
    배의 <b>캐빈 색·선체 색조·갑판 소품은 지금 난수</b>입니다(채널 구성 미확정).
    상단 패널의 누적 수와 통계는 <b>실제 기록에서 집계</b>하며, 5.2초마다 지표가 바뀝니다.
    약 14초에 한 번 새 기록이 도착해 6.5초간 크게 제시된 뒤 제자리로 갑니다.
  </p>
  <div class="bar" id="bar"></div>
  <div class="frame"><iframe id="stage" title="머무름의 지도 미리보기"></iframe></div>
  <p class="hint">시간대를 바꾸면 씬이 처음부터 다시 시작합니다.</p>
<script>
  const SCENE = "${sceneB64}";
  const html = new TextDecoder("utf-8").decode(Uint8Array.from(atob(SCENE), (c) => c.charCodeAt(0)));
  const TIMES = [["night","밤"],["evening","노을"],["afternoon","오후"],["day","낮"]];
  const bar = document.getElementById("bar");
  const stage = document.getElementById("stage");
  let cur = "night";
  function load(key) {
    cur = key;
    // __PARAMS를 문서 맨 앞에 끼워 넣는다 (씬 코드가 location.search 대신 이걸 읽는다).
    stage.srcdoc = html.replace("<body>", '<body><script>window.__PARAMS="time=' + key + '";<\\/script>');
    [...bar.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === key)));
  }
  TIMES.forEach(([k, label]) => {
    const b = document.createElement("button");
    b.textContent = label; b.dataset.k = k;
    b.addEventListener("click", () => load(k));
    bar.appendChild(b);
  });
  load(cur);
<\/script>
</body></html>`;

fs.writeFileSync(OUT, shell);
if (process.argv[4]) {
  fs.writeFileSync(process.argv[4], sceneB64);
  console.log(`        씬 base64 → ${process.argv[4]}`);
}
const mb = (s) => (Buffer.byteLength(s) / 1048576).toFixed(2) + " MB";
console.log(`[build] ${OUT}`);
console.log(`        씬 문서 ${mb(sceneDoc)} → 껍데기 포함 ${mb(shell)}`);
console.log(`        three ${mb(three)} / GLB(base64) ${mb(glbB64)} / 앱 코드 ${mb(bundle)}`);
