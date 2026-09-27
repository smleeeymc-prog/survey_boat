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

- [ ] 1. `main.js` 조명을 5.1처럼 `SCENE_LOOK`·`HEMI`로 (Ambient·Sun 배수 + HemisphereLight 추가)
- [ ] 2. `fleet.js` 재질 복제 뒤 `roughness = min(…, SCENE_LOOK.roughnessCap)`
- [ ] 3. 캔버스 `filter: var(--scene-grade)` + 비네트 층 (5.2)
- [ ] 4. `build-standalone.mjs` `SHARED_ORDER`에 `"look-tokens.js"` 추가, 번들 크기(≈ +1.2MB GLB) 확인
- [ ] 5. `fleet.js` "[함정 2] Cabin 노드에는 재질이 없다" 주석 갱신 (Cabin에 크림색 비금속 재질이 있다)
- [ ] 6. 튜브 = **가족** — 지도 문구·범례·통계 설명에 '관계=튜브'가 남았는지
- [ ] 7. **사용자 확인:** 지도도 캐빈 색을 키워드와 끊을지 (4장 1번) → 정해지면 `style.js`
- [ ] 8. (선택) 구운 AO (5.3)
- [ ] 9. `statistics/README.md`에 `look-tokens.js`·`--scene-grade` 항목 추가

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
