<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  // YYYY-MM-DD (부모와 양방향 바인딩)
  let {
    selectedDate = $bindable(''),
    onchange = (_date: string) => {},
  }: {
    selectedDate?: string;
    onchange?: (date: string) => void;
  } = $props();

  // 비어 있으면 오늘(로컬 달력)으로 초기화
  if (!selectedDate) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    selectedDate = `${y}-${m}-${d}`;
  }

  let year = $derived(parseInt(selectedDate.split('-')[0], 10));
  let month = $derived(parseInt(selectedDate.split('-')[1], 10));
  let day = $derived(parseInt(selectedDate.split('-')[2], 10));

  const currentYear = new Date().getFullYear();
  // 과거 근무일 입력(2020년~) + 올해·내년
  const years = Array.from(
    { length: Math.max(1, currentYear - 2020 + 2) },
    (_, i) => 2020 + i
  );
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  let daysInMonth = $derived(new Date(year, month, 0).getDate());
  let days = $derived(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  function updateDate(newYear?: number, newMonth?: number, newDay?: number) {
    const y = newYear ?? year;
    const m = newMonth ?? month;
    const maxDay = new Date(y, m, 0).getDate();
    const d = Math.min(newDay ?? day, maxDay);
    selectedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    onchange(selectedDate);
  }

  function prevDay() {
    const d = new Date(year, month - 1, day - 1);
    selectedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onchange(selectedDate);
  }

  function nextDay() {
    const d = new Date(year, month - 1, day + 1);
    selectedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onchange(selectedDate);
  }
</script>

<div
  class="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
>
  <button
    type="button"
    onclick={prevDay}
    class="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
    aria-label="하루 전"
  >
    <ChevronLeft size={20} />
  </button>

  <select
    value={year}
    onchange={(e) => updateDate(parseInt(e.currentTarget.value, 10))}
    class="min-w-[85px] cursor-pointer rounded-lg border border-gray-200 bg-transparent px-2 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {#each years as y}
      <option value={y}>{y}년</option>
    {/each}
  </select>

  <select
    value={month}
    onchange={(e) => updateDate(undefined, parseInt(e.currentTarget.value, 10))}
    class="min-w-[65px] cursor-pointer rounded-lg border border-gray-200 bg-transparent px-2 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {#each months as m}
      <option value={m}>{m}월</option>
    {/each}
  </select>

  <select
    value={day}
    onchange={(e) => updateDate(undefined, undefined, parseInt(e.currentTarget.value, 10))}
    class="min-w-[65px] cursor-pointer rounded-lg border border-gray-200 bg-transparent px-2 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {#each days as d}
      <option value={d}>{d}일</option>
    {/each}
  </select>

  <button
    type="button"
    onclick={nextDay}
    class="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
    aria-label="하루 후"
  >
    <ChevronRight size={20} />
  </button>
</div>
