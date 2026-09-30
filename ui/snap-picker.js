/* =============================================================================
 * snap-picker.js — 세로 스냅 선택지. 지역·상태 질문이 쓴다. (클래식 스크립트, 전역 함수)
 *
 * 가운데 줄이 고른 것이고 위아래 한 칸씩이 흐리게 비친다(시안 B′). 굴려서 고른다.
 *
 * 스크롤·관성·스냅은 전부 네이티브에 맡긴다. 직접 구현하면 모바일 관성이 죽는다.
 * 이 함수는 두 가지만 한다.
 *   1) 스크롤을 "읽어서" 지금 가운데 있는 항목을 알아낸다 (절대 되쓰지 않는다)
 *   2) 마우스 드래그를 스크롤로 옮겨준다 (데스크톱은 스크롤바를 끌 수 없으므로)
 * 예전에 났던 문제들은 네이티브와 싸우게 짜서 생긴 것이었다.
 *   · 놓는 순간 브라우저 스냅과 우리 보정이 동시에 당겼다 → 보정을 없앤다
 *   · 빠르게 밀면 여러 칸을 건너뛰었다 → CSS scroll-snap-stop:always 로 한 칸씩
 * 첫·마지막 항목도 가운데 올 수 있게 양끝에 빈 칸(.picker-pad)을 둔다. margin으로 주면
 * 브라우저가 마지막 항목의 바깥 여백을 스크롤 범위에 넣지 않아 끝까지 못 간다.
 *
 * (예전의 가로 피커는 나눔 질문이 다이얼(share-dial.js)로 바뀌면서 뺐다.)
 *
 * items  : [{id, label}]
 * value  : 처음 고를 id
 * onPick : 고른 것이 바뀔 때마다 id로 부른다
 * ========================================================================== */

function snapPicker(items, value, onPick){
  const wrap=document.createElement("div"); wrap.className="picker";
  const track=document.createElement("div"); track.className="picker-track";
  track.setAttribute("role","listbox");
  const list=document.createElement("div"); list.className="picker-list";
  track.appendChild(list); wrap.appendChild(track);

  const pad=()=>{ const p=document.createElement("div"); p.className="picker-pad"; return p; };
  list.appendChild(pad());
  let moved=false;
  const els=items.map((it,i)=>{
    const el=document.createElement("div"); el.className="picker-item";
    el.setAttribute("role","option");
    el.innerHTML=`<span class="lab">${it.label}</span>`;
    el.addEventListener("click",()=>{ if(!moved) scrollToIndex(i, true); });
    list.appendChild(el); return el;
  });
  list.appendChild(pad());

  /** 트랙 가운데에 가장 가까운 항목. 스크롤을 읽기만 한다. */
  function nearest(){
    const mid = track.scrollTop + track.clientHeight/2;
    let best=0, bd=Infinity;
    for(let i=0;i<els.length;i++){
      const d = Math.abs(els[i].offsetTop + els[i].offsetHeight/2 - mid);
      if(d<bd){ bd=d; best=i; }
    }
    return best;
  }

  function mark(){
    const n=nearest();
    for(let i=0;i<els.length;i++){
      els[i].classList.toggle("active", i===n);
      els[i].setAttribute("aria-selected", i===n ? "true" : "false");
      els[i].dataset.dist = String(Math.min(2, Math.abs(i-n)));
    }
    if(items[n] && items[n].id!==value){ value=items[n].id; onPick(value); }
  }

  /** 프로그램에서 옮기는 유일한 경로 — 클릭과 최초 배치뿐이다. */
  function scrollToIndex(i, smooth){
    const el=els[Math.max(0,Math.min(els.length-1,i))];
    track.scrollTo({ top: el.offsetTop - (track.clientHeight-el.offsetHeight)/2, behavior: smooth?"smooth":"auto" });
  }

  let raf=null;
  track.addEventListener("scroll",()=>{
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(mark);
  }, {passive:true});

  // ── 마우스/펜 드래그만 처리한다. 터치는 네이티브가 훨씬 잘한다. ──
  let down=false, startY=0, startScroll=0;
  track.addEventListener("pointerdown",(e)=>{
    if(e.pointerType === "touch") return;
    down=true; moved=false; startY=e.clientY; startScroll=track.scrollTop;
    track.classList.add("dragging");           // 드래그 중에만 스냅을 끈다
    try{ track.setPointerCapture(e.pointerId); }catch(_e){}
  });
  track.addEventListener("pointermove",(e)=>{
    if(!down) return;
    const d = startY - e.clientY;
    if(Math.abs(d)>3) moved=true;
    track.scrollTop = startScroll + d;
  });
  // 놓을 때 하는 일은 클래스를 떼는 것뿐. 여기서 scrollTo를 또 부르면 브라우저 스냅과 겹쳐 두 칸씩 튄다.
  const release=()=>{ if(!down) return; down=false; track.classList.remove("dragging"); };
  track.addEventListener("pointerup",release);
  track.addEventListener("pointercancel",release);
  // 드래그로 끝난 클릭이 항목 선택으로 이어지지 않게 한다
  track.addEventListener("click",(e)=>{ if(moved){ e.stopPropagation(); e.preventDefault(); } }, true);

  // 폰트·레이아웃이 확정된 뒤에 재야 위치가 정확하다. 두 프레임 뒤에 한 번 더 잡는다.
  const settle=()=>{ scrollToIndex(Math.max(0, items.findIndex(it=>it.id===value)), false); mark(); };
  requestAnimationFrame(()=>{ settle(); requestAnimationFrame(settle); });
  return wrap;
}
