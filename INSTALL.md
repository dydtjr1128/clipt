# Clipt 설치 안내

## 다운로드와 설치

Chrome 116 이상 필요 · 낮은 버전에서는 로드가 거부되므로 Chrome을 업데이트한 뒤 진행

1. [최신 설치 ZIP](https://github.com/dydtjr1128/clipt/releases/latest/download/clipt.zip) 다운로드
2. 계속 사용할 폴더에 압축 해제 · 폴더 바로 안에 `manifest.json` 위치
3. Chrome의 `chrome://extensions` → **개발자 모드** ON
4. **압축해제된 확장 프로그램을 로드합니다** → 2번 폴더 선택
5. Chrome 확장 프로그램 메뉴에서 **Clipt** 고정 → 아이콘 클릭으로 메뉴 열기

- **clipt.zip:** 설치용 빌드 · Node.js/npm 불필요
- **Source code (zip):** 개발 소스 · 설치 ZIP과 구분
- ZIP 파일 자체가 아닌 압축을 푼 폴더 선택
- 설치 후 폴더 삭제·이동 금지
- [Chrome 공식 설치 안내](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

## 업데이트

1. [최신 Release](https://github.com/dydtjr1128/clipt/releases/latest)에서 **clipt.zip** 다운로드
2. 기존 등록 폴더의 파일을 새 ZIP 내용으로 교체 · 폴더 경로 유지
3. `chrome://extensions` → Clipt의 **새로고침** 클릭 → 버전 확인

- 압축 해제 확장은 자동 업데이트 미지원
- 확장 등록을 제거하지 않으면 설정과 저장된 결과 유지

## 파일 확인 (선택)

Release의 **SHA256SUMS.txt**와 받은 파일의 해시 비교

```powershell
Get-FileHash clipt.zip -Algorithm SHA256
```

```bash
sha256sum clipt.zip
```

## 사용 방법과 단축키

- 기능과 사용 흐름: [README.md](README.md)
- 단축키 변경: `chrome://extensions/shortcuts`
- `chrome://` 페이지, Chrome 웹 스토어, 다른 확장 페이지에서는 Chrome 정책상 동작하지 않음
- 마이크 녹음은 설정에서 마이크를 고른 뒤 권한 페이지에서 한 번 허용

## 개인정보

캡처·녹화 결과는 브라우저 안에만 저장 · 어떤 서버로도 전송하지 않음 · 설정은 Chrome 동기화를 켠 경우 다른 기기와 동기화될 수 있음 · [PRIVACY.md](PRIVACY.md)
