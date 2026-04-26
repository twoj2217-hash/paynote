import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ messages: [] }, { status: 401 });

  const { data: storeRow } = await locals.supabase
    .from('stores')
    .select('id')
    .eq('owner_id', locals.user.id)
    .maybeSingle();

  if (!storeRow) return json({ messages: [] });

  const { data: messages } = await locals.supabase
    .from('chat_history')
    .select('role, content, created_at')
    .eq('store_id', storeRow.id)
    .eq('session_id', params.session_id)
    .order('created_at', { ascending: true });

  return json({ messages: messages ?? [] });
};
