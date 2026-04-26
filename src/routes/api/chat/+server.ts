import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import Anthropic from '@anthropic-ai/sdk';

interface ChatMessage {
	role: 'user' | 'assistant';
	content: string;
}

function getKstYearMonth(): string {
	// KST 기준 YYYY-MM 문자열을 만들어 월별 사용량 리셋 기준으로 사용합니다.
	return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// 로그인 사용자만 챗봇을 사용할 수 있도록 서버에서 차단합니다.
	if (!locals.user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	if (!ANTHROPIC_API_KEY) {
		return json({ error: '서버 설정 오류: API 키가 없습니다.' }, { status: 500 });
	}

	const body = await request.json().catch(() => null);
	const message = typeof body?.message === 'string' ? body.message.trim() : '';
	const chatHistory = Array.isArray(body?.chatHistory) ? (body.chatHistory as ChatMessage[]) : [];
	const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : undefined;

	if (!message) {
		return json({ error: '질문 내용을 입력해 주세요.' }, { status: 400 });
	}

	// owner_id 기준으로 현재 사용자 매장 id만 조회합니다.
	console.log('[DEBUG] locals.user:', locals.user?.id, '/ locals.session:', !!locals.session);
	const { data: storeRow, error: storeError } = await locals.supabase
		.from('stores')
		.select('id')
		.eq('owner_id', locals.user.id)
		.maybeSingle();

	console.log('[DEBUG] storeRow:', storeRow, '/ storeError:', storeError);

	if (storeError || !storeRow) {
		return json({ error: '매장 정보를 찾을 수 없습니다.' }, { status: 403 });
	}

	const thisMonth = getKstYearMonth();
	// RPC에서 KST 기준 월 사용량 증가와 한도 체크를 한 번에 처리합니다.
	const { data: usageData, error: usageError } = await locals.supabase.rpc(
		'increment_chatbot_usage',
		{
			p_store_id: storeRow.id,
			p_this_month: thisMonth
		}
	);

	console.log('[DEBUG] usageData:', JSON.stringify(usageData), '/ usageError:', usageError);

	if (usageError || !Array.isArray(usageData) || !usageData[0]) {
		return json({ error: '사용량 확인 중 오류가 발생했습니다.' }, { status: 500 });
	}

	if (usageData[0].success === false) {
		return json(
			{
				error: '이번 달 무료 자문 횟수(10회)를 모두 사용했습니다.',
				usageCount: usageData[0].usage_count
			},
			{ status: 429 }
		);
	}

	const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
	const normalizedHistory = chatHistory
		.filter(
			(item): item is ChatMessage =>
				(item?.role === 'user' || item?.role === 'assistant') &&
				typeof item?.content === 'string' &&
				item.content.trim().length > 0
		)
		.map((item) => ({ role: item.role, content: item.content.trim() }));

	const apiMessages = [...normalizedHistory, { role: 'user' as const, content: message }];

	try {
		const response = await anthropic.messages.create({
			model: 'claude-haiku-4-5-20251001',
			max_tokens: 500,
			system:
				'당신은 한국의 카페/요식업 소상공인을 위한 노무 안내 도우미입니다.\n주휴수당, 최저임금, 연장근로, 사회보험 등 기본적인 노무 개념을 쉽게 설명해 주세요.\n단, 최저임금 금액, 보험 요율 등 구체적인 수치는 반드시 고용노동부(moel.go.kr) 공식 사이트에서 확인하세요 라고 안내하세요.\n모든 답변은 한국어로, 사장님이 이해하기 쉬운 말로 작성하세요.\n200자 내외로 간결하게 답변하세요.\n절대로 마크다운 문법(**굵게**, *기울임*, ## 제목 등)을 사용하지 마세요. 일반 텍스트로만 답변하세요.',
			messages: apiMessages
		});

		const answerText =
			response.content
				.filter((block) => block.type === 'text')
				.map((block) => block.text)
				.join('\n')
				.trim() || '답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';

		// ── 대화 이력 저장 (chat_history) ──────────────────
		try {
			if (sessionId && storeRow?.id) {
				// 오래된 이력 자동 정리 (1년 초과분 삭제)
				await locals.supabase
					.from('chat_history')
					.delete()
					.eq('store_id', storeRow.id)
					.lt(
						'created_at',
						new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
					);

				// 이번 대화 쌍 저장 (user 질문 + assistant 응답)
				await locals.supabase.from('chat_history').insert([
					{
						store_id: storeRow.id,
						session_id: sessionId,
						role: 'user',
						content: message
					},
					{
						store_id: storeRow.id,
						session_id: sessionId,
						role: 'assistant',
						content: answerText
					}
				]);
			}
		} catch {
			// 저장 실패해도 응답은 그대로 진행
		}
		// ── 저장 끝 ────────────────────────────────────────

		return json({
			reply: answerText,
			usageCount: usageData[0].usage_count
		});
	} catch (error) {
		console.error('Claude API 오류:', error);
		return json({ error: '노무 상담 응답 생성 중 오류가 발생했습니다.' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	// 로그인 사용자만 현재 사용량을 조회할 수 있습니다.
	if (!locals.user) {
		return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	}

	const { data: storeRow, error: storeError } = await locals.supabase
		.from('stores')
		.select('id, chatbot_usage_this_month, chatbot_usage_reset_month')
		.eq('owner_id', locals.user.id)
		.maybeSingle();

	if (storeError || !storeRow) {
		return json({ error: '매장 정보를 찾을 수 없습니다.' }, { status: 403 });
	}

	const thisMonth = getKstYearMonth();
	// KST 기준 현재 월과 저장된 리셋 월이 다르면 화면상 사용량은 0으로 봅니다.
	const usageCount =
		storeRow.chatbot_usage_reset_month === thisMonth
			? (storeRow.chatbot_usage_this_month ?? 0)
			: 0;

	return json({ usageCount });
};
