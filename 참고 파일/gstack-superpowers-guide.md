gstack 스킬 활성화:
이 프로젝트는 반드시 `.agents/skills/gstack` 경로의 스킬만 사용한다.
웹 브라우징/화면 검증은 기본적으로 `/browse` 사용.

---

gstack 전체 스킬 목록 (명령어 / 기능 / 사용예시)

1) /browse
- 기능: 헤드리스 브라우저로 페이지 이동, 클릭, 상태 확인, 스크린샷
- 예시: "로그인 흐름 동작 확인해줘"

2) /qa
- 기능: QA 테스트 + 버그 수정 + 재검증까지 수행
- 예시: "근태 체크인 페이지 QA하고 문제 있으면 고쳐줘"

3) /qa-only
- 기능: QA 리포트만 생성(코드 수정 없음)
- 예시: "이번 빌드 버그 리포트만 뽑아줘"

4) /review
- 기능: PR 머지 전 구조/안전성 리뷰
- 예시: "배포 전에 diff 리뷰해줘"

5) /ship
- 기능: 테스트, 리뷰, 버전/체인지로그, 푸시, PR 생성까지 ship 자동화
- 예시: "이번 기능 ship 해줘"

6) /land-and-deploy
- 기능: PR 머지 후 배포 상태 확인 + 프로덕션 건강 점검
- 예시: "머지하고 배포까지 확인해줘"

7) /setup-deploy
- 기능: 배포 플랫폼/헬스체크 설정 자동 구성
- 예시: "deploy 설정 잡아줘"

8) /canary
- 기능: 배포 후 콘솔 에러/성능/화면 이상 감시
- 예시: "배포 후 30분 모니터링해줘"

9) /benchmark
- 기능: 페이지 성능 회귀 비교(CWV/리소스/속도)
- 예시: "이번 PR 전후 성능 비교해줘"

10) /health
- 기능: 타입체크/린트/테스트 기반 코드 건강 점수화
- 예시: "코드베이스 헬스체크 해줘"

11) /investigate
- 기능: 원인 분석 중심 디버깅(추측 수정 금지)
- 예시: "500 에러 원인부터 찾아서 고쳐줘"

12) /careful
- 기능: 파괴적 명령 사전 경고 모드
- 예시: "운영 작업이라 careful 모드 켜줘"

13) /freeze
- 기능: 특정 디렉터리만 수정 가능하도록 제한
- 예시: "src/routes만 수정하게 잠가줘"

14) /unfreeze
- 기능: freeze 제한 해제
- 예시: "편집 제한 풀어줘"

15) /guard
- 기능: careful + freeze 결합(최대 안전 모드)
- 예시: "운영 긴급 대응이니 guard 모드로 해줘"

16) /checkpoint
- 기능: 현재 작업 상태 저장/복구
- 예시: "여기서 체크포인트 저장해줘"

17) /learn
- 기능: 세션 간 학습/패턴 기록 조회 및 정리
- 예시: "예전에 비슷한 오류 해결 기록 보여줘"

18) /retro
- 기능: 주간 엔지니어링 회고(추세/기여 분석)
- 예시: "이번 주 개발 회고 만들어줘"

19) /office-hours
- 기능: 아이디어 검증/브레인스토밍(스타트업/빌더 모드)
- 예시: "신규 예약 기능 아이디어 검토해줘"

20) /plan-ceo-review
- 기능: 제품/전략 관점에서 플랜 재검토(스코프 재설계)
- 예시: "이 기획, 더 큰 임팩트로 확장해줘"

21) /plan-design-review
- 기능: UX/UI 관점 플랜 리뷰 및 개선
- 예시: "관리자 대시보드 UX 플랜 리뷰해줘"

22) /plan-eng-review
- 기능: 아키텍처/데이터흐름/테스트 관점 플랜 리뷰
- 예시: "구현 전 엔지니어링 플랜 검증해줘"

23) /autoplan
- 기능: CEO/Design/Eng 리뷰를 순차 자동 실행해 플랜 확정
- 예시: "이 계획 자동 리뷰로 확정해줘"

24) /design-shotgun
- 기능: 여러 디자인 시안 생성 후 비교/피드백 반복
- 예시: "출퇴근 화면 디자인 4안 뽑아줘"

25) /design-review
- 기능: 라이브 UI 시각 품질 점검 + 개선
- 예시: "현재 페이지 디자인 폴리싱해줘"

26) /design-consultation
- 기능: 디자인 시스템 정의 및 DESIGN.md 정리
- 예시: "우리 서비스 디자인 시스템 만들어줘"

27) /design-html
- 기능: 확정된 시안을 실제 HTML/CSS로 구현
- 예시: "확정 시안을 실제 페이지로 바꿔줘"

28) /document-release
- 기능: 배포 후 문서(README/ARCHITECTURE/CHANGELOG) 동기화
- 예시: "이번 배포 내용으로 문서 업데이트해줘"

29) /codex
- 기능: 외부 코딩 모델 2nd opinion(리뷰/챌린지/질의)
- 예시: "이 로직 codex challenge로 깨봐"

30) /cso
- 기능: 보안 감사(OWASP/공급망/CI/CD/위협모델)
- 예시: "월간 보안 점검 실행해줘"

31) /setup-browser-cookies
- 기능: 실제 브라우저 쿠키를 QA 세션에 가져오기
- 예시: "로그인 쿠키 가져와서 인증 페이지 테스트해줘"

32) /connect-chrome
- 기능: 실제 Chrome 연결(사이드패널 활동 피드)
- 예시: "실제 크롬 띄우고 같이 보면서 테스트하자"

33) /gstack-upgrade
- 기능: gstack 최신 버전 업그레이드
- 예시: "gstack 최신으로 업데이트해줘"

34) /gstack
- 기능: gstack 브라우징 기본 스킬 엔트리
- 예시: "사이트 열어서 동작 확인해줘"

---

제품 개발 시 추천 스킬 조합

A) 신규 기능 기획~개발 시작
- `/office-hours` → `/plan-ceo-review` → `/plan-design-review` → `/plan-eng-review` → `/autoplan`
- 사용 시점: 기능 범위가 애매하거나, 구현 전에 리스크를 줄이고 싶을 때

B) UI/UX 중심 기능 제작
- `/design-shotgun` → `/design-consultation` → `/design-html` → `/design-review`
- 사용 시점: 화면 품질/일관성을 빠르게 끌어올릴 때

C) 구현 후 품질 검증
- `/qa` (또는 `/qa-only`) → `/review` → `/health` → `/benchmark`
- 사용 시점: 배포 전 안정성/회귀/성능 확인

D) 배포 파이프라인
- `/ship` → `/land-and-deploy` → `/canary` → `/document-release`
- 사용 시점: 머지부터 배포 후 모니터링, 문서 정리까지 한 번에

E) 장애/운영 대응
- `/guard` (또는 `/careful` + `/freeze`) → `/investigate` → `/checkpoint`
- 사용 시점: 프로덕션 이슈를 안전하게 원인 분석하고 복구할 때

---

superpowers 전체 스킬 목록 (명령어 / 기능 / 사용예시)

1) /using-superpowers
- 기능: superpowers 스킬 사용 원칙/흐름 정렬
- 예시: "이번 세션 superpowers 기준으로 시작해줘"

2) /brainstorming
- 기능: 구현 전 요구사항/의도/설계 방향 정리
- 예시: "신규 예약 기능 아이디어 먼저 정리해줘"

3) /writing-plans
- 기능: 멀티스텝 구현 계획 문서화
- 예시: "근태 대시보드 개선 계획 먼저 작성해줘"

4) /executing-plans
- 기능: 작성된 계획을 체크포인트 기반으로 실행
- 예시: "방금 만든 구현 계획 그대로 실행해줘"

5) /test-driven-development
- 기능: 기능/버그 수정 전에 테스트 먼저 작성(TDD)
- 예시: "급여 계산 버그 테스트부터 만들고 고쳐줘"

6) /systematic-debugging
- 기능: 증상-원인-가설-검증 순서의 체계적 디버깅
- 예시: "체크인 500 에러 원인부터 분석해줘"

7) /dispatching-parallel-agents
- 기능: 독립 작업을 병렬 에이전트로 분할 처리
- 예시: "UI 수정과 API 점검을 병렬로 진행해줘"

8) /subagent-driven-development
- 기능: 구현 계획을 서브에이전트 분업으로 실행
- 예시: "3개 모듈 구현을 분업해서 동시에 진행해줘"

9) /requesting-code-review
- 기능: 주요 구현 완료 후 리뷰 요청/점검
- 예시: "인증 기능 구현 끝났으니 코드 리뷰 진행해줘"

10) /receiving-code-review
- 기능: 리뷰 피드백 타당성 검증 후 안전 반영
- 예시: "리뷰 코멘트 반영 전에 검증부터 해줘"

11) /verification-before-completion
- 기능: 완료 선언 전 테스트/체크 근거 확인
- 예시: "완료 처리 전에 타입체크/테스트 먼저 확인해줘"

12) /using-git-worktrees
- 기능: 기능별 격리 작업공간(worktree) 구성
- 예시: "현재 작업과 분리해서 새 기능 worktree로 진행해줘"

13) /finishing-a-development-branch
- 기능: 구현 완료 후 PR/병합/정리 마무리 가이드
- 예시: "이 브랜치 마무리 절차를 정리해줘"

14) /writing-skills
- 기능: 새 스킬 작성/기존 스킬 개선/검증
- 예시: "우리 팀용 QA 자동화 스킬 만들어줘"

---

superpowers 제품 개발 시 추천 스킬 조합

A) 신규 기능 시작(기획 → 구현)
- `/brainstorming` → `/writing-plans` → `/executing-plans` → `/verification-before-completion`
- 사용 시점: 요구사항이 모호하거나 구현 전에 방향 정리가 필요할 때

B) 버그 대응(원인 중심)
- `/systematic-debugging` → `/test-driven-development` → `/verification-before-completion`
- 사용 시점: 원인 불명 오류나 회귀 버그를 안정적으로 고칠 때

C) 병렬 개발(독립 작업 다수)
- `/writing-plans` → `/dispatching-parallel-agents`(또는 `/subagent-driven-development`) → `/verification-before-completion`
- 사용 시점: 동시에 처리 가능한 독립 작업이 2개 이상일 때

D) 코드 품질 강화 후 머지 준비
- `/requesting-code-review` → `/receiving-code-review` → `/finishing-a-development-branch`
- 사용 시점: 구현 완료 후 리뷰 반영과 병합 준비를 체계화할 때

E) 안전한 실험/격리 개발
- `/using-git-worktrees` → `/executing-plans` → `/finishing-a-development-branch`
- 사용 시점: 기존 작업을 보존하면서 새 기능을 분리 개발할 때

---

gstack + superpowers 2스킬 조합 예시 (목적별 / 쉬운 표현)

[기획]
1) `/office-hours` + `/brainstorming`
- 사용 예시: "아이디어가 괜찮은지 먼저 보고, 해야 할 일까지 쉽게 정리해줘"

2) `/plan-ceo-review` + `/writing-plans`
- 사용 예시: "이 기능을 더 좋게 만들 방향을 잡고, 바로 실행 계획 써줘"

3) `/plan-design-review` + `/writing-plans`
- 사용 예시: "화면 흐름 점검하고, 만들 순서를 계획으로 정리해줘"

4) `/plan-eng-review` + `/writing-plans`
- 사용 예시: "기술적으로 문제 없는지 확인하고, 작업 순서를 정해줘"

5) `/autoplan` + `/executing-plans`
- 사용 예시: "자동 검토 끝낸 계획을 바로 실행해줘"

6) `/learn` + `/brainstorming`
- 사용 예시: "예전에 잘 됐던 방식 참고해서 이번 아이디어도 다듬어줘"

7) `/design-shotgun` + `/brainstorming`
- 사용 예시: "디자인 여러 안 보기 전에, 먼저 필요한 화면을 쉽게 정리해줘"

8) `/design-consultation` + `/writing-plans`
- 사용 예시: "디자인 기준 먼저 잡고, 실제 작업 계획까지 써줘"

9) `/checkpoint` + `/writing-plans`
- 사용 예시: "지금 상태 저장하고 다음 작업 계획만 깔끔하게 정리해줘"

10) `/retro` + `/writing-plans`
- 사용 예시: "지난 작업에서 배운 점으로 다음 주 계획을 세워줘"

[디버깅]
1) `/investigate` + `/systematic-debugging`
- 사용 예시: "왜 고장났는지 원인부터 찾고, 순서대로 고쳐줘"

2) `/guard` + `/systematic-debugging`
- 사용 예시: "중요한 코드 건드릴 때 안전 모드로 원인부터 찾아줘"

3) `/browse` + `/systematic-debugging`
- 사용 예시: "화면에서 직접 문제를 재현하면서 원인을 찾아줘"

4) `/freeze` + `/test-driven-development`
- 사용 예시: "이 폴더만 수정하게 잠그고, 테스트 먼저 만든 뒤 고쳐줘"

5) `/careful` + `/verification-before-completion`
- 사용 예시: "실수 위험 작업이니 경고 모드로 진행하고 마지막 확인까지 해줘"

6) `/canary` + `/systematic-debugging`
- 사용 예시: "배포 후 이상이 보이면 바로 원인 분석해서 대응해줘"

[QA]
1) `/qa` + `/test-driven-development`
- 사용 예시: "테스트하면서 문제 찾고, 고칠 때는 테스트 먼저 추가해줘"

2) `/qa-only` + `/writing-plans`
- 사용 예시: "문제 목록만 뽑고, 고치는 계획은 따로 정리해줘"

3) `/setup-browser-cookies` + `/qa`
- 사용 예시: "로그인 상태 가져와서 회원 전용 화면까지 점검해줘"

4) `/connect-chrome` + `/qa-only`
- 사용 예시: "실제 크롬에서 확인하고, 수정 없이 문제 보고서만 만들어줘"

5) `/browse` + `/verification-before-completion`
- 사용 예시: "사용자 입장에서 핵심 기능을 눌러보고 마지막 확인해줘"

6) `/health` + `/verification-before-completion`
- 사용 예시: "코드 상태 점수 확인하고, 끝내도 되는지 확인해줘"

7) `/benchmark` + `/verification-before-completion`
- 사용 예시: "속도 느려진 부분 있는지 확인하고 통과 여부 알려줘"

8) `/design-html` + `/verification-before-completion`
- 사용 예시: "화면 구현 후 모바일/가독성까지 최종 확인해줘"

[배포]
1) `/setup-deploy` + `/writing-plans`
- 사용 예시: "배포 준비를 처음부터 끝까지 순서대로 계획해줘"

2) `/ship` + `/verification-before-completion`
- 사용 예시: "배포 전 테스트 통과했는지 먼저 확인하고 올려줘"

3) `/ship` + `/finishing-a-development-branch`
- 사용 예시: "올리기 전에 브랜치 마무리 체크부터 해줘"

4) `/land-and-deploy` + `/verification-before-completion`
- 사용 예시: "배포 후 서비스가 정상인지 확인하고 마무리해줘"

5) `/canary` + `/verification-before-completion`
- 사용 예시: "배포 직후 오류/속도 이상 없는지 잠깐 지켜봐줘"

6) `/gstack-upgrade` + `/verification-before-completion`
- 사용 예시: "도구 업데이트 후 정상 동작 확인까지 해줘"

7) `/benchmark` + `/requesting-code-review`
- 사용 예시: "성능 결과를 붙여서 최종 리뷰 요청 자료로 만들어줘"

[문서화]
1) `/document-release` + `/writing-plans`
- 사용 예시: "릴리즈 문서 업데이트를 할 일 순서대로 정리해줘"

2) `/review` + `/requesting-code-review`
- 사용 예시: "바뀐 내용 점검하고, 리뷰 요청용 핵심 포인트를 정리해줘"

3) `/review` + `/receiving-code-review`
- 사용 예시: "받은 리뷰 의견을 확인하고 반영 우선순위를 정리해줘"

4) `/design-review` + `/receiving-code-review`
- 사용 예시: "디자인 피드백을 쉬운 말로 정리하고 안전하게 반영해줘"

5) `/cso` + `/requesting-code-review`
- 사용 예시: "보안 점검 결과를 팀 리뷰 문서에 넣기 좋게 정리해줘"

6) `/codex` + `/receiving-code-review`
- 사용 예시: "다른 관점 의견도 참고해서 리뷰 반영안을 정리해줘"

7) `/checkpoint` + `/finishing-a-development-branch`
- 사용 예시: "현재 상태를 남기고, 마무리 기록까지 깔끔하게 정리해줘"
