/* ===========================================================
   작성 중인 설문을 이 기기(localStorage)에 잠깐 맡겨 둔다 — 새로고침하거나 브라우저가 꺼진 뒤
   다시 열면 첫 화면에서 "이전 작성부분에서 이어가시겠어요?"를 묻는다 (survey.js renderOnboard).

   · 질문 여섯 단계(지역 ~ 공개)에서만 저장한다. 첫 화면·결과·아카이브는 이어 쓸 게 없다.
   · 동의 체크는 맡겨 두지 않는다 — 동의는 제출하는 그 순간의 의사여야 해서, 이어 쓴 사람도 다시 누른다.
   · 6시간이 지나면 버린다. 전시장 공용 기기라면 앞사람의 문장이 다음 사람에게 뜨면 안 되고,
     실수로 껐다 다시 켜는 경우는 길어야 몇 분이다.
   · 읽을 때 분류표(survey-taxonomy.js)로 값을 다시 거른다. 분류가 바뀐 뒤 남은 옛 값이
     그대로 제출되면 보안 규칙이 조용히 거절한다(HANDOFF.md 13.3).
   · 저장소가 막힌 브라우저(사생활 보호 모드 등)에서는 조용히 아무것도 하지 않는다.
=========================================================== */
const Draft = (() => {
  const KEY = "ibda-survey-draft-v1";
  const TTL_MS = 6 * 60 * 60 * 1000;
  const STEPS = ["region", "state", "sentence", "share", "keywords", "consent"];
  const DISCLOSE = ["익명", "별칭", "실명"];
  // 입력칸 제한과 같은 값 — 보안 규칙과 묶여 있다(문장 80 · 키워드 2 · 이름 12)
  const MAX_TEXT = 80, MAX_KW = 2, MAX_NAME = 12;

  const T = SURVEY_TAXONOMY;
  const oneOf = (v, list) => (list.includes(v) ? v : null);

  /** 설문 상태 → 저장할 값. 질문 단계가 아니면 null(저장 안 함). */
  function pick(s){
    if(!STEPS.includes(s.step)) return null;
    return {
      step: s.step, region: s.region, stateId: s.stateId, text: s.text, share: s.share,
      keywords: [...s.keywords], disclose: s.disclose, name: s.name, at: Date.now(),
    };
  }

  /** 저장된 값을 다시 거른다. 쓸 수 없으면 null. */
  function clean(d){
    if(!d || typeof d !== "object" || !STEPS.includes(d.step)) return null;
    if(!(Date.now() - d.at < TTL_MS)) return null;
    const text = typeof d.text === "string" ? d.text.slice(0, MAX_TEXT) : "";
    const kw = Array.isArray(d.keywords) ? d.keywords.filter(k => T.KEYWORDS.includes(k)).slice(0, MAX_KW) : [];
    const out = {
      step: d.step,
      region: oneOf(d.region, T.REGIONS),
      stateId: oneOf(d.stateId, T.STATES.map(x => x.id)),
      text,
      share: oneOf(d.share, T.SHARES.map(x => x.id)),
      keywords: [...new Set(kw)],
      disclose: oneOf(d.disclose, DISCLOSE) || "익명",
      name: typeof d.name === "string" ? d.name.slice(0, MAX_NAME) : "",
      at: d.at,
    };
    // 앞 단계 값이 빠졌으면(분류가 바뀌어 걸러진 경우) 그 단계부터 다시 묻는다.
    // 비어 있는 채로 뒤 단계에 들어가면 피커가 첫 항목을 몰래 골라 버린다.
    const need = [["region", out.region], ["state", out.stateId], ["sentence", out.text.trim()], ["share", out.share]];
    const at = STEPS.indexOf(out.step);
    for(const [step, v] of need){
      if(STEPS.indexOf(step) < at && !v){ out.step = step; break; }
    }
    // 이어 쓸 만한 게 하나도 없으면(지역 화면만 열어 봤던 경우) 묻지 않는다
    if(out.step === "region" && !out.text) return null;
    return out;
  }

  function read(){
    try { return clean(JSON.parse(localStorage.getItem(KEY) || "null")); }
    catch(_) { return null; }
  }
  function save(s){
    const d = pick(s);
    if(!d) return;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch(_) {}
  }
  function clear(){
    try { localStorage.removeItem(KEY); } catch(_) {}
  }

  return { read, save, clear, STEPS };
})();
