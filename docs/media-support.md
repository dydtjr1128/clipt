# 녹화 포맷 지원 매트릭스

`MediaRecorder.isTypeSupported` 결과 기록. 선택 규칙은 `src/core/media-profile.ts`, 설명은 `docs/architecture.md` 9.3절.

## 확인 결과

확인 환경: Chromium 153 (Playwright 번들, Windows 11), 2026-09-20. E2E `tests/e2e/formats.spec.ts`가 네 포맷 모두 녹화·재생·탐색을 확인한다.

| 설정 | 후보 mimeType (위에서부터 시도) | Chromium 153 |
| --- | --- | --- |
| `mp4` | `video/mp4;codecs=avc1.64002A,mp4a.40.2` | 지원 |
| | `video/mp4;codecs=avc1,opus` | 지원 |
| | `video/mp4` | 지원 |
| `webm-vp9` (기본) | `video/webm;codecs=vp9,opus` | 지원 |
| | `video/webm;codecs=vp9` | 지원 |
| `webm-vp8` | `video/webm;codecs=vp8,opus` | 지원 |
| | `video/webm;codecs=vp8` | 지원 |
| `webm-av1` | `video/webm;codecs=av01.0.08M.08,opus` | 지원 |
| | `video/webm;codecs=av01` | 지원 |

후보에 없지만 지원되는 조합: `video/mp4;codecs=vp9,opus`, `video/mp4;codecs=av01,opus`, `video/webm;codecs=h264,opus`, `video/x-matroska;codecs=avc1`.

## 버전별 참고

- MP4 컨테이너 녹화는 Chrome 126부터 지원된다([chromestatus](https://chromestatus.com/feature/5163469011943424)). 확장의 최소 버전은 Chrome 116이므로 116~125에서는 `mp4`가 비활성으로 보이고, 이미 `mp4`로 설정돼 있으면 `webm-vp9`로 폴백한다.
- H.264·AAC 인코더는 브라우저 빌드에 따라 빠질 수 있다(일부 Chromium 배포판). 이 경우에도 같은 폴백이 적용된다.
- AV1 인코딩은 CPU 부하가 커 저사양 기기에서 프레임이 떨어질 수 있다. 설정 화면의 포맷 설명에 안내한다.

## 폴백

| 요청 | 시도 순서 |
| --- | --- |
| `mp4` | `mp4` → `webm-vp9` → `webm-vp8` |
| `webm-av1` | `webm-av1` → `webm-vp9` → `webm-vp8` |
| `webm-vp9` | `webm-vp9` → `webm-vp8` |
| `webm-vp8` | `webm-vp8` |

폴백이 일어나면 결과 메타 `fallbackReason`에 요청 포맷을 남기고 결과 페이지가 "MP4을(를) 지원하지 않는 환경이라 WebM(으)로 저장했어요" 배너를 보여 준다. 설정 화면은 지원하지 않는 포맷을 비활성으로 표시한다.

## 품질 옵션

| 옵션 | 적용 방식 |
| --- | --- |
| 프레임레이트 24·30·60 | 탭 캡처 제약 `minFrameRate = maxFrameRate` |
| 해상도 100·75·50% | 탭 캡처 제약 `maxWidth·maxHeight = 뷰포트 × DPR × 배율`(짝수). 탭 캡처가 줄여서 보낸다 |
| 화질 자동·낮음·높음 | `videoBitsPerSecond = 너비 × 높이 × fps × 0.13 / 0.05 / 0.25` (0.5~40Mbps) |

## 다시 확인하는 방법

확장 페이지(예: 옵션 페이지)의 개발자 도구 콘솔에서 실행한다.

```js
['video/mp4;codecs=avc1.64002A,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus',
 'video/webm;codecs=vp8,opus', 'video/webm;codecs=av01.0.08M.08,opus']
  .map((m) => [m, MediaRecorder.isTypeSupported(m)]);
```
