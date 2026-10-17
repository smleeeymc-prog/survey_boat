# UX 점검 — 「그래도, 여기 살고 있습니다」 (2026-10-17, 브랜치 `ux-improve`)

설문(루트 `index.html` · `ui/`)·머무름의 지도 둘러보기(`statistics/explore.html`)·통계 시트·전시 화면(`statistics/index.html`)을
폰 화면(390×844)으로 처음부터 끝까지 지나가며 캡처하고, 누르는 자리 크기·글자 크기·흐름을 재서 아래 원칙에 비춰 봤다.
**이 브랜치는 main 에 합치기 전 시험용이다.** 미리보기 링크는 맨 아래.

## 1. 기준으로 삼은 원칙

| 원칙 | 기준 | 출처 |
|---|---|---|
| 시스템 상태 보이기 · 알아보기 쉬움(기억에 기대지 않기) · 사용자 통제와 자유 · 오류 예방 — 닐슨 휴리스틱 10가지 | 지금 어디인지, 무엇을 고를 수 있는지, 왜 못 넘어가는지 화면이 말해 준다 | [The Decision Lab — Nielsen's Heuristics](https://thedecisionlab.com/reference-guide/design/nielsens-heuristics), [Codecademy — Usability Heuristics](https://www.codecademy.com/resources/docs/uiux/usability-heuristics) |
| 누르는 자리 크기 | WCAG 2.2 AA 24×24px(최소), Apple 44pt · Material 48dp(권장). 보이는 크기는 그대로 두고 누르는 자리만 넓혀도 된다 | [touch target size 요약](https://specification.website/spec/accessibility/touch-target-size/), [Deque — Touch Target Spacing](https://docs.deque.com/devtools-mobile/2025.7.2/en/ios-touch-target-spacing) |
| 글자 대비 | 본문 4.5:1, 큰 글자 3:1 (WCAG 1.4.3) | [W3C Understanding 1.4.3](https://w3c.github.io/wcag/understanding/contrast-minimum.html) |
| 모바일 설문 | 한 화면에 한 질문, 진행 표시, 아래쪽 이전·다음 | [Iowa — survey design best practices](https://dxtraining.iowa.gov/qualtrics/understanding-qualtrics-cx/guide-creating-great-surveys/survey-design-best-practices), [Google Open Health Stack — Data Capture](https://developers.google.com/open-health-stack/design/data-capture-guideline), [SurveyMonkey — mobile-friendly surveys](https://www.surveymonkey.com/learn/survey-best-practices/mobile-friendly-surveys/) |
| 진행 표시 | 불확실함을 줄이고 기다림을 짧게 느끼게 한다 | [NN/g — Progress Indicators](https://nngroup.com/articles/progress-indicators) |
| 색 고르기 팝오버 | 버튼이나 링크에서 열고, 바깥을 누르거나 색을 고르면 닫힌다. 미리 정한 팔레트가 기본이고 직접 고르기는 덧붙인다 | [SAP Fiori — Color Palette Popover](https://www.sap.com/design-system/fiori-design-web/v1-139/ui-elements/color-palette-popover-web-component/usage), [Canva — Color selection](https://canva.dev/docs/apps/design-guidelines/color-selection) |
| 팝오버 접근성 | Esc·바깥 누르기로 닫고, 닫으면 초점을 연 버튼으로 돌려준다. 초점을 가두지 않는다 | [ezud — Accessible Modal Dialog](https://ezud.com/accessible-modal-dialog-design/), [Red Hat — Dialog accessibility](https://ux.redhat.com/elements/dialog/accessibility/) |
| 움직임 줄이기 | `prefers-reduced-motion` 을 따른다 (WCAG 2.3.3) | [W3C Understanding 2.3.3](https://w3c.github.io/wcag/understanding/animation-from-interactions.html) |
| 전시장 화면 | 대기 화면이 "만질 수 있다"를 보여 주고, 다음 사람에게 넘어갈 때 처음으로 돌아간다 | [Te Papa — screensaver 원칙](https://dls.tepapa.govt.nz/_pages/principles/screensaver/), [HCI patterns — attraction space](https://hcipatterns.org/patterns/borchers/attraction-space/attraction-space.html), [Intuiface — attract attention](https://www.intuiface.com/blog/design-tip-3-for-creating-multi-touch-experiences-attract-attention) |

## 2. 진단

심각도 — **높음**: 참여를 막거나 잘못 고르게 한다 · **중간**: 헤매게 한다 · **낮음**: 다듬기.

| # | 어디 | 문제 | 원칙 | 심각도 | 조치 |
|---|---|---|---|---|---|
| 1 | Ⅵ 색 | 팔레트 9개 + 명암 판 + 색조 막대 + 원톤/투톤 + 칠할 곳 칩이 한꺼번에 펼쳐져 판이 붐빈다. 칠할 곳 칩이 투톤+소품이면 두 줄로 꺾인다 | 점진적 공개, 미학과 최소 디자인 | 중간 | **고침** — 칠할 곳을 가로 한 줄 버튼(지금 색 동그라미 포함)으로, 색은 누른 버튼 오른쪽 위 창에서 (사용자 지정) |
| 2 | 모든 단계 | 테스트용 "룩 ▾" 버튼이 참여자 화면 오른쪽 위에 늘 떠 있다(세부 지역에선 등대, 아카이브에선 제목과 겹침) | 미학과 최소 디자인, 일관성 | 중간 | **고침** — `?dev=1` 일 때만 |
| 3 | Ⅰ 지역 · Ⅱ 상태 | 세로 선택지가 한 번에 2~3줄만 보여 아래에 선택지가 더 있는지 안 보인다(지역 5개 중 처음엔 2개). 키보드로는 못 고른다 | 알아보기 쉬움, 접근성 | **높음** | **고침** — 오른쪽에 위·아래 버튼(끝에 닿으면 흐려짐), ↑↓·Home·End |
| 4 | Ⅰ 세부 지역 · Ⅲ 문장 · Ⅶ 공개 | "다음/제출하기"가 회색으로 잠겨도 이유가 없다 | 오류 예방, 상태 보이기 | 중간 | **고침** — 버튼 옆에 "지도에서 골라주세요" · "한 문장을 적어주세요" · "별칭을 적어주세요" · "동의에 체크해 주세요" |
| 5 | 결과 | 인터넷이 끊긴 채 제출해도 "쌓였습니다"라고 한다(실제로는 이 기기 대기열에 있다가 연결되면 올라간다) | 상태 보이기(정직하게) | 중간 | **고침** — 끊겨 있으면 "연결되면 문장이 자동으로 올라가요" |
| 6 | 둘러보기 | "새 배가 도착했어요 · 보기" 알림이 31px, 통계 필터 칩이 33px로 낮다 | 누르는 자리 크기 | 낮음 | **고침** — 보이는 크기는 그대로, 누르는 자리만 넓힘 |
| 7 | 아카이브 | 상태 탭이 화면 밖으로 이어지는데 표시가 없다("돌아온…"에서 잘림) | 알아보기 쉬움 | 낮음 | **고침** — 오른쪽 끝을 흐리게 |
| 8 | 설문 전체 | 키보드 초점 표시가 버튼마다 제각각(기본 파란 테두리는 어두운 바다에서 안 보임) | 접근성 | 낮음 | **고침** — 금색 초점선으로 통일(`:focus-visible`, 손가락엔 안 뜸) |
| 9 | 미리보기 | 브랜치 미리보기에서 시험 제출하면 실DB → 전시 지도에 뜬다 | 오류 예방 | **높음**(운영) | **고침** — 미리보기 주소는 목업, `?live=1` 로만 실DB |
| 10 | 결과 → 아카이브 → 지도 | "머무름의 지도 보러가기"가 카드 목록(제목 "머무름의 지도")으로 가고, 거기서 "머무름의 지도 더 보러가기"가 3D 지도로 간다 — 이름 하나가 두 화면을 가리킨다 | 일관성, 현실 세계와 맞추기 | 중간 | **제안** (이름은 작품 결정) |
| 11 | 설문 전체 | 휴대폰의 뒤로 가기(안드로이드 버튼·아이폰 쓸어넘기기)를 하면 앞 단계가 아니라 설문을 아예 떠난다(이어 쓰기가 있어 내용은 남음) | 사용자 통제와 자유 | 중간 | **제안** (단계마다 방문 기록을 남기면 해결, 하늘 연출과 엮여 중간 규모) |
| 12 | 이전·다음 | 글자 11px, 버튼 높이 35px — 09-30 사용자가 고른 70% 크기. 누르는 자리는 `::after` 로 47px까지 넓혀져 있어 기준은 넘는다 | 가독성 | 낮음 | **제안** — 글자만 13px로(버튼 크기 유지) |
| 13 | 하늘 내려앉기·병 떠오르기 | 3D 카메라 연출이 `prefers-reduced-motion` 을 따르지 않는다(글자 페이드만 따른다) | 움직임 줄이기 | 낮음 | **제안** — 그 설정이면 연출 시간을 줄이거나 바로 다음 장면 |
| 14 | 전시 화면 | 지도를 보는 관람객이 설문으로 들어갈 길이 화면에 없다(포스터·QR 이 따로 있다면 해당 없음) | 대기 화면이 행동을 부른다 | 중간 | **제안** — 화면 한쪽에 작은 QR + "당신의 문장도 띄워 보세요" |
| 15 | 결과 | "MY SENTENCE · 지금 이곳" — 영어·한국어 섞임 | 일관성 | 낮음 | **제안** |

이미 잘 되어 있어 손대지 않은 것 — 한 화면 한 질문 · 장 번호와 진행 막대(01/07) · "질문 7개 · 약 2분 · 익명" 첫 화면 안내 ·
이어 쓰기 · 계룡처럼 작은 시·군의 넓힌 누름 원 · 공개 동의 문장 전체를 누를 수 있는 라벨 · 통계 시트의 목차/이전·다음 ·
둘러보기 첫 안내(가운데 어둡게 + 손가락 그림).

## 3. 이번 브랜치에서 바꾼 것

- **색 단계** (`ui/survey.js` renderColor·buildPaintPop·placePaintPop, `ui/survey.css` `.paint-*`)
  - 원톤/투톤 아래에 칠할 곳 이름을 **가로 한 줄**(원톤: 배 / 투톤: 선체·갑판, + 고른 키워드의 소품). 버튼마다 지금 색 동그라미.
  - 팔레트·명암 판·색조 막대는 **늘 펼치지 않고**, 이름을 누르면 **그 버튼 오른쪽 위**에 작은 창으로 연다. 창 왼쪽 아래 꼬리가 버튼 모서리를 가리키고,
    화면 밖으로 나가면 안쪽으로 밀린다(꼬리는 버튼을 계속 가리킴). 고양이는 털 무늬 다섯.
  - 닫기: 같은 버튼 다시 누르기 · 바깥 누르기 · ✕ · Esc(초점은 버튼으로 돌아감). 색을 바꿔도 창은 열린 채라 여러 색을 차례로 대 볼 수 있다.
    바깥을 눌러 닫을 땐 화면을 다시 만들지 않아, 창이 열린 채 "다음"을 눌러도 한 번에 넘어간다.
  - 질문 아래 안내: "칠할 곳을 누르면 색을 고를 수 있어요."
- **테스트 메뉴 "룩"** — `?dev=1` 일 때만 (`index.html`, `dev/look-lab.js`)
- **세로 선택지** — 위·아래 버튼, 키보드 ↑↓·Home·End, 목록 이름(`ui/snap-picker.js`)
- **잠긴 다음 버튼의 이유** — `questionStep` 의 `setLock(이유)` (`ui/survey.js`, `.qhint`)
- **결과 화면 오프라인 문구** (`ui/survey.js` renderResult)
- **둘러보기 누르는 자리** — 새 배 알림, 필터 칩 (`statistics/css/explore.css`)
- **아카이브 탭 끝 흐림 · 금색 초점선** (`ui/survey.css`)
- **미리보기 = 목업** — `statistics/shared/db-config.js` dbMode: 주소가 `…-projects.vercel.app`(Vercel 미리보기)면 목업, `?live=1` 이면 실DB.
  실서비스 주소에는 걸리지 않는다.
- E2E 의 색 단계 조작을 새 모양에 맞춤(`firebase/test/e2e.mjs` — 칠할 곳 버튼을 눌러 창을 연 뒤 고른다).

검증: E2E(설문 → 에뮬레이터 → 지도) · `check-insights` 41/41 · 지도 단일 파일 빌드 · 폰 화면 캡처로 색 창 위치(왼쪽·가운데·오른쪽 끝 버튼),
닫기 네 가지, 창 열린 채 다음, 선택지 버튼·키보드, 잠금 이유 네 가지.

## 4. 결정이 필요한 제안 (우선순위 순)

1. **#10 이름 정리** — 카드 목록을 "모두의 문장"(또는 "문장들") 같은 다른 이름으로, 3D 지도만 "머무름의 지도". 결과 버튼은 "다른 사람들의 문장 보기".
2. **#11 뒤로 가기** — 질문 단계마다 브라우저 방문 기록을 남겨, 뒤로 가기 = "이전" 버튼. 결과 이후엔 처음으로.
3. **#14 전시 화면 QR** — 전시장에 설문 안내물이 따로 없다면.
4. **#12 이전·다음 글자 13px** · **#13 움직임 줄이기 설정 존중** · **#15 영어 라벨**.

## 5. 미리보기

`ux-improve` 브랜치를 푸시하면 Vercel 두 프로젝트(설문 `survey-test` · 지도 `survey-boat`)가 미리보기를 만든다.
미리보기 주소는 **목업 데이터**로 돈다(화면 아래 "PROTOTYPE · 목업 데이터" 배지). 실DB로 보려면 주소 끝에 `?live=1`
— 그때 제출하면 실제 기록이 되니 시험 제출은 하지 말 것. 테스트 메뉴 "룩"은 `?dev=1`.
