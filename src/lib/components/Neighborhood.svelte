<script lang="ts">
	import { MapPin } from 'lucide-svelte';

	let { currentMonth = '' } = $props<{ currentMonth?: string }>();

	// 복구 기준선(3-1): 인터랙션/서버 연동 없이 정적 안내 화면만 유지합니다.
	const anonymousStores = [
		{ id: 'a1', cx: 20, cy: 24 },
		{ id: 'a2', cx: 36, cy: 32 },
		{ id: 'a3', cx: 64, cy: 26 },
		{ id: 'a4', cx: 54, cy: 58 },
		{ id: 'a5', cx: 80, cy: 48 }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<MapPin class="w-5 h-5 text-[#2563eb]" />
			<h2 class="text-lg font-bold text-gray-900">사장님 골목</h2>
		</div>
		<span class="text-xs text-gray-400">{currentMonth || '현재 월'} 기준</span>
	</div>
	<p class="text-sm text-gray-500">우리 동네 카페들과 비교해보세요</p>

	<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
		<!-- 3-1 화면 구성에 맞춘 정적 SVG 지도 -->
		<div class="w-full rounded-xl bg-slate-50 p-2">
			<svg viewBox="0 0 100 72" class="w-full h-auto" role="img" aria-label="사장님 골목 정적 지도">
				<rect x="0" y="0" width="100" height="72" rx="6" fill="#f8fafc" />
				{#each anonymousStores as store}
					<circle cx={store.cx} cy={store.cy} r="2.4" fill="#d1d5db" />
				{/each}
				<!-- 내 가게는 파란색 별 모양으로만 표시 -->
				<path d="M49.8 39.5l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#2563eb" />
				<text x="50" y="57" text-anchor="middle" class="fill-[#2563eb] text-[4px] font-semibold">내 가게</text>
			</svg>
		</div>
		<div class="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
			<p class="text-xs text-blue-700">이 가게: 인건비율 28% · 직원 2명 · 평점 4.1</p>
		</div>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<p class="text-xs text-gray-400 mb-1">내 가게 위치</p>
			<p class="text-lg font-bold text-gray-900">인건비율 상위 35%</p>
		</div>
		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<p class="text-xs text-gray-400 mb-1">인건비율</p>
			<p class="text-lg font-bold text-gray-900">28%</p>
		</div>
		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<p class="text-xs text-gray-400 mb-1">평균시급 / 주휴수당 준수율</p>
			<p class="text-lg font-bold text-gray-900">11,000원 / 92%</p>
		</div>
	</div>

	<div class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
		<p class="text-sm text-amber-700">안내: 현재 사장님 골목 기능은 안정화 작업 중입니다. 정식 인터랙션은 순차적으로 다시 제공됩니다.</p>
	</div>
</div>
