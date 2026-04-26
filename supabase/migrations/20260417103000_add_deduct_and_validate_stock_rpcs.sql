-- =============================================
-- 페이노트 재고 RPC 마이그레이션
-- 파일명: 20260417103000_add_deduct_and_validate_stock_rpcs.sql
-- 포함: deduct_stock, validate_stock
-- =============================================

-- 1. menu_items.current_stock 컬럼 보강
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS current_stock INTEGER NOT NULL DEFAULT 0;

-- =============================================
-- 2. deduct_stock: 원자적 재고 차감
--    성공 → { success: true,  remaining_stock: N }
--    실패 → { success: false, error: 'insufficient_stock' }
-- =============================================
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_menu_item_id UUID,
  p_quantity      INTEGER,
  p_store_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- WHERE current_stock >= p_quantity: 조건 + 업데이트가 단일 원자 연산
  -- → 동시 요청이 들어와도 음수 차감 불가
  UPDATE public.menu_items
  SET current_stock = current_stock - p_quantity
  WHERE id            = p_menu_item_id
    AND store_id      = p_store_id
    AND current_stock >= p_quantity
  RETURNING current_stock INTO v_remaining;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'insufficient_stock'
    );
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'remaining_stock', v_remaining
  );
END;
$$;

-- =============================================
-- 3. validate_stock: 사전 재고 검증 (차감 없음)
--    성공 → { success: true }
--    실패 → { success: false, shortage_names: ['메뉴명', ...] }
-- =============================================
CREATE OR REPLACE FUNCTION public.validate_stock(
  p_items    JSONB,  -- [{ menu_item_id: uuid, quantity: int }, ...]
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item      JSONB;
  v_stock   INTEGER;
  v_name    TEXT;
  shortage  TEXT[] := '{}';
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT current_stock, name
      INTO v_stock, v_name
      FROM public.menu_items
     WHERE id       = (item->>'menu_item_id')::UUID
       AND store_id = p_store_id;

    IF v_stock < (item->>'quantity')::INTEGER THEN
      shortage := array_append(shortage, v_name);
    END IF;
  END LOOP;

  IF array_length(shortage, 1) > 0 THEN
    RETURN jsonb_build_object(
      'success',        false,
      'shortage_names', shortage
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================
-- 4. 권한 부여
-- =============================================
GRANT EXECUTE ON FUNCTION public.deduct_stock(UUID, INTEGER, UUID)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.validate_stock(JSONB, UUID)
  TO anon, authenticated, service_role;
