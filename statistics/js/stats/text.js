/* =============================================================================
 * stats/text.js — 통계 문장을 만들 때 쓰는 글자 도구.
 *
 * 결론 문장은 데이터에서 자동으로 만들어진다("천안은 ‘오가는 중’이 …"). 한국어는
 * 앞 낱말의 받침에 따라 조사가 바뀌므로(천안은 / 비공개는, 가족을 / 자유를), 고정 문자열에
 * 끼워 넣으면 절반은 틀린 문장이 된다. 전시장 화면에 틀린 조사가 뜨는 건 숫자가 틀리는
 * 것만큼 눈에 띈다.
 * ========================================================================== */

/** HTML에 넣을 글자. 기록의 문장·지역명은 참여자가 쓴 글이라 반드시 거친다. */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// 숫자를 읽을 때 받침이 있는가: 영·일·삼·육·칠·팔 / 이·사·오·구
const DIGIT_FINAL = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };

/**
 * 낱말의 마지막 글자에 받침이 있는가.
 * 한글 음절은 (코드 − 0xAC00) % 28 이 종성 번호다(0이면 받침 없음).
 * 따옴표·괄호·공백 같은 기호는 건너뛰고 마지막 "읽히는" 글자를 본다.
 */
export function hasFinal(word) {
  // "31%"는 "삼십일 퍼센트"로 읽는다 — 숫자가 아니라 "퍼센트"(받침 없음)에 조사가 붙는다.
  if (/%\s*$/.test(String(word))) return false;
  const s = String(word).replace(/[\s'"‘’“”()[\]{}.,·-]+$/u, "");
  const ch = s.charAt(s.length - 1);
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return DIGIT_FINAL[ch];
  return false;
}

/**
 * 받침에 맞는 조사를 붙인다.
 * @param {string} pair "은는" | "이가" | "을를" | "과와" (앞 = 받침 있을 때)
 */
export function josa(word, pair) {
  return hasFinal(word) ? pair.slice(0, 1) : pair.slice(1, 2);
}

/** 받침 여부로 둘 중 하나를 고른다 — "이라고/라고"처럼 두 글자가 넘는 조사용. */
export function pick(word, withFinal, without) {
  return hasFinal(word) ? withFinal : without;
}

/** 낱말 + 조사. 결론 문장에서 강조(<em>)한 낱말 뒤에 조사를 붙일 때 쓴다. */
export function withJosa(word, pair) {
  return word + josa(word, pair);
}

/** 인용 표시. 레퍼런스(dh-learning)의 결론 문장과 같은 겹따옴표. */
export const q = (s) => `“${s}”`;

/** 비율 → 정수 퍼센트. 0.4%처럼 0으로 반올림되는 값은 "1% 미만"으로 적는다. */
export function pct(x) {
  if (!(x > 0)) return "0%";
  const p = Math.round(x * 100);
  return p === 0 ? "1% 미만" : `${p}%`;
}

const pad = (n) => String(n).padStart(2, "0");

/** 9월 14일 */
export function fmtDay(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 2026-09-27 14:32:07 — 레퍼런스 라벨의 "제조일자"와 같은 초 단위 기록 */
export function fmtStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 14:32:07 */
export function fmtClock(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 1,284 — 전시장은 한국어라 ko-KR 자리 구분 */
export const num = (n) => Number(n).toLocaleString("ko-KR");
