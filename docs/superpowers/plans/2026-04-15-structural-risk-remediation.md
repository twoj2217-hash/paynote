# 구조 리스크 개선 우선순위 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진단 결과에서 확인된 운영 구조 리스크(산출물 누적, 헬스체크 공백, QA 추적성 부족)를 우선순위대로 제거한다.

**Architecture:** 1단계는 저장소 오염 방지(.gitignore)로 리스크를 즉시 차단한다. 2단계는 최소 품질 게이트(lint/test/deadcode)를 도입해 결함 탐지 공백을 줄인다. 3단계는 QA 리포트 메타데이터 자동화를 추가해 회귀 추적성과 운영 가시성을 높인다.

**Tech Stack:** SvelteKit, TypeScript, npm scripts, ESLint, Vitest, Knip, Node.js script

---

## 파일 구조(선반영 설계)

- Create: `.gitignore`
  - 책임: 로컬 QA/벤치마크 산출물과 민감한 운영 아티팩트가 저장소에 누적되지 않도록 차단
- Modify: `package.json`
  - 책임: lint/test/deadcode 실행 커맨드를 표준화
- Create: `eslint.config.mjs`
  - 책임: SvelteKit + TS 기준의 기본 lint 규칙 정의
- Create: `src/lib/utils/smoke.test.ts`
  - 책임: 테스트 파이프라인 동작을 보장하는 최소 스모크 테스트
- Create: `tools/qa/report-meta.mjs`
  - 책임: QA 리포트 생성 시 branch/commit/date 메타데이터를 자동 주입
- Modify: `CLAUDE.md`
  - 책임: 실제 실행 가능한 `## Health Stack` 명령으로 업데이트
- Modify: `PROGRAM_HANDOVER.md`
  - 책임: 운영 절차(리포트 생성, 헬스체크, QA 규칙) 문서화

---

### Task 1: 저장소 오염 방지(.gitignore) [우선순위 P0]

**Files:**
- Create: `.gitignore`
- Test: `.gitignore` 규칙 검증 커맨드

- [ ] **Step 1: .gitignore 초안 작성**

```gitignore
# 로컬 환경 변수 파일 제외
.env
.env.*

# gstack/QA 로컬 산출물 제외
.gstack/

# 빌드 산출물 제외
.svelte-kit/
dist/

# 테스트/커버리지 임시 산출물 제외
coverage/
*.log
```

- [ ] **Step 2: 규칙이 실제로 적용되는지 확인**

Run: `git check-ignore -v .gstack/qa-reports/qa-report-localhost-2026-04-15.md`  
Expected: `.gitignore` 규칙 라인이 출력되고 ignore 처리됨

- [ ] **Step 3: 루트 정책 충돌 확인**

Run: `git check-ignore -v CLAUDE.md`  
Expected: 출력 없음(문서 파일은 추적 대상 유지)

- [ ] **Step 4: 커밋**

```bash
git add .gitignore
git commit -m "chore: ignore local gstack and build artifacts"
```

---

### Task 2: 품질 게이트 최소 세트 구축 [우선순위 P1]

**Files:**
- Modify: `package.json`
- Create: `eslint.config.mjs`
- Create: `src/lib/utils/smoke.test.ts`
- Test: `npm run lint`, `npm run test`, `npm run deadcode`

- [ ] **Step 1: lint/test/deadcode용 dev dependency 추가**

```bash
# lint, test, dead code 최소 구성
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-svelte vitest knip
```

Expected: `package.json`의 `devDependencies`에 항목 추가

- [ ] **Step 2: ESLint 설정 파일 생성**

```javascript
// SvelteKit + TypeScript 기본 lint 설정
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  js.configs.recommended, // JS 기본 규칙
  ...tseslint.configs.recommended, // TS 기본 규칙
  ...svelte.configs['flat/recommended'], // Svelte 권장 규칙
  {
    files: ['**/*.{js,ts,svelte}'],
    rules: {
      'no-console': 'warn' // 운영 전 경고로 관리
    }
  }
];
```

- [ ] **Step 3: package.json scripts에 실행 명령 추가**

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "test": "vitest run",
    "deadcode": "knip"
  }
}
```

- [ ] **Step 4: 테스트 파이프라인 스모크 테스트 추가**

```ts
// 테스트 런너 동작 확인용 최소 테스트
import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('기본 산술이 정상 동작한다', () => {
    expect(1 + 1).toBe(2); // 가장 단순한 PASS 기준
  });
});
```

- [ ] **Step 5: 명령별 검증 실행**

Run: `npm run lint`  
Expected: exit code 0 또는 경고만 출력

Run: `npm run test`  
Expected: `1 passed` 출력

Run: `npm run deadcode`  
Expected: 실행 완료(초기 경고 가능)

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json eslint.config.mjs src/lib/utils/smoke.test.ts
git commit -m "chore: add baseline lint test and deadcode quality gates"
```

---

### Task 3: Health Stack를 실행 가능한 상태로 업데이트 [우선순위 P1]

**Files:**
- Modify: `CLAUDE.md`
- Test: Health Stack 명령 정합성 검증

- [ ] **Step 1: `CLAUDE.md`의 Health Stack 항목 수정**

```markdown
## Health Stack

- typecheck: npm run check
- lint: npm run lint
- test: npm run test
- deadcode: npm run deadcode
- shell: not-configured
```

- [ ] **Step 2: 문서 명령이 실제로 실행 가능한지 확인**

Run: `npm run check && npm run lint && npm run test`  
Expected: 각 명령이 순서대로 실행되고 치명적 실패 없이 종료

- [ ] **Step 3: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: align health stack with executable project commands"
```

---

### Task 4: QA 리포트 추적성 자동화 [우선순위 P2]

**Files:**
- Create: `tools/qa/report-meta.mjs`
- Modify: `PROGRAM_HANDOVER.md`
- Test: 메타데이터 생성 스크립트 검증

- [ ] **Step 1: QA 메타데이터 생성 스크립트 작성**

```js
// QA 리포트 헤더에 넣을 메타데이터를 JSON으로 생성
import { execSync } from 'node:child_process';

const safe = (cmd, fallback = 'unknown') => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback; // git 미연결 환경 fallback
  }
};

const payload = {
  date: new Date().toISOString(),
  branch: safe('git branch --show-current', 'unknown'),
  commit: safe('git rev-parse --short HEAD', 'unknown')
};

process.stdout.write(JSON.stringify(payload, null, 2));
```

- [ ] **Step 2: 스크립트 실행 확인**

Run: `node tools/qa/report-meta.mjs`  
Expected: `date`, `branch`, `commit` JSON 출력

- [ ] **Step 3: 핸드오버 문서에 운영 절차 추가**

```markdown
## QA 리포트 메타데이터 규칙

1. QA 시작 전 `node tools/qa/report-meta.mjs` 실행
2. 출력된 `branch`, `commit`을 리포트 헤더에 기록
3. `unknown`이면 저장소 연결 상태를 먼저 점검
```

- [ ] **Step 4: 커밋**

```bash
git add tools/qa/report-meta.mjs PROGRAM_HANDOVER.md
git commit -m "docs: standardize qa report metadata capture workflow"
```

---

## 최종 검증 체크리스트

- [ ] `npm run check` 성공
- [ ] `npm run lint` 성공 또는 허용 경고만 존재
- [ ] `npm run test` 성공
- [ ] `npm run deadcode` 실행 결과 확보
- [ ] `.gstack/*` 경로 ignore 동작 확인
- [ ] QA 리포트에 `branch/commit` 채워지는 절차 검증

## 롤아웃 순서(권장)

1. Task 1 먼저 적용, 운영 리스크 즉시 차단  
2. Task 2~3 연속 적용, 품질 게이트 및 헬스체크 연결  
3. Task 4 적용, QA 추적성 강화  

## 리스크/의사결정 메모

- ESLint/Knip 도입 시 초기 경고가 다수 발생할 수 있음, 초기에는 “차단”보다 “가시화”를 우선
- `shell` 항목은 실제 `.sh` 운영 스크립트가 정착될 때 활성화
- git 미연결 환경에서도 QA는 가능해야 하므로 메타데이터 스크립트 fallback 유지
