import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** 브라우저 전용 — 쿠키 기반 세션과 hooks.server의 서버 클라이언트가 동기화됨 */
export const supabase: SupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
