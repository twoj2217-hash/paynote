import { createServerClient } from '@supabase/ssr';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Handle } from '@sveltejs/kit';

/** Vite/SvelteKit에서 서버 훅에도 VITE_ 접두사 환경 변수 사용 가능 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * 서버에서 JWT를 검증한 뒤 user/session 반환
 * (getSession만 사용하면 변조된 쿠키를 믿을 수 있어 getUser 우선)
 */
async function safeGetSession(supabase: SupabaseClient): Promise<{
	session: Session | null;
	user: User | null;
}> {
	const {
		data: { user },
		error: userError
	} = await supabase.auth.getUser();

	if (userError || !user) {
		return { session: null, user: null };
	}

	const {
		data: { session }
	} = await supabase.auth.getSession();

	return { session, user };
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	event.locals.safeGetSession = () => safeGetSession(event.locals.supabase);

	// 요청 단위로 검증된 세션·유저를 locals에 고정 (load 함수에서 재사용)
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
