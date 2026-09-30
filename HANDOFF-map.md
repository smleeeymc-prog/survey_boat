# 지도 세션에 넘기는 것 — 설문 쪽 변경 총정리 (2026-09-25 ~ 09-27)

> 받는 쪽: "머무름의 지도" 세션 (`statistics/` 담당)
> 보내는 쪽: 설문 세션 (`index.html` · `assets/` · `tools/` · `dev/` 담당)
>
> 설문 세션이 모델을 새로 굽고(`scene_baked.glb`), 룩을 사용자와 폰에서 맞춰 고정했다.
> 그중 **지도 화면에 이미 영향이 간 것**과 **지도가 따라와야 두 화면이 같은 작품으로 보이는 것**을
> 한 곳에 모았다. 세부 이력은 `HANDOFF.md` 의 0장·6.12·14장에 있다.
>
> 지도 코드(`statistics/js/*`, `statistics/README.md`)는 **설문 세션이 건드리지 않았다.**
> 바뀐 건 공유 파일(`statistics/shared/*`)과 모델 사본(`statistics/assets/Scene.glb`)뿐이다.

---

## 0. 한눈에

| 무엇 | 지도에 이미 영향이 갔나 | 지도가 할 일 |
|---|---|---|
| 새 GLB (`Scene.glb` 918KB, WebP 아틀라스, `_AO`) | ✓ 이미 이걸 읽는다 — 로드·selfcheck 확인함 | 옛 주석 정리, standalone 크기 확인 (2장) |
| `glb-nodes.js` 노드 이름·`KEYWORD_NODES` | 이름만 늘었다 — 지도 동작은 그대로 | 없음 (소품을 더 붙일 때 참고) |
| `palette.js` `KEYWORD_PROP` 튜브: 관계 → **가족** | ✓ 지도 배의 튜브가 뜨는 키워드가 바뀌었다 | 지도 문구·범례에 '관계=튜브'가 있으면 고칠 것 |
| 키워드는 캐빈 색을 안 바꾼다 (사용자 결정) | ✗ 지도는 아직 `KEYWORD_COLOR`로 캐빈을 칠한다 | **사용자에게 확인** 후 `style.js` (4장) |
| **새** `shared/look-tokens.js` — 조명 비율·AO 세기 | ✗ 지도는 아직 안 읽는다 | 조명 3줄 + 재질 1줄로 연결 (5장) |
| **새** `tokens.css` 의 `--scene-grade` · `--scene-vignette` | ✗ 변수만 생겼다 (지도 화면엔 변화 없음) | 캔버스에 CSS 2줄 (5장) |

---

## 1. 판단 — 연결할까, 값을 베껴 둘까

**결론: 두 화면이 똑같아야 하는 "값"은 `shared/`에 두고 연결한다. "코드"(셰이더·렌더 설정)는 화면마다 따로 쓴다.
설문 `index.html`에서 숫자를 베껴 오지 말 것.**

이유:

1. **베끼면 갈라진다 — 이미 한 번 겪었다.** `shared/`가 생긴 이유가 그거다(파도·팔레트·UI 색이
   두 화면에서 다르게 흘러가서 합쳤다). 룩 숫자는 사용자가 폰에서 보고 또 바꿀 가능성이 제일 큰 값이라
   더 빨리 갈라진다.
2. **`index.html`에서는 import할 수 없다.** 설문은 한 파일짜리 HTML이라, 지도가 "설문 결과에 연결"하려면
   값이 `shared/`에 나와 있어야 한다. 그래서 이번에 **설문이 쓰던 값을 `shared/`로 옮기고 설문도 거기서
   읽게 바꿨다** (값은 그대로 — 조명 세기·반구광 색·거칠기·필터가 옮기기 전과 같게 나오는 것을 확인함).
3. **다만 룩 전부를 공유하면 안 된다.** 설문은 병 속 배 한 척을 가까이서 보고, 지도는 배 수십 척을
   멀리서 인스턴싱해 본다. 광택·테두리 빛·면 색 변주·틸트시프트·부드러운 그림자는 "가까이서 한 척"
   전용이라 지도에 그대로 옮기면 비싸거나 안 보인다. 그래서 **같은 GLB가 같은 색으로 찍히는 데 필요한
   것만** 공유했다.

| 분류 | 항목 | 어디 | 지도 |
|---|---|---|---|
| **연결 (shared)** | 모델 | `statistics/assets/Scene.glb` | 이미 연결됨 |
| | 노드 이름·키워드→요소 | `shared/glb-nodes.js` | 이미 연결됨 |
| | 시간대 팔레트·`KEYWORD_PROP` | `shared/palette.js` | 이미 연결됨 |
| | **조명 비율·톤 매핑·거칠기 상한** | **`shared/look-tokens.js` `SCENE_LOOK` `HEMI`** (새) | 연결할 것 |
| | **구운 AO 세기** | **`shared/look-tokens.js` `AO`** (새) | 선택 (쓰면 이 값으로) |
| | **화면 색보정·비네트** | **`shared/tokens.css` `--scene-grade` `--scene-vignette`** (새) | 연결할 것 |
| **화면마다 따로** | 셰이더 패치 코드 (AO 주입 등) | 각 화면 | 지도가 직접 (5.3 레시피) |
| | 광택·테두리 빛·면 색 변주 | 설문 `index.html` `FX_DEFAULT` | 가져가지 말 것 |
| | 틸트시프트 | 설문 CSS `.tiltBlur` | 가져가지 말 것 |
| | 부드러운 그림자 | 설문 `SOFT_SHADOWS_DEFAULT` | 가져가지 말 것 (지도는 그림자 없음 유지) |
| | 등대 불빛·병 맞춤·줌 | 설문 | 해당 없음 (지도엔 섬·병이 없다) |

`look-tokens.js`는 import가 없는 순수 상수 파일이라 `build-standalone.mjs`의 `SHARED_ORDER`에
한 줄 넣으면 된다(아래 체크리스트).

---

## 2. 에셋 — `scene_baked.glb` 로 교체

### 2.1 흐름

```
assets/scene_baked.glb        ← 블렌더 산출물 (사용자가 올림)
  │  python3 tools/build_scene_glb.py assets/scene_baked.glb assets/Scene.glb --report <폴더>
  ▼
assets/Scene.glb              ← 구운 결과 (굽기 원본은 위 파일)
  │  node statistics/tools/sync-model.mjs
  ▼
statistics/assets/Scene.glb   ← 두 화면이 실제로 읽는 사본
```

- 굽기 도구: `tools/build_scene_glb.py` (Python + numpy + Pillow). 쓰지 않는 노드를 떼고, UV 섬마다
  실제로 쓰는 텍스처만 잘라 WebP **아틀라스 한 장**(1024², 약 50KB)으로 모으고, 정점 AO를 굽는다.
  1,702KB → **918KB**, 재질 7개, 프리미티브 30개.
- 모델을 다시 뽑으면 위 두 줄을 **둘 다** 돌린다. 둘째 줄을 빠뜨리면 두 화면이 옛 배를 쓴다.
  `sync-model.mjs --check` 로 어긋남만 볼 수 있다.

### 2.2 GLB 구조 변화 — 지도에 걸리는 것

| 변화 | 지도 영향 | 비고 |
|---|---|---|
| 텍스처가 WebP 아틀라스 한 장, **`EXT_texture_webp` 필수 확장** | WebP 못 읽는 브라우저에선 텍스처가 빠진다 (현행 모바일은 다 됨) | |
| 재질: `Atlas_Lit`, `Lighthouse_Window`, 배 부품(Cabin·Funnel·Funnel_step·Ship_Body), `Rock` | 배는 그대로 | `Atlas_Unlit` 없어짐 — Cat·Lamp가 밤에도 환하던 문제 |
| **`Ship` 노드에 회전 π·배율 3.38·위치 (0, 0.575, 0)** | 없음 — `fleet.js`가 `rotation.set`·`scale 1`로 덮어쓴다 | `+=` 로 돌리면 두 번 돈다 (설문은 그래서 고쳤다) |
| **`Funnel`은 음수 배율 + 180° 회전** → 로컬 +Y가 아래 | 굴뚝 꼭대기를 로컬 bbox `max.y`로 잡으면 밑동이 나온다 | 설문은 월드 bbox 윗면으로 연기 위치를 잡는다 |
| **`Cabin`에 재질이 생겼다** (`Material_0`, 크림, 비금속) | 금속 대비 분기(`metalness === 1`)를 안 탄다. 인스턴스 색은 그대로 먹는다 | `fleet.js` "[함정 2] Cabin 노드에는 재질이 없다" 주석은 **옛말** |
| 빠진 metallic을 0으로 채웠다 (Cabin·Funnel_step 등) | 위와 같음 | |
| **갈매기가 한 메쉬** (부위 4개 합침), 같은 재질 프리미티브 병합 | 인스턴스 그룹 **9 → 6**, 배 1척 3,086 → 3,444 tri | selfcheck 상한 12 안 |
| 모든 프리미티브에 **`_AO` float 정점 속성** | 안 쓰면 무시됨 | three.js에선 `geometry.attributes._ao` (소문자). 쓰는 법 5.3 |
| 새 노드: Toolbox·Lamp·Plant·Surfboard·Bell·Chair·Cup·Easel·Easelchair·Cat·Island·Back_Mountain·Lighthouse | 없음 | 소품은 **씬 바로 아래** 노드. 지도가 더 붙이려면 `GLB_PROPS`처럼 `attach()` |
| 파일 크기 345KB → 918KB | 첫 로드가 늘었다 | `build-standalone.mjs` 산출물은 base64라 **약 1.2MB**가 더 붙는다 |

노드 이름의 공백은 three.js에서 `_`가 된다(`Back Mountain` → `Back_Mountain`). `glb-nodes.js`에는
three.js 쪽 이름을 적는다.

---

## 3. `shared/` 에서 바뀐 것

| 파일 | 변경 | 지도 영향 |
|---|---|---|
| `glb-nodes.js` | `GLB_NODES`에 `island`·`backMountain`·`lighthouse`·`cat` 추가. `KEYWORD_NODES`(키워드 → 요소) 새로 정함. `CODE_MADE_NODES = ["Clover"]`. `GLB_PROPS`는 그대로(갈매기·튜브) | 없음 |
| `palette.js` | `KEYWORD_PROP = { "자유": "gull", "가족": "tube" }` — 튜브가 관계 → 가족 | 튜브가 뜨는 배가 바뀜 |
| **`look-tokens.js` (새)** | `SCENE_LOOK` · `HEMI` · `AO` | 지도가 읽기 전까지 없음 |
| `tokens.css` | `--scene-grade` · `--scene-vignette` 추가 | 변수만 — 없음 |

`KEYWORD_NODES` (설문):

| 키워드 | 요소 | | 키워드 | 요소 |
|---|---|---|---|---|
| 일 | Toolbox | | 우연 | Clover (코드로 그리는 데칼, GLB에 없음) |
| 관계 | Lamp | | 자유 | Seagull |
| 가족 | Tube | | 불안 | Bell |
| 주거 | **Cat** (예전 Plant — Plant는 GLB에 남아 있지만 안 씀) | | 익숙함 | Chair + Cup |
| 소속감 | Surfboard | | 창작 | Easel + Easelchair |

지도용 `KEYWORD_PROP`·`GLB_PROPS`는 이 매핑의 **부분집합**이어야 한다. `KEYWORD_NODES`의 키는
`survey-taxonomy.js`의 `KEYWORDS`와 정확히 같아야 한다(설문 `selfCheck`가 대조).

---

## 4. 사용자 결정 — 지도도 따를지 확인할 것

1. **"키워드는 캐빈 색을 바꾸지 않는다. 오직 요소로만 나타낸다."** 설문은 캐빈 틴트를 지웠다.
   지도 `style.js`는 아직 `KEYWORD_COLOR[kws[0]]`로 캐빈을 칠한다. 지도에서는 "멀리서 배를 구분하는
   수단"이기도 해서 설문 세션이 대신 정하지 않았다 — **지도 쪽에서 사용자에게 확인**할 것.
   따른다면 캐빈은 `CABIN_BASE_COLOR`(GLB `Cabin` 재질 색과 같다) 하나로 두고, 요소(소품)로만 구분한다.
   `KEYWORD_COLOR`는 지도만 쓰므로 그때 지워도 된다.
2. **소품은 보이는 뱃전으로 옮긴다** (설문 `SIDE_SWAP` — Surfboard·Bell·Tube·Clover·Cat를 카메라 쪽
   뱃전으로 거울상 배치). 지도는 소품이 갈매기·튜브뿐이고 시점이 멀어 지금은 필요 없다. 소품을 늘리면 참고.

---

## 5. 룩 — 지도에 가져갈 것

사용자가 09-27 폰에서 고른 설문 룩: **톤 매핑 없음 + 채움광을 반구광으로 바꾼 조명 + 거칠기 상한 +
구운 AO + (설문 전용 효과들) + CSS 색보정·비네트**. 지도에는 아래 세 가지만 가져가면 같은 배가 같은 색으로 보인다.

### 5.1 조명 — `SCENE_LOOK` · `HEMI` (필수, 비용 거의 없음)

지금 지도 `main.js`는 팔레트의 Ambient + Sun + Rim을 그대로 쓴다. 설문은 여기서 채움광을 줄이고
반구광(위 = 하늘색, 아래 = 바닷색)을 더했다. 같은 텍스처가 지도에서만 더 평평하고 밝게 뜨는 이유다.

```js
import { SCENE_LOOK, HEMI } from "../shared/look-tokens.js";

const B = C.SCENE_BRIGHTNESS;
this.scene.add(new THREE.AmbientLight(P.amb, P.ambI * B * SCENE_LOOK.ambScale));
const sun = new THREE.DirectionalLight(P.sun, P.sunI * B * SCENE_LOOK.sunScale);
// rim 라이트는 그대로 (설문도 배수 없이 팔레트 값)

const hemiSky = new THREE.Color(P.sky[HEMI.skyBand]);
const lum = hemiSky.r * 0.2126 + hemiSky.g * 0.7152 + hemiSky.b * 0.0722;
hemiSky.lerp(new THREE.Color(lum, lum, lum), HEMI.skyDesat);
const hemiGround = new THREE.Color(P.ocean).multiplyScalar(HEMI.groundMul);
this.scene.add(new THREE.HemisphereLight(hemiSky, hemiGround, P.ambI * B * SCENE_LOOK.hemiScale));

// SCENE_LOOK.tone === "none" → three 기본값(NoToneMapping) 그대로. 지도는 이미 이 상태다.
```

`fleet.js`에서 재질을 복제한 **뒤에** 거칠기 상한:

```js
mat.roughness = Math.min(mat.roughness, SCENE_LOOK.roughnessCap);   // 0.68
```

(지금 있는 `metalness === 1` 대비 분기가 roughness를 0.8로 올리는데, 그 뒤에 두면 0.68로 눌린다.)

**물 셰이더는 건드리지 않는다.** 물은 커스텀 셰이더라 이 조명들을 안 받는다(설문도 같다).
**조명 수는 처음부터 고정한다.** three.js는 조명 개수가 바뀌면 모든 재질을 다시 컴파일한다 —
반구광을 끄고 싶으면 빼지 말고 세기를 0으로.

### 5.2 화면 색보정·비네트 — `tokens.css` (필수, 거의 공짜)

지도는 이미 `tokens.css`를 `<link>`로 읽으므로 변수만 쓰면 된다.

```css
#scene { filter: var(--scene-grade); }
.sceneVignette { position: fixed; inset: 0; pointer-events: none; background: var(--scene-vignette); }
```

- 비네트 층은 캔버스 바로 위, **패널보다 아래**에 둔다(패널 글자까지 어두워지면 안 된다).
- 필터는 캔버스에만 건다. 패널의 `backdrop-filter`는 필터 먹은 캔버스를 비치게 되므로 두 화면 톤이 맞는다.
- 성능 워치독의 `flat` 단계에서도 이 둘은 남겨도 된다 — GPU 합성 단계라 프레임 비용이 거의 없다.
  (불안하면 가장 낮은 단계에서 `filter:none`.)

### 5.3 구운 AO — `AO` (선택)

배 틈·캐빈 밑·소품 접지면에 구석 그늘이 들어간다. 멀리서 보는 지도에선 효과가 작으니 1·2번 뒤에
판단하면 된다. 쓴다면 설문과 **같은 식·같은 세기**로:

```js
import { AO } from "../shared/look-tokens.js";

mat.onBeforeCompile = (shader) => {      // 이미 다른 패치가 있으면 합쳐서 (아래 함정 1)
  shader.uniforms.uAOAmt = { value: AO.amount };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float _ao;\nvarying float vAO;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAO = _ao;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uAOAmt;\nvarying float vAO;")
    .replace("#include <aomap_fragment>", `
      float ao = mix(1.0, clamp(vAO, 0.0, 1.0), uAOAmt);
      reflectedLight.indirectDiffuse *= ao;
      reflectedLight.directDiffuse *= mix(1.0, ao, ${AO.direct.toFixed(3)});
      reflectedLight.directSpecular *= ao;
      #include <aomap_fragment>`);
};
```

- `InstancedMesh`에서도 그대로 된다(정점 속성은 인스턴스가 공유).
- GLB 메쉬는 전부 `_ao`가 있다. 코드로 만든 메쉬에 이 재질을 쓰면 속성이 없어 셰이더가 깨지므로
  1로 채운 속성을 붙일 것 (설문: `g.setAttribute("_ao", new BufferAttribute(new Float32Array(n).fill(1), 1))`).
- 설문 원본: `index.html` `_surfaceFxShader`.

### 5.4 가져가지 말 것 (설문 전용)

| 효과 | 설문 값 | 지도에 안 맞는 이유 |
|---|---|---|
| 광택 (하늘 반사, 매끈한 면) | `FX_DEFAULT.sheen 0.8` | 멀리서 작은 배엔 안 보이고 픽셀당 비용만 |
| 테두리 빛 (실루엣 가장자리) | `rim 0.2` | 작은 배는 전부 가장자리라 번쩍이는 점이 된다 |
| 면 색 변주 (면마다 ±10%) | `facet 1` | 멀리서는 노이즈 |
| 부드러운 그림자 (PCFSoft, normalBias 0.025) | 기본 켬 | 지도는 그림자 패스 자체가 없다 — 수십 척 × 매 프레임 |
| 틸트시프트 (위아래 34% `backdrop-filter: blur(3.5px)`) | 켬 | "병 속 미니어처" 연출. 지도는 매 프레임 변하는 캔버스 위 `backdrop-filter`라 비싸다(지도 main.js 주석과 같은 이유) |
| 나무 선체·물빛(caustic)·얕은 물빛 | 끔 | 설문에서도 뺐다 |
| 블룸·그레인·IBL(환경맵)·AgX/ACES | 없음 | 해봤다가 뺐다 — IBL이 제일 무거웠고(+90ms), AgX/ACES는 밝은 텍스처를 바래게 했다 |

---

## 6. 함정

1. **`onBeforeCompile`을 두 번 대입하면 앞의 패치가 사라진다.** 설문은 `patchMaterial(mat, key, fn)`로
   여러 패치를 합친다. 지도는 지금 `onBeforeCompile`이 없어서(인스턴스 색은 `vertexColors`로 해결)
   AO 하나면 그냥 대입해도 되지만, 두 번째 패치가 생기면 합치는 함수부터 둘 것.
   패치는 청크 include **앞뒤에 덧붙이는** 식으로 — 청크를 통째로 바꾸면 다른 패치의 기준 문자열이 사라진다.
2. **`ambScale`을 0으로 두지 말 것.** 설문은 시간대 전환 스냅숏에서 이 값으로 나눈다 → NaN → 물체가
   새까매진다(실제로 겪었다). 설문은 하한 1e-3을 두지만, 공유 값 자체를 0으로 바꾸면 안 된다.
3. **거칠기 상한은 복제한 재질에만.** GLB 재질은 공유 객체라 원본에 쓰면 다른 메쉬도 같이 바뀐다.
4. **팔레트 `sky`는 문자열 hex 배열이다** (`"#8fd6e8"`). `new THREE.Color()`에 그대로 넣으면 된다.
5. **`HEMI.skyBand`는 `sky` 배열의 인덱스다.** 팔레트 띠 수를 바꾸면 같이 볼 것.
6. **standalone 번들에 `look-tokens.js`를 넣을 때** `SHARED_ORDER`의 `config.js`보다 앞(= 다른 shared 옆)에.
   import가 없는 파일이라 순서 제약은 그것뿐이다.

---

## 7. 지도 세션 체크리스트

순서대로. 1~3이 "두 화면 톤 맞추기"의 전부다.

- [x] 1. `main.js` 조명을 5.1처럼 `SCENE_LOOK`·`HEMI`로 (Ambient·Sun 배수 + HemisphereLight 추가)
- [x] 2. `fleet.js` 재질 복제 뒤 `roughness = min(…, SCENE_LOOK.roughnessCap)`
- [x] 3. 캔버스 `filter: var(--scene-grade)` + 비네트 층 (5.2)
- [x] 4. `build-standalone.mjs` `SHARED_ORDER`에 `"look-tokens.js"` 추가, 번들 크기(≈ +1.2MB GLB) 확인
- [x] 5. `fleet.js` "[함정 2] Cabin 노드에는 재질이 없다" 주석 갱신 (Cabin에 크림색 비금속 재질이 있다)
- [x] 6. 튜브 = **가족** — 지도 문구·범례·통계 설명에 '관계=튜브'가 남았는지
- [x] 7. **사용자 확인:** 지도도 캐빈 색을 키워드와 끊을지 (4장 1번) → 정해지면 `style.js`
- [x] 8. (선택) 구운 AO (5.3)
- [x] 9. `statistics/README.md`에 `look-tokens.js`·`--scene-grade` 항목 추가

(09-27 지도 세션이 전부 반영했다 — 아래 10장)

두 화면 비교는 같은 시간대(지도 `?time=day` 등, 설문은 공유 시간대 단계에서 같은 값)에서 배 한 척을 나란히 캡처해 캐빈·선체 색을 보면 된다.

---

## 8. 앞으로 룩을 바꿀 때 (두 세션 공통 규칙)

- 조명 비율·톤·거칠기·AO 세기·색보정·비네트 → **`shared/look-tokens.js` / `shared/tokens.css`만** 고친다.
  두 화면이 같이 바뀐다. 어느 세션이 고치든 `HANDOFF.md` 0장에 한 줄 남긴다.
- 설문 전용 효과(광택·테두리·면 변주·그림자·틸트시프트·등대) → 설문 `index.html`.
- 지도 전용 효과 → `statistics/js/*`. 설문 세션은 읽기만 한다.

---

## 9. 관련 커밋 (main)

| 커밋 | 내용 |
|---|---|
| `e823e3b` | 새 GLB(scene_baked)로 교체: 텍스처 아틀라스 한 장, 키워드 → 배의 요소, `KEYWORD_PROP` 튜브 → 가족 |
| `0fffd96` | 등대 밤 불빛·병 확장, 뱃전 요소 대칭 배치, 주거 → 고양이, unlit 재질 제거 |
| `d9ffa54` | 뒷산을 병 모양에 맞춰 눌러 담기, 등대 불빛 흰색·시계 방향 |
| `3f7f38c` `8e45940` | film 룩, AgX + 반구광 경량화, 룩 테스트 메뉴, 두 손가락 줌 |
| `e8e09bc` | AO 굽기(`_AO`), 표면 효과, 틸트시프트·비네트 |
| `6049106` `7082f53` `37cc2da` | 광택·테두리 조정, 카툰 선체, 부드러운 그림자 토글 |
| `3b034e9` | 사용자가 고른 톤으로 고정, 메뉴는 그림자 토글만 |
| (이 문서와 같은 커밋) | 공유할 룩 값을 `shared/look-tokens.js`·`tokens.css`로 옮김 (설문 화면 값 변화 없음) |

---

## 10. 지도 세션 답신 (2026-09-27)

위 체크리스트를 전부 반영했다. 사용자 결정 두 가지가 더 있었다.

1. **지도도 캐빈 색을 키워드와 끊는다.** 캐빈은 GLB 크림색 재질 그대로.
2. **지도에도 키워드 요소를 전부 붙인다** (`KEYWORD_NODES` 10개 키워드 · 요소 11개 + 클로버).
   베이스 모델은 `scene_baked.glb` → `Scene.glb` 흐름 그대로다(`scene_baked2.glb`는 안 쓴다).

### 확인한 것

| 항목 | 결과 |
|---|---|
| 조명 | 같은 시간대(`day`)에서 두 화면 조명을 읽어 대조 — 주변광 0.22 · 해 1.7325 · 테두리광 0.33 · 반구광 0.792(하늘 `#b0d1da` 바닥 `#2083a9`) **소수점까지 같다** |
| 요소 | 요소마다 InstancedMesh 하나. **그 요소를 단 배에만** 인스턴스를 둔다 — 전 배에 깔고 0 행렬로 지우면 6,894 tri × 80척을 헛돈다. 결과: 요소 12종을 붙이고도 화면 전체가 264,226 → 211,140 tri. draw call = 몸체 4 + 쓰이는 요소 수 |
| 뱃전 요소 | 지도는 카메라가 늘 우현을 보므로 로드 때 한 번 판정해 지오메트리에 구워 넣는다(InstancedMesh는 인스턴스 행렬의 행렬식을 안 봐서 음수 배율로 못 뒤집는다). 지금 GLB에서는 **튜브만** 옮겨졌다 |
| 클로버 | 설문과 같은 방식(`DecalGeometry`로 선체 투영). 배율 1로 구운 좌표라 `CLOVER` 값을 `refScale`로 나눠 쓴다 |
| 구운 AO | 켰다. 근접 장면을 켜고 끄고 비교하니 고물 우묵한 곳·캐빈 밑동·요소 접지면에 그늘이 들어갔다. 값이 이미 GLB에 있어 비용은 픽셀당 곱셈 몇 번 |
| 튜브 두 개 | 버그 아님 — GLB `Tube` 메쉬에 링 두 개가 들어 있다(정점이 x −1.5~1.5 / 2.4~6.2 두 덩어리) |
| 설문 화면 | `shared/`를 고친 뒤에도 콘솔·selfCheck 깨끗 |

### `shared/`에서 바꾼 것

- **삭제**: `palette.js` `KEYWORD_COLOR`·`KEYWORD_PROP`, `ship-tokens.js` `CABIN_BASE_COLOR`.
  셋 다 지도만 쓰던 값이다. 설문 `index.html`이 import 하지 않는 것을 확인하고 지웠다
  (`index.html` 2274줄 주석에 이름만 남아 있다).
- **추가**: `glb-nodes.js` `SIDE_PROPS`·`CLOVER`. 설문 `index.html`의 `SIDE_SWAP`·`CLOVER`와
  **같은 값**이다. `CLOVER`에는 단위 기준 `refScale: 3.38`(설문 `SHIP_SCALE`)만 더했다.

### 설문 쪽에 부탁할 것

1. **`SIDE_SWAP`·`CLOVER`를 `shared/glb-nodes.js`에서 읽게 바꿔 주면 한 곳이 된다.** 지금은
   설문 사본과 shared 값이 같아서 문제없지만, 설문에서만 고치면 지도 클로버가 따로 논다.
   (`SIDE_SWAP` → `SIDE_PROPS`로 이름만 다르다. `CLOVER`는 그대로 쓰면 되고 `refScale`은 무시해도 된다)
2. **`GLB_PROPS`는 이제 설문 selfCheck만 읽는다.** 지도는 `KEYWORD_NODES`를 쓴다. 그 assert를
   걷어내면 `GLB_PROPS`도 같이 지워도 된다.
3. **클로버 그림(`_drawClover`)은 코드라 두 벌이다** — 지도 `statistics/js/clover.js` `drawClover`.
   모양을 바꾸면 두 곳을 같이 고칠 것(색은 `CLOVER`에서 오므로 한 곳).

### 알아둘 것 (지도 화면 특성)

- 클로버와 작은 요소(램프·컵·종)는 흐름 중인 배에서는 거의 점이다. 설문과 같은 비율로
  맞춰 둔 결과라 일부러 키우지 않았다. 지도에서만 키울 일이 생기면 지도 쪽에서 배수를 건다.

---

## 11. 설문 세션 답신 (2026-09-27)

10장의 부탁 세 가지 중 두 가지를 반영했다.

1. **설문이 `SIDE_PROPS`·`CLOVER`를 `shared/glb-nodes.js`에서 읽는다.** `index.html`의 사본을
   지웠다(`SIDE_SWAP`은 `SIDE_PROPS`를 가리키는 이름으로만 남겼다). 이제 한 곳이다.
2. **`GLB_PROPS`를 지웠다.** 설문 selfCheck는 대신 두 가지를 본다:
   `SIDE_PROPS`의 이름이 전부 `KEYWORD_NODES` 안에 있는가, `CLOVER.refScale`이 설문
   `SHIP_SCALE`(3.38)과 같은가(배 크기를 바꾸면 지도 클로버가 어긋나므로).
3. **클로버 모양 코드(설문 `_drawClover` · 지도 `clover.js` `drawClover`)는 두 벌로 둔다.**
   설문은 한 파일 HTML 안의 클래스 메서드라 공유하려면 `drawClover`를 `shared/`로 옮기고
   지도 `clover.js`도 고쳐야 한다 — 지도 코드를 건드리는 일이라 이번엔 하지 않았다.
   모양을 바꿀 일이 생기면 그때 `shared/`로 올리자. 색·자리·크기는 이미 `CLOVER` 한 곳이다.

---

## 12. 설문 → 지도 알림 (2026-09-29)

- **설문 배의 갑판에 카툰 나무 판자를 깔았다** (사용자 요청: "벽면은 그대로, 갑판만 나무로").
  옆면·뱃전 윗단·계단은 GLB 선체 색 그대로다. 설문 전용 셰이더(`index.html` `_installWood` ·
  `_markDeckFaces`)라 지도 배는 지금 갑판이 선체와 같은 적갈색이다.
  두 화면 배를 같게 보이게 하려면 지도도 같은 처리가 필요하다 — 따를지는 지도 쪽에서 사용자에게 확인.
  옮긴다면: 갑판 판정은 로드할 때 한 번(선체 지오메트리를 배 좌표로 옮겨 계산, 정점 속성 `_deck`),
  판자 무늬는 프래그먼트에서 배 좌표 기준으로 그린다 — 인스턴스마다 같은 지오메트리라 InstancedMesh에서도 그대로 된다.
  지도에서는 배가 작아 판자 이음매(폭 0.024)가 픽셀보다 가늘다 — 설문 셰이더가 `fwidth`로 흐리게 처리하므로
  멀리서는 꿀색 갑판으로만 보인다.


---

## 13. 설문 UI 개편(시안 B′) — 지도도 톤을 맞출 때 (2026-09-30)

설문 화면 UI를 사용자가 고른 **시안 B′(영화 자막형)** 로 바꿨다(`1ebc5e5` 이후 몇 커밋). 사용자가 지도 화면도
같은 톤으로 맞춰 달라고 할 수 있어 요지를 남긴다. 실제 모습은 사이트 설문 화면, 코드는 `ui/survey.css`.

**공유로 올려 둔 것 (연결해서 쓸 것 — 베끼지 말 것):** `statistics/shared/tokens.css`에 서체·글자색 토큰을 더했다.
`--serif`(고운바탕, 질문·문장·선택지) · `--ui`(IBM Plex Sans KR, 설명·버튼·숫자) · `--b-text`/`--b-text2`/`--b-text3`
(어둠 위 글자) · `--b-gold`(고른 것·진행) · `--b-ink`(밝은 버튼 위 글자) · `--b-navy`(밝은 하늘 위) · `--b-paper-ink`(흰 종이 위).
지도 CSS엔 같은 이름이 없어 지금 화면엔 변화 없다. 폰트 파일은 각 화면이 받는다 —
`https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&display=swap`
(standalone 번들은 인라인하거나 시스템 명조로 물러나게).

**원칙 (설문에서 확인한 것):**
- 글자를 풍경 위에 바로 얹지 않는다. 어두운 바탕(아래로 짙어지는 그라데이션 + 흐림, 또는 어두운 유리) 위엔 밝은 명조,
  밝은 바탕 위엔 짙은 글자. 예전 설문은 짙은 글자 고정이라 저녁·밤에 안 보였다.
- 강조색은 금색 하나. 고른 것 = 금색 밑줄/막대, 진행 = 금색 가는 선.
- 버튼: 주 버튼은 알약(밝은 바탕 `--b-text` + `--b-ink` 글자), 보조는 글자만. 크게 쓰는 문장은 명조 굵게.
- 목록형 기록 카드(설문의 "머무름의 지도 보러가기" 목업 목록)는 크림 종이 톤 — 명조 문장, 갈색 메타(#7A5B32),
  금색 테두리(#B8955E)로 "나의 기록". `ui/survey.css`의 `.ar-*`.

**지도에 맞출 때 판단할 것 (지도 쪽 결정):** 패널이 이미 리퀴드 글래스라 "어두운 유리 위 밝은 명조"로 옮기기 쉽다.
통계 숫자는 `--ui`, 문장 인용은 `--serif`로 나누면 설문과 같은 결이 된다. 지도 스크린숏과 함께 사용자에게 확인할 것.

---

## 14. 지도 세션 답신 — B′ 톤 반영 (2026-09-30)

13장대로 지도도 B′ 톤으로 맞췄다. `shared/tokens.css`는 **읽기만** 했다(값·이름 그대로 연결, 바꾼 것 없음).
폰트는 지도 `statistics/index.html`이 같은 구글 폰트 주소로 받는다.

| 지도 자리 | 어둠 | 글자 |
|---|---|---|
| 위쪽 제목·누적 수 | 위에서 짙어지는 그라데이션 (설문 `.scrim-top`, 같은 어둠 색 `rgba(7,9,14)`) | 제목 `--serif` · 누적 수 `--ui` · 다음 장 예고는 설문 단계 표시줄 꼴(명조 번호 · 자간 넓은 이름 · 흰 실선 위 `--b-gold` 2px) |
| 가운데 통계 카드 | 어두운 유리 | 장 머리도 단계 표시줄 꼴 · 한 줄 결론 `--serif` 굵게, 결론이 가리키는 낱말은 `--b-gold` + 금색 밑줄(설문의 고른 낱말) · 숫자·각주 `--ui` |
| 아래 방금 도착한 문장 | 아래에서 짙어지는 그라데이션 + 흐림 (설문 `.scrim-bottom`) | 문장 `--serif` 굵게 · 이름표 `--b-gold` 자간 넓게 · 기록 넷 |

- 강조색은 `--b-gold` 하나. 지도는 예전 `--gold`·`--gold2`·`--cream`을 더 이상 쓰지 않는다
  (`tokens.css`에서 지우지는 않았다 — 설문 쪽 사용 여부는 설문이 판단).
- 차트 색은 어두운 카드 위에서 다시 검산했다(지도 README "색을 쓰는 규칙").
- 설문 쪽에 할 일은 없다. `tokens.css`의 `--serif`·`--ui`·`--b-*` 이름을 바꾸면 지도도 같이 바뀐다 — 이름을 바꿀 땐 알려 줄 것.

---

## 15. 설문 → 지도 알림 — 튜브 톤·램프 한 쌍 (2026-09-30)

설문 `index.html`만 바꿨다. `shared/`·GLB·지도 코드는 건드리지 않았다. **지도가 할 일은 없고, 맞출지는 지도 판단.**

| 바뀐 것 (설문) | 지도에 걸리는 것 |
|---|---|
| 물 타일을 칸 단위로만 옮김(로우폴리 면이 월드에 붙음) | 없음 — 지도 바다는 원래 월드에 고정(`ocean.js`) |
| 튜브(가족) 색 배수 `TUBE_TINT` [0.62, 0.59, 0.55] + 광택·테두리 빛 0.3배 | 지도에서도 튜브가 혼자 밝아 보이면 튜브 InstancedMesh 재질에 같은 배수를 걸면 된다 |
| 램프('관계')를 마스트 가로대 반대쪽 끝에 하나 더(z −0.051, 배 좌표·배율 전) · 서로 반대로 흔들림 · 밤에 불빛 | 지도 배에는 여전히 한 개. 맞추려면 램프 인스턴스를 z만 바꿔 하나 더 두면 된다. 흔들림·불빛은 배가 많아 비용을 따져 볼 것(조명 대신 번짐 스프라이트만 권장) |

값은 설문 HANDOFF 6.15(튜브) · 6.16(램프).

---

## 16. DB 연결 — 지도에 바뀐 것 (2026-09-30, DB 연동 세션)

백엔드는 **Firebase(Firestore + 익명 인증)로 확정**됐다. 지도는 공개 기록 전부를 한 번에 받고 새 기록을 실시간으로 받는다.
**DB 설정값(`shared/db-config.js`)이 비어 있는 동안은 예전과 똑같이 `MockStore`로 돈다** — 목업 46건이 변경 전과 같은 것을 확인했다.
전체 설계·사용자 할 일·비용은 `HANDOFF.md` 13장.

### 바뀐 줄

| 파일 | 바뀐 것 |
|---|---|
| `js/main.js` | `import { MockStore }` → `import { pickStore }`, 부팅부의 `new MockStore(...)` 두 곳 → `pickStore(qs, seed, interval)`. 그 밖은 그대로 |
| `js/store.js` | `FirestoreStore`·`pickStore` 추가. 머리말의 Supabase 추천을 "Firebase로 확정"으로. `MockStore` 기록에 `share`·`schema_version`을 붙였다(스키마 검사 통과용 — `share`는 순번에서 뽑아 난수 순서가 그대로다) |
| `index.html` | `survey-taxonomy.js` 다음에 `<script src="./shared/record-schema.js">` 한 줄 |
| `tools/build-standalone.mjs` | `SHARED_ORDER`에 `db-config.js`·`record-store.js`, `record-schema.js` 인라인, 시안은 늘 `mock=1` |
| `shared/` 새 파일 | `record-schema.js`(클래식 전역 `RECORD_SCHEMA`) · `db-config.js` · `record-store.js` — 설문과 같이 쓴다 |

쿼리 파라미터: `?mock=1`(설정이 있어도 목업), `?emu=1`(localhost에서만 — 로컬 에뮬레이터). `seed`·`interval`은 목업일 때만 쓴다.

### 레코드에 추가된 것

`share`(나눔 → 시간대, `SHARES`의 id)와 `schema_version`(1). 지도는 안 써도 된다. 나머지 필드는 `store.js` 머리말 그대로다
(설문 쪽 옛 설계를 버리고 지도 이름을 정본으로 했다). `created_at`은 계약대로 ISO 문자열로 온다.

### 오프라인 동작

- 마지막으로 받은 공개 목록을 localStorage(`yeogi.map.cache.v1`)에 둔다. 서버가 8초 안에 답하지 않으면 캐시로 `onReady`,
  붙으면 차이만 `onInsert`/`onRemove`. 캐시도 없으면(첫 부팅) 서버를 기다린다.
- 구독 오류는 백오프(2·4·8…60초)로 다시 붙는다.
- **SDK 자체를 못 받았으면 새로고침한다.** 크로미움은 한 번 실패한 `import()` 주소를 문서가 살아 있는 동안 기억해서, 다시
  import 해도 같은 실패가 돌아온다(실측). SDK 주소에 `fetch`로 닿으면 새로고침(2분에 한 번까지, 그 사이는 캐시로 돈다).
- 차이가 많이 밀려 들어오면 기존 규칙대로 3척만 연출하고 나머지는 조용히 놓인다(`ARRIVAL_QUEUE_MAX`).

### standalone 빌드

통과한다(씬 2.28MB). 새 shared 파일이 이어붙고, SDK는 동적 import라 굽지 않는다. 시안은 `mock=1`을 넘겨 늘 목업 —
DB 설정을 채워도 시안 파일은 네트워크 요청 없이 목업으로 도는 것을 확인했다.

### 지도 세션이 앞으로 지킬 것

1. **저장소 계약은 그대로다.** `onReady`는 한 번(첫 **서버** 스냅샷), 그 뒤로는 `onInsert`/`onRemove`만. Firestore를 직접 부르지 말고
   `shared/record-store.js`를 거칠 것 — 첫 스냅샷의 "added" 전부, `fromCache` 빈 목록, `serverTimestamps: "estimate"` 같은
   함정이 거기와 `FirestoreStore`에 모여 있다. `onSnapshot`을 새로 쓰면 **error 콜백을 반드시** 단다(없으면 조용히 멈춘다).
2. **화면에 넘기는 기록은 `RECORD_SCHEMA.checkRecord`를 통과한 것만.** 두 저장소가 다 그렇게 한다. 분류값에서 빠진 값을 가진
   옛 기록은 여기서 걸러진다(콘솔 경고) — `style.js`가 모르는 키워드로 배를 만들지 않게.
3. **공개 판정은 서버에서.** 쿼리에 `where(moderation_status == "public")`이 없으면 규칙이 쿼리 전체를 거절한다.
4. **참여자 글을 `innerHTML`에 넣을 땐 `esc`.** 지금은 `insights.js`·`views.js`가 다 거치고 `panel.js`의 도착 카드는
   `textContent`다(09-30 확인, `<img onerror>`·`<script>` 문장으로 E2E 검증).
5. `survey-taxonomy.js`를 바꾸면 **보안 규칙을 다시 생성·배포**해야 한다(`node firebase/build-rules.mjs` — `HANDOFF.md` 13.3).
6. `shared/`에 새 모듈을 더하면 `build-standalone.mjs`의 `SHARED_ORDER`에도 넣는다. 최상위 이름은 지도 코드와 한 스코프라
   `record-store.js`는 이름을 전부 `db`로 시작하게 했다.

---

## 17. 설문 → 지도 알림 — 배 색·캐빈 창문 (2026-09-30)

설문 `index.html`만 바꿨다(`shared/`·GLB·지도 코드는 그대로). **지도가 할 일은 없고, 맞출지는 지도 판단.**
사용자가 준 레퍼런스 예인선에 맞춰 설문 배의 마스트(단색 테라코타)·계단(밝은 나무)·갑판(붉은 갈색 판자)·
캐빈(크림 페인트 + 창 넷, 문·둥근 창)·굴뚝 받침(페인트)을 바꿨다. 자세한 건 설문 HANDOFF 6.17.

- 지도 배는 여전히 GLB 색 그대로라 **두 화면의 배 색이 다르다.** 맞추려면: 선체 부품 판정(`_markHullParts` —
  좌표로 이은 덩어리로 마스트·계단 찾기)과 `BOAT_PAINT` 값을 옮기면 된다. 단 `BOAT_PAINT`는 설문 낮 조명에 맞춰
  거꾸로 푼 재질 색이다 — 지도 조명이 다르면 렌더 결과를 다시 재서 맞출 것.
- 캐빈 창·문은 셰이더로 그린다(텍스처 없음). 지도에서는 배가 작아 창이 몇 픽셀이라 굳이 옮길 필요는 없어 보인다.
- 값을 한곳에서 쓰고 싶으면 `BOAT_PAINT`를 `shared/`로 옮기는 게 맞다 — 지도 쪽이 쓰겠다고 하면 설문이 옮긴다.

---

## 18. 지도 배를 설문 배와 같게 — 옮길 것 총정리 (2026-09-30, 설문 세션)

> 사용자 요청: "지도 화면에서 반영할 수 있게". 12·15·17장에 흩어 적은 설문 배 변경을 **지도에 옮기는 순서대로** 한 곳에 모았다.
> 지도 배는 지금 GLB 색 그대로다 — 갑판이 선체와 같은 적갈색, 마스트·계단도 선체색, 캐빈은 하얀 상자, 램프 한 개.
> 설문 쪽 코드 위치는 전부 루트 `index.html`, 값은 **새 공유 파일 `shared/boat-look.js`**(아래 18.1).

### 18.0 한눈에 — 무엇을, 어떤 순서로

| # | 무엇 (설문에서 사용자가 고른 것) | 지도에서 보일까 | 권장 | 난이도 |
|---|---|---|---|---|
| 1 | 선체 부품 색 — 마스트 테라코타 단색, 계단 밝은 나무(디딤판이 한 단 더 밝게) | ✓ 마스트는 멀리서도 선이 보인다 | **옮긴다** | 중 (선체 셰이더 패치) |
| 2 | 갑판 — 붉은 갈색 판자 + 판자 끝 이음매 | ✓ 배를 위에서 보므로 갑판 면적이 크다 | **옮긴다** | 중 (1과 같은 패치) |
| 3 | 캐빈 — 크림 페인트, 뱃머리 쪽 창 넷, 양옆 창 하나 + 문(둥근 창·손잡이), 짙은 판자 지붕 | 색은 ✓, 창·문은 몇 픽셀 | **색은 옮기고**, 창·문은 스크린숏 보고 판단 | 중 |
| 4 | 굴뚝 받침 — 캐빈보다 회색빛 크림 페인트 | ✓ | 옮긴다 (3과 같은 패치) | 하 |
| 5 | 튜브(가족) 톤 낮춤 | ✓ 흰 점처럼 튄다 | **옮긴다** | 하 (재질 색 한 줄) |
| 6 | 램프(관계) 한 쌍 — 마스트 가로대 반대쪽 끝에 하나 더 | ✓ | **옮긴다** | 하 (인스턴스 하나 더) |
| 7 | 램프 흔들림 — 두 램프가 앞뒤로 서로 반대로 | 멀어서 미미 | 선택 (사용자 확인) | 중 (매 프레임 인스턴스 행렬) |
| 8 | 밤 램프 불빛 — 유리 빛남·번짐·조명·수면 반사 | `?time=night`일 때만 | 유리 + 번짐만 (조명·수면은 빼기) | 중 |
| — | 번짐 그림은 2D 캔버스 그라데이션 금지 | 지도가 번짐을 쓴다면 | 원칙 | — |

**옮기지 말 것 (설문 전용):** 틸트시프트(지도는 매 프레임 바뀌는 캔버스 위 `backdrop-filter`라 비싸다 — 5.4장),
물 타일 칸 단위 이동(설문 6.14 — 지도 바다는 원래 월드에 고정돼 있어 해당 없음), '오가는 중' 출발 가속·섬 곡선,
램프용 PointLight(80척이면 조명 80개 — 불가).

### 18.1 공유 파일 `shared/boat-look.js` (새로, 설문이 이미 읽는다)

three를 import하지 않는 값·순수 함수만 있다. 설문은 여기서 읽도록 바꿨고 렌더 결과가 그대로인 것을 확인했다.

| 이름 | 무엇 |
|---|---|
| `BOAT_PAINT` | 재질 색 hex — `mast` `stairRail` `stairTread` `deck` `cabin` `cabinRoof` `glass` `trim` `handle` `funnelStep` |
| `BOAT_PAINT_REFERENCE` | 조명 받은 뒤 화면에 나와야 하는 색(레퍼런스 렌더 실측) — 지도 조명에서 눈금 맞출 때의 목표 |
| `TUBE_TINT` `TUBE_FX_EDGE` | 튜브 재질 색 배수 [0.62, 0.59, 0.55], 광택·테두리 빛 몫 0.3 (지도엔 그 효과가 없으니 색 배수만) |
| `LAMP` | 흔들림 각·주기, 불빛 색, 유리 세기, 번짐 크기(설문 배율 3.38 기준 월드), 일렁임 |
| `GLOW_LAMP` `GLOW_LIGHTHOUSE` | 번짐 알파 모양 `(r 0~1) → 0~1` |
| `markHullParts(P)` | 선체 삼각형 정점 xyz(인덱스 푼 것, 배 좌표) → 정점마다 0 선체 · 1 마스트 · 2 계단 옆판 · 3 디딤판 (+개수) |
| `lampTwinZ(P, lampPos)` | 가로대 반대쪽 끝 z (09-30 GLB: 램프 +0.036 → 복제본 −0.051) + 찾았는지 |

**standalone 빌드:** 지도가 이 파일을 import하면 `tools/build-standalone.mjs`의 `SHARED_ORDER`에 `"boat-look.js"`를 더할 것
(최상위 이름 `BOAT_PAINT` `LAMP` `GLOW_*` `TUBE_*` `markHullParts` `lampTwinZ` — 지도 코드와 겹치는 것 없음, 09-30 확인).

### 18.2 좌표계 함정 — 지도 구운 지오메트리는 뱃머리가 +X

- `fleet.js`는 Ship의 회전 `SHIP_FORWARD_OFFSET`(π)까지 지오메트리에 구워서 **"뱃머리 = +X, 우현 = +Z"**다.
  설문 코드는 그 회전 **전** 배 좌표(뱃머리 = **−X**)로 적혀 있다. 설문에서 "뱃머리 쪽 면 = −X면", "문은 x가 클수록 선미"로
  된 것은 지도에선 **부호를 뒤집어야** 한다(x·z 둘 다 음수가 된다).
- `markHullParts`·`lampTwinZ`는 회전과 무관하게 맞다(높이·크기 문턱값만 본다). 단 **배율은 1**(배 길이 약 0.85)이어야 한다 —
  `fleet.js`가 Ship 배율을 1로 비우고 굽으므로 `b.geo`를 그대로 넘기면 된다. 램프 위치도 **같은 구운 좌표**로 넘길 것.
- 선체 `b.geo`는 인덱스가 있으면 `toNonIndexed()`로 풀고 넘긴다(면 단위 속성이라). 설문도 그렇게 한다.

### 18.3 선체 패치 — 부품 색(1)·갑판(2)

설문 코드: `_installWood`(패치 본문) · `_markDeckFaces`(갑판 판정 → `_deck`) · `_markHullParts`(→ `_part`).

1. 선체 구운 지오메트리에 `_deck`(갑판 = 1)·`_part` 속성을 넣는다. `_markDeckFaces`는 아직 설문 `index.html` 안에만 있다 —
   함수째 옮겨 오거나, 필요하면 설문 쪽에 "shared로 옮겨 달라"고 여기 적을 것(순수 함수로 뺄 수 있다).
   판정 결과 확인값: 위를 보는 면 중 갑판 비율 약 0.71, 마스트 3 · 옆판 2 · 디딤판 6.
2. **`onBeforeCompile`은 재질에 하나뿐이다** — `patchBakedAO`가 이미 쓴다. 대입하면 앞의 것이 사라진다(`fleet.js` 주석).
   패치를 합치는 함수(설문의 `patchMaterial`처럼 목록을 돌리는 것)부터 두고 AO와 나무를 같이 걸 것.
   `customProgramCacheKey`도 두 패치 이름을 합친 값으로.
3. 셰이더 요지(설문 `_installWood` 참고, `#include <normal_fragment_maps>` 뒤):
   - 갑판(`_deck`=1, 법선 y>0.65): `BOAT_PAINT.deck` × 판자 색 단계(0.84/0.97/1.10) × 판자 이음매(폭 0.024, z 방향) ×
     판자 끝 이음매(길이 0.13, 판자마다 어긋나게). 이음매는 `fwidth`로 픽셀보다 가늘면 흐리게 — **지도는 배가 작아서 대부분
     흐려져 붉은 갈색 면으로 보일 것**이다. 그래도 색 단계는 남는다.
   - 부품(`_part` 1·2·3): 무늬 없이 `BOAT_PAINT.mast` / `stairRail` / `stairTread`로 `diffuseColor.rgb`를 덮는다.
   - 옆면은 GLB 선체색 그대로(설문도 `uWoodSideAmt` 0).
4. **배마다 선체 색조(`instanceColor`, `hullTint`)와의 관계를 정할 것.** 색조는 `color_fragment`에서 `diffuseColor`에 곱해진다 —
   위 3을 `normal_fragment_maps` 뒤에서 덮어쓰면 갑판·부품에서는 색조가 사라진다. 배마다 다른 기를 갑판에도 남기려면
   덮어쓴 색에 `vColor`를 다시 곱할 것(설문엔 색조가 없어서 정해진 답이 없다 — 스크린숏 보고 판단).

### 18.4 캐빈·굴뚝 받침 페인트(3·4)

설문 코드: `_installPaint` · `_paintShader`. 재질을 복제하고 `paint` 패치(`#include <map_fragment>` 뒤에서 `diffuseColor.rgb`를 덮음).
- 상자 좌표(메쉬 바운딩박스 0~1)와 물체 법선으로 면을 가른다: X면 (z,y), Z면 (x,y), 위아래 (x,z). 면 위 모양은 **실제 치수**
  (박스 크기 × 노드 배율)로 그려서 늘어나지 않는다. 지도 구운 지오메트리는 이미 배 좌표라 배율을 따로 곱하지 않는다.
- 캐빈: 크림(`cabin`) + 옅은 세로 결(±2%) · 뱃머리 쪽 면에 창 넷(18.2 부호 주의 — 지도에선 **+X면**) · 양옆 면에 뱃머리 쪽 창 하나 +
  선미 쪽 문(문틈·둥근 창 `trim`·손잡이 `handle`) · 지붕 `cabinRoof` 판자 · 굴뚝 쪽 뒷면은 비움.
- 굴뚝 받침(`Funnel_step`): `funnelStep` + 결만.
- 지도 배 크기에서 창·문이 몇 픽셀이면 **색만 먼저** 옮기고, 스크린숏을 사용자에게 보여 창까지 넣을지 물을 것.

### 18.5 튜브(5)·램프 한 쌍(6)·흔들림(7)

- 튜브: `fleet.js`의 튜브 요소 재질(`cloneMaterial` 결과)에 `color.setRGB(...TUBE_TINT)`. 설문 실측으로 캐빈보다 한 단 아래가 된다.
- 램프 복제본: 램프 요소의 구운 지오메트리를 복제해 **z만** `lampTwinZ` 값으로 옮긴다(지오메트리를 z축으로 평행이동 —
  램프 원점이 고리라 모양은 그대로). 같은 InstancedMesh에 넣지 말고 요소를 하나 더 만들거나(키워드 '관계'에 요소 둘),
  한 지오메트리에 둘을 합쳐 굽는다(`mergeGeometries`) — 합치면 draw call이 안 는다. 흔들림을 안 넣을 거면 합치는 게 낫다.
- 흔들림(선택): 고리(램프 원점)를 축으로 배 폭 축(z)으로 `LAMP.swing·sin(2πt/LAMP.period)`, 복제본은 부호 반대.
  InstancedMesh에서 하려면 램프 인스턴스 행렬 = 배 행렬 × (고리로 옮김 · z회전 · 되돌림)을 매 프레임 다시 써야 한다.
  '관계' 배만이라 몇 척 안 되지만, 멀리서 거의 안 보이므로 **사용자에게 물어볼 것**.

### 18.6 밤 램프 불빛(8) — `?time=night`

- 설문은 유리(텍스처가 노란 곳만 emissive, 램프 재질 복제본에 `lamp-glass` 패치 — `_buildLamps`), 번짐 스프라이트 2개,
  PointLight 1개, 수면 반사(물 셰이더 `uLamp*`)를 켠다.
- 지도: **유리 + 번짐만.** 조명은 배 수만큼 늘 수 없고, 수면 반사는 지도 바다 셰이더를 바꿔야 한다(배마다 위치를 넘기기 어렵다).
  번짐은 램프 인스턴스마다 하나 — `THREE.Points` 하나(정점 = 램프 위치들, `sizeAttenuation`, 가산 혼합)면 draw call 하나다.
  크기 `LAMP.glowSize`는 설문 배율(3.38) 기준 월드라 지도 배 배율에 비례시켜 줄일 것.
- **번짐 그림을 2D 캔버스 그라데이션으로 만들지 말 것.** 폰(iOS)에서 번짐 안에 무지개 점이 났다 — 캔버스는 알파를 곱해 저장하고
  그라데이션에 떨림을 넣어서 GPU에 올리며 다시 나누면 옅은 가장자리에서 R·G·B가 제각각 튄다. `GLOW_LAMP`로 픽셀마다 알파를
  계산해 `DataTexture`로(설문 `makeGlowTexture` — 흰색 + 알파, 128px, `LinearFilter`/`LinearMipmapLinearFilter`, 밉맵 켜기.
  **DataTexture 기본값은 최근접 필터·밉맵 없음**이라 안 바꾸면 계단이 진다). 지도의 다른 번짐·스프라이트도 같은 원칙.
- 유리 emissive 세기 `LAMP.glass`(1.3)는 설문 톤에서 하얗게 날아가지 않는 값이다. 지도는 조명이 다르니 스크린숏으로 확인.

### 18.7 색 눈금 — 지도 조명에서 다시 잴 것

`BOAT_PAINT`는 **설문 낮 조명에서 렌더된 색이 레퍼런스가 되도록 거꾸로 푼 재질 색**이다(설문 조명은 재질 색의 약 40%만 화면에 낸다).
지도는 `look-tokens.js`로 조명 비율은 같지만 태양 방향·카메라 거리·안개가 달라서 결과가 다를 수 있다.
1. 먼저 `BOAT_PAINT` 그대로 넣고 낮(`?time=day`) 스크린숏을 설문과 나란히 본다.
2. 차이가 크면 재기: 부품 색 uniform을 잠깐 초록(0,1,0)으로 바꿔 렌더한 장과 원래 장의 차이로 그 부품 픽셀만 골라
   원래 렌더의 가운데 값을 `BOAT_PAINT_REFERENCE`와 비교 → 채널별 비율(선형 공간)로 재질 색을 다시 푼다(설문 HANDOFF 6.17).
   흰색을 넘으면 색상은 지키고 밝기만 낮춘다. 톤 매핑 때문에 한 번에 안 맞으니 두 번 돌린다.
3. **지도에서 값을 바꿔야 하면 `BOAT_PAINT`를 고치지 말고** 지도 쪽 배수(예: `MAP_PAINT_GAIN`)를 두거나, 두 화면 조명을 맞춘다 —
   `BOAT_PAINT`를 바꾸면 설문 배가 바뀐다.

### 18.8 확인 체크리스트

- [ ] selfcheck에 부품 판정 개수(마스트 ≥1 · 옆판 2 · 디딤판 ≥2)와 갑판 비율(0.5~0.95) assert — 모델을 다시 뽑으면 조용히 틀어진다
- [ ] 낮·밤 스크린숏을 설문 배 근접과 나란히(설문 캡처는 사용자에게 받거나 루트 `index.html?mock=1`을 띄워서)
- [ ] draw call·프레임 시간이 늘지 않았는지(패치 합치기·램프 합치기) — 80척 기준
- [ ] standalone 빌드 통과 (`SHARED_ORDER`에 `boat-look.js`)
- [ ] 이 장 맨 아래에 "지도 세션 답신"으로 무엇을 옮겼고 무엇을 뺐는지 적기 — 설문 세션이 다음에 읽는다

