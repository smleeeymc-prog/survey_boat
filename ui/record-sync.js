/* ===========================================================
   설문 ↔ DB 연결 (클래식 스크립트, 전역 RecordSync)

   ui/survey.js 는 이 파일의 다섯 가지만 부른다:
     submit(entry)          제출 — 기다리지 않는다. 결과 화면은 전송 성공과 무관하게 뜬다
     attachThumb(entry)     결과 화면에서 찍은 병 스냅샷을 작은 WebP로 줄여 기록 뒤에 올린다
     archiveView(local, rerender)  아카이브에 보여 줄 목록 {list, total, loading, failed}
     lazyThumb(card, entry) 남의 카드가 화면에 들어올 때만 썸네일을 받아 붙인다
     safeImage(url)         <img src>에 넣어도 되는 data URL만 통과

   ── 무엇을 쓰나 ────────────────────────────────────────────────
   DB 설정(statistics/shared/db-config.js)이 비었거나 ?mock=1 이면 아무것도 안 한다 —
   설문은 예전처럼 survey.js 의 목업 entries 로 돈다. 설정이 있으면 Firestore
   (statistics/shared/record-store.js). 그 모듈과 SDK는 동적 import 라, 목업일 땐 받지 않는다.
   클래식 스크립트의 import() 기준 주소가 브라우저마다 달라서 절대 URL로 부른다.

   ── 전시장 와이파이 ────────────────────────────────────────────
   제출한 기록은 보내기 **전에** localStorage 대기열(yeogi.queue.v1)에 먼저 적는다.
   SDK 로드·익명 로그인·쓰기 중 어디서 끊겨도 문장은 남고, 다음 로드와 online 이벤트 때
   다시 보낸다. id를 미리 정해 두므로 재전송은 같은 문서를 향하고, 이미 들어간 문서면
   record-store 가 "already"로 끝낸다(중복 없음 — firebase/test/record-store.test.mjs).

   설문 안의 기록 객체({region, state, share, text, keywords, name, snapshot, _new, id})와
   DB 기록(record_id, display_name …) 사이의 변환은 toRecord / toEntry 두 함수에서만 한다.
   아카이브 그리는 코드가 필드 이름 때문에 바뀌지 않게.
=========================================================== */

var RecordSync = (function () {
  const S = RECORD_SCHEMA;
  const QUEUE_KEY = "yeogi.queue.v1";
  const SEND_WAIT_MS = 15000;    // 이만큼 답이 없으면 대기열에 둔 채 넘어간다(SDK는 계속 시도한다)
  const ARCHIVE_LIMIT = 100;     // 아카이브는 최신 100건만 — 참여자마다 전부 읽으면 무료 한도를 넘는다
  const ARCHIVE_TTL_MS = 60000;  // 아카이브를 다시 열면 1분 지난 목록만 새로 받는다
  const CARD_BG = "#FFFDF9";     // JPEG로 물러날 때 투명 부분을 칠할 색 = 아카이브 카드 바탕(ui/survey.css .ar-card)
  const url = (p) => new URL(p, document.baseURI).href;

  let mode = null;               // "mock" | "emu" | "live" — 설정 파일을 읽기 전엔 null
  let modePromise = null;
  let storePromise = null;
  const sessionMine = [];        // 이 페이지에서 제출한 것 (최신이 앞)

  /* ── 모드·모듈 ─────────────────────────────────────────── */
  // 설정 파일을 읽을 때까지 기다린다. 실패해도 거절하지 않고 5초마다 다시 읽는다 —
  // 거절하면 그 사이에 낸 제출이 대기열에 오르지 못하고 사라진다.
  function ready() {
    if (!modePromise) modePromise = new Promise((resolve) => {
      const attempt = () => import(url("statistics/shared/db-config.js")).then((cfg) => {
        mode = cfg.dbMode();
        if (mode !== "mock") {
          console.info(`[record-sync] Firestore (${mode})`);
          // SDK를 페이지를 열 때 미리 받는다. 제출하는 순간에 처음 받다가 와이파이가 끊기면
          // 브라우저가 그 실패를 기억해서 이 페이지에선 다시 받을 수 없다(record-store.js).
          // 미리 받아 두면 그 뒤에 끊겨도 SDK가 스스로 다시 붙어 쓰기를 마친다.
          store().then((m) => m.dbConnect()).catch(() => {});
          if (readQueue().length) flush();
          window.addEventListener("online", () => flush());
        }
        resolve(mode);
      }, (err) => {
        console.warn("[record-sync] 설정 파일을 못 읽었다 — 5초 뒤 다시", err);
        setTimeout(attempt, 5000);
      });
      attempt();
    });
    return modePromise;
  }
  function store() {
    if (!storePromise) {
      storePromise = import(url("statistics/shared/record-store.js"));
      storePromise.catch(() => { storePromise = null; });
    }
    return storePromise;
  }

  /* ── 어댑터: 설문 기록 ↔ DB 기록 ───────────────────────── */
  function toRecord(e) {
    return S.makeRecord({ id: e.id, region: e.region, state: e.state, share: e.share,
      text: e.text, keywords: e.keywords, name: e.name });
  }
  function toEntry(r, extra) {
    return Object.assign({
      id: r.record_id, region: r.region, state: r.state, share: r.share, text: r.text,
      keywords: Array.isArray(r.keywords) ? r.keywords.slice() : [], name: r.display_name,
    }, extra);
  }

  /* ── 대기열 (localStorage) ─────────────────────────────── */
  // 항목: { id, record: 보낼 기록|null(보냄), thumb: data URL|null, queued_at }
  // localStorage 를 아예 못 쓰면(저장 공간 0 등) 이 페이지 동안만 메모리에 둔다 — 적어도 지금 보내기는 된다.
  let memQueue = null;
  function readQueue() {
    if (memQueue) return JSON.parse(JSON.stringify(memQueue));
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(q) ? q.filter((x) => x && typeof x.id === "string") : [];
    } catch (_) { return []; }
  }
  function writeQueue(q) {
    const live = q.filter((x) => x.record || x.thumb);
    if (memQueue) { memQueue = live; return false; }
    for (let tries = 0; tries < 2; tries++) {
      try {
        if (live.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(live));
        else localStorage.removeItem(QUEUE_KEY);
        return true;
      } catch (_) {
        // 용량 초과면 썸네일부터 버린다 — 문장이 먼저다
        for (const x of live) x.thumb = null;
      }
    }
    console.warn("[record-sync] 대기열을 저장하지 못했다(저장 공간·사생활 보호 모드) — 이 페이지를 닫으면 재전송할 수 없다");
    memQueue = live;
    return false;
  }
  function editQueue(id, fn) {
    const q = readQueue();
    let item = q.find((x) => x.id === id);
    if (!item) { item = { id, record: null, thumb: null, queued_at: new Date().toISOString() }; q.push(item); }
    fn(item);
    writeQueue(q);
  }
  const sent = new Set();        // 이 페이지에서 서버 확인을 받은 record_id

  /* ── 보내기 ─────────────────────────────────────────────── */
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) =>
    setTimeout(() => rej(Object.assign(new Error("응답 없음"), { code: "timeout" })), ms))]);
  // 다시 보내도 소용없는 거절 — 대기열엔 남기되(규칙을 배포하면 풀릴 수 있다) 이번 차례는 넘어간다
  const isRejected = (err) => err && ["invalid-record", "invalid-thumb", "permission-denied", "invalid-argument"].includes(err.code);

  let flushing = null, flushAgain = false;
  function flush() {
    if (flushing) { flushAgain = true; return flushing; }
    flushing = flushOnce()
      .catch((err) => console.warn("[record-sync] 보내지 못했다 — 대기열에 남겨 두고 다음 로드·온라인 때 다시", err))
      .finally(() => {
        flushing = null;
        if (flushAgain) { flushAgain = false; flush(); }
      });
    return flushing;
  }

  async function flushOnce() {
    if ((await ready()) === "mock") return;
    const m = await store();
    for (const { id } of readQueue()) {
      const item = readQueue().find((x) => x.id === id);   // 기다리는 사이 attachThumb 가 고쳤을 수 있다
      if (!item) continue;
      if (item.record) {
        const p = m.dbSubmitRecord(item.record);
        // 시간 안에 답이 없어도 SDK의 쓰기는 살아 있다(온라인이 되면 끝난다). 그때 지우고 썸네일을 잇는다.
        let late = false;
        p.then(() => { if (late) { sent.add(id); editQueue(id, (x) => { x.record = null; }); flush(); } }, () => {});
        try {
          await timeout(p, SEND_WAIT_MS);
        } catch (err) {
          if (err && err.code === "timeout") late = true;
          if (isRejected(err)) {
            console.error(`[record-sync] 기록 ${id} 이 거절됐다 — 대기열에 남겨 둔다. ` +
              "분류값을 바꾸고 규칙을 다시 배포하지 않았는지 볼 것(HANDOFF.md 13장)", err);
            continue;
          }
          throw err;   // 네트워크 — 뒤의 것도 안 될 테니 이번 차례는 여기서 멈춘다
        }
        sent.add(id);
        editQueue(id, (x) => { x.record = null; });
      }
      const thumb = (readQueue().find((x) => x.id === id) || {}).thumb;
      if (thumb) {
        try {
          await timeout(m.dbSubmitThumb(id, thumb), SEND_WAIT_MS);
        } catch (err) {
          if (!isRejected(err)) throw err;
          console.warn(`[record-sync] 썸네일 ${id} 이 거절돼 버린다 (기록은 남았다)`, err);
        }
        editQueue(id, (x) => { x.thumb = null; });
      }
    }
  }

  /** 제출. 결과 화면을 막지 않는다 — 대기열에 적고 보내는 건 뒤에서. */
  function submit(entry) {
    sessionMine.unshift(entry);
    ready().then((md) => {
      if (md === "mock") return;
      const record = toRecord(entry);
      const problems = S.checkNew(record);
      if (problems.length) console.error("[record-sync] 규칙에 맞지 않는 기록 — 설문 UI와 record-schema.js 가 어긋났다:", problems);
      editQueue(entry.id, (x) => { x.record = record; });
      flush();
    });
  }

  /* ── 병 스냅샷 → 썸네일 ────────────────────────────────── */
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("스냅샷을 읽지 못함"));
      img.src = src;
    });
  }
  /**
   * capture()의 PNG(병만 잘라 낸 투명 PNG)를 긴 변 360px WebP로. WebP 인코딩을 못 하는
   * 브라우저(iOS 사파리 일부)는 toDataURL 이 조용히 PNG를 돌려준다 — 그러면 JPEG로 간다.
   * JPEG엔 투명이 없어 빈 곳이 검게 되므로 카드 바탕색을 먼저 깐다.
   */
  async function encodeThumb(png) {
    const img = await loadImage(png);
    const T = S.THUMB;
    for (const edge of [T.MAX_EDGE, Math.round(T.MAX_EDGE * 0.7), Math.round(T.MAX_EDGE * 0.5)]) {
      const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL("image/webp", T.QUALITY);
      if (!out.startsWith("data:image/webp")) {
        g.globalCompositeOperation = "destination-over";
        g.fillStyle = CARD_BG;
        g.fillRect(0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", T.QUALITY);
      }
      if (out.length <= T.MAX_CHARS) return out;
    }
    return null;
  }

  /** 결과 화면에서 스냅샷을 찍은 직후에 부른다. 기록이 서버에 들어간 뒤에 올라간다(flush 순서). */
  function attachThumb(entry) {
    if (!entry || !entry.snapshot || !entry.id) return;
    ready().then(async (md) => {
      if (md === "mock") return;
      let data = null;
      try { data = await encodeThumb(entry.snapshot); } catch (err) { console.warn("[record-sync] 썸네일 인코딩 실패", err); }
      if (!data) return;
      editQueue(entry.id, (x) => { x.thumb = data; });
      flush();
    });
  }

  /* ── 아카이브 ───────────────────────────────────────────── */
  const archive = { records: null, total: 0, at: 0, loading: null, failed: false };

  function refresh(rerender) {
    if (archive.loading) return;
    archive.loading = store()
      .then((m) => Promise.all([m.dbFetchRecent(ARCHIVE_LIMIT), m.dbCountPublic()]))
      .then(([records, total]) => {
        archive.records = records; archive.total = total; archive.failed = false;
      })
      .catch((err) => {
        console.warn("[record-sync] 아카이브를 받지 못했다", err);
        archive.failed = true;
      })
      .finally(() => { archive.at = Date.now(); archive.loading = null; rerender(); });
  }

  /**
   * 아카이브에 보여 줄 것. 목업이면 survey.js 의 목록 그대로.
   * DB면 [이 페이지에서 쓴 것 + 대기열에 남은 내 것] + 서버의 최신 100건 (record_id로 중복 제거).
   * 방금 쓴 내 문장은 전송 여부와 상관없이 맨 앞에 있다 — 안 보이면 불안하다.
   * rerender: 목록이 도착하면 다시 그리게 부를 함수.
   */
  function archiveView(localEntries, rerender) {
    if (mode === null) {
      ready().then(rerender);
      return { list: [], total: 0, loading: true, failed: false };
    }
    if (mode === "mock") return { list: localEntries, total: localEntries.length, loading: false, failed: false };

    if (!archive.loading && (Date.now() - archive.at > ARCHIVE_TTL_MS || (!archive.records && !archive.failed))) refresh(rerender);

    const front = [], seen = new Set();
    for (const e of sessionMine) if (!seen.has(e.id)) { seen.add(e.id); front.push(e); }
    for (const x of readQueue()) {
      if (x.record && !seen.has(x.id)) {
        seen.add(x.id);
        front.push(toEntry(x.record, { snapshot: S.safeImage(x.thumb) || undefined }));
      }
    }
    const remote = (archive.records || []).map((r) => toEntry(r, { _remote: true }));
    const remoteIds = new Set(remote.map((e) => e.id));
    // 서버 개수에 아직 안 잡힌 내 것(보내는 중)만 더한다
    const pending = front.filter((e) => !remoteIds.has(e.id) && !sent.has(e.id)).length;
    const list = front.concat(remote.filter((e) => !seen.has(e.id)));
    const loading = !archive.records && !archive.failed;
    return { list, total: archive.records ? archive.total + pending : list.length, loading, failed: archive.failed && !archive.records };
  }

  /* ── 남의 카드 썸네일: 화면에 들어올 때만 받는다 ─────────── */
  const thumbs = new Map();      // record_id → Promise<data URL | null>
  let io = null;
  function getThumb(id) {
    if (!thumbs.has(id)) {
      const p = store().then((m) => m.dbGetThumb(id));
      thumbs.set(id, p);
      p.catch(() => thumbs.delete(id));   // 네트워크 실패는 다음에 다시
    }
    return thumbs.get(id);
  }
  function putSnap(card, src) {
    const safe = S.safeImage(src);
    if (!safe || !card.isConnected || card.querySelector(".ar-snap")) return;
    const img = document.createElement("img");
    img.className = "ar-snap";
    img.alt = "";
    img.src = safe;
    card.appendChild(img);          // .ar-snap 은 absolute 라 자리 순서는 상관없다
    card.classList.add("has-snap");
  }
  function lazyThumb(card, entry) {
    if (mode === null || mode === "mock" || !entry._remote || !("IntersectionObserver" in window)) return;
    io = io || new IntersectionObserver((seen) => {
      for (const s of seen) {
        if (!s.isIntersecting && s.target.isConnected) continue;
        io.unobserve(s.target);
        if (!s.target.isConnected) continue;
        getThumb(s.target.dataset.recordId).then((u) => { if (u) putSnap(s.target, u); }, () => {});
      }
    }, { rootMargin: "200px 0px" });
    card.dataset.recordId = entry.id;
    io.observe(card);
  }

  ready();      // 설정은 미리 읽어 둔다 — 남은 대기열이 있으면 여기서 다시 보낸다

  return {
    submit, attachThumb, archiveView, lazyThumb, newId: S.newId, safeImage: S.safeImage,
    ready,   // → "mock" | "emu" | "live" — 목업일 때만 배지를 띄우는 데 쓴다(survey.js)
    // 검증·콘솔용
    get mode() { return mode; }, readQueue, flush, toRecord, toEntry,
  };
})();
