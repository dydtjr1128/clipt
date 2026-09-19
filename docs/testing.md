# 테스트·검증 전략

## 세 겹의 검증

| 층 | 도구 | 대상 | 실행 |
| --- | --- | --- | --- |
| 정적 검사 | `tsc`, ESLint, Prettier | 타입, 메시지 프로토콜·`t()` 키 오타, JSX 문자열 리터럴 금지 | `npm run typecheck`, `npm run lint`, `npm run format:check` |
| 단위 테스트 | Vitest + fake browser + fake IndexedDB | 브라우저 없이 확인할 수 있는 계산과 규칙 | `npm test` |
| E2E | Playwright + Chromium에 확장 로드 | 실제 캡처·녹화 결과의 픽셀·길이·상태 | `npm run test:e2e` |
| 수동 | [manual-checklist.md](manual-checklist.md) | 자동화할 수 없는 것(툴바 클릭, 실제 단축키, 소리, 장시간 녹화) | 릴리스 전, 관련 영역 변경 시 |

CI(`.github/workflows/ci.yml`)는 PR과 main 푸시마다 정적 검사·단위 테스트·빌드와 E2E 전체를 돌린다.

## 단위 테스트가 맡는 것 (`tests/unit`)

계산과 규칙은 `src/core`에 순수 함수로 두고 여기서 확인한다.

| 모듈 | 확인하는 것 |
| --- | --- |
| `core/stitch-plan` | 조각 합 = 대상 높이, 겹침 없음, 최대 스크롤에서 남은 부분만, 캔버스 한계 축소, 소수 DPR 이음새 |
| `core/region`, `core/crop` | 드래그·핸들·경계 제한, 뷰포트 비율 크롭, 짝수 정렬, 화면 비율 변화 |
| `core/element-path` | 경로 생성, 깊이 왕복, 형제 이동, 표시 이름 |
| `core/job`, `background/jobs` | 단계 전이, 동시 시작 방지, 서비스 워커 재기동 복원, 제한 페이지 거부 |
| `core/settings` | 기본값 병합, 값 검증, 버전 마이그레이션 |
| `core/media-profile`, `core/filename`, `core/format`, `core/retention`, `core/restricted`, `core/menu`, `core/time` | 포맷 폴백, 파일명, 서식, 보존 정책, URL 판정, 단축키 구성 |
| `background/commands`, `background/access`, `background/offscreen`, `background/capture` | 단축키 처리 규칙, 주입·PING, 오프스크린 단일 생성, 캡처 호출 간격 |
| `shared/messages`, `shared/db`, `offscreen/audio-mixer` | 메시지 라우팅·오류 직렬화, 결과·chunk 저장, 오디오 연결 |
| `locales` | ko·en 키·치환자 일치, 미사용 키, 주석 밖 한글 문자열 |

## E2E가 맡는 것 (`tests/e2e`)

- 테스트 사이트는 네트워크 없이 `context.route`로 응답한다(`site.ts`): 색 띠로 된 긴 페이지, 고정 헤더, 지연 로딩 이미지, 위치가 정해진 블록·링크·Shadow DOM·스크롤 영역. 결과는 **픽셀 색**으로 검증한다(`result.ts`, `rec.ts`).
- 확장은 E2E 전용 빌드(`npm run build:e2e`)를 쓴다. Playwright는 툴바 클릭·단축키로 activeTab을 줄 수 없어 `<all_urls>`와 고정 `key`를 더하고, `--allowlisted-extension-id`로 탭 캡처를 허용한다. 배포 빌드 manifest에 이것들이 없다는 것도 E2E가 확인한다.
- 옵션: `scaleFactor`(DPR), `windowSize`, `lang`. 조작용 확장 페이지는 `openControlWindow`로 별도 창에 띄워 대상 탭을 활성 상태로 둔다.
- 알려진 한계: 브라우저 수준 키 입력(단축키는 `commands.onCommand` 이벤트를 직접 발생), 확장 origin의 마이크 권한, 실제 소리 출력, 헤드리스 탭 캡처의 프레임레이트(약 21fps).

## 새 기능을 추가할 때

1. 계산·규칙은 `src/core`에 순수 함수로 두고 단위 테스트를 먼저 쓴다.
2. 화면에 보이는 결과는 E2E에서 크기와 픽셀 색으로 확인한다. "오버레이가 결과에 찍히지 않는다"는 가장자리 픽셀 검사로 확인한다.
3. 자동화할 수 없는 조건은 [manual-checklist.md](manual-checklist.md)에 항목을 추가하고 PR 본문 검증 항목에 수동 확인 여부를 적는다.
