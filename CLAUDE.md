# PayNote — F&B 근태·급여 노트

## Project Overview
PayNote: 매장 직원 근태 관리. QR 코드 기반 출퇴근 체크인, 급여 계산, 대시보드 제공.

## Tech Stack
- **Frontend**: SvelteKit (SSR + CSR), Tailwind CSS, Lucide Icons
- **Backend**: Supabase (PostgreSQL, Auth)
- **Time**: Temporal API

## Project Structure
```
src/
  routes/        # UI pages (Dashboard, Employees, Timecards)
  lib/
    payroll.ts   # 급여 계산 로직
    qrcode.ts    # QR 코드 생성/검증
```

## Code Style
- Component-based UI (SvelteKit components)
- Strict TypeScript (`strict: true`)
- Tailwind utility classes (no custom CSS unless necessary)
- No `any` types — define proper interfaces

## Commands
```bash
npm run dev      # Dev server
npm run build    # Production build
npm run check    # Svelte type check
```

## Health Stack

- typecheck: `npm run check`
- lint: `npm run lint` — `eslint src` (`.ts` + `.svelte`, 브라우저/Node `globals` 적용). 경고 0 목표 시 `npm run lint:strict`
- test: `npm run test`
- deadcode(로컬 완화): `npm run deadcode` (`knip --no-exit-code`)
- deadcode(CI): `npm run deadcode:ci` (knip, 미사용 export 시 실패 — 일부 공개 유틸은 [`knip.json`](knip.json) `ignoreIssues`로 제외)
- shell: not-configured

## CI (GitHub Actions)

`main` / `master`에 대한 push·PR: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — `npm ci` → check → lint → test → **deadcode:ci** → build.

## 릴리즈 전 에이전트 루틴 (gstack)

기능 완료·머지 직전: **health** → **qa** 또는 **browse** (스킬 경로: `.agents/skills/gstack/`).

### 에이전트 스모크 한 사이클 (권장)

1. `npm run dev` — 기본 URL `http://localhost:5173`
2. gstack **browse** / **qa**로 로그인·대시보드·직원/급여 등 핵심 플로우 확인
3. 인증이 필요하면 **setup-browser-cookies**로 실제 브라우저 쿠키 가져오기: [setup-browser-cookies 스킬](.agents/skills/gstack/setup-browser-cookies/SKILL.md)

## 배포·빌드

- [`svelte.config.js`](svelte.config.js): `@sveltejs/adapter-node` — `npm run build` 후 `node build/index.js`로 프리뷰(PORT 기본 3000). Windows·CI에서 symlink 문제 없음.
- Vercel 등에 올릴 때는 해당 플랫폼용 `@sveltejs/adapter-*`로 교체 가능(로컬 Windows는 `adapter-vercel` 빌드가 symlink로 실패할 수 있음).
- **프로덕 URL**: (배포 후 여기에 기입) — 헬스 체크 예: `GET /` 200.
- gstack **setup-deploy** / 머지 후 **canary**·**land-and-deploy**: [.agents/skills/gstack/](.agents/skills/gstack/) 참고.

## PR 체크리스트 (DB / KST)

- Supabase 스키마·마이그레이션·`insert`/`update` 변경: [.cursor/skills/db-safe-update/SKILL.md](.cursor/skills/db-safe-update/SKILL.md)
- 날짜·타임존·근태/급여 기간 필터: [.cursor/skills/kst-timezone-guard/SKILL.md](.cursor/skills/kst-timezone-guard/SKILL.md)
