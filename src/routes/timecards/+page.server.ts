import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** 레이아웃에서 내려온 storeId를 페이지 data에 명시 (타입·가드) */
export const load: PageServerLoad = async ({ parent }) => {
	const { storeId } = await parent();
	if (!storeId) {
		throw error(500, 'storeId가 없습니다.');
	}
	return { storeId };
};

export const actions: Actions = {
	/** 타임카드 출퇴근 시각 수정 */
	updateTimecard: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: '로그인이 필요합니다.' });
		}

		const fd = await request.formData();
		const id = fd.get('timecardId')?.toString()?.trim();
		const date = fd.get('date')?.toString()?.trim();
		const clockIn = fd.get('clock_in')?.toString()?.trim();
		const clockOutRaw = fd.get('clock_out')?.toString()?.trim();
		const clockOut = clockOutRaw && clockOutRaw.length > 0 ? clockOutRaw : null;
		const reason = fd.get('reason')?.toString()?.trim();

		// 필수값 검증: 출근/퇴근/사유 모두 있어야 저장 가능
		if (!id || !date || !clockIn || !clockOut || !reason) {
			return fail(400, { error: '필수 값이 누락되었습니다.' });
		}

		// 시간 역전 검증: 퇴근이 출근보다 빠르면 차단
		const inMs = new Date(clockIn).getTime();
		const outMs = new Date(clockOut).getTime();
		if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) {
			return fail(400, { error: '출퇴근 시간 형식이 올바르지 않습니다.' });
		}
		if (outMs <= inMs) {
			return fail(400, { error: '퇴근 시간이 출근 시간보다 빠릅니다.' });
		}

		const { data: store, error: storeErr } = await locals.supabase
			.from('stores')
			.select('id')
			.eq('owner_id', locals.user.id)
			.maybeSingle();

		if (storeErr || !store?.id) {
			return fail(403, { error: '매장 정보를 찾을 수 없습니다.' });
		}

		const { data: row, error: rowErr } = await locals.supabase
			.from('timecards')
			.select('id, employee_id, date, clock_in, clock_out, employee:employees!inner(store_id)')
			.eq('id', id)
			.maybeSingle();

		if (rowErr || !row) {
			return fail(404, { error: '타임카드를 찾을 수 없습니다.' });
		}

		// Supabase 타입이 employee를 배열로 추론할 수 있어 단일 행으로 정규화
		const rawEmp = row.employee as { store_id: string } | { store_id: string }[] | null;
		const employee = Array.isArray(rawEmp) ? rawEmp[0] : rawEmp;
		if (!employee || employee.store_id !== store.id) {
			return fail(403, { error: '이 기록을 수정할 권한이 없습니다.' });
		}

		const { error: upErr } = await locals.supabase
			.from('timecards')
			.update({ clock_in: clockIn, clock_out: clockOut, date })
			.eq('id', id);

		if (upErr) {
			return fail(500, { error: '저장 중 오류가 발생했습니다: ' + upErr.message });
		}

		// 관리자 수동 정정 감사 이력 저장 (누가/언제/왜/무엇을)
		const { error: auditErr } = await locals.supabase.from('timecard_adjustments').insert({
			timecard_id: id,
			employee_id: row.employee_id,
			store_id: employee.store_id,
			before_date: row.date,
			before_clock_in: row.clock_in,
			before_clock_out: row.clock_out,
			after_date: date,
			after_clock_in: clockIn,
			after_clock_out: clockOut,
			reason,
			updated_by: locals.user.id,
		});

		if (auditErr) {
			return fail(500, { error: '정정 이력 저장 중 오류가 발생했습니다: ' + auditErr.message });
		}

		return { success: true };
	},
};
