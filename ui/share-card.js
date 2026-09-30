/* =============================================================================
 * share-card.js — 결과 화면의 "이미지 저장"·"공유하기". (클래식 스크립트, 전역 함수)
 *
 * 병 스냅샷(BottleScene.capture(), 병만 잘라 낸 투명 PNG) + 내 문장으로 세로 카드 한 장
 * (1080×1350, 인스타그램 세로 비율)을 그린다. 결과 화면과 같은 톤 — 크림 바탕, 가장자리
 * 비네트, 고운바탕 명조.
 *
 * 공유는 파일을 보낼 수 있으면 이미지째(폰 공유 시트 — iOS는 여기서 "이미지 저장"도 된다),
 * 안 되면 글·주소만, 그것도 안 되면 주소를 복사한다.
 * iOS 사파리는 공유를 "누른 그 순간"에만 허락한다 — 카드를 누른 뒤에 그리면(글꼴·그림 로딩을
 * 기다리는 사이) 거절될 수 있어서, 결과 화면이 뜨면 미리 그려 둔다(prepareShareCard).
 * ========================================================================== */

const CARD = { w: 1080, h: 1350 };
const CARD_TITLE = "그래도, 여기 살고 있습니다";

/** 결과 화면이 뜨면 부른다. 같은 기록에는 한 번만 그리고, 이후엔 그려 둔 것을 돌려준다. */
function prepareShareCard(info){
  if(!prepareShareCard.cache || prepareShareCard.cache.key !== info.key){
    prepareShareCard.cache = { key: info.key, promise: drawShareCard(info) };
  }
  return prepareShareCard.cache.promise;
}

async function drawShareCard({ snapshot, sentence, meta }){
  const serif = '"Gowun Batang", "Nanum Myeongjo", serif';
  const sans = '"IBM Plex Sans KR", "Apple SD Gothic Neo", sans-serif';
  // 캔버스는 글꼴이 아직 안 받아졌으면 기본 글꼴로 그린다 — 쓸 글꼴을 먼저 받아 둔다
  try {
    await Promise.all([
      document.fonts.load(`700 54px ${serif}`, sentence),
      document.fonts.load(`400 40px ${serif}`, CARD_TITLE),
      document.fonts.load(`500 28px ${sans}`, meta),
    ]);
  } catch (_e) { /* 글꼴이 없어도 카드는 그린다 */ }

  const c = document.createElement("canvas");
  c.width = CARD.w; c.height = CARD.h;
  const g = c.getContext("2d");
  g.fillStyle = "#F7F4EF";
  g.fillRect(0, 0, CARD.w, CARD.h);
  // 결과 화면과 같은 비네트 (tokens.css --scene-vignette)
  const vg = g.createRadialGradient(CARD.w / 2, CARD.h * 0.45, CARD.h * 0.3, CARD.w / 2, CARD.h * 0.45, CARD.h * 0.78);
  vg.addColorStop(0, "rgba(10,12,24,0)");
  vg.addColorStop(1, "rgba(10,12,24,0.22)");
  g.fillStyle = vg;
  g.fillRect(0, 0, CARD.w, CARD.h);

  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#0B2A35";
  g.font = `400 40px ${serif}`;
  g.fillText(CARD_TITLE, CARD.w / 2, 120);
  g.fillStyle = "#B8955E";
  g.fillRect(CARD.w / 2 - 22, 150, 44, 3);

  // 병 — 위쪽 상자(가로 920 × 세로 500)에 비율을 지켜 넣는다
  if(snapshot){
    try {
      const img = new Image();
      img.src = snapshot;
      await img.decode();
      const bw = 920, bh = 500, top = 190;
      const k = Math.min(bw / img.width, bh / img.height);
      const w = img.width * k, hgt = img.height * k;
      g.drawImage(img, (CARD.w - w) / 2, top + (bh - hgt) / 2, w, hgt);
    } catch (_e) { /* 스냅샷이 없으면 글만 */ }
  }

  let y = 780;
  g.fillStyle = "#7A5B32";
  g.font = `600 26px ${sans}`;
  spaced(g, "MY SENTENCE · 지금 이곳", CARD.w / 2, y, 6);

  // 문장 — 가운데 정렬, 폭 860에서 줄바꿈. 길면 글자를 한 단계 줄인다
  const text = `“${sentence}”`;
  let size = 54, lines = wrap(g, text, 860, `700 ${size}px ${serif}`);
  if(lines.length > 4){ size = 44; lines = wrap(g, text, 880, `700 ${size}px ${serif}`); }
  g.fillStyle = "#1B1A17";
  g.font = `700 ${size}px ${serif}`;
  y += 40 + size;
  for(const line of lines){ g.fillText(line, CARD.w / 2, y); y += size * 1.55; }

  g.fillStyle = "#4A4640";
  g.font = `500 28px ${sans}`;
  g.fillText(meta, CARD.w / 2, y + 16);

  const d = new Date();
  g.fillStyle = "#7A5B32";
  g.font = `500 24px ${sans}`;
  spaced(g, `입다 · 2026 다원예술 프로젝트 · ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`, CARD.w / 2, CARD.h - 70, 3);

  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

/** 자간을 준 가운데 정렬 한 줄 (ctx.letterSpacing이 없는 브라우저도 있어 직접 늘어놓는다) */
function spaced(g, text, cx, y, gap){
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const align = g.textAlign;
  g.textAlign = "left";
  chars.forEach((ch, i) => { g.fillText(ch, x, y); x += widths[i] + gap; });
  g.textAlign = align;
}

/** 띄어쓰기 단위로 줄을 나눈다(한국어 문장이 어절 중간에서 끊기지 않게). 한 어절이 폭보다 길면 글자로 자른다. */
function wrap(g, text, max, font){
  g.font = font;
  const out = [];
  let line = "";
  for(const word of text.split(" ")){
    const cand = line ? line + " " + word : word;
    if(g.measureText(cand).width <= max){ line = cand; continue; }
    if(line) out.push(line);
    if(g.measureText(word).width <= max){ line = word; continue; }
    line = "";
    for(const ch of word){
      if(g.measureText(line + ch).width > max){ out.push(line); line = ch; }
      else line += ch;
    }
  }
  if(line) out.push(line);
  return out;
}

// 파일 이름은 로마자로 — 한글 이름은 일부 브라우저가 버리고 "download"로 저장했다(헤드리스 크로미움 실측)
const CARD_FILE = "yeogi-salgo-itseumnida.png";

/** 이미지 저장 — 파일로 내려받는다(안드로이드·PC는 다운로드, iOS는 파일 앱의 다운로드). */
async function saveShareCard(info){
  const blob = await prepareShareCard(info);
  if(!blob){ showToast("이미지를 만들지 못했어요"); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = CARD_FILE;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast("이미지를 저장했어요");
}

/** 공유하기 — 이미지째 → 글·주소만 → 주소 복사 순으로 되는 것을 쓴다. */
async function shareShareCard(info){
  const url = location.origin + location.pathname;
  const text = `“${info.sentence}” — ${CARD_TITLE}`;
  const blob = prepareShareCard.cache && prepareShareCard.cache.key === info.key ? await prepareShareCard.cache.promise : null;
  try {
    if(blob && navigator.canShare){
      const file = new File([blob], CARD_FILE, { type: "image/png" });
      if(navigator.canShare({ files: [file] })){
        await navigator.share({ files: [file], title: CARD_TITLE, text: `${text}\n${url}` });
        return;
      }
    }
    if(navigator.share){ await navigator.share({ title: CARD_TITLE, text, url }); return; }
  } catch (e) {
    if(e && e.name === "AbortError") return;   // 사용자가 공유 시트를 닫았다
  }
  try { await navigator.clipboard.writeText(url); showToast("주소를 복사했어요"); }
  catch (_e) { showToast("이 브라우저에서는 공유할 수 없어요"); }
}

/** 화면 아래에 잠깐 떴다 사라지는 한 줄 알림 */
function showToast(msg){
  let el = document.getElementById("toast");
  if(!el){ el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}
