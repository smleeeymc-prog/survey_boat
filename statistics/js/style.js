/* =============================================================================
 * style.js — "답변 → 배의 모습" 매핑이 있는 유일한 곳.
 *
 * 표현 채널을 늘리거나, 어떤 답변이 어떤 채널을 움직일지 바꾸거나, 색 팔레트를
 * 손보는 일은 전부 이 파일 안에서 끝나야 한다. 씬·인스턴싱·카메라 쪽 코드는
 * "배마다 style 객체 하나"만 알면 되고, 그 안이 어떻게 정해졌는지는 모른다.
 *
 * ── 지금은 난수 (시안 단계) ────────────────────────────────────────────────
 * config.js의 STYLE_SOURCE가 "random"이면 record_id를 시드로 한 고정 난수에서
 * 뽑는다. 채널 구성이 확정되면 "record"로 바꾸고 fromRecord 쪽만 채우면 된다 —
 * 다른 파일은 한 줄도 안 바뀐다.
 *
 * 고정 난수인 이유: 매 프레임 새로 뽑으면 배 색이 깜빡이고, 매 로드마다 새로
 * 뽑으면 전시 중 재시작할 때 바다가 통째로 다른 모습이 된다. record_id에서
 * 유도하면 "그 기록의 배"는 언제 봐도 같은 배다.
 *
 * ── 채널 목록 (지금 3개) ───────────────────────────────────────────────────
 *   cabinColor  캐빈 색      — 인스턴스 컬러 (draw call 안 늘어남)
 *   hullTint    선체 색조    — 인스턴스 컬러. 원본 재질 색에 곱해지므로 흰색 근처만
 *   prop        갑판 소품    — 갈매기 / 구명튜브. 파츠마다 인스턴스 그룹 1개
 * ========================================================================== */

import { STYLE_SOURCE, KEYWORDS, KEYWORD_COLOR, KEYWORD_PROP, CABIN_BASE_COLOR } from "./config.js";
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
 * @param {object} record 기록 하나 (STYLE_SOURCE가 "record"일 때만 실제로 읽는다)
 * @returns {{cabinColor:number, hullTint:number, gull:boolean, tube:boolean}}
 */
export function makeStyle(record) {
  const rng = makeRng(hashSeed(String(record.record_id)));

  if (STYLE_SOURCE === "record") {
    // ── 실제 답변에서 (채널 구성이 확정되면 여기를 쓴다) ──
    const kws = record.keywords || [];
    const hex = KEYWORD_COLOR[kws[0]];
    const props = { gull: false, tube: false };
    for (const k of kws) { const p = KEYWORD_PROP[k]; if (p) props[p] = true; }
    return {
      cabinColor: hex === undefined ? CABIN_BASE_COLOR : hex,
      // 지역 → 선체 색조는 아직 매핑이 정해지지 않았다. 정해지면 REGIONS 인덱스로 고르면 된다.
      hullTint: 0xffffff,
      gull: props.gull,
      tube: props.tube,
    };
  }

  // ── 난수 (시안 단계 기본값) ──
  // 캐빈 색은 실제로 쓸 팔레트(KEYWORD_COLOR)에서 뽑는다. 아무 색이나 뽑으면
  // 나중에 진짜 데이터를 붙였을 때 화면 인상이 달라져서 시안의 의미가 없다.
  const palette = KEYWORDS.map((k) => KEYWORD_COLOR[k]);
  return {
    cabinColor: palette[(rng() * palette.length) | 0],
    hullTint: HULL_TINTS[(rng() * HULL_TINTS.length) | 0],
    // 소품은 실제 분포에 맞춘다 — 키워드 10개 중 2개를 최대 2개 고르므로
    // "자유"가 걸릴 확률은 대략 1/5, "관계"도 비슷하다.
    gull: rng() < 0.20,
    tube: rng() < 0.22,
  };
}
