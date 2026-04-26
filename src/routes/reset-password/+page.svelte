<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let isRecoveryReady = $state(false);
  let errorMsg = $state('');
  let infoMsg = $state('');

  onMount(async () => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    const code = url.searchParams.get('code');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');

    // code 기반 링크는 세션으로 교환해야 비밀번호 변경이 가능합니다.
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        errorMsg = '재설정 링크를 확인하는 중 오류가 발생했습니다. 새 메일로 다시 시도해 주세요.';
        return;
      }
    }

    // hash 토큰이 포함된 링크도 직접 세션으로 반영합니다.
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        errorMsg = '재설정 링크 인증에 실패했습니다. 새 메일로 다시 시도해 주세요.';
        return;
      }
    }

    const { data } = await supabase.auth.getSession();
    if (data.session && (type === 'recovery' || code || accessToken)) {
      isRecoveryReady = true;
      return;
    }

    errorMsg = '유효한 비밀번호 재설정 링크가 아닙니다. 다시 메일을 받아 시도해 주세요.';
  });

  async function handleResetPassword(event: Event) {
    event.preventDefault();
    errorMsg = '';
    infoMsg = '';

    if (!password || !confirmPassword) {
      errorMsg = '새 비밀번호와 확인 비밀번호를 모두 입력해 주세요.';
      return;
    }

    if (password.length < 6) {
      errorMsg = '비밀번호는 6자 이상으로 입력해 주세요.';
      return;
    }

    if (password !== confirmPassword) {
      errorMsg = '비밀번호가 서로 일치하지 않습니다.';
      return;
    }

    loading = true;
    // recovery 세션에서 현재 사용자 비밀번호를 새 값으로 변경합니다.
    const { error } = await supabase.auth.updateUser({ password });
    loading = false;

    if (error) {
      errorMsg = error.message || '비밀번호 변경 중 오류가 발생했습니다.';
      return;
    }

    infoMsg = '비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다.';
    setTimeout(() => {
      void goto('/login');
    }, 1200);
  }
</script>

<svelte:head>
  <title>비밀번호 재설정 — PayNote</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
  <div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg border border-slate-100">
    <div class="text-center mb-8">
      <p class="text-3xl mb-2">🔐</p>
      <h1 class="text-xl font-bold text-slate-800">비밀번호 재설정</h1>
      <p class="text-sm text-slate-500 mt-1">새 비밀번호를 입력해 주세요.</p>
    </div>

    <form class="space-y-4" onsubmit={handleResetPassword}>
      <div>
        <label for="reset-password" class="block text-sm font-medium text-slate-600 mb-1">새 비밀번호</label>
        <input
          id="reset-password"
          type="password"
          bind:value={password}
          disabled={loading || !isRecoveryReady}
          class="w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          placeholder="6자 이상 입력"
        />
      </div>

      <div>
        <label for="reset-password-confirm" class="block text-sm font-medium text-slate-600 mb-1">비밀번호 확인</label>
        <input
          id="reset-password-confirm"
          type="password"
          bind:value={confirmPassword}
          disabled={loading || !isRecoveryReady}
          class="w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          placeholder="한 번 더 입력"
        />
      </div>

      {#if errorMsg}
        <p class="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMsg}</p>
      {/if}

      {#if infoMsg}
        <p class="text-sm text-green-700 font-medium bg-green-50 border border-green-100 rounded-lg px-3 py-2">{infoMsg}</p>
      {/if}

      <button
        type="submit"
        disabled={loading || !isRecoveryReady}
        class="w-full rounded-xl bg-blue-600 text-white font-bold py-3.5 text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
      >
        {loading ? '변경 중…' : '비밀번호 변경'}
      </button>
    </form>
  </div>
</div>
