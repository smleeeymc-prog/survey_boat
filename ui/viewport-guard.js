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

  /** 밀린 화면을 맨 위로. 입력 중(키보드가 떠 있음)이면 건드리지 않는다 — 브라우저가 입력칸을 보여주려고 민 것이다 */
  function settle(){
    if(!isLocked() || typing()) return;
    const vv = window.visualViewport;
    if(vv && vv.scale > 1.01) return;   // 확대해서 보는 중(접근성 확대)이면 그쪽이 맞다
    const off = (window.scrollY || 0) + (document.documentElement.scrollTop || 0) + (document.body.scrollTop || 0) + (vv ? vv.offsetTop : 0);
    if(off < 0.5) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

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
    document.addEventListener("focusout", settleSoon);
    if(window.visualViewport){
      window.visualViewport.addEventListener("resize", settleSoon);
      window.visualViewport.addEventListener("scroll", () => { if(!typing()) settleSoon(); });
    }
  }

  return { install, release, settle, settleSoon };
})();
