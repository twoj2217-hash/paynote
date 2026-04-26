<script lang="ts">
  interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  interface ChatApiSuccess {
    reply: string;
    usageCount: number;
  }

  interface ChatApiError {
    error: string;
    usageCount?: number;
  }

  /** GET /api/chat/history 목록 한 행 */
  interface HistorySessionRow {
    session_id: string;
    created_at: string;
    content: string;
  }

  let { storeId }: { storeId: string | null } = $props();

  let isOpen = $state(false);
  let messages = $state<ChatMessage[]>([]);
  let inputText = $state('');
  let isLoading = $state(false);
  let usageCount = $state(0);

  let activeTab = $state<'chat' | 'history'>('chat');
  let sessionId = $state('');
  let historySessions = $state<HistorySessionRow[]>([]);
  let isHistoryLoading = $state(false);
  let expandedSessionId = $state<string | null>(null);
  let expandedMessages = $state<ChatMessage[]>([]);

  // 서버에서 받은 리셋 월 (KST YYYY-MM)
  let lastResetMonth = $state('');

  $effect(() => {
    if (isOpen && usageCount === 0) {
      // KST 기준 현재 월 계산
      const nowKSTMonth = new Date(Date.now() + 9 * 3600 * 1000)
        .toISOString().slice(0, 7);

      // 낙관적 리셋: 저장된 월과 현재 월이 다르면 사용량 0으로 표시
      if (lastResetMonth && lastResetMonth !== nowKSTMonth) {
        usageCount = 0;
      }

      void fetch('/api/chat')
        .then((response) => response.json())
        .then((data: { usageCount?: number }) => {
          if (typeof data.usageCount === 'number') {
            usageCount = data.usageCount;
            lastResetMonth = nowKSTMonth;
          }
        })
        .catch((error) => {
          console.error(error);
        });
    }
  });

  $effect(() => {
    if (isOpen) {
      // 모달이 열릴 때마다 새 세션 ID 생성 (브라우저 환경에서만 실행)
      sessionId = crypto.randomUUID();
      activeTab = 'chat';
      expandedSessionId = null;
    }
  });

  async function sendMessage() {
    // 공백 입력은 전송하지 않습니다.
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    // 서버에는 기존 이력만 보내고 현재 질문은 message 필드로 보냅니다.
    const historyForRequest = [...messages];
    messages = [...messages, { role: 'user', content: trimmed }];
    inputText = '';
    isLoading = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          chatHistory: historyForRequest,
          storeId,
          sessionId
        })
      });

      if (response.status === 429) {
        const data = (await response.json().catch(() => ({}))) as ChatApiError;
        if (typeof data.usageCount === 'number') {
          usageCount = data.usageCount;
        }
        messages = [
          ...messages,
          { role: 'assistant', content: '이번 달 무료 자문 횟수를 모두 사용했습니다.' }
        ];
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ChatApiError;
        messages = [
          ...messages,
          {
            role: 'assistant',
            content: data.error ?? '요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          }
        ];
        return;
      }

      const data = (await response.json()) as ChatApiSuccess;
      usageCount = typeof data.usageCount === 'number' ? data.usageCount : usageCount;
      messages = [...messages, { role: 'assistant', content: data.reply }];
    } catch (error) {
      console.error(error);
      messages = [
        ...messages,
        { role: 'assistant', content: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }
      ];
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      isOpen = true;
      inputText = customEvent.detail.message;
      void sendMessage();
    };
    window.addEventListener('chatbot-send', handler);
    return () => window.removeEventListener('chatbot-send', handler);
  });

  $effect(() => {
    const openHandler = () => {
      isOpen = true;
    };
    window.addEventListener('open-chatbot', openHandler);
    return () => window.removeEventListener('open-chatbot', openHandler);
  });

  function handleKeydown(event: KeyboardEvent) {
    // Enter 전송, Shift+Enter 줄바꿈 동작을 분리합니다.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  /** 네비 등 외부에서 모달만 열 때 호출 */
  export function openChatbot() {
    isOpen = true;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6">
    <div class="flex h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 class="text-lg font-bold text-gray-900"><span>🤖 페이노트 AI 노무 도우미</span></h2>
          <p class="text-xs text-gray-500">이번 달 사용({usageCount}/10회)</p>
        </div>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          onclick={() => (isOpen = false)}
        >
          닫기
        </button>
      </div>

      <div class="flex border-b border-gray-100 shrink-0">
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium transition-colors {activeTab === 'chat'
            ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
            : 'text-gray-400 hover:text-gray-600'}"
          onclick={() => {
            activeTab = 'chat';
          }}
        >
          대화하기
        </button>
        <button
          type="button"
          class="flex-1 py-2.5 text-sm font-medium transition-colors {activeTab === 'history'
            ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
            : 'text-gray-400 hover:text-gray-600'}"
          onclick={async () => {
            activeTab = 'history';
            isHistoryLoading = true;
            expandedSessionId = null;
            try {
              const res = await fetch('/api/chat/history');
              const d = (await res.json()) as { sessions?: HistorySessionRow[] };
              historySessions = d.sessions ?? [];
            } catch {
              historySessions = [];
            } finally {
              isHistoryLoading = false;
            }
          }}
        >
          대화 이력
        </button>
      </div>

      {#if activeTab === 'chat'}
        <div class="flex-1 space-y-3 overflow-y-auto bg-gray-50 p-4 min-h-0">
          {#if messages.length === 0}
            <div class="rounded-xl bg-white p-3 text-sm text-gray-600 shadow-sm">
              근로시간, 주휴수당, 최저임금 관련 궁금한 점을 편하게 물어보세요.
            </div>
          {/if}

          {#each messages as msg}
            <div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                class={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          {/each}

          {#if isLoading}
            <div class="flex justify-start">
              <div class="rounded-2xl bg-gray-200 px-3 py-2 text-sm text-gray-700">답변 생성 중...</div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {#if isHistoryLoading}
            <p class="text-xs text-gray-400 text-center py-8">불러오는 중...</p>
          {:else if historySessions.length === 0}
            <div class="text-center py-8">
              <p class="text-sm text-gray-400">저장된 대화 이력이 없습니다.</p>
              <p class="text-xs text-gray-300 mt-1">질문을 내면 자동으로 저장됩니다.</p>
            </div>
          {:else}
            {#each historySessions as s}
              <button
                type="button"
                class="w-full text-left rounded-xl border transition-colors p-3 {expandedSessionId ===
                s.session_id
                  ? 'border-[#2563eb] bg-blue-50'
                  : 'border-gray-100 bg-white hover:bg-gray-50'}"
                onclick={async () => {
                  if (expandedSessionId === s.session_id) {
                    expandedSessionId = null;
                    expandedMessages = [];
                    return;
                  }
                  expandedSessionId = s.session_id;
                  try {
                    const res = await fetch(`/api/chat/history/${s.session_id}`);
                    const d = (await res.json()) as { messages?: ChatMessage[] };
                    expandedMessages = d.messages ?? [];
                  } catch {
                    expandedMessages = [];
                  }
                }}
              >
                <p class="text-[10px] text-gray-400 mb-1">
                  {new Date(s.created_at).toLocaleString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p class="text-xs text-gray-700 truncate">{s.content}</p>
              </button>

              {#if expandedSessionId === s.session_id}
                <div class="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2 -mt-1">
                  {#if expandedMessages.length === 0}
                    <p class="text-xs text-gray-400 text-center">내용을 불러오는 중...</p>
                  {:else}
                    {#each expandedMessages as m}
                      <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
                        <div
                          class="max-w-[80%] rounded-xl px-3 py-2 text-xs {m.role === 'user'
                            ? 'bg-[#2563eb] text-white'
                            : 'bg-white border border-gray-100 text-gray-700'}"
                        >
                          {m.content}
                        </div>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      {/if}

      {#if activeTab === 'chat'}
        <div class="border-t border-gray-200 bg-white p-3 shrink-0">
          <p class="text-xs text-gray-400 text-right mb-1">
            이번 달 사용 ({usageCount}/10회)
          </p>
          <div class="flex items-end gap-2">
            <textarea
              class="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500"
              placeholder="예) 주휴수당 조건을 쉽게 설명해 주세요."
              bind:value={inputText}
              onkeydown={handleKeydown}
              disabled={isLoading}
            ></textarea>
            <button
              type="button"
              class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              onclick={() => void sendMessage()}
              disabled={isLoading || !inputText.trim()}
            >
              {#if isLoading}전송 중...{:else}전송{/if}
            </button>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            ⚠️ AI 답변은 참고용이며 법적 효력이 없습니다. 정확한 판단은 전문 노무사에게 문의하세요.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}
