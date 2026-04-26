<script lang="ts">
  type BusinessType = 'cafe' | 'restaurant' | 'salon' | 'hospital' | 'etc';
  type ToneType = 'friendly' | 'formal' | 'apology';
  type PlatformType = 'delivery' | 'map';

  interface ReviewResponse {
    reply: string;
    riskLevel: number;
    riskType: string;
    strategyGuide: string;
  }

  // 사용자가 선택하는 옵션 상태
  let review = $state('');
  let businessType = $state<BusinessType>('restaurant');
  let tone = $state<ToneType>('friendly');
  let platform = $state<PlatformType>('delivery');
  let marketingHook = $state(false);

  // API 호출 결과/에러/로딩 상태
  let isLoading = $state(false);
  let errorMsg = $state('');
  let result = $state<ReviewResponse | null>(null);

  // 입력값이 없거나 로딩 중이면 제출 버튼 비활성화
  const canSubmit = $derived(!isLoading && review.trim().length > 0);

  // /api/review 엔드포인트로 리뷰 답글 생성을 요청합니다.
  async function handleGenerateReply() {
    if (!canSubmit) return;

    isLoading = true;
    errorMsg = '';
    result = null;

    try {
      const response = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review,
          businessType,
          tone,
          platform,
          marketingHook
        })
      });

      const data = await response.json();
      if (!response.ok) {
        errorMsg = data?.message ?? data?.error ?? '답글 생성 중 오류가 발생했습니다.';
        return;
      }

      result = {
        reply: data.reply ?? '',
        riskLevel: data.riskLevel ?? 1,
        riskType: data.riskType ?? 'UNKNOWN',
        strategyGuide: data.strategyGuide ?? ''
      };
    } catch (err) {
      console.error('[review-page] 요청 실패:', err);
      errorMsg = '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="mx-auto w-full max-w-3xl p-4 sm:p-6 space-y-5">
  <div>
    <h1 class="text-2xl font-bold text-gray-900">리뷰 답글 도우미</h1>
    <p class="text-sm text-gray-500 mt-1">리뷰를 입력하면 AI가 답글과 위험도 분석을 생성해요.</p>
  </div>

  <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label class="text-sm text-gray-700">
        업종
        <select bind:value={businessType} class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
          <option value="cafe">카페</option>
          <option value="restaurant">식당/음식점</option>
          <option value="salon">미용실</option>
          <option value="hospital">병원/클리닉</option>
          <option value="etc">일반 매장</option>
        </select>
      </label>

      <label class="text-sm text-gray-700">
        답글 톤
        <select bind:value={tone} class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
          <option value="friendly">친근한 톤</option>
          <option value="formal">공손한 톤</option>
          <option value="apology">사과 톤</option>
        </select>
      </label>

      <label class="text-sm text-gray-700">
        플랫폼
        <select bind:value={platform} class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
          <option value="delivery">배달 앱</option>
          <option value="map">지도 앱</option>
        </select>
      </label>

      <label class="flex items-center gap-2 text-sm text-gray-700 pt-7">
        <input type="checkbox" bind:checked={marketingHook} />
        재방문 유도 문구 추가
      </label>
    </div>

    <label class="block text-sm text-gray-700">
      리뷰 내용
      <textarea
        bind:value={review}
        rows="6"
        placeholder="고객 리뷰를 입력해주세요."
        class="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
      ></textarea>
    </label>

    <button
      type="button"
      onclick={handleGenerateReply}
      disabled={!canSubmit}
      class="w-full rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {#if isLoading}
        답글 생성 중...
      {:else}
        답글 생성하기
      {/if}
    </button>

    {#if errorMsg}
      <p class="text-sm text-red-500">{errorMsg}</p>
    {/if}
  </section>

  {#if result}
    <section class="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
      <h2 class="text-lg font-semibold text-gray-900">생성 결과</h2>
      <div class="rounded-xl bg-blue-50 p-3">
        <p class="text-xs text-gray-500 mb-1">답글</p>
        <p class="text-sm text-gray-800 whitespace-pre-wrap">{result.reply}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <p class="rounded-lg bg-gray-50 px-3 py-2">위험도: <span class="font-semibold">Lv.{result.riskLevel}</span></p>
        <p class="rounded-lg bg-gray-50 px-3 py-2">유형: <span class="font-semibold">{result.riskType}</span></p>
        <p class="rounded-lg bg-gray-50 px-3 py-2 sm:col-span-3">가이드: <span class="font-semibold">{result.strategyGuide}</span></p>
      </div>
    </section>
  {/if}
</div>
