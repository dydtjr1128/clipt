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
│   ├── recording-service.ts     # tabCapture streamId, 오프스크린 제어
│   ├── router.ts                # 메시지 라우팅
│   └── badge.ts
├── content/
│   ├── overlay/                 # Shadow host, 레이어 관리, 토스트
│   ├── hover-picker.ts          # 요소 호버·클릭 고정
│   ├── selection-panel.tsx      # 선택 패널
│   ├── region-selector.ts       # 드래그 영역 선택
│   ├── page-probe.ts            # 페이지 측정, fixed 요소 숨김, 스크롤 제어
│   ├── countdown.ts
│   └── rec-indicator.ts         # 녹화 중 표시 (옵션)
├── offscreen/
│   ├── stitcher.ts              # OffscreenCanvas 스티칭·크롭
│   ├── recorder.ts              # MediaRecorder + chunk 저장
│   ├── frame-cropper.ts         # 영역·요소 녹화용 캔버스 크롭
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
| `job:get` | any → SW | 현재 작업 조회 |
| `offscreen:ping` | SW·페이지 → OS | 오프스크린 응답 확인 |

기능 이슈에서 추가할 메시지:

| 이름 | 방향 | 용도 |
| --- | --- | --- |
| `page:probe` | SW → CS | `{dpr, viewport, scrollSize, scroll, innerScroller?}` 응답 |
| `select:region` / `select:element {forRecording}` | SW → CS | 선택 UI 시작, 응답 `Rect<'css'>` + 선택자 경로 |
| `page:prepare {hideFixed, hideScrollbar}` / `page:restore` | SW → CS | 캡처 전후 페이지 조정 |
| `page:scrollTo {y}` | SW → CS | 스티칭 스크롤, 렌더 안정 후 응답 |
| `capture:shot` | SW 내부 | `captureVisibleTab` (속도 제한 큐 통과) |
| `stitch:begin/piece/end` | SW → OS | 조각 전달(dataURL), 완료 시 `resultId` 응답 |
| `rec:start {streamId, crop?, profile}` / `rec:pause` / `rec:resume` / `rec:stop` | SW → OS | 녹화 제어 |
| `rec:tick {elapsed}` | OS → SW → popup | 1초 타이머 |
| `indicator:show {kind}` / `indicator:hide` | SW → CS | 녹화 중 표시(옵션) |
| `emit {resultId}` | SW 내부 | 설정에 따른 배출 |
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
| 보이는 화면 | 뷰포트 | shot 1회 | 없음 |
| 영역 | 드래그 Rect | 뷰포트 안이면 shot 1회, 아니면 스티칭 | device 크롭 |
| 요소 | 요소 Rect | 동일 | 동일 |
| 전체 페이지 | 문서 전체 | 스티칭 | 없음 |

### 8.1 스크롤 스티칭 (`core/stitch-plan.ts` + `offscreen/stitcher.ts`)

전체 페이지 캡처는 스크롤 스티칭만 지원한다(`chrome.debugger` 방식은 채택하지 않음).

1. `page:probe`로 `scrollHeight`, 뷰포트 높이 `vh`, dpr 획득. 대상 문서 Rect(`docRect`) 결정.
2. 계획: `pieces = ceil(docRect.h / vh)`, 조각 `i`의 `scrollY = docRect.y + i*vh`. 마지막 조각은 `scrollY = docRect.bottom - vh`로 맞추고 앞 조각과 겹치는 높이만큼 잘라 붙인다.
3. `page:prepare`: 첫 조각 이후 `position: fixed|sticky` 요소를 `visibility: hidden`(레이아웃 유지)으로 숨기고, 스크롤바 숨김 클래스를 적용. 원래 인라인 스타일을 `WeakMap`에 보존.
4. 조각마다 `page:scrollTo` → 콘텐츠는 `scrollTo` 후 `requestAnimationFrame` 2회 + 뷰포트 안 이미지 `decode` 대기(최대 `lazyWaitMs`) 후 응답 → `capture:shot`. 속도 제한 큐가 호출 간격을 최소 550ms로 보장(API 제한 초당 2회).
5. 오프스크린 `OffscreenCanvas(docW*dpr, docH*dpr)`에 조각을 `drawImage`. 캔버스 한계(한 변 16384 또는 면적 초과) 예상 시 축소 배율 `scale = min(1, limit/size)`를 계획 단계에서 결정하고 사용자에게 알린다.
6. `page:restore` → 결과 Blob → IndexedDB → `resultId`.
7. 진행률은 `job.progress`에 저장, 콘텐츠 토스트와 팝업이 표시. 중단 시 즉시 `page:restore`.

내부 스크롤 컨테이너를 쓰는 페이지(문서는 안 움직이고 `overflow: auto` 요소가 스크롤)는 probe가 감지해 "일부만 캡처될 수 있음"을 안내한다. 내부 스크롤러 스티칭은 후속 이슈.

### 8.2 요소 선택 (`content/hover-picker.ts`, `core/element-path.ts`)

- Shadow host 오버레이는 `pointer-events: none`이므로 `document.elementFromPoint`가 페이지 요소를 반환한다. 반환 요소가 `shadowRoot`를 가지면 `shadowRoot.elementFromPoint`로 반복해 내려간다.
- 선택 불가: 크기 0, `visibility: hidden`, 오버레이 자신, `html`.
- **iframe**: 1차에서는 `<iframe>` 자체를 하나의 요소로 취급한다. 내부 요소 탐색은 하지 않는다(동일 출처라도). 이유: 프레임 내부 좌표 변환·스크롤·스타일 복원을 두 문서에 걸쳐 해야 해 복잡도가 크고, 캡처는 어차피 화면 픽셀 기준이라 프레임 전체 선택으로 대부분의 요구를 충족한다. 후속 이슈로 남긴다.
- **경로 기준선**: 클릭 시 `anchor = 클릭 요소`, `path = [body … anchor]`, 깊이 `d`는 `path[d]`.
  - ↑ / 슬라이더 좌 → `d-1`, ↓ / 슬라이더 우 → `d+1` (`path` 안에서만)
  - ← / → → 현재 요소의 형제(선택 가능 요소만)로 이동. 이동 후 `anchor = 새 요소`, `path` 재계산, `d = path.length-1`
  - 경로 항목 클릭 → 해당 `d`
- 결과: `Rect<'css'>` + 표시용 선택자 문자열. 요소 참조는 콘텐츠 내부에만 둔다.

### 8.3 캡처 직전 보장 (모든 모드 공통)

```text
overlay.hide() → await nextFrames(2) → rect 재측정(요소·영역) → shot → overlay.destroy()
```

팝업이 열려 있으면 서비스 워커가 `job:start` 처리 직후 팝업에 `close` 신호를 보내고 100ms 후 진행한다.

## 9. 녹화 파이프라인

### 9.1 흐름

```text
SW: tabCapture.getMediaStreamId({targetTabId})
 └▶ offscreen.create({reasons:['USER_MEDIA','BLOBS']})  (있으면 재사용)
     └▶ OS: getUserMedia({video:{chromeMediaSource:'tab', chromeMediaSourceId}, audio: 탭 오디오 여부})
          ├▶ audio-mixer: 탭 오디오 → AudioContext.destination (탭 소리 유지)
          │              + 마이크 스트림(옵션) → 하나의 오디오 트랙으로 합성
          ├▶ 탭 모드: 비디오 트랙 그대로
          ├▶ 영역·요소 모드: <video> → OffscreenCanvas.drawImage(crop) @ requestVideoFrameCallback
          │                  → canvas.captureStream(fps)
          └▶ MediaRecorder(profile.mimeType, bitrate, timeslice=1000)
               → chunk를 IndexedDB `chunks`에 append (메모리 누적 없음)
SW: rec:stop → OS: stop → chunks 병합 → webm duration 보정 → results 저장 → resultId
```

### 9.2 대상 선택

영역 녹화·요소 녹화는 캡처와 **같은 선택 UI**를 재사용한다. 영역 녹화는 드래그 선택, 요소 녹화는 호버·고정·패널 조정 후 "녹화 시작". 선택 UI는 `forRecording` 플래그로 문구와 주 버튼만 바뀐다.

크롭 좌표는 **녹화 시작 시점의 `Rect<'device'>`로 고정**한다. 스크롤·레이아웃 변화에 따라 요소를 따라가는 추적은 후속 이슈(콘텐츠가 주기적으로 rect를 보내고 크로퍼가 보간)로 남긴다. 스트림 해상도가 바뀌면(창 리사이즈, 개발자 도구) 비율로 재계산하고, 비율이 달라지면 녹화를 중지하고 안내한다.

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

### 9.4 녹화 중 표시 (옵션)

설정 `record.indicator`로 선택한다. 결과 영상에 찍힐 수 있음을 설정 UI에 명시한다.

| 값 | 동작 | 결과 오염 |
| --- | --- | --- |
| `none` (기본) | 페이지에 아무것도 표시하지 않음. 배지·팝업·단축키로만 상태 확인 | 없음 |
| `border` | 녹화 영역(탭 모드는 뷰포트) 테두리 2px `--c-rec` | 테두리가 찍힘. 단, 영역·요소 모드에서는 테두리를 크롭 경계 **바깥** 2px에 그려 결과에 포함되지 않게 함 |
| `widget` | 우하단 플로팅 위젯(● 00:42 ⏸ ■). 드래그 이동 가능 | 위젯이 찍힘. 영역·요소 모드에서는 크롭 영역 밖에 배치 |

탭 모드 `border`·`widget`은 결과에 포함된다는 경고를 설정 항목 옆에 표시한다.

### 9.5 종료 조건과 복구

- 종료: 팝업 중지, 위젯 중지, 단축키 토글, 최대 시간 도달, 대상 탭 닫힘, 스트림 `ended`.
- 탭 내비게이션: 탭 모드는 계속 녹화(탭 캡처는 문서 교체 후에도 유지). 영역·요소 모드는 레이아웃이 바뀌므로 중지 후 "페이지가 이동해 녹화를 마쳤어요" 안내.
- 복구: 시작 시 `chunks`에 고아 chunk가 있으면 결과 페이지가 "복구 가능한 녹화" 배너를 표시하고 병합을 제공.

## 10. 저장소 설계

### IndexedDB `clipt` (v1)

| 스토어 | 키 | 값 | 비고 |
| --- | --- | --- | --- |
| `results` | `id` | `ResultMeta`: `id, kind(image·video), mode, mime, width, height, bytes, createdAt` + 선택 `duration, fps, audio, pageUrl, pageTitle, selector, scaled, fallbackReason` | 인덱스 `createdAt` |
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

읽기 시 `defaults`와 깊은 병합, `version` 불일치 시 `migrate()` 체인 실행.

## 11. 배출(emit)과 결과 페이지

`emit(resultId)`는 설정을 읽어 분기한다.

| 동작 | 처리 | 피드백 |
| --- | --- | --- |
| 결과 페이지 | `chrome.tabs.create({url: 'result.html?id=…'})` | 새 탭 |
| 바로 다운로드 | `chrome.downloads.download({url, filename, saveAs})` (오프스크린이 Blob URL 생성) | 배지 `✓` 2초 |
| 클립보드 | 오프스크린 `navigator.clipboard.write([ClipboardItem({'image/png'})])`. JPEG는 PNG로 재인코딩. 영상은 불가 → 결과 페이지로 대체 | 배지 `✓` 2초 |

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

`host_permissions` 없음. 마이크는 manifest 권한이 아니라 사이트 권한 프롬프트(권한 페이지)로 처리. 기본 단축키는 4개까지만 제안([#17](https://github.com/dydtjr1128/clipt/issues/17)).

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
