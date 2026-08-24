/* =============================================================================
 * sync-from-main.mjs — 기존 main에 새로 들어온 것을 지도 브랜치로 끌어온다.
 *
 * 지도는 main과 별개의 브랜치(statistics-main)에서 배포된다. 두 화면이 같은 레포에
 * 살면서 배포만 갈라져 있는 구조라, 한쪽에만 들어간 변경이 자동으로 넘어오지 않는다.
 * 특히 위험한 건 이 둘이다.
 *
 *   · assets/Scene.glb  — 모델을 다시 구우면 온보딩의 배와 지도의 배가 갈라진다
 *   · 설문 분류값        — REGIONS / STATES / KEYWORDS 가 어긋나면 집계가 갈라진다
 *                          (statistics/js/config.js 가 루트 index.html의 값을 옮겨 적은 것)
 *
 * 이 스크립트는 병합까지만 한다. 푸시는 하지 않는다 — 무엇이 들어왔는지 눈으로 보고
 * 지도 화면을 한 번 돌려본 뒤에 올리는 게 맞다.
 *
 *   node statistics/tools/sync-from-main.mjs           main을 가져와 병합한다
 *   node statistics/tools/sync-from-main.mjs --check   가져올 게 있는지만 알려준다
 * ========================================================================== */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CHECK = process.argv.includes("--check");
const BASE = process.env.SYNC_BASE || "main";

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const say = (...m) => console.log("[sync-from-main]", ...m);

// 1) 지금 어디에 서 있는지. 엉뚱한 브랜치에서 병합하면 되돌리기 번거롭다.
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === BASE) {
  console.error(`[sync-from-main] 지금 ${BASE} 위에 있다. 지도 브랜치로 옮기고 다시 실행할 것.`);
  process.exit(1);
}
const dirty = git("status", "--porcelain");
if (dirty && !CHECK) {
  console.error("[sync-from-main] 커밋 안 된 변경이 있다. 정리하고 다시 실행할 것:\n" + dirty);
  process.exit(1);
}

say(`브랜치 ${branch} ← origin/${BASE}`);
git("fetch", "origin", BASE);

// 2) 뭐가 새로 들어왔는지 먼저 보여준다.
const incoming = git("log", "--oneline", `HEAD..origin/${BASE}`);
if (!incoming) {
  say("가져올 것 없음.");
  process.exit(0);
}
console.log("\n가져올 커밋:");
console.log(incoming.split("\n").map((l) => "  " + l).join("\n"));

// 3) 두 화면이 갈라질 수 있는 파일이 건드려졌는지 따로 짚어준다.
const touched = git("diff", "--name-only", `HEAD...origin/${BASE}`).split("\n").filter(Boolean);
const WATCH = [
  ["assets/Scene.glb", "모델이 바뀌었다 — 병합 뒤 sync-model.mjs 를 꼭 돌릴 것"],
  ["index.html", "온보딩 씬이 바뀌었다 — 설문 분류값(REGIONS/STATES/KEYWORDS)이 같이 바뀌었는지 확인할 것"],
];
const hits = WATCH.filter(([f]) => touched.includes(f));
if (hits.length) {
  console.log("\n눈여겨볼 것:");
  for (const [f, why] of hits) console.log(`  · ${f} — ${why}`);
}

if (CHECK) {
  console.log("");
  say("확인만 했다. 실제로 가져오려면 --check 없이 다시 실행할 것.");
  process.exit(1);   // CI에 걸면 "밀린 게 있다"로 읽힌다
}

// 4) 병합. 충돌하면 그대로 멈춘다 — 자동으로 풀 문제가 아니다.
console.log("");
try {
  git("merge", `origin/${BASE}`, "--no-edit");
} catch {
  console.error("[sync-from-main] 병합 충돌. 해결하고 커밋한 뒤, 아래를 마저 돌릴 것:");
  console.error("                 node statistics/tools/sync-model.mjs");
  process.exit(1);
}
say(`origin/${BASE} 병합 완료.`);

// 5) 모델 사본 맞추기 — 이걸 빼먹는 게 이 구조에서 제일 흔한 사고다.
execFileSync("node", [path.join(HERE, "sync-model.mjs")], { cwd: ROOT, stdio: "inherit" });

console.log("");
say("다음: 지도를 한 번 돌려보고(python3 -m http.server → /statistics/) 이상 없으면 푸시.");
