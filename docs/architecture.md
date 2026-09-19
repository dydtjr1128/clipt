# Clipt 아키텍처 설계

> 대상: Chrome 확장 (Manifest V3). 구조·데이터 흐름·핵심 알고리즘의 기준 문서. 구현이 달라지면 함께 갱신한다.

## 1. 설계 목표

| 목표 | 의미 | 설계 반영 |
| --- | --- | --- |
| 결과 신뢰 | 오버레이·패널·커서가 결과에 찍히지 않음 | 캡처 직전 오버레이 완전 제거 → 렌더 대기 → 캡처의 3단계 고정. 녹화 중 표시는 사용자가 켠 경우에만 |
| 끊기지 않는 흐름 | 팝업이 닫혀도, 서비스 워커가 잠들어도 작업 계속 | 작업 상태를 `storage.session`에 두고 서비스 워커가 조정, 미디어는 오프스크린이 보유 |
| 최소 권한 | 상시 host 권한 없음 | `activeTab` + 동적 주입 |
| 정확한 픽셀 | DPR·브라우저 확대·스크롤에도 좌표 일치 | CSS px / device px를 타입으로 구분하고 변환 지점을 한 곳으로 |
| 확장 가능 | 캡처 4종·녹화 3종이 같은 뼈대 공유 | "대상 결정 → 소스 확보 → 후처리 → 배출"의 공통 파이프라인 |

## 2. 기술 스택 (결정)

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 언어 | TypeScript (strict) | 좌표·스티칭 계산의 안전성 |
| 프레임워크 | **WXT** (Vite 기반) | 2026년 기준 가장 활발히 유지되는 확장 프레임워크. manifest 생성·HMR·zip·다중 브라우저 빌드 내장. CRXJS는 유지보수가 둔화됨 |
| UI | **Preact + @preact/signals** | 팝업·패널·결과 페이지 규모에 React는 과함. 콘텐츠 스크립트 번들 최소화 |
| 스타일 | 순수 CSS + 디자인 토큰(CSS 변수) | 콘텐츠 UI는 Shadow DOM 안에서 동작하므로 전역 유틸리티 CSS 불필요. 토큰은 `docs/ux-design.md` |
| 상태 | signals(컨텍스트 내) + `chrome.storage.session`(작업) + `chrome.storage.sync`(설정) | 컨텍스트 경계가 명확해 전역 스토어 라이브러리 불필요 |
| 저장 | IndexedDB (`idb` 래퍼) | 결과 Blob·녹화 chunk는 메시지로 전달 불가 |
| 영상 후처리 | `fix-webm-duration`(webm 메타 보정), GIF는 후속(WebCodecs 기반 인코더) | 용량이 큰 ffmpeg.wasm은 채택하지 않음 |
| 테스트 | Vitest (단위) + Playwright (확장 로드 E2E) | [#19](https://github.com/dydtjr1128/clipt/issues/19) |
| 린트 | ESLint + Prettier, 사용자 노출 문자열 리터럴 금지 규칙 | i18n 강제 |

## 3. 디렉터리 구조

```text
src/
├── entrypoints/                 # WXT 규약: 파일 = 진입점
│   ├── background.ts            # 서비스 워커
│   ├── popup/                   # 툴바 팝업 (index.html, main.tsx)
│   ├── content.ts               # 콘텐츠 스크립트 (registration: runtime, 동적 주입)
│   ├── offscreen/               # 오프스크린 문서
│   ├── result/                  # 결과 페이지
│   ├── options/                 # 설정 페이지 (팝업 설정 섹션과 컴포넌트 공유)
│   └── permission/              # 마이크 권한 요청 전용 페이지 (1회)
├── core/                        # 브라우저 API 의존 없는 순수 로직 (단위 테스트 대상)
│   ├── geometry.ts              # Rect, CssPx/DevicePx 브랜드 타입, 변환
│   ├── stitch-plan.ts           # 스크롤 조각 계획, 마지막 조각 계산, 축소 배율
│   ├── element-path.ts          # 요소 경로·깊이·형제 이동 규칙
│   ├── media-profile.ts         # 포맷·코덱 후보 목록, mimeType 선택 규칙
│   ├── filename.ts              # 파일명 규칙
│   ├── settings.ts              # 스키마·기본값·마이그레이션
│   └── errors.ts                # 오류 분류
├── background/
│   ├── jobs.ts                  # 작업 상태 머신 (storage.session)
│   ├── capture-service.ts       # captureVisibleTab 래퍼 + 속도 제한 큐
│   ├── stitch.ts                # OffscreenCanvas 스크롤 스티칭·크롭
│   ├── pipelines/               # 모드별 캡처·녹화 흐름
│   ├── recording-service.ts     # tabCapture streamId, 오프스크린 제어
│   ├── router.ts                # 메시지 라우팅
│   └── badge.ts
├── content/
│   ├── overlay/                 # Shadow host, 레이어 관리, 토스트
│   ├── dom-tree.ts              # Shadow DOM을 넘는 트리 어댑터, 좌표 아래 요소 탐색
│   ├── element-picker.ts        # 요소 호버·클릭 고정
│   ├── element-session.ts       # 호버·고정 + 패널 + 키보드 조정 흐름
│   ├── panel/SelectionPanel.tsx # 선택 패널(Preact, Shadow DOM 안)
│   ├── selection.ts             # 선택 UI 수명, select:done 전송
│   ├── region-selector.ts       # 드래그 영역 선택
│   ├── page-probe.ts            # 페이지 측정, fixed 요소 숨김, 스크롤 제어
│   ├── countdown.ts
│   └── rec-indicator.ts         # 녹화 중 표시 (옵션)
├── offscreen/
│   ├── recorder.ts              # MediaRecorder + chunk 저장
│   ├── frame-cropper.ts         # 영역·요소 녹화용 프레임 크롭(MediaStreamTrackProcessor)
│   ├── audio-mixer.ts           # 탭·마이크 오디오 합성, 탭 소리 재생 유지
│   └── clipboard.ts
├── shared/
│   ├── messages.ts              # 메시지 타입 유니온 + 타입 안전 send/on 헬퍼
│   ├── db.ts                    # IndexedDB 스키마
│   └── i18n.ts                  # t() 헬퍼
├── components/                  # Preact 공용 UI (Button, Segmented, Toggle, Slider, Toast, KeyHint)
└── styles/tokens.css            # 디자인 토큰
public/_locales/{ko,en}/messages.json
tests/{unit,e2e,fixtures}/       # fixtures: 고정 헤더·지연 로딩·Shadow DOM 테스트 페이지
```

## 4. 실행 컨텍스트와 책임

```text
┌────────────┐  클릭/단축키   ┌──────────────────┐  주입/명령    ┌─────────────────┐
│   Popup    │ ─────────────▶ │  Service Worker  │ ───────────▶ │ Content Script  │
│ 메뉴·설정   │ ◀── 상태 ────  │  작업 조정자      │ ◀── 측정/선택 │ 오버레이·측정     │
└────────────┘                │  captureVisibleTab│              └─────────────────┘
                              │  tabCapture id    │
                              └───────┬──────────┘
                                      │ 이미지 조각 / streamId / 명령
                                      ▼
                              ┌──────────────────┐   IndexedDB   ┌─────────────────┐
                              │ Offscreen Doc    │ ────────────▶ │  Result Page    │
                              │ 스티칭·녹화·복사  │   (id 전달)    │  미리보기·저장    │
                              └──────────────────┘               └─────────────────┘
```

| 컨텍스트 | 소유 | 주로 쓰는 API | 하지 않는 것 |
| --- | --- | --- | --- |
| 서비스 워커 (`entrypoints/background.ts`, `background/`) | 작업 상태 머신, 권한 있는 API 호출, 컨텍스트 생성·정리, 배지, 결과 페이지 열기 | `tabs.captureVisibleTab`, `tabCapture.getMediaStreamId`, `scripting`, `offscreen`, `action`, `commands`, `downloads`, `storage.session` | 픽셀 처리, DOM 접근, 미디어 스트림 보유 |
| 콘텐츠 스크립트 (`entrypoints/content.ts`, `content/`) | 사용자 선택 UI, 페이지 측정·스크롤·스타일 임시 변경과 복원, 녹화 중 표시(옵션) | DOM, `runtime.onMessage` | 캡처 API 호출, Blob 보관 |
| 오프스크린 (`entrypoints/offscreen/`, `offscreen/`) | 캔버스·MediaRecorder·오디오 합성·클립보드, IndexedDB 쓰기 | `OffscreenCanvas`, `getUserMedia`, `MediaRecorder`, `AudioContext`, `navigator.clipboard`, IndexedDB | 사용자 입력, `chrome.*` 대부분(오프스크린은 `runtime`만 사용 가능) |
| 팝업 (`entrypoints/popup/`) | 진입 메뉴, 설정 편집, 진행·녹화 상태 표시 | `storage.session`(구독), `storage.sync`, 메시지 전송 | 작업 진행 자체(닫혀도 무관해야 함) |
| 결과 페이지 (`entrypoints/result/`) | 결과 소비, 포맷 변환(후속: GIF) | IndexedDB, `downloads`, `navigator.clipboard` | 새 캡처 시작(팝업으로 안내) |
| 권한 페이지 (`entrypoints/permission/`) | 마이크 `getUserMedia` 권한 프롬프트 1회 | `getUserMedia` | 그 외 |

콘텐츠 스크립트는 `chrome.scripting.executeScript`로 필요할 때만 주입한다. 주입 여부는 PING 메시지 응답으로 확인해 중복 주입을 막는다(#3).

오프스크린 문서는 `background/offscreen.ts`의 `ensureOffscreen(reasons)`로만 만든다. 한 번에 하나만 존재할 수 있으므로 생성 중인 요청을 공유하고, `runtime.getContexts`로 존재 여부를 확인한다. 서비스 워커가 종료돼도 오프스크린 문서는 살아 있어 녹화가 이어진다.

## 5. 작업(Job) 상태 머신

모든 기능은 하나의 Job이다. Job은 `storage.session`의 `job` 키 하나에만 존재한다(동시 작업 1개).

```ts
type Mode =
  | 'visible' | 'fullpage' | 'region' | 'element'
  | 'rec-tab' | 'rec-region' | 'rec-element';

type Job = {
  id: string; mode: Mode; tabId: number; windowId: number;
  phase: 'selecting' | 'preparing' | 'capturing' | 'countdown' | 'recording' | 'finalizing';
  createdAt: number;
  startedAt?: number;           // recording 진입 시각 (타이머 기준)
  target?: Rect<'css'>;         // 영역·요소 모드에서 확정된 범위
  progress?: { done: number; total: number };
};
```

```text
캡처:  idle ─▶ selecting ─▶ preparing ─▶ capturing ─▶ finalizing ─▶ idle
             (영역·요소만)   (오버레이 제거, fixed 숨김)          (배출: 결과/다운로드/복사)
녹화:  idle ─▶ selecting ─▶ countdown ─▶ recording ─▶ finalizing ─▶ idle
             (영역·요소만)
어느 단계든 ─▶ cancelled ─▶ idle  (Esc, 단축키 재입력, 탭 닫힘, 오류)
```

- 모델과 전이 규칙은 `core/job.ts`(순수 함수), 저장·전이 실행은 `background/jobs.ts`가 맡는다.
- 전이는 서비스 워커의 `transitionJob(id, next)`만 수행하고, 다른 컨텍스트는 메시지로 요청만 보낸다. 허용되지 않은 전이는 `INVALID_TRANSITION`, 이미 작업이 있으면 `JOB_ACTIVE`로 거부한다.
- 작업 변경은 서비스 워커 안에서 직렬화해 동시 요청이 겹쳐도 작업이 하나만 생긴다.
- 팝업은 `job:state` 방송 대신 `storage.session`의 `job` 키를 `storage.onChanged`로 구독한다. 수신자가 없을 때의 메시지 오류가 없고 팝업을 다시 열어도 즉시 현재 상태를 읽는다.
- 서비스 워커 재기동 시 `restoreJob()`이 남은 작업을 판정한다(`core/job.ts`의 `restoreAction`).

| 남은 단계 | 처리 |
| --- | --- |
| `selecting`, `countdown` | 유지. 콘텐츠 스크립트가 진행 중 |
| `recording`, `finalizing`(녹화) | 오프스크린 문서가 있으면 유지하고 배지 복원, 없으면 정리 |
| `preparing`, `capturing`, `finalizing`(캡처) | 서비스 워커가 진행하던 단계라 정리 |

- 정리한 경우 `storage.session`의 `lastError`에 `INTERRUPTED`를 남긴다. 페이지 스타일 복원 지시(`page:restore`)는 해당 파이프라인 이슈(#6)에서 추가한다.
- 콘텐츠 스크립트는 `pagehide`에서 자신이 바꾼 스타일을 복원한다.

## 6. 메시지 프로토콜

`src/shared/messages.ts`의 `Protocol` 인터페이스에 수신 컨텍스트별 메시지 시그니처를 정의하고, 보낼 때는 `send(target, type, payload)` / `sendToTab(tabId, type, payload)`, 받을 때는 `listen(target, handlers)`만 사용한다.

- **봉투**: `{ __clipt: 1, target, type, payload }`. 표식과 `target`이 맞지 않으면 응답하지 않아 올바른 수신자가 답한다.
- **응답**: `{ ok: true, data }` 또는 `{ ok: false, error: { code, message } }`. `send`는 오류 응답을 `CliptError`로 다시 던지고, 응답이 없으면 `NO_HANDLER`.
- **대용량 데이터**: 이미지·영상 Blob은 메시지로 보내지 않는다. IndexedDB(10절)에 저장하고 `resultId`만 주고받는다.

구현된 메시지:

| 이름 | 방향 | 용도 |
| --- | --- | --- |
| `job:start {mode, tabId?}` | popup/commands → SW | 작업 시작. `tabId`가 없으면 마지막으로 포커스된 창의 활성 탭 |
| `job:cancel {jobId?}` | any → SW | 취소 |
| `job:stop {jobId?}` | popup → SW | 녹화 중지·결과 저장 (9.1절) |
| `job:get` | any → SW | 현재 작업 조회. 복원이 끝난 뒤의 상태를 돌려준다 |
| `tab:status {tabId}` | popup → SW | 탭 사용 가능 여부와 제한 사유 (13절) |
| `job:pause` / `job:resume {jobId?}` | popup → SW | 녹화 일시정지·재개 (9.1절) |
| `rec:ended {jobId, resultId}` | OS → SW | 탭이 닫히는 등으로 녹화 스트림이 끝나 저장함 |
| `rec:start` / `rec:pause` / `rec:resume` / `rec:stop` / `rec:discard` / `rec:status` | SW → OS | 녹화 제어 (9.1절) |
| `result:objectUrl {resultId}` | SW → OS | 결과 Blob URL (다운로드용) |
| `content:ping` | SW → CS | 콘텐츠 스크립트 주입 여부 확인 |
| `page:probe` | SW → CS | 뷰포트·스크롤·`scrollHeight`·DPR·내부 스크롤 여부 |
| `page:prepare {hideScrollbar}` / `page:hideFixed` / `page:restore` | SW → CS | 캡처 전후 페이지 조정과 원상 복구 (8.1절) |
| `page:scrollTo {y, lazyWaitMs}` | SW → CS | 스크롤 후 렌더·지연 이미지 대기, 실제 scrollY 응답 |
| `select:start {jobId, kind, forRecording}` / `select:cancel` | SW → CS | 선택 UI 열기(즉시 응답) / 팝업 취소 시 닫기 |
| `select:done {jobId, target, page, selector?}` | CS → SW | 사용자가 확정. 오버레이를 지우고 2프레임 뒤 측정한 페이지 상태와 대상(x는 뷰포트, y는 문서 기준)을 보냄. SW가 이어서 캡처 |
| `select:cancelled {jobId}` | CS → SW | 선택 UI에서 Esc·취소 |
| `countdown:start {seconds, mode}` / `countdown:cancel` | SW → CS | 카운트다운. 완료 true, Esc false |
| `indicator:show` / `indicator:state` / `indicator:hide` | SW → CS | 녹화 중 표시(옵션, 9.4절) |
| `page:resized {jobId}` | CS → SW | 영역·요소 녹화 중 뷰포트 크기 변경 (9.2절) |
| `offscreen:ping` | SW·페이지 → OS | 오프스크린 응답 확인 |

기능 이슈에서 추가할 메시지:

| 이름 | 방향 | 용도 |
| --- | --- | --- |
| `clipboard:write {resultId}` | SW → OS | 복사 |

장시간 흐름(진행률, 녹화 tick)은 `chrome.runtime.connect` 포트, 단발 요청은 `sendMessage`.

## 7. 좌표 체계

```ts
type CssPx = number & { __unit: 'css' };
type DevicePx = number & { __unit: 'device' };
type Rect<U extends 'css' | 'device'> = { x: number; y: number; w: number; h: number; unit: U };
function toDevice(rect: Rect<'css'>, dpr: number): Rect<'device'>;
```

- 콘텐츠 스크립트가 주는 모든 좌표는 **뷰포트 기준 CSS px** + 당시 `devicePixelRatio`(브라우저 확대 반영값)와 `scrollX/Y`.
- `captureVisibleTab` 결과와 탭 스트림 프레임은 **device px**. 크롭·스티칭은 오프스크린에서 device px로만 계산한다.
- 변환은 `toDevice` 한 곳에서만, 반올림 규칙(좌상단 floor, 우하단 ceil) 고정.
- 문서 좌표가 필요한 경우(뷰포트 초과 요소)는 `docRect = viewportRect + scroll`로 만들어 스티칭 계획에 넘긴다.

## 8. 캡처 파이프라인

공통 4단계: **대상 결정 → 소스 확보 → 후처리 → 배출**

| 모드 | 대상 | 소스 | 후처리 |
| --- | --- | --- | --- |
| 보이는 화면 | 뷰포트 | shot 1회 (`background/pipelines/visible.ts`: 팝업 닫힘 대기 → 대상 탭이 활성인지 확인 → 뷰포트·DPR 측정 → 캡처) | 없음 |
| 영역 | 드래그 Rect | 뷰포트 안이면 shot 1회, 아니면 스티칭 | device 크롭 |
| 요소 | 요소 Rect | 동일 | 동일 |
| 전체 페이지 | 문서 전체 | 스티칭 | 없음 |

### 8.1 스크롤 스티칭 (`core/stitch-plan.ts` + `background/stitch.ts`)

전체 페이지 캡처는 스크롤 스티칭만 지원한다(`chrome.debugger` 방식은 채택하지 않음). 영역·요소 캡처에서 대상이 뷰포트를 넘을 때도 같은 코드를 쓴다.

1. `page:probe`로 뷰포트, 스크롤 위치, `scrollHeight`, dpr, 내부 스크롤 여부를 얻고 대상 문서 Rect를 정한다(전체 페이지는 `0, 0, 뷰포트 너비, scrollHeight`).
2. 계획(`planStitch`): 대상이 지금 화면 안에 다 들어오면 스크롤 없이 한 조각. 아니면 대상 위쪽부터 뷰포트 높이씩 나누되 스크롤은 최대 스크롤 위치에서 멈추고, 그 화면에 보이는 남은 부분만 붙인다. 조각 높이 합 = 대상 높이, 겹침 없음.
3. 캔버스 한계(Chrome: 한 변 32767px, 면적 16384²)를 넘으면 계획 단계에서 축소 배율을 정하고 결과 메타 `scaled`에 기록한다.
4. `page:prepare`: 스크롤 위치·`scroll-behavior`를 기억하고 조각이 여러 개면 스크롤바를 숨긴다. 두 번째 조각부터 `page:hideFixed`로 `position: fixed|sticky` 요소를 `visibility: hidden`(레이아웃 유지)으로 숨겨 고정 헤더가 한 번만 나오게 한다.
5. 조각마다 `page:scrollTo` → 콘텐츠는 `scrollTo(behavior: instant)` 후 2프레임 대기, 뷰포트 안 미완료 이미지를 `decode`로 기다리고(최대 `lazyWaitMs`) 다시 2프레임 뒤 **실제 scrollY**를 돌려준다. 자를 위치는 요청값이 아니라 실제 위치로 계산한다.
6. `captureShot`(초당 2회 제한용 550ms 간격 큐) → 서비스 워커의 `OffscreenCanvas`에 `drawImage`. 이웃 조각 경계는 같은 반올림으로 계산해 소수 DPR에서도 틈·겹침이 없다(`pieceRects`). 이미지를 다른 컨텍스트로 보내지 않아도 돼 오프스크린 문서를 쓰지 않는다.
7. 끝나거나 실패·취소되면 `page:restore`로 숨긴 요소·스크롤바·스크롤 위치·인라인 스타일을 원래대로 되돌린다(원래 없던 `style`·`class` 속성은 지운다).
8. 진행률은 `job.progress`(배지 `3/12`, 팝업 진행 바). 페이지에서 Esc를 누르거나 팝업에서 취소하면 다음 조각 전에 멈춘다. 캡처 중에는 페이지에 토스트를 띄우지 않는다(결과에 찍히므로).

내부 스크롤 컨테이너를 쓰는 페이지(문서는 안 움직이고 `overflow: auto` 요소가 스크롤)는 probe가 감지해 결과 메타 `warnings: ['internal-scroll']`로 남기고 보이는 만큼 찍는다. 내부 스크롤러 스티칭은 후속 이슈.

### 8.2 요소 선택 (`content/element-picker.ts`, `content/dom-tree.ts`, `core/element-path.ts`)

- Shadow host 오버레이는 `pointer-events: none`이므로 `document.elementFromPoint`가 페이지 요소를 반환한다. 반환 요소가 `shadowRoot`를 가지면 `shadowRoot.elementFromPoint`로 반복해 내려간다.
- 선택 불가: 크기 0, `visibility: hidden`, `display: contents`, 오버레이 자신, `html`. 좌표 아래 요소가 선택 불가면 선택 가능한 조상으로 올라간다.
- 선택 중에는 창 캡처 단계에서 `pointerdown·up`, `mousedown·up`, `click`, `dblclick`, `auxclick`, `contextmenu`, `touchstart·end`를 막아 링크 이동 등 페이지 동작이 실행되지 않는다. 오버레이(패널) 안에서 시작한 이벤트만 통과한다. 종료 시 리스너와 `html` 커서 스타일을 원래대로 되돌린다.
- **iframe**: 1차에서는 `<iframe>` 자체를 하나의 요소로 취급한다. 내부 요소 탐색은 하지 않는다(동일 출처라도). 이유: 프레임 내부 좌표 변환·스크롤·스타일 복원을 두 문서에 걸쳐 해야 해 복잡도가 크고, 캡처는 어차피 화면 픽셀 기준이라 프레임 전체 선택으로 대부분의 요구를 충족한다. 후속 이슈로 남긴다.
- **경로 기준선**: 클릭 시 `anchor = 클릭 요소`, `path = [body … anchor]`, 깊이 `d`는 `path[d]`.
  - ↑ / 슬라이더 좌 → `d-1`, ↓ / 슬라이더 우 → `d+1` (`path` 안에서만)
  - ← / → → 현재 요소의 형제(선택 가능 요소만)로 이동. 이동 후 `anchor = 새 요소`, `path` 재계산, `d = path.length-1`
  - 경로 항목 클릭 → 해당 `d`
- 결과: 대상 범위(x는 뷰포트, y는 문서 기준, 가로는 화면 안으로 자름) + 선택자 경로(`body > div#card.card > p#p2`, 결과 메타 `selector`). 요소 참조는 콘텐츠 내부에만 둔다.
- 패널은 `element-session.ts`가 상태를 들고 Preact 컴포넌트는 그리기만 한다. 키 입력은 창 캡처 단계에서 처리하며, 확정 버튼이 아닌 버튼에 포커스가 있을 때의 Enter는 그 버튼 동작을 따른다. 패널 드래그는 헤더에 포인터 캡처를 걸어 페이지 클릭 차단과 충돌하지 않는다.

### 8.3 캡처 직전 보장 (모든 모드 공통)

```text
선택 확정 → 대상 범위 측정 → overlay.dispose() → 2프레임 대기 → page:probe → select:done
        → (SW) page:prepare → [요소: 고정 요소 숨김] → 스크롤·2프레임 → shot → … → page:restore
```

- 오버레이는 캡처 요청 전에 DOM에서 제거한다. 선택 UI의 테두리·라벨·패널은 결과에 들어갈 수 없다.
- 보이는 화면·전체 페이지는 팝업 컨텍스트가 사라질 때까지(최대 1초) 기다린 뒤 80ms 후 찍는다.
- **요소 캡처**는 첫 조각부터 `position: fixed|sticky` 요소를 숨겨 고정 헤더가 요소 위를 덮지 않게 한다. 선택한 요소 자신과 그 조상·자손인 고정 요소는 숨기지 않는다(`setCaptureTarget`). 영역 캡처는 사용자가 본 그대로를 담도록 두 번째 조각부터 숨긴다.
- 스타일을 바꾸거나 스크롤했으면 `page:scrollTo`로 2프레임 + 이미지 디코드를 기다린 뒤 찍는다(조각이 하나여도 동일).
- overflow 조상에 잘린 요소는 보이는 부분(`visibleRectOf`)만 대상으로 삼고, 패널에 "일부 잘림"을 표시하며 결과 메타 `warnings: ['clipped']`를 남긴다.
- 화면 밖 요소는 스티칭 계획이 해당 위치로 스크롤해 찍고, `page:restore`가 선택 당시 스크롤 위치로 되돌린다.

## 9. 녹화 파이프라인

### 9.1 흐름

```text
SW(background/pipelines/recording.ts):
  팝업 닫힘 대기 → tabCapture.getMediaStreamId({targetTabId}) → 탭 뷰포트 크기(device px, 짝수) 측정
  → offscreen.create({reasons:['USER_MEDIA','BLOBS']})  (있으면 재사용)
  → rec:start {streamId, audio, format, fps, bitrate, size}
OS(offscreen/recorder.ts):
  getUserMedia({video:{chromeMediaSource:'tab', maxWidth·maxHeight=size, minFrameRate=maxFrameRate=fps},
                audio: 탭 소리면 tab 소스})
   ├▶ 마이크 옵션이면 getUserMedia({audio:true}). 권한이 없으면 마이크 없이 녹화, 결과 warnings: mic-unavailable
   ├▶ audio-mixer: 탭 소리 → AudioContext.destination(사용자에게 계속 들림) + 녹화용 목적지
   │              마이크 → 녹화용 목적지만(하울링 방지) → 오디오 트랙 1개
   ├▶ 영역·요소 모드(#12): <video> → OffscreenCanvas.drawImage(crop) → canvas.captureStream(fps)
   └▶ MediaRecorder(mimeType, bitrate, timeslice=1000) → chunk를 IndexedDB `chunks`에 순서대로 append
SW: recording 전이(startedAt) → 배지 REC
중지(job:stop): finalizing → rec:stop → OS: stop 이벤트까지 대기 → chunk 병합 → webm 길이 메타 보정
              → results 저장 → chunk 삭제 → resultId → SW: 작업 종료 → 결과 페이지(또는 다운로드) → 오프스크린 닫기
```

- **해상도·프레임**: 크기 제약이 없으면 탭 캡처가 낮은 기본 해상도로 잡히고, 화면이 바뀌지 않으면 프레임이 나오지 않아 MediaRecorder가 데이터를 만들지 않는다. 탭 뷰포트 × DPR을 최대 크기로, `minFrameRate`를 fps로 준다.
- **메모리**: chunk를 1초마다 IndexedDB에 쓰고 메모리에 모으지 않는다. 녹화 길이와 관계없이 오프스크린 메모리가 일정하다.
- **길이 메타**: MediaRecorder의 webm에는 길이가 없어 탐색이 안 되므로 `fix-webm-duration`으로 채운다. 길이는 일시정지 구간을 뺀 실제 녹화 시간이다.
- **종료 경쟁**: 탭이 닫혀 트랙이 끝나면 MediaRecorder가 스스로 멈추며 마지막 데이터를 늦게 내보낸다. 상태만 보지 않고 항상 `stop` 이벤트를 기다린다(최대 5초).
- **일시정지**: `job:pause`·`job:resume` → 오프스크린 `MediaRecorder.pause()/resume()`. 작업에 `pausedAt`·`pausedTotal`을 기록해 팝업 타이머와 배지(`❚❚`)가 멈춘다.
- **취소**: `job:cancel` → `rec:discard`(스트림 정지, chunk 삭제) → 오프스크린 닫기. 결과를 만들지 않는다.
- **다운로드**: 서비스 워커에는 `URL.createObjectURL`이 없어 오프스크린이 만든 Blob URL(`result:objectUrl`)로 받고, 다운로드가 끝날 때까지 오프스크린을 유지한다.
- **E2E**: 툴바 클릭 없이 탭 캡처를 쓰도록 E2E 빌드에만 고정 `key`(scripts/e2e-key.json)로 확장 ID를 고정하고 `--allowlisted-extension-id`로 실행한다. `--use-fake-ui-for-media-stream`은 탭 캡처를 `NotFoundError`로 막아 쓰지 않으며, 확장 origin에는 마이크 권한을 줄 수 없어 마이크 합성은 단위 테스트와 수동 확인으로 검증한다.

### 9.2 대상 선택과 크롭

영역 녹화·요소 녹화는 캡처와 **같은 선택 UI**를 재사용한다(`forRecording`이면 문구와 주 버튼만 `● 녹화 시작`). 녹화는 보이는 화면만 담을 수 있어 녹화용 영역 선택은 현재 뷰포트 안으로 제한하고 가장자리 자동 스크롤을 끈다. 요소가 뷰포트 밖으로 걸치면 보이는 부분만 녹화하고 결과에 `clipped`를 남긴다.

```text
select:done(target: x 뷰포트, y 문서) → core/crop.ts normalizeCrop: 녹화 시작 시점 뷰포트 대비 비율(0~1)
→ selecting → countdown → beginRecording({crop}) → OS: cropTrack
   MediaStreamTrackProcessor(탭 트랙) → VideoFrame(visibleRect = 비율 × 실제 프레임 크기, 짝수 정렬)
   → MediaStreamTrackGenerator → MediaRecorder
```

- **캔버스 대신 프레임 단위 처리**: 오프스크린 문서는 화면에 보이지 않아 `requestAnimationFrame`이 돌지 않는다. `MediaStreamTrackProcessor`·`VideoFrame`·`MediaStreamTrackGenerator`는 렌더링과 무관하게 프레임마다 동작하고 복사 없이 잘라낸다.
- **비율 크롭**: 탭 캡처 프레임 크기가 요청과 조금 달라도 같은 영역을 자르도록 크롭을 비율로 넘긴다. I420 프레임은 짝수 정렬이 필요해 위치·크기를 짝수로 맞춘다.
- **시작 프레임 버림**: 탭 캡처가 시작할 때 선택 UI·카운트다운을 지우기 전 화면을 첫 프레임으로 보낼 수 있어, 모든 녹화 모드가 이 프레임 경로를 거치며 시작 후 250ms 동안의 프레임을 버린다(탭 녹화는 자르지 않고 통과).
- **좌표 고정**: 크롭은 녹화 시작 시점 화면 좌표로 고정한다. 스크롤해도 영역은 그대로이며, 요소 추적은 [#21](https://github.com/dydtjr1128/clipt/issues/21).
- **레이아웃 변경**: 영역·요소 녹화 중 대상 페이지가 이동하거나(`tabs.onUpdated` loading) 뷰포트 크기가 바뀌면(콘텐츠 `resize` → `page:resized`) 그때까지 저장하고 결과 `warnings: ['layout-changed']`. 탭 캡처는 요청 크기에 맞춰 프레임을 늘리거나 줄여 보내므로 프레임 크기만으로는 창 크기 변화를 알 수 없어 페이지에서 감지한다. 프레임 비율 변화도 보조로 감지한다. 탭 녹화는 이동·크기 변경에도 계속한다.
- **성능**: 크롭 단계는 받은 프레임을 그대로 내보낸다(E2E에서 1080p 절반 영역, 손실 없음 확인). 헤드리스 테스트 환경의 탭 캡처 자체는 약 21fps로 제한돼 30fps 유지는 실제 Chrome에서 확인한다.

### 9.3 미디어 프로파일 (`core/media-profile.ts`)

설정에서 고른 포맷을 후보 목록으로 펼쳐 `MediaRecorder.isTypeSupported`로 첫 지원 항목을 고른다. 모두 실패하면 다음 포맷으로 폴백하고 결과 페이지에 사유를 표시한다.

| 설정값 | 후보 mimeType (순서대로) | 비고 |
| --- | --- | --- |
| `mp4` | `video/mp4;codecs=avc1.64002A,mp4a.40.2` → `video/mp4;codecs=avc1,opus` → `video/mp4` | Chrome 126+ 네이티브 지원. 공유 호환성 최고 |
| `webm-vp9` | `video/webm;codecs=vp9,opus` → `video/webm;codecs=vp9` | 기본값. 화질 대비 용량 우수 |
| `webm-vp8` | `video/webm;codecs=vp8,opus` | 가장 넓은 호환, 구형 환경 |
| `webm-av1` | `video/webm;codecs=av01.0.08M.08,opus` | 지원 시에만 노출. 용량 최소, 인코딩 부하 큼 |
| `gif` | (녹화는 `webm-vp9`) → 결과 페이지에서 GIF 변환 | 후속 이슈. 길이 제한(예: 30초)·프레임 축소 필요 |

폴백 순서: `mp4 → webm-vp9 → webm-vp8`, `webm-av1 → webm-vp9 → webm-vp8`.

| 항목 | 선택지 | 기본 |
| --- | --- | --- |
| 프레임레이트 | 24 / 30 / 60 | 30 |
| 해상도 배율 | 100% / 75% / 50% (원본 device px 기준) | 100% |
| 비트레이트 | 자동(해상도·fps로 산출) / 낮음 / 높음 | 자동 |
| 오디오 | 없음 / 탭 소리 / 마이크 / 탭 + 마이크 | 탭 소리 |
| 최대 길이 | 5 / 10 / 30 / 60분 | 30 |

- **마이크**: 오프스크린 문서는 권한 프롬프트를 띄울 수 없으므로, 마이크 옵션을 처음 켤 때 `entrypoints/permission` 페이지를 열어 `getUserMedia({audio:true})`로 권한을 1회 받는다. 이후 오프스크린에서 마이크 스트림을 열 수 있다.
- **일시정지/재개**: `MediaRecorder.pause()/resume()`. 팝업 중지 버튼 옆에 일시정지 제공.

지원 확인 결과와 품질 옵션 적용 방식은 [media-support.md](media-support.md). 폴백이 일어나면 결과 메타 `fallbackReason`에 요청 포맷을 남기고 결과 페이지가 배너로 알린다(`entrypoints/result/ResultNotices.tsx`).

### 9.4 녹화 중 표시 (옵션)

설정 `record.indicator`로 선택한다. 결과 영상에 찍힐 수 있음을 설정 UI에 명시한다.

| 값 | 동작 | 결과 오염 |
| --- | --- | --- |
| `none` (기본) | 페이지에 아무것도 표시하지 않음. 배지·팝업·단축키로만 상태 확인 | 없음 |
| `border` | 녹화 영역(탭 모드는 뷰포트) 테두리 2px `--c-rec` | 테두리가 찍힘. 단, 영역·요소 모드에서는 테두리를 크롭 경계 **바깥** 2px에 그려 결과에 포함되지 않게 함 |
| `widget` | 우하단 플로팅 위젯(● 00:42 ⏸ ■). 드래그 이동 가능 | 위젯이 찍힘. 영역·요소 모드에서는 크롭 영역 밖에 배치 |

탭 모드 `border`·`widget`은 결과에 포함된다는 경고를 설정 항목 옆에 표시한다.

구현: `content/rec-indicator.ts`. 테두리는 크롭 경계에서 3px 띄워 그려 짝수 정렬 반올림에도 영상에 들어가지 않는다. 위젯은 크롭 영역과 겹치지 않는 모서리(오른쪽 아래 우선)에 두고 끌어 옮길 수 있으며, 일시정지·중지 버튼은 `job:pause`·`job:resume`·`job:stop`을 보낸다. 상태는 서비스 워커가 `indicator:state`로 알려 주고 타이머는 페이지에서 계산한다.

**카운트다운** (`content/countdown.ts`): 서비스 워커가 `countdown:start`를 보내면 페이지 중앙에 숫자를 보여 주고, 끝나면 오버레이를 지우고 2프레임 뒤 `true`로 응답한다. Esc면 `false`로 응답해 작업을 끝낸다. 스트림 id는 카운트다운 뒤에 받는다.

**최대 길이**: 새 권한(`alarms`) 없이 오프스크린이 chunk마다 녹화 시간을 확인해 `maxMs`에 도달하면 저장하고 `rec:ended`로 알린다(결과 `warnings: max-length`). 팝업은 1분 전부터 자동 중지 시각을 경고색으로 보여 준다.

### 9.5 종료 조건과 복구

- 종료: 팝업 중지, 위젯 중지, 단축키 토글, 최대 시간 도달, 대상 탭 닫힘, 스트림 `ended`.
- 탭 내비게이션: 탭 모드는 계속 녹화(탭 캡처는 문서 교체 후에도 유지). 영역·요소 모드는 레이아웃이 바뀌므로 중지 후 "페이지가 이동해 녹화를 마쳤어요" 안내.
- 복구(`shared/recover.ts`): 진행 중인 작업이 아닌 녹화의 chunk가 남아 있으면 결과 페이지가 배너로 복구·삭제를 제안한다. 복구는 chunk를 합쳐 결과로 저장하고(길이는 chunk 수로 어림, `warnings: recovered`) 그 결과 페이지로 이동한다.

## 10. 저장소 설계

### IndexedDB `clipt` (v1)

| 스토어 | 키 | 값 | 비고 |
| --- | --- | --- | --- |
| `results` | `id` | `ResultMeta`: `id, kind(image·video), mode, mime, width, height, bytes, createdAt` + 선택 `duration, fps, audio, pageUrl, pageTitle, selector, viewport{w,h}, dpr, scaled, fallbackReason` | 인덱스 `createdAt` |
| `blobs` | `id` | `Blob` | results와 동일 id |
| `chunks` | `[jobId, seq]` | `Blob` | 녹화 중 임시. 병합 후 삭제 |

- 구현: `shared/db.ts`(`saveResult`, `loadResult`, `deleteResults`, `pruneResults`, `appendChunk`, `readChunks`, `deleteChunks`, `listChunkJobIds`). 확장 페이지와 오프스크린 문서가 같은 origin이라 같은 DB를 공유한다.
- 보존: 결과는 24시간 또는 총 500MB 초과 시 오래된 것부터 삭제(`core/retention.ts`). 결과 페이지 진입·서비스 워커 기동 시 정리.
- `storage.session`: `job`, `lastError`.
- `storage.sync`: `settings`.

### 설정 스키마 (`core/settings.ts`)

```ts
type Settings = {
  version: 1;
  image: { format: 'png' | 'jpeg'; jpegQuality: number };            // 0.6~1, 기본 0.92
  record: {
    format: 'mp4' | 'webm-vp9' | 'webm-vp8' | 'webm-av1';            // 기본 'webm-vp9'
    fps: 24 | 30 | 60;                                                // 기본 30
    scale: 1 | 0.75 | 0.5;                                            // 기본 1
    bitrate: 'auto' | 'low' | 'high';                                 // 기본 'auto'
    audio: 'none' | 'tab' | 'mic' | 'tab+mic';                        // 기본 'tab'
    maxMinutes: 5 | 10 | 30 | 60;                                     // 기본 30
    countdownSeconds: 0 | 3 | 5;                                      // 기본 3
    indicator: 'none' | 'border' | 'widget';                          // 기본 'none'
  };
  afterCapture: 'result' | 'download' | 'clipboard';                  // 기본 'result'
  afterRecord: 'result' | 'download';                                 // 기본 'result'
  download: { saveAs: boolean; pattern: string };                     // 기본 false, 'clipt_{date}_{mode}'
  fullpage: { hideFixed: boolean; lazyWaitMs: number };               // 기본 true, 300
};
```

- 읽기(`resolveSettings`): 마이그레이션 → 기본값과 깊은 병합(모르는 키·타입이 다른 값 무시) → 선택지에 없는 값은 기본값으로(`OPTIONS`) → 범위 보정(JPEG 품질 0.6~1, 최대 길이 0~60분).
- 마이그레이션(`MIGRATIONS`): 키가 변환 전 버전인 함수 표를 현재 버전까지 순서대로 적용한다. v0(버전 필드 없는 평면 스키마 `imageFormat`·`videoFormat`·`includeTabAudio`) → v1. 스키마를 바꿀 때는 `SETTINGS_VERSION`을 올리고 함수를 추가한다.
- 저장(`shared/settings.ts`): `saveSetting(path, value)`가 한 항목을 바꿔 `storage.sync`에 즉시 저장하고, `watchSettings`로 다른 화면의 변경을 받는다.
- 화면(`components/SettingsForm.tsx`): 팝업 ⚙ 화면과 옵션 페이지가 같은 컴포넌트를 쓴다. 미지원 녹화 포맷은 `MediaRecorder.isTypeSupported`로 비활성, 마이크를 고르면 권한 상태를 확인해 권한 페이지 버튼을 보여 준다.

## 11. 배출(emit)과 결과 페이지

`background/emit.ts`의 `emitCapture()`가 설정(`afterCapture`)을 읽어 분기한다. 결과는 이미 IndexedDB에 저장된 뒤이며, 다운로드·복사가 실패하면 결과 페이지로 대신 연다. 배지 `✓`가 작업 종료 시 배지 초기화에 지워지지 않도록 작업을 먼저 끝내고 배출한다.

| 동작 | 처리 | 피드백 |
| --- | --- | --- |
| 결과 페이지 | `chrome.tabs.create({url: 'result.html?id=…'})`, 대상 탭 바로 오른쪽 | 새 탭 |
| 바로 다운로드 | `chrome.downloads.download({url, filename, saveAs})`. 이미지는 캡처 dataURL을 그대로 쓰고, 영상(Blob URL)은 녹화 이슈에서 오프스크린이 만든다. 파일명 규칙은 `core/filename.ts` | 배지 `✓` 2초 |
| 클립보드 | 대상 탭 문서에서 `scripting.executeScript`로 `navigator.clipboard.write([ClipboardItem({'image/png'})])`. 오프스크린 문서는 포커스를 가질 수 없어 이미지 쓰기가 막히므로, 팝업이 닫혀 포커스가 돌아온 페이지에서 쓴다. 클립보드는 PNG만 받으므로 이 설정이면 PNG로 캡처한다. 영상은 불가 → 결과 페이지 | 배지 `✓` 2초 |

결과 페이지는 `id`로 `results`+`blobs`를 읽어 표시한다. 영상 결과는 "다른 포맷으로 저장"에서 GIF 변환(후속)을 제공한다. 상세 UI는 `docs/ux-design.md` 8절.

## 12. 오류 분류와 사용자 메시지

| 코드 | 원인 | 사용자 노출 |
| --- | --- | --- |
| `RESTRICTED_PAGE` | chrome://, 웹스토어, 주입 실패 | 팝업 항목 비활성 + "이 페이지에서는 사용할 수 없어요" |
| `RATE_LIMITED` | captureVisibleTab 제한 | 내부 재시도, 노출 안 함 |
| `CANVAS_TOO_LARGE` | 스티칭 한계 | "페이지가 길어 N%로 축소해 캡처했어요" |
| `CAPTURE_FAILED` | API 오류 | "캡처에 실패했어요" + [다시 시도] |
| `PERMISSION_DENIED` | 탭 캡처·마이크 거부 | "권한이 거부됐어요" + 권한 페이지 링크 |
| `TAB_CLOSED` | 대상 탭 종료 | 녹화면 여기까지 저장, 캡처면 취소 |
| `UNSUPPORTED_FORMAT` | 포맷 미지원 | 폴백 포맷으로 저장 + 결과 페이지 배너 |
| `LAYOUT_CHANGED` | 영역·요소 녹화 중 페이지 이동·리사이즈 | "페이지가 바뀌어 녹화를 마쳤어요" |
| `INTERNAL_SCROLL` | 내부 스크롤 페이지 | 경고 후 진행 |

오류는 `lastError`에 저장해 팝업이 다음 오픈 시 표시하고, 콘텐츠 토스트가 있으면 즉시 표시한다.

## 13. 권한

```json
"permissions": ["activeTab", "scripting", "tabCapture", "offscreen", "storage", "downloads", "clipboardWrite"],
"commands": ["capture-visible", "capture-region", "capture-element", "toggle-recording",
             "capture-fullpage", "record-region", "record-element", "_execute_action"]
```

`host_permissions` 없음. 권한별 사용 사유와 activeTab 부여 조건은 [docs/store/permissions.md](store/permissions.md). 탭 접근은 `background/access.ts`의 `checkTab`이 URL 판정(`core/restricted.ts`) 후 실제 주입 가능 여부로 확인하고, 제한 페이지면 `job:start`가 `RESTRICTED_PAGE`(사유 `browser`·`webstore`·`file`·`unsupported`·`no-access`)로 거부한다. 확장은 `tabs` 권한이 없어 activeTab이 없는 탭(`chrome://` 포함)의 URL을 읽지 못하며 이 경우 `no-access`다. 마이크는 manifest 권한이 아니라 사이트 권한 프롬프트(권한 페이지)로 처리. 기본 단축키는 4개까지만 제안([#17](https://github.com/dydtjr1128/clipt/issues/17)).

## 14. 설계 결정 기록

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 빌드 | WXT | 유지보수 활발, manifest·zip·HMR·다중 브라우저 내장 |
| UI | Preact + signals | 번들 크기, 콘텐츠 스크립트에도 사용 가능 |
| 전체 페이지 | 스크롤 스티칭만 | `chrome.debugger`는 배너·권한 부담 |
| 영역·요소 녹화 대상 | 캡처와 동일한 선택 UI 재사용 | 학습 비용 0, 코드 공유 |
| 녹화 크롭 좌표 | 시작 시점 고정, 요소 추적은 후속 이슈 | 프레임마다 CS↔OS 통신 필요 |
| 녹화 포맷 | mp4 / webm(vp9·vp8·av1) 네이티브 + 폴백 체인, GIF는 후속 변환 | 변환 라이브러리 용량 부담 없이 다양성 확보 |
| 오디오 | 없음 / 탭 / 마이크 / 탭+마이크 | 마이크는 권한 페이지 1회 |
| 녹화 중 페이지 표시 | 설정 옵션(없음·테두리·위젯), 기본 없음 | 결과 오염 여부를 사용자가 선택 |
| iframe 내부 요소 | 1차 제외, 프레임 자체를 요소로 취급 | 두 문서에 걸친 좌표·복원 복잡도 |
| 동시 작업 | 1개 | 상태 단순화, 배지·팝업 표시 명확 |

## 15. 구현 순서 (마일스톤)

1. **M1 골격**: WXT 초기화, 컨텍스트 진입점, 메시지 헬퍼, 설정 스키마, 디자인 토큰, 팝업 메뉴
2. **M2 캡처 기본**: 보이는 화면 → 영역 캡처 → 결과 페이지 → 배출 3종
3. **M3 요소 선택**: 호버·고정 → 패널·슬라이더·키보드 → 요소 캡처
4. **M4 전체 페이지**: 스티칭 계획·실행·복원, 대형 요소 스티칭 공유
5. **M5 녹화**: 탭 녹화(프로파일·오디오 믹서) → 카운트다운·타이머·중지·일시정지 → 영역·요소 녹화 → 녹화 중 표시 옵션 → 마이크 권한 페이지
6. **M6 마감**: 단축키, i18n, 테스트, 스토어 자료
7. **후속**: 요소 추적 녹화, GIF 변환, 내부 스크롤러 스티칭, iframe 내부 요소
