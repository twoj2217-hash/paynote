# 페이노트(PayNote) 핸드오버 문서

## 1) 서비스 한 줄 소개

`페이노트(PayNote)`는 카페/요식업 사장님이 **출퇴근, 급여, 리뷰 응대**를 빠르게 처리하도록 만든 올인원 운영 도구입니다.

---

## 2) 문서 성격 (소개 + 인수인계 믹스업)

- 외부 소개용: 서비스 가치와 핵심 기능을 쉽게 설명
- 내부 운영용: 실제 구현 기능, 코드 위치, 점검 포인트를 정확히 전달
- 새 담당자가 이 문서만 보고 바로 운영/개발을 시작할 수 있도록 구성

---

## 3) 페이노트가 해결하는 문제

- **인건비 계산 부담**: 주휴수당/근무시간 계산을 자동화해서 실수 줄이기
- **출퇴근 관리 번거로움**: QR 기반 체크인으로 기록 단순화
- **리뷰 답글 작성 시간**: AI가 답글 초안을 만들고 위험도까지 안내

---

## 4) 핵심 기능 요약

- **근태 관리**
  - QR 체크인/체크아웃, 출퇴근 기록 저장
  - KST 기준 표시, 사장님 수동 수정 지원
- **급여 자동 계산**
  - 월별 근무시간/기본급/주휴수당 계산
  - 직원별 급여명세서 PDF 발급
- **대시보드**
  - 오늘 출근 인원, 현재 근무 인원, 마감 D-day 등 요약 지표
  - 직원 미등록 시 온보딩 가이드 표시
- **AI 리뷰 도우미**
  - 리뷰 답글 생성 (업종/톤/플랫폼 선택)
  - 위험도 레벨과 대응 가이드 제공
- **가게 현황판/사장님 골목**
  - 대시보드 내 탭 구조로 제공 중
  - 일부 기능은 단계적 확장(준비 중 상태 포함)

---

## 5) 현재 구현 기준 화면 경로

- `/dashboard`: 메인 대시보드
- `/employees`: 직원 등록/수정/삭제 + 우측 급여 요약
- `/checkin`: QR 출퇴근 기록
- `/timecards`: 월별 타임카드 조회/수정/삭제
- `/payroll`: 급여 요약 + PDF 명세서 발급
- `/review`: AI 리뷰 답글 생성
- `/q/[store_id]`: 직원 QR 스캔 유입 페이지(공개 경로)

---

## 6) 운영 기준 사용자 흐름

1. 로그인 후 대시보드 진입
2. 직원 관리에서 이름/시급/PIN/주당 근무일 등록
3. 체크인 화면 또는 QR 스캔으로 출퇴근 기록 생성
4. 타임카드에서 기록 확인 및 필요 시 수정
5. 급여 화면에서 월별 급여 검토 후 PDF 발급
6. 리뷰 관리에서 AI 답글 생성 후 복사/활용

---

## 7) 기술 스택

- **Frontend**: SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS
- **Backend/Auth/DB**: Supabase (PostgreSQL, SSR Auth)
- **AI**: Anthropic SDK (`claude-haiku-4-5-20251001`)
- **문서 출력**: `html2canvas`, `jspdf`
- **아이콘**: `lucide-svelte`

---

## 8) 핵심 코드 위치 (빠른 진입용)

- `src/routes/+layout.server.ts`
  - 인증 가드 및 `storeId` 주입
- `src/routes/dashboard/+page.server.ts`
  - 대시보드 상단 집계 로드
- `src/routes/employees/+page.svelte`
  - 직원 CRUD + 급여 요약 패널
- `src/routes/timecards/+page.svelte`
  - 월별 타임카드 조회/수정/삭제
- `src/routes/payroll/+page.svelte`
  - 급여 집계 표시 + PDF 생성
- `src/routes/api/review/+server.ts`
  - 리뷰 위험도 분석 + AI 답글 생성
- `src/lib/utils/timezone.ts`
  - KST 시간 처리 유틸
- `src/lib/payroll.ts`, `src/lib/utils/payroll-calc.ts`
  - 급여/주휴수당 계산 로직

---

## 9) 데이터/시간 처리 원칙

- 모든 운영 기준 시간은 **KST(Asia/Seoul)** 중심
- DB 저장은 UTC ISO를 사용하고, UI는 KST 변환 후 출력
- `store_id` 하드코딩 금지 (`+layout.server.ts`에서 전달된 값 사용)
- 출퇴근 중복/누락 방지 로직을 기본 적용

---

## 10) 환경 변수

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`

> 루트 `.env` 사용. 키/시크릿은 절대 외부 공유 금지.

---

## 11) 로컬 실행 및 점검

```bash
npm install
npm run dev
```

```bash
npm run check
```

---

## 12) 운영 체크 포인트

- **스토어 매핑 확인**: `stores.owner_id`가 로그인 사용자와 연결되어야 정상 동작
- **직원 0명 상태 대응**: 온보딩 가이드가 표시되는지 확인
- **급여 검증**: 월 마감 전 타임카드 누락/오입력 점검
- **AI 장애 대응**: `/api/review` 타임아웃/오류 메시지 노출 확인
- **QR 동작 확인**: `/q/[store_id]` 유입 후 체크인 저장 정상 여부 확인

---

## 13) 가이드북 반영 문구 (소개형)

- 제품 메시지: "월 구독으로 사장님 운영 업무를 자동화"
- 사용 포인트: "5분 내 첫 급여 계산", "QR 출퇴근", "AI 리뷰 응대"
- 전달 대상: 카페/요식업 소규모 사업장(직원 1~5인 중심)

> 위 문구는 소개용으로 사용하고, 실제 기능 안내는 본 문서의 "현재 구현 기준"을 우선으로 합니다.

---

## 14) 인수인계 우선 확인 항목

1. Supabase 프로젝트/권한/환경 변수 정상 여부
2. `stores`, `employees`, `timecards` 데이터 정합성
3. 월말 급여 산출 샘플 검증(특히 주휴수당)
4. `/review` API 응답 시간/오류율 확인
5. 대시보드 → 체크인 → 타임카드 → 급여 전체 플로우 수동 테스트

---

## 15) QA 리포트 메타데이터 규칙

1. QA 시작 전 `node tools/qa/report-meta.mjs` 실행
2. 출력된 `branch`, `commit` 값을 QA 리포트 헤더에 기록
3. 값이 `unknown`이면 저장소 연결 상태를 먼저 점검

