import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
  // 인증 확인
  if (!locals.user) return json({ sessions: [] }, { status: 401 });

  // 본인 매장 id 확인
  const { data: storeRow } = await locals.supabase
    .from('stores')
    .select('id')
    .eq('owner_id', locals.user.id)
    .maybeSingle();

  if (!storeRow) return json({ sessions: [] });

  // 최근 1년, 각 세션의 첫 번째 user 메시지만 조회
  const oneYearAgo = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: rows } = await locals.supabase
    .from('chat_history')
    .select('session_id, content, created_at')
    .eq('store_id', storeRow.id)
    .eq('role', 'user')
    .gte('created_at', oneYearAgo)
    .order('created_at', { ascending: false });

  // session_id 기준 중복 제거 (첫 메시지만 대표로)
  const seen = new Set<string>();
  const sessions = (rows ?? []).filter(r => {
    if (seen.has(r.session_id)) return false;
    seen.add(r.session_id);
    return true;
  });

  return json({ sessions });
};
