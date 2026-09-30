/* ===========================================================
   그래도, 여기 살고 있습니다 — 설문 흐름 (클래식 스크립트)
   ※ 실제 서버/DB 없음. 브라우저 메모리에만 데이터가 존재하며
     새로고침 시 초기화됩니다. (Firebase 설계는 HANDOFF.md 13장)

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

// 시연용 목업 시드 데이터
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
  disclose: "익명", name: "", consent: false,
});
// 첫 화면은 온보딩이다. 예전의 크림색 소개 화면(splash)은 B′ 첫 화면에 합쳤다.
let state = { ...FRESH_STATE(), filterState: "all", filterRegion: "all" };

const app = document.getElementById("app");

function render(){
  app.innerHTML = "";
  const el = document.createElement("div");
  el.className = "screen";

  if(state.step==="onboard") el.appendChild(renderOnboard());
  else if(state.step==="region") el.appendChild(renderRegion());
  else if(state.step==="state") el.appendChild(renderState());
  else if(state.step==="sentence") el.appendChild(renderSentence());
  else if(state.step==="share") el.appendChild(renderShare());
  else if(state.step==="keywords") el.appendChild(renderKeywords());
  else if(state.step==="consent") el.appendChild(renderConsent());
  else if(state.step==="result") el.appendChild(renderResult());
  else if(state.step==="archive") el.appendChild(renderArchive());

  app.appendChild(el);
  // 단계에 따라 바뀌는 무대 요소(결과 화면의 비네트 등)는 CSS가 이 값을 본다
  document.body.dataset.step = state.step;

  // 3D 병 속 풍경 씬 동기화 (onboard ~ result 단계까지 배경으로 노출)
  if(window.BottleScene) window.BottleScene.show(state.step, state);
}

const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="#111318" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

// 질문 단계 여섯 개 — 위 표시줄의 장 번호와 이름
const CHAPTERS = {
  region:   ["Ⅰ", "지역"],
  state:    ["Ⅱ", "상태"],
  sentence: ["Ⅲ", "문장"],
  share:    ["Ⅳ", "나눔"],
  keywords: ["Ⅴ", "키워드"],
  consent:  ["Ⅵ", "공개"],
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

/* ── 첫 화면 (B′1) ─────────────────────────────────────────────────────────
   하늘 위에 제목, 아래 어둠 위에 질문·소개·시작 버튼. 제목은 씬이 뜨기 전부터 보인다
   (크림 배경 위에서도 읽히는 짙은 남색) — 하늘이 그 뒤로 페이드되어 들어온다. */
function renderOnboard(){
  const d = h("div");
  d.appendChild(h("p", "ob-label", "입다 · 2026 다원예술 프로젝트"));
  const title = h("h1", "ob-title");
  title.innerHTML = "그래도,<br>여기 살고 있습니다";
  d.appendChild(title);
  const scrim = h("div", "ob-scrim fade-stage");
  d.appendChild(scrim);

  const bottom = h("div", "ob-bottom fade-stage");
  const q = h("p", "ob-q");
  q.innerHTML = "지금, 당신은 이곳에 머물고 있나요,<br>지나가고 있나요?";
  bottom.appendChild(q);
  bottom.appendChild(h("div", "ob-rule"));
  bottom.appendChild(h("p", "ob-desc", "충남·아산에 남아 살아가는 청년의 이야기를 한 문장으로 남겨주세요. 당신의 문장은 다른 사람들의 기록과 함께 전시장 안에 쌓입니다."));
  const btn = h("button", "cta");
  btn.type = "button";
  btn.innerHTML = `한 문장 남기러 가기${ICON_NEXT}`;
  bottom.appendChild(btn);
  bottom.appendChild(h("p", "ob-caption", "질문 6개 · 약 2분 · 익명으로 남길 수 있어요"));
  d.appendChild(bottom);

  const reveal = () => requestAnimationFrame(() => { scrim.classList.add("show"); bottom.classList.add("show"); });
  btn.onclick = () => {
    if(btn.disabled) return;
    btn.disabled = true;
    // 글자와 어둠을 먼저 걷어내고, 카메라가 내려앉는 동안 화면을 비워 둔다.
    scrim.classList.remove("show"); bottom.classList.remove("show");
    title.style.transition = "opacity .6s ease"; title.style.opacity = "0";
    if(window.BottleScene){
      window.BottleScene.introDescend(() => {
        // 배가 자리를 잡고 0.5초 머문 뒤에 첫 질문이 페이드로 올라온다.
        setTimeout(() => {
          state.step = "region"; render();
          const el = document.querySelector(".step");
          if(el){ el.classList.add("step-fade");
            requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show"))); }
        }, 500);
      });
    } else { state.step = "region"; render(); }
  };

  // 시점이 하늘에 올라가 있는 것을 확인한 뒤에 아래 글자를 올린다
  whenScene((scene) => {
    if(state.step !== "onboard") return;
    if(!scene){ reveal(); return; }
    scene.show("onboard", state);
    scene.playIntro(reveal);
  });
  return d;
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
    content: picker, prev: "onboard",
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
    lab.querySelector("input").addEventListener("change", () => { state.disclose = v; renderNameField(); updateNext(); });
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
    inp.addEventListener("input", () => { state.name = inp.value; updateNext(); });
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
    content: box, prev: "keywords", nextLabel: "제출하기",
    onNext: () => {
      entries.unshift({
        region: state.region, state: state.stateId, text: state.text,
        keywords: [...state.keywords],
        name: state.disclose === "익명" ? "익명" : state.name.trim(),
        _new: true,
      });
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
   들어오고(index.html CSS), 글자가 올라온다. */
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
  btn.onclick = () => {
    if(window.BottleScene && entries[0]) entries[0].snapshot = window.BottleScene.capture();
    state.step = "archive"; render();
  };
  bottom.appendChild(btn);
  const again = h("button", "res-again", "다시 한 문장 남기기");
  again.type = "button";
  again.onclick = restart;
  bottom.appendChild(again);
  d.appendChild(bottom);

  const show = () => requestAnimationFrame(() => { top.classList.add("show"); bottom.classList.add("show"); });
  if(window.BottleScene) window.BottleScene.revealBottle(show);
  else show();
  return d;
}

function restart(){
  state = { ...FRESH_STATE(), filterState: state.filterState, filterRegion: state.filterRegion };
  render();
}

function renderArchive(){
  const d = h("div", "archive-screen");
  d.innerHTML = `<div class="archive-header">
      <h2>머무름의 지도</h2>
      <p>지금까지 ${entries.length}개의 문장이 쌓였습니다</p>
    </div>`;

  const filterRow = h("div", "filter-row");
  const filters = [{ id: "all", label: "전체" }, ...STATES.map(s => ({ id: s.id, label: s.label }))];
  filters.forEach(f => {
    const chip = h("div", "filter-chip" + (state.filterState === f.id ? " active" : ""), f.label);
    chip.onclick = () => { state.filterState = f.id; render(); };
    filterRow.appendChild(chip);
  });
  d.appendChild(filterRow);

  const regionWrap = h("div", "region-select");
  const sel = document.createElement("select");
  sel.innerHTML = `<option value="all">전체 지역</option>` + REGIONS.map(r => `<option value="${r}" ${state.filterRegion === r ? "selected" : ""}>${r}</option>`).join("");
  sel.value = state.filterRegion;
  sel.onchange = () => { state.filterRegion = sel.value; render(); };
  regionWrap.appendChild(sel);
  d.appendChild(regionWrap);

  const filtered = entries.filter(e =>
    (state.filterState === "all" || e.state === state.filterState) &&
    (state.filterRegion === "all" || e.region === state.filterRegion)
  );

  const wall = h("div", "wall");
  if(filtered.length === 0){
    wall.appendChild(h("div", "empty-note", "아직 이 조건에 맞는 기록이 없습니다."));
  } else {
    filtered.forEach((e, i) => {
      const c = h("div", "wall-card" + (e._new ? " new-card" : ""));
      c.style.animationDelay = (i * 0.05) + "s";
      c.innerHTML = `
        ${e.snapshot ? `<img class="snap-thumb" src="${e.snapshot}" alt="내가 만든 병 속 풍경">` : ""}
        <div class="top-meta"><span>${e.region}</span><span class="state-tag">${stateLabel(e.state)}</span></div>
        <div class="txt">"${e.text}"</div>
        <div class="kw-row">${e.keywords.map(k => `<span class="kw">${k}</span>`).join("")}</div>
        <div class="by${(e.name && e.name !== "익명") ? " named" : ""}">— ${e.name || "익명"}</div>
      `;
      wall.appendChild(c);
    });
  }
  d.appendChild(wall);

  const again = h("button", "restart-btn", "다시 한 문장 남기기");
  again.onclick = restart;
  d.appendChild(again);
  return d;
}

render();
