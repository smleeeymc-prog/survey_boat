/* =============================================================================
 * sync-model.mjs — 루트 assets/Scene.glb 를 statistics/assets/ 로 맞춘다.
 *
 * 왜 사본이 필요한가: 지도를 자기 도메인에 따로 올리려면(Vercel의 Root Directory를
 * statistics/ 로 두면) 그 폴더 밖의 파일은 배포에 들어가지 않는다. 그래서 statistics/
 * 안에도 같은 GLB가 있어야 한다.
 *
 * 사본은 언제나 드리프트 위험이다 — 블렌더에서 모델을 다시 굽고 루트만 갈아끼우면,
 * 온보딩의 배와 지도의 배가 소리 없이 달라진다. 그걸 막으려고 이 스크립트를 둔다.
 *
 *   node statistics/tools/sync-model.mjs          다르면 복사한다
 *   node statistics/tools/sync-model.mjs --check  복사하지 않고 다른지만 알려준다 (다르면 exit 1)
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SRC = path.join(ROOT, "assets", "Scene.glb");
const DST = path.join(ROOT, "statistics", "assets", "Scene.glb");
const CHECK = process.argv.includes("--check");

const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 12);

if (!fs.existsSync(SRC)) {
  console.error(`[sync-model] 원본이 없다: ${SRC}`);
  process.exit(1);
}
const srcHash = sha(SRC);
const dstHash = fs.existsSync(DST) ? sha(DST) : null;

if (srcHash === dstHash) {
  console.log(`[sync-model] 같음 (${srcHash})`);
  process.exit(0);
}
if (CHECK) {
  console.error(`[sync-model] 다름 — 루트 ${srcHash} / statistics ${dstHash ?? "없음"}`);
  console.error(`             node statistics/tools/sync-model.mjs 로 맞출 것`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(DST), { recursive: true });
fs.copyFileSync(SRC, DST);
console.log(`[sync-model] 복사함 ${dstHash ?? "없음"} → ${srcHash}`);
