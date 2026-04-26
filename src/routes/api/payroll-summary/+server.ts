import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { calculateMonthlyAllowance, calculatePay } from '$lib/utils/payroll-calc';
import { parseUtc } from '$lib/utils/timezone';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.session) {
    return new Response(
      JSON.stringify({ error: '로그인이 필요합니다.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // API 라우트는 +layout.server.ts를 거치지 않으므로
  // locals.storeId가 없음 → stores 테이블에서 직접 조회
  const { data: storeData, error: storeError } = await locals.supabase
    .from('stores')
    .select('id')
    .eq('owner_id', locals.session?.user?.id)
    .single();

  if (storeError || !storeData) {
    return new Response(
      JSON.stringify({ error: '매장 정보를 찾을 수 없습니다.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const storeId = storeData.id;

  const year = parseInt(url.searchParams.get('year') ?? '');
  const month = parseInt(url.searchParams.get('month') ?? '');

  if (isNaN(year) || isNaN(month)) {
    return new Response(
      JSON.stringify({ error: '잘못된 연월 파라미터입니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const supabase = locals.supabase;

  // 직원 목록 조회
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, name, hourly_wage, weekly_contracted_days')
    .eq('store_id', storeId)
    .order('name');

  if (empErr) {
    return new Response(
      JSON.stringify({ error: '직원 조회 실패' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const employeeIds = (employees ?? []).map((e) => e.id);

  /** 타임카드 select 행과 동일한 최소 형태 (직원 없을 때 빈 배열용) */
  type TimecardRow = {
    id: string;
    employee_id: string;
    date: string;
    clock_in: string | null;
    clock_out: string | null;
  };

  // 타임카드 조회 (payroll/+page.server.ts와 동일하게 employee_id 기반)
  const { data: timecards, error: tcErr } = employeeIds.length > 0
    ? await supabase
        .from('timecards')
        .select('id, employee_id, date, clock_in, clock_out')
        .in('employee_id', employeeIds)
        .gte('date', startDate)
        .lt('date', endDate)
    : { data: [] as TimecardRow[], error: null };

  if (tcErr) {
    return new Response(
      JSON.stringify({ error: '타임카드 조회 실패' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 직원별 집계
  const summaryByEmployee = (employees ?? []).map((emp) => {
    const empTimecards = (timecards ?? []).filter((tc) => tc.employee_id === emp.id);
    const weeklyContractedDays = emp.weekly_contracted_days ?? 5;

    // 완료된 근무만 집계
    const completedTimecards = empTimecards.filter((tc) => tc.clock_in && tc.clock_out);

    // 총 출근일수 (날짜 기준 고유값)
    const uniqueDates = new Set(completedTimecards.map((tc) => tc.date));
    const totalDays = uniqueDates.size;

    // 총 근무시간 (분 -> 시간)
    let totalMinutes = 0;
    for (const tc of completedTimecards) {
      const diff = parseUtc(tc.clock_out).getTime() - parseUtc(tc.clock_in).getTime();
      if (diff > 0) totalMinutes += Math.floor(diff / 60000);
    }
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    // 기본급 합계 (기존 계산 유틸 재사용)
    const basePay = completedTimecards.reduce((sum, tc) => {
      const pay = calculatePay(tc.clock_in, tc.clock_out, emp.hourly_wage);
      return sum + pay.basePay;
    }, 0);

    // 주휴수당 (payroll-calc.ts 의 기존 함수 재사용)
    const monthly = calculateMonthlyAllowance(
      empTimecards,
      emp.hourly_wage,
      weeklyContractedDays,
      year,
      month
    );
    const weeklyAllowance = monthly.totalAllowance;
    const weeklyStatus = monthly.weeklyBreakdown.map((w) => ({
      weekLabel: w.weekLabel,
      weekStart: w.weekStart,
      qualifies: w.qualifies,
      totalHours: w.totalHours,
      actualDays: w.actualDays,
      reason: w.reason,
      allowance: w.allowance
    }));

    // 기준시간 계산 (weeklyContractedDays × 월 주차수 × 8)
    const weeksInMonth = monthly.weeklyBreakdown.length;
    const expectedHours = weeklyContractedDays * weeksInMonth * 8;

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      weeklyContractedDays,
      totalDays,
      totalHours,
      expectedHours,
      basePay,
      weeklyAllowance,
      totalPay: basePay + weeklyAllowance,
      weeklyStatus
    };
  });

  return json({ year, month, summaryByEmployee });
};
