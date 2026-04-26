-- Realtime 구독 대상(menu_items, sales_records)의 접근 범위를
-- "내가 소유한 매장(store_id)"으로 제한합니다.

-- 1) menu_items 정책
ALTER TABLE IF EXISTS public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_menu_items" ON public.menu_items;
CREATE POLICY "owner_select_menu_items"
ON public.menu_items
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owner_modify_menu_items" ON public.menu_items;
CREATE POLICY "owner_modify_menu_items"
ON public.menu_items
FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
);

-- 2) sales_records 정책
ALTER TABLE IF EXISTS public.sales_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_select_sales_records" ON public.sales_records;
CREATE POLICY "owner_select_sales_records"
ON public.sales_records
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owner_insert_sales_records" ON public.sales_records;
CREATE POLICY "owner_insert_sales_records"
ON public.sales_records
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "owner_delete_sales_records" ON public.sales_records;
CREATE POLICY "owner_delete_sales_records"
ON public.sales_records
FOR DELETE
TO authenticated
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE owner_id = auth.uid()
  )
);
