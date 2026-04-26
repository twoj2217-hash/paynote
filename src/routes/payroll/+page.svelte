<script lang="ts">
  import { goto } from '$app/navigation';
  import html2canvas from 'html2canvas';
  import { jsPDF } from 'jspdf';
  import { ChevronDown } from 'lucide-svelte';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import { formatWorkHours } from '$lib/utils/payroll-calc';
  import { toKST } from '$lib/utils/timezone';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Row = PageData['summaries'][number];
  type ShiftLine = PageData['timeline'][number]['shifts'][number];

  let isGenerating = $state(false);
  let loadingRowId = $state<string | null>(null);
  // 직원 카드별 주휴수당 상세 펼침 상태를 관리한다.
  let allowanceOpen = $state<Record<string, boolean>>({});
  // 근태 체크 패널 접기/펼치기 상태(기본 펼침)
  let showAttendancePanel = $state(true);
  // 계약 근무일 기반 동적 월 소정근로시간(기준: 1일 8시간)
  const monthlyExpectedHoursByEmployee = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const s of data.attendanceSummary.summaryByEmployee) {
      const weeksInMonth = s.weeklyStatus.length;
      // 직원별 계약 근무일(주) × 월 주차 수 × 8시간으로 기준시간을 계산한다.
      map[s.employeeId] = s.weeklyContractedDays * weeksInMonth * 8;
    }
    return map;
  });

  /** 진행 중 근무가 있을 때만 1초마다 예상 급여 갱신 */
  let tick = $state(0);
  $effect(() => {
    const need = data.summaries.some((r) => r.has_in_progress_shift);
    if (!need) return;
    const id = setInterval(() => (tick += 1), 1000);
    return () => clearInterval(id);
  });

  const hasLiveShift = $derived(data.summaries.some((r) => r.has_in_progress_shift));

  /** YYYY-MM-DD → 한국어 날짜 라벨 (Asia/Seoul) */
  function formatDayLabelKst(ymd: string): string {
    return new Date(`${ymd}T12:00:00+09:00`).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      weekday: 'short',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }


  function liveTotalHours(row: Row): number {
    void tick;
    if (!row.has_in_progress_shift) return row.total_hours;
    const deltaH = (Date.now() - data.loadTimestampMs) / (1000 * 60 * 60);
    return Math.round((row.total_hours + deltaH) * 100) / 100;
  }

  /**
   * 서버에서 분 단위로 합산한 기본급 + 집계 이후 경과분(시급×경과시간)
   * (시간×시급 한 번에 곱하면 일별 반올림과 어긋날 수 있음)
   */
  function liveBasePay(row: Row): number {
    void tick;
    if (!row.has_in_progress_shift) return row.base_pay;
    const deltaH = (Date.now() - data.loadTimestampMs) / (1000 * 60 * 60);
    return row.base_pay + Math.round(row.hourly_wage * deltaH);
  }

  function liveTotalPay(row: Row): number {
    return liveBasePay(row) + row.weeklyAllowance;
  }

  const grandTotal = $derived.by(() => {
    void tick;
    return data.summaries.reduce((s, r) => s + liveTotalPay(r), 0);
  });

  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function safeFileNameSegment(name: string): string {
    const t = name.replace(/[/\\:*?"<>|]/g, '_').trim();
    return t || '직원';
  }

  /** 집계 기준 시각 (KST) */
  const loadedAtKst = $derived(
    toKST(new Date(data.loadTimestampMs).toISOString(), 'datetime')
  );

  async function generatePDF(employee: Row) {
    isGenerating = true;
    loadingRowId = employee.employee_id;

    const storeLabel = escapeHtml(data.storeName ?? '매장');
    const nameLabel = escapeHtml(employee.name);
    const yearMonth = `${data.periodYear}년 ${data.periodMonth}월`;
    const hoursStr = liveTotalHours(employee).toFixed(2);
    const baseStr = liveBasePay(employee).toLocaleString('ko-KR');
    const holidayStr = employee.weeklyAllowance.toLocaleString('ko-KR');
    const totalStr = liveTotalPay(employee).toLocaleString('ko-KR');
    // PDF 주차별 주휴수당 행(발생/미발생 사유)을 문자열로 미리 생성한다.
    const weeklyRowsHtml = employee.weeklyAllowanceBreakdown
      .map((w) => {
        const right = w.qualifies
          ? `${w.allowance.toLocaleString('ko-KR')}원`
          : escapeHtml(w.reason || '조건 미충족');
        return `
          <tr>
            <td style="border: 1px solid #d1d5db; padding: 10px;">
              ${escapeHtml(w.weekLabel)} (${escapeHtml(w.weekStart)} 시작)
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">
              ${w.totalHours.toFixed(2)}시간
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">
              ${w.actualDays}일
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px; text-align: right;">
              ${right}
            </td>
          </tr>
        `;
      })
      .join('');

    try {
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '210mm';
      container.style.padding = '20mm';
      container.style.backgroundColor = 'white';
      // PDF는 폰트 일관성을 위해 Noto Sans KR 계열로 고정합니다.
      container.style.fontFamily = "'Noto Sans KR', 'Malgun Gothic', sans-serif";

      container.innerHTML = `
      <div style="font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">
            ${storeLabel}
          </h1>
          <h2 style="font-size: 20px; font-weight: 600;">페이노트 급여명세서</h2>
          <p style="color: #666; margin-top: 10px;">${escapeHtml(yearMonth)}</p>
        </div>

        <div style="border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 15px 0; margin-bottom: 25px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">성명:</span>
            <span>${nameLabel}</span>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">지급 항목</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 12px;">
                기본급 (${hoursStr}시간)
              </td>
              <td style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">
                ${baseStr}원
              </td>
            </tr>
            ${
              employee.weeklyAllowance > 0
                ? `
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 12px;">주휴수당</td>
              <td style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">
                ${holidayStr}원
              </td>
            </tr>
            `
                : ''
            }
            <tr style="background-color: #dbeafe; font-weight: bold;">
              <td style="border: 1px solid #d1d5db; padding: 12px;">지급 총액</td>
              <td style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">
                ${totalStr}원
              </td>
            </tr>
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">주차별 주휴수당</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">근무시간</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">출근일수</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">결과</th>
            </tr>
          </thead>
          <tbody>
            ${weeklyRowsHtml}
          </tbody>
        </table>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: left;">공제 항목</th>
              <th style="border: 1px solid #d1d5db; padding: 12px; text-align: right;">금액</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 12px; color: #9ca3af;">공제 없음</td>
              <td style="border: 1px solid #d1d5db; padding: 12px; text-align: right; color: #9ca3af;">0원</td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #1E40AF; color: white; padding: 30px; border-radius: 10px; text-align: center;">
          <p style="font-size: 14px; margin-bottom: 10px;">실지급액</p>
          <p style="font-size: 32px; font-weight: bold; margin: 0;">
            ${totalStr}원
          </p>
        </div>

        <div style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          <p>본 명세서는 근로기준법 제48조에 따라 발급되었습니다.</p>
          <p style="margin-top: 5px;">발급일: ${escapeHtml(
            toKST(new Date().toISOString(), 'datetime')
          )}</p>
        </div>
      </div>
    `;

      document.body.appendChild(container);

      let canvas: HTMLCanvasElement;
      try {
        // 모바일에서도 일관된 레이아웃을 위해 너비 강제 지정
        const prevWidth = container.style.width;
        container.style.width = '800px';

        canvas = await html2canvas(container, {
          scale: 2,
          width: 800,
          windowWidth: 800,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });

        container.style.width = prevWidth;
      } finally {
        container.remove();
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pageW = 210;
      const pageH = 297;
      let imgW = pageW;
      let imgH = (canvas.height * imgW) / canvas.width;
      if (imgH > pageH) {
        imgH = pageH;
        imgW = (canvas.width * imgH) / canvas.height;
      }

      pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);

      const fileBase = `페이노트_급여명세서_${safeFileNameSegment(employee.name)}_${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}`;
      pdf.save(`${fileBase}.pdf`);

      alert('급여명세서가 발급되었습니다.');
    } catch (error) {
      console.error('PDF 생성 오류:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert('PDF 생성 실패: ' + msg);
    } finally {
      isGenerating = false;
      loadingRowId = null;
    }
  }

  function formatWon(n: number): string {
    return `${n.toLocaleString('ko-KR')}원`;
  }

  /** 일별 목록: 집계 시각 이후 경과(시간) — 근무 중·유효 건만 */
  function liveShiftHours(s: ShiftLine): number {
    void tick;
    if (s.work_duration.isInvalid) return 0;
    if (!s.in_progress) return s.hours;
    const deltaH = (Date.now() - data.loadTimestampMs) / (1000 * 60 * 60);
    return Math.round((s.hours + deltaH) * 100) / 100;
  }

  /** 타임라인 근무시간 문구 (서버 displayText 또는 실시간 예상) */
  function shiftHoursLabel(s: ShiftLine): string {
    if (s.work_duration.isInvalid) return '⚠️ 오류';
    if (!s.in_progress) return s.work_duration.displayText;
    void tick;
    const mins = Math.round(liveShiftHours(s) * 60);
    return formatWorkHours(mins);
  }

  /** 드롭다운·화살표로 월 변경 시 목록 다시 로드 */
  function onPayrollMonthChange(y: number, m: number) {
    goto(`/payroll?month=${y}-${String(m).padStart(2, '0')}`, {
      replaceState: true,
      keepFocus: true,
    });
  }

  function toggleAllowanceDetail(employeeId: string) {
    allowanceOpen[employeeId] = !allowanceOpen[employeeId];
  }

  function toggleAttendancePanel() {
    showAttendancePanel = !showAttendancePanel;
  }
</script>

<div class="relative min-h-screen bg-surface">
  <div class="p-4 pb-20 sm:p-6">
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="heading-accent text-2xl font-bold text-ink-900 sm:text-3xl">급여 요약</h1>
      <div class="flex flex-wrap items-center gap-2">
        {#if hasLiveShift}
          <span
            class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900"
            title="퇴근 전 근무가 포함되어 집계 이후 경과 시간만큼 예상 급여가 갱신됩니다."
          >
            실시간 업데이트
          </span>
        {/if}
        <div class="flex flex-col gap-1 text-sm text-gray-600 sm:flex-row sm:items-center">
          <span class="whitespace-nowrap">조회 월</span>
          <!-- 서버에서 내려온 연·월과 피커 동기화 (탐색 후 UI 일치) -->
          {#key `${data.periodYear}-${data.periodMonth}`}
            <MonthPicker
              selectedYear={data.periodYear}
              selectedMonth={data.periodMonth}
              onchange={onPayrollMonthChange}
            />
          {/key}
        </div>
      </div>
    </div>

    <p class="mb-1 text-sm text-gray-600">
      {data.periodYear}년 {data.periodMonth}월 · 근무일·시간은 KST(Asia/Seoul) 기준입니다.
    </p>
    <p class="mb-4 text-xs text-gray-400">마지막 집계: {loadedAtKst}</p>

    {#if data.payrollError}
      <div
        class="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        role="alert"
      >
        {data.payrollError}
      </div>
    {/if}

    {#if !data.payrollError && data.summaries.length === 0}
      <div
        class="rounded-xl border border-gray-100 bg-white px-6 py-14 text-center shadow-sm"
      >
        <p class="text-gray-600">선택한 달에 근무 기록이 없습니다.</p>
        <p class="mt-2 text-sm text-gray-400">타임카드에서 출퇴근을 입력·마감해 주세요.</p>
        <a
          href="/timecards"
          class="mt-6 inline-flex rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          타임카드로 이동
        </a>
      </div>
    {:else if data.summaries.length > 0}
      {#if data.attendanceSummary.totalEmployees > 0}
        <section class="mb-6 rounded-xl border border-surface-border bg-surface-card shadow-sm">
          <div class="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-5">
            <h2 class="text-base font-semibold text-gray-900">
              📊 {data.periodMonth}월 근태 요약
            </h2>
            <button
              type="button"
              class="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              onclick={toggleAttendancePanel}
            >
              {showAttendancePanel ? '접기' : '펼치기'}
            </button>
          </div>

          {#if showAttendancePanel}
            <div class="px-4 py-4 sm:px-5">
              <!-- 카드 1: 전체 출근 현황 -->
              <div>
                <h3 class="mb-3 text-sm font-semibold text-gray-800">전체 출근 현황</h3>
                <div class="overflow-x-auto rounded-lg border border-gray-100">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600">
                      <tr>
                        <th class="px-3 py-2.5">직원명</th>
                        <th class="px-3 py-2.5">출근일수</th>
                        <th class="px-3 py-2.5">총 근무시간</th>
                        <th class="px-3 py-2.5">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each data.attendanceSummary.summaryByEmployee as s (s.employeeId)}
                        <tr class="border-t border-gray-100">
                          <td class="px-3 py-2.5 font-medium text-gray-900">{s.employeeName}</td>
                          <td class="px-3 py-2.5 text-gray-700">{s.totalDays}일</td>
                          <td class="px-3 py-2.5 {s.totalHours > (monthlyExpectedHoursByEmployee[s.employeeId] ?? 0) ? 'font-semibold text-orange-500' : 'text-gray-700'}">
                            {s.totalHours.toFixed(1)} / {(monthlyExpectedHoursByEmployee[s.employeeId] ?? 0).toFixed(1)}시간
                          </td>
                          <td class="px-3 py-2.5">
                            {#if s.totalDays === 0}
                              <span class="text-orange-500">미출근 ⚠️</span>
                            {:else}
                              <span class="text-green-600">정상 ✅</span>
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>

              <div class="my-5 border-t border-gray-100"></div>

              <!-- 카드 2: 주휴수당 발생 예보 -->
              <div>
                <h3 class="mb-3 text-sm font-semibold text-gray-800">주휴수당 발생 예보</h3>
                <div class="space-y-3">
                  {#each data.attendanceSummary.summaryByEmployee as s (s.employeeId)}
                    <div class="rounded-lg border border-gray-100 p-3">
                      <p class="text-sm font-semibold text-gray-900">{s.employeeName}</p>
                      <div class="mt-2 flex flex-wrap gap-2 text-xs">
                        {#each s.weeklyStatus as w (`${s.employeeId}-${w.weekLabel}`)}
                          <span class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                            {w.weekLabel}
                            {#if w.qualifies}
                              <span class="ml-1 text-green-600">✅ {formatWon(w.allowance)}</span>
                            {:else}
                              <span class="ml-1 text-red-400">❌ {w.reason || '조건 미충족'}</span>
                            {/if}
                          </span>
                        {/each}
                      </div>
                      <p class="mt-2 text-sm font-medium text-gray-700">
                        소계: {formatWon(s.weeklyAllowance)}
                      </p>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="my-5 border-t border-gray-100"></div>

              <!-- 카드 3: 월간 급여 합계 -->
              <div>
                <h3 class="mb-3 text-sm font-semibold text-gray-800">월간 급여 합계</h3>
                <div class="overflow-x-auto rounded-lg border border-gray-100">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-gray-50 text-gray-600">
                      <tr>
                        <th class="px-3 py-2.5">직원명</th>
                        <th class="px-3 py-2.5">기본급</th>
                        <th class="px-3 py-2.5">주휴수당</th>
                        <th class="px-3 py-2.5">최종 지급액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each data.attendanceSummary.summaryByEmployee as s (s.employeeId)}
                        <tr class="border-t border-gray-100">
                          <td class="px-3 py-2.5 font-medium text-gray-900">{s.employeeName}</td>
                          <td class="px-3 py-2.5 text-gray-700">{formatWon(s.basePay)}</td>
                          <td class="px-3 py-2.5 text-gray-700">{formatWon(s.weeklyAllowance)}</td>
                          <td class="px-3 py-2.5 text-gray-900">{formatWon(s.totalPay)}</td>
                        </tr>
                      {/each}
                      <tr class="border-t border-gray-200 bg-gray-50 font-semibold">
                        <td class="px-3 py-2.5">합계</td>
                        <td class="px-3 py-2.5">
                          {formatWon(
                            data.attendanceSummary.summaryByEmployee.reduce((sum, s) => sum + s.basePay, 0)
                          )}
                        </td>
                        <td class="px-3 py-2.5">
                          {formatWon(
                            data.attendanceSummary.summaryByEmployee.reduce((sum, s) => sum + s.weeklyAllowance, 0)
                          )}
                        </td>
                        <td class="px-3 py-2.5 text-base text-blue-700">
                          {formatWon(
                            data.attendanceSummary.summaryByEmployee.reduce((sum, s) => sum + s.totalPay, 0)
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="text-xs text-gray-400 mt-1">
                  ※ 현재 근무 중인 직원의 예상 금액이 포함될 수 있습니다.
                </p>
              </div>
            </div>
          {/if}
        </section>
      {/if}

      {#if data.timeline.length > 0}
        <section class="mb-8 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
          <h2 class="mb-4 text-base font-semibold text-gray-800">일별 근무 (최신 날짜 순)</h2>
          <div class="space-y-6">
            {#each data.timeline as day (day.date)}
              <div>
                <div
                  class="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2 text-sm font-medium text-gray-700"
                >
                  <span class="text-primary-600">{formatDayLabelKst(day.date)}</span>
                  <span class="text-xs font-normal text-gray-400">{day.date}</span>
                </div>
                <ul class="space-y-2">
                  {#each day.shifts as s (s.id)}
                    <li
                      class="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span class="font-medium text-gray-900">{s.employee_name}</span>
                      <span class="text-gray-600">
                        출근 {toKST(s.clock_in, 'datetime')}
                        {#if s.clock_out}
                          · 퇴근 {toKST(s.clock_out, 'datetime')}
                        {:else}
                          · <span class="font-medium text-amber-700">근무 중</span>
                        {/if}
                      </span>
                      <span class="text-gray-800">
                        {#if s.work_duration.isInvalid}
                          <span
                            class="font-medium text-red-500"
                            title={s.work_duration.invalidReason ?? ''}>⚠️ 오류</span
                          >
                        {:else if s.in_progress}
                          <span class="text-primary-600">
                            {shiftHoursLabel(s)}
                            <span class="text-xs text-gray-400">(예상)</span>
                          </span>
                        {:else}
                          {s.work_duration.displayText}
                        {/if}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <div class="mb-6 rounded-xl bg-primary-600 p-4 text-white shadow-sm sm:p-5">
        <p class="text-sm opacity-90">{data.periodYear}년 {data.periodMonth}월 총 인건비 (예상)</p>
        <p class="mt-1 text-2xl font-bold sm:text-3xl">{formatWon(grandTotal)}</p>
        <p class="mt-1 text-sm opacity-80">직원 {data.summaries.length}명</p>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {#each data.summaries as row (row.employee_id)}
          <article
            class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="text-lg font-semibold text-gray-900">{row.name}</h2>
                <p class="text-sm text-gray-500">시급 {formatWon(row.hourly_wage)}</p>
              </div>
              <div class="flex flex-wrap gap-1">
                {#if row.has_in_progress_shift}
                  <span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                    근무 중 포함
                  </span>
                {/if}
                {#if row.weeklyAllowance > 0}
                  <span
                    class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                  >
                    주휴수당 포함
                  </span>
                {/if}
              </div>
            </div>

            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-gray-500">총 근무시간</dt>
                <dd class="font-medium text-gray-900">{liveTotalHours(row).toFixed(2)}시간</dd>
              </div>
              <div>
                <dt class="text-gray-500">기본급</dt>
                <dd class="font-medium text-gray-900">{formatWon(liveBasePay(row))}</dd>
              </div>
              <div>
                <dt class="text-gray-500">주휴수당</dt>
                <dd class="flex items-center gap-2 font-medium text-gray-900">
                  {#if row.weeklyAllowance > 0}
                    <span>{formatWon(row.weeklyAllowance)}</span>
                  {:else}
                    <span class="text-gray-500">해당없음</span>
                  {/if}
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    onclick={() => toggleAllowanceDetail(row.employee_id)}
                  >
                    상세
                    <ChevronDown
                      size={14}
                      class={`transition-transform ${allowanceOpen[row.employee_id] ? 'rotate-180' : ''}`}
                    />
                  </button>
                </dd>
              </div>
              <div class="col-span-2 sm:col-span-3">
                <dt class="text-gray-500">합계</dt>
                <dd class="text-lg font-bold text-primary-700">{formatWon(liveTotalPay(row))}</dd>
              </div>
            </dl>

            {#if allowanceOpen[row.employee_id]}
            <!-- 월 내 주차별 주휴수당 상세(기본 접힘 상태) -->
            <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p class="text-xs font-semibold text-gray-600">주차별 주휴수당 상세</p>
              <ul class="mt-2 space-y-1.5">
                {#each row.weeklyAllowanceBreakdown as w (w.weekLabel)}
                  <li class="rounded-md bg-white px-2.5 py-2 text-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span class="text-gray-700">
                        {w.weekLabel} | 실근무 {w.totalHours.toFixed(1)}시간 | 출근 {w.actualDays}일
                      </span>
                      {#if w.qualifies}
                        <span class="font-medium text-emerald-700">
                          주휴수당 {formatWon(w.allowance)} ✅
                        </span>
                      {:else}
                        <span class="text-gray-500">
                          미발생 ({w.reason || '조건 미충족'}) ❌
                        </span>
                      {/if}
                    </div>
                    <p class="mt-1 text-xs text-gray-500">주 시작일: {w.weekStart}</p>
                  </li>
                {/each}
              </ul>
              <p class="text-xs text-gray-400 mt-3">
                ※ 주 단위는 일요일 기준으로 구분됩니다.
                월말에 걸친 주는 시작일(일요일)이 속한 달의 급여에 포함됩니다.
              </p>
            </div>
            {/if}

            <button
              type="button"
              onclick={() => generatePDF(row)}
              disabled={isGenerating}
              class="mt-4 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {loadingRowId === row.employee_id && isGenerating ? '생성 중...' : '급여명세서 발급'}
            </button>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>
