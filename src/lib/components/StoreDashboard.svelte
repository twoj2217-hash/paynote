<script lang="ts">
	import { onDestroy } from 'svelte';
	import { TrendingUp, ShoppingCart, Package, Star, Send, X } from 'lucide-svelte';
	import { parseUtc } from '$lib/utils/timezone';
	import { supabase } from '$lib/supabaseClient';
	import type { Chart as ChartJs } from 'chart.js';

	/** sales_records 조회/실시간 페이로드에 맞춘 최소 타입 */
	interface SaleRecord {
		id?: string;
		store_id?: string;
		menu_item_id: string;
		menu_name: string;
		quantity: number;
		unit_price?: number;
		total_amount: number;
		sold_at: string;
	}

	/** menu_items 행 요약 */
	interface MenuItemRow {
		id: string;
		name: string;
		price: number;
		unit: string;
		current_stock: number;
		min_stock: number;
		max_stock: number;
		order_link?: string;
	}

	/** 판매 모달에서 선택한 줄 */
	interface SelectedLine {
		id: string;
		name: string;
		price: number;
		unit: string;
		qty: number;
	}

	// 한글·영문·숫자·공백·기본 특수문자만 허용 (프롬프트 인젝션 방지)
	function sanitizeName(raw: string): string {
		// 문자 클래스 안의 `.`는 이스케이프 불필요(no-useless-escape)
		return raw.replace(/[^가-힣a-zA-Z0-9\s().-]/g, '').trim().slice(0, 30);
	}

	let { menuItems = [], todaySales = [], storeId = '' } = $props<{
		menuItems?: MenuItemRow[];
		todaySales?: SaleRecord[];
		storeId?: string;
	}>();

	// KST 시각 기준으로 시간대 버킷(0~23)에 매출 합산
	function buildHourlyData(sales: SaleRecord[]) {
		const arr = new Array(24).fill(0);
		for (const s of sales) {
			const kstMs = parseUtc(s.sold_at).getTime() + 9 * 3600 * 1000;
			const hr = new Date(kstMs).getUTCHours();
			arr[hr] += s.total_amount;
		}
		return arr;
	}

	function formatTime(date: Date) {
		return date.toLocaleTimeString('ko-KR', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	function formatDate(date: Date) {
		const days = ['일', '월', '화', '수', '목', '금', '토'];
		return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
	}

	function getMinutesAgo(soldAt: string) {
		const diff = Math.floor((Date.now() - parseUtc(soldAt).getTime()) / 60000);
		return diff < 1 ? '방금 전' : diff + '분 전';
	}

	// 부모에서 넘긴 당일 데이터는 최초 스냅샷만 복사하고, 이후는 실시간·로컬 상태로만 갱신
	/* svelte-ignore state_referenced_locally */
	let allSales = $state<SaleRecord[]>([...todaySales]);
	/* svelte-ignore state_referenced_locally */
	let recentSales = $state<SaleRecord[]>([...todaySales].slice(0, 6));
	/* svelte-ignore state_referenced_locally */
	let liveMenuItems = $state<MenuItemRow[]>([...menuItems]);
	let showSaleModal = $state(false);
	let selectedItems = $state<SelectedLine[]>([]);
	let isSaving = $state(false);
	let stockErrorMsg = $state('');
	let stockErrorItems = $state<string[]>([]);
	let currentTime = $state(new Date());
	/* svelte-ignore state_referenced_locally */
	let hourlyData = $state<number[]>(buildHourlyData(todaySales));
	let chartInstance: ChartJs | null = null;
	let isChartReady = $state(false);
	let isBootstrapping = $state(false);
	let showOrderModal = $state(false);
	let orderTargetItem = $state<{ id: string; name: string } | null>(null);
	let orderLinkInput = $state('');
	let isSavingLink = $state(false);
	let isCancellingSaleId = $state<string | null>(null);
	let cancelErrorMsg = $state('');
	let chartModulePromise: Promise<typeof import('chart.js/auto')> | null = null;

	let todayTotal = $derived(allSales.reduce((sum, s) => sum + (s.total_amount ?? 0), 0));
	let txnCount = $derived(allSales.length);
	let avgAmount = $derived(txnCount > 0 ? Math.round(todayTotal / txnCount) : 0);
	let lowStockItems = $derived(liveMenuItems.filter((m) => m.current_stock <= m.min_stock));
	let modalTotal = $derived(selectedItems.reduce((sum, i) => sum + i.price * i.qty, 0));

	let bestItem = $derived.by(() => {
		const map = new Map<string, number>();
		for (const s of allSales) {
			map.set(s.menu_item_id, (map.get(s.menu_item_id) ?? 0) + s.quantity);
		}
		let best: SaleRecord | null = null;
		let max = 0;
		for (const [id, cnt] of map) {
			if (cnt > max) {
				max = cnt;
				best = allSales.find((s) => s.menu_item_id === id) ?? null;
			}
		}
		return best ? { name: best.menu_name, count: max } : null;
	});

	let todaySalesByMenu = $derived.by(() => {
		const map = new Map<string, number>();
		for (const s of allSales) {
			map.set(s.menu_item_id, (map.get(s.menu_item_id) ?? 0) + s.quantity);
		}
		return map;
	});

	// 헤더 시계 1초마다 갱신
	$effect(() => {
		const timer = setInterval(() => {
			currentTime = new Date();
		}, 1000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		// 서버가 가벼운 응답을 내려준 경우, 현황판 데이터는 클라이언트에서 지연 조회합니다.
		if (!storeId || allSales.length > 0 || liveMenuItems.length > 0 || isBootstrapping) return;
		isBootstrapping = true;
		void (async () => {
			try {
				const todayKst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
				const { data: menuRows } = await supabase
					.from('menu_items')
					.select('*')
					.eq('store_id', storeId)
					.eq('is_active', true)
					.order('display_order');
				const { data: saleRows } = await supabase
					.from('sales_records')
					.select('*')
					.eq('store_id', storeId)
					.gte('sold_at', `${todayKst}T00:00:00+09:00`)
					.order('sold_at', { ascending: false });
				liveMenuItems = menuRows ?? [];
				allSales = saleRows ?? [];
				recentSales = allSales.slice(0, 6);
				hourlyData = buildHourlyData(allSales);
			} finally {
				isBootstrapping = false;
			}
		})();
	});

	// 컴포넌트 unmount 시 차트 인스턴스 확실히 파괴
	onDestroy(() => {
		chartInstance?.destroy();
		chartInstance = null;
	});

	// --- Chart.js: Svelte Action으로 lifecycle 관리 ---
	// canvas가 DOM에 마운트될 때 1회만 차트 생성, 언마운트 시 자동 파괴
	async function getChartModule() {
		if (!chartModulePromise) {
			// 차트 라이브러리는 실제 캔버스를 그릴 때만 로드합니다.
			chartModulePromise = import('chart.js/auto');
		}
		return chartModulePromise;
	}

	function chartAction(canvas: HTMLCanvasElement) {
		let disposed = false;

		void (async () => {
			const { default: Chart } = await getChartModule();
			if (disposed) return;
			// 이중 마운트(SSR→CSR) 방어: 혹시 남은 인스턴스 제거
			const existing = Chart.getChart(canvas);
			if (existing) existing.destroy();

			const curHr = new Date().getHours();
			const snapshot = [...hourlyData];
			const colors = snapshot.map((_: number, i: number) =>
				i === curHr ? '#1E40AF' : 'rgba(30,64,175,0.30)'
			);

			chartInstance = new Chart(canvas, {
				type: 'bar',
				data: {
					labels: Array.from({ length: 24 }, (_, i) => i + '시'),
					datasets: [
						{
							label: '매출',
							data: snapshot,
							backgroundColor: colors,
							borderRadius: 3,
							borderSkipped: false
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: {
						legend: { display: false },
						tooltip: {
							callbacks: {
								label: (c) => Number(c.raw).toLocaleString('ko-KR') + '원'
							}
						}
					},
					scales: {
						x: {
							ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 9 },
							grid: { display: false }
						},
						y: {
							ticks: {
								font: { size: 9 },
								callback: (v) =>
									Number(v) >= 10000
										? Math.round(Number(v) / 10000) + '만'
										: Number(v) > 0
											? String(v)
											: ''
							},
							grid: { color: 'rgba(0,0,0,0.05)' }
						}
					}
				}
			});
			isChartReady = true;
		})();

		return {
			destroy() {
				disposed = true;
				chartInstance?.destroy();
				chartInstance = null;
				isChartReady = false;
			}
		};
	}

	// hourlyData($state) 변경 → 차트 데이터만 교체 (차트 재생성 없음)
	$effect(() => {
		const updated = [...hourlyData];
		if (!chartInstance) return;
		chartInstance.data.datasets[0].data = updated;
		chartInstance.update('none');
	});

	// 매장별 판매·메뉴 실시간 구독
	$effect(() => {
		if (!storeId) return;
		const channel = supabase
			.channel('store-realtime-' + storeId)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'sales_records',
					filter: `store_id=eq.${storeId}`
				},
				(payload) => {
					const newSale = payload.new as SaleRecord;
					allSales = [newSale, ...allSales];
					recentSales = [newSale, ...recentSales].slice(0, 6);
				const kstMs = parseUtc(newSale.sold_at).getTime() + 9 * 3600 * 1000;
				const hr = new Date(kstMs).getUTCHours();
				const updated = [...hourlyData];
				updated[hr] = (updated[hr] ?? 0) + newSale.total_amount;
				hourlyData = updated;
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'menu_items',
					filter: `store_id=eq.${storeId}`
				},
				(payload) => {
					const row = payload.new as MenuItemRow;
					liveMenuItems = liveMenuItems.map((m) => (m.id === row.id ? row : m));
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'DELETE',
					schema: 'public',
					table: 'sales_records',
					filter: `store_id=eq.${storeId}`
				},
				(payload) => {
					// 매출 취소 이벤트를 실시간 반영하여 카드/차트/최근목록을 동기화합니다.
					const deletedSale = payload.old as SaleRecord;
					if (!deletedSale?.id) return;
					allSales = allSales.filter((s) => s.id !== deletedSale.id);
					recentSales = allSales.slice(0, 6);
					const kstMs = parseUtc(deletedSale.sold_at).getTime() + 9 * 3600 * 1000;
					const hr = new Date(kstMs).getUTCHours();
					const updated = [...hourlyData];
					updated[hr] = Math.max(0, (updated[hr] ?? 0) - (deletedSale.total_amount ?? 0));
					hourlyData = updated;
				}
			)
			.subscribe();
		return () => {
			void supabase.removeChannel(channel);
		};
	});

	function toggleItem(item: MenuItemRow) {
		if (item.current_stock === 0) return;
		const exists = selectedItems.find((s) => s.id === item.id);
		if (exists) {
			selectedItems = selectedItems.filter((s) => s.id !== item.id);
		} else {
			selectedItems = [
				...selectedItems,
				{
					id: item.id,
					name: item.name,
					price: item.price,
					unit: item.unit,
					qty: 1
				}
			];
		}
	}

	function changeQty(itemId: string, delta: number) {
		selectedItems = selectedItems
			.map((s) => (s.id === itemId ? { ...s, qty: s.qty + delta } : s))
			.filter((s) => s.qty > 0);
	}

	async function handleSaveSale() {
		if (isSaving || selectedItems.length === 0) {
			return;
		}
		isSaving = true;
		stockErrorMsg = '';
		stockErrorItems = [];
		try {
			const now = new Date().toISOString();

			// 1) 사전 재고 검증: 검증 단계에서는 재고를 차감하지 않는다.
			const validateRes = await supabase.rpc('validate_stock', {
				p_items: selectedItems.map((i) => ({
					menu_item_id: i.id,
					quantity: i.qty
				})),
				p_store_id: storeId
			});

			if (validateRes.data?.success === false) {
				stockErrorItems = validateRes.data.shortage_names ?? [];
				stockErrorMsg =
					stockErrorItems.length > 0
						? `${stockErrorItems.join(', ')} 재고가 부족합니다.`
						: '재고가 부족합니다.';
				return;
			}

			// 2) 검증 통과 후 차감 + 판매 기록 삽입
			for (const item of selectedItems) {
				const { data: deductRes, error } = await supabase.rpc('deduct_stock', {
					p_menu_item_id: item.id,
					p_quantity: item.qty,
					p_store_id: storeId
				});

				// 차감 결과는 { success, remaining_stock, error } JSON 계약으로 처리합니다.
				if (error || deductRes?.success === false) {
					stockErrorMsg = `${item.name} 재고가 부족합니다.`;
					return;
				}
				const newStock = Number(deductRes?.remaining_stock);

				await supabase.from('sales_records').insert({
					store_id: storeId,
					menu_item_id: item.id,
					menu_name: item.name,
					quantity: item.qty,
					unit_price: item.price,
					total_amount: item.price * item.qty,
					sold_at: now
				});

				liveMenuItems = liveMenuItems.map((m) =>
					m.id === item.id ? { ...m, current_stock: Number.isFinite(newStock) ? newStock : m.current_stock } : m
				);
			}

			const newRecords: SaleRecord[] = selectedItems.map((item) => ({
				id: crypto.randomUUID(),
				store_id: storeId,
				menu_item_id: item.id,
				menu_name: item.name,
				quantity: item.qty,
				unit_price: item.price,
				total_amount: item.price * item.qty,
				sold_at: now
			}));
			allSales = [...newRecords, ...allSales];
			recentSales = allSales.slice(0, 6);

				const updatedHourly = buildHourlyData(allSales);
			hourlyData = updatedHourly;

			stockErrorMsg = '';
			showSaleModal = false;
			selectedItems = [];
		} finally {
			isSaving = false;
		}
	}

	async function handleSaveOrderLink() {
		if (!orderTargetItem || !orderLinkInput.trim()) return;
		isSavingLink = true;
		const { error } = await supabase
			.from('menu_items')
			.update({ order_link: orderLinkInput.trim() })
			.eq('id', orderTargetItem.id);
		if (!error) {
			liveMenuItems = liveMenuItems.map((m) =>
				m.id === orderTargetItem!.id ? { ...m, order_link: orderLinkInput.trim() } : m
			);
			showOrderModal = false;
			orderTargetItem = null;
		}
		isSavingLink = false;
	}

	async function handleCancelSale(sale: SaleRecord) {
		if (!sale.id || isCancellingSaleId) return;
		if (!confirm(`"${sale.menu_name}" 판매 기록을 취소할까요?\n재고가 자동으로 복구됩니다.`)) return;

		cancelErrorMsg = '';
		isCancellingSaleId = sale.id;
		try {
			// 1) 판매 기록 삭제
			const { error: deleteError } = await supabase
				.from('sales_records')
				.delete()
				.eq('id', sale.id)
				.eq('store_id', storeId);

			if (deleteError) {
				cancelErrorMsg = '매출 취소 중 오류가 발생했습니다: ' + deleteError.message;
				return;
			}

			// 2) 재고 복구 RPC 호출
			const { error: rpcError } = await supabase.rpc('increment_stock', {
				item_id: sale.menu_item_id,
				amount: sale.quantity
			});
			if (rpcError) {
				cancelErrorMsg = '재고 복구 중 오류가 발생했습니다: ' + rpcError.message;
			}
		} finally {
			isCancellingSaleId = null;
		}
	}
</script>

<div class="space-y-4">
	<!-- 헤더 -->
	<div>
		<div class="flex justify-between items-center">
			<h2 class="text-lg font-bold text-gray-900">내 가게 현황판</h2>
			<div class="flex items-center gap-1.5 text-xs text-gray-500">
				<span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
				실시간 {formatTime(currentTime)}
			</div>
		</div>
		<div class="flex items-center justify-between mb-4">
			<p class="text-xs text-gray-400">{formatDate(currentTime)}</p>
			<button
				type="button"
				onclick={() => (showSaleModal = true)}
				class="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl px-3 py-2 transition-colors shadow-sm"
			>
				<ShoppingCart class="w-3.5 h-3.5" />
				+ 판매 기록
			</button>
		</div>
	</div>

	<!-- 지표 카드 4개 -->
	<div class="grid grid-cols-2 gap-3">
		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs text-gray-400">오늘 매출</span>
				<TrendingUp class="w-4 h-4 text-blue-400" />
			</div>
			<p class="text-xl font-bold text-primary-600">{todayTotal.toLocaleString('ko-KR')}원</p>
		</div>

		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs text-gray-400">거래 건수</span>
				<ShoppingCart class="w-4 h-4 text-blue-400" />
			</div>
			<p class="text-xl font-bold text-gray-900">{txnCount}건</p>
			<p class="text-xs text-gray-400 mt-0.5">평균 {avgAmount.toLocaleString('ko-KR')}원</p>
		</div>

		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs text-gray-400">재고 부족</span>
				<Package class="w-4 h-4 text-orange-400" />
			</div>
			<p class="text-xl font-bold {lowStockItems.length > 0 ? 'text-red-500' : 'text-gray-900'}">
				{lowStockItems.length}개
			</p>
			<p class="text-xs text-gray-400 mt-0.5 truncate">
				{lowStockItems.length > 0 ? lowStockItems.map((m) => m.name).join(', ') : '모두 정상'}
			</p>
		</div>

		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs text-gray-400">베스트 메뉴</span>
				<Star class="w-4 h-4 text-yellow-400" />
			</div>
			<p class="text-xl font-bold text-gray-900 truncate">{bestItem?.name ?? '-'}</p>
			<p class="text-xs text-gray-400 mt-0.5">
				{bestItem ? '오늘 ' + bestItem.count + '개 판매' : '판매 기록 없음'}
			</p>
		</div>
	</div>

	<!-- 차트 + 최근 판매 -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
		<div class="lg:col-span-3 rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<p class="text-sm font-semibold text-gray-700 mb-3">시간대별 매출</p>
			<div style="height:185px; position:relative;">
				{#if !isChartReady}
					<p class="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
						차트 불러오는 중...
					</p>
				{/if}
				<canvas use:chartAction></canvas>
			</div>
		</div>

		<div class="lg:col-span-2 rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
			<p class="text-sm font-semibold text-gray-700 mb-3">최근 판매</p>
			{#if cancelErrorMsg}
				<p class="text-xs text-red-500 mb-2">{cancelErrorMsg}</p>
			{/if}
			{#if recentSales.length === 0}
				<p class="text-xs text-gray-400 text-center py-4">아직 판매 기록이 없어요</p>
			{:else}
				<div class="space-y-2.5">
					{#each recentSales as sale}
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm text-gray-800">{sale.menu_name}</p>
								<p class="text-xs text-gray-400">{getMinutesAgo(sale.sold_at)}</p>
							</div>
							<div class="flex items-center gap-2">
								<p class="text-xs font-medium text-green-600">
									+{sale.total_amount.toLocaleString('ko-KR')}원
								</p>
								<button
									type="button"
									onclick={() => handleCancelSale(sale)}
									disabled={isCancellingSaleId !== null}
									class="text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
								>
									{isCancellingSaleId === sale.id ? '취소 중...' : '취소'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- 재고 현황 테이블 -->
	<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
		<div class="flex items-center justify-between mb-3">
			<p class="text-sm font-semibold text-gray-700">재고 현황</p>
			<p class="text-xs text-gray-400 hidden sm:block">
				부족·위험 품목은 발주 버튼을 눌러 챗봇에 문의하세요
			</p>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="text-xs text-gray-400 border-b border-gray-100">
						<th class="pb-2 text-left font-medium">메뉴명</th>
						<th class="pb-2 text-left font-medium">재고</th>
						<th class="pb-2 text-left font-medium">현황</th>
						<th class="pb-2 text-left font-medium">상태</th>
						<th class="pb-2 text-left font-medium">오늘판매</th>
						<th class="pb-2 text-left font-medium">발주</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-50">
					{#each liveMenuItems as item}
						{@const ratio = item.max_stock > 0 ? item.current_stock / item.max_stock : 0}
						{@const status = ratio > 0.3 ? 'normal' : ratio > 0 ? 'low' : 'danger'}
						{@const statusLabel = status === 'normal' ? '정상' : status === 'low' ? '부족' : '위험'}
						{@const statusClass =
							status === 'normal'
								? 'bg-green-50 text-green-700'
								: status === 'low'
									? 'bg-orange-50 text-orange-700'
									: 'bg-red-50 text-red-700'}
						{@const barColor =
							status === 'normal'
								? 'bg-green-500'
								: status === 'low'
									? 'bg-orange-400'
									: 'bg-red-400'}
						{@const barWidth = Math.round(ratio * 100) + '%'}
						<tr>
							<td class="py-2.5 pr-3 font-medium text-gray-800">{item.name}</td>
							<td class="py-2.5 pr-3 text-gray-600">
								{item.current_stock}/{item.max_stock}{item.unit}
							</td>
							<td class="py-2.5 pr-3">
								<div class="bg-gray-100 rounded-full h-1.5 w-24">
									<div class="{barColor} h-1.5 rounded-full" style="width:{barWidth}"></div>
								</div>
							</td>
							<td class="py-2.5 pr-3">
								<span class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusClass}">
									{statusLabel}
								</span>
							</td>
							<td class="py-2.5 pr-3 text-gray-600">
								{todaySalesByMenu.get(item.id) ?? 0}개
							</td>
							<td class="py-2.5">
								{#if status !== 'normal'}
									<button
										type="button"
										class="text-xs border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 flex items-center gap-1"
										onclick={() => {
											if (item.order_link) {
												window.open(item.order_link, '_blank', 'noopener,noreferrer');
											} else {
												orderTargetItem = { id: item.id, name: sanitizeName(item.name) };
												orderLinkInput = '';
												showOrderModal = true;
											}
										}}
									>
										<Send class="w-3 h-3" /> 발주
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<!-- 판매 기록 모달 -->
{#if showSaleModal}
	<div
		class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
		onclick={() => (showSaleModal = false)}
		role="presentation"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div
			class="bg-white rounded-2xl p-5 w-full max-w-sm mx-4 shadow-xl outline-none"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (showSaleModal = false)}
			role="dialog"
			aria-modal="true"
			aria-labelledby="sale-modal-title"
			tabindex="-1"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 id="sale-modal-title" class="text-base font-bold text-gray-900">판매 기록</h3>
				<button
					type="button"
					onclick={() => (showSaleModal = false)}
					class="text-gray-400 hover:text-gray-600"
				>
					<X class="w-5 h-5" />
				</button>
			</div>

			<div class="grid grid-cols-2 gap-2 mb-4">
				{#each liveMenuItems as item}
					{@const isSelected = selectedItems.some((s) => s.id === item.id)}
					{@const noStock = item.current_stock === 0}
					<button
						type="button"
						class="relative p-3 rounded-xl text-left transition-all {noStock
							? 'opacity-50 cursor-not-allowed border border-gray-200'
							: isSelected
								? 'border-2 border-primary-600 bg-primary-50'
								: 'border border-gray-200 hover:border-blue-300'}"
						onclick={() => toggleItem(item)}
						disabled={noStock}
					>
						{#if noStock}
							<span class="absolute top-1.5 right-1.5 text-xs bg-gray-100 text-gray-400 rounded px-1">
								재고없음
							</span>
						{/if}
						<p class="text-sm font-medium text-gray-800">{item.name}</p>
						<p class="text-xs text-gray-400 mt-0.5">{item.price.toLocaleString('ko-KR')}원</p>
					</button>
				{/each}
			</div>

			{#if selectedItems.length > 0}
				<div class="border-t border-gray-100 pt-3 mb-3 space-y-2">
					{#each selectedItems as item}
						<div class="flex items-center justify-between">
							<span class="text-sm text-gray-700">{item.name}</span>
							<div class="flex items-center gap-2">
								<button
									type="button"
									class="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
									onclick={() => changeQty(item.id, -1)}
								>-</button>
								<span class="text-sm font-medium w-4 text-center">{item.qty}</span>
								<button
									type="button"
									class="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
									onclick={() => changeQty(item.id, 1)}
								>+</button>
								<span class="text-xs text-gray-400 w-20 text-right">
									{(item.price * item.qty).toLocaleString('ko-KR')}원
								</span>
							</div>
						</div>
					{/each}
				</div>
				<p class="text-sm font-bold text-blue-600 text-right mb-4">
					합계: {modalTotal.toLocaleString('ko-KR')}원
				</p>
			{/if}

			{#if stockErrorMsg}
				<p class="text-sm text-red-500 mt-2 mb-2">{stockErrorMsg}</p>
			{/if}

			<div class="flex gap-2">
				<button
					type="button"
					class="flex-1 border border-gray-200 bg-white text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50"
					onclick={() => {
						showSaleModal = false;
						selectedItems = [];
						stockErrorMsg = '';
					}}
				>취소</button>
				<button
					type="button"
					class="flex-1 bg-primary-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
					onclick={handleSaveSale}
					disabled={isSaving || selectedItems.length === 0}
				>{isSaving ? '저장 중...' : '기록 저장'}</button>
			</div>
		</div>
	</div>
{/if}

{#if showOrderModal && orderTargetItem}
	<div
		class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
		onclick={() => {
			showOrderModal = false;
		}}
		role="presentation"
	>
		<div
			class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<h3 class="text-base font-bold text-gray-900">발주 링크 등록</h3>
			<p class="text-sm text-gray-500">
				<span class="font-medium text-gray-800">{orderTargetItem.name}</span>의 발주처 링크를 입력해 주세요.<br />
				(예: 쿠팡, 마켓컬리 등 상품 페이지 URL)
			</p>
			<input
				type="url"
				placeholder="https://..."
				bind:value={orderLinkInput}
					class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
			/>
			<div class="flex gap-2">
				<button
					onclick={() => {
						showOrderModal = false;
					}}
					class="flex-1 border border-gray-200 bg-white text-gray-700 rounded-xl py-2 text-sm hover:bg-gray-50"
				>
					취소
				</button>
				<button
					onclick={handleSaveOrderLink}
					disabled={isSavingLink || !orderLinkInput.trim()}
					class="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-2 text-sm disabled:opacity-50"
				>
					{isSavingLink ? '저장 중...' : '링크 저장'}
				</button>
			</div>
		</div>
	</div>
{/if}
