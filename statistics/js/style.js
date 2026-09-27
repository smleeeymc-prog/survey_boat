/* =============================================================================
 * style.js — "답변 → 배의 모습" 매핑이 있는 유일한 곳.
 *
 * 표현 채널을 늘리거나, 어떤 답변이 어떤 채널을 움직일지 바꾸는 일은 전부 이 파일
 * 안에서 끝나야 한다. 씬·인스턴싱·카메라 쪽 코드는 "배마다 style 객체 하나"만 알면
 * 되고, 그 안이 어떻게 정해졌는지는 모른다.
 *
 * ── 채널 목록 (지금 2개) ───────────────────────────────────────────────────
 *   keywords  배에 나타나는 요소 — 확정. 설문과 같은 매핑(shared/glb-nodes.js KEYWORD_NODES).
 *             실제 답변에서 온다. 요소마다 InstancedMesh 하나(fleet.js)
 *   hullTint  선체 색조 — 미확정. 인스턴스 컬러. 원본 재질 색에 곱해지므로 흰색 근처만
 *
 * [삭제됨] cabinColor(키워드 → 캐빈 색). 키워드는 배에 나타나는 요소로만 표현한다
 * (사용자 결정, 설문과 같은 규칙). 캐빈은 GLB의 크림색 재질 그대로다.
 *
 * ── 확정된 채널과 미확정 채널 ────────────────────────────────────────────────
 * config.js의 STYLE_SOURCE는 "아직 정해지지 않은 채널"을 어디서 채울지만 정한다.
 *   "random" → record_id를 시드로 한 고정 난수 (같은 기록이면 언제나 같은 모습)
 *   "record" → 실제 답변에서
 * 키워드 → 요소는 이미 정해졌으므로 STYLE_SOURCE와 상관없이 늘 실제 답변을 쓴다.
 * 난수로 뽑으면 통계 패널에 "가족"이 가장 많다고 뜨는데 바다에 튜브가 드문, 서로
 * 어긋난 화면이 된다.
 *
 * 고정 난수인 이유: 매 프레임 새로 뽑으면 배 색이 깜빡이고, 매 로드마다 새로
 * 뽑으면 전시 중 재시작할 때 바다가 통째로 다른 모습이 된다. record_id에서
 * 유도하면 "그 기록의 배"는 언제 봐도 같은 배다.
 * ========================================================================== */

import { STYLE_SOURCE, KEYWORD_NODES } from "./config.js";
import { makeRng, hashSeed } from "./motion.js";

// 선체 색조 — 원본 재질(Kapal, 짙은 적갈색)에 곱해지는 값이라 흰색 근처에서만 논다.
// 여기서 진한 색을 주면 곱셈이라 배가 새까매지고, GLB가 들고 있던 색도 사라진다.
// 실측: 0.82 아래로 내려가면 밤 팔레트에서 선체가 실루엣으로 뭉개진다.
const HULL_TINTS = [
  0xffffff, // 원본 그대로
  0xf6ded0, // 볕에 바랜
  0xdde6f2, // 푸른기
  0xf0e8cf, // 누런기
  0xf2d5d5, // 붉은기
  0xd8e8de, // 초록기
];

/**
 * @param {object} record 기록 하나
 * @returns {{hullTint:number, keywords:string[]}}
 */
export function makeStyle(record) {
  // 매핑에 있는 키워드만, 중복 없이. 같은 키워드가 두 번 들어오면 같은 요소가 같은 자리에
  // 두 번 그려져 면이 깜빡인다(z-fighting).
  const keywords = [...new Set((record.keywords || []).filter((k) => KEYWORD_NODES[k]))];

  if (STYLE_SOURCE === "record") {
    // 지역 → 선체 색조는 아직 매핑이 정해지지 않았다. 정해지면 REGIONS 인덱스로 고르면 된다.
    return { hullTint: 0xffffff, keywords };
  }

  // ── 난수 (미확정 채널의 시안 단계 기본값) ──
  const rng = makeRng(hashSeed(String(record.record_id)));
  return {
    hullTint: HULL_TINTS[(rng() * HULL_TINTS.length) | 0],
    keywords,
  };
}
