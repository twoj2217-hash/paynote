<script lang="ts">
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';

  // Runes: 로그인 폼 상태
  let email = $state('');
  let password = $state('');
  let loading = $state(false);
  let resetLoading = $state(false);
  let errorMsg = $state('');
  let infoMsg = $state('');

  /** Supabase 에러 코드 → 한국어 안내 */
  function toKoreanAuthMessage(message: string, code?: string): string {
    const m = message.toLowerCase();
    if (m.includes('invalid login') || code === 'invalid_credentials') {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    if (m.includes('email not confirmed')) {
      return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.';
    }
    if (m.includes('too many requests')) {
      return '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    return message || '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errorMsg = '';
    infoMsg = '';
    if (!email.trim()) {
      errorMsg = '이메일을 입력해 주세요.';
      return;
    }
    if (!password) {
      errorMsg = '비밀번호를 입력해 주세요.';
      return;
    }

    loading = true;
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    loading = false;

    if (error) {
      errorMsg = toKoreanAuthMessage(error.message, error.code);
      return;
    }

    await goto('/dashboard');
  }

  async function handleResetPassword() {
    errorMsg = '';
    infoMsg = '';

    if (!email.trim()) {
      errorMsg = '비밀번호 재설정을 위해 이메일을 먼저 입력해 주세요.';
      return;
    }

    resetLoading = true;
    // 입력된 이메일로 비밀번호 재설정 메일을 발송합니다.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // 메일의 재설정 링크가 실제 비밀번호 변경 페이지로 오도록 지정합니다.
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`
    });
    resetLoading = false;

    if (error) {
      errorMsg = toKoreanAuthMessage(error.message, error.code);
      return;
    }

    infoMsg = '비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.';
  }
</script>

<svelte:head>
  <title>로그인 — PayNote</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-surface px-4 py-10">
  <div class="w-full max-w-sm rounded-2xl shadow-sm border border-surface-border bg-surface-card p-8">
    <div class="text-center mb-8">
      <h1 class="text-2xl font-bold text-gray-900">페이노트</h1>
      <p class="text-sm text-gray-500 mt-1">카페·요식업 근태 &amp; 급여 자동화</p>
    </div>

    <form class="space-y-4" onsubmit={handleSubmit}>
      <div>
        <label for="login-email" class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
        <input
          id="login-email"
          type="email"
          autocomplete="email"
          bind:value={email}
          disabled={loading}
          class="w-full border border-surface-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label for="login-password" class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
        <input
          id="login-password"
          type="password"
          autocomplete="current-password"
          bind:value={password}
          disabled={loading}
          class="w-full border border-surface-border rounded-xl px-4 py-2 focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
        />
      </div>

      {#if errorMsg}
        <p class="text-sm text-[#dc2626] font-medium bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorMsg}</p>
      {/if}
      {#if infoMsg}
        <p class="text-sm text-[#16a34a] font-medium bg-green-50 border border-green-100 rounded-lg px-3 py-2">{infoMsg}</p>
      {/if}

      <button
        type="submit"
        disabled={loading || resetLoading}
        class="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '로그인 중…' : '로그인'}
      </button>
      <button
        type="button"
        onclick={handleResetPassword}
        disabled={loading || resetLoading}
        class="text-primary-600 hover:text-primary-700 text-sm disabled:opacity-50"
      >
        {resetLoading ? '재설정 메일 전송 중…' : '비밀번호 재설정'}
      </button>
    </form>
  </div>
</div>
