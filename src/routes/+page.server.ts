import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// 초기 클라이언트 렌더를 생략하고 서버에서 즉시 대시보드로 이동시킵니다.
	throw redirect(307, '/dashboard');
};
