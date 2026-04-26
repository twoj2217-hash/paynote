<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import LaborChatbot from '$lib/components/LaborChatbot.svelte';
  import { MessageCircle, ChevronDown } from 'lucide-svelte';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const navItems = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/employees', label: '👥 직원·급여' },
    { href: '/timecards', label: '🕐 근태·QR' },
    { href: '/payroll', label: '급여 요약' },
    { href: '/checkin', label: 'QR 체크인' },
  ];

  let loggingOut = $state(false);

  async function logout() {
    loggingOut = true;
    await supabase.auth.signOut();
    loggingOut = false;
    await goto('/login');
  }
</script>

<div class="min-h-screen bg-gray-50">
  {#if !data.hideNav}
    <nav class="hidden md:flex bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex-wrap items-center gap-3 sm:gap-6">
      <!-- 상단 네비 브랜드: PayNote -->
      <span class="font-bold text-blue-600 text-lg mr-auto sm:mr-4">PayNote</span>
      <div class="flex flex-wrap items-center gap-2 sm:gap-4">
        {#each navItems as item}
          <!-- 메뉴는 숨기지만 라우트 접근은 유지 -->
          <a
            href={item.href}
            class="text-sm font-medium px-3 py-2 rounded-lg transition-colors
              {item.href === '/payroll' || item.href === '/checkin' ? 'hidden' : ''}
              {$page.url.pathname.startsWith(item.href)
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}"
          >
            {item.label}
          </a>
        {/each}
      </div>
      {#if data.user}
        <div class="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={() => window.dispatchEvent(new CustomEvent('open-chatbot'))}
            class="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-600 hover:border-[#2563eb] hover:text-[#2563eb] transition-all shadow-sm"
            aria-label="노무 도우미 열기"
          >
            <MessageCircle class="w-4 h-4 text-[#2563eb] flex-shrink-0" />
            <span>노무사에게 물어보기</span>
            <ChevronDown class="w-3 h-3 text-gray-400 flex-shrink-0" />
          </button>
          <button
            type="button"
            onclick={logout}
            disabled={loggingOut}
            class="text-sm font-medium px-3 py-2 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </div>
      {/if}
    </nav>
  {/if}
  <div class="pb-20 md:pb-0">
    {@render children()}
  </div>
  {#if !data.hideNav}
    <nav
      class="md:hidden fixed bottom-0 left-0 right-0 z-50
             bg-white border-t border-gray-100
             flex justify-around items-center py-2"
    >
      <a
        href="/dashboard"
        class="flex flex-col items-center gap-0.5 px-4 py-1
               text-xs text-gray-500 hover:text-[#2563eb]"
      >
        <span class="text-lg">🏠</span>홈
      </a>
      <a
        href="/employees"
        class="flex flex-col items-center gap-0.5 px-4 py-1
               text-xs text-gray-500 hover:text-[#2563eb]"
      >
        <span class="text-lg">👥</span>직원·급여
      </a>
      <a
        href="/timecards"
        class="flex flex-col items-center gap-0.5 px-4 py-1
               text-xs text-gray-500 hover:text-[#2563eb]"
      >
        <span class="text-lg">🕐</span>근태·QR
      </a>
    </nav>
  {/if}
  <LaborChatbot storeId={data.storeId} />
</div>
