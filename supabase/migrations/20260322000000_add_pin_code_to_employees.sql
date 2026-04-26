-- employees 테이블에 4자리 PIN 컬럼 추가
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS pin_code VARCHAR(4) NOT NULL DEFAULT '0000';

-- DEFAULT 제거 (이후 등록되는 직원은 반드시 PIN을 지정해야 함)
ALTER TABLE employees
  ALTER COLUMN pin_code DROP DEFAULT;

-- 기존 직원은 '0000'으로 초기화됨. 사장님이 직원 관리 화면에서 직접 변경 필요.
