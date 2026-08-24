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
// [판단] Scene.glb를 statistics/ 안에 복사하지 않고 루트 것을 상대경로로 참조한다.
//   · 모델을 다시 구우면 온보딩 씬과 지도가 저절로 같이 갱신된다 (진실의 출처가 하나)
//   · 345KB짜리를 레포에 두 벌 두면 diff가 매번 이진 파일로 부풀어 오른다
//   · 같은 오리진(GitHub Pages)이라 상대경로 fetch에 CORS 문제가 없다
// 대신 "루트 경로에 의존한다"는 사실이 코드에 드러나야 하므로 여기 한 곳에만 적는다.
export const MODEL_URL = "../assets/Scene.glb";

// 원본: SHIP_FORWARD_OFFSET — 블렌더에서 뽑은 Ship의 정면이 코드가 가정하는 +X와 달라서
// 모델을 한 번만 돌려두는 보정값. 지도에서는 이 회전을 지오메트리에 구워버리므로
// 인스턴스 행렬에는 "진짜 헤딩"만 들어간다.
export const SHIP_FORWARD_OFFSET = Math.PI;

// 원본: 흘수(배가 물에 잠기는 깊이). 배 크기에 비례해서 같이 곱해야 잠기는 비율이 유지된다.
export const SHIP_DRAFT = 0.17;

// 지도 전용: 배 크기. 온보딩은 3.38(배 1척이 주인공)이지만, 지도는 배 수십 척과
// 넓은 바다를 한 화면에 담아야 하므로 절반 이하로 줄인다. 파도 파장(2.2/1.3/0.8)은
// 월드 값이라 그대로이므로, 배가 작아지는 만큼 상대적으로 너울이 커 보인다 —
// "넓은 바다"를 만드는 게 목적이라 오히려 원하는 방향이다.
export const FLEET_SHIP_SCALE = 1.5;

// ── 파도 (원본 그대로) ───────────────────────────────────────────────────────
// 셰이더 gerstnerSum과 JS waveHeightAt이 이 표 하나를 같이 본다. 한 글자라도
// 어긋나면 배가 수면에서 뜨거나 잠긴다 (원본 주석).
export const GERSTNER_WAVES = [
  { dirX: 1.0, dirZ: 0.15, wavelength: 2.2, ampBase: 0.05, speed: 1.1 },
  { dirX: 0.5, dirZ: -0.85, wavelength: 1.3, ampBase: 0.03, speed: 1.6 },
  { dirX: -0.7, dirZ: 0.4, wavelength: 0.8, ampBase: 0.018, speed: 2.1 },
];

// 원본: float32 정밀도 보호용 랩 도메인.
// 위상은 k*(dirX*x + dirZ*z) 이므로 축별 "유효 파장"은 wavelength/dir 이다.
// 온보딩은 배가 +X로만 나아가서 X축 공배수만 확인하면 됐지만, 지도는 카메라가
// XZ 평면 위를 자유롭게 흐르므로 Z축도 공배수여야 한다. 다행히 1144는 둘 다 맞는다:
//   X: 1144/(2.2/1.00)=520, 1144/(1.3/0.50)=440, 1144/(0.8/0.70)=1001
//   Z: 1144/(2.2/0.15)=78,  1144/(1.3/0.85)=748, 1144/(0.8/0.40)=572
// 전부 정수 → 랩 순간 위상이 정확히 2π의 배수만큼 옮겨가 화면엔 아무 티도 안 난다.
// (selfcheck.js가 매 로드마다 이걸 다시 검산한다)
export const WAVE_WRAP_DOMAIN = 1144;

// ── 시간대 팔레트 (원본 그대로) ───────────────────────────────────────────────
// 지도는 전시장 대형 화면이라 기본값을 night로 둔다(시안 스크린샷이 어두운 화면).
// ?time=day|afternoon|evening|night 로 바꿀 수 있다.
export const TIME_OF_DAY = {
  day: {
    sky: ["#3fa9d6", "#8fd6e8", "#bfe9ef", "#e9f7f2"],
    fog: 0xbfe9ef,
    ocean: 0x2fb3e6, skyRefl: 0xeafaff, exposure: 1.18,
    sun: 0xfff7e2, sunI: 1.05, sunPos: [2.5, 3.5, 2.0],
    rim: 0xbfe7ef, rimI: 0.30, amb: 0xffffff, ambI: 0.80,
    spec: 0xfffcf2, specI: 3.0,
  },
  afternoon: {
    sky: ["#5fb0dd", "#9fd0e4", "#ffd9a6", "#ffeed2"],
    fog: 0xe8e0d4,
    ocean: 0x2f9fd4, skyRefl: 0xfff0d6, exposure: 1.22,
    sun: 0xffdca6, sunI: 1.15, sunPos: [2.8, 2.4, 1.4],
    rim: 0xd8dcea, rimI: 0.30, amb: 0xfff2df, ambI: 0.88,
    spec: 0xffe6bc, specI: 3.0,
  },
  evening: {
    sky: ["#2f6f92", "#e2705f", "#a05a8c", "#ffc184"],
    fog: 0xdb9a86,
    ocean: 0x2a6d99, skyRefl: 0xffd2a6, exposure: 1.26,
    sun: 0xffa063, sunI: 1.30, sunPos: [3.0, 1.8, -1.4],
    rim: 0x8f7fb8, rimI: 0.42, amb: 0xffd9bd, ambI: 0.82,
    spec: 0xffb070, specI: 3.2,
  },
  night: {
    sky: ["#0a1128", "#16264a", "#22345e", "#33507e"],
    fog: 0x2a3f68,
    ocean: 0x16345f, skyRefl: 0xa8c2ee, exposure: 1.12,
    sun: 0xb6cdff, sunI: 0.60, sunPos: [-2.0, 3.0, 1.2],
    rim: 0x6d84c4, rimI: 0.38, amb: 0x9fb3dc, ambI: 0.68,
    spec: 0xaecbff, specI: 1.6,
  },
};
export const DEFAULT_TIME_KEY = "night";

// 원본: 3D 전체 밝기 배수. 조명 세기와 물 노출에 함께 곱해진다.
export const SCENE_BRIGHTNESS = 1.1;

// ── 설문 분류값 (원본 그대로 — 온보딩과 어긋나면 집계가 갈라진다) ──────────────
export const REGIONS = ["아산", "천안", "기타 충남", "충남 밖", "비공개"];

export const STATES = [
  { id: "stay", label: "머무르는 중" },
  { id: "leaving", label: "떠날 준비 중" },
  { id: "between", label: "오가는 중" },
  { id: "returned", label: "돌아온 사람" },
  { id: "unsure", label: "아직 모르겠음" },
];
export const STATE_LABEL = Object.fromEntries(STATES.map((s) => [s.id, s.label]));

export const KEYWORDS = ["일", "관계", "가족", "창작", "익숙함", "주거", "불안", "자유", "소속감", "우연"];

// 원본: 키워드 → 색상. 온보딩에서 "첫 번째 키워드 = 캐빈 색"이었던 규칙을 지도에서도
// 그대로 쓴다. 인스턴스 컬러는 캐빈 그룹에만 먹인다 (fleet.js 참고).
export const KEYWORD_COLOR = {
  "일": 0x6b7fd7, "관계": 0xe28ea0, "가족": 0xe0a868, "창작": 0xd4b896,
  "익숙함": 0xb89a6a, "주거": 0x8fae8b, "불안": 0x8a6a9a, "자유": 0x7ec8d9,
  "소속감": 0xd6c08a, "우연": 0xaaaaaa,
};
// 키워드 없는 배의 캐빈 색 (원본 cabinMat 기본값)
export const CABIN_BASE_COLOR = 0xf3e6cf;

// 원본: 키워드 → 갑판 소품. 지도에서도 같은 매핑을 쓰되, 소품마다 InstancedMesh를
// 따로 만들고 "그 키워드를 고른 배"에만 인스턴스를 배정한다.
export const KEYWORD_PROP = { "자유": "gull", "관계": "tube" };

// ── 지도 전용: 바다·함대·카메라 ───────────────────────────────────────────────
// 배가 흩어지는 원반의 반지름. 카메라는 이 안을 천천히 순회한다.
export const SEA_RADIUS = 34;
// 배끼리 최소 이 만큼 떨어뜨린다 (푸아송 디스크). 배 길이 약 1.5의 3배 이상이라
// 카메라가 어디서 봐도 실루엣이 서로 먹히지 않는다.
export const FLEET_MIN_GAP = 4.6;
// 화면에 동시에 띄우는 배의 상한. 넘으면 오래된 기록부터 자리를 물려준다.
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

// 카메라 — 전시장 무조작 자동 순회.
// [결정] 미결정 사항 "자동 순회 vs 관람객 조작"은 자동 순회로 확정한다.
//   기획서의 "기록을 발견하는 공간"은 관람객이 조작해서 찾는 게 아니라 가만히 있어도
//   화면이 계속 다른 자리를 보여주는 쪽에 가깝고, 전시장 TV/프로젝터에는 입력장치가 없다.
//   디버깅·리허설용으로 ?interactive=1 을 주면 드래그 오빗이 열린다.
export const CAM_FOV = 50;
// 높이와 시선 거리가 화면 구성을 결정한다. 패널이 위 절반을 덮으므로, 열려 있는
// 아래 절반(화면 50~100%)에 배가 오도록 잡았다. 세로 화면(FOV 50) 기준 실측:
//   화면 50% = 카메라 앞 30, 화면 75% = 15, 화면 아래끝 = 9.6 (전부 수면 위 거리)
//   수평선 = 화면 위에서 15% (패널 뒤에 묻힌다 — 유리 너머로 하늘이 비친다)
// 즉 카메라에서 10~30 사이에 있는 배가 "잘 보이는 배"다. 이 창을 벗어나면 화면
// 아래로 빠지거나(가까움) 안개에 잠긴다(멀리).
export const CAM_HEIGHT = 8;           // 수면 위 높이
export const CAM_LOOK_AHEAD = 30;      // 카메라 앞 이 거리의 수면이 화면 세로 중앙
// 카메라는 바다 중심을 도는 궤도에 있고, 시선은 언제나 바다 안쪽을 향한다.
// 밖을 보게 두면(예: 진행 방향을 그대로 보게 하면) 화면이 빈 바다만 비추는 구간이 생긴다.
// 세 주기를 서로 안 떨어지는 값으로 두어, 같은 그림이 돌아오기까지 아주 오래 걸리게 했다.
export const CAM_ORBIT_SEC = 240;      // 궤도를 한 바퀴 도는 시간
export const CAM_BREATH_SEC = 167;     // 궤도 반지름이 안팎으로 오가는 주기
export const CAM_SWING_SEC = 97;       // 시선이 안쪽에서 좌우로 흔들리는 주기
export const CAM_ORBIT_MIN = 10;       // 궤도 반지름의 최소/최대 (바다 반경 34 안에서 움직인다)
export const CAM_ORBIT_MAX = 34;
export const CAM_SWING = 0.55;         // 시선이 정중앙에서 벗어나는 최대 각(라디안)
export const CAM_PITCH_BOB = 0.9;      // 순회하며 위아래로 아주 조금 오르내리는 진폭

// 새 기록 연출 (기획서: 5~8초간 크게 제시된 뒤 기존 기록들 사이로 이동)
export const ARRIVAL_HOLD_SEC = 6.5;   // 크게 제시하는 시간
export const ARRIVAL_TRAVEL_SEC = 2.6; // 자기 자리로 미끄러져 가는 시간
export const ARRIVAL_SCALE = 2.6;      // 제시 중 배 크기 배수

// 패널 통계 자동 전환 주기(초) — 원본 UI 시안과 같은 5.2초
export const STAT_ROTATE_SEC = 5.2;
