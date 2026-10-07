/* ===========================================================
   그래도, 여기 살고 있습니다 — 설문 흐름 (클래식 스크립트)
   ※ 기록 저장은 ui/record-sync.js 가 맡는다(Firebase, HANDOFF.md 13장). DB 설정이 비어 있거나
     ?mock=1 이면 아래 목업 entries 로만 돌고, 새로고침하면 초기화된다.

   화면 모양은 ui/survey.css (시안 B′). 세로 선택지는 ui/snap-picker.js,
   나눔 다이얼은 ui/share-dial.js. 3D 씬(window.BottleScene)은 index.html의 모듈이
   만들고, render()가 단계마다 show()로 알린다.
   state · render() 는 전역이다 — 검증 스크립트와 콘솔에서 직접 부른다.
=========================================================== */

// 지역·상태·키워드는 statistics/shared/survey-taxonomy.js 하나에서 온다.
// 머무름의 지도의 통계 집계가 같은 값을 읽는다 — 여기에 다시 적어 두면 갈라진다.
const REGIONS = SURVEY_TAXONOMY.REGIONS;
const STATES = SURVEY_TAXONOMY.STATES;
const SHARES = SURVEY_TAXONOMY.SHARES;
const KEYWORDS = SURVEY_TAXONOMY.KEYWORDS;
const SENTENCE_Q = SURVEY_TAXONOMY.SENTENCE_Q;
const BOAT_COLORS = SURVEY_TAXONOMY.BOAT_COLORS;
const PROP_PAINTS = SURVEY_TAXONOMY.PROP_PAINTS;
const CAT_COATS = SURVEY_TAXONOMY.CAT_COATS;

// 시연용 목업 시드 데이터 — DB 설정이 비었을 때만 아카이브에 쓰인다 (record-sync.js archiveView)
let entries = [
  {region:"아산", state:"stay", text:"여기서 나고 자란 친구들이 아직 다 있어서, 떠날 이유를 못 찾겠어요.", keywords:["관계","익숙함"], name:"익명"},
  {region:"천안", state:"leaving", text:"괜찮은 일자리가 여기엔 없어서, 결국 서울로 가게 될 것 같아요.", keywords:["일","불안"], name:"익명"},
  {region:"기타 충남", state:"returned", text:"서울 살아보니 알겠더라고요, 제가 있을 곳은 여기였다는 걸.", keywords:["소속감","익숙함"], name:"바다"},
  {region:"아산", state:"between", text:"평일엔 일 때문에 나가지만 주말엔 항상 이곳으로 돌아와요.", keywords:["일","가족"], name:"익명"},
  {region:"충남 밖", state:"unsure", text:"고향이 그립긴 한데, 지금 자리 잡은 곳을 버리기도 애매해요.", keywords:["불안","우연"], name:"익명"},
  {region:"천안", state:"stay", text:"작업실 월세가 여기서만 가능해서 계속 남아있어요.", keywords:["창작","주거"], name:"단단"},
  {region:"아산", state:"leaving", text:"부모님이 여기 계시지만, 제 커리어는 다른 도시에 있는 것 같아요.", keywords:["가족","일"], name:"익명"},
  {region:"기타 충남", state:"stay", text:"딱히 이유는 없지만 여길 떠난다는 상상이 잘 안 돼요.", keywords:["익숙함"], name:"익명"},
  {region:"천안", state:"unsure", text:"매년 떠난다고 말만 하고 벌써 5년째 여기 살고 있네요.", keywords:["우연","익숙함"], name:"익명"},
  {region:"충남 밖", state:"returned", text:"타지에서 지치고 나서야 이 동네의 조용함이 그리웠다는 걸 알았어요.", keywords:["소속감","불안"], name:"강"},
];

const FRESH_STATE = () => ({
  step: "onboard", region: null, stateId: null, text: "", share: null, keywords: [],
  // 배 색 — tone "one"(원톤: 갑판이 선체를 따라 물든다) | "two"(투톤). paintPart 는 지금 칠하는 곳(화면용 — 선체·갑판·소품 id)
  tone: "one", hullColor: "base", deckColor: "base", paintPart: "hull",
  // 키워드 소품 칠(10-07) — 튜브·서핑보드·클로버 색(배 색과 같은 모양), 고양이 털 무늬. 그 키워드를 고른 기록에만 실린다
  props: { tube: "base", board: "base", clover: "base" }, catCoat: "calico",
  paintHsv: {},   // 칠할 곳마다 마지막 판·막대 자리(화면용 — 흰·검의 색조를 잃지 않게)
  disclose: "익명", name: "", consent: false,
});
// 첫 화면은 온보딩이다. 예전의 크림색 소개 화면(splash)은 B′ 첫 화면에 합쳤다.
let state = { ...FRESH_STATE(), filterState: "all", filterRegion: "all" };

const app = document.getElementById("app");
// 새로고침·브라우저 종료 전에 쓰던 기록 — 있으면 첫 화면에서 이어 쓸지 묻는다 (ui/draft.js)
let resumeDraft = Draft.read();

function render(){
  app.innerHTML = "";
  const el = document.createElement("div");
  el.className = "screen";

  if(state.step==="onboard") el.appendChild(renderOnboard());
  else if(state.step==="prompt") el.appendChild(renderPrompt());
  else if(state.step==="region") el.appendChild(renderRegion());
  else if(state.step==="state") el.appendChild(renderState());
  else if(state.step==="sentence") el.appendChild(renderSentence());
  else if(state.step==="share") el.appendChild(renderShare());
  else if(state.step==="keywords") el.appendChild(renderKeywords());
  else if(state.step==="color") el.appendChild(renderColor());
  else if(state.step==="consent") el.appendChild(renderConsent());
  else if(state.step==="result") el.appendChild(renderResult());
  else if(state.step==="archive") el.appendChild(renderArchive());

  app.appendChild(el);
  // 단계에 따라 바뀌는 무대 요소(결과 화면의 비네트 등)는 CSS가 이 값을 본다
  document.body.dataset.step = state.step;
  // 질문 단계는 페이지를 화면에 묶는다(survey.css html.lock). 이미 밀려 있었으면 제자리로
  const lock = QUESTION_ORDER.includes(state.step);
  document.documentElement.classList.toggle("lock", lock);
  if(lock && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);

  // 3D 병 속 풍경 씬 동기화 (onboard ~ result 단계까지 배경으로 노출)
  if(window.BottleScene) window.BottleScene.show(state.step, state);
  // 작성 중이면 이 기기에 맡겨 둔다 — 새로고침·브라우저 종료 뒤 이어 쓰기 (ui/draft.js)
  Draft.save(state);
}

const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="#111318" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

// 질문 단계 일곱 개 — 위 표시줄의 장 번호와 이름 (Ⅵ 색은 10-06 추가)
const CHAPTERS = {
  region:   ["Ⅰ", "지역"],
  state:    ["Ⅱ", "상태"],
  sentence: ["Ⅲ", "문장"],
  share:    ["Ⅳ", "나눔"],
  keywords: ["Ⅴ", "키워드"],
  color:    ["Ⅵ", "색"],
  consent:  ["Ⅶ", "공개"],
};
const QUESTION_ORDER = Object.keys(CHAPTERS);

function h(tag, cls, text){
  const el = document.createElement(tag);
  if(cls) el.className = cls;
  if(text !== undefined) el.textContent = text;
  return el;
}

/**
 * 질문 단계의 공통 틀. 위 표시줄 + 아래 어둠 + 높이가 고정된 질문 판(제목·설명·내용·이전/다음).
 * 판 높이가 모든 단계에서 같아서 질문 제목이 늘 같은 자리에서 시작한다(사용자 요청).
 * 반환값의 next로 disabled를 조작한다.
 */
function questionStep({ title, sub, content, prev, nextLabel = "다음", onNext }){
  const idx = QUESTION_ORDER.indexOf(state.step);
  const [num, name] = CHAPTERS[state.step];
  const d = h("div", "step");
  d.appendChild(h("div", "scrim-top"));
  d.appendChild(h("div", "scrim-bottom"));

  const top = h("div", "qtop");
  top.innerHTML = `<span class="qtop-chapter"><span class="qtop-num">${num}</span><span class="qtop-name">${name}</span></span>
    <span class="qtop-count">0${idx + 1} / 0${QUESTION_ORDER.length}</span>
    <div class="qtop-line"><div class="qtop-fill" style="width:${((idx + 1) / QUESTION_ORDER.length) * 100}%"></div></div>`;
  d.appendChild(top);

  const panel = h("div", "qpanel");
  const t = h("h2", "q", title);
  panel.appendChild(t);
  if(sub) panel.appendChild(h("p", "sub", sub));
  const body = h("div", "qcontent");
  body.appendChild(content);
  panel.appendChild(body);

  const nav = h("div", "qnav");
  const back = h("button", "qback");
  back.type = "button";
  back.innerHTML = `${ICON_BACK}이전`;
  back.onclick = () => { state.step = prev; render(); };
  const next = h("button", "qnext");
  next.type = "button";
  next.innerHTML = `${nextLabel}${ICON_NEXT}`;
  next.onclick = onNext;
  nav.appendChild(back); nav.appendChild(next);
  panel.appendChild(nav);
  d.appendChild(panel);
  return { el: d, next };
}

/** 씬(모듈)이 준비될 때까지 기다린다. 끝내 안 오면(WebGL 실패 등) 없는 채로 부른다. */
function whenScene(cb, timeout = 4000){
  if(window.BottleScene) return cb(window.BottleScene);
  const t0 = performance.now();
  const iv = setInterval(() => {
    if(window.BottleScene || performance.now() - t0 > timeout){ clearInterval(iv); cb(window.BottleScene || null); }
  }, 80);
}

/** 첫 화면 두 장은 하늘에서 본다. 처음이면 인트로(처음부터 하늘), 되돌아왔으면 하늘로 되짚어 오른다. */
function skyUp(scene, done){
  if(!scene.introDone) scene.playIntro(done);
  else scene.introRise(done);
}

/* ── 첫 화면 1장 (B′1) ─────────────────────────────────────────────────────
   하늘 위에 제목, 아래 어둠 위에 소개·시작 버튼. 아래 정보가 적어 어둠은 최대한 낮게 깐다.
   제목은 씬이 뜨기 전부터 보인다(크림 배경 위에서도 읽히는 짙은 남색) — 하늘이 그 뒤로 들어온다. */
function renderOnboard(){
  const d = h("div");
  const label = h("p", "ob-label", "입다 · 2026 다원예술 프로젝트");
  d.appendChild(label);
  const title = h("h1", "ob-title");
  title.innerHTML = "그래도,<br>여기 살고 있습니다";
  d.appendChild(title);
  const scrim = h("div", "ob-scrim fade-stage");
  d.appendChild(scrim);

  const bottom = h("div", "ob-bottom fade-stage");
  d.appendChild(bottom);
  const reveal = () => requestAnimationFrame(() => { scrim.classList.add("show"); bottom.classList.add("show"); });
  // 1장을 걷어내고 하늘만 남긴 뒤 다음으로 넘어간다
  const leave = (then) => {
    scrim.classList.remove("show"); bottom.classList.remove("show");
    for(const el of [title, label]){ el.style.transition = "opacity .6s ease"; el.style.opacity = "0"; }
    setTimeout(then, 650);
  };

  if(resumeDraft) renderResumeAsk(bottom, leave);
  else {
    bottom.appendChild(h("p", "ob-desc", "충남·아산에 남아 살아가는 청년의 이야기를 한 문장으로 남겨주세요. 당신의 문장은 다른 사람들의 기록과 함께 전시장 안에 쌓입니다."));
    const btn = h("button", "cta");
    btn.type = "button";
    btn.innerHTML = `시작하기${ICON_NEXT}`;
    bottom.appendChild(btn);
    bottom.appendChild(h("p", "ob-caption", `질문 ${QUESTION_ORDER.length}개 · 약 2분 · 익명으로 남길 수 있어요`));
    btn.onclick = () => {
      if(btn.disabled) return;
      btn.disabled = true;
      leave(() => { state.step = "prompt"; render(); });
    };
  }

  whenScene((scene) => {
    if(state.step !== "onboard") return;
    if(!scene){ reveal(); return; }
    scene.show("onboard", state);
    skyUp(scene, reveal);
  });
  return d;
}

/* ── 첫 화면 2장 — 질문 한 줄이 하늘 가운데에 혼자 떠오른다(개편 전의 온보딩처럼).
   '다음'을 누르면 글자를 걷고 카메라가 바다로 내려앉은 뒤 첫 질문이 올라온다.
   첫 질문에서 '이전'을 누르면 여기로 돌아오며 하늘로 되짚어 오른다(skyUp). */
function renderPrompt(){
  const d = h("div");
  const q = h("p", "pr-q fade-stage");
  q.innerHTML = "지금, 당신은<br>이곳에 머물고 있나요,<br>지나가고 있나요?";
  d.appendChild(q);
  const next = h("button", "pr-next fade-stage");
  next.type = "button";
  next.innerHTML = `다음${ICON_NEXT}`;
  d.appendChild(next);

  const reveal = () => {
    requestAnimationFrame(() => q.classList.add("show"));
    setTimeout(() => next.classList.add("show"), 650);
  };
  next.onclick = () => {
    if(next.disabled) return;
    next.disabled = true;
    // 글자를 먼저 걷어내고, 카메라가 내려앉는 동안 화면을 비워 둔다.
    q.classList.remove("show"); next.classList.remove("show");
    descendTo("region");
  };

  whenScene((scene) => {
    if(state.step !== "prompt") return;
    if(!scene){ reveal(); return; }
    skyUp(scene, reveal);
  });
  return d;
}

/** 하늘에서 바다로 내려앉고, 배가 자리를 잡아 0.5초 머문 뒤 질문 단계를 페이드로 올린다.
    첫 질문으로 갈 때(2장 '다음')와 이어 쓰기가 같이 쓴다. */
function descendTo(step){
  if(!window.BottleScene){ state.step = step; render(); return; }
  window.BottleScene.introDescend(() => {
    setTimeout(() => {
      state.step = step; render();
      const el = document.querySelector(".step");
      if(el){ el.classList.add("step-fade");
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show"))); }
    }, 500);
  });
}

/* ── 이어 쓰기 — 첫 화면 1장의 아래 어둠 자리에서 묻는다 (ui/draft.js) ─────────────────
   이어 쓰면 2장(질문 한 줄)은 건너뛰고, 고른 값(모래 색·배 상태·시간대·키워드 소품)을 씬에 먼저
   입힌 채 하늘에서 내려앉아 멈췄던 단계를 연다. 동의 체크는 맡겨 두지 않으므로 다시 누른다. */
function renderResumeAsk(bottom, leave){
  const dr = resumeDraft;
  const at = Draft.STEPS.indexOf(dr.step);
  const past = (step) => Draft.STEPS.indexOf(step) < at;
  const [num, name] = CHAPTERS[dr.step];
  bottom.appendChild(h("p", "ob-resume-q", "이전 작성부분에서 이어가시겠어요?"));
  const meta = [`${num} ${name}부터`];
  if(past("region") && dr.region) meta.push(dr.region);
  if(past("state") && dr.stateId) meta.push(stateLabel(dr.stateId));
  bottom.appendChild(h("p", "ob-resume-meta", meta.join(" · ")));
  // 자기가 쓴 문장이지만 저장소에서 온 값이라 textContent 로만 넣는다
  if(dr.text.trim()) bottom.appendChild(h("p", "ob-resume-text", `“${dr.text.trim()}”`));

  const go = h("button", "cta");
  go.type = "button";
  go.innerHTML = `이어 쓰기${ICON_NEXT}`;
  const fresh = h("button", "ob-fresh", "처음부터 새로 쓰기");
  fresh.type = "button";
  bottom.appendChild(go);
  bottom.appendChild(fresh);

  go.onclick = () => {
    if(go.disabled) return;
    go.disabled = fresh.disabled = true;
    resumeDraft = null;
    const { step, at: _at, ...vals } = dr;
    Object.assign(state, vals, { consent: false });
    leave(() => {
      const scene = window.BottleScene;
      if(scene){
        // render()가 단계마다 show()로 지역·상태·키워드를 다시 입히지만, 내려앉는 동안에도
        // 고른 풍경이어야 하므로 먼저 입힌다. 시간대는 나눔 단계만 바꾸므로 여기서 직접.
        scene.applyRegion(state.region);
        scene.setMode(state.stateId || "stay");
        scene.applyKeywords(state.keywords);
        applyPaint(scene, { instant: true });
        const sh = SHARES.find(x => x.id === state.share);
        if(sh) scene.setTimeOfDay(sh.time);
      }
      descendTo(step);
    });
  };
  fresh.onclick = () => {
    Draft.clear();
    resumeDraft = null;
    render();
  };
}

function renderRegion(){
  // 첫 진입이면 아무것도 고르지 않은 상태이므로 목록 첫 항목이 가운데에 온다.
  if(!state.region) state.region = REGIONS[0];
  const picker = snapPicker(
    REGIONS.map(r => ({ id: r, label: r })), state.region,
    // 고르는 즉시 씬의 모래 색도 바꾼다 (다음 단계로 넘어갈 때까지 기다리지 않게)
    (v) => { state.region = v; if(window.BottleScene) window.BottleScene.applyRegion(v); }
  );
  return questionStep({
    title: "지금 활동하는 지역은 어디인가요?",
    sub: "넓은 범주로만 남습니다. 상세 주소는 수집하지 않아요.",
    content: picker, prev: "prompt",
    onNext: () => { state.step = "state"; render(); },
  }).el;
}

function renderState(){
  if(!state.stateId) state.stateId = STATES[0].id;
  // 고른 상태의 설명(desc)은 적지 않는다 — 사용자 결정(09-30): 고른 것에 딸린 설명은 뺀다
  const picker = snapPicker(
    STATES.map(x => ({ id: x.id, label: x.label })), state.stateId,
    (v) => { state.stateId = v; if(window.BottleScene) window.BottleScene.setMode(v); }
  );
  return questionStep({
    title: "지금 당신의 상태에 가장 가까운 것은?",
    sub: "정답은 없어요. 지금 느끼는 대로.",
    content: picker, prev: "region",
    onNext: () => { state.step = "sentence"; render(); },
  }).el;
}

function renderSentence(){
  const box = h("div");
  box.style.display = "flex"; box.style.flexDirection = "column";
  const ta = h("textarea", "sentence");
  ta.maxLength = 80; ta.rows = 2;
  ta.placeholder = "예: 아직 여기에 내가 아끼는 사람들이 있어서요.";
  ta.setAttribute("aria-label", "한 문장");
  ta.value = state.text;
  const count = h("div", "char-count", `${ta.value.length} / 80`);
  box.appendChild(ta); box.appendChild(count);
  const step = questionStep({
    title: SENTENCE_Q[state.stateId] || SENTENCE_Q.stay,
    sub: "정답은 없어요. 80자 안의 한 문장으로.",
    content: box, prev: "state",
    onNext: () => { state.step = "share"; render(); },
  });
  ta.addEventListener("input", () => {
    state.text = ta.value;
    Draft.save(state);
    count.textContent = `${ta.value.length} / 80`;
    step.next.disabled = ta.value.trim().length === 0;
  });
  step.next.disabled = state.text.trim().length === 0;
  return step.el;
}

function renderShare(){
  if(!state.share) state.share = SHARES[0].id;
  // 고른 만큼 하루의 시간이 바뀐다 — 시간 이름은 적지 않고 풍경이 보여준다
  const applyTime = (id) => {
    const s0 = SHARES.find(x => x.id === id);
    if(s0 && window.BottleScene) window.BottleScene.setTimeOfDay(s0.time);
  };
  applyTime(state.share);
  const dial = shareDial(SHARES.map(x => ({ id: x.id, label: x.label })), state.share,
    (v) => { state.share = v; applyTime(v); });
  return questionStep({
    title: "이 마음을 몇 명과 나눠봤나요?",
    sub: "바늘을 돌려 골라주세요.",
    content: dial, prev: "sentence",
    onNext: () => { state.step = "keywords"; render(); },
  }).el;
}

function renderKeywords(){
  const wrap = h("div", "kw-words");
  const full = state.keywords.length >= 2;
  KEYWORDS.forEach(k => {
    const on = state.keywords.includes(k);
    // 배 위에 생기는 물건 이름은 적지 않는다 — 고르면 배 위에 바로 나타난다
    const b = h("button", "kw-word" + (on ? " selected" : ""));
    b.type = "button";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = `<span>${k}</span>`;
    b.disabled = !on && full;
    b.onclick = () => {
      if(on) state.keywords = state.keywords.filter(x => x !== k);
      else if(state.keywords.length < 2) state.keywords.push(k);
      render();
    };
    wrap.appendChild(b);
  });
  return questionStep({
    title: "그 문장을 설명하는 키워드를 골라주세요",
    sub: "두 개까지 고를 수 있어요.",
    content: wrap, prev: "share",
    onNext: () => { state.step = "color"; render(); },
  }).el;
}

/* ── Ⅵ 색 — 배를 칠한다 (10-06 · 10-07 사용자) ──────────────────────────────
   위 왼쪽: 원톤 · 투톤 / 칠할 곳 칩 — 투톤이면 선체 · 갑판, 고른 키워드에 소품이 있으면 그 소품도(튜브·서핑보드·클로버·고양이).
   위 오른쪽: 명암 판(가로 채도 · 세로 밝기) + 그 아래 색조 막대 — dh 전시의 색 고르기처럼.
   아래: 기본 + 팔레트 한 줄(지도 톤 작품 색 8개, 빨주노초파남보흑 순). 고양이는 색 대신 털 무늬 다섯(판은 숨긴다).
   배는 고른 색 그대로 보이게 칠한다(원색 — 10-07 "원색 버전으로 가자". 예전 '누름' 방식과 시험 체크는 뺐다).
   팔레트를 누르면 명암 판·색조 막대의 표시도 그 색 자리로 옮겨 간다(값은 팔레트 id 그대로 — 통계에서 셀 수 있게).
   판·막대를 움직이면 "#rrggbb"가 된다. 둘 다 statistics/shared/boat-look.js 가 배 색으로 푼다.
   판·막대를 끄는 동안엔 render()를 부르지 않는다 — 화면을 다시 만들면 손가락이 잡고 있던 요소가 사라진다.
   그동안은 씬 색·표시만 직접 바꾸고, 손을 떼면 다음 프레임에 render()(이어 쓰기 저장 포함). */
// HSV — 명암 판(채도 = 가로, 밝기 = 세로)과 색조 막대. 화면 그림도 같은 식이라 손가락 아래 색이 곧 고른 색이다.
function hsvToHex(h, s, v){
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return "#" + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}
function hexToHsv(hex){
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if(d > 1e-6) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}
const isPaintHex = (v) => /^#[0-9a-f]{6}$/.test(v || "");
/** 그 값이 화면에 그려질 동그라미 색 — 팔레트 id 는 그 hex. '기본'은 칠할 곳의 원래 색(투톤 갑판 = 갑판 나무색, 소품 = 소품 색) */
function paintSwatch(value, part){
  if(isPaintHex(value)) return value;
  const c = BOAT_COLORS.find(x => x.id === value) || BOAT_COLORS[0];
  if(c.id !== "base") return c.hex;
  const prop = PROP_PAINTS.find(p => p.id === part);
  return prop ? prop.swatch : part === "deck" ? c.deckHex : c.hex;
}
/** 씬에 지금 색을 입힌다 — 배 색과 소품 칠 */
function applyPaint(scene, opts){
  scene.setPaint(state.hullColor, state.tone === "two" ? state.deckColor : "auto", opts);
  scene.setProps(state.props, state.catCoat);
}

function renderColor(){
  const box = h("div", "paint");
  const two = state.tone === "two";
  // 칠할 곳 — 고른 키워드의 소품만. 키워드를 바꾸고 돌아와 칠하던 소품이 빠졌으면 선체로
  const props = PROP_PAINTS.filter(p => state.keywords.includes(p.keyword));
  const parts = (two ? ["hull", "deck"] : ["hull"]).concat(props.map(p => p.id));
  if(!parts.includes(state.paintPart)) state.paintPart = "hull";
  const part = state.paintPart;
  const prop = PROP_PAINTS.find(p => p.id === part);
  const isCoat = !!prop && prop.kind === "coat";
  const partName = prop ? prop.label : part === "deck" ? "갑판" : two ? "선체" : "배";
  const current = () => prop ? (state.props[part] || "base") : part === "deck" ? state.deckColor : state.hullColor;
  const setCurrent = (v) => {
    if(prop) state.props = { ...state.props, [part]: v };
    else if(part === "deck") state.deckColor = v;
    else state.hullColor = v;
  };
  const applyScene = () => { if(window.BottleScene) applyPaint(window.BottleScene); };

  const top = h("div", "paint-top");
  const left = h("div", "paint-left");
  const modes = h("div", "paint-modes");
  modes.setAttribute("role", "radiogroup");
  modes.setAttribute("aria-label", "칠하는 방식");
  [["one", "원톤"], ["two", "투톤"]].forEach(([id, label]) => {
    const b = h("button", "paint-mode" + (state.tone === id ? " on" : ""), label);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", state.tone === id ? "true" : "false");
    b.onclick = () => {
      if(state.tone === id) return;
      state.tone = id;
      if(!prop) state.paintPart = "hull";   // 소품을 칠하던 중이면 그대로
      render();
    };
    modes.appendChild(b);
  });
  left.appendChild(modes);
  // 칠할 곳 칩. 원톤인데 소품이 없으면 고를 게 없어 비워 둔다. 투톤 + 소품이면 소품은 둘째 줄
  const mid = h("div", "paint-mid");
  const chips = two ? [["hull", "선체"], ["deck", "갑판"]] : props.length ? [["hull", "배"]] : [];
  props.forEach((p, i) => {
    if(i === 0 && two) chips.push(null);
    chips.push([p.id, p.label]);
  });
  chips.forEach((c) => {
    if(!c){ mid.appendChild(h("span", "paint-break")); return; }
    const [id, label] = c;
    const t = h("button", "paint-part" + (part === id ? " on" : ""), label);
    t.type = "button";
    t.setAttribute("aria-pressed", part === id ? "true" : "false");
    t.onclick = () => { state.paintPart = id; render(); };
    mid.appendChild(t);
  });
  left.appendChild(mid);
  top.appendChild(left);

  // ── 명암 판 + 색조 막대 ── 표시는 지금 값(팔레트든 직접이든)의 자리에.
  // 흰색·검은색은 색조가 없어 hex 만으로는 막대 자리를 모른다 — 칠할 곳마다 마지막 판·막대 자리를 기억해 둔다(10-07 버그:
  // 흰/검을 잡고 막대를 돌리면 손을 뗄 때 빨강 자리로 돌아갔다)
  const hex0 = isCoat ? "#808080" : paintSwatch(current(), part);   // 고양이는 판을 숨긴다 — 자리만 채운다
  const mem = state.paintHsv[part];
  const hsv0 = mem && mem.hex === hex0 ? mem : hexToHsv(hex0);
  let wh = hsv0.h, ws = hsv0.s, wv = hsv0.v;
  const picker = h("div", "paint-picker" + (isCoat ? " off" : ""));
  const sv = h("div", "paint-sv");
  sv.setAttribute("role", "slider");
  sv.setAttribute("aria-label", `${partName} 색 — 채도와 밝기`);
  const svDot = h("span", "paint-sv-dot");
  sv.appendChild(svDot);
  const hue = h("div", "paint-hue");
  hue.setAttribute("role", "slider");
  hue.setAttribute("aria-label", "색조");
  const hueDot = h("span", "paint-hue-dot");
  hue.appendChild(hueDot);
  picker.appendChild(sv); picker.appendChild(hue);
  if(isCoat) picker.setAttribute("aria-hidden", "true");
  top.appendChild(picker);
  box.appendChild(top);

  const drawPicker = () => {
    sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hsvToHex(wh, 1, 1)})`;
    svDot.style.left = `${ws * 100}%`;
    svDot.style.top = `${(1 - wv) * 100}%`;
    svDot.style.background = hsvToHex(wh, ws, wv);
    hueDot.style.left = `${wh / 360 * 100}%`;
    hueDot.style.background = hsvToHex(wh, 1, 1);
  };
  drawPicker();

  const pick = () => {
    const hex = hsvToHex(wh, ws, wv);
    state.paintHsv[part] = { h: wh, s: ws, v: wv, hex };
    setCurrent(hex);
    applyScene(); drawPicker();
    pads.querySelectorAll(".paint-pad.on").forEach(p => { p.classList.remove("on"); p.setAttribute("aria-pressed", "false"); });
  };
  // 끌기 — 손가락 하나만 따라간다. 손을 떼거나(up) 놓치면(cancel · 잡기 풀림) 정리하고, 화면은 다음 프레임에 다시 만든다.
  // (손을 뗀 그 이벤트 안에서 화면을 갈아엎지 않는다 — 브라우저가 뒤이어 보내는 click 이 새로 생긴 엉뚱한 요소에 떨어질 수 있다)
  const drag = (el, onMove) => {
    if(isCoat) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const id = e.pointerId;
      try { el.setPointerCapture(id); } catch(_) {}
      onMove(e);
      let done = false;
      const move = (ev) => { if(ev.pointerId === id) onMove(ev); };
      const end = (ev) => {
        if(done || ev.pointerId !== id) return;
        done = true;
        el.removeEventListener("pointermove", move);
        ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => el.removeEventListener(t, end));
        requestAnimationFrame(() => { if(state.step === "color") render(); });
      };
      el.addEventListener("pointermove", move);
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => el.addEventListener(t, end));
    });
  };
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  drag(sv, (e) => {
    const r = sv.getBoundingClientRect();
    ws = clamp01((e.clientX - r.left) / r.width);
    wv = clamp01(1 - (e.clientY - r.top) / r.height);
    pick();
  });
  drag(hue, (e) => {
    const r = hue.getBoundingClientRect();
    wh = clamp01((e.clientX - r.left) / r.width) * 359.9;
    pick();
  });

  // ── 기본 + 팔레트 한 줄 (고양이는 털 무늬 다섯) ──
  const pads = h("div", "paint-pads" + (isCoat ? " coats" : ""));
  if(isCoat){
    CAT_COATS.forEach(c => {
      const on = state.catCoat === c.id;
      const b = h("button", "paint-coat" + (on ? " on" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      const sw = h("span", "sw");
      sw.style.background = c.swatch;
      b.appendChild(sw);
      b.appendChild(h("span", "lb", c.label));
      b.onclick = () => { state.catCoat = c.id; render(); };
      pads.appendChild(b);
    });
  } else {
    BOAT_COLORS.forEach(c => {
      const on = current() === c.id;
      const b = h("button", "paint-pad" + (on ? " on" : ""));
      b.type = "button";
      b.style.background = paintSwatch(c.id, part);
      b.setAttribute("aria-label", `${partName} ${c.label}`);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.onclick = () => { setCurrent(c.id); render(); };
      pads.appendChild(b);
    });
  }
  box.appendChild(pads);

  return questionStep({
    title: "배를 어떤 색으로 칠할까요?",
    content: box, prev: "keywords",
    onNext: () => { state.step = "consent"; render(); },
  }).el;
}

function renderConsent(){
  const box = h("div");
  box.style.display = "flex"; box.style.flexDirection = "column";

  const tabs = h("div", "disc-tabs");
  tabs.setAttribute("role", "radiogroup");
  tabs.setAttribute("aria-label", "공개 방식");
  const nameWrap = h("div");
  ["익명", "별칭", "실명"].forEach(v => {
    const lab = h("label", "disc-tab");
    lab.innerHTML = `<input type="radio" name="disclose" value="${v}" ${state.disclose === v ? "checked" : ""}><span>${v}</span>`;
    // 피커와 같은 이유로 render()를 부르지 않는다 — 이름 칸만 다시 그린다
    lab.querySelector("input").addEventListener("change", () => { state.disclose = v; Draft.save(state); renderNameField(); updateNext(); });
    tabs.appendChild(lab);
  });
  box.appendChild(tabs);
  box.appendChild(nameWrap);

  // 별칭/실명을 고른 경우에만 입력칸이 나온다. 익명이면 적을 것이 없다.
  function renderNameField(){
    nameWrap.innerHTML = "";
    if(state.disclose === "익명") return;
    const inp = h("input", "name-input");
    inp.type = "text"; inp.maxLength = 12;
    inp.placeholder = state.disclose === "별칭" ? "별칭 (예: 바다)" : "이름 (예: 이승민)";
    inp.setAttribute("aria-label", state.disclose);
    inp.value = state.name || "";
    inp.addEventListener("input", () => { state.name = inp.value; Draft.save(state); updateNext(); });
    nameWrap.appendChild(inp);
  }

  const check = h("label", "consent-check");
  check.innerHTML = `<span class="box"><input type="checkbox" ${state.consent ? "checked" : ""}>${ICON_CHECK}</span>
    <span class="txt">제출한 문장이 전시장 화면과 웹 아카이브에 공개되고, 아카이브북·결과보고서에 활용되는 것에 동의합니다.</span>`;
  check.querySelector("input").addEventListener("change", (e) => { state.consent = e.target.checked; updateNext(); });
  box.appendChild(check);
  box.appendChild(h("p", "privacy-note", "지역·상태·문장 외의 개인정보는 저장하지 않아요. 욕설·혐오·개인정보가 담긴 문장은 비공개될 수 있어요."));

  const step = questionStep({
    title: "공개 방식과 활용 동의",
    sub: "익명으로 남겨도 되고, 별칭을 적어도 괜찮아요.",
    content: box, prev: "color", nextLabel: "제출하기",
    onNext: () => {
      entries.forEach(e => { e._new = false; });   // "나의 기록" 표시는 방금 남긴 것 하나만
      const entry = {
        region: state.region, state: state.stateId, share: state.share, text: state.text,
        keywords: [...state.keywords],
        name: state.disclose === "익명" ? "익명" : state.name.trim(),
        // 배 색 — 원톤이면 갑판은 "auto"(선체를 따라 물든다). 지도도 같은 식으로 그린다(boat-look.js paintMaterials)
        hullColor: state.hullColor, deckColor: state.tone === "two" ? state.deckColor : "auto",
        // 소품 칠 — 기록에는 고른 키워드의 것만 실린다(record-schema.js makeRecord)
        props: { ...state.props }, catCoat: state.catCoat,
        // id를 여기서 미리 정한다 = DB 문서 id. 재전송해도 같은 문서라 중복이 생기지 않는다
        _new: true, id: RecordSync.newId(),
      };
      entries.unshift(entry);
      RecordSync.submit(entry);   // 기다리지 않는다 — 전송이 실패해도 결과 화면은 뜨고 문장은 대기열에 남는다
      Draft.clear();              // 이제 이어 쓸 것이 없다 — 남은 건 RecordSync 대기열이 맡는다
      state.step = "result"; render();
    },
  });
  // 별칭/실명을 골랐으면 이름이 실제로 적혀 있어야 한다.
  // 비워둔 채 제출되면 카드에 표시할 이름이 없는데 익명도 아닌 상태가 된다.
  function updateNext(){
    const needsName = state.disclose !== "익명";
    step.next.disabled = !state.consent || (needsName && (state.name || "").trim() === "");
  }
  renderNameField();
  updateNext();
  return step.el;
}

function stateLabel(id){ return (STATES.find(s => s.id === id) || {}).label || id; }

/* ── 결과 (B′5) ────────────────────────────────────────────────────────────
   병이 풍경을 감싸며 떠오르고 배경이 흰색으로 페이드된 뒤(씬), 비네트가 바깥에서
   들어오고(index.html CSS), 글자가 올라온다. 맨 아래 작은 줄에 이미지 저장 · 공유하기 ·
   다시 쓰기 — 큰 버튼(지도 보러가기)을 가리지 않게 글자 버튼으로 (ui/share-card.js). */
const ICON_SAVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>`;
const ICON_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>`;
const ICON_AGAIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>`;

/** 지금 기록의 병 스냅샷. 한 번 찍어 두고 카드와 아카이브가 같이 쓴다. */
function mySnapshot(){
  const e = entries[0];
  if(!e || !e._new) return null;
  if(!e.snapshot && window.BottleScene){
    e.snapshot = window.BottleScene.capture();
    RecordSync.attachThumb(e);   // 작은 WebP로 줄여 기록 뒤에 올린다
  }
  return e.snapshot || null;
}
function cardInfo(){
  const e = entries[0] || {};
  return {
    key: e.id || 0,
    snapshot: mySnapshot(),
    sentence: state.text,
    meta: [state.region, stateLabel(state.stateId), ...state.keywords].join(" · "),
  };
}

function renderResult(){
  const d = h("div");
  const top = h("div", "res-top fade-stage");
  top.innerHTML = "<span>기록 완료</span><span></span>";
  d.appendChild(top);

  const bottom = h("div", "res-bottom fade-stage");
  bottom.appendChild(h("p", "res-label", "MY SENTENCE · 지금 이곳"));
  bottom.appendChild(h("p", "res-sentence", `“${state.text}”`));
  bottom.appendChild(h("p", "res-meta", [state.region, stateLabel(state.stateId), ...state.keywords].join(" · ")));
  bottom.appendChild(h("p", "res-note", "당신의 문장이 다른 사람들의 기록과 함께 쌓였습니다."));
  const btn = h("button", "cta");
  btn.type = "button";
  btn.innerHTML = `머무름의 지도 보러가기${ICON_NEXT}`;
  btn.onclick = () => { mySnapshot(); state.step = "archive"; render(); window.scrollTo(0, 0); };
  bottom.appendChild(btn);

  const acts = h("div", "res-actions");
  const act = (icon, label, fn) => {
    const b = h("button", "res-act");
    b.type = "button";
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.onclick = fn;
    return b;
  };
  acts.appendChild(act(ICON_SAVE, "이미지 저장", () => saveShareCard(cardInfo())));
  acts.appendChild(h("span", "res-sep"));
  acts.appendChild(act(ICON_SHARE, "공유하기", () => shareShareCard(cardInfo())));
  acts.appendChild(h("span", "res-sep"));
  acts.appendChild(act(ICON_AGAIN, "다시 쓰기", restart));
  bottom.appendChild(acts);
  d.appendChild(bottom);

  const show = () => {
    requestAnimationFrame(() => { top.classList.add("show"); bottom.classList.add("show"); });
    // 병이 다 떠오른 뒤에 카드를 미리 그려 둔다 — 공유는 누른 순간에만 허락되는 브라우저가 있다
    setTimeout(() => { if(state.step === "result") prepareShareCard(cardInfo()); }, 1200);
  };
  if(window.BottleScene) window.BottleScene.revealBottle(show);
  else show();
  return d;
}

function restart(){
  Draft.clear();
  state = { ...FRESH_STATE(), filterState: state.filterState, filterRegion: state.filterRegion };
  render();
}

/* ── 다른 사람들의 기록 (머무름의 지도 보러가기) ──────────────────────────────
   결과 화면과 같은 톤 — 크림 바탕, 명조 문장, 갈색·금색.
   카드는 모두 한 줄 전체 폭, 높이 고정(10-06 사용자). 오른쪽에 병 그림을 카드 높이만큼 크게 두고,
   문장은 병 왼쪽에서 두 줄까지만 — 넘치면 '…'. 누르면 펼쳐져 메타 줄 아래에 병을 폭 가득 크게,
   그 아래에 문장 전체. 맨 아래엔 지도·다시 쓰기 버튼이 화면에 붙어 따라온다(.ar-bar). */

// "머무름의 지도 더 보러가기" — 인터랙티브 지도(statistics/explore.html, HANDOFF-map 25·26장).
// 목업·에뮬레이터로 테스트하던 중이면 지도도 같은 저장소를 보게 그 표시만 넘긴다.
// 방금 남긴 기록이 있으면 그 id(me)를 붙인다 — 지도가 그 배로 먼저 다가간다. 기록 id는 공개 문서 id라 비밀이 아니다.
// (이 함수는 지도 세션이 고친다 — HANDOFF.md 0장 예외 한 줄)
function mapUrl(){
  const q = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  for(const k of ["mock", "emu"]) if(q.get(k) === "1") keep.set(k, "1");
  const mine = entries.find(e => e._new);
  if(mine && mine.id) keep.set("me", mine.id);
  const qs = keep.toString();
  return "./statistics/explore.html" + (qs ? "?" + qs : "");
}

function renderArchive(){
  // DB가 붙어 있으면 서버의 최신 기록 + 내 것, 아니면 위 목업 entries (ui/record-sync.js)
  const view = RecordSync.archiveView(entries, () => { if(state.step === "archive") render(); });
  const d = h("div", "archive-screen");
  d.innerHTML = `<header class="ar-head">
      <p class="ar-eyebrow">그래도, 여기 살고 있습니다</p>
      <h2 class="ar-title">머무름의 지도</h2>
      <p class="ar-sub"></p>
    </header>`;
  d.querySelector(".ar-sub").textContent = view.loading ? "기록을 불러오는 중입니다"
    : view.failed ? "지금은 다른 기록을 불러오지 못했어요"
    : `지금까지 ${view.total}개의 문장이 쌓였습니다`;

  const tabs = h("div", "ar-tabs");
  tabs.setAttribute("role", "tablist");
  [{ id: "all", label: "전체" }, ...STATES.map(s0 => ({ id: s0.id, label: s0.label }))].forEach(f => {
    const t = h("button", "ar-tab" + (state.filterState === f.id ? " on" : ""), f.label);
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", state.filterState === f.id ? "true" : "false");
    t.onclick = () => { state.filterState = f.id; render(); };
    tabs.appendChild(t);
  });
  d.appendChild(tabs);

  const regionRow = h("div", "ar-region");
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", "지역");
  sel.innerHTML = `<option value="all">전체 지역</option>` + REGIONS.map(r => `<option value="${r}">${r}</option>`).join("");
  sel.value = state.filterRegion;
  sel.onchange = () => { state.filterRegion = sel.value; render(); };
  regionRow.appendChild(sel);
  d.appendChild(regionRow);

  const filtered = view.list.filter(e =>
    (state.filterState === "all" || e.state === state.filterState) &&
    (state.filterRegion === "all" || e.region === state.filterRegion)
  );

  const grid = h("div", "ar-grid");
  if(filtered.length === 0){
    grid.appendChild(h("p", "ar-empty", "아직 이 조건에 맞는 기록이 없습니다."));
  } else {
    filtered.forEach((e, i) => {
      // 남이 쓴 글이 들어오므로 innerHTML 에 넣지 않는다 — 글자는 textContent, 그림은 안전한 data URL만
      const snap = RecordSync.safeImage(e.snapshot);
      const c = h("button", "ar-card" + (e._new ? " mine" : "") + (snap ? " has-snap" : ""));
      c.type = "button";
      c.setAttribute("aria-expanded", "false");
      c.style.animationDelay = (i * 0.04) + "s";
      const named = e.name && e.name !== "익명";
      const meta = h("span", "ar-meta");
      if(e._new){ meta.appendChild(h("b", null, "나의 기록")); meta.append(" · "); }
      meta.append(`${e.region} · ${stateLabel(e.state)}`);
      c.appendChild(meta);
      if(snap){ const img = h("img", "ar-snap"); img.src = snap; img.alt = ""; c.appendChild(img); }
      c.appendChild(h("span", "ar-text", `“${e.text}”`));
      const foot = h("span", "ar-foot");
      foot.appendChild(h("span", "ar-kw", e.keywords.join(" · ")));
      foot.appendChild(h("span", "ar-by" + (named ? " named" : ""), `— ${e.name || "익명"}`));
      c.appendChild(foot);
      if(!snap) RecordSync.lazyThumb(c, e);   // 남의 카드는 화면에 들어올 때 썸네일을 받는다
      c.onclick = () => {
        const open = c.classList.toggle("open");
        c.setAttribute("aria-expanded", open ? "true" : "false");
        if(open) revealCard(c, bar);
      };
      grid.appendChild(c);
    });
  }
  d.appendChild(grid);

  // 화면 아래에 붙어 따라오는 버튼 두 개 + 검은 음영
  const bar = h("div", "ar-bar");
  const toMap = h("a", "cta ar-map");
  toMap.href = mapUrl();
  toMap.innerHTML = `머무름의 지도 더 보러가기${ICON_NEXT}`;
  const again = h("button", "ar-again");
  again.type = "button";
  again.innerHTML = `${ICON_AGAIN}다시 한 문장 남기기`;
  again.onclick = () => { restart(); window.scrollTo(0, 0); };
  bar.appendChild(toMap);
  bar.appendChild(again);
  d.appendChild(bar);
  return d;
}

/** 펼친 카드의 아래가 하단 버튼에 가리면 그만큼 올린다 — 단, 카드 머리가 화면 위로 넘어가지는 않게. */
function revealCard(card, bar){
  requestAnimationFrame(() => {
    const r = card.getBoundingClientRect();
    const limit = window.innerHeight - (bar ? bar.offsetHeight : 0);
    const need = Math.min(r.bottom - limit + 12, r.top - 12);
    if(need > 0) window.scrollBy({ top: need, behavior: "smooth" });
  });
}

// "PROTOTYPE · 목업 데이터" 배지는 목업으로 돌 때만 — 실DB로 도는 전시 화면에서 '목업'이라 쓰면 거짓말이 된다.
// 테스트 화면(?mock=1)과 실제 화면을 헷갈리지 않게 목업에선 남긴다.
if (window.RecordSync) RecordSync.ready().then((mode) => {
  const badge = document.getElementById("proto-badge");
  if (badge) badge.hidden = mode !== "mock";
});

render();
