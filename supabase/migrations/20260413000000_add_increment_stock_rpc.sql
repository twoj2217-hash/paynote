-- 판매 취소 시 재고를 복구하는 RPC 함수
create or replace function public.increment_stock(item_id uuid, amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_stock integer;
begin
  -- 잘못된 입력을 방어합니다.
  if amount is null or amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  update public.menu_items
  set current_stock = current_stock + amount
  where id = item_id
  returning current_stock into new_stock;

  -- 대상 메뉴가 없으면 예외 처리합니다.
  if new_stock is null then
    raise exception 'menu item not found: %', item_id;
  end if;

  return new_stock;
end;
$$;

grant execute on function public.increment_stock(uuid, integer) to anon, authenticated, service_role;
