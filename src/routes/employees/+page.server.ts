import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals: { supabase } }) => {
  const { storeId } = await parent();
  if (!storeId) {
    throw error(500, 'storeId가 없습니다.');
  }

  // 직원 목록(클라이언트 우측 급여 요약 계산용 최소 필드 포함)
  const { data: employees } = await supabase
    .from('employees')
    .select('id, name, hourly_wage, weekly_contracted_days')
    .eq('store_id', storeId)
    .order('name');

  // 이번 달 급여 요약 초기 데이터 (우측 패널용)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const employeeIds = (employees ?? []).map((e: { id: string }) => e.id);

  // 타임카드 조회 (payroll/+page.server.ts와 동일하게 employee_id 기반)
  const { data: payrollTimecards } = employeeIds.length > 0
    ? await supabase
        .from('timecards')
        .select('id, employee_id, date, clock_in, clock_out')
        .in('employee_id', employeeIds)
        .gte('date', startDate)
        .lt('date', endDate)
    : {
        data: [] as {
          id: string;
          employee_id: string;
          date: string;
          clock_in: string | null;
          clock_out: string | null;
        }[]
      };

  return {
    storeId,
    employees: employees ?? [],
    payrollYear: year,
    payrollMonth: month,
    payrollTimecards: payrollTimecards ?? []
  };
};
