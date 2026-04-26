import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Supabase 이메일/OAuth 등에서 돌아오는 인증 콜백: code 교환 후 리다이렉트 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('next') ?? '/dashboard';

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			// 비밀번호 재설정 흐름이면 재설정 페이지로
			const type = url.searchParams.get('type');
			if (type === 'recovery') {
				throw redirect(303, '/auth/reset-password');
			}
			throw redirect(303, next);
		}
	}

	// 오류 발생 시 로그인 페이지로
	throw redirect(303, '/login?error=링크가 만료되었거나 유효하지 않습니다.');
};
