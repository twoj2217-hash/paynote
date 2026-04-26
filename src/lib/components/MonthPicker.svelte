<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  // 조회 연·월 (부모와 양방향 바인딩)
  let {
    selectedYear = $bindable(new Date().getFullYear()),
    selectedMonth = $bindable(new Date().getMonth() + 1),
    onchange = (_year: number, _month: number) => {},
  }: {
    selectedYear?: number;
    selectedMonth?: number;
    onchange?: (year: number, month: number) => void;
  } = $props();

  const months = [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ];

  // 현재 연도 기준 ±2년
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  function prevMonth() {
    if (selectedMonth === 1) {
      selectedMonth = 12;
      selectedYear -= 1;
    } else {
      selectedMonth -= 1;
    }
    onchange(selectedYear, selectedMonth);
  }

  function nextMonth() {
    if (selectedMonth === 12) {
      selectedMonth = 1;
      selectedYear += 1;
    } else {
      selectedMonth += 1;
    }
    onchange(selectedYear, selectedMonth);
  }
</script>

<div
  class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
>
  <button
    type="button"
    onclick={prevMonth}
    class="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
    aria-label="이전 달"
  >
    <ChevronLeft size={20} />
  </button>

  <select
    bind:value={selectedYear}
    onchange={() => onchange(selectedYear, selectedMonth)}
    class="min-w-[80px] cursor-pointer appearance-none rounded border-none bg-transparent px-2 py-1 text-center text-lg font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {#each years as year}
      <option value={year}>{year}년</option>
    {/each}
  </select>

  <select
    bind:value={selectedMonth}
    onchange={() => onchange(selectedYear, selectedMonth)}
    class="min-w-[60px] cursor-pointer appearance-none rounded border-none bg-transparent px-2 py-1 text-center text-lg font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
  >
    {#each months as month, i}
      <option value={i + 1}>{month}</option>
    {/each}
  </select>

  <button
    type="button"
    onclick={nextMonth}
    class="flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 active:bg-gray-200"
    aria-label="다음 달"
  >
    <ChevronRight size={20} />
  </button>
</div>
