-- 관리자 타임카드 수동 정정 감사 로그 테이블
create table if not exists public.timecard_adjustments (
  id uuid primary key default gen_random_uuid(),
  timecard_id uuid not null references public.timecards(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  before_date date not null,
  before_clock_in timestamptz not null,
  before_clock_out timestamptz null,
  after_date date not null,
  after_clock_in timestamptz not null,
  after_clock_out timestamptz not null,
  reason text not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_timecard_adjustments_store_updated_at
  on public.timecard_adjustments(store_id, updated_at desc);

create index if not exists idx_timecard_adjustments_timecard
  on public.timecard_adjustments(timecard_id);

alter table if exists public.timecard_adjustments enable row level security;

drop policy if exists "owner_select_timecard_adjustments" on public.timecard_adjustments;
create policy "owner_select_timecard_adjustments"
on public.timecard_adjustments
for select
to authenticated
using (
  store_id in (
    select id from public.stores where owner_id = auth.uid()
  )
);

drop policy if exists "owner_insert_timecard_adjustments" on public.timecard_adjustments;
create policy "owner_insert_timecard_adjustments"
on public.timecard_adjustments
for insert
to authenticated
with check (
  store_id in (
    select id from public.stores where owner_id = auth.uid()
  )
  and updated_by = auth.uid()
);
