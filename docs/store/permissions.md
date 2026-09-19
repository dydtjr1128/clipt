# 권한 사용 사유

Chrome 웹스토어 제출 시 "권한 정당성" 항목에 그대로 쓰는 문안이다. manifest 권한을 바꾸면 이 문서와 `docs/architecture.md` 13절을 함께 고친다.

## 단일 목적

사용자가 보고 있는 웹페이지의 원하는 범위(보이는 화면, 전체 페이지, 선택한 요소, 드래그한 영역)를 이미지로 캡처하거나 영상으로 녹화한다.

## 권한별 사유

| 권한 | 사유 (ko) | Justification (en) |
| --- | --- | --- |
| `activeTab` | 사용자가 툴바 아이콘이나 단축키로 기능을 실행한 탭에만 임시로 접근해 화면을 캡처하고 선택 UI를 띄운다. 상시 사이트 접근 권한을 요청하지 않기 위해 사용한다. | Grants temporary access only to the tab where the user invokes Clipt from the toolbar or a keyboard shortcut, so we can capture it without requesting permanent host access. |
| `scripting` | 캡처 대상 탭에 요소 선택·영역 선택 오버레이와 페이지 측정 스크립트를 필요할 때만 주입한다. | Injects the element/region selection overlay and page measurement script into the invoked tab only when needed. |
| `tabCapture` | 탭 녹화와 영역·요소 녹화를 위해 현재 탭의 화면과 소리를 스트림으로 받는다. | Captures the current tab's video and audio stream for tab, region and element recording. |
| `offscreen` | 서비스 워커가 할 수 없는 영상 녹화(MediaRecorder), 이미지 이어붙이기(Canvas), 클립보드 복사를 보이지 않는 문서에서 처리한다. | Runs MediaRecorder, canvas stitching and clipboard writes in an offscreen document, which the service worker cannot do. |
| `storage` | 사용자 설정과 진행 중인 캡처·녹화 상태를 저장한다. | Stores user settings and the state of an in-progress capture or recording. |
| `downloads` | "바로 다운로드" 설정과 결과 페이지의 다운로드 버튼으로 결과 파일을 저장한다. | Saves captured images and recordings when the user chooses to download them. |
| `clipboardWrite` | "클립보드에 복사" 설정과 결과 페이지의 복사 버튼으로 캡처 이미지를 클립보드에 넣는다. | Copies captured images to the clipboard when the user chooses to. |

`commands`(단축키)는 권한 경고가 없는 manifest 항목이다. `host_permissions`는 요청하지 않는다. 테스트 빌드(`CLIPT_E2E=1`)에만 `<all_urls>`가 붙으며 배포 zip은 `npm run zip`의 기본 빌드를 사용한다.

## activeTab이 부여되는 경우

- 툴바 아이콘 클릭(팝업 열림) 시 현재 탭에 부여된다. 팝업에서 기능을 고르면 그 탭에서 동작한다.
- `commands`에 등록한 단축키 실행 시 현재 탭에 부여된다(#17).
- 부여는 탭이 다른 origin으로 이동하거나 닫힐 때까지 유지된다. 같은 탭에서 다른 사이트로 이동한 뒤에는 다시 툴바나 단축키로 실행해야 한다.
- 브라우저 내부 페이지(`chrome://` 등), 웹스토어에는 부여되지 않는다. 이 경우 팝업은 메뉴를 비활성화하고 사유를 표시한다.
- `file://` 페이지는 사용자가 확장 관리 화면에서 "파일 URL에 대한 액세스 허용"을 켠 경우에만 동작한다.

## 데이터 처리

- 캡처·녹화 결과는 브라우저 안(IndexedDB)에만 저장되고 24시간 또는 500MB를 넘으면 오래된 것부터 삭제된다.
- 외부 서버로 어떤 데이터도 전송하지 않는다.
