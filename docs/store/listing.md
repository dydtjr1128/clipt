# Chrome 웹스토어 등록 자료

개발자 대시보드에 입력할 문안과 제출 절차. 권한 사유는 [permissions.md](permissions.md), 개인정보 처리방침은 [PRIVACY.md](../../PRIVACY.md).

## 기본 정보

| 항목 | 값 |
| --- | --- |
| 이름 | manifest `appName` (ko: Clipt - 스크린샷 & 화면 녹화 / en: Clipt - Screenshot & Screen Recorder) |
| 요약(132자 이하) | manifest `appDesc` |
| 카테고리 | 도구(Tools) 또는 생산성 |
| 언어 | 한국어, 영어 (기본 로케일 en) |
| 개인정보 처리방침 URL | `https://github.com/dydtjr1128/clipt/blob/main/PRIVACY.md` |
| 홈페이지 | `https://github.com/dydtjr1128/clipt` |
| 지원 | `https://github.com/dydtjr1128/clipt/issues` |

## 상세 설명 (ko)

```text
Clip anything on the web.
웹페이지를 원하는 범위만큼 캡처하거나 녹화하세요.

📸 스크린샷
• 보이는 화면: 지금 보이는 화면을 바로 캡처
• 전체 페이지: 자동으로 스크롤하며 페이지 전체를 한 장으로
• 요소 선택: 마우스로 요소를 고르고, 경로·깊이 슬라이더·방향키로 범위를 조정
• 영역 선택: 드래그로 원하는 영역만. 화면보다 큰 영역도 가능

🎬 녹화
• 탭 녹화, 영역 녹화, 요소 녹화
• MP4·WebM(VP9·VP8·AV1), 24·30·60fps, 해상도·화질 선택
• 탭 소리·마이크, 일시정지, 카운트다운

✨ 꼼꼼한 결과
• 선택 표시·패널·카운트다운은 결과에 찍히지 않아요
• 고정 헤더는 한 번만, 지연 로딩 이미지도 채워서
• 고해상도 화면과 브라우저 확대에서도 정확한 위치

🔒 안심하고 쓰세요
• 아이콘이나 단축키로 실행한 탭에만 접근해요(상시 사이트 권한 없음)
• 결과는 브라우저 안에만 저장되고 어디로도 전송되지 않아요

⌨ 단축키: Alt+Shift+1 보이는 화면 · 2 영역 · 3 요소 · 4 녹화 시작/중지
```

## Detailed description (en)

```text
Clip anything on the web.
Capture or record exactly the part of a page you need.

📸 Screenshots
• Visible area: capture what you see right now
• Full page: scrolls automatically and stitches the whole page into one image
• Element: pick an element, then fine-tune with the path, depth slider, or arrow keys
• Region: drag to select, even beyond the visible screen

🎬 Recording
• Record the tab, a region, or an element
• MP4 or WebM (VP9, VP8, AV1), 24/30/60 fps, resolution and quality options
• Tab audio and microphone, pause, countdown

✨ Clean results
• Highlights, panels and the countdown never appear in the result
• Sticky headers appear once; lazy-loaded images are filled in
• Pixel-accurate on HiDPI screens and at any browser zoom

🔒 Private by design
• Accesses a tab only when you invoke it (no permanent site access)
• Results stay in your browser and are never sent anywhere

⌨ Shortcuts: Alt+Shift+1 visible · 2 region · 3 element · 4 start/stop recording
```

## 개인정보 보호 관행 탭

| 질문 | 답 |
| --- | --- |
| 단일 목적 | [permissions.md](permissions.md)의 "단일 목적" |
| 권한 사유 | [permissions.md](permissions.md)의 권한별 사유(en 열) |
| 원격 코드 사용 | 아니요 |
| 데이터 수집 | 수집하지 않음(모든 항목 체크 해제) |
| 인증 | 세 항목 모두 동의(판매·무관한 용도·신용 목적 사용 안 함) |

## 이미지

| 자료 | 규격 | 상태 |
| --- | --- | --- |
| 아이콘 | 128×128 PNG | `public/icon/128.png` (원본 `assets/icon.svg`, `npm run icons`) |
| 스크린샷 1~5장 | 1280×800 또는 640×400 | 준비 필요: 팝업 메뉴, 요소 선택 패널, 영역 선택, 결과 페이지, 설정 |
| 작은 프로모션 타일 | 440×280 | 준비 필요 |

스크린샷은 실제 사이트 위에서 찍는다. 저작권·개인정보가 있는 화면은 피한다.

## 제출 절차

1. `package.json`의 `version`을 올린다(manifest 버전은 WXT가 여기서 가져온다).
2. [manual-checklist.md](../manual-checklist.md)를 확인한다.
3. `releases/X.Y.Z.md`에 릴리스 노트를 쓰고 main에 머지한 뒤 `vX.Y.Z` 태그를 푸시하면 릴리스 워크플로가 검사 후 `clipt.zip`·`clipt-X.Y.Z.zip`·`SHA256SUMS.txt`를 GitHub Release에 올린다. 로컬에서는 `npm run check:release` → `.output/release/`.
4. 대시보드에 zip 업로드 → 위 문안·이미지 입력 → 개인정보 처리방침 URL 등록 → 제출.
5. 심사 중 권한 질문이 오면 [permissions.md](permissions.md)의 문안으로 답한다.
