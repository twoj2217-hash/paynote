<script lang="ts">
	import { supabase } from '$lib/supabaseClient';
	import { goto } from '$app/navigation';
	import { Lock } from 'lucide-svelte';

	// Runes: 재설정 폼 상태
	let newPassword = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');

	// 입력이 바뀌면 이전 검증 오류 메시지 제거 (성공 메시지는 유지)
	$effect(() => {
		void newPassword;
		void confirmPassword;
		errorMsg = '';
	});

	async function handleReset() {
		errorMsg = '';
		successMsg = '';

		if (newPassword.length < 6) {
			errorMsg = '비밀번호는 6자 이상이어야 합니다.';
			return;
		}
		if (newPassword !== confirmPassword) {
			errorMsg = '비밀번호가 일치하지 않습니다.';
			return;
		}

		isLoading = true;
		try {
			const { error } = await supabase.auth.updateUser({ password: newPassword });
			if (error) {
				errorMsg = '비밀번호 변경에 실패했습니다. 다시 시도해 주세요.';
			} else {
				successMsg = '비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다.';
				setTimeout(() => goto('/login'), 2000);
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
	<div class="w-full max-w-sm rounded-2xl border border-gray-100 bg-white shadow-sm p-8">
		<div class="text-center mb-8">
			<div class="flex justify-center mb-3 text-[#2563eb]" aria-hidden="true">
				<Lock class="h-10 w-10" stroke-width={1.5} />
			</div>
			<h1 class="text-2xl font-bold text-gray-900">비밀번호 재설정</h1>
			<p class="text-sm text-gray-500 mt-1">새 비밀번호를 입력해 주세요.</p>
		</div>

		<div class="space-y-4">
			<div>
				<label class="text-sm text-gray-700 font-medium" for="new-password">새 비밀번호</label>
				<input
					id="new-password"
					type="password"
					bind:value={newPassword}
					placeholder="6자 이상 입력"
					autocomplete="new-password"
					class="w-full mt-1 border border-[#e2e8f0] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#3b82f6] outline-none"
				/>
			</div>
			<div>
				<label class="text-sm text-gray-700 font-medium" for="confirm-password">비밀번호 확인</label>
				<input
					id="confirm-password"
					type="password"
					bind:value={confirmPassword}
					placeholder="한 번 더 입력"
					autocomplete="new-password"
					class="w-full mt-1 border border-[#e2e8f0] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#3b82f6] outline-none"
				/>
			</div>

			{#if errorMsg}
				<div class="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
					{errorMsg}
				</div>
			{/if}
			{#if successMsg}
				<div class="bg-green-50 border border-green-100 text-green-700 text-sm rounded-xl px-4 py-3">
					{successMsg}
				</div>
			{/if}

			<button
				type="button"
				onclick={handleReset}
				disabled={isLoading}
				class="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold rounded-xl py-3 transition-colors disabled:opacity-50"
			>
				{isLoading ? '변경 중...' : '비밀번호 변경'}
			</button>
		</div>
	</div>
</div>
