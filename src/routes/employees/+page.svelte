<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { hashPin } from '$lib/security/pin';
  import { MIN_HOURLY_WAGE } from '$lib/payroll';
  import { calculateMonthlyAllowance, calculatePay } from '$lib/utils/payroll-calc';
  import { parseUtc } from '$lib/utils/timezone';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  // [필수] Supabase 대시보드 > SQL Editor에서 아래 SQL을 먼저 실행하세요.
  // ALTER TABLE employees
  //   ADD COLUMN IF NOT EXISTS weekly_contracted_days SMALLINT NOT NULL DEFAULT 5;

  interface Employee {
    id: string;
    name: string;
    hourly_wage: number;
    // 서버 load 응답이 축약 필드를 반환할 수 있어 optional로 둡니다.
    store_id?: string | null;
    // 목록 화면에서는 PIN 원문을 쓰지 않으므로 optional로 둬 타입 충돌을 피합니다.
    pin_code?: string | null;
    weekly_contracted_days: number | null; // 기존 데이터가 null일 수도 있으므로 방어
  }

  interface PayrollWeeklyStatus {
    weekLabel: string;
    weekStart: string;
    qualifies: boolean;
    totalHours: number;
    actualDays: number;
    reason: string;
    allowance: number;
  }

  /** 급여 패널에서 쓰는 타임카드 최소 필드 */
  interface PayrollTimecardLite {
    employee_id: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
  }

  interface PayrollSummaryRow {
    employeeName: string;
    weeklyContractedDays: number;
    totalDays: number;
    totalHours: number;
    expectedHours: number;
    basePay: number;
    weeklyAllowance: number;
    totalPay: number;
    weeklyStatus: PayrollWeeklyStatus[];
  }

  let employees = $state<Employee[]>([]);
  let newName = $state('');
  // 신규 등록 시 기본 시급 = 당해 연도 법정 최저시급
  let newWage = $state(MIN_HOURLY_WAGE);
  let newPin = $state('');
  // 알바생이 일주일에 일하기로 계약한 일수(1~7)
  let weeklyContractedDays = $state(5);
  let isLoading = $state(false);
  let isUpdating = $state(false);
  let successMsg = $state('');
  let errorMsg = $state('');
  // 직원별 인라인 편집 상태를 보관합니다.
  let editDrafts = $state<Record<string, { hourly_wage: number; weekly_contracted_days: number; pin_code: string }>>({});

  async function fetchEmployees() {
    const storeId = data.storeId;
    if (!storeId) return;
    const { data: rows } = await supabase.from('employees').select('*').eq('store_id', storeId);
    if (rows) employees = rows;
  }

  onMount(() => {
    // data 참조를 onMount로 옮겨 state_referenced_locally 경고를 피합니다.
    employees = (data.employees as Employee[]) ?? [];
    pr_year = data.payrollYear;
    pr_month = data.payrollMonth;
    pr_summary = buildSummary(data.payrollTimecards ?? [], (data.employees as Employee[]) ?? []);
  });

  async function addEmployee() {
    if (!newName.trim()) { errorMsg = '직원 이름을 입력해 주세요.'; return; }
    if (!/^\d{4}$/.test(newPin)) { errorMsg = 'PIN은 숫자 4자리로 입력해 주세요.'; return; }
    const days = Number(weeklyContractedDays);
    if (!Number.isFinite(days) || days < 1 || days > 7) {
      errorMsg = '주당 근무일은 1일~7일 사이로 입력해 주세요.';
      return;
    }
    successMsg = ''; errorMsg = '';
    isLoading = true;

    const storeId = data.storeId;
    if (!storeId) {
      errorMsg = '매장 정보를 확인할 수 없습니다. 다시 로그인해 주세요.';
      isLoading = false;
      return;
    }

    // PIN은 평문 저장 금지: 해시 후 저장합니다.
    const hashedPin = await hashPin(newPin);
    const { error } = await supabase.from('employees').insert([{
      id: crypto.randomUUID(),
      name: newName.trim(),
      hourly_wage: newWage,
      store_id: storeId,
      pin_code: hashedPin,
      weekly_contracted_days: days,
    }]);

    if (error) errorMsg = '직원 등록 중 오류가 발생했습니다: ' + error.message;
    else { successMsg = `${newName} 직원 등록이 완료되었습니다.`; newName = ''; newPin = ''; fetchEmployees(); }
    isLoading = false;
  }

  async function deleteEmployee(emp: Employee) {
    if (!confirm(`"${emp.name}" 직원을 삭제하시겠습니까?\n관련 출퇴근 기록은 유지됩니다.`)) return;

    const { error } = await supabase.from('employees').delete().eq('id', emp.id);
    if (error) errorMsg = '직원 삭제 중 오류가 발생했습니다: ' + error.message;
    else { successMsg = `${emp.name} 직원 삭제가 완료되었습니다.`; fetchEmployees(); }
  }

  // 우측 패널 상태 (기존 변수명과 충돌 방지를 위해 pr_ 접두사 사용)
  let pr_year = $state<number>(0);
  let pr_month = $state<number>(0);
  let pr_loading = $state(false);

  // 서버에서 받아온 초기 타임카드로 직원별 집계 (클라이언트 계산)
  function buildSummary(timecards: PayrollTimecardLite[], employeeList: Employee[]): PayrollSummaryRow[] {
    return employeeList.map((emp) => {
      const empTc = timecards.filter((tc) => tc.employee_id === emp.id);
      // 출근·퇴근이 모두 있을 때만 분 단위 합산 (null 배제로 parseUtc 타입 만족)
      const completed = empTc.filter(
        (tc): tc is PayrollTimecardLite & { clock_in: string; clock_out: string } =>
          Boolean(tc.clock_in && tc.clock_out)
      );
      const totalDays = new Set(completed.map((tc) => tc.date)).size;

      let totalMinutes = 0;
      for (const tc of completed) {
        const diff = parseUtc(tc.clock_out).getTime() - parseUtc(tc.clock_in).getTime();
        if (diff > 0) totalMinutes += Math.floor(diff / 60000);
      }
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

      const basePay = completed.reduce((sum, tc) => {
        const pay = calculatePay(tc.clock_in, tc.clock_out, emp.hourly_wage);
        return sum + pay.basePay;
      }, 0);

      // calculateMonthlyAllowance는 DB에서 온 행을 그대로 받으며 clock_in은 비null로 가정합니다.
      const monthly = calculateMonthlyAllowance(
        empTc as Array<{ clock_in: string; clock_out: string | null }>,
        emp.hourly_wage,
        emp.weekly_contracted_days ?? 5,
        pr_year,
        pr_month
      );

      return {
        employeeName: emp.name,
        weeklyContractedDays: emp.weekly_contracted_days ?? 5,
        totalDays,
        totalHours,
        expectedHours: (emp.weekly_contracted_days ?? 5) * monthly.weeklyBreakdown.length * 8,
        basePay,
        weeklyAllowance: monthly.totalAllowance,
        totalPay: basePay + monthly.totalAllowance,
        weeklyStatus: monthly.weeklyBreakdown.map((w) => ({
          weekLabel: w.weekLabel,
          weekStart: w.weekStart,
          qualifies: w.qualifies,
          totalHours: w.totalHours,
          actualDays: w.actualDays,
          reason: w.reason,
          allowance: w.allowance
        }))
      };
    });
  }

  // 초기 렌더링: 서버 데이터로 1회 계산 (월 상태 변경으로 재계산되지 않도록 effect 미사용)
  let pr_summary = $state<PayrollSummaryRow[]>([]);

  // 월 변경 시 우측 패널 데이터만 API로 갱신
  async function pr_changeMonth(delta: number) {
    pr_month += delta;
    if (pr_month > 12) { pr_month = 1; pr_year++; }
    if (pr_month < 1) { pr_month = 12; pr_year--; }

    pr_loading = true;
    try {
      const res = await fetch(`/api/payroll-summary?year=${pr_year}&month=${pr_month}`);
      const result = await res.json();
      pr_summary = result.summaryByEmployee ?? [];
    } catch {
      // 실패 시 기존 데이터 유지
    } finally {
      pr_loading = false;
    }
  }

  function startEditEmployee(emp: Employee) {
    // 편집 시작 시 현재 값을 draft로 복사합니다.
    editDrafts = {
      ...editDrafts,
      [emp.id]: {
        hourly_wage: emp.hourly_wage,
        weekly_contracted_days: emp.weekly_contracted_days ?? 5,
        // 기존 해시값은 폼에 노출하지 않습니다.
        pin_code: ''
      }
    };
  }

  function cancelEditEmployee(empId: string) {
    // 취소 시 해당 직원 draft만 제거합니다.
    const { [empId]: _removed, ...rest } = editDrafts;
    editDrafts = rest;
  }

  async function saveEmployee(emp: Employee) {
    const draft = editDrafts[emp.id];
    if (!draft) return;

    const wage = Number(draft.hourly_wage);
    const days = Number(draft.weekly_contracted_days);
    const pin = String(draft.pin_code ?? '').trim();

    if (!Number.isFinite(wage) || wage <= 0) {
      errorMsg = '시급은 0보다 큰 숫자로 입력해 주세요.';
      return;
    }
    if (!Number.isFinite(days) || days < 1 || days > 7) {
      errorMsg = '주당 근무일은 1일에서 7일 사이여야 합니다.';
      return;
    }
    const storeId = data.storeId;
    if (!storeId) {
      errorMsg = '매장 정보를 확인할 수 없습니다. 다시 로그인해 주세요.';
      return;
    }

    successMsg = '';
    errorMsg = '';
    isUpdating = true;

    // UUID(id)는 유지하고 수정 가능한 필드만 UPDATE 합니다.
    // PIN은 입력된 경우에만 검증/해싱 후 업데이트하고, 비어있으면 기존 해시를 유지합니다.
    const updatePayload: { hourly_wage: number; weekly_contracted_days: number; pin_code?: string } = {
      hourly_wage: wage,
      weekly_contracted_days: days
    };
    let hashedPinForUpdate: string | null = null;
    if (pin) {
      if (!/^\d{4}$/.test(pin)) {
        errorMsg = 'PIN은 숫자 4자리로 입력해 주세요.';
        isUpdating = false;
        return;
      }
      hashedPinForUpdate = await hashPin(pin);
      updatePayload.pin_code = hashedPinForUpdate;
    }

    const { error } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('id', emp.id)
      .eq('store_id', storeId);

    if (error) {
      errorMsg = '직원 정보 저장 중 오류가 발생했습니다: ' + error.message;
      isUpdating = false;
      return;
    }

    employees = employees.map((row) =>
      row.id === emp.id
        ? {
            ...row,
            hourly_wage: wage,
            weekly_contracted_days: days,
            // PIN 미변경 시 기존 해시 유지, 변경 시 새 해시 반영
            pin_code: hashedPinForUpdate ?? row.pin_code
          }
        : row
    );
    successMsg = `${emp.name} 직원 정보가 수정되었습니다.`;
    cancelEditEmployee(emp.id);
    isUpdating = false;
  }
</script>

<div class="p-4 sm:p-6 bg-surface min-h-screen">
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start">
    <!-- 좌측: 기존 직원 관리 -->
    <div class="space-y-4 sm:space-y-5">
      <h1 class="heading-accent text-2xl sm:text-3xl font-bold mb-2 text-ink-900">👥 직원 관리</h1>

      <div class="bg-surface-card rounded-xl shadow-sm border border-surface-border p-4 sm:p-5 max-w-2xl">
      <h2 class="text-lg sm:text-xl font-bold mb-4 text-ink-900">직원 등록</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div>
          <label for="emp-name" class="block text-sm text-gray-600 mb-1">이름</label>
          <input id="emp-name" type="text" bind:value={newName} placeholder="예: 김알바" class="w-full p-3 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none">
        </div>
        <div>
          <label for="emp-wage" class="block text-sm text-gray-600 mb-1">시급 (원)</label>
          <input id="emp-wage" type="number" bind:value={newWage} class="w-full p-3 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none">
          <p class="text-xs text-gray-400 mt-1">
            {new Date().getFullYear()}년 최저시급은 고용노동부 홈페이지에서 확인하세요.
          </p>
        </div>
        <div>
          <label for="emp-pin" class="block text-sm text-gray-600 mb-1">출퇴근 PIN (숫자 4자리)</label>
          <input id="emp-pin" type="password" inputmode="numeric" maxlength="4" bind:value={newPin} placeholder="••••"
            class="w-full p-3 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-center tracking-widest text-lg">
          <p class="text-xs text-gray-400 mt-1">
            직원 본인만 알 수 있게 전달해 주세요. QR 출퇴근 인증에 사용됩니다.
          </p>
        </div>
        <div>
          <label for="emp-weekly-contract" class="block text-sm text-gray-600 mb-1">주당 계약 근무일</label>
          <input
            id="emp-weekly-contract"
            type="number"
            min="1"
            max="7"
            step="1"
            bind:value={weeklyContractedDays}
            class="w-full p-3 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          >
          <p class="mt-1 text-xs text-gray-500">
            계약 기준 근무일을 입력해 주세요. (1~7일)
          </p>
        </div>
      </div>
      <button type="button" onclick={addEmployee} disabled={isLoading} class="bg-primary-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-primary-700 disabled:opacity-50">
        {isLoading ? '등록 중...' : '직원 등록'}
      </button>

      {#if successMsg}
        <p class="mt-3 text-sm text-green-600 font-medium">{successMsg}</p>
      {/if}
      {#if errorMsg}
        <p class="mt-3 text-sm text-red-500 font-medium">{errorMsg}</p>
      {/if}
    </div>

      <div class="bg-surface-card rounded-xl shadow-sm border border-surface-border p-4 sm:p-5 max-w-2xl">
      <h2 class="text-lg sm:text-xl font-bold mb-3 text-ink-900">직원 목록</h2>
      <div class="overflow-x-auto">
      <table class="w-full min-w-[680px] text-left">
        <thead class="bg-gray-50 text-gray-600 text-sm">
          <tr>
            <th class="p-3 rounded-tl-lg">이름</th>
            <th class="p-3">시급</th>
            <th class="p-3">주당 근무일</th>
            <th class="p-3 text-center">PIN</th>
            <th class="p-3 rounded-tr-lg text-right">관리</th>
          </tr>
        </thead>
        <tbody>
          {#each employees as emp}
            <tr class="border-t border-gray-50 hover:bg-gray-50">
              <td class="p-3 font-medium text-gray-800">{emp.name}</td>
              <td class="p-3 text-gray-600">
                {#if editDrafts[emp.id]}
                  <input
                    type="number"
                    min="1"
                    bind:value={editDrafts[emp.id].hourly_wage}
                    class="w-28 p-2 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                {:else}
                  {emp.hourly_wage.toLocaleString()}원
                {/if}
              </td>
              <td class="p-3 text-gray-700">
                {#if editDrafts[emp.id]}
                  <input
                    type="number"
                    min="1"
                    max="7"
                    step="1"
                    bind:value={editDrafts[emp.id].weekly_contracted_days}
                    class="w-20 p-2 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                {:else}
                  주 {(emp.weekly_contracted_days ?? 5)}일
                {/if}
              </td>
              <td class="p-3 text-center text-gray-400 tracking-widest">
                {#if editDrafts[emp.id]}
                  <input
                    type="password"
                    inputmode="numeric"
                    maxlength="4"
                    placeholder="변경 시에만 입력"
                    bind:value={editDrafts[emp.id].pin_code}
                    class="w-20 p-2 border border-surface-border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-center tracking-widest"
                  >
                {:else}
                  ••••
                {/if}
              </td>
              <td class="p-3 text-right">
                <div class="inline-flex items-center gap-1">
                  {#if editDrafts[emp.id]}
                    <button
                      type="button"
                      onclick={() => saveEmployee(emp)}
                      disabled={isUpdating}
                      class="text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {isUpdating ? '저장 중...' : '저장'}
                    </button>
                    <button
                      type="button"
                      onclick={() => cancelEditEmployee(emp.id)}
                      disabled={isUpdating}
                      class="text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      취소
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => startEditEmployee(emp)}
                      class="text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-100 px-2 py-1 rounded transition-colors"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onclick={() => deleteEmployee(emp)}
                      class="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    >
                      삭제
                    </button>
                  {/if}
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="text-center text-gray-400 py-10">
                아직 등록된 직원이 없습니다. 위에서 직원을 추가해 주세요.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      </div>
      <p class="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        시급을 변경하면 기존 출근 기록의 급여 계산 기준도 함께 달라질 수 있습니다. 급여 확정 전 다시 확인해 주세요.
      </p>
      </div>
    </div>

    <!-- 우측: 급여 요약 패널 -->
    <div class="space-y-4 xl:sticky xl:top-4">
      <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-ink-900">📊 급여 요약</h2>
        <div class="flex items-center gap-1">
          <button
            onclick={() => pr_changeMonth(-1)}
            disabled={pr_loading}
            class="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
            aria-label="이전 달"
          >
            ‹
          </button>
          <span class="text-sm font-medium text-gray-700 min-w-[72px] text-center">
            {pr_year}년 {pr_month}월
          </span>
          <button
            onclick={() => pr_changeMonth(1)}
            disabled={pr_loading}
            class="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      {#if pr_loading}
        <div class="text-sm text-gray-400 text-center py-4">불러오는 중...</div>
      {:else}
        <div class="rounded-2xl border border-surface-border bg-surface-card shadow-sm p-4 sm:p-5 overflow-x-auto">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">전체 출근 현황</h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-gray-400 border-b border-gray-100">
                <th class="pb-2 text-left font-medium">직원명</th>
                <th class="pb-2 text-left font-medium">출근일수</th>
                <th class="pb-2 text-left font-medium">근무시간</th>
                <th class="pb-2 text-left font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {#each pr_summary as s}
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 text-gray-800">{s.employeeName}</td>
                  <td class="py-2 text-gray-600">{s.totalDays}일</td>
                  <td class="py-2 text-gray-600">
                    {s.totalHours} / {s.expectedHours}시간
                  </td>
                  <td class="py-2">
                    {#if s.totalHours >= s.expectedHours}
                      <span class="text-green-600 text-xs font-medium">정상 ✅</span>
                    {:else}
                      <span class="text-orange-500 text-xs font-medium">확인 필요 ⚠️</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="rounded-2xl border border-surface-border bg-surface-card shadow-sm p-4 sm:p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">주휴수당 발생 예보</h3>
          {#each pr_summary as s}
            <div class="mb-3 last:mb-0">
              <p class="text-xs font-medium text-gray-700 mb-1.5">{s.employeeName}</p>
              <div class="flex flex-wrap gap-1.5">
                {#each s.weeklyStatus as w}
                  <span
                    class="text-xs px-2 py-0.5 rounded-full border
                    {w.qualifies
                      ? 'border-green-200 text-green-700 bg-green-50'
                      : 'border-red-100 text-red-400 bg-red-50'}"
                  >
                    {w.weekLabel} {w.qualifies ? '✅' : '❌'} {w.reason ?? ''}
                  </span>
                {/each}
              </div>
              <p class="text-xs text-gray-400 mt-1">
                소계: {s.weeklyAllowance === 0 ? '해당없음' : s.weeklyAllowance.toLocaleString('ko-KR') + '원'}
              </p>
            </div>
          {/each}
        </div>

        <div class="rounded-2xl border border-surface-border bg-surface-card shadow-sm p-4 sm:p-5 overflow-x-auto">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">월간 급여 합계</h3>
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-gray-400 border-b border-gray-100">
                <th class="pb-2 text-left font-medium">직원명</th>
                <th class="pb-2 text-right font-medium">기본급</th>
                <th class="pb-2 text-right font-medium">주휴수당</th>
                <th class="pb-2 text-right font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {#each pr_summary as s}
                <tr class="border-b border-gray-50 last:border-0">
                  <td class="py-2 text-gray-800">{s.employeeName}</td>
                  <td class="py-2 text-right text-gray-600">
                    {s.basePay.toLocaleString('ko-KR')}원
                  </td>
                  <td class="py-2 text-right text-gray-600">
                    {s.weeklyAllowance === 0 ? '해당없음' : s.weeklyAllowance.toLocaleString('ko-KR') + '원'}
                  </td>
                  <td class="py-2 text-right font-semibold text-gray-900">
                    {s.totalPay.toLocaleString('ko-KR')}원
                  </td>
                </tr>
              {/each}
              <tr class="border-t border-gray-200 bg-gray-50">
                <td class="py-2 text-xs font-medium text-gray-500">합계</td>
                <td class="py-2 text-right text-xs font-medium text-gray-700">
                  {pr_summary.reduce((a, s) => a + s.basePay, 0).toLocaleString('ko-KR')}원
                </td>
                <td class="py-2 text-right text-xs font-medium text-gray-700">
                  {pr_summary.reduce((a, s) => a + s.weeklyAllowance, 0).toLocaleString('ko-KR')}원
                </td>
                <td class="py-2 text-right text-xs font-semibold text-primary-700">
                  {pr_summary.reduce((a, s) => a + s.totalPay, 0).toLocaleString('ko-KR')}원
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <a
          href="/payroll?year={pr_year}&month={pr_month}"
          class="flex items-center justify-center gap-2 w-full py-3
                 border border-primary-600 text-primary-600 font-semibold
                 rounded-xl hover:bg-primary-100 transition-colors text-sm"
        >
          📄 급여명세서 발급하기 →
        </a>
      {/if}
    </div>
  </div>
</div>