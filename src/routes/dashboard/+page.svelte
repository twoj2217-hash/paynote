<script lang="ts">
  import { onMount } from 'svelte';
  import { QrCode, Users, MessageSquare, MapPin, LayoutDashboard, Store } from 'lucide-svelte';
  import { supabase } from '$lib/supabaseClient';
  import { parseUtc } from '$lib/utils/timezone';
  import Neighborhood from '$lib/components/Neighborhood.svelte';
  import type { PageProps } from './$types';
  import { calculatePay } from '$lib/utils/payroll-calc';
  const MIN_HOURLY_WAGE = 10030;

  // 대시보드 탭
  type TabId = 'attendance' | 'store' | 'neighborhood';
  const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'attendance', label: '근태현황', icon: LayoutDashboard },
    { id: 'store', label: '가게현황판', icon: Store },
    // 복구 단계에서는 탭을 유지하되 준비중 상태를 명확히 노출합니다.
    { id: 'neighborhood', label: '사장님 골목 (준비 중)', icon: MapPin },
  ];
  let activeTab = $state<TabId>('attendance');

  /** KST 기준 현재 월 ('YYYY-MM') */
  const currentMonth = $derived.by(() => {
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y = nowKST.getUTCFullYear();
    const m = nowKST.getUTCMonth() + 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  });

  let { data }: PageProps = $props();
  // load 함수에서 주입된 storeId를 그대로 사용합니다.
  const storeId = $derived(data.storeId);

  /** 이번 달 말일 기준 급여 마감 D-day (요구사항과 동일한 KST 날짜 문자열 규칙) */
  const payrollCloseInfo = $derived.by(() => {
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = nowKST.toISOString().slice(0, 10);
    const [y, m] = todayStr.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const toUtc = (s: string) => {
      const [yy, mm, dd] = s.split('-').map(Number);
      return Date.UTC(yy, mm - 1, dd);
    };
    const daysLeft = Math.round((toUtc(endStr) - toUtc(todayStr)) / 86_400_000);
    if (daysLeft < 0) {
      return { kind: 'done' as const };
    }
    if (daysLeft === 0) {
      return { kind: 'today' as const };
    }
    return { kind: 'countdown' as const, daysLeft };
  });

  /** 서버에서 계산한 주휴 선제 알림 문구 (해당자 없으면 null) */
  const weeklyAllowanceBannerText = $derived.by(() => {
    const names = data.weeklyAllowanceAlertNames ?? [];
    if (names.length === 0) return null;
    if (names.length === 1) return `💡 ${names[0]} 씨, 이번 주 주휴수당 발생 예정이에요`;
    return `💡 ${names[0]} 외 ${names.length - 1}명, 이번 주 주휴수당 발생 예정이에요`;
  });

  interface Timecard {
    id: string;
    employee_id: string;
    date: string;
    clock_in: string;
    clock_out: string | null;
    employee?: { name: string; hourly_wage: number };
  }

  // 매장에 등록된 직원이 0명이면 온보딩 가이드를 보여준다
  let hasAnyEmployee = $state<boolean | null>(null);

  let todayCards = $state<Timecard[]>([]);
  let totalEmployees = $state(0);
  let workingNow = $state(0);
  let expectedPay = $state(0);
  let weeklyAllowanceCount = $state(0);
  let minWageViolations = $state(0);
  let isGenerating = $state(false);
  let isStoreDashboardLoading = $state(false);
  let StoreDashboardComponent = $state<Awaited<typeof import('$lib/components/StoreDashboard.svelte')>['default'] | null>(null);
  const storeMenuItems = $derived(data.menuItems ?? []);
  const storeTodaySales = $derived(data.todaySales ?? []);
  // 온보딩 스텝 강조 상태를 숫자로 관리합니다. (1: 직원 등록, 2: 출퇴근 기록, 3: 급여 확인)
  const onboardingStep = $derived.by(() => {
    if (hasAnyEmployee === false) return 1;
    if (todayCards.length === 0) return 2;
    return 3;
  });

  // 가게현황판 탭이 열릴 때만 무거운 컴포넌트를 로드해 초기 번들을 줄입니다.
  async function ensureStoreDashboardLoaded() {
    if (StoreDashboardComponent || isStoreDashboardLoading) return;
    isStoreDashboardLoading = true;
    try {
      const module = await import('$lib/components/StoreDashboard.svelte');
      StoreDashboardComponent = module.default;
    } finally {
      isStoreDashboardLoading = false;
    }
  }

  async function downloadQR() {
    // QR 생성 중에는 중복 클릭을 막습니다.
    isGenerating = true;
    try {
      // 로딩 상태가 먼저 그려진 뒤 QR 인코딩이 시작되도록 한 프레임 양보합니다.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      if (!storeId) {
        alert('가게 정보가 없어 QR 코드를 생성할 수 없습니다.');
        return;
      }

      // QR 라이브러리는 버튼 클릭 시점에만 로드해 초기 진입 성능을 보존합니다.
      const { default: QRCode } = await import('qrcode');
      const url = `${window.location.origin}/q/${storeId}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: '#1f2937', light: '#ffffff' }
      });

      const link = document.createElement('a');
      link.download = `페이노트_QR_${storeId.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error(error);
      alert('QR 코드 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      isGenerating = false;
    }
  }

  onMount(async () => {
    if (!storeId) return;

    // KST(Asia/Seoul) 기준 오늘 날짜 — sv-SE 로캘은 YYYY-MM-DD 형식 반환
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

    // 이 가게 직원 ID 목록 조회
    const { data: empData } = await supabase
      .from('employees')
      .select('id')
      .eq('store_id', storeId);
    const employeeIds = empData?.map(e => e.id) ?? [];
    if (employeeIds.length === 0) {
      hasAnyEmployee = false;
      return;
    }
    hasAnyEmployee = true;

    // 화면 진입 체감을 줄이기 위해 오늘/주간 조회를 병렬로 요청합니다.
    const [todayResult, weekResult] = await Promise.all([
      supabase
        .from('timecards')
        .select('*, employee:employees!inner(name, hourly_wage)')
        .in('employee_id', employeeIds)
        .eq('date', today),
      supabase
        .from('timecards')
        .select('employee_id, clock_in, clock_out')
        .in('employee_id', employeeIds)
        .gte('date', weekAgo)
        .lte('date', today)
        .not('clock_out', 'is', null)
    ]);

    const { data: todayRows, error: todayErr } = todayResult;
    if (todayErr) { console.error(todayErr); return; }

    if (todayRows) {
      todayCards = todayRows;
      totalEmployees = todayRows.length;
      workingNow = todayRows.filter(c => !c.clock_out).length;

      // 실제 급여 계산
      expectedPay = todayRows.reduce((sum, card) => {
        if (!card.clock_out || !card.employee) return sum;
        const result = calculatePay(
          card.clock_in,
          card.clock_out,
          card.employee.hourly_wage,
        );
        return sum + result.basePay;
      }, 0);

      // 최저시급 위반 체크
      // 시급이 법정 최저시급 미만인 직원 수
      minWageViolations = todayRows.filter(
        (c) => c.employee && c.employee.hourly_wage < MIN_HOURLY_WAGE
      ).length;
    }

    // 주간 근무 기록으로 주휴수당 대상 카운트
    const { data: weekData } = weekResult;

    if (weekData) {
      const empHours: Record<string, number> = {};
      weekData.forEach(c => {
        const h = (parseUtc(c.clock_out!).getTime() - parseUtc(c.clock_in).getTime()) / 3_600_000;
        empHours[c.employee_id] = (empHours[c.employee_id] ?? 0) + h;
      });
      weeklyAllowanceCount = Object.values(empHours).filter(h => h >= 15).length;
    }
  });

  // 탭 진입 시점에만 가게현황판 JS를 불러옵니다.
  $effect(() => {
    if (activeTab === 'store') {
      void ensureStoreDashboardLoaded();
    }
  });
</script>

<div class="p-4 sm:p-6 min-h-screen bg-surface">
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <h1 class="heading-accent text-2xl sm:text-3xl font-bold text-ink-900">페이노트 대시보드</h1>
    <div class="flex items-center gap-2">
      <a
        href="/review"
        class="inline-flex items-center gap-2 rounded-xl border border-gray-200
               bg-white px-4 py-2 text-sm font-medium text-gray-700
               hover:bg-gray-50 transition-colors"
      >
        <MessageSquare class="h-4 w-4 text-primary-600" />
        리뷰 답글 도우미
      </a>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        onclick={downloadQR}
        disabled={isGenerating || !storeId}
      >
        <QrCode class="h-4 w-4" />
        {#if isGenerating}
          생성 중...
        {:else}
          QR 코드 다운로드
        {/if}
      </button>
    </div>
  </div>

  <!-- 탭 네비게이션 -->
  <div class="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
    {#each tabs as tab}
      {@const isActive = activeTab === tab.id}
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
               {isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}"
        onclick={() => activeTab = tab.id}
      >
        <tab.icon class="w-4 h-4" />
        {tab.label}
      </button>
    {/each}
  </div>

{#if activeTab === 'attendance'}
  <div class="flex flex-col lg:flex-row gap-6">
  <div class="lg:w-[55%] min-w-0 space-y-4">

  <!-- 오늘의 현황: 서버 집계(단일 timecards 쿼리 기반) -->
  <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">실시간 현황</p>
  <div class="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="card">
      <p class="mb-1 text-xs text-gray-500">현재 근무 중</p>
      <p class="text-xl font-bold text-primary-600">{data.currentlyWorkingCount}명</p>
    </div>
    <div class="card">
      <p class="mb-1 text-xs text-gray-500">퇴근누락</p>
      <p class="text-xl font-bold text-red-600">{data.missedCheckoutCount}건</p>
    </div>
    <div class="card">
      <p class="mb-1 text-xs text-gray-500">오늘 출근</p>
      <p class="text-xl font-bold text-primary-600">{data.todayAttendanceCount}명</p>
    </div>
    <div class="card">
      <p class="mb-1 text-xs text-gray-500">급여 마감</p>
      {#if payrollCloseInfo.kind === 'done'}
        <p class="text-xl font-bold text-gray-800">이번 달 완료</p>
      {:else if payrollCloseInfo.kind === 'today'}
        <p class="text-xl font-bold text-orange-500">오늘 마감!</p>
      {:else}
        <p
          class={`text-xl font-bold ${payrollCloseInfo.daysLeft <= 3 ? 'text-orange-500' : 'text-ink-900'}`}
        >
          급여 마감 D-{payrollCloseInfo.daysLeft}
        </p>
      {/if}
    </div>
  </div>

  {#if weeklyAllowanceBannerText}
    <div
      class="mb-5 border-l-4 border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
      role="status"
    >
      {weeklyAllowanceBannerText}
    </div>
  {/if}

  <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">오늘 집계</p>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="card">
      <p class="text-sm text-gray-500 mb-1">오늘 출근 인원 / 현재 근무 중</p>
      <p class="text-2xl font-bold text-primary-600">{totalEmployees}명 / {workingNow}명</p>
    </div>
    <div class="card">
      <p class="text-sm text-gray-500 mb-1">오늘 예상 인건비 합계</p>
      <p class="text-2xl font-bold text-gray-800">{expectedPay.toLocaleString()}원</p>
    </div>
    <div class="card">
      <p class="text-sm text-gray-500 mb-1">주휴수당 발생 대상</p>
      <p class="text-2xl font-bold text-primary-600">{weeklyAllowanceCount}명</p>
    </div>
    <div class="card">
      <p class="text-sm text-gray-500 mb-1">최저시급 위반 경고</p>
      <p class="text-2xl font-bold text-orange-500">{minWageViolations}건</p>
    </div>
  </div>

  {#if hasAnyEmployee === false}
    <!-- 시작 가이드 배너 -->
    <div class="mb-4 rounded-xl border border-primary-100 bg-primary-50 p-4">
      <p class="text-xs font-medium text-primary-600 mb-2">페이노트 시작 가이드</p>
      <div class="flex items-center gap-2 text-xs flex-wrap">
        <a
          href="/employees"
          class={`flex items-center gap-1 hover:underline ${
            onboardingStep === 1 ? 'font-semibold text-primary-600' : 'text-gray-500'
          }`}
        >
          <span
            class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              onboardingStep === 1
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            1
          </span>
          직원 등록
        </a>
        <span class="text-gray-300">────</span>
        <span
          class={`flex items-center gap-1 ${
            onboardingStep === 2 ? 'font-semibold text-primary-600' : 'text-gray-400'
          }`}
        >
          <span
            class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              onboardingStep === 2
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            2
          </span>
          출퇴근 기록
        </span>
        <span class="text-gray-300">────</span>
        <span
          class={`flex items-center gap-1 ${
            onboardingStep === 3 ? 'font-semibold text-primary-600' : 'text-gray-400'
          }`}
        >
          <span
            class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              onboardingStep === 3
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            3
          </span>
          급여 확인
        </span>
      </div>
    </div>

    <!-- Empty State 카드 -->
    <div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-8 text-center mb-6">
      <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
        <Users class="w-6 h-6 text-primary-600" />
      </div>
      <h3 class="text-lg font-semibold text-gray-900 mb-1">직원을 등록해보세요</h3>
      <p class="text-sm text-gray-500 mb-6">
        직원 등록 후 QR 출퇴근과 급여 자동 계산을 바로 시작할 수 있어요.
      </p>
      <a href="/employees"
         class="inline-block bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-6 py-3 transition-colors">
        첫 직원 등록하기
      </a>
    </div>
  {/if}

  <div class="bg-surface-card rounded-xl shadow-sm border border-surface-border p-4 sm:p-5">
    <h2 class="text-xl font-bold mb-6 text-gray-800">오늘의 출퇴근 현황</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-600 text-sm">
          <tr>
            <th class="p-3 rounded-tl-lg">직원명</th>
            <th class="p-3">출근 시간</th>
            <th class="p-3">퇴근 시간</th>
            <th class="p-3 rounded-tr-lg">상태</th>
          </tr>
        </thead>
        <tbody>
          {#each todayCards as card}
            <tr class="border-t border-gray-100">
              <td class="p-3 text-sm">{card.employee?.name ?? card.id.substring(0,8)}</td>
              <td class="p-3 text-sm">{parseUtc(card.clock_in).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })}</td>
              <td class="p-3 text-sm">{card.clock_out ? parseUtc(card.clock_out).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
              <td class="p-3">
                {#if card.clock_out}
                  <span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">퇴근완료</span>
                {:else}
                  <span class="px-2 py-1 bg-blue-100 text-primary-600 rounded text-xs font-bold">근무중</span>
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="4" class="text-center text-gray-400 py-10">
                아직 출퇴근 기록이 없습니다.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  </div>

  </div>
{:else if activeTab === 'store'}
  {#if StoreDashboardComponent}
    <StoreDashboardComponent
      menuItems={storeMenuItems}
      todaySales={storeTodaySales}
      storeId={data.storeId ?? ''}
    />
  {:else}
    <div class="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500">
      {isStoreDashboardLoading ? '가게현황판을 불러오는 중입니다...' : '가게현황판 준비 중입니다...'}
    </div>
  {/if}
{:else if activeTab === 'neighborhood'}
  <!-- 3-1 화면 구성 기준의 정적 컴포넌트만 노출 -->
  <Neighborhood currentMonth={currentMonth} />
{/if}
</div>