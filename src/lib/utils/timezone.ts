/**
 * KST(Asia/Seoul) 기준 시간 유틸
 * UTC에 +9시간 산술 금지 — 표시·날짜 자름은 Intl timeZone 사용
 */

const TZ = 'Asia/Seoul';

/**
 * DB에서 가져온 타임스탬프 문자열을 UTC Date로 파싱
 * Supabase timestamp/timestamptz가 'Z' 없이 반환될 수 있으므로 UTC로 강제 해석
 */
export function parseUtc(s: string): Date {
	if (!s) return new Date(NaN);
	// 'Z', '+HH:MM', '-HH:MM' 등 타임존 표시가 없는 ISO 문자열이면 UTC('Z') 추가
	if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) {
		return new Date(s + 'Z');
	}
	return new Date(s);
}

/** 현재 순간 (브라우저/서버 공통, 내부는 UTC epoch) */
export function getKSTNow(): Date {
	return new Date();
}

/** 오늘 날짜 YYYY-MM-DD (KST 달력) */
export function getKSTTodayYmd(): string {
	return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * 임의 시각을 KST 기준 YYYY-MM-DD로 변환
 */
export function formatKSTDate(date: Date): string {
	return date.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * 임의 시각을 KST 기준 HH:mm (24h)
 */
/** KST 시·분 (숫자) — 수동 입력 초기값용 */
export function getKSTHourMinute(d: Date): { hour: number; minute: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		hour: 'numeric',
		minute: 'numeric',
		hour12: false,
	}).formatToParts(d);
	const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
	const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
	return { hour, minute };
}

export function formatKSTTime(date: Date): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(date);
	const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
	const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
	return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * DB에 넣을 ISO 문자열 (순간 그대로)
 */
export function toDbIso(date: Date): string {
	return date.toISOString();
}

/**
 * KST 달력 날짜 + 시·분으로 절대 시각 (한국 법정시 +09:00)
 */
export function buildKSTDateTime(dateYmd: string, hour: number, minute: number): Date {
	const h = String(hour).padStart(2, '0');
	const min = String(minute).padStart(2, '0');
	return new Date(`${dateYmd}T${h}:${min}:00+09:00`);
}

/**
 * datetime-local 문자열(브라우저 로컬 해석) — 한국에서만 KST와 일치
 * 해외 브라우저에서는 로컬 기준이므로, 관리용 앱은 한국 사용 전제
 */
export function parseDatetimeLocalValue(value: string): Date {
	return new Date(value);
}

/**
 * UTC ISO → datetime-local value용 문자열 (KST 시각이 input에 보이도록)
 */
export function isoUtcToDatetimeLocalKstString(iso: string): string {
	const d = parseUtc(iso);
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(d);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? '';
	const y = get('year');
	const mo = get('month').padStart(2, '0');
	const da = get('day').padStart(2, '0');
	const h = get('hour').padStart(2, '0');
	const mi = get('minute').padStart(2, '0');
	return `${y}-${mo}-${da}T${h}:${mi}`;
}

/** datetime-local input 의 max (브라우저 로컬 "지금") */
export function maxDatetimeLocalBrowserNow(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MIN_YMD = '2020-01-01';

/**
 * 출퇴근 시각 검증 (KST 달력 연도·미래 시각)
 */
export function validateClockDateTime(date: Date): string | null {
	const ymd = date.toLocaleDateString('sv-SE', { timeZone: TZ });
	const [y] = ymd.split('-').map(Number);
	if (y < 2020) {
		return '2020년 이후 날짜만 입력 가능합니다';
	}
	const thisYearKst = Number(
		new Date().toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 4)
	);
	if (y > thisYearKst) {
		return '올바르지 않은 날짜입니다';
	}
	if (date.getTime() > Date.now() + 60_000) {
		return '미래 시간은 입력할 수 없습니다';
	}
	if (ymd < MIN_YMD) {
		return '2020년 이후 날짜만 입력 가능합니다';
	}
	return null;
}

export const DATETIME_LOCAL_MIN = '2020-01-01T00:00';

/**
 * Supabase timestamptz(UTC) 문자열 → KST로 포맷된 문자열
 * @param utcDateStr - DB에서 가져온 ISO/timestamptz 문자열
 * @param format - 표시 형식
 */
export function toKST(
	utcDateStr: string | null,
	format: 'time' | 'date' | 'datetime' | 'full' = 'datetime'
): string {
	if (!utcDateStr) return '-';

	const date = parseUtc(utcDateStr);

	if (isNaN(date.getTime())) return '-';

	const options: Intl.DateTimeFormatOptions = {
		timeZone: TZ,
	};

	switch (format) {
		case 'time':
			options.hour = '2-digit';
			options.minute = '2-digit';
			options.hour12 = true;
			break;
		case 'date':
			options.year = 'numeric';
			options.month = '2-digit';
			options.day = '2-digit';
			break;
		case 'datetime':
			options.year = 'numeric';
			options.month = '2-digit';
			options.day = '2-digit';
			options.hour = '2-digit';
			options.minute = '2-digit';
			options.hour12 = true;
			break;
		case 'full':
			options.year = 'numeric';
			options.month = '2-digit';
			options.day = '2-digit';
			options.hour = '2-digit';
			options.minute = '2-digit';
			options.second = '2-digit';
			options.hour12 = false;
			break;
	}

	return date.toLocaleString('ko-KR', options);
}

/**
 * UTC 순간 → KST 달력 기준 YYYY-MM-DD (표시·검증용)
 */
export function toKSTDateString(utcDateStr: string | null): string {
	if (!utcDateStr) return '-';
	const date = parseUtc(utcDateStr);
	if (isNaN(date.getTime())) return '-';
	return formatKSTDate(date);
}

/**
 * KST 기준 해당 월 [시작, 다음 달 시작) 을 UTC ISO 문자열로 반환 — clock_in 등 timestamptz 필터용
 */
export function kstMonthRangeUTC(year: number, month: number): { start: string; end: string } {
	const startKST = new Date(
		`${year}-${String(month).padStart(2, '0')}-01T00:00:00+09:00`
	);
	const endMonth = month === 12 ? 1 : month + 1;
	const endYear = month === 12 ? year + 1 : year;
	const endKST = new Date(
		`${endYear}-${String(endMonth).padStart(2, '0')}-01T00:00:00+09:00`
	);

	return {
		start: startKST.toISOString(),
		end: endKST.toISOString(),
	};
}
