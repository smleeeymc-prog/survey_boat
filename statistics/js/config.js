/* =============================================================================
 * config.js — '머무름의 지도' 공통 상수
 *
 * 여기 있는 값 중 "원본" 표시가 붙은 것은 루트 index.html(온보딩 씬)에서 그대로
 * 옮겨온 값이다. 인수인계 문서 원칙에 따라 3D의 재질·색감·파도 수식은 임의로 바꾸지
 * 않는다 — 이 파일에서 바꿔도 되는 건 "지도 전용" 표시가 붙은 배치/카메라 값뿐이다.
 *
 * 원본을 다시 뽑거나 온보딩 씬의 팔레트를 고치면 이 파일도 같이 맞춰야 한다.
 * (자동으로 따라오지 않는다 — 루트는 단일 HTML이라 import할 수가 없다)
 * ========================================================================== */

// ── 모델 ────────────────────────────────────────────────────────────────────
// 배포 형태에 따라 GLB가 앉는 자리가 다르다. 후보를 순서대로 시도한다(먼저 되는 것 사용).
//
//   ./assets/Scene.glb    statistics/ 를 사이트 루트로 배포할 때 (Vercel 별도 프로젝트)
//   ../assets/Scene.glb   레포 루트를 통째로 서빙할 때 (로컬 python3 -m http.server, GitHub Pages)
//
// 둘 다 두는 이유: 지도를 자기 도메인에 따로 올리려면 statistics/ 밖의 파일을 참조할 수
// 없다(Vercel의 Root Directory가 그 밖을 배포에 포함하지 않는다). 그렇다고 상대경로를
// 하나로 고정하면 다른 한쪽이 죽는다. 후보 두 개면 어느 쪽으로 올리든 그대로 돈다.
//
// statistics/assets/Scene.glb 는 루트 것의 사본이다. 모델을 다시 구우면
// `node statistics/tools/sync-model.mjs` 로 맞춰야 두 화면의 배가 갈라지지 않는다.
export const MODEL_URLS = ["./assets/Scene.glb", "../assets/Scene.glb"];

// 지도 전용: 배 크기. 온보딩은 3.38(배 1척이 주인공)이지만, 지도는 배 수십 척과
// 넓은 바다를 한 화면에 담아야 하므로 절반 이하로 줄인다. 파도 파장(2.2/1.3/0.8)은
// 월드 값이라 그대로이므로, 배가 작아지는 만큼 상대적으로 너울이 커 보인다 —
// "넓은 바다"를 만드는 게 목적이라 오히려 원하는 방향이다.
export const FLEET_SHIP_SCALE = 1.5;

// ── 파도 · 팔레트 · 배 토큰 (공유) ───────────────────────────────────────────
// 아래 값들은 온보딩 씬(../../index.html)과 이 화면이 같이 쓴다. 예전에는 이 파일에
// 옮겨 적어 두고 있었는데, 그러면 한쪽만 고쳤을 때 두 화면이 소리 없이 갈라진다.
// 이제 원본은 statistics/shared/ 안에 하나뿐이고 여기서는 그대로 다시 내보내기만 한다
// — 이 파일을 import 하던 다른 모듈들은 손댈 필요가 없다.
export { GERSTNER_WAVES, WAVE_WRAP_DOMAIN } from "../shared/ocean-core.js";
export { TIME_OF_DAY, SCENE_BRIGHTNESS, KEYWORD_COLOR, KEYWORD_PROP } from "../shared/palette.js";
export { SHIP_FORWARD_OFFSET, SHIP_DRAFT, CABIN_BASE_COLOR } from "../shared/ship-tokens.js";

// 기본 시간대도 온보딩과 같은 값을 쓴다 (설문 페이지가 처음 보여주는 하늘).
// 바다 색을 팔레트에서 떼어내 하나만 바꿀 수는 없다 — 하늘·안개·조명·반사색이 한 세트라
// 바다만 밝은 하늘색으로 바꾸면 남색 하늘 아래 청록 바다가 뜬다.
export { INITIAL_TIME_KEY as DEFAULT_TIME_KEY } from "../shared/palette.js";

// ── 설문 분류값 (공유) ──────────────────────────────────────────────────────
// 온보딩의 설문 UI는 클래식 <script> 안에 있어서 import를 못 쓴다(인라인 onclick
// 핸들러가 전역을 참조한다). 그래서 분류값만 클래식 스크립트로 두고 전역에 얹었다.
// index.html이 모듈보다 앞에서 그 파일을 불러 두므로 여기서는 읽기만 하면 된다.
// (모듈은 defer라 문서에 먼저 나온 클래식 스크립트가 항상 먼저 실행된다)
const TAXONOMY = globalThis.SURVEY_TAXONOMY;
if (!TAXONOMY) {
  throw new Error(
    "[config] shared/survey-taxonomy.js 가 안 실려 있다 — " +
    "index.html에서 모듈보다 앞에 <script src>로 넣어야 한다"
  );
}
export const REGIONS = TAXONOMY.REGIONS;
export const STATES = TAXONOMY.STATES;
export const STATE_LABEL = Object.fromEntries(STATES.map((x) => [x.id, x.label]));
export const KEYWORDS = TAXONOMY.KEYWORDS;

// ── 표현 채널의 출처 ────────────────────────────────────────────────────────
// [시안 단계] 어떤 답변이 배의 무엇을 바꿀지는 아직 확정되지 않았다. 그래서 채널의
// "값을 어디서 얻는가"만 여기서 갈아끼울 수 있게 해 두고, 지금은 난수에서 뽑는다.
//   "random" → 기록마다 record_id를 시드로 고정 난수 (같은 기록이면 언제나 같은 모습)
//   "record" → 실제 답변에서 (지역·상태·키워드 → 채널 매핑은 style.js 한 곳에만 있다)
// 채널을 늘리거나 매핑을 바꿀 때 손대는 파일은 style.js 하나뿐이다.
export const STYLE_SOURCE = "random";

// ── 지도 전용: 흐름·함대 ────────────────────────────────────────────────────
// 배는 한 방향으로 천천히 흐른다. 화면 한쪽 끝에서 나타나 반대쪽으로 빠진다.
// 속도는 "기준 깊이(FLOW_REF_DEPTH)에 있는 배가 화면을 가로지르는 데 걸리는 시간"으로
// 정의한다 — 화면 폭은 기기 화면비마다 다르므로, 실제 속도는 카메라에서 역산한다
// (camera.js의 frameHalfWidthAt / main.js의 flowSpeed 참고).
// 모든 배가 같은 월드 속도로 움직이므로 가까운 배는 40초보다 빨리, 먼 배는 느리게
// 지나간다 — 그게 원근이고, 깊이감이 거기서 나온다. 깊이마다 속도를 달리 주면
// 전부 한 덩어리로 미끄러져서 평면 스크롤처럼 보인다.
export const FLOW_CROSS_SEC = 40;
export const FLOW_REF_DEPTH = 20;      // 카메라 앞 이 거리의 배가 40초에 화면을 건넌다
export const FLOW_DIR = -1;            // 화면에서 왼→오른쪽으로 흐르게 하는 부호

// 배가 사는 띠. 폭을 다 지나면 반대쪽 끝으로 감긴다(토러스).
// 모두 같은 속도라 상대 위치가 절대 안 변하고, 감기는 것도 정확히 폭만큼이라
// 처음 한 번 겹치지 않게 놓으면 영원히 안 겹친다.
// 폭(80)은 가장 먼 배(깊이 48)가 가로 화면(비율 1.6)에서도 화면 밖에서 감기도록 잡았다.
export const FLOW_CORRIDOR_W = 80;
export const FLOW_DEPTH_MIN = 10;      // 이보다 가까우면 화면 아래로 잘려 나간다
export const FLOW_DEPTH_MAX = 48;      // 이보다 멀면 안개에 잠긴다
// 배끼리 최소 이 만큼 떨어뜨린다 (푸아송 디스크). 배 길이 약 1.5의 3배 가까이라
// 어느 각도에서 봐도 실루엣이 서로 먹히지 않는다.
export const FLEET_MIN_GAP = 4.4;
// 띠에 동시에 띄우는 배의 상한. 넘으면 오래된 기록부터 자리를 물려준다.
// (인스턴스 버퍼를 매번 다시 만들지 않으려고 처음부터 이 크기로 잡아 둔다)
export const FLEET_CAPACITY = 80;

// 바다 타일. 온보딩(31.5/71, 셀 0.44)보다 훨씬 넓어야 해서 셀을 0.83으로 키웠다.
// 가장 짧은 파장이 0.8이라 셀 0.83이면 그 파도는 제대로 안 풀리지만, 어차피 플랫
// 셰이딩 로우폴리라 덜 풀린 파도가 "면"으로 보여서 스타일과 충돌하지 않는다.
// 반경(95)은 안개가 바다를 다 지우는 거리(86)보다 커야 한다 — 안 그러면 타일 끝이 드러난다.
export const WATER_TILE_SIZE = 190;
export const WATER_TILE_SEGMENTS = 230;

// 안개와 거리 페이드. 타일 반경(95)보다 확실히 안쪽에서 바다가 다 지워져야
// 타일 경계가 드러나지 않는다. (원본과 같은 장치, 값만 지도 스케일에 맞춤)
// 온보딩보다 안개를 훨씬 멀리 밀었다. 화면 위 절반이 리퀴드 글래스라, 유리 뒤가
// 균일한 안개색 판이면 굴절도 블러도 보일 게 없어서 그냥 어두운 색판이 된다.
// 먼 바다의 결이 유리 너머로 비쳐야 "유리"로 읽힌다.
export const FOG_NEAR = 34;
export const FOG_FAR = 84;
export const WATER_FADE_NEAR = 68;
export const WATER_FADE_FAR = 86;

// ── 카메라 ──────────────────────────────────────────────────────────────────
// [변경] 순회하던 카메라를 세웠다. 배가 한 방향으로 흐르는 연출에서는 카메라까지
// 돌면 "화면 끝에서 등장해 반대쪽으로 퇴장"이라는 규칙이 성립하지 않는다
// (카메라가 도는 동안 흐름 방향이 화면 안에서 계속 바뀐다). 이제 움직이는 건 배고,
// 카메라는 아주 조금 숨쉬기만 한다.
export const CAM_FOV = 50;
// 높이와 시선 거리가 화면 구성을 결정한다. 패널이 위 절반을 덮으므로, 열려 있는
// 아래 절반(화면 50~100%)에 배가 오도록 잡았다. 세로 화면(FOV 50) 기준 실측:
//   화면 50% = 카메라 앞 30, 화면 75% = 15, 화면 아래끝 = 9.6 (전부 수면 위 거리)
//   수평선 = 화면 위에서 15% (패널 뒤에 묻힌다 — 유리 너머로 하늘이 비친다)
export const CAM_HEIGHT = 8;           // 수면 위 높이
export const CAM_LOOK_AHEAD = 30;      // 카메라 앞 이 거리의 수면이 화면 세로 중앙
// 완전히 고정하면 화면이 죽는다. 눈치채지 못할 만큼만 흔든다.
export const CAM_BOB = 0.30;           // 위아래 진폭 (월드 단위)
export const CAM_BOB_SEC = 23;
export const CAM_SWAY = 0.035;         // 좌우 시선 흔들림 (라디안, 약 2도)
export const CAM_SWAY_SEC = 71;

// 새 기록 연출 (기획서: 5~8초간 크게 제시된 뒤 기존 기록들 사이로 이동)
export const ARRIVAL_HOLD_SEC = 6.5;   // 크게 제시하는 시간
// 자기 자리로 물러나는 시간. 이동 거리는 짧지만(가장 가까운 빈 자리를 받는다) 크기가
// 2.6배에서 1배로 줄어드는 구간이라, 짧게 잡으면 "쑥 빨려 들어가는" 것처럼 보인다.
// 다른 배들이 40초에 화면을 건너는 화면에서 혼자 급하게 움직이면 그것만 눈에 띈다.
export const ARRIVAL_TRAVEL_SEC = 5.0;
export const ARRIVAL_SCALE = 2.6;      // 제시 중 배 크기 배수
// 크기는 이동보다 먼저 끝난다. 끝까지 같이 줄이면 "멀어져서 작아지는" 게 아니라
// "작아지면서 날아가는" 걸로 읽힌다. 이동 구간의 앞 65%에서 크기를 다 줄이고,
// 남은 구간은 제 크기로 자리만 잡는다.
export const ARRIVAL_SHRINK_RATIO = 0.65;

// 패널 통계 자동 전환 주기(초) — 원본 UI 시안과 같은 5.2초
export const STAT_ROTATE_SEC = 5.2;
