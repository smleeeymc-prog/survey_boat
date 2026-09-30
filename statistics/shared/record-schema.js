/* =============================================================================
 * record-schema.js — 참여 기록 한 건의 모양. 설문·지도·보안 규칙이 이 파일 하나를 본다.
 *
 * 같은 규칙이 세 곳에 필요하다.
 *   · 설문(ui/record-sync.js)  보내기 전에 검사 — 규칙에 거절될 기록을 큐에 쌓아 두면
 *                              온라인이 될 때마다 영원히 재전송하다 거절당한다
 *   · 지도(js/store.js)        받은 기록 검사 — style.js 가 모르는 키워드로 배를 만들지 않게
 *   · 보안 규칙(firebase/firestore.rules)  서버가 최종 판정. build-rules.mjs 가 이 파일과
 *                              survey-taxonomy.js 를 읽어 규칙을 생성한다
 * 세 벌로 적으면 글자 수 하나만 어긋나도 "화면은 받는데 서버가 거절"이 조용히 생긴다.
 *
 * survey-taxonomy.js 와 같은 이유로 클래식 스크립트(var 전역)다 — 클래식인 설문 UI,
 * 모듈인 지도, node 규칙 생성기가 모두 읽을 수 있어야 한다. 반드시 survey-taxonomy.js
 * 다음에 불러올 것(분류값을 여기서 읽는다).
 *
 * ── 글자 수를 세는 단위 ────────────────────────────────────────────────────
 * 규칙의 string.size()는 UTF-16 코드 단위를 센다(에뮬레이터 실측: "가나다"=3, "😀"=2,
 * "👨‍👩‍👧"=8). JS의 .length, textarea maxLength 와 같은 단위다. 그래서 여기서도 .length 를
 * 쓴다 — 스프레드([...s].length)로 세면 이모지가 든 80자가 여기선 통과하고 서버에서 거절된다.
 *
 * ── 필드 (문서 id = record_id) ─────────────────────────────────────────────
 *   record_id          string   문서 id와 같다. 클라이언트가 미리 발급(재전송해도 같은 문서)
 *   created_at         서버 시각. 저장소 계약(지도)으로 넘길 때는 ISO 문자열
 *   region / state / share   분류값 중 하나 (share는 시간대 재현용 — 지도는 무시해도 된다)
 *   text               trim 후 1~80자
 *   keywords           0~2개, 중복 없음
 *   display_name       "익명" 또는 1~12자
 *   consent_public / consent_archive   true (설문의 동의 체크 하나가 둘 다 켠다)
 *   moderation_status  생성 시 "public". "hidden"은 운영자가 콘솔에서만
 *   schema_version     1
 * ========================================================================== */

var RECORD_SCHEMA = (function (T) {
  if (!T) throw new Error("record-schema.js: survey-taxonomy.js 를 먼저 불러올 것");

  const TEXT_MAX = 80;
  const NAME_MAX = 12;
  const KEYWORDS_MAX = 2;
  const ANON_NAME = "익명";
  const SCHEMA_VERSION = 1;
  // 검토 정책: 즉시 공개 + 운영자가 콘솔에서 "hidden"으로 바꿔 숨김.
  // 승인제로 바꾸려면 CREATE_STATUS 를 "pending" 으로 바꾸고 규칙을 다시 생성·배포한다.
  const STATUS = { PUBLIC: "public", HIDDEN: "hidden", PENDING: "pending" };
  const CREATE_STATUS = STATUS.PUBLIC;

  const FIELDS = [
    "record_id", "created_at", "region", "state", "share", "text", "keywords",
    "display_name", "consent_public", "consent_archive", "moderation_status", "schema_version",
  ];
  // Firestore 자동 id와 같은 모양(영숫자 20자). 규칙이 문서 id를 이 모양으로 묶는다.
  const ID_LENGTH = 20;
  const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const ID_RE = /^[A-Za-z0-9]{20}$/;
  // 지도가 받는 기록의 id는 조금 느슨하게 본다 — 목업 기록(mock-12)도 계약을 지켜야 해서
  const ANY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  // 병 스냅샷(아카이브 카드 이미지). 레코드와 따로 둔다 — 지도는 레코드 전부를 받으므로
  // 이미지를 레코드에 넣으면 지도 로딩이 수 MB가 된다.
  const THUMB = {
    FIELDS: ["record_id", "data", "created_at"],
    // iOS 사파리는 canvas WebP 인코딩을 못 할 수 있어 JPEG도 받는다
    TYPES: ["webp", "jpeg"],
    MAX_CHARS: 150000,      // base64 글자 수 상한 (약 110KB). 360px WebP는 보통 10~20KB
    MAX_EDGE: 360,          // 긴 변
    QUALITY: 0.8,
  };
  // 화면에 <img src>로 넣어도 되는 이미지 — data URL, base64, 이 세 형식만
  const SAFE_IMAGE_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

  const REGIONS = T.REGIONS;
  const STATE_IDS = T.STATES.map((s) => s.id);
  const SHARE_IDS = T.SHARES.map((s) => s.id);
  const KEYWORDS = T.KEYWORDS;

  const isStr = (v) => typeof v === "string";
  // JS trim 은 규칙의 trim(ASCII 공백만)보다 넓다. 여기서 먼저 깎아 보내면 규칙의
  // "text == text.trim()" 은 항상 참이 된다.
  const clean = (v) => (isStr(v) ? v.trim() : "");

  /** Firestore 자동 id와 같은 모양의 id. SDK 없이도(오프라인) 만들 수 있어야 한다. */
  function newId() {
    const out = [];
    const c = globalThis.crypto;
    const buf = new Uint8Array(ID_LENGTH * 2);
    while (out.length < ID_LENGTH) {
      if (c && c.getRandomValues) c.getRandomValues(buf);
      else for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
      // 248 = 62 × 4 — 그 이상을 버려야 글자마다 확률이 같다
      for (let i = 0; i < buf.length && out.length < ID_LENGTH; i++) {
        if (buf[i] < 248) out.push(ID_CHARS[buf[i] % 62]);
      }
    }
    return out.join("");
  }

  /** 값 영역 검사 — 새 기록과 받은 기록이 같이 쓴다. 문제 목록(빈 배열이면 통과). */
  function checkValues(r, problems) {
    if (!REGIONS.includes(r.region)) problems.push("region");
    if (!STATE_IDS.includes(r.state)) problems.push("state");
    if (!SHARE_IDS.includes(r.share)) problems.push("share");
    if (!isStr(r.text) || r.text.length < 1 || r.text.length > TEXT_MAX || r.text !== r.text.trim()) problems.push("text");
    const kw = r.keywords;
    if (!Array.isArray(kw) || kw.length > KEYWORDS_MAX || new Set(kw).size !== kw.length ||
        !kw.every((k) => KEYWORDS.includes(k))) problems.push("keywords");
    const n = r.display_name;
    if (!isStr(n) || n.length < 1 || n.length > NAME_MAX || n !== n.trim()) problems.push("display_name");
    if (r.consent_public !== true) problems.push("consent_public");
    if (r.consent_archive !== true) problems.push("consent_archive");
    if (r.schema_version !== SCHEMA_VERSION) problems.push("schema_version");
    return problems;
  }

  /**
   * 보내기 직전의 새 기록 검사 (created_at 은 서버 시각이라 보지 않는다).
   * 규칙과 같은 판정이어야 한다 — 여기서 통과한 기록이 서버에서 거절되면 버그다.
   */
  function checkNew(r) {
    const problems = [];
    if (!r || typeof r !== "object") return ["record"];
    const extra = Object.keys(r).filter((k) => !FIELDS.includes(k) && k !== "created_at");
    if (extra.length) problems.push("unknown:" + extra.join(","));
    if (!isStr(r.record_id) || !ID_RE.test(r.record_id)) problems.push("record_id");
    if (r.moderation_status !== CREATE_STATUS) problems.push("moderation_status");
    return checkValues(r, problems);
  }

  /**
   * 저장소 계약(onReady/onInsert)으로 화면에 넘기는 기록 검사.
   * 공개된 것만 받으므로 moderation_status 는 "public" 이어야 한다.
   */
  function checkRecord(r) {
    const problems = [];
    if (!r || typeof r !== "object") return ["record"];
    if (!isStr(r.record_id) || !ANY_ID_RE.test(r.record_id)) problems.push("record_id");
    if (!isStr(r.created_at) || !Number.isFinite(Date.parse(r.created_at))) problems.push("created_at");
    if (r.moderation_status !== STATUS.PUBLIC) problems.push("moderation_status");
    return checkValues(r, problems);
  }

  /**
   * 설문 답을 새 기록으로. 값 정리(trim·중복 제거·빈 이름 → 익명)는 여기 한 곳에서만 한다.
   * created_at 은 넣지 않는다 — 보내는 쪽(record-store)이 서버 시각을 붙인다.
   */
  function makeRecord({ id, region, state, share, text, keywords, name }) {
    const kws = [];
    for (const k of Array.isArray(keywords) ? keywords : []) if (!kws.includes(k)) kws.push(k);
    const nm = clean(name);
    return {
      record_id: id,
      region, state, share,
      text: clean(text),
      keywords: kws,
      display_name: nm || ANON_NAME,
      consent_public: true,
      consent_archive: true,
      moderation_status: CREATE_STATUS,
      schema_version: SCHEMA_VERSION,
    };
  }

  /** <img src>에 넣어도 되는 값이면 그대로, 아니면 null. 남이 올린 문자열을 화면에 넣기 전에 반드시 거친다. */
  function safeImage(url) {
    // 길이는 보지 않는다 — 내 기록의 스냅샷은 원본 PNG라 고해상도 폰에서 수백 KB가 된다.
    // 막을 것은 형식(따옴표·javascript: 등이 끼어들 틈)이지 크기가 아니다.
    return isStr(url) && SAFE_IMAGE_RE.test(url) ? url : null;
  }

  return {
    TEXT_MAX, NAME_MAX, KEYWORDS_MAX, ANON_NAME, SCHEMA_VERSION, STATUS, CREATE_STATUS,
    FIELDS, ID_LENGTH, ID_RE, THUMB,
    REGIONS, STATE_IDS, SHARE_IDS, KEYWORDS,
    newId, checkNew, checkRecord, makeRecord, safeImage,
  };
})(globalThis.SURVEY_TAXONOMY);
