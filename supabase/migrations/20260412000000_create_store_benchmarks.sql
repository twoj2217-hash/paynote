-- store_benchmarks: 사장님 골목 벤치마크 월간 스냅샷
-- 매장별 월 1회 집계된 인건비율·시급·직원수·주휴수당·매출 데이터를 저장한다.
-- opt-in(is_visible=true) 매장만 익명 지도에 노출된다.

CREATE TABLE IF NOT EXISTS store_benchmarks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  snapshot_month  TEXT NOT NULL,          -- 'YYYY-MM' (KST 기준)
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

-- RLS 활성화
ALTER TABLE store_benchmarks ENABLE ROW LEVEL SECURITY;

-- 이미 존재하는 정책으로 인해 마이그레이션이 중단되지 않도록 선삭제합니다.
DROP POLICY IF EXISTS "own_store_benchmark" ON store_benchmarks;
DROP POLICY IF EXISTS "public_visible_benchmark" ON store_benchmarks;

-- 본인 매장 데이터: 모든 작업(SELECT/INSERT/UPDATE/DELETE) 허용
CREATE POLICY "own_store_benchmark" ON store_benchmarks
  FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- 익명 벤치마크 조회: is_visible=true인 레코드만 SELECT 허용
CREATE POLICY "public_visible_benchmark" ON store_benchmarks
  FOR SELECT USING (is_visible = true);
