<script lang="ts">
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import {
    buildKSTDateTime,
    formatKSTDate,
    getKSTHourMinute,
    getKSTNow,
    getKSTTodayYmd,
    parseUtc,
    toDbIso,
    toKSTDateString,
    validateClockDateTime,
  } from '$lib/utils/timezone';

  interface Employee {
    id: string;
    name: string;
  }
  type WorkStatus = 'none' | 'clocked_in' | 'completed';

  let storeId = $state('');
  let employees = $state<Employee[]>([]);
  let selectedId = $state('');
  let isSubmitting = $state(false);
  let successMsg = $state('');
  let successAction = $state<'clock_in' | 'clock_out'>('clock_in');
  let errorMsg = $state('');
  // `store_id`로 매장/직원 조회가 끝나기 전에는, 폼이 먼저 렌더링되지 않도록 로딩 상태를 둡니다.
  // (잘못된 QR에서 빈 드롭다운이 잠깐 보이는 UX 깜빡임 방지)
  let storeFound = $state<boolean | null>(null);

  let pinInput = $state('');
  let pinVerified = $state(false);
  let pinError = $state('');
  let workStatus = $state<WorkStatus>('none');
  let isCheckingStatus = $state(false);
  /** 퇴근 처리용 오늘 미마감 행 */
  let openCard = $state<{ id: string; clock_in: string } | null>(null);

  let useManualIn = $state(false);
  let useManualOut = $state(false);
  let selectedDate = $state(getKSTTodayYmd());
  let selectedHour = $state(getKSTHourMinute(getKSTNow()).hour);
  let selectedMinute = $state(getKSTHourMinute(getKSTNow()).minute);

  let currentTimeDisplay = $state(
    new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  );

  $effect(() => {
    const id = $page.params.store_id ?? '';
    storeId = id;
    // 매장 조회는 비동기이므로, 요청 시작 시점에 로딩 상태로 전환합니다.
    storeFound = null;
    employees = [];
    selectedId = '';
    pinVerified = false;
    pinInput = '';
    pinError = '';
    workStatus = 'none';
    openCard = null;
    successMsg = '';
    errorMsg = '';

    if (!id) {
      storeFound = false;
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name')
        .eq('store_id', id)
        .order('name');
      if (error || !data || data.length === 0) {
        storeFound = false;
        employees = [];
        return;
      }
      employees = data;
      storeFound = true;
    })();
  });

  $effect(() => {
    if (!pinVerified || workStatus === 'completed') return;
    const interval = setInterval(() => {
      currentTimeDisplay = new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }, 1000);
    return () => clearInterval(interval);
  });

  export const snapshot = {
    capture: () => selectedId,
    restore: (saved: string) => {
      selectedId = saved;
    },
  };

  function onEmployeeChange() {
    errorMsg = '';
    pinInput = '';
    pinVerified = false;
    pinError = '';
    workStatus = 'none';
    openCard = null;
    useManualIn = false;
    useManualOut = false;
  }

  async function verifyPin() {
    pinError = '';
    const emp = employees.find((e) => e.id === selectedId);
    if (!emp) return;

    // 서버 액션으로 PIN 검증 (브루트포스 방어 포함)
    const formData = new FormData();
    formData.append('pin', pinInput);
    formData.append('employeeId', selectedId);

    const res = await fetch(`/q/${storeId}?/verify`, {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();

    // SvelteKit action 응답 구조: { type, status, data }
    if (result?.type === 'failure') {
      pinError = result.data?.error ?? 'PIN 번호가 일치하지 않습니다.';
      pinInput = '';
      return;
    }

    pinVerified = true;
    isCheckingStatus = true;
    openCard = null;

    const today = getKSTTodayYmd();
    const { data } = await supabase
      .from('timecards')
      .select('id, clock_in, clock_out')
      .eq('employee_id', selectedId)
      .eq('date', today)
      .maybeSingle();

    if (!data) {
      workStatus = 'none';
      openCard = null;
    } else if (!data.clock_out) {
      workStatus = 'clocked_in';
      openCard = { id: data.id, clock_in: data.clock_in };
    } else {
      workStatus = 'completed';
      openCard = null;
    }

    isCheckingStatus = false;
  }

  function onPinInput() {
    pinError = '';
    if (pinInput.length === 4) verifyPin();
  }

  function resetManualFields() {
    selectedDate = getKSTTodayYmd();
    const { hour, minute } = getKSTHourMinute(getKSTNow());
    selectedHour = hour;
    selectedMinute = minute;
  }

  async function handleClockInNow() {
    errorMsg = '';
    isSubmitting = true;
    try {
      const now = getKSTNow();
      const v = validateClockDateTime(now);
      if (v) {
        errorMsg = v;
        return;
      }
      // date 컬럼: UTC가 아닌 KST 달력 날짜 (저장 순간의 ISO → KST 일자)
      const today = toKSTDateString(new Date().toISOString());
      const { error } = await supabase.from('timecards').insert({
        id: crypto.randomUUID(),
        employee_id: selectedId,
        date: today,
        clock_in: toDbIso(now),
        clock_out: null,
      });
      if (error) {
        errorMsg = '오류가 발생했습니다. 다시 시도해 주세요.';
        console.error(error);
        return;
      }
      const emp = employees.find((e) => e.id === selectedId)!;
      const timeStr = now.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      });
      successMsg = `${emp.name}님\n출근 기록 완료\n${timeStr}`;
      successAction = 'clock_in';
      useManualIn = false;
    } catch (e) {
      console.error(e);
      errorMsg = '예기치 않은 오류가 발생했습니다.';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleClockInManual() {
    errorMsg = '';
    isSubmitting = true;
    try {
      const dt = buildKSTDateTime(
        selectedDate,
        Number(selectedHour),
        Number(selectedMinute)
      );
      const v = validateClockDateTime(dt);
      if (v) {
        errorMsg = v;
        return;
      }
      const { error } = await supabase.from('timecards').insert({
        id: crypto.randomUUID(),
        employee_id: selectedId,
        date: formatKSTDate(dt),
        clock_in: toDbIso(dt),
        clock_out: null,
      });
      if (error) {
        errorMsg = '오류가 발생했습니다. 다시 시도해 주세요.';
        console.error(error);
        return;
      }
      const emp = employees.find((e) => e.id === selectedId)!;
      const timeStr = dt.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      });
      successMsg = `${emp.name}님\n출근 기록 완료\n${timeStr}`;
      successAction = 'clock_in';
      useManualIn = false;
      resetManualFields();
    } catch (e) {
      console.error(e);
      errorMsg = '예기치 않은 오류가 발생했습니다.';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleClockOutNow() {
    errorMsg = '';
    isSubmitting = true;
    try {
      const { data: open } = await supabase
        .from('timecards')
        .select('id')
        .eq('employee_id', selectedId)
        .eq('date', getKSTTodayYmd())
        .is('clock_out', null)
        .maybeSingle();

      if (!open) {
        errorMsg = '출근 기록이 없습니다.';
        return;
      }

      const now = getKSTNow();
      const v = validateClockDateTime(now);
      if (v) {
        errorMsg = v;
        return;
      }

      const { error } = await supabase
        .from('timecards')
        .update({ clock_out: toDbIso(now) })
        .eq('id', open.id);

      if (error) {
        errorMsg = '오류가 발생했습니다. 다시 시도해 주세요.';
        return;
      }
      const emp = employees.find((e) => e.id === selectedId)!;
      const timeStr = now.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      });
      successMsg = `${emp.name}님\n퇴근 기록 완료\n${timeStr}`;
      successAction = 'clock_out';
      useManualOut = false;
    } catch (e) {
      console.error(e);
      errorMsg = '예기치 않은 오류가 발생했습니다.';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleClockOutManual() {
    errorMsg = '';
    isSubmitting = true;
    try {
      if (!openCard) {
        errorMsg = '출근 기록이 없습니다.';
        return;
      }
      const dt = buildKSTDateTime(
        selectedDate,
        Number(selectedHour),
        Number(selectedMinute)
      );
      const v = validateClockDateTime(dt);
      if (v) {
        errorMsg = v;
        return;
      }
      if (dt.getTime() <= parseUtc(openCard.clock_in).getTime()) {
        errorMsg = '퇴근 시간은 출근 시간보다 늦어야 합니다.';
        return;
      }

      const { error } = await supabase
        .from('timecards')
        .update({ clock_out: toDbIso(dt) })
        .eq('id', openCard.id);

      if (error) {
        errorMsg = '오류가 발생했습니다. 다시 시도해 주세요.';
        return;
      }
      const emp = employees.find((e) => e.id === selectedId)!;
      const timeStr = dt.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
      });
      successMsg = `${emp.name}님\n퇴근 기록 완료\n${timeStr}`;
      successAction = 'clock_out';
      useManualOut = false;
      resetManualFields();
    } catch (e) {
      console.error(e);
      errorMsg = '예기치 않은 오류가 발생했습니다.';
    } finally {
      isSubmitting = false;
    }
  }

  function reset() {
    successMsg = '';
    errorMsg = '';
    selectedId = '';
    pinInput = '';
    pinVerified = false;
    pinError = '';
    workStatus = 'none';
    openCard = null;
    useManualIn = false;
    useManualOut = false;
    resetManualFields();
  }
</script>

<svelte:head>
  <title>출퇴근 체크인</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
</svelte:head>

{#if storeFound === null}
  <div class="min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
    <div class="bg-surface-card rounded-2xl shadow-sm p-6 sm:p-8 text-center max-w-sm w-full border border-surface-border">
      <p class="text-lg sm:text-xl font-bold text-ink-900 mb-2">매장 정보를 불러오는 중…</p>
      <div class="mx-auto h-9 w-9 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin"></div>
      <p class="text-sm text-gray-400 mt-4">잠시만 기다려 주세요.</p>
    </div>
  </div>
{:else if !storeFound}
  <div class="min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
    <div class="bg-surface-card rounded-2xl shadow-sm p-6 sm:p-8 text-center max-w-sm w-full border border-surface-border">
      <p class="text-5xl mb-4">😕</p>
      <p class="text-lg font-bold text-gray-700">유효하지 않은 QR 코드입니다.</p>
      <p class="text-sm text-gray-400 mt-2">사장님께 새 QR 코드를 요청해 주세요.</p>
    </div>
  </div>
{:else if successMsg}
  <div
    class="min-h-screen flex flex-col items-center justify-center p-6 {successAction === 'clock_in'
      ? 'bg-primary-600'
      : 'bg-accent-700'}"
  >
    <p class="text-7xl mb-6">{successAction === 'clock_in' ? '👋' : '🙌'}</p>
    <p class="text-3xl font-extrabold text-white text-center whitespace-pre-line leading-snug">
      {successMsg}
    </p>
    <button
      type="button"
      onclick={reset}
      class="mt-10 px-8 py-3 bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-base rounded-2xl transition-all"
    >
      다음 직원 체크인
    </button>
  </div>
{:else}
  <div class="min-h-screen flex flex-col bg-surface">
    <header class="px-4 sm:px-6 pt-8 pb-3 text-center">
      <p class="text-3xl mb-1">☕</p>
      <h1 class="heading-accent text-xl font-bold text-ink-900">출퇴근 체크인</h1>
    </header>

    <div class="px-4 sm:px-6 mb-3">
      <label for="emp-select" class="block text-sm font-medium text-gray-600 mb-1">내 이름 선택</label>
      <select
        id="emp-select"
        bind:value={selectedId}
        onchange={onEmployeeChange}
        class="w-full p-3.5 text-base border border-surface-border rounded-2xl bg-surface-card shadow-sm outline-none focus:ring-2 focus:ring-primary-500 appearance-none"
      >
        <option value="">-- 이름을 선택하세요 --</option>
        {#each employees as emp}
          <option value={emp.id}>{emp.name}</option>
        {/each}
      </select>
    </div>

    {#if selectedId && !pinVerified}
      <div class="px-4 sm:px-6 mb-3">
        <label for="pin-input" class="block text-sm font-medium text-gray-600 mb-1"
          >4자리 PIN 번호를 입력하세요</label
        >
        <input
          id="pin-input"
          type="password"
          inputmode="numeric"
          maxlength="4"
          bind:value={pinInput}
          oninput={onPinInput}
          placeholder="••••"
          class="w-full p-3.5 text-center text-2xl tracking-[0.5em] border border-surface-border rounded-2xl bg-surface-card shadow-sm outline-none focus:ring-2 focus:ring-primary-500"
        />
        {#if pinError}
          <p class="mt-2 text-red-500 text-sm font-medium text-center">{pinError}</p>
        {/if}
        <button
          type="button"
          onclick={verifyPin}
          disabled={pinInput.length !== 4}
          class="mt-3 w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-bold rounded-2xl transition-all active:scale-95"
        >
          확인
        </button>
      </div>
    {/if}

    {#if errorMsg}
      <div
        class="mx-4 sm:mx-6 mb-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium text-center"
      >
        {errorMsg}
      </div>
    {/if}

    {#if pinVerified}
      {#if isCheckingStatus}
        <div class="flex-1 flex items-center justify-center">
          <p class="text-gray-400 text-lg animate-pulse">상태 확인 중…</p>
        </div>
      {:else if workStatus === 'completed'}
        <div class="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <p class="text-6xl">✅</p>
          <p class="text-xl font-bold text-gray-700 text-center">오늘 근무가 완료되었습니다.</p>
          <p class="text-sm text-gray-400 text-center">수고하셨습니다!</p>
        </div>
      {:else}
        <div class="flex-1 px-4 sm:px-6 pb-8 space-y-4 max-w-md mx-auto w-full">
          <div class="text-center rounded-2xl bg-surface-card border border-surface-border p-4 shadow-sm">
            <p class="text-xs text-gray-500 mb-1">현재 시각 (KST)</p>
            <p class="text-2xl font-bold text-gray-900 tabular-nums">{currentTimeDisplay}</p>
          </div>

          {#if workStatus === 'none'}
            {#if !useManualIn}
              <button
                type="button"
                onclick={handleClockInNow}
                disabled={isSubmitting}
                class="w-full flex flex-col items-center justify-center gap-2 rounded-2xl font-extrabold text-white text-2xl shadow-sm py-8 bg-primary-600 hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {#if isSubmitting}
                  <span class="text-2xl animate-pulse">처리 중…</span>
                {:else}
                  <span class="text-4xl">🌅</span>
                  <span>지금 출근하기</span>
                {/if}
              </button>
              <button
                type="button"
                onclick={() => {
                  useManualIn = true;
                  resetManualFields();
                }}
                class="w-full text-sm text-gray-500 hover:text-gray-800 underline py-2"
              >
                다른 시간으로 출근하기
              </button>
            {:else}
              <div class="space-y-3 bg-surface-card rounded-2xl border border-surface-border p-4 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">출근 시간 입력</h3>
                <div>
                  <span class="mb-1 block text-sm font-medium text-gray-700">날짜</span>
                  <!-- 스크롤 대신 드롭다운 + 화살표로 날짜 선택 -->
                  <DatePicker bind:selectedDate />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1" for="in-h">시</label>
                    <select
                      id="in-h"
                      bind:value={selectedHour}
                      class="w-full border border-surface-border rounded-xl px-3 py-2"
                    >
                      {#each Array.from({ length: 24 }, (_, h) => h) as hour (hour)}
                        <option value={hour}>{String(hour).padStart(2, '0')}시</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1" for="in-m">분</label>
                    <select
                      id="in-m"
                      bind:value={selectedMinute}
                      class="w-full border border-surface-border rounded-xl px-3 py-2"
                    >
                      {#each Array.from({ length: 60 }, (_, m) => m) as minute (minute)}
                        <option value={minute}>{String(minute).padStart(2, '0')}분</option>
                      {/each}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={handleClockInManual}
                  disabled={isSubmitting}
                  class="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-xl font-semibold"
                >
                  {isSubmitting ? '처리 중…' : '이 시간으로 출근'}
                </button>
                <button
                  type="button"
                  onclick={() => (useManualIn = false)}
                  class="w-full py-3 border border-gray-200 rounded-xl text-gray-700"
                >
                  취소
                </button>
              </div>
            {/if}
          {:else if workStatus === 'clocked_in'}
            {#if !useManualOut}
              <button
                type="button"
                onclick={handleClockOutNow}
                disabled={isSubmitting}
                class="w-full flex flex-col items-center justify-center gap-2 rounded-2xl font-extrabold text-white text-2xl shadow-sm py-8 bg-accent-600 hover:bg-accent-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {#if isSubmitting}
                  <span class="text-2xl animate-pulse">처리 중…</span>
                {:else}
                  <span class="text-4xl">🌙</span>
                  <span>지금 퇴근하기</span>
                {/if}
              </button>
              <button
                type="button"
                onclick={() => {
                  useManualOut = true;
                  resetManualFields();
                }}
                class="w-full text-sm text-gray-500 hover:text-gray-800 underline py-2"
              >
                다른 시간으로 퇴근하기
              </button>
            {:else}
              <div class="space-y-3 bg-surface-card rounded-2xl border border-surface-border p-4 shadow-sm">
                <h3 class="text-lg font-semibold text-gray-900">퇴근 시간 입력</h3>
                <div>
                  <span class="mb-1 block text-sm font-medium text-gray-700">날짜</span>
                  <DatePicker bind:selectedDate />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1" for="out-h">시</label>
                    <select
                      id="out-h"
                      bind:value={selectedHour}
                      class="w-full border border-surface-border rounded-xl px-3 py-2"
                    >
                      {#each Array.from({ length: 24 }, (_, h) => h) as hour (hour)}
                        <option value={hour}>{String(hour).padStart(2, '0')}시</option>
                      {/each}
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1" for="out-m">분</label>
                    <select
                      id="out-m"
                      bind:value={selectedMinute}
                      class="w-full border border-surface-border rounded-xl px-3 py-2"
                    >
                      {#each Array.from({ length: 60 }, (_, m) => m) as minute (minute)}
                        <option value={minute}>{String(minute).padStart(2, '0')}분</option>
                      {/each}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onclick={handleClockOutManual}
                  disabled={isSubmitting}
                  class="w-full py-3 bg-accent-700 hover:bg-accent-700 disabled:bg-gray-400 text-white rounded-xl font-semibold"
                >
                  {isSubmitting ? '처리 중…' : '이 시간으로 퇴근'}
                </button>
                <button
                  type="button"
                  onclick={() => (useManualOut = false)}
                  class="w-full py-3 border border-gray-200 rounded-xl text-gray-700"
                >
                  취소
                </button>
              </div>
            {/if}
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}
