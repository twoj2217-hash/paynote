================================================================
## 페이노트(PayNote) — 패치 노트 2
## 작성일: 2026-04-11
## 목적: "사장님 골목" — 익명 벤치마크 지도 시각화 기능 추가
## 참조: HANDOVER_v2026-03-31, PATCHNOTE_1_v2026-04-06,
##       STORE_DASHBOARD_HANDOVER_v2026-04-05
================================================================

================================================================
## 0. 이 문서를 새 채팅에 붙여넣는 법
================================================================
새 채팅 시작 시 아래 문장과 함께 이 문서 전체를 붙여넣기:

"페이노트(PayNote) 프로젝트의 패치노트 2입니다.
이 문서를 기준으로 '사장님 골목' 기능 설계를 시작해주세요."

================================================================
## 1. 기존 프로젝트 핵심 정보 (변경 없음)
================================================================

### 브랜드 & 타깃
- 서비스명: 페이노트(PayNote)
- 별명: "월 9,900원짜리 자동 노무사"
- 타깃: 카페·요식업 1~5인 소규모 소상공인 사장님

### 기술 스택
- SvelteKit (Runes 문법: $state, $derived, $effect)
- Supabase (PostgreSQL + Auth + RLS + Realtime)
- Tailwind CSS
- lucide-svelte (아이콘)
- KST(한국 표준시) 기준 모든 시간 처리
- 모든 UI 텍스트: 한국어

### 기존 DB 테이블 (건드리지 말 것)
- stores          : id, name, owner_id, qr_code, timezone,
                    chatbot_usage_this_month, chatbot_usage_reset_month
- employees       : id, store_id, name, hourly_wage, pin_code,
                    weekly_contracted_days
- timecards       : id, employee_id, date, clock_in(timestamptz), clock_out(timestamptz)
- payroll_items   : id, employee_id, month, base_pay, total
- weekly_hours    : id, employee_id, week_start, total_hours (현재 미사용)
- menu_items      : id, store_id, name, price, unit, current_stock,
                    max_stock, min_stock, display_order, is_active
- sales_records   : id, store_id, menu_item_id, menu_name,
                    quantity, unit_price, total_amount, sold_at(timestamptz)

### 기존 라우트 (건드리지 말 것)
- /login · /dashboard · /employees · /timecards
- /payroll · /checkin · /q/[store_id]

### 핵심 유틸 함수 (반드시 사용)
```typescript
import { parseUtc } from '$lib/utils/timezone';  // DB 타임스탬프 파싱
import { toKST }    from '$lib/utils/timezone';  // KST 표시
import { calculatePay } from '$lib/utils/payroll-calc';
import { calculateMonthlyAllowance } from '$lib/utils/payroll-calc';
```

### 절대 규칙
1. [Runes] $state, $derived, $effect 만 사용. export let / $: 금지
2. [타임존] DB 타임스탬프 → parseUtc() 필수 / input → new Date() 직접
3. [API 키] ANTHROPIC_API_KEY → +server.ts에서만, $env/static/private
4. [금액] toLocaleString('ko-KR') + '원'
5. [로딩] 비동기 버튼 비활성화 필수
6. [한국어] 모든 UI 텍스트 한국어
7. [보안] store_id 하드코딩 금지, locals.storeId 사용

================================================================
## 2. 패치노트 2 목표: "사장님 골목"
================================================================

### 개념 한 줄 요약
> "내 가게가 동네 카페들 사이에서 어디쯤 있는지,
>  익명 지도로 한눈에 보여주는 벤치마크 시각화"

### 왜 만드는가 (전략적 이유)
- 멀리(Mulli) 등 경쟁 서비스와의 핵심 차별화 포인트
- 페이노트 사용자가 늘수록 데이터가 쌓여 더 정확해지는 네트워크 효과
- "급여 툴"에서 "소상공인 인사이트 플랫폼"으로 포지셔닝 확장
- 경쟁사가 단기간에 복사할 수 없는 유일한 기능 (데이터가 자산)

### 공모전 신청서 핵심 문장
> "페이노트는 사용자가 늘어날수록 '내 가게가 업계 평균 대비
>  어디쯤 있는지' 알 수 있는 소상공인 벤치마크 네트워크가 됩니다.
>  이 데이터는 페이노트만 가질 수 있습니다."

================================================================
## 3. 기능 상세 설계
================================================================

### 3-1. 화면 구성

```
[ /neighborhood 또는 /dashboard 내 탭 ]

┌─────────────────────────────────────────────┐
│  📍 사장님 골목                              │
│  "우리 동네 카페들과 비교해보세요"           │
├─────────────────────────────────────────────┤
│                                             │
│  [지도 영역 — 인터랙티브 SVG 또는 Canvas]   │
│                                             │
│   ●  ●      익명 카페 (회색 점)             │
│      ★      내 가게 (파란 별)               │
│   ●     ●                                   │
│                                             │
│  클릭 시 말풍선:                            │
│  "이 가게: 인건비율 28% · 직원 2명 · ★4.1" │
│                                             │
├─────────────────────────────────────────────┤
│  내 가게 위치: 인건비율 상위 35%            │
│  [인건비율] [평균시급] [주휴수당 준수율]    │
│  탭 전환으로 지도 위 점 색상 변경           │
└─────────────────────────────────────────────┘
```

### 3-2. 표시 데이터 항목

| 지표명 | 계산 방법 | 출처 테이블 |
|--------|-----------|-------------|
| 인건비율 | 월 총 급여 / 월 매출 × 100 | payroll_items + sales_records |
| 평균 시급 | employees.hourly_wage 평균 | employees |
| 직원 수 | employees COUNT | employees |
| 주휴수당 준수율 | 주휴 발생 직원 / 전체 직원 | timecards + 계산 엔진 |
| 월 매출 | sales_records SUM | sales_records |

### 3-3. 익명화 원칙 (필수)

```
- 개별 매장 식별 정보 일절 노출 금지 (상호명, 주소, store_id)
- 지도상 점의 위치는 실제 좌표가 아닌 랜덤 오프셋 적용
  (반경 500m 이내 무작위 배치 — 위치 역추적 불가)
- 표시 최소 집계 단위: 동일 지역 5개 매장 이상일 때만 표시
  (5개 미만 지역은 "데이터 준비 중" 표시)
- 사용자가 지도에 참여하려면 명시적 동의 필요 (opt-in)
```

### 3-4. 지도 구현 방식

```
옵션 선택: SVG 기반 추상 지도 (권장)
이유:
- 실제 지도 API (카카오·네이버) → 비용 발생 + 개인정보 이슈
- Canvas 2D → 모바일 터치 처리 복잡
- SVG → 비용 0원, 반응형 쉬움, Tailwind 스타일 적용 가능

구현:
- 배경: 단순화된 동네 격자 SVG (실제 지도 아님)
- 점: <circle> 요소 (회색 = 익명, 파란 별 = 내 가게)
- 인터랙션: Svelte의 onmouseenter/onclick으로 말풍선 표시
- 애니메이션: CSS transition으로 점 페이드인
```

================================================================
## 4. 새 DB 설계
================================================================

### 4-1. store_benchmarks (집계 스냅샷 테이블)

```sql
CREATE TABLE IF NOT EXISTS store_benchmarks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  snapshot_month  TEXT NOT NULL,          -- 'YYYY-MM' 형식 (KST)
  labor_cost_rate NUMERIC(5,2),           -- 인건비율 (%)
  avg_hourly_wage INTEGER,                -- 평균 시급 (원)
  employee_count  SMALLINT,               -- 직원 수
  weekly_allow_rate NUMERIC(5,2),         -- 주휴수당 준수율 (%)
  monthly_revenue INTEGER,                -- 월 매출 (원)
  region_code     TEXT,                   -- 지역 코드 (예: 'seoul-mapo')
  is_visible      BOOLEAN DEFAULT false,  -- 사장님 동의 여부 (opt-in)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, snapshot_month)
);

-- RLS
ALTER TABLE store_benchmarks ENABLE ROW LEVEL SECURITY;

-- 본인 데이터: 모든 작업 허용
CREATE POLICY "own_store_benchmark" ON store_benchmarks
  FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- 익명 집계 조회: is_visible=true인 것만 SELECT 허용
CREATE POLICY "public_visible_benchmark" ON store_benchmarks
  FOR SELECT USING (is_visible = true);
```

### 4-2. 스냅샷 생성 로직 (월 1회 자동)

```
트리거: 매월 1일 KST 00:00 (또는 사용자가 급여 확정 버튼 클릭 시)
주체: SvelteKit +server.ts API 엔드포인트

계산 순서:
1. 해당 월 payroll_items → 총 급여 합산
2. 해당 월 sales_records → 총 매출 합산
3. labor_cost_rate = 총급여 / 총매출 × 100
4. employees → avg_hourly_wage, employee_count 계산
5. 주휴수당 준수율: calculateMonthlyAllowance() 재활용
6. store_benchmarks UPSERT
```

================================================================
## 5. 구현 단계 (Cursor 작업 순서)
================================================================

### STEP 1 — DB 마이그레이션
Supabase SQL Editor에서 4-1 SQL 실행

### STEP 2 — 스냅샷 API 엔드포인트 생성
```
신규 파일: src/routes/api/benchmark/+server.ts
역할: 로그인한 사장님의 이번 달 데이터를 집계해
      store_benchmarks에 UPSERT
```

### STEP 3 — 사장님 골목 컴포넌트 생성
```
신규 파일: src/lib/components/Neighborhood.svelte
역할: is_visible=true인 전체 벤치마크 데이터 조회 →
      SVG 지도 위 점으로 시각화
```

### STEP 4 — 대시보드 탭 통합
```
수정 파일: src/routes/dashboard/+page.svelte
변경: 상단에 탭 추가 ["근태현황" | "가게현황판" | "사장님 골목"]
      탭 전환 시 컴포넌트 교체
```

### STEP 5 — opt-in 동의 UI
```
수정 파일: src/routes/dashboard/+page.svelte 또는
           Neighborhood.svelte 내부
내용: "사장님 골목에 내 가게를 익명으로 표시할까요?
      개인정보는 절대 공개되지 않습니다. [참여하기]"
      → is_visible = true UPDATE
```

================================================================
## 6. 디자인 시스템 (기존과 동일)
================================================================

```
카드:      rounded-2xl border border-gray-100 bg-white shadow-sm p-5
Primary:   bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold rounded-xl
Secondary: border border-gray-200 bg-white text-gray-700 rounded-xl
배지-정상: bg-green-50 text-green-700 rounded-full px-2.5 py-0.5 text-xs
배지-주의: bg-orange-50 text-orange-700 (동일)
배지-위험: bg-red-50 text-red-700 (동일)
내 가게 강조색: #2563eb (파란색)
익명 점 색상: #d1d5db (회색-300)
```

================================================================
## 7. MVP 범위 (공모전 마감 5/15 기준)
================================================================

### 반드시 완성 (5/15 이전)
- [x] store_benchmarks 테이블 생성
- [ ] 스냅샷 API 엔드포인트
- [ ] SVG 추상 지도 + 점 렌더링
- [ ] 내 가게 강조 표시
- [ ] opt-in 동의 UI
- [ ] 대시보드 탭 통합

### Phase 2 (공모전 이후)
- [ ] 지역별 필터 (서울/경기/부산...)
- [ ] 지표 탭 전환 (인건비율/평균시급/주휴수당)
- [ ] 실제 카카오 지도 연동 (사용자 증가 후)
- [ ] 주간/분기 스냅샷 확장

================================================================
## 8. 새 채팅 시작 예시
================================================================

```
페이노트(PayNote) 프로젝트 패치노트 2입니다.
PATCHNOTE_2_v2026-04-11.md 를 기준으로 작업합니다.

목표: "사장님 골목" 기능 — 익명 벤치마크 지도 시각화

오늘 작업할 STEP: [1번부터 / 또는 특정 STEP]

[추가 요청사항이 있으면 여기에]
```

================================================================
## 9. 미결 사항 (새 채팅에서 결정)
================================================================

🔴 결정 필요
- [ ] 지도 스타일: 완전 추상(격자) vs 한국 지도 실루엣 중 선택
- [ ] 스냅샷 트리거: 자동(월 1일) vs 수동(사장님이 버튼 클릭) 중 선택
- [ ] 지역 코드 입력: 사장님이 직접 입력 vs 가입 시 자동 감지

🟡 검토 필요
- [ ] 최소 집계 인원(5명) 미달 지역 대체 표시 방법
- [ ] 스냅샷 데이터 없는 신규 사장님 대상 Empty State
