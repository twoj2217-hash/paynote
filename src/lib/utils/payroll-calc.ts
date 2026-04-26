// 급여 계산 핵심 로직 — 급여 화면·집계는 이 모듈의 결과를 사용
// (밀리초 소수 시간 직접 곱셈으로 인한 13원·수천만 원 오류 방지)

import { parseUtc } from '$lib/utils/timezone';

/**
 * 근무시간 계산 결과
 */
export interface WorkDuration {
	/** 총 근무 분(정수, 1분 미만은 0) */
	totalMinutes: number;
	hours: number;
	minutes: number;
	displayText: string;
	isEstimate: boolean;
	isInvalid: boolean;
	invalidReason?: string;
}

/**
 * 급여 계산 결과
 */
export interface PayCalcResult {
	workDuration: WorkDuration;
	basePay: number;
	displayPay: string;
	hourlyWage: number;
	debugLog: string;
}

export interface WeeklyAllowanceResult {
	allowance: number;
	totalHours: number;
	actualDays: number;
	qualifies: boolean;
	reason: '' | '15시간 미만' | '개근 미충족' | '미확정 근무 포함';
}

export interface MonthlyAllowanceResult {
	totalAllowance: number;
	weeklyBreakdown: Array<{
		weekLabel: string;
		weekStart: string;
	} & WeeklyAllowanceResult>;
}

/** KST 기준 요일 계산용 오프셋(UTC+9) */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 안전한 근무시간 계산 (분 단위 정수 → 표시·급여)
 */
export function calculateWorkDuration(
	clockIn: string | null,
	clockOut: string | null
): WorkDuration {
	if (!clockIn) {
		return {
			totalMinutes: 0,
			hours: 0,
			minutes: 0,
			displayText: '-',
			isEstimate: false,
			isInvalid: true,
			invalidReason: '출근 기록 없음',
		};
	}

	const inTime = parseUtc(clockIn);

	if (isNaN(inTime.getTime())) {
		return {
			totalMinutes: 0,
			hours: 0,
			minutes: 0,
			displayText: '-',
			isEstimate: false,
			isInvalid: true,
			invalidReason: '출근 시각 파싱 실패: ' + clockIn,
		};
	}

	let outTime: Date;
	let isEstimate = false;

	if (!clockOut) {
		outTime = new Date();
		isEstimate = true;
	} else {
		outTime = parseUtc(clockOut);
		if (isNaN(outTime.getTime())) {
			return {
				totalMinutes: 0,
				hours: 0,
				minutes: 0,
				displayText: '-',
				isEstimate: false,
				isInvalid: true,
				invalidReason: '퇴근 시각 파싱 실패: ' + clockOut,
			};
		}
	}

	const diffMs = outTime.getTime() - inTime.getTime();

	if (diffMs < 0) {
		return {
			totalMinutes: 0,
			hours: 0,
			minutes: 0,
			displayText: '오류',
			isEstimate: false,
			isInvalid: true,
			invalidReason: `퇴근(${clockOut})이 출근(${clockIn})보다 앞섬`,
		};
	}

	const totalMinutes = Math.floor(diffMs / 1000 / 60);
	const MAX_MINUTES_PER_DAY = 24 * 60;

	if (totalMinutes > MAX_MINUTES_PER_DAY) {
		return {
			totalMinutes: 0,
			hours: 0,
			minutes: 0,
			displayText: '초과오류',
			isEstimate: false,
			isInvalid: true,
			invalidReason: `근무시간 ${totalMinutes}분(${(totalMinutes / 60).toFixed(1)}시간) - 24시간 초과. clock_in=${clockIn}, clock_out=${clockOut}`,
		};
	}

	if (totalMinutes < 1) {
		return {
			totalMinutes: 0,
			hours: 0,
			minutes: 0,
			displayText: '0분',
			isEstimate,
			isInvalid: false,
		};
	}

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	// 빈 문자열 초기값은 곧바로 덮어쓰여 no-useless-assignment가 나므로 분기에서만 대입합니다.
	let displayText: string;
	if (hours > 0 && minutes > 0) {
		displayText = `${hours}시간 ${minutes}분`;
	} else if (hours > 0) {
		displayText = `${hours}시간`;
	} else {
		displayText = `${minutes}분`;
	}

	return {
		totalMinutes,
		hours,
		minutes,
		displayText,
		isEstimate,
		isInvalid: false,
	};
}

/**
 * 기본급 = (총 근무 분 / 60) × 시급, 원 단위 반올림
 */
export function calculatePay(
	clockIn: string | null,
	clockOut: string | null,
	hourlyWage: number
): PayCalcResult {
	const duration = calculateWorkDuration(clockIn, clockOut);

	let basePay: number;
	let debugLog: string;

	if (duration.isInvalid) {
		debugLog = `[오류] ${duration.invalidReason}`;
		basePay = 0;
	} else if (duration.totalMinutes === 0) {
		debugLog = `[정상] 근무시간 0분 → 급여 0원`;
		basePay = 0;
	} else {
		const hoursDecimal = duration.totalMinutes / 60;
		basePay = Math.round(hoursDecimal * hourlyWage);
		debugLog = [
			`[정상] 계산 과정:`,
			`  출근: ${clockIn}`,
			`  퇴근: ${clockOut ?? '(근무중)'}`,
			`  총 근무: ${duration.totalMinutes}분 (${hoursDecimal.toFixed(4)}시간)`,
			`  시급: ${hourlyWage.toLocaleString()}원`,
			`  기본급: ${hoursDecimal.toFixed(4)} × ${hourlyWage.toLocaleString()} = ${basePay.toLocaleString()}원`,
			duration.isEstimate ? '  ⚠️ 예상 금액 (근무 중)' : '',
		]
			.filter(Boolean)
			.join('\n');
	}

	const MAX_DAILY_PAY = hourlyWage * 24 * 2;
	if (basePay > MAX_DAILY_PAY) {
		debugLog += `\n[경고] 일급 ${basePay.toLocaleString()}원이 상한(${MAX_DAILY_PAY.toLocaleString()}원)을 초과하여 0원 처리`;
		basePay = 0;
	}

	return {
		workDuration: duration,
		basePay,
		displayPay:
			basePay > 0
				? `${basePay.toLocaleString()}원`
				: duration.isInvalid
					? '-'
					: '0원',
		hourlyWage,
		debugLog,
	};
}

/**
 * 특정 연월의 주(일~토) 경계를 KST 기준으로 반환한다.
 * - 주 시작(일요일)이 해당 월에 속한 주만 포함
 * - 반환 Date는 UTC 객체이며, 내부 시점은 KST 경계를 나타낸다.
 */
export function getWeekBoundaries(year: number, month: number): Array<{ weekStart: Date; weekEnd: Date }> {
	const result: Array<{ weekStart: Date; weekEnd: Date }> = [];
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

	for (let day = 1; day <= daysInMonth; day++) {
		// KST 자정(00:00)을 UTC Date로 고정 생성한다.
		const kstMidnightUtc = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
		const kstDayOfWeek = new Date(kstMidnightUtc.getTime() + KST_OFFSET_MS).getUTCDay();
		if (kstDayOfWeek !== 0) continue;

		const weekStart = kstMidnightUtc;
		// weekEnd는 "다음 주 일요일 00:00 KST" 경계로 둔다(비교식: weekStart <= t < weekEnd).
		const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
		result.push({ weekStart, weekEnd });
	}

	return result;
}

/**
 * 특정 주(일~토)에 대한 한 직원의 주휴수당 발생 여부와 금액을 계산한다.
 */
export function calculateWeeklyAllowance(
	timecards: Array<{ clock_in: string; clock_out: string | null }>,
	hourlyWage: number,
	weeklyContractedDays: number,
	weekStart: Date,
	weekEnd: Date
): WeeklyAllowanceResult {
	const weeklyTimecards = timecards.filter((card) => {
		const clockIn = parseUtc(card.clock_in);
		return clockIn.getTime() >= weekStart.getTime() && clockIn.getTime() < weekEnd.getTime();
	});

	if (weeklyTimecards.some((card) => card.clock_out === null)) {
		return {
			allowance: 0,
			totalHours: 0,
			actualDays: 0,
			qualifies: false,
			reason: '미확정 근무 포함',
		};
	}

	let totalMinutes = 0;
	for (const card of weeklyTimecards) {
		const inTime = parseUtc(card.clock_in);
		const outTime = parseUtc(card.clock_out as string);
		const diffMinutes = Math.floor((outTime.getTime() - inTime.getTime()) / 60000);

		// 음수 또는 24시간 초과 근무는 비정상 데이터로 보고 0분 처리한다.
		if (diffMinutes < 0 || diffMinutes > 1440) continue;
		totalMinutes += diffMinutes;
	}

	const totalHours = Number((totalMinutes / 60).toFixed(2));
	const uniqueKstDays = new Set(
		weeklyTimecards.map((card) =>
			parseUtc(card.clock_in).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
		)
	);
	const actualDays = uniqueKstDays.size;

	if (totalHours < 15) {
		return {
			allowance: 0,
			totalHours,
			actualDays,
			qualifies: false,
			reason: '15시간 미만',
		};
	}

	if (actualDays < weeklyContractedDays) {
		return {
			allowance: 0,
			totalHours,
			actualDays,
			qualifies: false,
			reason: '개근 미충족',
		};
	}

	const cappedHours = Math.min(totalHours, 40);
	const allowance = Math.round((cappedHours / 40) * 8 * hourlyWage);
	return {
		allowance,
		totalHours,
		actualDays,
		qualifies: true,
		reason: '',
	};
}

/**
 * 특정 월 전체의 주휴수당 합계와 주차별 상세 내역을 계산한다.
 */
export function calculateMonthlyAllowance(
	timecards: Array<{ clock_in: string; clock_out: string | null }>,
	hourlyWage: number,
	weeklyContractedDays: number,
	year: number,
	month: number
): MonthlyAllowanceResult {
	const weekBoundaries = getWeekBoundaries(year, month);

	const weeklyBreakdown = weekBoundaries.map(({ weekStart, weekEnd }, index) => {
		const weekly = calculateWeeklyAllowance(
			timecards,
			hourlyWage,
			weeklyContractedDays,
			weekStart,
			weekEnd
		);

		return {
			weekLabel: `${month}월 ${index + 1}주차`,
			weekStart: weekStart.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
			...weekly,
		};
	});

	const totalAllowance = weeklyBreakdown
		.filter((week) => week.qualifies)
		.reduce((sum, week) => sum + week.allowance, 0);

	return {
		totalAllowance,
		weeklyBreakdown,
	};
}

/** 근무 분 → 한국어 표기 */
export function formatWorkHours(totalMinutes: number): string {
	if (totalMinutes <= 0) return '0분';
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	if (h > 0 && m > 0) return `${h}시간 ${m}분`;
	if (h > 0) return `${h}시간`;
	return `${m}분`;
}

/**
 * 타임카드 수동 저장/수정 전 유효성 검사
 * - 필수값(출근/퇴근) 존재 여부
 * - 퇴근이 출근보다 늦는지 여부
 * @param dateStr - DB date 컬럼 (예: "2026-03-30")
 * @param clockIn - clock_in (UTC ISO 권장)
 * @param clockOut - clock_out 또는 null(출근만)
 */
export function validateTimecard(
	dateStr: string,
	clockIn: string,
	clockOut: string | null
): { valid: boolean; message: string } {
	if (!dateStr || !clockIn || !clockOut) {
		return { valid: false, message: '출근/퇴근 시간을 모두 입력해 주세요.' };
	}

	const inMs = new Date(clockIn).getTime();
	const outMs = new Date(clockOut).getTime();
	if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) {
		return { valid: false, message: '출퇴근 시간 형식이 올바르지 않습니다.' };
	}
	if (outMs <= inMs) {
		return { valid: false, message: '퇴근 시간이 출근 시간보다 빠릅니다.' };
	}

	return { valid: true, message: '' };
}
