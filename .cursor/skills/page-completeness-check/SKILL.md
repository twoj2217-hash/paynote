---
name: page-completeness-check
description: >-
  Verifies new SvelteKit +page.svelte files for loading UI, Korean error
  messages, empty states, mobile-first layout, and no hardcoded store_id. Use
  when creating or substantially adding a new +page.svelte, or when the user
  asks to review a new page for completeness.
---

# Svelte 페이지 완성도 점검 (+page.svelte)

새 `+page.svelte`를 만들거나 큰 덩어리를 추가한 뒤, **저장·완료 전**에 아래 항목을 순서대로 확인한다. 누락이 있으면 코드를 보완한다.

## 적용 시점 (트리거)

- 새 `+page.svelte` 파일을 생성·편집할 때
- 라우트 폴더에 페이지 UI를 처음 구성할 때
- 사용자가 “페이지 점검”, “완성도”, “체크리스트” 등을 요청할 때

## 점검 체크리스트

### 1. 로딩 처리

- **비동기 데이터 로드**(fetch, Supabase `select` 등)가 있으면:
  - 로딩 스피너(예: `lucide-svelte` Loader 아이콘 + `animate-spin`), **또는**
  - 해당 구간의 버튼 `disabled` + 로딩 문구
- 로딩 중에 빈 화면만 보이면 안 됨.

### 2. 에러 메시지 (한국어)

- `try/catch`, `.error`, 실패 분기에서 **사용자에게 보이는 문구**는 한국어로 작성.
- 개발자용 `console.error`만 있고 UI 안내가 없으면 보완.

### 3. 빈 데이터(Empty State)

- 리스트·테이블·카드 등 **데이터 배열/행이 0건**일 수 있는 화면이면:
  - “아직 데이터가 없습니다” 등 **안내 문구**와, 필요 시 다음 행동(등록 버튼 링크 등)을 표시.
- 로딩 끝난 뒤에도 내용 없이 빈 컨테이너만 두지 않음.

### 4. 모바일 우선(Mobile-first)

- Tailwind: 기본 클래스는 **좁은 화면** 기준, `sm:` / `md:` / `lg:` 로 확장.
- 터치 영역·여백·폰트 크기가 모바일에서 읽기·누르기 어렵지 않은지 확인.
- 가로 스크롤이 생기지 않도록 주요 레이아웃 점검.

### 5. store_id 하드코딩 금지

- **금지**: 임의 UUID, 고정 `store_id` 문자열, 테스트용 매장 ID를 페이지에 박아 넣기.
- **허용**: `$page.params`, 부모 레이아웃 `data`, 세션/스토어에서 넘어온 값, 서버 `load`에서 주입된 `store_id` 등 기존 프로젝트 패턴.
- 의심되면 `grep`으로 `store_id`, UUID 형태 리터럴을 검색해 확인.

## 빠른 자가 점검 (에이전트용)

편집 후 한 번에 훑을 때:

1. `loading` / `pending` / `spinner` / `animate-spin` / 버튼 `disabled` 존재 여부
2. 사용자-facing 에러 문자열이 한국어인지
3. `.length === 0` 또는 유사 분기에 Empty UI 있는지
4. 레이아웃 클래스가 `sm:` 등으로 확장되는지, 모바일에서 과도하게 좁지 않은지
5. `store_id` = 하드코딩 리터럴 없음

## 출력 (사용자에게 보고할 때)

누락 항목이 있으면 **항목 번호 + 파일 내 위치(대략)** + **권장 수정 한 줄**로 짧게 정리한다. 모두 충족이면 “5항목 충족”만 알려도 됨.
