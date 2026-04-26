# H-02 Realtime RLS 검증 결과 (2026-04-17)

## 점검 대상
- Realtime 구독 코드: `src/lib/components/StoreDashboard.svelte`
- 구독 테이블: `public.menu_items`, `public.sales_records`

## 확인 결과
- 클라이언트에서 아래 테이블을 실시간 구독하고 있음:
  - `menu_items` (UPDATE 이벤트)
  - `sales_records` (INSERT/DELETE 이벤트)
- 레포 내 Supabase 마이그레이션 기준으로 위 2개 테이블의 RLS 정책 정의가 명시되어 있지 않았음.
- 정책 미정의 상태에서는 환경별 기본 정책에 의존하게 되어, 매장 단위 데이터 경계가 불명확해질 수 있음.

## 보강 내용
- 신규 마이그레이션 추가:
  - `supabase/migrations/20260417113000_add_menu_and_sales_realtime_rls.sql`
- 적용 정책 요약:
  - `menu_items`: SELECT/ALL(수정 포함) 정책을 `stores.owner_id = auth.uid()` 기준으로 제한
  - `sales_records`: SELECT/INSERT/DELETE 정책을 동일 기준으로 제한
  - 두 테이블 모두 RLS 활성화

## 기대 효과
- 인증된 사용자 기준으로 본인 소유 매장(`store_id`) 데이터만 조회/수정/실시간 반영됨.
- 타 매장 데이터가 Realtime으로 노출될 위험을 줄임.

## 후속 확인 항목
- 실제 운영 DB 반영 후, 아래를 계정 분리로 검증 필요:
  - 본인 계정: 본인 매장 이벤트 수신
  - 타 계정: 타 매장 이벤트 미수신
