---
name: db-safe-update
description: >-
  Safe workflow when changing Supabase/PostgreSQL schema: list affected columns,
  map related Svelte UI, verify NOT NULL on inserts/updates, and get explicit
  user approval before editing files. Use when editing SQL migrations or schema
  files (*.sql), supabase/migrations, or code that uses createClient, .from(),
  insert, update, upsert, RPC, or Supabase types.
---

# DB 안전 업데이트 (Supabase + Svelte)

Supabase DB 스키마나 DB 연동 코드를 바꿀 때 **파일을 수정하기 전**에 아래 순서를 따른다.

## 적용 시점 (트리거)

- `*.sql` 파일, `supabase/migrations/**`, 스키마/마이그레이션 관련 편집
- `createClient`, `@supabase/supabase-js`, `.from(`, `.insert(`, `.update(`, `.upsert(`, `.rpc(` 등 Supabase 클라이언트 사용 코드 변경
- DB 컬럼/테이블명을 다루는 TypeScript 타입·쿼리 변경

## 필수 워크플로 (코드/파일 수정 전)

### 1. 변경될 DB 컬럼 목록 먼저 제시

- 마이그레이션/SQL diff 기준으로 **테이블명 · 컬럼명 · 변경 유형**(추가/삭제/타입 변경/NOT NULL 변경 등)을 bullet 목록으로 정리한다.

### 2. 연관된 Svelte·프론트 파일 목록 제시

- grep/검색으로 해당 테이블명·컬럼명·`from('테이블')` 호출이 있는 파일을 찾는다.
- **우선 검색 위치**: `src/routes/**`, `src/lib/**` (폼, 서버 로드, 액션, 스토어)
- 후보 파일 경로를 목록으로 나열한다 (불확실하면 “추가 확인 필요”로 표시).

### 3. NOT NULL 자동 점검

- 스키마에서 **NOT NULL** 인 컬럼을 식별한다 (새로 NOT NULL이 된 컬럼 포함).
- 프로젝트 내 **insert / update / upsert** 호출을 훑어, 해당 컬럼에 값이 항상 들어가는지 확인한다.
- 누락 가능성이 있으면 **구체적 파일·라인 근거**와 함께 경고한다.
- 프로젝트 규칙: Insert/Update 시 NOT NULL 컬럼 누락 없어야 함.

### 4. 수정 전 사용자 확인 (필수)

- 실제로 패치를 적용하기 **전에** 반드시 다음을 묻는다:

  > **이 파일들을 바꿔도 될까요?**  
  > (변경 컬럼 요약 + 수정 예정 파일 목록을 짧게 다시 붙인다.)

- 사용자가 동의하기 전에는 **어떤 파일도 수정하지 않는다** (분석·검색·목록 제시만 허용).

- 사용자가 범위를 줄이거나 특정 파일만 허용하면 그 범위만 수정한다.

## 프로젝트별 상수 (이 저장소)

- 시간 처리: **KST(한국 표준시)** 기준 유지.
- `store_id` 등 식별자 **더미 하드코딩 금지** — 기존 패턴(세션/스토어 컨텍스트)을 따른다.

## 출력 템플릿 (권장)

에이전트는 확인 요청 전에 아래 형태로 한 번에 정리한다.

```markdown
## DB 변경 요약
- 테이블 `…`: 컬럼 `…` — (추가|삭제|타입 변경|NOT NULL …)

## NOT NULL 점검
- …

## 수정이 필요할 수 있는 파일
- `path/…`
- …

## 확인
이 파일들을 바꿔도 될까요? (원하시면 범위를 지정해 주세요.)
```
