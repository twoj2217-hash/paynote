/** 2026년 법정 최저시급 (고용노동부, 2026-01-01 ~ 2026-12-31 적용): 시간급 10,320원 */
export const MIN_HOURLY_WAGE = 10_320;

export interface WorkRecord {
  clockIn: Date;
  clockOut: Date;
  hourlyWage: number;
}

export interface PayrollResult {
  regularHours: number;   // 기본 근무시간
  overtimeHours: number;  // 초과 근무시간 (8시간 초과)
  regularPay: number;     // 기본급
  overtimePay: number;    // 초과수당 (1.5배)
  totalPay: number;       // 합계
  weeklyAllowance: number; // 주휴수당
}

/**
 * 단일 근무 기록의 급여 계산
 * - 8시간 초과분은 1.5배 적용
 */
export function calculateShiftPay(record: WorkRecord): PayrollResult {
  const diffMs = record.clockOut.getTime() - record.clockIn.getTime();
  const totalHours = diffMs / (1000 * 60 * 60);

  const regularHours = Math.min(totalHours, 8);
  const overtimeHours = Math.max(totalHours - 8, 0);

  const regularPay = regularHours * record.hourlyWage;
  const overtimePay = overtimeHours * record.hourlyWage * 1.5;
  const totalPay = regularPay + overtimePay;

  return {
    regularHours: Math.round(regularHours * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    regularPay: Math.round(regularPay),
    overtimePay: Math.round(overtimePay),
    totalPay: Math.round(totalPay),
    weeklyAllowance: 0,
  };
}

/**
 * 주간 근무 기록 기반 주휴수당 계산
 * 조건: 주 15시간 이상 근무 시 (1일치 임금 지급)
 */
export function calculateWeeklyAllowance(
  weeklyHours: number,
  hourlyWage: number
): number {
  if (weeklyHours < 15) return 0;
  // 주휴수당 = 1일 소정근로시간 × 시급 (주 5일 기준: weeklyHours / 5)
  const dailyHours = weeklyHours / 5;
  return Math.round(dailyHours * hourlyWage);
}

/** YYYY-MM-DD 달력일에 일수 더하기 (UTC 정오 기준, KST 달력일 안정 처리) */
export function addDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0);
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** KST 근무일(YYYY-MM-DD)이 속한 주의 월요일 YYYY-MM-DD */
export function mondayOfWeekForKstDate(ymd: string): string {
  const [Y, M, D] = ymd.split('-').map(Number);
  const t = Date.UTC(Y, M - 1, D, 12, 0, 0);
  const dow = new Date(t).getUTCDay();
  const diffToMon = (dow + 6) % 7;
  return addDaysToYmd(ymd, -diffToMon);
}

/** 월 범위(from~to)와 겹치는 '월~일' 주의 일수 (1~7) — 주휴 일할 비율 분모용 */
export function countWeekDaysInMonthRange(
  mondayYmd: string,
  rangeFrom: string,
  rangeTo: string
): number {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDaysToYmd(mondayYmd, i);
    if (day >= rangeFrom && day <= rangeTo) n++;
  }
  return n;
}

/** 날짜별 근무시간 배열로, 해당 월(KST from~to) 주휴수당 합계 */
export function sumWeeklyHolidayPayForMonthRange(
  dateHours: { date: string; hours: number }[],
  hourlyWage: number,
  monthFrom: string,
  monthTo: string
): number {
  const byWeek = new Map<string, number>();
  for (const { date, hours } of dateHours) {
    const mon = mondayOfWeekForKstDate(date);
    byWeek.set(mon, (byWeek.get(mon) ?? 0) + hours);
  }
  let total = 0;
  for (const [monday, weekHours] of byWeek) {
    if (weekHours <= 15) continue;
    const ratio = countWeekDaysInMonthRange(monday, monthFrom, monthTo) / 7;
    if (ratio <= 0) continue;
    const fullWeekAllowance = calculateWeeklyAllowance(weekHours, hourlyWage);
    total += Math.round(fullWeekAllowance * ratio);
  }
  return total;
}

/** 해당 월에 주 15시간 초과 주가 하나라도 있으면 true */
export function hasAnyWeeklyHolidayQualifyingWeek(
  dateHours: { date: string; hours: number }[]
): boolean {
  const byWeek = new Map<string, number>();
  for (const { date, hours } of dateHours) {
    const mon = mondayOfWeekForKstDate(date);
    byWeek.set(mon, (byWeek.get(mon) ?? 0) + hours);
  }
  for (const h of byWeek.values()) {
    if (h > 15) return true;
  }
  return false;
}

/**
 * 최저시급 위반 여부 확인
 */
export function checkMinWageViolation(hourlyWage: number): boolean {
  return hourlyWage < MIN_HOURLY_WAGE;
}

/**
 * 시간(분) → "HH:MM" 형식 변환
 */
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}시간 ${m > 0 ? m + '분' : ''}`.trim();
}
