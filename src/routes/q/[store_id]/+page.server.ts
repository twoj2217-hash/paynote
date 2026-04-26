import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { supabaseAdmin } from '$lib/supabaseAdmin';
import { verifyPin } from '$lib/security/pin';

type PinAttemptResult = {
	status: 'locked' | 'wrong_pin' | 'ok';
	locked_until?: string | null;
	fail_count?: number;
};

export const actions: Actions = {
	/** PIN 검증 — 브루트포스 방어 포함 */
	verify: async ({ request, params, getClientAddress }) => {
		const formData = await request.formData();
		const pin = formData.get('pin')?.toString() ?? '';
		const employeeId = formData.get('employeeId')?.toString() ?? '';

		if (!pin || !employeeId) {
			return fail(400, { error: 'PIN과 직원 정보를 입력해주세요.' });
		}

		// 직원 PIN 조회
		const { data: employee } = await supabaseAdmin
			.from('employees')
			.select('id, pin_code')
			.eq('id', employeeId)
			.eq('store_id', params.store_id)
			.maybeSingle();

		if (!employee) {
			return fail(400, { error: '직원 정보를 찾을 수 없습니다.' });
		}

		const isCorrect = await verifyPin(pin, employee.pin_code);

		// ── C-01 v3: IP 추출 ──────────────────────────────
		// getClientAddress()는 플랫폼 제공 신뢰 IP, 헤더는 조작 가능성 있으므로 fallback만
		let clientIp: string;
		try {
			clientIp = getClientAddress();
		} catch {
			clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
		}

		// ── C-01 v3: RPC 호출 ─────────────────────────────
		const { data: attemptResult, error: rpcError } = await supabaseAdmin.rpc('check_pin_attempt', {
			p_store_id: params.store_id,
			p_ip: clientIp,
			p_pin_correct: isCorrect
		});

		if (rpcError) {
			console.error('[C-01] RPC 오류:', rpcError.message);
			return fail(500, { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
		}

		const attemptResultData = attemptResult as PinAttemptResult | null;

		if (attemptResultData?.status === 'locked') {
			const lockedUntil = new Date(attemptResultData.locked_until ?? Date.now());
			// UTC끼리 비교 — KST 오프셋 가산 금지
			const diffMin = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
			return fail(429, {
				error: `PIN 오류 횟수가 초과되었습니다. ${diffMin}분 후 다시 시도해주세요.`
			});
		}

		if (attemptResultData?.status === 'wrong_pin') {
			const failCount = attemptResultData.fail_count ?? 0;
			const remaining = 5 - failCount;
			return fail(401, {
				error:
					remaining > 0
						? `PIN이 올바르지 않습니다. (${remaining}회 남음)`
						: 'PIN이 올바르지 않습니다.'
			});
		}

		return { success: true, employeeId: employee.id };
	}
};
