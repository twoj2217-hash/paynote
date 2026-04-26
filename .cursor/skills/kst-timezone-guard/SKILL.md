---
name: kst-timezone-guard
description: >-
  Enforces Korea Standard Time (Asia/Seoul) for dates and timestamps: UTC↔KST
  conversion, avoiding server/client calendar drift, and correct Supabase
  timestamptz and date column handling. Use when writing or editing code that
  uses Date, time, clock_in, clock_out, work shifts, payroll periods, filters
  by day/month, or inserts/updates timestamptz or date columns in Supabase.
---

# KST 시간대 가드 (Asia/Seoul)

날짜·시간·근태(`clock_in` / `clock_out`)·Supabase `timestamptz` / `date` 를 다룰 때 **항상 한국 표준시(KST)** 기준으로 통일한다.

## 트리거 (이 스킬을 적용할 때)

- `Date`, `toISOString`, `datetime-local`, 달력/필터용 연·월·일
- `clock_in`, `clock_out`, 근무일, 급여 기간, 타임카드
- Supabase에 시각·날짜 컬럼 `insert` / `update` / `upsert` / RPC 인자

## 원칙

1. **캘린더 날짜(`date` 컬럼, YYYY-MM-DD)**  
   - **항상 KST 기준 “그날”**으로 계산한다.  
   - 로컬 PC 타임존에 의존하지 않는다.

2. **순간 시각(`timestamptz`, 출퇴근 시각)**  
   - DB에는 관례적으로 **UTC로 저장된 ISO 문자열**(`toISOString()` 등)을 넣어도 된다(PostgreSQL `timestamptz`가 해석).  
   - **화면·입력·비교**에서는 KST로 보이게 변환하거나, 같은 기준(UTC 또는 KST)으로만 연산한다.

3. **SSR(SvelteKit) + 브라우저**  
   - “오늘”, “이번 달”을 서버와 클라이언트에서 각각 `new Date()`만 쓰면 **UTC vs 로컬**로 하루 어긋날 수 있다.  
   - **방지**: KST로 명시하거나, `+page.server.ts`의 `load`에서 KST 날짜를 한 번 계산해 `data`로 내려준다.

## 필수 패턴 (에이전트가 코드에 반영)

### 1) KST 기준 오늘(또는 임의 일) — `date` 컬럼·필터용

```ts
// KST 기준 캘린더 날짜 YYYY-MM-DD (로컬 OS 타임존 무관)
const kstYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
```

월만 필요하면 `slice(0, 7)`, 연·월 분리는 `split('-')` 등 기존 프로젝트 패턴과 맞출 것.

### 2) UTC ↔ KST 표시/입력 (datetime-local, 표 포맷)

- DB/ISO 문자열(UTC 기준 해석) → 사용자에게 KST로 보이게 할 때: **`Intl.DateTimeFormat` + `timeZone: 'Asia/Seoul'`** 또는 프로젝트에 있는 동일 목적 헬퍼를 쓴다.  
- **9시간을 수동으로 더하거나 빼는 것**은 한 곳에만 두고, 주석으로 “KST 오프셋”임을 적어 중복·이중 보정을 막는다.

### 3) Supabase `timestamptz` 넣을 때

- **값**: 가능하면 **명시적 UTC ISO** (`new Date().toISOString()` 또는 서버에서 동일 의미의 시각).  
- **검증**: “한국 날짜 하루”로 묶는 필터는 **`date` 컬럼(KST YYYY-MM-DD)** 또는 KST로 잘린 범위와 함께 쓰는지 확인한다.  
- 클라이언트만으로 “자정 넘김”과 “서버 UTC 날짜”가 어긋나지 않게 하려면 **비즈니스 날짜는 위 1) 패턴**을 쓴다.

### 4) 서버/클라이언트 9시간·날짜 어긋남 방지 체크리스트

코드 작성 시 아래를 스스로 점검한다.

- [ ] “오늘/이번 달”이 **SSR 첫 페인트**와 **클라이언트 하이드레이션** 후에도 같은 KST 날짜인가? (필요 시 `load`에서 전달)
- [ ] `date` 비교·insert에 **`toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })`** 또는 동등한 KST 고정 로직이 있는가?
- [ ] 타임존 없는 `YYYY-MM-DD` 문자열을 `new Date('YYYY-MM-DD')`로 파싱해 **UTC 자정으로 해석**되는 실수를 피했는가? (필요 시 문자열을 쪼개서 년월일로 처리하거나 KST 헬퍼 사용)

## 금지·주의

- 로컬만 믿는 “오늘”: `new Date()`만으로 날짜 문자열을 만들어 `date` 컬럼에 넣지 말 것.  
- **DST 없는 KST**이지만, 코드에서는 **항상 `Asia/Seoul`** 이름을 쓰고 고정 `+9`만 하드코딩하지 말 것(유지보수·일관성). 예외적으로 오프셋 산술을 쓰면 **한 모듈/함수로 모을 것**.

## 출력 시 (에이전트)

- 관련 변경에는 **짧은 한국어 주석**으로 “KST 기준”임을 표시한다 (프로젝트 규칙과 동일).  
- 새 헬퍼를 여러 파일에 복붙하기보다, 기존 `$lib` 패턴이 있으면 그쪽으로 모은다.
