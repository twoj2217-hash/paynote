import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
	// 복구 단계에서는 서버 집계/업서트를 막아 DB 쓰기 경로를 차단합니다.
	return json(
		{
			error: '사장님 골목 기능을 점검 중입니다. 잠시 후 다시 이용해 주세요.',
			code: 'BENCHMARK_TEMP_DISABLED',
		},
		{ status: 503 }
	);
};
