/* ===========================================================
   viewport-guard.js — 키보드가 닫힌 뒤 화면이 밀린 채로 남는 것을 막는다 (클래식 스크립트)

   [버그 10-11] "키워드 고르는 페이지부터 터치 영역이 어긋나 있다."
   Ⅲ 문장에서 글을 쓰면 휴대폰 키보드가 올라오며 브라우저가 화면(보이는 창, visualViewport)을 위로 민다.
   그 상태에서 "다음"을 누르면 입력칸이 화면째 사라지고 키보드가 닫히는데, iOS 사파리는 밀어 둔 화면을
   제자리로 돌려놓지 않는 일이 있다. 질문 단계는 판·표시줄이 전부 position:fixed 라, 그림은 제자리에
   그려지는데 손가락이 닿는 자리는 밀린 만큼 어긋난다 — 다음 단계(Ⅳ 나눔 다이얼은 판이 커서 티가 덜 나고)
   Ⅴ 키워드처럼 작은 버튼에서 드러난다.

   하는 일
     · 단계를 바꾸기 전에 입력칸의 포커스를 먼저 놓는다(release) — 키보드가 정상적으로 닫히게
     · 키보드가 닫히는 순간(visualViewport resize · focusout)과 그 뒤 몇 번, 질문 단계면 화면을 맨 위로 되돌린다(settle)
   전역 ViewportGuard — survey.js 의 render() 가 부른다.
=========================================================== */

const ViewportGuard = (() => {
  let isLocked = () => false;
  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(button|checkbox|radio|range|submit)$/i.test(a.type)));
  };

  // 이 페이지에서 키보드가 한 번이라도 떴나 — 그 뒤로는 재 보지 않고 늘 되돌린다.
  // [10-12 2차] iOS 는 밀린 창을 되돌려 놓지 않은 채 스크롤 값은 0으로 알려 주는 일이 있어(재는 값이 거짓말) 재서 건너뛰면 못 고친다.
  let keyboardUsed = false;

  /**
   * 밀린 화면을 맨 위로. 입력 중(키보드가 떠 있음)이면 건드리지 않는다 — 브라우저가 입력칸을 보여주려고 민 것이다.
   * [10-12 2차] 질문 단계는 html.lock(높이 100% · overflow hidden — 10-07 색 패널 버그 때 넣었다)이라 scrollTo 가 먹지 않았다.
   * [10-14 3차] 사용자가 "텍스트 입력 후부터" 밀린다고 정확히 짚었다 — 잠금을 잠깐 푸는 것으로도 안 됐다(문서가 화면보다 길지 않으면
   * 스크롤이 아예 일어나지 않는다). 잠금에서 overflow:hidden 을 빼고(survey.css html.lock), 여기서 1px 스크롤했다 되돌린다.
   */
  function settle(){
    if(!isLocked() || typing()) return;
    const vv = window.visualViewport;
    if(vv && vv.scale > 1.01) return;   // 확대해서 보는 중(접근성 확대)이면 그쪽이 맞다
    const html = document.documentElement, body = document.body;
    const off = (window.scrollY || 0) + (html.scrollTop || 0) + (body.scrollTop || 0) + (vv ? vv.offsetTop : 0);
    if(!keyboardUsed && off < 0.5) return;
    // [10-14 3차] iOS 는 키보드가 닫힌 뒤 고정된 판의 터치 자리를 "스크롤이 한 번 일어나야" 되맞춘다. 질문 단계 문서는 화면 높이에 딱 맞아
    // 스크롤할 거리가 없으니, 잠깐 1px 길게 만들어 1px 내렸다 되돌린다(사용자가 살짝 스크롤한 것과 같은 효과). 한 작업 안이라 화면은 안 움직인다.
    // 같은 작업 안에서 1 → 0 을 하면 브라우저가 합쳐 버려 스크롤이 안 일어난다 — 되돌리기는 다음 프레임에(고정된 판은 안 움직인다)
    if(nudging) return;
    nudging = true;
    const prev = body.style.minHeight;
    body.style.minHeight = "calc(100dvh + 2px)";
    void body.offsetHeight;
    window.scrollTo(0, 1);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      html.scrollTop = 0;
      body.scrollTop = 0;
      body.style.minHeight = prev;
      nudging = false;
    });
  }
  let nudging = false;

  /** 키보드가 닫히는 애니메이션(약 0.3초) 동안과 끝난 뒤까지 몇 번 */
  function settleSoon(){
    settle();
    requestAnimationFrame(settle);
    for(const ms of [120, 350, 700]) setTimeout(settle, ms);
  }

  /** 단계를 바꾸기 전에 — 사라질 입력칸이 포커스를 쥔 채 지워지면 키보드가 비정상으로 닫힌다 */
  function release(){
    if(typing()) document.activeElement.blur();
  }

  /** @param {() => boolean} locked 지금이 질문 단계(화면에 묶인 페이지)인가 */
  function install(locked){
    isLocked = locked;
    document.addEventListener("focusin", () => { if(typing()) keyboardUsed = true; });
    document.addEventListener("focusout", settleSoon);
    if(window.visualViewport){
      window.visualViewport.addEventListener("resize", settleSoon);
      window.visualViewport.addEventListener("scroll", () => { if(!typing()) settleSoon(); });
    }
  }

  return { install, release, settle, settleSoon };
})();
