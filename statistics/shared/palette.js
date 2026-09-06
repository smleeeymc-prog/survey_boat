/* =============================================================================
 * palette.js — 시간대 팔레트와 분류값 색. 두 화면이 이 파일 하나를 같이 본다.
 *
 * 온보딩 씬(../../index.html)과 머무름의 지도(../js/config.js)가 둘 다 여기서 읽는다.
 * 예전에는 각자 자기 파일에 같은 표를 적어 두고 있었다 — 한쪽 색만 고치면 두 화면이
 * 소리 없이 갈라졌다. 이제 고칠 곳은 여기 하나뿐이다.
 *
 * 이 파일이 statistics/shared/ 에 있는 이유는 ocean-core.js 머리말 참고
 * (Vercel의 Root Directory 밖 파일은 지도 배포에 안 들어간다). 옮기지 말 것.
 * ========================================================================== */

export const INITIAL_TIME_KEY = "day";

export const TIME_OF_DAY = {
  day: {
    sky: ["#3fa9d6", "#8fd6e8", "#bfe9ef", "#e9f7f2"],
    fog: 0xbfe9ef,
    ocean: 0x2fb3e6, skyRefl: 0xeafaff, exposure: 1.18,
    sun: 0xfff7e2, sunI: 1.05, sunPos: [2.5, 3.5, 2.0],
    rim: 0xbfe7ef, rimI: 0.30, amb: 0xffffff, ambI: 0.80,
    spec: 0xfffcf2, specI: 3.0, shadow: 0.0,
  },
  afternoon: {
    sky: ["#5fb0dd", "#9fd0e4", "#ffd9a6", "#ffeed2"],
    // 노란기를 뺐다. R-B 차이가 52였는데 20으로 줄여 따뜻함만 남기고 누렇게 뜨는 걸 없앴다.
    // 반사색(spec)은 그대로 둔다 — 물에 비치는 빛은 노랗게 남아야 오후처럼 보인다.
    fog: 0xe8e0d4,
    ocean: 0x2f9fd4, skyRefl: 0xfff0d6, exposure: 1.22,
    sun: 0xffdca6, sunI: 1.15, sunPos: [2.8, 2.4, 1.4],
    rim: 0xd8dcea, rimI: 0.30, amb: 0xfff2df, ambI: 0.88,
    spec: 0xffe6bc, specI: 3.0, shadow: 0.0,
  },
  evening: {
    // 위는 청록, 가운데는 노을, 지평선 바로 위에 자주색 띠, 바닥은 따뜻한 주황
    sky: ["#2f6f92", "#e2705f", "#a05a8c", "#ffc184"],
    fog: 0xdb9a86,
    ocean: 0x2a6d99, skyRefl: 0xffd2a6, exposure: 1.26,
    sun: 0xffa063, sunI: 1.30, sunPos: [3.0, 1.8, -1.4],
    rim: 0x8f7fb8, rimI: 0.42, amb: 0xffd9bd, ambI: 0.82,
    spec: 0xffb070, specI: 3.2, shadow: 0.34,
  },
  night: {
    sky: ["#0a1128", "#16264a", "#22345e", "#33507e"],
    fog: 0x2a3f68,
    ocean: 0x16345f, skyRefl: 0xa8c2ee, exposure: 1.12,
    sun: 0xb6cdff, sunI: 0.60, sunPos: [-2.0, 3.0, 1.2],
    rim: 0x6d84c4, rimI: 0.38, amb: 0x9fb3dc, ambI: 0.68,
    spec: 0xaecbff, specI: 1.6, shadow: 0.0,
  },
};

// 3D 전체 밝기 배수. 조명 세기와 물 노출에 함께 곱해진다.
export const SCENE_BRIGHTNESS = 1.1;

export const REGION_SAND = {
  "아산": 0xd9b98c,
  "천안": 0xe0a868,
  "기타 충남": 0xc9b880,
  "충남 밖": 0x9aa7b0,
  "비공개": 0xb0aca4,
};

// 키워드 → 색상 (선택 1번째: 캐빈 색, 2번째: 깃발 색)
export const KEYWORD_COLOR = {
  "일": 0x6b7fd7, "관계": 0xe28ea0, "가족": 0xe0a868, "창작": 0xd4b896,
  "익숙함": 0xb89a6a, "주거": 0x8fae8b, "불안": 0x8a6a9a, "자유": 0x7ec8d9,
  "소속감": 0xd6c08a, "우연": 0xaaaaaa,
};

// 키워드 → 갑판에 붙는 소품. 여기 없는 키워드는 아무것도 안 붙는다.
// 고른 키워드 중 하나라도 해당되면 그 소품이 붙는다(둘 다 붙을 수도, 아무것도 안 붙을 수도 있음).
// 소품을 더 늘리거나 매핑을 바꾸려면 여기만 고치면 된다.
export const KEYWORD_PROP = {
  "자유": "gull",
  "관계": "tube",
};
