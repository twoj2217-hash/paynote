import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/** 로그인·직원 QR 등 인증 없이 접근 가능한 경로 */
function isPublicPath(pathname: string): boolean {
	return (
		pathname === '/login' ||
		pathname === '/reset-password' ||
		pathname === '/auth/reset-password' ||
		pathname.startsWith('/auth/callback') ||
		pathname.startsWith('/auth/') ||
		pathname.startsWith('/q/')
	);
}

export const load: LayoutServerLoad = async ({ url, locals: { supabase, user, session } }) => {
	if (isPublicPath(url.pathname)) {
		return {
			hideNav: true,
			storeId: null,
			user: null,
			session: null
		};
	}

	if (!user) {
		throw redirect(303, '/login');
	}

	const { data: store, error: storeError } = await supabase
		.from('stores')
		.select('id')
		.eq('owner_id', user.id)
		.maybeSingle();

	if (storeError) {
		console.error('stores 조회 오류:', storeError);
		throw error(500, '매장 정보를 불러오지 못했습니다.');
	}

	if (!store) {
		throw error(
			403,
			'이 계정에 연결된 매장이 없습니다. Supabase의 stores 테이블에 owner_id를 본인 user id로 설정한 행을 추가해 주세요.'
		);
	}

	return {
		hideNav: false,
		storeId: store.id,
		user,
		session: session ?? null
	};
};
