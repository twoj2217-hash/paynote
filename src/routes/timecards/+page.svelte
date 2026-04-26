<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { calculateShiftPay, formatHours } from '$lib/payroll';
  import {
    DATETIME_LOCAL_MIN,
    getKSTTodayYmd,
    isoUtcToDatetimeLocalKstString,
    kstMonthRangeUTC,
    maxDatetimeLocalBrowserNow,
    parseUtc,
    toKST,
    toKSTDateString,
    validateClockDateTime,
  } from '$lib/utils/timezone';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const maxDatetimeLocal = $derived(maxDatetimeLocalBrowserNow());

  interface Timecard {
    id: string;
    employee_id: string;
    date: string;
    clock_in: string;
    clock_out: string | null;
    employee?: { name: string; hourly_wage: number };
  }

  let timecards = $state<Timecard[]>([]);
  let isLoading = $state(true);
  let editingId = $state<string | null>(null);
  let editClockIn = $state('');
  let editClockOut = $state('');
  let saveMsg = $state('');
  /** 서버 action 실패 시 화면 상단 빨간 토스트 */
  let formToastError = $state('');
  /** 관리자 수동 정정 시 필수 입력 사유 */
  let editReason = $state('');
  /** 24시간 초과 저장 전 인라인 경고 UI 상태 */
  let over24hWarning = $state<{
    show: boolean;
    clockInIso: string;
    clockOutIso: string;
  }>({ show: false, clockInIso: '', clockOutIso: '' });

  // KST(Asia/Seoul) 기준 조회 연·월
  const kstYm = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7);
  const [initY, initM] = kstYm.split('-').map(Number);
  let pickYear = $state(initY);
  let pickMonth = $state(initM);

  async function fetchTimecards() {
    const storeId = data.storeId;
    if (!storeId) {
      isLoading = false;
      return;
    }

    isLoading = true;
    editingId = null;
    // timestamptz(clock_in) 기준 KST 한 달 구간 → UTC로 필터 (date 컬럼과 불일치 방지)
    const { start, end } = kstMonthRangeUTC(pickYear, pickMonth);

    const { data: empData } = await supabase
      .from('employees')
      .select('id')
      .eq('store_id', storeId);
    const employeeIds = empData?.map(e => e.id) ?? [];

    const { data: rows, error } = await supabase
      .from('timecards')
      .select('*, employee:employees!inner(name, hourly_wage)')
      .in('employee_id', employeeIds)
      .gte('clock_in', start)
      .lt('clock_in', end)
      .order('date', { ascending: false })
      .order('clock_in', { ascending: false });

    if (!error && rows) timecards = rows;
    isLoading = false;
  }

  onMount(() => fetchTimecards());

  function getWorkHours(card: Timecard): string {
    if (!card.clock_out) return '근무 중';
    const hours = (parseUtc(card.clock_out).getTime() - parseUtc(card.clock_in).getTime()) / 3_600_000;
    return formatHours(hours);
  }

  function getDayPay(card: Timecard): string {
    if (!card.clock_out || !card.employee) return '-';
    const result = calculateShiftPay({
      clockIn: parseUtc(card.clock_in),
      clockOut: parseUtc(card.clock_out),
      hourlyWage: card.employee.hourly_wage,
    });
    return result.totalPay.toLocaleString() + '원';
  }

  function getWeeklyHours(employeeId: string): number {
    return timecards
      .filter(c => c.employee_id === employeeId && c.clock_out)
      .reduce((sum, c) => {
        const h = (parseUtc(c.clock_out!).getTime() - parseUtc(c.clock_in).getTime()) / 3_600_000;
        return sum + h;
      }, 0);
  }

  type AttendanceStatus = 'working' | 'missed' | 'done';

  /** KST 기준으로 근태 상태를 판정한다. */
  function getAttendanceStatus(card: Timecard): AttendanceStatus {
    if (card.clock_out) return 'done';
    const todayKst = getKSTTodayYmd();
    const workedHours = (Date.now() - parseUtc(card.clock_in).getTime()) / 3_600_000;
    // 날짜 이월 또는 16시간 초과면 실시간 근무가 아니라 퇴근 누락으로 판단한다.
    if (card.date < todayKst || workedHours >= 16) return 'missed';
    return 'working';
  }

  /** 상단 요약 카드 계산 */
  const summary = $derived.by(() => {
    return timecards.reduce(
      (acc, card) => {
        const status = getAttendanceStatus(card);
        if (status === 'working') acc.working += 1;
        if (status === 'missed') acc.missed += 1;
        if (status === 'done') acc.done += 1;
        return acc;
      },
      { working: 0, missed: 0, done: 0 }
    );
  });

  /** DB timestamptz(UTC) → datetime-local 표시값 (KST 시각) */
  function toKstLocalInput(iso: string): string {
    return isoUtcToDatetimeLocalKstString(iso);
  }

  function startEdit(card: Timecard) {
    editingId = card.id;
    editClockIn = toKstLocalInput(card.clock_in);
    editClockOut = card.clock_out ? toKstLocalInput(card.clock_out) : '';
    saveMsg = '';
    formToastError = '';
    editReason = '';
  }

  function cancelEdit() {
    editingId = null;
    saveMsg = '';
    formToastError = '';
    editReason = '';
    over24hWarning = { show: false, clockInIso: '', clockOutIso: '' };
  }

  /** datetime-local 입력값(브라우저 로컬 시간대) → DB용 UTC ISO */
  function toUTC(local: string) {
    return new Date(local).toISOString();
  }

  /** datetime-local 입력값을 KST 날짜(YYYY-MM-DD)로 변환 */
  function toKstDateStringFromLocal(local: string): string {
    const clockInDate = new Date(local);
    const kstOffsetMinutes = 9 * 60;
    const kstDate = new Date(clockInDate.getTime() + kstOffsetMinutes * 60 * 1000);
    return kstDate.toISOString().slice(0, 10);
  }

  /**
   * 타임카드 수정 폼 — 제출 직전 클라이언트 검증 후 서버 action으로 저장
   * (실패 시 enhance 콜백에서 formToastError 표시)
   */
  const timecardFormEnhance: SubmitFunction = ({ formData, cancel }) => {
    if (!editClockIn) {
      saveMsg = '출근 시간을 입력해 주세요.';
      cancel();
      return;
    }
    if (!editClockOut) {
      saveMsg = '퇴근 시간을 입력해 주세요.';
      cancel();
      return;
    }
    if (editClockOut && editClockOut <= editClockIn) {
      saveMsg = '퇴근 시간은 출근 시간보다 늦어야 합니다.';
      cancel();
      return;
    }
    // 감사 이력을 위해 수정 사유는 필수 입력으로 강제한다.
    if (!editReason.trim()) {
      saveMsg = '수정 사유를 입력해 주세요.';
      cancel();
      return;
    }

    const clockInInstant = new Date(editClockIn + ':00+09:00');
    const errIn = validateClockDateTime(clockInInstant);
    if (errIn) {
      saveMsg = errIn;
      cancel();
      return;
    }
    if (editClockOut) {
      const clockOutInstant = new Date(editClockOut + ':00+09:00');
      const errOut = validateClockDateTime(clockOutInstant);
      if (errOut) {
        saveMsg = errOut;
        cancel();
        return;
      }
    }

    // 수정 저장 시 date 컬럼은 clock_in 기준 KST 날짜로 항상 재계산해 전달한다.
    const clockInIso = toUTC(editClockIn);
    const clockOutIso = toUTC(editClockOut);
    const diffMinutes = (new Date(clockOutIso).getTime() - new Date(clockInIso).getTime()) / 60000;
    if (diffMinutes > 1440) {
      // confirm() 대신 인라인 경고를 띄우고, 사용자가 명시적으로 저장을 이어가게 한다.
      over24hWarning = { show: true, clockInIso, clockOutIso };
      cancel();
      return;
    }

    formData.set('clock_in', clockInIso);
    formData.set('clock_out', clockOutIso);
    formData.set('date', toKstDateStringFromLocal(editClockIn));
    formData.set('reason', editReason.trim());

    return async ({ result, update }) => {
      if (result.type === 'failure') {
        const d = result.data;
        formToastError =
          d && typeof d === 'object' && 'error' in d && typeof (d as { error: unknown }).error === 'string'
            ? (d as { error: string }).error
            : '저장에 실패했습니다.';
      } else {
        formToastError = '';
        editingId = null;
        saveMsg = '';
        editReason = '';
        fetchTimecards();
      }
      await update();
    };
  };

  async function forceSaveOver24h() {
    if (!editingId || !over24hWarning.show) return;
    if (!editReason.trim()) {
      saveMsg = '수정 사유를 입력해 주세요.';
      return;
    }
    // 24시간 초과 저장도 일반 저장과 동일하게 감사 이력을 남긴다.
    const { data: currentRow, error: currentRowError } = await supabase
      .from('timecards')
      .select('id, employee_id, date, clock_in, clock_out, employee:employees!inner(store_id)')
      .eq('id', editingId)
      .maybeSingle();
    if (currentRowError || !currentRow) {
      formToastError = '기존 타임카드를 불러오지 못했습니다.';
      return;
    }
    const { error } = await supabase
      .from('timecards')
      .update({
        clock_in: over24hWarning.clockInIso,
        clock_out: over24hWarning.clockOutIso,
        date: toKstDateStringFromLocal(editClockIn),
      })
      .eq('id', editingId);

    if (error) {
      formToastError = '저장 중 오류가 발생했습니다: ' + error.message;
      return;
    }
    const { data: userInfo } = await supabase.auth.getUser();
    const employeeData = Array.isArray(currentRow.employee) ? currentRow.employee[0] : currentRow.employee;
    if (!employeeData?.store_id || !userInfo.user?.id) {
      formToastError = '정정 이력을 저장할 사용자/매장 정보를 확인하지 못했습니다.';
      return;
    }
    const { error: auditError } = await supabase.from('timecard_adjustments').insert({
      timecard_id: editingId,
      employee_id: currentRow.employee_id,
      store_id: employeeData.store_id,
      before_date: currentRow.date,
      before_clock_in: currentRow.clock_in,
      before_clock_out: currentRow.clock_out,
      after_date: toKstDateStringFromLocal(editClockIn),
      after_clock_in: over24hWarning.clockInIso,
      after_clock_out: over24hWarning.clockOutIso,
      reason: editReason.trim(),
      updated_by: userInfo.user.id,
    });
    if (auditError) {
      formToastError = '정정 이력 저장 중 오류가 발생했습니다: ' + auditError.message;
      return;
    }

    over24hWarning = { show: false, clockInIso: '', clockOutIso: '' };
    formToastError = '';
    editingId = null;
    saveMsg = '';
    editReason = '';
    await fetchTimecards();
  }

  async function deleteCard(card: Timecard) {
    const label = card.employee?.name ?? '해당';
    if (!confirm(`${label}님의 ${toKSTDateString(card.clock_in)} 출퇴근 기록을 삭제하시겠습니까?`)) return;
    await supabase.from('timecards').delete().eq('id', card.id);
    fetchTimecards();
  }

  // 상단 QR 패널 열림/닫힘 상태 (Phase 1: 링크 이동 방식)
  let qrPanelOpen = $state(true);
  /** 조회 필터: 전체/퇴근누락만 */
  let statusFilter = $state<'all' | 'missed'>('all');
  const filteredTimecards = $derived.by(() => {
    if (statusFilter === 'all') return timecards;
    return timecards.filter((card) => getAttendanceStatus(card) === 'missed');
  });
</script>

<div class="p-4 sm:p-6 bg-surface min-h-screen">
  <div class="rounded-2xl border border-surface-border bg-surface-card shadow-sm p-4 sm:p-5 mb-5">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold text-gray-900">📷 출퇴근 기록</h2>
      <button
        onclick={() => qrPanelOpen = !qrPanelOpen}
        class="text-xs text-gray-400 hover:text-gray-600"
      >
        {qrPanelOpen ? '접기' : '펼치기'}
      </button>
    </div>
    {#if qrPanelOpen}
      <!-- /checkin 페이지로 이동하는 버튼 (직접 기능 복사 금지) -->
      <a
        href="/checkin"
        class="flex items-center justify-center gap-2 w-full py-3
               bg-primary-600 hover:bg-primary-700 text-white font-semibold
               rounded-xl transition-colors text-sm"
      >
        📷 QR 출퇴근 기록하기
      </a>
      <p class="text-xs text-gray-400 mt-2 text-center">
        QR 코드로 출퇴근을 기록하면 아래 목록에 자동 반영됩니다.
      </p>
    {/if}
  </div>

  <h1 class="heading-accent text-2xl sm:text-3xl font-bold mb-5 text-ink-900">타임카드</h1>

  {#if formToastError}
    <div
      class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
      role="alert"
    >
      <span>{formToastError}</span>
      <button
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-red-700 underline hover:bg-red-100"
        onclick={() => (formToastError = '')}
      >
        닫기
      </button>
    </div>
  {/if}

  <!-- 월 필터: 드롭다운 + 이전/다음 달 -->
  <div class="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-surface-card p-4 shadow-sm">
    <div>
      <span class="mb-1 block text-sm text-gray-600">조회 월</span>
      <MonthPicker
        bind:selectedYear={pickYear}
        bind:selectedMonth={pickMonth}
        onchange={() => fetchTimecards()}
      />
    </div>
    <button
      type="button"
      onclick={fetchTimecards}
      class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700"
    >
      조회
    </button>
  </div>

  <!-- 상태 요약 + 퇴근누락 필터 -->
  <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
    <div class="rounded-xl border border-surface-border bg-surface-card p-3 shadow-sm">
      <p class="text-xs text-gray-500">근무중</p>
      <p class="text-lg font-bold text-primary-700">{summary.working}명</p>
    </div>
    <div class="rounded-xl border border-surface-border bg-surface-card p-3 shadow-sm">
      <p class="text-xs text-gray-500">퇴근누락</p>
      <p class="text-lg font-bold text-red-600">{summary.missed}건</p>
    </div>
    <div class="rounded-xl border border-surface-border bg-surface-card p-3 shadow-sm">
      <p class="text-xs text-gray-500">완료</p>
      <p class="text-lg font-bold text-gray-800">{summary.done}건</p>
    </div>
    <div class="rounded-xl border border-surface-border bg-surface-card p-3 shadow-sm">
      <p class="mb-2 text-xs text-gray-500">필터</p>
      <div class="flex gap-2">
        <button
          type="button"
          class={`rounded px-2 py-1 text-xs ${statusFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          onclick={() => (statusFilter = 'all')}
        >
          전체
        </button>
        <button
          type="button"
          class={`rounded px-2 py-1 text-xs ${statusFilter === 'missed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          onclick={() => (statusFilter = 'missed')}
        >
          퇴근누락만
        </button>
      </div>
    </div>
  </div>

  <!-- 타임카드 테이블 -->
  <div class="bg-surface-card rounded-xl shadow-sm border border-surface-border p-4 sm:p-5">
    {#if isLoading}
      <p class="text-center text-gray-400 py-10">불러오는 중...</p>
    {:else}
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <table class="w-full text-left text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="p-3 rounded-tl-lg">날짜</th>
              <th class="p-3">직원명</th>
              <th class="p-3">출근</th>
              <th class="p-3">퇴근</th>
              <th class="p-3">근무시간</th>
              <th class="p-3">일급</th>
              <th class="p-3 rounded-tr-lg text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredTimecards as card (card.id)}
              {@const status = getAttendanceStatus(card)}
              {#if editingId === card.id}
                <!-- 인라인 편집: 서버 action + use:enhance (유효한 테이블 마크업을 위해 단일 셀 + 폼) -->
                <tr class="border-t border-blue-100 bg-blue-50">
                  <td colspan="7" class="p-3">
                    <form
                      method="POST"
                      action="?/updateTimecard"
                      class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
                      use:enhance={timecardFormEnhance}
                    >
                      <input type="hidden" name="timecardId" value={card.id} />
                      <input type="hidden" name="date" value={card.date} />
                      <div class="text-sm font-medium text-gray-700 sm:w-28">
                        {toKSTDateString(card.clock_in)}
                      </div>
                      <div class="text-sm text-gray-700 sm:min-w-[5rem]">
                        {card.employee?.name ?? '-'}
                      </div>
                      <div class="flex flex-col gap-0.5">
                        <span class="text-xs text-gray-500">출근</span>
                        <input
                          type="datetime-local"
                          bind:value={editClockIn}
                          min={DATETIME_LOCAL_MIN}
                          max={maxDatetimeLocal}
                          class="w-full sm:w-44 rounded border p-1.5 text-xs outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div class="flex flex-col gap-0.5">
                        <span class="text-xs text-gray-500">퇴근</span>
                        <input
                          type="datetime-local"
                          bind:value={editClockOut}
                          min={DATETIME_LOCAL_MIN}
                          max={maxDatetimeLocal}
                          class="w-full sm:w-44 rounded border p-1.5 text-xs outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div class="flex min-w-[12rem] flex-col gap-0.5">
                        <span class="text-xs text-gray-500">수정 사유(필수)</span>
                        <input
                          type="text"
                          bind:value={editReason}
                          placeholder="예: 퇴근 버튼 누락"
                          class="w-full rounded border p-1.5 text-xs outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div class="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
                        {#if saveMsg}
                          <span class="text-xs text-red-500">{saveMsg}</span>
                        {/if}
                        <button
                          type="submit"
                          class="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onclick={cancelEdit}
                          class="rounded px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-200"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                    {#if over24hWarning.show && editingId === card.id}
                      <div class="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                        <p>24시간을 초과하는 근무 기록입니다. 계속 저장하시겠습니까?</p>
                        <div class="mt-2 flex gap-2">
                          <button
                            type="button"
                            class="rounded bg-orange-500 px-2.5 py-1 text-white hover:bg-orange-600"
                            onclick={forceSaveOver24h}
                          >
                            계속 저장
                          </button>
                          <button
                            type="button"
                            class="rounded border border-orange-300 bg-white px-2.5 py-1 text-orange-700 hover:bg-orange-100"
                            onclick={() => (over24hWarning = { show: false, clockInIso: '', clockOutIso: '' })}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    {/if}
                  </td>
                </tr>
              {:else}
                <!-- 일반 행 -->
                <tr class="border-t border-gray-50 hover:bg-gray-50">
                  <td class="p-3 font-medium">{toKSTDateString(card.clock_in)}</td>
                  <td class="p-3">
                    {card.employee?.name ?? '(알 수 없음)'}
                    {#if getWeeklyHours(card.employee_id) >= 15}
                      <span class="ml-1 px-1 py-0.5 bg-orange-100 text-orange-600 text-xs rounded">주휴↑</span>
                    {/if}
                  </td>
                  <td class="p-3">{toKST(card.clock_in, 'time')}</td>
                  <td class="p-3">
                    {#if status === 'done'}
                      {toKST(card.clock_out, 'time')}
                    {:else if status === 'missed'}
                      <span class="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">퇴근누락</span>
                    {:else}
                      <span class="rounded bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">근무중</span>
                    {/if}
                  </td>
                  <td class="p-3 text-gray-700">{getWorkHours(card)}</td>
                  <td class="p-3 font-medium text-gray-800">{getDayPay(card)}</td>
                  <td class="p-3 text-right space-x-1">
                    <button type="button" onclick={() => startEdit(card)} class="text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                      수정
                    </button>
                    <button type="button" onclick={() => deleteCard(card)} class="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                      삭제
                    </button>
                  </td>
                </tr>
              {/if}
            {:else}
              <tr>
                <td colspan="7" class="text-center text-gray-400 py-10">
                  {statusFilter === 'missed' ? '퇴근누락 기록이 없습니다.' : '해당 기간의 출퇴근 기록이 없습니다.'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
