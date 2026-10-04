# 변경기록

버전별 변경 이력이다. 최신이 위, 오래된 것이 아래다. 언제 버전을 올리는지는 [AGENTS.md](AGENTS.md)의 버전과 변경기록 절이 정본이고, 행의 형식은 아래 작성 규칙이 정본이다. 사용자에게 보이는 릴리스 노트는 `releases/X.Y.Z.md`이며 GitHub Release 본문으로 쓴다. 이 파일은 개발·사람용 이력이다.

## 작성 규칙

- 한 버전에 한 행. 버전을 올리는 PR(릴리스 PR)이 맨 위에 그 버전 행을 추가한다. 버전을 올리지 않는 PR은 이 파일을 건드리지 않고, 그 변경은 다음 버전 행에 함께 요약된다.
- 행은 직전 릴리스 태그 이후 main에 머지된 PR 전체를 다룬다. 빠뜨리지 않도록 `git log --merges --oneline v<직전 버전>..origin/main`과 릴리스 PR 자신을 확인한다.
- 날짜는 릴리스 PR이 머지된 날(`YYYY-MM-DD`)이다. 머지 직후 CI가 성공하면 같은 커밋에 `vX.Y.Z` 태그가 붙는다.
- 주요 변경내역은 `-` 불릿 개조식으로 사용자·운영에 보이는 변화만 요약한다. PR 순서가 아니라 영역별로 묶어 최대 6개로 쓰며 각 불릿을 `**영역**:`으로 시작한다(예: 녹화, 캡처·선택, UI, 결과, 문서, 검증·배포). 명사형 또는 `~음` 종결만 쓰고 `~습니다`·`~한다` 같은 서술형 종결은 쓰지 않는다. 셀 안 줄바꿈은 `<br>`.
- 무엇이 달라지는지를 독자 관점으로 쓴다. 커밋 bullet을 그대로 복사하지 않고, 판단 배경이 필요하면 불릿 끝에 `(이유: …)`로 짧게 덧붙인다.
- 셀 마지막 줄에 그 버전의 PR을 `PR: [#번호], [#번호]` 참조 링크로 번호 순으로 나열하고, 파일 끝 링크 정의 블록에 `[#번호]: PR URL`을 추가한다. 이슈 번호는 적지 않는다. PR 본문의 `Closes`/`Refs`가 정본이다.
- `scripts/release-assets.mjs`가 아직 태그가 없는 버전(릴리스 PR과 태그 빌드)에서 맨 위 행의 버전이 `package.json`과 같은지 확인한다.

## 이력

| 버전 | 날짜 | 주요 변경내역 |
| --- | --- | --- |
| 1.0.1 | 2026-10-04 | - **UI**: 녹화 중 팝업의 중지 버튼 문구가 두 줄로 깨지던 문제 수정(단축키는 버튼 아래 힌트로), 글꼴 기호 아이콘을 SVG로 바꿔 OS·글꼴과 관계없이 같은 모양, 한국어 문장을 어절 단위로 줄바꿈<br>- **선택**: 요소 경로 칩이 넘친 쪽 가장자리를 흐리게 표시해 글자가 중간에서 잘려 보이지 않음<br>- **문서**: README에서 세부 제한·보관 안내를 덜어 기능 중심으로 정리, 화면 캡처를 수정된 UI로 다시 생성<br>PR: [#74], [#75] |
| 1.0.1 | 2026-10-03 | - **녹화**: 작은 요소·영역 영상에 최소 크기(160px, 4:1 이내) 여백, 96kHz 오디오 장치에서 MP4가 빈 파일이 되던 문제 수정(오디오 48kHz), 저장 중 중지 연타·자동 종료와 겹친 중지·인코더/저장 오류·시작 직후 중지에도 결과 보존, 카운트다운 중 리사이즈·위젯 드래그로 범위가 어긋나거나 위젯이 찍히던 문제 수정, 요소 따라가기 순간 이동 뒤 잘못된 정지 화면 보정<br>- **결과**: 보존 한도보다 큰 최신 녹화 결과 삭제 방지, 바로 다운로드 실패·취소 시 결과 페이지로 대체, 좁은 창에서도 영상 재생 컨트롤 공간 확보<br>- **캡처·선택**: 그린 뒤 화면 밖으로 스크롤한 영역 캡처 결과 오류 수정, 요소 선택을 Enter·↑·↓로 키보드만으로 시작, Shadow DOM 최상위 요소 사이 ←/→ 이동<br>- **검증·배포**: 배포 빌드를 실제 툴바 클릭으로 조작하는 E2E, 녹화 프레임레이트·메모리 실측 스크립트(`npm run measure:recording`), 태그 릴리스 게시 전 커밋 CI 성공 확인<br>- **문서**: README 화면 캡처 6장과 설정·단축키·결과 보관·제한 안내, 스토어 이미지 생성 스크립트(`npm run screenshots`)<br>PR: [#58], [#59], [#61], [#62], [#63], [#64], [#65], [#66], [#67], [#69], [#70], [#71], [#72] |
| 1.0.1 | 2026-10-03 | - **이슈 양식**: 작성 요령을 맨 위로 모으고 흐름도(Mermaid)·관련 이슈 표 추가, 부모 이슈에 직접 자식·선행 관계 표와 통합 완료 조건 정리<br>- **PR·작업 지침**: PR 항목에서 알려진 문제와 제외 범위 분리, 부분 참조를 `Refs`로 통일, 검증 기록·독립 리뷰·문체 기준과 템플릿 적용 기록 추가(이유: project-starter-kit 최신본 반영)<br>PR: [#45] |
| 1.0.0 | 2026-09-20 | - **저장소 절차**: 이슈 템플릿을 결함·변경·부모 3종으로 개편(AS-IS/TO-BE, 우선순위, 등록 확인), 라벨을 성격·우선순위·영역 축으로 정리, 변경기록 도입<br>- **녹화 중 표시**: 위젯을 둘 빈 모서리가 없으면 숨김, 요소 따라가기가 숨겨진 요소로 시작해도 정상 크기로 녹화<br>- **릴리스**: 첫 정식 버전 1.0.0. 태그 빌드에서 변경기록 최신 행과 버전 일치 확인, 게시 실패 후 재실행 가능, 설치 안내에 최소 Chrome 버전과 설정 동기화 설명<br>PR: [#44] |
| 0.1.0 | 2026-09-20 | - **스크린샷**: 보이는 화면, 전체 페이지(스크롤 스티칭, 고정 요소·지연 로딩 처리), 요소(호버·클릭 고정·경로 패널·키보드 조정, 잘린·대형 요소), 영역(드래그) 캡처<br>- **녹화**: 탭·영역·요소 녹화, 요소 따라가기(출력 크기 고정·레터박스·화면 밖 직전 화면 유지), 카운트다운·일시정지·최대 길이·녹화 중 표시·중단 복구, MP4/WebM(VP9·VP8·AV1) 포맷과 품질 프로파일<br>- **UI**: 팝업 메뉴와 작업 상태, 설정(검증·마이그레이션), 결과 페이지(미리보기·다운로드·클립보드), 권한 페이지, 단축키 Alt+Shift+1~4, 한국어·영어<br>- **권한**: activeTab 기반, host 권한 없음, 제한 페이지 안내<br>- **검증**: 단위 153개·E2E 87개, PR·main CI, 수동 체크리스트<br>- **배포**: 아이콘·개인정보 처리방침·스토어 문안, 태그 푸시로 `clipt.zip`·체크섬을 GitHub Release에 게시, 설치 안내<br>PR: [#22], [#23], [#24], [#25], [#26], [#27], [#28], [#29], [#30], [#31], [#32], [#33], [#34], [#35], [#36], [#37], [#38], [#39], [#40], [#41], [#42], [#43] |

<!-- PR 링크 정의: 번호 순으로 추가한다 -->
[#22]: https://github.com/dydtjr1128/clipt/pull/22
[#23]: https://github.com/dydtjr1128/clipt/pull/23
[#24]: https://github.com/dydtjr1128/clipt/pull/24
[#25]: https://github.com/dydtjr1128/clipt/pull/25
[#26]: https://github.com/dydtjr1128/clipt/pull/26
[#27]: https://github.com/dydtjr1128/clipt/pull/27
[#28]: https://github.com/dydtjr1128/clipt/pull/28
[#29]: https://github.com/dydtjr1128/clipt/pull/29
[#30]: https://github.com/dydtjr1128/clipt/pull/30
[#31]: https://github.com/dydtjr1128/clipt/pull/31
[#32]: https://github.com/dydtjr1128/clipt/pull/32
[#33]: https://github.com/dydtjr1128/clipt/pull/33
[#34]: https://github.com/dydtjr1128/clipt/pull/34
[#35]: https://github.com/dydtjr1128/clipt/pull/35
[#36]: https://github.com/dydtjr1128/clipt/pull/36
[#37]: https://github.com/dydtjr1128/clipt/pull/37
[#38]: https://github.com/dydtjr1128/clipt/pull/38
[#39]: https://github.com/dydtjr1128/clipt/pull/39
[#40]: https://github.com/dydtjr1128/clipt/pull/40
[#41]: https://github.com/dydtjr1128/clipt/pull/41
[#42]: https://github.com/dydtjr1128/clipt/pull/42
[#43]: https://github.com/dydtjr1128/clipt/pull/43
[#44]: https://github.com/dydtjr1128/clipt/pull/44
[#45]: https://github.com/dydtjr1128/clipt/pull/45
[#58]: https://github.com/dydtjr1128/clipt/pull/58
[#59]: https://github.com/dydtjr1128/clipt/pull/59
[#61]: https://github.com/dydtjr1128/clipt/pull/61
[#62]: https://github.com/dydtjr1128/clipt/pull/62
[#63]: https://github.com/dydtjr1128/clipt/pull/63
[#64]: https://github.com/dydtjr1128/clipt/pull/64
[#65]: https://github.com/dydtjr1128/clipt/pull/65
[#66]: https://github.com/dydtjr1128/clipt/pull/66
[#67]: https://github.com/dydtjr1128/clipt/pull/67
[#69]: https://github.com/dydtjr1128/clipt/pull/69
[#70]: https://github.com/dydtjr1128/clipt/pull/70
[#71]: https://github.com/dydtjr1128/clipt/pull/71
[#72]: https://github.com/dydtjr1128/clipt/pull/72
[#74]: https://github.com/dydtjr1128/clipt/pull/74
[#75]: https://github.com/dydtjr1128/clipt/pull/75
