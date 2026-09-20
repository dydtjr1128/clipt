# 공통 작업 지침

## 작업 원칙

- 작업 전 관련 문서, 현재 브랜치와 변경 파일을 확인한다. 기존 사용자 변경을 보존하고 요청 범위에 집중한다.
- 실제 파일·코드·로그를 근거로 판단한다. 확인된 사실과 추정, 미확인 사항을 구분한다.
- 저장소 검색은 `rg`와 `rg --files`를 우선한다.
- 필요한 최소 변경으로 해결하고, 동작이나 사용 방법이 바뀌면 관련 문서도 함께 갱신한다.
- 비밀키, 토큰, 개인정보, `.env`를 커밋하거나 이슈·로그에 노출하지 않는다.

## 이슈와 PR 작성

- 한국어로 작성하고, 본문 최상단에 `요약`을 둔다. GitHub UI, CLI, API 모두 같은 규칙을 적용한다.
- 요약은 짧은 불릿 2~3개로 작성한다. 한 줄에 한 가지 핵심만 담고 명사형·단답형으로 끝낸다.
- 요약에서 `~합니다`, `~습니다`, `~입니다`, `~한다` 등의 서술형 종결을 피한다. 상세 구현과 긴 경로·로그는 하단에 둔다.
- 이슈 요약에는 현상·필요성과 영향 또는 원하는 결과를, PR 요약에는 최종 변경과 사용자에게 달라지는 결과를 적는다.
- 결함 제목은 해결책보다 대상과 증상을 표현한다. 예: `설정 저장 후 언어 선택 초기화`, `빈 검색 결과에서 페이지가 멈추는 문제`.
- 개선 제목은 원하는 변경을 표현한다. 예: `검색 결과 정렬 옵션 추가`. 증상이 명확하면 불필요한 `문제` 접미어를 붙이지 않는다.
- PR 제목은 `type: 핵심 변경 요약`으로 변경 결과를 표현한다. 예: `fix: 빈 검색 결과 처리 오류 수정`.
- 이슈 템플릿은 현재 오동작·회귀에는 `bug.yml`, 기능·문서·성능·리팩터링 제안에는 `change.yml`, 공통 사건·목표를 여러 자식 이슈로 나누어 관리할 때는 `parent.yml`, 사용 질문에는 `question.yml`을 선택한다. 부모는 자체 구현 PR을 갖지 않고 자식을 GitHub sub-issue로 연결하며, 하나의 PR로 끝나는 작업에는 부모를 만들지 않는다. CLI·API로 작성할 때도 폼의 요약과 필수 항목(확인 기준, AS-IS/TO-BE, 우선순위 근거, 완료 조건)을 포함한다.
- 이슈는 AS-IS/TO-BE로 변경 전후를 구분하고, 완료 조건에는 검증할 결과를 적는다. 작은 이슈는 항목별 1~2문장으로 충분하다.
- PR 템플릿의 항목을 따른다. PR은 요약, 변경, 관련 이슈 및 완료 조건, 검증, 영향 및 주의사항, 알려진 문제 및 제외 범위를 유지한다. 해당 사항이 없으면 `없음`을 적는다. 완결하는 이슈는 `Closes #번호`, 부분 작업·참조는 `관련 이슈: #번호`, 사용자 직접 요청은 `없음 — 사용자 직접 요청`으로 적는다.
- 관련 이슈를 검색해 중복을 확인하고, 기존 이슈를 수정하기 전 상태와 최신 본문을 확인한다. 무관한 내용·라벨·상태를 보존한다. 닫힌 이슈는 재검증 없이 다시 열지 않는다.
- 라벨은 아래 라벨 절의 축을 따른다. 축에 없는 라벨은 이 문서에 먼저 추가한 뒤 만든다.

### 라벨

- 라벨은 세 축이며, 이슈 등록 직후 해당하는 축의 라벨을 붙인다(우선순위는 필수, 정확히 하나).
  - 성격: `bug`(결함), `enhancement`(개선·신규 기능), `regression`(이전 수정이 되돌아온 결함, `bug`와 병행). 보조로 `documentation`(문서·문구), `design`(시각 디자인·상호작용), `accessibility`를 실제 변경 대상일 때 덧붙인다.
  - 우선순위: `priority:critical|high|medium|low` 중 하나. 폼의 선택은 triage 기록이고 라벨이 최종 권위다. 제목에는 우선순위 표식을 넣지 않는다.
  - 영역: `area:capture`(스크린샷·스티칭), `area:record`(녹화·프레임 처리·오디오·복구), `area:select`(요소·영역 선택 오버레이·패널), `area:ui`(팝업·설정·결과·권한 페이지), `area:i18n`, `area:test`(단위·E2E·CI), `area:release`(빌드·zip·Release·스토어), `area:workflow`(템플릿·기여 지침·절차). 실제 변경이 닿는 영역만 붙이며 여러 개일 수 있다.
- 우선순위 기준: `critical`(P0)은 배포 빌드에서 복구할 수 없는 데이터 손실, 개인정보의 외부 유출, 전면 동작 불가처럼 지금 진행 중인 사고. `high`(P1)는 주요 기능이 잘못된 결과를 내거나, 필수 검사가 실패하거나, 릴리스가 막힌 경우. `medium`(P2)은 현재 기능의 유지보수·성능·검증 개선. `low`(P3)는 문안·표시처럼 영향이 좁거나 미룰 수 있는 것. P0·P1은 본문에 영향 버전·기능과 재현·증거를 적는다.
- PR은 관련 이슈의 성격·영역 중 실제 변경에 해당하는 라벨을 적용하고 `priority:*`는 복사하지 않는다. 부모는 자식의 라벨을 합치거나 우선순위를 물려주지 않는다.
- 라벨 설명은 한국어로 유지한다. `question`·`duplicate`·`invalid`·`wontfix`·`good first issue`·`help wanted`는 GitHub 기본 분류로만 쓴다.

## 검증과 완료 보고

- 저장소에 정의된 검사 명령을 우선 사용하고, 변경 범위에 맞는 검사를 실행한다.
- 결함 수정은 가능하면 수정 전 실패·수정 후 성공을 확인한다. 단순 문안 변경은 형식·링크·diff 검사로 검증한다.
- 검증 결과는 실행한 명령과 성공·실패를 구분해 기록한다. 미실행 검사는 사유를 적고 성공으로 보고하지 않는다.
- 완료 보고에는 변경 결과, 검증 결과, 남은 제약을 간결하게 적는다.

## Git 작업

- 새 작업 브랜치가 필요하면 `feature/` 접두사를 기본으로 사용한다.
- 커밋 메시지는 한국어로 작성하고 첫 줄은 `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` 중 적절한 타입으로 시작한다.
- 커밋 본문이 필요하면 실제 변경 중심의 불릿 2~4개를 빈 줄 없이 작성한다.
- 커밋 전 diff를 확인하고 요청한 변경만 포함한다. 강제 푸시나 기존 변경 폐기는 명시적 요청 없이 수행하지 않는다.
- 원격 게시와 머지는 사용자 요청 및 저장소의 기여·보호 규칙에 따른다. 열린 PR의 검사 결과를 확인한 뒤 머지한다.
- 커밋 메시지와 PR 본문에 AI 도구 서명·`Co-Authored-By` 트레일러를 넣지 않는다.

### 버전과 변경기록

- 버전은 `package.json`의 `version` 한 곳에서 관리하며 릴리스 단위로만 올린다. 개별 PR은 버전을 올리지 않는다.
- 올리는 자리는 변경 성격에 맞춘다. 수정·정정·문서·저장소 절차(`fix:`/`docs:`/`chore:`/`refactor:`/`test:`)만 쌓였으면 patch, 사용자가 새로 쓸 수 있는 기능(`feat:`)이 하나라도 있으면 minor(patch 자리는 0으로). major는 저장 형식·설정 스키마·권한처럼 기존 설치와 호환되지 않는 변경이 필요할 때 사용자가 명시적으로 요청한 경우에만 올리고, 에이전트가 자율 결정하지 않는다.
- [CHANGELOG.md](CHANGELOG.md)는 버전마다가 아니라 작업 단위마다 한 행을 쓴다. 작업 단위는 독자가 "이번에 무엇이 달라졌나"를 한 번에 읽을 범위다 — 함께 기획해 연달아 랜딩한 PR 묶음(이슈 배치, 부모 이슈의 자식들)은 한 행, 단독 PR은 그 자체로 한 행이다. 묶음에 속한 개별 PR은 CHANGELOG를 건드리지 않고 묶음의 마지막 PR이 행을 쓰며, 단독 PR은 자기 PR에서 쓴다. 행의 버전은 그 변경이 실릴 다음 릴리스 버전이다. 행 형식은 CHANGELOG.md의 작성 규칙이 정본이다.
- 릴리스 PR은 버전을 올리고 `releases/X.Y.Z.md`(사용자용 릴리스 노트)를 추가하며, CHANGELOG 맨 위 행의 버전이 새 버전과 같은지 확인한다. `scripts/release-assets.mjs`가 이 일치를 검사한다.

## 프로젝트 정보

- Clipt는 웹페이지를 원하는 범위만큼 캡처하거나 녹화하는 Chrome 확장 프로그램이다. Manifest V3를 기준으로 한다.
- 기능 범위와 사용 흐름, 요소 선택 방식은 [README.md](README.md)를 기준으로 한다. 동작이 바뀌면 README도 함께 갱신한다.
- 확장 프로그램 로컬 확인은 `chrome://extensions`에서 개발자 모드를 켜고 빌드 결과 폴더(`.output/chrome-mv3`)를 `압축해제된 확장 프로그램을 로드합니다`로 불러온다.
- 오버레이(호버 박스, 라벨, 선택 패널)는 캡처·녹화 결과에 포함되지 않아야 한다. 관련 변경은 실제 캡처 결과로 확인한다.
- 캡처·녹화 결과물(이미지·영상)과 테스트 산출물은 커밋하지 않는다.
- 버전은 `package.json`의 `version` 한 곳에서 관리한다(manifest는 WXT가 가져온다). 릴리스는 위 버전과 변경기록 절에 따라 버전을 올리고 `releases/X.Y.Z.md`(릴리스 노트, 없으면 실패)를 추가해 main에 머지한 뒤 `vX.Y.Z` 태그를 푸시한다. `.github/workflows/release.yml`이 검사 후 `clipt.zip`(최신 다운로드 링크용 고정 이름)·`clipt-X.Y.Z.zip`·`SHA256SUMS.txt`를 GitHub Release에 올린다. 사용자 설치 절차는 [INSTALL.md](INSTALL.md). 스토어 제출 절차는 [docs/store/listing.md](docs/store/listing.md).
- 구조·파이프라인·설정 스키마는 [docs/architecture.md](docs/architecture.md), 화면·상호작용·문구는 [docs/ux-design.md](docs/ux-design.md)를 기준으로 한다. 두 문서와 다른 구현을 할 때는 문서를 먼저 고친다.

### 기술 스택

- WXT(Vite 기반) + TypeScript strict + Preact·`@preact/signals`, 스타일은 순수 CSS와 `src/styles/tokens.css` 디자인 토큰
- 확장 API는 `chrome` 전역 대신 `wxt/browser`의 `browser`를 사용한다.
- 사용자에게 보이는 문자열은 `src/shared/i18n.ts`의 `t()`와 `public/_locales/{ko,en}/messages.json`으로만 다룬다. JSX 문자열 리터럴은 lint 오류다.
- 문구를 추가할 때는 ko·en 두 파일에 같은 키와 같은 치환자(`$1`)로 넣는다. `tests/unit/locales.test.ts`가 키·치환자 불일치, 쓰이지 않는 키, 주석 밖 한글 문자열을 잡는다. 문체는 `docs/ux-design.md` 11절을 따른다.

### 명령

| 명령 | 용도 |
| --- | --- |
| `npm install` | 의존성 설치, `postinstall`에서 `wxt prepare`로 `.wxt/` 타입 생성 |
| `npm run dev` | 개발 모드(HMR). WXT가 확장을 로드한 브라우저를 띄운다 |
| `npm run build` | `.output/chrome-mv3`에 프로덕션 빌드 |
| `npm run zip` | 스토어 업로드용 `.output/clipt-<version>.zip` 생성 |
| `npm run check:release` | zip 생성 후 배포 빌드 검사(버전 일치, 아이콘, 로케일 글자 수, host 권한·E2E key·소스맵 없음)와 릴리스 파일 준비(`.output/release/`, 릴리스 노트 확인) |
| `npm run icons` | `assets/icon.svg` → `public/icon/*.png` (아이콘을 바꿨을 때만) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier 적용 / 검사 (md·yml 제외) |
| `npm test` | Vitest 단위 테스트(`tests/unit`) |
| `npm run build:e2e` | E2E 전용 빌드(`.output/chrome-mv3-e2e`). Playwright가 activeTab을 부여할 수 없어 `<all_urls>` host 권한과 고정 `key`(확장 ID 고정, 탭 캡처 허용 플래그용)를 더한다. 배포에 쓰지 않는다 |
| `npm run test:e2e` | 배포·E2E 빌드 후 Playwright로 E2E 빌드를 로드해 테스트(`tests/e2e`). 배포 빌드 manifest에 host 권한이 없는지도 확인한다. 최초 1회 `node node_modules/@playwright/test/cli.js install chromium` 필요 |

- 변경 후 최소 `typecheck`, `lint`, `test`를 통과시킨다. 확장 동작이 바뀌면 `test:e2e`도 실행한다.
- CI(`.github/workflows/ci.yml`)는 PR과 main 푸시마다 같은 검사와 E2E 전체를 돌린다. 테스트 역할 분담은 [docs/testing.md](docs/testing.md), 자동화할 수 없는 항목은 [docs/manual-checklist.md](docs/manual-checklist.md).
- npm 스크립트는 CLI를 `node node_modules/...`로 직접 호출한다. 프로젝트 경로의 `&` 때문에 Windows npm `.cmd` shim이 실패하기 때문이며, `npx <cli>`도 같은 이유로 이 경로에서 실패할 수 있다.

### 디렉터리

```text
src/
├── entrypoints/   # WXT 진입점: background.ts, content.ts(runtime 주입), popup/, options/, result/, permission/, offscreen/
├── core/          # 브라우저 API 의존 없는 순수 로직 (단위 테스트 대상)
├── background/    # 서비스 워커 모듈
├── content/       # 콘텐츠 스크립트 모듈 (오버레이, 선택 UI)
├── offscreen/     # 오프스크린 문서 모듈 (캔버스, 녹화, 클립보드)
├── shared/        # 컨텍스트 공용 (메시지, IndexedDB, i18n)
├── components/    # Preact 공용 UI
└── styles/        # 디자인 토큰, 페이지 공통 스타일
public/_locales/   # en(기본)·ko 메시지
public/icon/       # 확장 아이콘 PNG (원본 assets/icon.svg)
tests/unit/        # Vitest (fake browser·fake IndexedDB)
tests/e2e/         # Playwright 확장 로드 테스트
```
