/**
 * 급여 페이지 서버 로드: KST 기준 선택 월·매장 타임카드 집계
 * 근무·급여는 `$lib/utils/payroll-calc` (분 단위 정수)로만 계산
 */
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	calculateMonthlyAllowance,
	calculatePay,
	type WorkDuration,
} from '$lib/utils/payroll-calc';
import { kstMonthRangeUTC } from '$lib/utils/timezone';

/** 일별 UI용 근무 1건 */
export interface PayrollShiftLine {
	id: string;
	employee_id: string;
	employee_name: string;
	/** 유효 근무 시간(시) — 집계 시각 기준, 라이브 보정은 클라이언트 */
	hours: number;
	in_progress: boolean;
	clock_in: string;
	clock_out: string | null;
	/** 분 단위 기반 근무시간·오류 여부 */
	work_duration: WorkDuration;
	shift_base_pay: number;
	shift_display_pay: string;
}

/** 날짜별 그룹(날짜 내림차순으로 배열 정렬) */
export interface PayrollDayGroup {
	date: string;
	shifts: PayrollShiftLine[];
}

/** 급여 카드 1행 */
export interface PayrollEmployeeSummary {
	employee_id: string;
	name: string;
	hourly_wage: number;
	weekly_contracted_days: number;
	total_hours: number;
	base_pay: number;
	weeklyAllowance: number;
	/** 월 내 주차별 주휴수당 상세 */
	weeklyAllowanceBreakdown: Array<{
		weekLabel: string;
		weekStart: string;
		allowance: number;
		totalHours: number;
		actualDays: number;
		qualifies: boolean;
		reason: '' | '15시간 미만' | '개근 미충족' | '미확정 근무 포함';
	}>;
	total_pay: number;
	shift_count: number;
	has_in_progress_shift: boolean;
}

export interface AttendanceSummary {
	totalEmployees: number;
	summaryByEmployee: Array<{
		employeeId: string;
		employeeName: string;
		weeklyContractedDays: number;
		totalDays: number;
		totalHours: number;
		basePay: number;
		weeklyAllowance: number;
		totalPay: number;
		weeklyStatus: Array<{
			weekLabel: string;
			qualifies: boolean;
			totalHours: number;
			reason: string;
			allowance: number;
		}>;
	}>;
}

function kstYearMonthNow(): { y: number; m: number } {
	const kstYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
	const [y, m] = kstYmd.split('-').map(Number);
	return { y, m };
}

export const load: PageServerLoad = async ({ url, parent, locals: { supabase } }) => {
	const { storeId } = await parent();
	if (!storeId) {
		throw error(500, 'storeId가 없습니다.');
	}

	const loadTimestampMs = Date.now();

	const monthParam = url.searchParams.get('month');
	let y: number;
	let m: number;
	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		const [py, pm] = monthParam.split('-').map(Number);
		if (py >= 2000 && py <= 2100 && pm >= 1 && pm <= 12) {
			y = py;
			m = pm;
		} else {
			({ y, m } = kstYearMonthNow());
		}
	} else {
		({ y, m } = kstYearMonthNow());
	}

	const periodYear = y;
	const periodMonth = m;
	// 주휴·일별 집계용 KST 달력 범위 (date 컬럼과 동일 기준)
	const from = `${y}-${String(m).padStart(2, '0')}-01`;
	const lastDay = new Date(y, m, 0).getDate();
	const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

	// timestamptz(clock_in) 필터: KST 한 달을 UTC 구간으로 변환
	const { start: rangeStartUtc, end: rangeEndUtc } = kstMonthRangeUTC(y, m);

	const { data: storeRow, error: storeNameErr } = await supabase
		.from('stores')
		.select('name')
		.eq('id', storeId)
		.maybeSingle();
	if (storeNameErr) {
		console.error('payroll stores.name 조회 오류:', storeNameErr);
	}
	const storeName =
		storeRow?.name && String(storeRow.name).trim() ? String(storeRow.name).trim() : '매장';

	const { data: storeEmployees, error: empErr } = await supabase
		.from('employees')
		// 직원 기본 정보와 주 소정근로일수를 함께 조회한다.
		.select('id, name, hourly_wage, weekly_contracted_days')
		.eq('store_id', storeId);

	const emptyPayload = {
		storeId,
		storeName,
		periodYear,
		periodMonth,
		from,
		to,
		loadTimestampMs,
		summaries: [] as PayrollEmployeeSummary[],
		attendanceSummary: {
			totalEmployees: 0,
			summaryByEmployee: [],
		} as AttendanceSummary,
		timeline: [] as PayrollDayGroup[],
		payrollError: null as string | null,
	};

	if (empErr) {
		console.error('payroll employees 조회 오류:', empErr);
		return {
			...emptyPayload,
			payrollError: '직원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
		};
	}

	const employeeIds = storeEmployees?.map((e) => e.id) ?? [];
	if (employeeIds.length === 0) {
		return emptyPayload;
	}

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
		console.error('payroll timecards 조회 오류:', qError);
		return {
			...emptyPayload,
			payrollError: '급여 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
		};
	}

	// 원시 타임카드 행 — 서버 콘솔 디버그 출력은 QA 시 로그 노이즈·민감정보 노출을 줄이기 위해 사용하지 않음
	const list = rows ?? [];

	const byEmp = new Map<
		string,
		{
			name: string;
			hourly_wage: number;
			weekly_contracted_days: number;
			totalHoursRaw: number;
			basePaySum: number;
			shift_count: number;
			timecards: Array<{ clock_in: string; clock_out: string | null }>;
			completedWorkMinutes: number;
			completedDates: Set<string>;
			has_in_progress_shift: boolean;
		}
	>();

	const dateMap = new Map<string, PayrollShiftLine[]>();

	for (const row of list) {
		const rawEmp = row.employee as unknown;
		const emp = (
			Array.isArray(rawEmp) ? rawEmp[0] : rawEmp
		) as
			| { id: string; name: string; hourly_wage: number; weekly_contracted_days: number | null }
			| null
			| undefined;
		if (!emp || !row.clock_in) continue;

		const wage = Number(emp.hourly_wage);
		if (!Number.isFinite(wage) || wage <= 0) continue;

		const payResult = calculatePay(
			row.clock_in as string,
			row.clock_out as string | null,
			wage
		);
		const dur = payResult.workDuration;

		if (dur.isInvalid) {
			console.warn(`[급여 경고] ${emp.name} ${row.date}:`, payResult.debugLog);
		}

		const hoursDecimal = dur.isInvalid ? 0 : dur.totalMinutes / 60;
		const inProgress = row.clock_out == null;

		const workDate = row.date as string;
		const line: PayrollShiftLine = {
			id: row.id as string,
			employee_id: emp.id,
			employee_name: emp.name,
			hours: hoursDecimal,
			in_progress: inProgress,
			clock_in: row.clock_in as string,
			clock_out: (row.clock_out as string | null) ?? null,
			work_duration: dur,
			shift_base_pay: payResult.basePay,
			shift_display_pay: payResult.displayPay,
		};
		if (!dateMap.has(workDate)) dateMap.set(workDate, []);
		dateMap.get(workDate)!.push(line);

		if (!byEmp.has(emp.id)) {
			byEmp.set(emp.id, {
				name: emp.name,
				hourly_wage: wage,
				// 직원별 주 소정근로일수(미설정/null은 5일 기본값)
				weekly_contracted_days: emp.weekly_contracted_days ?? 5,
				totalHoursRaw: 0,
				basePaySum: 0,
				shift_count: 0,
				timecards: [],
				completedWorkMinutes: 0,
				completedDates: new Set<string>(),
				has_in_progress_shift: false,
			});
		}
		const bucket = byEmp.get(emp.id)!;
		if (inProgress && !dur.isInvalid) bucket.has_in_progress_shift = true;
		bucket.totalHoursRaw += hoursDecimal;
		bucket.basePaySum += payResult.basePay;
		bucket.shift_count += 1;
		// 주휴수당 계산은 원본 시각(UTC ISO) 기준으로 주차 필터링한다.
		bucket.timecards.push({
			clock_in: row.clock_in as string,
			clock_out: (row.clock_out as string | null) ?? null,
		});
		// 완료 근무(퇴근 존재)만 출근일수/총근무시간 집계에 포함한다.
		if (row.clock_out && !dur.isInvalid) {
			bucket.completedWorkMinutes += dur.totalMinutes;
			bucket.completedDates.add(workDate);
		}
	}

	const timeline: PayrollDayGroup[] = [...dateMap.entries()]
		.sort((a, b) => b[0].localeCompare(a[0]))
		.map(([date, shifts]) => ({
			date,
			shifts: shifts.sort((a, b) => b.clock_in.localeCompare(a.clock_in)),
		}));

	const summaries: PayrollEmployeeSummary[] = [];
	const attendanceSummaryByEmployee: AttendanceSummary['summaryByEmployee'] = [];

	for (const [employee_id, b] of byEmp) {
		const total_hours = Math.round(b.totalHoursRaw * 100) / 100;
		const base_pay = b.basePaySum;
		const monthlyAllowance = calculateMonthlyAllowance(
			b.timecards,
			b.hourly_wage,
			b.weekly_contracted_days,
			periodYear,
			periodMonth
		);
		const weeklyAllowance = monthlyAllowance.totalAllowance;
		summaries.push({
			employee_id,
			name: b.name,
			hourly_wage: b.hourly_wage,
			weekly_contracted_days: b.weekly_contracted_days,
			total_hours,
			base_pay,
			weeklyAllowance,
			// UI에서 주차별 주휴수당/미충족 사유를 표시할 때 사용한다.
			weeklyAllowanceBreakdown: monthlyAllowance.weeklyBreakdown,
			total_pay: base_pay + weeklyAllowance,
			shift_count: b.shift_count,
			has_in_progress_shift: b.has_in_progress_shift,
		});
		attendanceSummaryByEmployee.push({
			employeeId: employee_id,
			employeeName: b.name,
			weeklyContractedDays: b.weekly_contracted_days,
			totalDays: b.completedDates.size,
			totalHours: Number((b.completedWorkMinutes / 60).toFixed(1)),
			basePay: base_pay,
			weeklyAllowance,
			totalPay: base_pay + weeklyAllowance,
			// 이번 단계에서는 weekly_hours 테이블에 저장하지 않고 화면 표시용으로만 사용한다.
			weeklyStatus: monthlyAllowance.weeklyBreakdown.map((w, idx) => ({
				weekLabel: `${idx + 1}주차`,
				qualifies: w.qualifies,
				totalHours: w.totalHours,
				reason: w.reason,
				allowance: w.allowance,
			})),
		});
	}

	summaries.sort((a, b) => b.total_pay - a.total_pay);
	attendanceSummaryByEmployee.sort((a, b) => b.totalPay - a.totalPay);

	return {
		storeId,
		storeName,
		periodYear,
		periodMonth,
		from,
		to,
		loadTimestampMs,
		summaries,
		attendanceSummary: {
			totalEmployees: attendanceSummaryByEmployee.length,
			summaryByEmployee: attendanceSummaryByEmployee,
		},
		timeline,
		payrollError: null as string | null,
	};
};
