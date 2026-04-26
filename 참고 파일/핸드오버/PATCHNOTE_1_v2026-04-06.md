================================================================
## 페이노트(PayNote) — 패치 노트 1
## 작성일: 2026-04-06
## 목적: gstack 3단계 전체 점검 결과 → Cursor 재점검 지시서
## 참조: HANDOVER_v2026-03-31, DESIGN_HANDOVER_v2026-04-03,
##       STORE_DASHBOARD_HANDOVER_v2026-04-05
## v2: 시니어 엔지니어 재검토 반영 (전제 오류 수정, 지시서 재작성)
================================================================

================================================================
## 점검 방법론
================================================================
- 1단계 CEO Review:   실제 사용자 플로우 점검
  기준: "사장님이 처음 접속해서 급여명세서 발급까지 10분 안에 혼자 할 수 있는가?"
- 2단계 Security Review: OWASP Top 10 + 실제 공격 시나리오
- 3단계 QA Review:   조용히 터지는 버그 & 엣지 케이스

================================================================
## 전체 판정 요약
================================================================

| 단계           | 판정                | 핵심 이슈                                  |
|----------------|---------------------|--------------------------------------------|
| 1단계 CEO      | ❌ 10분 달성 불가   | Empty State, 용어 장벽, 플로우 미안내      |
| 2단계 Security | 🔴 즉시 조치 필요   | PIN 브루트포스                             |
| 3단계 QA       | 🟠 출시 전 해결     | 재고 음수, Chart 누수, PDF 모바일          |

================================================================
## v2 변경 사항 요약 (재검토에서 수정된 항목)
================================================================

| ID        | v1 문제점                              | v2 수정 내용                                   |
|-----------|----------------------------------------|------------------------------------------------|
| C-01      | RLS·서비스키 설계 누락, IP 추출 위험  | 서비스 역할 클라이언트 방식으로 지시서 재작성  |
| C-02      | CRITICAL 과도 판정                     | HIGH로 하향, sanitize는 좋은 습관으로 유지     |
| C-03+H-05 | 중복 UI 생성 위험                      | 하나로 합침 — C-03만 진행, H-05 폐기          |
| H-01      | "해싱이 답"이라는 전제 오류            | MVP 전략 재정의 (평문+브루트포스방어가 현실적) |
| H-03      | supabase.raw() 존재하지 않는 메서드    | Supabase RPC 함수 방식으로 재작성              |
| M-05      | removeAllChannels() 전체 채널 제거     | 특정 채널만 cleanup하도록 수정                 |
| M-07      | supabase.raw() 존재하지 않는 메서드    | Supabase RPC 함수 방식으로 재작성              |
| 누락      | 최저시급 하드코딩                      | 신규 이슈 추가 (N-01, H-04에 통합)            |
| 누락      | StoreDashboard export let 구버전       | 신규 이슈 추가 (N-02)                          |

================================================================
## 이슈 전체 목록 (v2 최종 우선순위)
================================================================

### 🔴 CRITICAL — 즉시 해결 (오늘)

| ID    | 출처       | 이슈                          | 영향                        |
|-------|------------|-------------------------------|-----------------------------|
| C-01  | Security   | PIN 브루트포스 방어 없음      | 타인이 직원 행세, 급여 오염 |
| C-03  | CEO Review | Empty State + 스텝 안내 없음  | 신규 사용자 첫 화면에서 이탈|

### 🟠 HIGH — 이번 주 내

| ID    | 출처         | 이슈                          | 영향                           |
|-------|--------------|-------------------------------|--------------------------------|
| C-02  | Security     | 프롬프트 인젝션 취약점 (하향) | 챗봇 시스템 프롬프트 우회      |
| H-01  | Security     | PIN 인증 전략 확인            | 직원 개인정보 / UX 트레이드오프|
| H-02  | Security     | Realtime RLS 미검증           | 타 매장 데이터 수신 가능성     |
| H-03  | QA           | 재고 동시 차감 음수 가능      | DB 데이터 오염                 |
| H-04  | CEO Review   | 직원 등록 폼 용어 장벽        | 사장님 이탈, CS 증가           |
| N-02  | Code Review  | StoreDashboard $props() 미적용| Runes 절대 규칙 위반           |

### 🟡 MEDIUM — 다음 주

| ID    | 출처         | 이슈                          | 영향                        |
|-------|--------------|-------------------------------|-----------------------------|
| M-01  | QA           | Chart.js 메모리 누수          | 콘솔 에러, 화면 멈춤        |
| M-02  | QA           | PDF 모바일 레이아웃 (임시)    | 급여명세서 법적 효력 문제   |
| M-03  | QA           | 챗봇 리셋 UI 지연 표시        | 사용자가 사용 가능한데 포기 |
| M-04  | QA           | 근무 중 합계 불일치           | 사장님 숫자 불신            |
| M-05  | QA           | Realtime 중복 구독            | 매출 2배 표시               |
| M-06  | QA           | 주휴수당 월경계 기준 미표시   | 사장님 민원 발생            |
| M-07  | Security     | 챗봇 Race Condition           | 10회 제한 우회 가능         |

### ❌ 폐기

| ID    | 이유                                             |
|-------|--------------------------------------------------|
| H-05  | C-03과 중복 — C-03 하나로 합쳐서 해결           |
| N-01  | H-04 지시서에 통합 완료                          |

================================================================
## DB 마이그레이션 SQL (신규 — 작업 전 먼저 실행)
================================================================
※ Supabase Dashboard → SQL Editor → New Query → Run

```sql
-- =============================================
-- 패치 노트 1 마이그레이션
-- 실행일: 2026-04-06
-- =============================================

-- [C-01] PIN 브루트포스 방어 테이블
-- 비로그인 공개 라우트에서 서비스 역할 키로만 접근하므로 RLS 불필요
CREATE TABLE IF NOT EXISTS pin_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ip           TEXT NOT NULL,
  fail_count   INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, ip)
);

-- [H-03] 재고 원자적 차감 RPC 함수
CREATE OR REPLACE FUNCTION decrement_stock(item_id UUID, amount INT)
RETURNS INTEGER AS $$
  UPDATE menu_items
  SET current_stock = GREATEST(0, current_stock - amount)
  WHERE id = item_id AND current_stock >= amount
  RETURNING current_stock;
$$ LANGUAGE sql SECURITY DEFINER;

-- [M-07] 챗봇 사용량 원자적 증가 RPC 함수
CREATE OR REPLACE FUNCTION increment_chatbot_usage(p_store_id UUID)
RETURNS INTEGER AS $$
  UPDATE stores
  SET chatbot_usage_this_month = chatbot_usage_this_month + 1
  WHERE id = p_store_id AND chatbot_usage_this_month < 10
  RETURNING chatbot_usage_this_month;
$$ LANGUAGE sql SECURITY DEFINER;
```

================================================================
## Cursor 재점검 지시서
================================================================
※ 각 지시서를 Cursor Composer(Ctrl+I)에 그대로 복사해서 붙여넣기

---

### [C-01] PIN 브루트포스 방어 ★ 지시서 재작성

**문제:** /q/[store_id] 는 공개 라우트. PIN 4자리(10,000가지)를 자동화 스크립트로
전수 시도하면 반드시 뚫림. 시도 횟수 제한 로직 없음.

**설계 원칙:**
- /q/[store_id]는 비로그인 공개 라우트 → auth.uid() 기반 RLS 사용 불가
- pin_attempts 테이블은 서버(+page.server.ts)에서만 접근
- 서비스 역할 클라이언트로 처리 (RLS 우회, 서버에서만 사용)

```
아래 작업을 순서대로 진행해줘.

=== STEP 1: 환경변수 확인 ===
.env 파일에 SUPABASE_SERVICE_ROLE_KEY 가 있는지 확인해줘.
없으면 알려줘. (Supabase Dashboard → Settings → API → service_role 키에서 복사)

=== STEP 2: 서비스 역할 클라이언트 파일 생성 ===
src/lib/supabaseAdmin.ts 파일을 새로 만들어줘:

  import { createClient } from '@supabase/supabase-js';
  import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

  export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ⚠️ 이 파일은 +server.ts 또는 +page.server.ts 에서만 import할 것.
  // 절대 .svelte 파일 일반 script에서 import 금지.

=== STEP 3: +page.server.ts PIN 검증에 방어 로직 추가 ===
src/routes/q/[store_id]/+page.server.ts 에서
PIN 검증 로직(form action 또는 POST 핸들러)을 찾아줘.

검증 로직 앞에 아래를 추가해줘:

  import { supabaseAdmin } from '$lib/supabaseAdmin';

  // IP 추출 (프록시/CDN 환경 대응)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    getClientAddress();

  // 잠금 상태 확인
  const { data: attempt } = await supabaseAdmin
    .from('pin_attempts')
    .select('fail_count, locked_until')
    .eq('store_id', params.store_id)
    .eq('ip', ip)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    const remaining = Math.ceil(
      (new Date(attempt.locked_until).getTime() - Date.now()) / 60000
    );
    return fail(429, {
      error: `PIN 오류 횟수가 초과되었습니다. ${remaining}분 후 다시 시도해주세요.`
    });
  }

PIN 불일치 처리 부분에 아래 추가:
  const newCount = (attempt?.fail_count ?? 0) + 1;
  await supabaseAdmin
    .from('pin_attempts')
    .upsert({
      store_id: params.store_id,
      ip,
      fail_count: newCount,
      locked_until: newCount >= 5
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'store_id,ip' });

  return fail(401, { error: `PIN이 올바르지 않습니다. (${newCount}/5회)` });

PIN 일치 처리 부분에 아래 추가:
  await supabaseAdmin
    .from('pin_attempts')
    .delete()
    .eq('store_id', params.store_id)
    .eq('ip', ip);

절대 규칙:
- 기존 QR 출퇴근 정상 흐름 건드리지 말 것
- UI 에러 메시지는 한국어
- Runes 문법 유지
```

---

### [C-02] 프롬프트 인젝션 방어 (HIGH로 하향)

**전제 재확인:** 공격자 = 사장님 본인(자기 메뉴명을 직접 입력)이므로 외부 공격 경로
아님. sanitize는 좋은 코딩 습관으로 추가하되, 긴급도는 HIGH.

```
src/lib/components/StoreDashboard.svelte 에서
발주 버튼 onclick 핸들러를 찾아줘.

아래 sanitize 함수를 script 상단에 추가하고 적용해줘:

  function sanitizeName(raw: string): string {
    // 한글, 영문, 숫자, 공백, 기본 특수문자만 허용. 최대 30자.
    return raw.replace(/[^가-힣a-zA-Z0-9\s\(\)\-\.]/g, '').trim().slice(0, 30);
  }

적용 후:
  const safeName = sanitizeName(item.name);
  window.dispatchEvent(new CustomEvent('chatbot-send', {
    detail: {
      message: `${safeName} 재고가 ${item.current_stock}${item.unit} 남았어. 적정 발주량 알려줘`
    }
  }))

로직·변수·다른 함수 건드리지 말 것.
```

---

### [C-03] Empty State + 온보딩 스텝 안내 통합 (H-05 폐기 후 통합)

**설계 원칙:** H-05(스텝 인디케이터)와 C-03(Empty State)은 같은 조건(직원 0명)에서
같은 내용 → 하나로 합침. H-05는 별도로 실행하지 말 것.

```
src/routes/dashboard/+page.svelte 를 열어서 확인해줘.

직원 목록 또는 근무 현황 영역을 찾고,
employees 배열(또는 해당 data 변수)이 비어 있을 때(length === 0)
아래 UI를 {#if}/{:else} 분기로 보여줘.

=== 추가할 UI ===

<!-- 시작 가이드 배너 -->
<div class="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
  <p class="text-xs font-medium text-[#2563eb] mb-2">페이노트 시작 가이드</p>
  <div class="flex items-center gap-2 text-xs flex-wrap">
    <a href="/employees"
       class="flex items-center gap-1 font-semibold text-[#2563eb] hover:underline">
      <span class="rounded-full bg-[#2563eb] text-white w-5 h-5 flex items-center justify-center text-[10px]">1</span>
      직원 등록
    </a>
    <span class="text-gray-300">────</span>
    <span class="flex items-center gap-1 text-gray-400">
      <span class="rounded-full bg-gray-200 text-gray-500 w-5 h-5 flex items-center justify-center text-[10px]">2</span>
      출퇴근 기록
    </span>
    <span class="text-gray-300">────</span>
    <span class="flex items-center gap-1 text-gray-400">
      <span class="rounded-full bg-gray-200 text-gray-500 w-5 h-5 flex items-center justify-center text-[10px]">3</span>
      급여 확인
    </span>
  </div>
</div>

<!-- Empty State 카드 -->
<div class="rounded-2xl border border-gray-100 bg-white shadow-sm p-8 text-center">
  <div class="mx-auto mb-4 w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
    <Users class="w-6 h-6 text-[#2563eb]" />
  </div>
  <h3 class="text-lg font-semibold text-gray-900 mb-1">직원을 등록해보세요</h3>
  <p class="text-sm text-gray-500 mb-6">
    직원 등록 후 QR 출퇴근과 급여 자동 계산을 바로 시작할 수 있어요.
  </p>
  <a href="/employees"
     class="inline-block bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold rounded-xl px-6 py-3 transition-colors">
    첫 직원 등록하기
  </a>
</div>

주의:
- 기존 대시보드 데이터·로직 건드리지 말 것
- Runes 문법 유지
- lucide-svelte Users import 없으면 추가
- H-05 지시서는 별도로 실행하지 말 것 (이 작업으로 통합 완료)
```

---

### [H-01] PIN 인증 전략 확인 (해싱 여부 결정)

**전제 재정의:**
- PIN 4자리는 bcrypt 해싱해도 레인보우 테이블(10,000개)로 역산 가능 → 해싱 효과 제한적
- 사장님이 직원 PIN을 조회해야 하는 경우(직원이 잊어버림) → 해싱하면 조회 불가
- MVP 현실적 전략: 평문 저장 + C-01 브루트포스 방어로 보호
- 이미 해싱 중이면 그대로 유지 (더 안전하므로 건드리지 말 것)

```
아래 두 가지만 확인하고 결과를 알려줘. 코드 수정은 확인 후 결정.

[확인 1] src/routes/q/[store_id]/+page.server.ts 에서 PIN 비교 방식:
  - 입력값과 DB값을 === 단순 비교인지
  - 아니면 bcrypt.compare() 해시 비교인지

[확인 2] src/routes/employees/+page.svelte 또는 +page.server.ts 에서:
  - pin_code를 그대로 저장하는지
  - 해싱 후 저장하는지

결과 형식으로 알려줘:
  PIN 비교: [단순비교 / 해시비교]
  PIN 저장: [평문 / 해싱]

※ 결과에 따른 다음 행동:
  평문 + 단순비교 → C-01 완료로 충분. 추가 작업 없음.
  해싱 중 → 그대로 유지. 건드리지 말 것.
```

---

### [H-02] Realtime RLS 검증 (Supabase 직접 확인)

**코드 수정 아님 — 사람이 Supabase Dashboard에서 직접 클릭하는 항목.**

```
Supabase Dashboard에서 아래 순서로 확인해줘.

1. Authentication → Policies 이동

2. menu_items 테이블:
   □ "menu_items_store_own" 정책 존재 여부
   □ 정책 내용: store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
   □ FOR ALL 적용 여부

3. sales_records 테이블 동일하게 확인

4. Database → Replication 탭:
   □ menu_items, sales_records가 supabase_realtime publication에 포함됐는지
   □ RLS enabled 상태인지

이상 없으면 ✅, 문제 있으면 항목명과 증상 알려줘.
```

---

### [H-03] 재고 동시 차감 음수 방지 ★ 지시서 재작성

**문제:** supabase-js에 `.raw()` 메서드 없음 → RPC 함수로 교체.
※ 위 DB 마이그레이션 SQL에서 `decrement_stock` 함수 먼저 실행할 것.

```
src/lib/components/StoreDashboard.svelte 에서
handleSaveSale 함수 안의 menu_items UPDATE 쿼리를 찾아줘.

아래 RPC 방식으로 교체해줘:

  const { data: newStock, error } = await supabase
    .rpc('decrement_stock', { item_id: item.id, amount: qty });

  if (newStock === null || error) {
    stockErrorMsg = `${item.name} 재고가 부족합니다.`;
    return;
  }

  // 기존 liveMenuItems state 업데이트 패턴 유지
  liveMenuItems = liveMenuItems.map(m =>
    m.id === item.id ? { ...m, current_stock: newStock } : m
  );

$state 변수 추가:
  let stockErrorMsg = $state('');

모달 내 저장 버튼 위에 에러 메시지 표시:
  {#if stockErrorMsg}
    <p class="text-sm text-red-500 mt-2">{stockErrorMsg}</p>
  {/if}

저장 성공 시 초기화:
  stockErrorMsg = '';

로딩 상태(isSaving) 로직은 건드리지 말 것.
```

---

### [H-04] 직원 등록 폼 용어 개선 + 최저시급 하드코딩 제거

**추가 주의:** 최저시급 숫자는 하드코딩 금지. 연도만 동적으로 표시.

```
src/routes/employees/+page.svelte 에서
직원 등록/수정 폼을 찾아서 아래 텍스트만 교체해줘.
로직·변수·바인딩 절대 건드리지 말 것.

[교체 목록]
"주당 계약 근무일" → "일주일에 며칠 일하나요?"
"근무일수" (라벨) → "주당 근무일"
"PIN 코드" 또는 "핀코드" (라벨) → "출퇴근 PIN 번호 (4자리)"

PIN 입력 필드 바로 아래:
<p class="text-xs text-gray-400 mt-1">
  이 번호를 직원에게 알려주세요. QR 출퇴근 시 사용합니다.
</p>

시급 입력 필드 바로 아래 (숫자 하드코딩 금지 — 연도만):
<p class="text-xs text-gray-400 mt-1">
  {new Date().getFullYear()}년 최저시급은 고용노동부 홈페이지에서 확인하세요.
</p>
```

---

### [N-02] StoreDashboard $props() 적용 (Runes 절대 규칙 위반 수정)

**문제:** STORE_DASHBOARD_HANDOVER 지시서에서 `export let` 구버전 문법으로 작성됨.

```
src/lib/components/StoreDashboard.svelte 상단 script 블록을 확인해줘.

Props 정의 부분이 아래처럼 돼 있으면:
  export let menuItems: any[] = [];
  export let todaySales: any[] = [];
  export let storeId: string = '';

Runes 문법으로 교체해줘:
  let { menuItems = [], todaySales = [], storeId = '' } = $props<{
    menuItems: any[];
    todaySales: any[];
    storeId: string;
  }>();

이미 $props() 방식이면 건드리지 말 것.
다른 로직·변수 절대 수정 금지.
```

---

### [M-01] Chart.js 메모리 누수 방어

```
src/lib/components/StoreDashboard.svelte 에서
Chart.js 초기화 $effect 블록을 찾아줘.

아래 3가지 점검 후 없으면 추가:

1. $effect cleanup 함수 확인:
   $effect(() => {
     // ... Chart 생성 ...
     return () => chartInstance?.destroy();  ← 이게 있는지
   });

2. onDestroy 추가 (unmount 시 확실한 파괴):
   import { onDestroy } from 'svelte';
   onDestroy(() => {
     chartInstance?.destroy();
     chartInstance = null;
   });

3. Chart 재생성 전 기존 인스턴스 파괴:
   if (chartInstance) {
     chartInstance.destroy();
     chartInstance = null;
   }
   chartInstance = new Chart(canvasEl, { ... });

기존 차트 데이터·옵션 건드리지 말 것.
```

---

### [M-02] PDF 모바일 레이아웃 (임시 대응)

**중요:** width 고정은 응급 처리. 근본 해결(서버사이드 PDF)은 별도 로드맵 항목.

```
src/routes/payroll/+page.svelte 에서
generatePDF() 함수 안의 html2canvas 호출 부분을 찾아줘.

캡처 전 너비 강제 지정 + 옵션 추가:

  const prevWidth = element.style.width;
  element.style.width = '800px';

  const canvas = await html2canvas(element, {
    scale: 2,
    width: 800,
    windowWidth: 800,
    useCORS: true,
    logging: false
  });

  element.style.width = prevWidth;  // 원복

기존 jsPDF 처리 로직 건드리지 말 것.
```

---

### [M-03] 챗봇 사용량 리셋 UI 지연 수정

```
src/lib/components/LaborChatbot.svelte 에서
챗봇 모달 open 시점(isOpen이 true로 바뀌는 시점)을 찾아줘.

아래 낙관적 리셋 로직을 추가해줘:

  const nowKSTMonth = new Date(Date.now() + 9 * 3600 * 1000)
    .toISOString().slice(0, 7); // 'YYYY-MM'
  if (resetMonth && resetMonth !== nowKSTMonth) {
    usageCount = 0;
  }

usageCount, resetMonth 변수명은 기존 코드 확인 후 실제 변수명으로 교체.
API 호출 로직·서버 엔드포인트 건드리지 말 것.
```

---

### [M-04] 근무 중 합계 캡션 추가

```
src/routes/payroll/+page.svelte 에서
월간 급여 합계 요약 카드의 "최종 지급액" 표시 부분 아래에 추가:

<p class="text-xs text-gray-400 mt-1">
  ※ 현재 근무 중인 직원의 예상 금액이 포함될 수 있습니다.
</p>

계산 로직·데이터 건드리지 말 것. 텍스트 추가만.
```

---

### [M-05] Realtime 중복 구독 방어 ★ 지시서 재작성

**문제:** removeAllChannels()는 챗봇 등 다른 컴포넌트 채널까지 끊음 → 절대 금지.
채널명 고유화 + 해당 채널만 cleanup하면 충분.

```
src/lib/components/StoreDashboard.svelte 에서
Supabase Realtime 채널 구독 $effect 블록을 찾아줘.

아래처럼 수정해줘:

1. 채널명 고유화:
   현재: .channel('store-realtime')  또는 유사한 이름
   변경: .channel(`store-dashboard-${storeId}`)

2. removeAllChannels() 절대 사용 금지

3. $effect 구조:
   $effect(() => {
     const channel = supabase
       .channel(`store-dashboard-${storeId}`)
       .on(...)
       .subscribe();

     return () => supabase.removeChannel(channel);  ← 반드시 있어야 함
   });

4. cleanup 함수(return 부분) 없으면 반드시 추가.

기존 Realtime 이벤트 핸들러 로직 건드리지 말 것.
```

---

### [M-06] 주휴수당 월경계 기준 안내 추가

```
src/routes/payroll/+page.svelte 에서
주휴수당 상세 펼침 영역(ChevronDown 클릭 시 열리는 부분)의
주차별 내역 최하단에 추가:

<p class="text-xs text-gray-400 mt-3">
  ※ 주 단위는 일요일 기준으로 구분됩니다.
  월말에 걸친 주는 시작일(일요일)이 속한 달의 급여에 포함됩니다.
</p>

로직·계산 건드리지 말 것. 텍스트 추가만.
```

---

### [M-07] 챗봇 Race Condition 방어 ★ 지시서 재작성

**문제:** supabase-js에 `.raw()` 없음 → RPC 함수로 교체.
※ 위 DB 마이그레이션 SQL에서 `increment_chatbot_usage` 함수 먼저 실행할 것.

```
src/routes/api/chat/+server.ts 에서
chatbot_usage_this_month 업데이트 로직을 찾아줘.

기존 SELECT → 체크 → UPDATE 방식을 아래 RPC 방식으로 교체해줘:

  const { data: newUsage, error } = await locals.supabase
    .rpc('increment_chatbot_usage', { p_store_id: locals.storeId });

  if (newUsage === null || error) {
    return new Response(
      JSON.stringify({ error: '이번 달 무료 자문 횟수를 모두 사용했습니다.' }),
      { status: 429 }
    );
  }
  // newUsage = 업데이트 후 사용 횟수 (필요 시 응답에 포함 가능)

기존 KST 월 리셋 로직은 건드리지 말 것.
```

================================================================
## 작업 순서 가이드 (v2 최종)
================================================================

### Day 1 (오늘) — DB 마이그레이션 + CRITICAL

0. Supabase SQL Editor에서 위 마이그레이션 SQL 전체 실행 (필수 선행)
1. [C-01] Cursor에서 PIN 브루트포스 방어 구현
2. [C-03] Cursor에서 Empty State + 스텝 안내 통합 UI 추가

### Day 2~3 — HIGH

3. [C-02] Cursor에서 프롬프트 인젝션 sanitize 추가
4. [H-01] Cursor에서 PIN 저장 방식 확인 → 결과를 Claude에 보고 후 결정
5. [H-02] Supabase Dashboard에서 직접 RLS 확인 (코드 아님)
6. [H-03] Cursor에서 재고 RPC 쿼리 교체
7. [H-04] Cursor에서 직원 등록 폼 용어 수정
8. [N-02] Cursor에서 StoreDashboard $props() 적용

### Day 4~7 — MEDIUM

9.  [M-01] Chart.js cleanup 점검 및 onDestroy 추가
10. [M-02] PDF html2canvas 너비 고정 (임시 대응)
11. [M-03] 챗봇 월 리셋 UI 낙관적 업데이트
12. [M-04] 근무 중 합계 캡션 추가
13. [M-05] Realtime 채널명 고유화 + cleanup 강화
14. [M-06] 주휴수당 월경계 안내 캡션 추가
15. [M-07] 챗봇 Race Condition RPC 교체

================================================================
## 로드맵 메모 (이번 패치 범위 외 — 나중에 설계 필요)
================================================================

- PDF: html2canvas(이미지) → 서버사이드 PDF 또는 @react-pdf/renderer 전환
- PIN 인증: 4자리 PIN → 향후 PIN 재발급 UI 추가 후 해싱 전환 검토
- 최저시급: 안내 문구에서 숫자 제거 완료 →
  향후 관리자 설정 UI 또는 고용노동부 연동으로 정식 관리 검토

================================================================
## 다음 세션 시작 예시
================================================================

**패치 완료 후 재점검 세션:**
```
안녕! 패치 노트 1 (v2) 기반으로 Cursor에서 작업을 진행했어.
PATCHNOTE_1_v2026-04-06.md 참고해줘.

완료한 항목: [C-01, C-03, H-03, H-04, N-02]
미완료 항목: [H-01 확인 결과 평문 저장이었음]

H-01 대응 방법 설계해줘.
```

**다음 기능 세션:**
```
안녕! 패치 노트 1 작업이 끝났어.
HANDOVER_v2026-03-31.md 와 PATCHNOTE_1_v2026-04-06.md 참고해줘.

다음 기능으로 카카오톡 급여명세서 전송을 시작하고 싶어.
설계부터 검토해줘.
```

================================================================
## 절대 규칙 (v2 추가 항목 반영)
================================================================
1. [Runes]    모든 .svelte → $state, $derived, $effect, $props() 사용
              export let 절대 금지
2. [타임존]   DB 타임스탬프 → parseUtc() / input 값 → new Date() 직접
3. [API 키]   ANTHROPIC_API_KEY → +server.ts 에서만, $env/static/private
4. [서비스 키] SUPABASE_SERVICE_ROLE_KEY → +page.server.ts / +server.ts 에서만
              절대 클라이언트 노출 금지
5. [챗봇 모델] claude-haiku-4-5-20251001 고정
6. [금액]     toLocaleString('ko-KR') + '원'
7. [주휴수당 0원] "0원" 금지 → "해당없음"
8. [로딩]     비동기 작업 중 버튼 비활성화 필수
9. [한국어]   모든 UI 텍스트 한국어
10. [하드코딩 금지] 최저시급 숫자, storeId 등 변경 가능한 값 코드에 직접 넣지 말 것
11. [Realtime] removeAllChannels() 절대 사용 금지 — 특정 채널만 removeChannel()
12. [RPC]     supabase.raw() 존재하지 않음 — 원자적 연산은 supabase.rpc() 사용
