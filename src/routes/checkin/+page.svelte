<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const QR_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=';

  interface Employee { id: string; name: string; store_id: string; }

  let employees = $state<Employee[]>([]);
  let selectedId = $state('');
  let actionType = $state<'clock_in' | 'clock_out'>('clock_in');
  let isSubmitting = $state(false);
  let successMsg = $state('');
  let errorMsg = $state('');
  let qrSrc = $state('');

  onMount(async () => {
    const storeId = data.storeId;
    if (!storeId) return;
    const { data: rows } = await supabase
      .from('employees')
      .select('id, name, store_id')
      .eq('store_id', storeId);
    if (rows) employees = rows;
  });

  function clearMessages() { successMsg = ''; errorMsg = ''; }

  async function handleSubmit() {
    if (!selectedId) { errorMsg = '직원을 선택해 주세요.'; return; }
    clearMessages();
    isSubmitting = true;

    const emp = employees.find(e => e.id === selectedId)!;
    // KST 기준 오늘 날짜 (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    const nowIso = new Date().toISOString();

    if (actionType === 'clock_in') {
      const { data: dup } = await supabase
        .from('timecards')
        .select('id')
        .eq('employee_id', selectedId)
        .eq('date', today)
        .is('clock_out', null)
        .maybeSingle();

      if (dup) {
        errorMsg = `${emp.name}님은 이미 출근 중입니다.`;
        isSubmitting = false;
        return;
      }

      const { error } = await supabase.from('timecards').insert([{
        id: crypto.randomUUID(),
        employee_id: selectedId,
        date: today,
        clock_in: nowIso,
        clock_out: null,
      }]);

      if (error) errorMsg = '오류: ' + error.message;
      else successMsg = `✅ ${emp.name}님 출근이 기록되었습니다. (${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })})`;

    } else {
      const { data: open } = await supabase
        .from('timecards')
        .select('id')
        .eq('employee_id', selectedId)
        .eq('date', today)
        .is('clock_out', null)
        .maybeSingle();

      if (!open) {
        errorMsg = `${emp.name}님의 오늘 출근 기록이 없습니다.`;
        isSubmitting = false;
        return;
      }

      const { error } = await supabase
        .from('timecards')
        .update({ clock_out: nowIso })
        .eq('id', open.id);

      if (error) errorMsg = '오류: ' + error.message;
      else successMsg = `✅ ${emp.name}님 퇴근이 기록되었습니다. (${new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })})`;
    }

    isSubmitting = false;
  }

  /** 모바일 스캔 시 같은 호스트로 열리도록 절대 URL 사용 */
  function generateQR() {
    const storeId = data.storeId;
    if (!storeId) return;
    const path = `/q/${storeId}`;
    const fullUrl = `${window.location.origin}${path}`;
    qrSrc = `${QR_BASE}${encodeURIComponent(fullUrl)}`;
  }
</script>

<div class="p-6 bg-gray-50 min-h-screen">
  <h1 class="text-3xl font-bold mb-8 text-gray-800">📲 QR 체크인</h1>

  <div class="grid md:grid-cols-2 gap-6 max-w-4xl">

    <!-- 출퇴근 기록 카드 -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 class="text-lg font-bold mb-5 text-gray-800">출퇴근 기록</h2>

      <label for="emp-select" class="block text-sm text-gray-600 mb-1">직원 선택</label>
      <select
        id="emp-select"
        bind:value={selectedId}
        onchange={clearMessages}
        class="w-full p-3 border rounded-lg mb-5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">-- 직원을 선택하세요 --</option>
        {#each employees as emp}
          <option value={emp.id}>{emp.name}</option>
        {/each}
      </select>

      <p class="text-sm text-gray-600 mb-2">구분</p>
      <div class="flex gap-3 mb-6">
        <button
          type="button"
          onclick={() => { actionType = 'clock_in'; clearMessages(); }}
          class="flex-1 py-2.5 rounded-lg font-medium text-sm border transition-colors
            {actionType === 'clock_in'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}"
        >
          출근
        </button>
        <button
          type="button"
          onclick={() => { actionType = 'clock_out'; clearMessages(); }}
          class="flex-1 py-2.5 rounded-lg font-medium text-sm border transition-colors
            {actionType === 'clock_out'
              ? 'bg-gray-700 text-white border-gray-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}"
        >
          퇴근
        </button>
      </div>

      <button
        type="button"
        onclick={handleSubmit}
        disabled={isSubmitting || !selectedId}
        class="w-full py-3 rounded-lg font-bold text-white transition-colors disabled:opacity-40
          {actionType === 'clock_in'
            ? 'bg-blue-600 hover:bg-blue-700'
            : 'bg-gray-700 hover:bg-gray-800'}"
      >
        {isSubmitting ? '처리 중...' : actionType === 'clock_in' ? '출근 기록하기' : '퇴근 기록하기'}
      </button>

      {#if successMsg}
        <div class="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium">{successMsg}</div>
      {/if}
      {#if errorMsg}
        <div class="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">{errorMsg}</div>
      {/if}
    </div>

    <!-- QR 코드 카드 -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
      <h2 class="text-lg font-bold mb-2 text-gray-800">가게 QR 코드</h2>
      <p class="text-sm text-gray-500 mb-5">직원이 스캔하면 이 가게의 체크인 페이지로 이동합니다.</p>

      <button
        type="button"
        onclick={generateQR}
        class="w-full py-3 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors mb-6"
      >
        QR 코드 생성
      </button>

      {#if qrSrc}
        <div class="flex flex-col items-center gap-3">
          <img src={qrSrc} alt="가게 QR 코드" class="rounded-xl border border-gray-200 shadow-sm">
          <p class="text-xs text-gray-400 font-mono">/q/{data.storeId}</p>
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center text-gray-300 text-sm border-2 border-dashed border-gray-200 rounded-xl py-12">
          버튼을 눌러 QR 코드를 생성하세요
        </div>
      {/if}
    </div>

  </div>
</div>
