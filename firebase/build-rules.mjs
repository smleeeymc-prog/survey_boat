/* =============================================================================
 * build-rules.mjs — firestore.rules 를 분류값·기록 스키마에서 생성한다.
 *
 * 왜 손으로 쓰지 않나: 규칙은 JS를 import 할 수 없다. 손으로 적으면 지역·상태·키워드
 * 목록의 세 번째 사본이 되고, survey-taxonomy.js 에 지역이나 키워드 하나를 더하는 순간
 * 그 값으로 낸 제출이 전부 permission-denied 로 **조용히** 거절된다(설문 화면은 멀쩡하다).
 * 그래서 규칙은 이 스크립트가 만들고, 생성본을 커밋하고, 둘이 어긋나면 --check 가 실패한다.
 *
 * 사용법 (레포 루트 또는 firebase/ 어디서든):
 *   node firebase/build-rules.mjs           → firebase/firestore.rules 다시 쓰기
 *   node firebase/build-rules.mjs --check   → 다르면 exit 1 (고치지 않음)
 *
 * 읽는 것: statistics/shared/survey-taxonomy.js · record-schema.js (클래식 스크립트 — vm 으로 평가)
 *          statistics/shared/db-config.js (ES 모듈 — 컬렉션 이름)
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.resolve(HERE, "..", "statistics", "shared");
const OUT = path.join(HERE, "firestore.rules");

/**
 * survey-taxonomy.js → record-schema.js 를 브라우저처럼 한 전역에 평가해 둘 다 꺼낸다.
 * inThisRealm: 테스트용. 따로 떼어 낸 vm 컨텍스트에서 만든 배열은 Array.prototype 이 달라서
 * Firestore SDK가 "custom Array object"로 거절한다. 테스트는 기록을 SDK로 보내므로 지금
 * 전역에 평가한다(생성기는 값만 읽으니 격리된 컨텍스트가 낫다).
 */
export function loadShared({ inThisRealm = false } = {}) {
  const files = ["survey-taxonomy.js", "record-schema.js"];
  if (inThisRealm) {
    for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(SHARED, f), "utf8"), { filename: f });
    return { taxonomy: globalThis.SURVEY_TAXONOMY, schema: globalThis.RECORD_SCHEMA };
  }
  const ctx = vm.createContext({ crypto: globalThis.crypto });
  ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(SHARED, f), "utf8"), ctx, { filename: f });
  // var 전역은 컨텍스트 객체의 속성이 된다
  return { taxonomy: ctx.SURVEY_TAXONOMY, schema: ctx.RECORD_SCHEMA };
}

/** 규칙 문자열 리터럴. 분류값은 한글이라 그대로 넣되 따옴표·역슬래시만 막는다. */
const lit = (s) => {
  if (/["\\\n]/.test(s)) throw new Error(`[rules] 규칙에 넣을 수 없는 글자: ${JSON.stringify(s)}`);
  return `"${s}"`;
};
const list = (arr) => `[${arr.map(lit).join(", ")}]`;

export async function buildRules() {
  const { schema: S } = loadShared();
  const { COLLECTIONS: COL } = await import(pathToFileURL(path.join(SHARED, "db-config.js")).href);
  const T = S.THUMB;
  const newFields = S.FIELDS;
  const typeAlt = T.TYPES.join("|");

  return `rules_version = '2';

// =============================================================================
// 생성 파일 — 손으로 고치지 말 것. firebase/build-rules.mjs 가
// statistics/shared/survey-taxonomy.js · record-schema.js · db-config.js 에서 만든다.
// 분류값을 바꿨으면:  node firebase/build-rules.mjs  → 커밋 → 배포(HANDOFF.md 13장).
// 배포를 빠뜨리면 새 값으로 낸 제출이 전부 거절된다.
//
// 요지
//   ${COL.records}  읽기: moderation_status == "${S.STATUS.PUBLIC}" 인 문서만 누구나 (쿼리에도 같은 where가 있어야 한다)
//            생성: 로그인(익명 포함) + 필드·타입·값 범위 전부 + 서버 시각 + 공개 상태 고정
//            수정·삭제: 금지 — 운영자는 콘솔에서 moderation_status 를 "${S.STATUS.HIDDEN}" 으로 (콘솔은 규칙을 우회한다)
//   ${COL.thumbs}   읽기: 짝이 되는 기록이 공개일 때만 / 생성: 기록이 먼저 있어야 / 수정·삭제 금지
//   그 밖의 경로는 전부 거부
//
// 글자 수(size)는 UTF-16 코드 단위 — JS .length, textarea maxLength 와 같다.
// trim()은 ASCII 공백만 깎는다 — 설문이 JS trim 으로 먼저 깎아 보낸다.
// =============================================================================

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function isPublic(data) {
      return data.moderation_status == ${lit(S.STATUS.PUBLIC)};
    }

    // 앞뒤 공백 없음 + 공백으로만 된 글도 아님(전각 공백·줄바꿈 포함)
    function cleanText(s, maxLen) {
      return s is string
        && s.size() >= 1 && s.size() <= maxLen
        && s == s.trim()
        && !s.matches('(?s)[\\\\s\\\\pZ]*');
    }

    function validRecord(id, d) {
      return d.keys().hasOnly(${list(newFields)})
        && d.keys().hasAll(${list(newFields)})
        && d.record_id == id
        && id.matches('^[A-Za-z0-9]{${S.ID_LENGTH}}$')
        && d.created_at == request.time
        && d.region in ${list(S.REGIONS)}
        && d.state in ${list(S.STATE_IDS)}
        && d.share in ${list(S.SHARE_IDS)}
        && cleanText(d.text, ${S.TEXT_MAX})
        && d.keywords is list
        && d.keywords.size() <= ${S.KEYWORDS_MAX}
        && d.keywords.toSet().size() == d.keywords.size()
        && d.keywords.hasOnly(${list(S.KEYWORDS)})
        && cleanText(d.display_name, ${S.NAME_MAX})
        && d.consent_public == true
        && d.consent_archive == true
        && d.moderation_status == ${lit(S.CREATE_STATUS)}
        && d.schema_version == ${S.SCHEMA_VERSION};
    }

    match /${COL.records}/{id} {
      // 없는 문서의 get은 허용한다 — 설문이 재전송 전에 "이미 들어갔나"를 확인할 때
      // 없는 문서가 permission-denied 로 돌아오면 숨김 처리된 문서와 구별할 수 없다.
      allow get: if resource == null || isPublic(resource.data);
      allow list: if isPublic(resource.data);
      allow create: if signedIn() && validRecord(id, request.resource.data);
      allow update, delete: if false;
    }

    match /${COL.thumbs}/{id} {
      allow get: if isPublic(get(/databases/$(database)/documents/${COL.records}/$(id)).data);
      allow list: if false;
      allow create: if signedIn()
        && exists(/databases/$(database)/documents/${COL.records}/$(id))
        && request.resource.data.keys().hasOnly(${list(T.FIELDS)})
        && request.resource.data.keys().hasAll(${list(T.FIELDS)})
        && request.resource.data.record_id == id
        && request.resource.data.created_at == request.time
        && request.resource.data.data is string
        && request.resource.data.data.size() <= ${T.MAX_CHARS}
        && request.resource.data.data.matches('^data:image/(${typeAlt});base64,[A-Za-z0-9+/=]+$');
      allow update, delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;
}

// 직접 실행했을 때만 쓴다 (테스트가 buildRules 를 import 해 대조한다)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const want = await buildRules();
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (want !== have) {
      console.error("[rules] firestore.rules 가 survey-taxonomy.js · record-schema.js 와 어긋난다.\n" +
        "        node firebase/build-rules.mjs 로 다시 생성하고 커밋·배포할 것.");
      process.exit(1);
    }
    console.log("[rules] firestore.rules 가 분류값·스키마와 일치한다");
  } else {
    fs.writeFileSync(OUT, want);
    console.log(`[rules] ${path.relative(process.cwd(), OUT)} ${want === have ? "(변화 없음)" : "갱신"}`);
  }
}
