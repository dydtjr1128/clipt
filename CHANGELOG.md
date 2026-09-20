# 변경기록

작업 단위별 변경 이력이다. 최신이 위, 오래된 것이 아래다. 무엇을 한 작업 단위로 보고 언제 행을 쓰는지는 [AGENTS.md](AGENTS.md)의 변경기록 항목이 정본이고, 행의 형식은 아래 작성 규칙이 정본이다. 사용자에게 보이는 릴리스 노트는 `releases/X.Y.Z.md`이며 GitHub Release 본문으로 쓴다. 이 파일은 개발·사람용 이력이다.

## 작성 규칙

- 한 작업 단위에 한 행. 버전은 그 변경이 실리는 릴리스 버전(`package.json`의 `version`)이다. 아직 릴리스하지 않은 작업은 다음 릴리스 버전으로 적고, 릴리스 PR에서 확정한다.
- 날짜는 그 단위의 마지막 PR이 머지된 날(`YYYY-MM-DD`)이다.
- 종류는 그 단위의 성격 — `feat`(사용자가 새로 쓸 수 있는 기능), `fix`(수정·정정), `docs`(문서), `chore`(빌드·CI·저장소 절차).
- 주요 변경내역은 `-` 불릿 개조식으로 사용자·운영에 보이는 변화만 요약한다. 단독 PR은 1~3개로 쓰고, 묶음은 PR 순서가 아니라 영역별로 묶어 최대 6개로 쓰며 각 불릿을 `**영역**:`으로 시작한다. 명사형 또는 `~음` 종결만 쓰고 `~습니다`·`~한다` 같은 서술형 종결은 쓰지 않는다. 셀 안 줄바꿈은 `<br>`.
- 무엇이 달라지는지를 독자 관점으로 쓴다. 커밋 bullet을 그대로 복사하지 않고, 판단 배경이 필요하면 불릿 끝에 `(이유: …)`로 짧게 덧붙인다.
- 셀 마지막 줄에 그 단위의 PR을 `PR: [#번호], [#번호]` 참조 링크로 번호 순으로 나열하고, 파일 끝 링크 정의 블록에 `[#번호]: PR URL`을 추가한다. 이슈 번호는 적지 않는다 — PR 본문의 `Closes`/`관련 이슈`가 정본이다.
- 여러 날 이어지는 작업 단위의 행을 갱신할 때는 새 행을 만들지 않고 그 행의 날짜·불릿·PR 목록을 고친다.

## 이력

| 버전 | 날짜 | 종류 | 주요 변경내역 |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-20 | chore | - **저장소 절차**: 이슈 템플릿을 결함·변경·부모 3종으로 개편(AS-IS/TO-BE, 우선순위, 등록 확인), 라벨을 성격·우선순위·영역 축으로 정리, 변경기록 도입<br>- **릴리스**: 첫 정식 버전 1.0.0. 릴리스 파일 준비 단계에서 변경기록 최신 행과 버전 일치 확인<br>PR: [#44] |
| 0.1.0 | 2026-09-20 | feat | - **스크린샷**: 보이는 화면, 전체 페이지(스크롤 스티칭, 고정 요소·지연 로딩 처리), 요소(호버·클릭 고정·경로 패널·키보드 조정, 잘린·대형 요소), 영역(드래그) 캡처<br>- **녹화**: 탭·영역·요소 녹화, 요소 따라가기(출력 크기 고정·레터박스·화면 밖 직전 화면 유지), 카운트다운·일시정지·최대 길이·녹화 중 표시·중단 복구, MP4/WebM(VP9·VP8·AV1) 포맷과 품질 프로파일<br>- **UI**: 팝업 메뉴와 작업 상태, 설정(검증·마이그레이션), 결과 페이지(미리보기·다운로드·클립보드), 권한 페이지, 단축키 Alt+Shift+1~4, 한국어·영어<br>- **권한**: activeTab 기반, host 권한 없음, 제한 페이지 안내<br>- **검증**: 단위 153개·E2E 87개, PR·main CI, 수동 체크리스트<br>- **배포**: 아이콘·개인정보 처리방침·스토어 문안, 태그 푸시로 `clipt.zip`·체크섬을 GitHub Release에 게시, 설치 안내<br>PR: [#22], [#23], [#24], [#25], [#26], [#27], [#28], [#29], [#30], [#31], [#32], [#33], [#34], [#35], [#36], [#37], [#38], [#39], [#40], [#41], [#42], [#43] |

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
