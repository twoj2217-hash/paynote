/**
 * 대시보드: 매장 타임카드 1회 조회로 오늘 출근·근무중 집계 및 주휴 알림 후보 계산
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { kstMonthRangeUTC, parseUtc } from '$lib/utils/timezone';

export const load: PageServerLoad = async ({ parent, locals: { supabase } }) => {
	const { storeId } = await parent();
	if (!storeId) {
		throw error(500, 'storeId가 없습니다.');
	}

	// 요구사항: KST 오늘 문자열 (timecards.date 컬럼과 비교)
	const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
	const todayStr = nowKST.toISOString().slice(0, 10);

	const [periodYear, periodMonth] = todayStr.split('-').map(Number);
	const { start: rangeStartUtc, end: rangeEndUtc } = kstMonthRangeUTC(periodYear, periodMonth);

	const { data: emps, error: empErr } = await supabase
		.from('employees')
		.select('id, name, hourly_wage, weekly_contracted_days')
		.eq('store_id', storeId);

	if (empErr) {
		console.error('dashboard employees 조회 오류:', empErr);
		return {
			todayAttendanceCount: 0,
			currentlyWorkingCount: 0,
			missedCheckoutCount: 0,
			weeklyAllowanceAlertNames: [] as string[],
		};
	}

	const employeeIds = emps?.map((e) => e.id) ?? [];
	if (employeeIds.length === 0) {
		return {
			todayAttendanceCount: 0,
			currentlyWorkingCount: 0,
			missedCheckoutCount: 0,
			weeklyAllowanceAlertNames: [] as string[],
		};
	}

	// 급여 페이지와 동일하게 KST 달력 한 달의 clock_in 구간으로만 조회 (단일 쿼리)
	const { data: rows, error: qError } = await supabase
		.from('timecards')
		.select(
			`
      id,
      date,
      clock_in,
      clock_out,
      employee_id,
      employee:employees!inner(id, name, hourly_wage, weekly_contracted_days)
    `
		)
		.in('employee_id', employeeIds)
		.gte('clock_in', rangeStartUtc)
		.lt('clock_in', rangeEndUtc);

	if (qError) {
		console.error('dashboard timecards 조회 오류:', qError);
		return {
			todayAttendanceCount: 0,
			currentlyWorkingCount: 0,
			missedCheckoutCount: 0,
			weeklyAllowanceAlertNames: [] as string[],
		};
	}

	const list = rows ?? [];

	// 오늘 KST 날짜에 clock_in 기록이 있는 고유 직원 수
	const todayAttendanceCount = new Set(
		list.filter((r) => r.date === todayStr && r.clock_in).map((r) => r.employee_id as string)
	).size;

	// 퇴근 미처리 타임카드를 "근무중/퇴근누락"으로 분리 집계
	const currentlyOpenCards = list.filter((r) => r.clock_out === null);
	const missedCheckoutCount = currentlyOpenCards.filter((r) => {
		const workedHours = (Date.now() - parseUtc(r.clock_in as string).getTime()) / 3_600_000;
		return (r.date as string) < todayStr || workedHours >= 16;
	}).length;
	const currentlyWorkingCount = Math.max(0, currentlyOpenCards.length - missedCheckoutCount);

	// LCP 개선: 서버 첫 응답에서 무거운 주휴 계산/매출·메뉴 조회를 제외하고
	// 화면 첫 렌더에 필요한 근태 카운트만 우선 반환합니다.
	const weeklyAllowanceAlertNames: string[] = [];

	return {
		todayAttendanceCount,
		currentlyWorkingCount,
		missedCheckoutCount,
		weeklyAllowanceAlertNames,
		menuItems: [],
		todaySales: [],
	};
};
