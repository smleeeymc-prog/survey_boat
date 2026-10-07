/* =============================================================================
 * style.js — "답변 → 배의 모습" 매핑이 있는 유일한 곳.
 *
 * 표현 채널을 늘리거나, 어떤 답변이 어떤 채널을 움직일지 바꾸는 일은 전부 이 파일
 * 안에서 끝나야 한다. 씬·인스턴싱·카메라 쪽 코드는 "배마다 style 객체 하나"만 알면
 * 되고, 그 안이 어떻게 정해졌는지는 모른다.
 *
 * ── 채널 목록 — 전부 실제 답변에서 온다 ───────────────────────────────────
 *   keywords  배에 나타나는 요소. 설문과 같은 매핑(shared/glb-nodes.js KEYWORD_NODES).
 *             요소마다 InstancedMesh 하나(fleet.js)
 *   paint     배 색 — 참여자가 설문 Ⅵ 색 단계에서 고른 선체·갑판 색(hull_color·deck_color, 10-06).
 *             선체·갑판에 캐빈 벽·굴뚝 받침·창·창 테·손잡이·마스트·계단·캐빈 지붕까지, 설문과 같은 식
 *             (shared/boat-look.js paintParts). 칠할 곳마다 재질 hex 또는 null(기본 칠)
 *   props     키워드 소품 칠 — 튜브(가족)·서핑보드(소속감)·클로버(우연) 색(tube_color·board_color·clover_color, 10-07).
 *             그 키워드를 고른 배만. 재질 hex 또는 null(원래 색) — boat-look.js propPaint
 *   catCoat   고양이(주거) 털 무늬 — cat_coat(CAT_COATS id). 없으면 삼색(텍스처 그대로)
 * 색 필드가 없는 기록(색 단계가 생기기 전·규칙 게시 전)은 기본 배 모습이다.
 * 배 칸 표에 적는 건 boat-paint.js BoatPaintTable — 지도 조명 배수(MAP_PAINT_GAIN)도 거기서 곱한다.
 *
 * [삭제됨] cabinColor(키워드 → 캐빈 색) — 키워드는 배에 나타나는 요소로만(사용자 결정, 설문과 같은 규칙).
 * [삭제됨] hullTint(record_id 시드 난수 선체 색조)·STYLE_SOURCE — 선체 색을 참여자가 고르게 되며 걷어냈다(10-07).
 * ========================================================================== */

import { KEYWORD_NODES } from "./config.js";
import { paintParts, propPaint } from "../shared/boat-look.js";

const STYLE_TAXONOMY = globalThis.SURVEY_TAXONOMY || {};   // 이름이 config.js 와 겹치면 단일 파일 시안 빌드가 막는다
const PALETTE = STYLE_TAXONOMY.BOAT_COLORS || [];
const COAT_IDS = (STYLE_TAXONOMY.CAT_COATS || []).map((c) => c.id);
// 소품 칠 — 키워드 → 기록 필드 (survey-taxonomy.js PROP_PAINTS, 고양이는 털 무늬라 따로)
const PROP_FIELDS = (STYLE_TAXONOMY.PROP_PAINTS || []).filter((p) => p.kind !== "coat");

/**
 * @param {object} record 기록 하나
 * @returns {{keywords:string[], paint:object, props:{tube:number|null, board:number|null, clover:number|null}, catCoat:string}}
 */
export function makeStyle(record) {
  // 매핑에 있는 키워드만, 중복 없이. 같은 키워드가 두 번 들어오면 같은 요소가 같은 자리에
  // 두 번 그려져 면이 깜빡인다(z-fighting).
  const keywords = [...new Set((record.keywords || []).filter((k) => KEYWORD_NODES[k]))];
  // 배 색 — 설문과 같은 기본값: 선체가 없으면 기본, 갑판이 없으면 원톤(선체를 따라)
  const paint = paintParts(record.hull_color || "base", record.deck_color || "auto", PALETTE);
  const props = {};
  for (const p of PROP_FIELDS) props[p.id] = keywords.includes(p.keyword) ? propPaint(record[p.field], PALETTE) : null;
  const catCoat = COAT_IDS.includes(record.cat_coat) ? record.cat_coat : "calico";
  return { keywords, paint, props, catCoat };
}
