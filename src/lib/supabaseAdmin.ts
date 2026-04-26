import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// RLS를 우회하는 서비스 역할 클라이언트
// ⚠️ +server.ts 또는 +page.server.ts 에서만 import할 것
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
