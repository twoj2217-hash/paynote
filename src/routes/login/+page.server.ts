import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** 이미 로그인된 경우 대시보드로 보냄 */
export const load: PageServerLoad = async ({ locals: { user } }) => {
	if (user) {
		throw redirect(303, '/dashboard');
	}
	return {};
};
