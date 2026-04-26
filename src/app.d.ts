import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

// Vite 클라이언트 환경 변수 (import.meta.env)
interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL: string;
	readonly VITE_SUPABASE_ANON_KEY: string;
}

// Vite import.meta.env 병합용 — 이름만으로 ESLint가 미사용으로 오탐할 수 있음
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 전역 ImportMeta 확장
interface ImportMeta {
	readonly env: ImportMetaEnv;
}

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			/** timecards, payroll 등 +page.server에서 parent()로 전달 */
			storeId?: string;
		}
		interface LayoutData {
			hideNav: boolean;
			storeId: string | null;
			user: User | null;
			session: Session | null;
		}
		// interface Platform {}
	}
}

export {};
