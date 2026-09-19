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
- 이슈 폼이 설치되어 있으면 해당 `.github/ISSUE_TEMPLATE/` 폼의 항목을 사용한다. CLI·API로 작성할 때도 요약과 필수 상세 항목을 포함한다.
- 이슈·PR 템플릿이 설치되어 있으면 해당 파일의 항목을 따른다. PR은 요약, 변경, 관련 이슈 및 완료 조건, 검증, 영향 및 주의사항, 알려진 문제 및 제외 범위를 유지한다. 해당 사항이 없으면 `없음`을 적는다.
- 관련 이슈를 검색해 중복을 확인하고, 기존 이슈를 수정하기 전 상태와 최신 본문을 확인한다. 무관한 내용·라벨·상태를 보존한다.
- 라벨은 대상 저장소에 실제로 존재하는 체계를 따른다. 템플릿 도입만을 이유로 우선순위나 담당자를 임의 지정하지 않는다.

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

## 프로젝트 정보

- Clipt는 웹페이지를 원하는 범위만큼 캡처하거나 녹화하는 Chrome 확장 프로그램이다. Manifest V3를 기준으로 한다.
- 기능 범위와 사용 흐름, 요소 선택 방식은 [README.md](README.md)를 기준으로 한다. 동작이 바뀌면 README도 함께 갱신한다.
- 확장 프로그램 로컬 확인은 `chrome://extensions`에서 개발자 모드를 켜고 빌드 결과 폴더(`.output/chrome-mv3`)를 `압축해제된 확장 프로그램을 로드합니다`로 불러온다.
- 오버레이(호버 박스, 라벨, 선택 패널)는 캡처·녹화 결과에 포함되지 않아야 한다. 관련 변경은 실제 캡처 결과로 확인한다.
- 캡처·녹화 결과물(이미지·영상)과 테스트 산출물은 커밋하지 않는다.
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
| `npm run zip` | 스토어 업로드용 zip 생성 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier 적용 / 검사 (md·yml 제외) |
| `npm test` | Vitest 단위 테스트(`tests/unit`) |
| `npm run build:e2e` | E2E 전용 빌드(`.output/chrome-mv3-e2e`). Playwright가 activeTab을 부여할 수 없어 `<all_urls>` host 권한과 고정 `key`(확장 ID 고정, 탭 캡처 허용 플래그용)를 더한다. 배포에 쓰지 않는다 |
| `npm run test:e2e` | 배포·E2E 빌드 후 Playwright로 E2E 빌드를 로드해 테스트(`tests/e2e`). 배포 빌드 manifest에 host 권한이 없는지도 확인한다. 최초 1회 `node node_modules/@playwright/test/cli.js install chromium` 필요 |

- 변경 후 최소 `typecheck`, `lint`, `test`를 통과시킨다. 확장 동작이 바뀌면 `test:e2e`도 실행한다.
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
public/_locales/   # ko(기본)·en 메시지
tests/unit/        # Vitest (fake browser·fake IndexedDB)
tests/e2e/         # Playwright 확장 로드 테스트
```
