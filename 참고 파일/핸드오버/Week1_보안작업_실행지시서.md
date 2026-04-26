# PayNote · Week 1 보안 작업 실행 지시서
**작성일**: 2026-04-22  
**대상**: 비개발자 1인 (바이브 코딩 환경: Cursor + Vercel + Supabase)  
**목표**: 베타 오픈 전 최소한의 보안 바닥을 다진다  
**총 예상 시간**: 실작업 12~16시간 (5~7일에 나눠서 진행 권장)

---

## ⚠️ 시작하기 전에 반드시 읽기

### 이 문서를 쓰는 방법
1. 이 파일을 **PayNote 프로젝트 루트**에 `Week1_보안작업_실행지시서.md`로 저장하세요.
2. Cursor에서 PayNote 프로젝트를 열고, 이 파일을 참고 문서로 띄워두세요.
3. 각 Task의 **"🤖 Cursor에 붙여넣을 프롬프트"** 블록을 복사해서 Cursor Chat(Ctrl/Cmd + L)에 붙여넣으세요.
4. AI가 코드를 제안하면 **Accept(수락) 누르기 전에 반드시 이 문서의 검증 단계부터 확인**하세요.
5. 각 Task가 끝날 때마다 `[ ]` 체크박스에 `[x]` 체크 표시를 넣고 저장하세요.

### 작업 순서 (절대 건너뛰지 마세요)
```
Task 0: 준비 (백업 + 브랜치 분리)       ← 30분
    ↓
Task 1: PIN 해싱 적용                   ← 4~6시간
    ↓
Task 2: 기존 평문 PIN 일괄 변환         ← 2~3시간
    ↓
Task 3: RLS 교차 테스트                 ← 2~3시간
    ↓
Task 4: 환경변수·API 키 유출 점검       ← 2~3시간
    ↓
Task 5: Week 1 완료 체크리스트 확인     ← 30분
```

### 🚨 절대 금지 사항
- ❌ `main` 브랜치에 바로 커밋/푸시 금지 (반드시 `security/week1-*` 브랜치 사용)
- ❌ Vercel **Production**에 바로 배포 금지 (반드시 Preview로 먼저 확인)
- ❌ Supabase **Production DB**를 직접 수정 금지 (반드시 백업 후 작업)
- ❌ `.env.local`, `.env` 파일을 Git에 커밋 금지
- ❌ AI가 제안한 코드를 검증 없이 그대로 수락 금지

---

# 📌 Task 0: 작업 전 준비

**목표**: 뭐가 잘못돼도 되돌릴 수 있는 상태 만들기  
**예상 시간**: 30분

## 0-1. Supabase DB 백업

- [ ] **클릭 순서**
  1. 브라우저에서 [Supabase Dashboard](https://supabase.com/dashboard) 접속 → PayNote 프로젝트 클릭
  2. 왼쪽 사이드바 → `Database` 클릭
  3. 상단 탭에서 `Backups` 클릭
  4. 우측 상단 `Create new backup` 또는 `Download backup` 버튼 클릭
  5. 백업이 완료되면 다운로드 (무료 플랜이면 아래 수동 방법 사용)

- [ ] **무료 플랜인 경우 수동 백업**
  1. 왼쪽 사이드바 → `SQL Editor` 클릭
  2. `New query` 클릭
  3. 아래 SQL 실행 (전체 테이블 목록 확인)
  ```sql
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema = 'public';
  ```
  4. 중요한 테이블(`employees`, `timecards`, `stores`, `payroll` 등)을 하나씩 CSV로 내보내기
     - `Table Editor` → 테이블 선택 → 우측 상단 `Export` → `CSV` 클릭
  5. 내보낸 CSV 파일들을 로컬 `backups/2026-04-22/` 폴더에 저장

## 0-2. Git 브랜치 분리

- [ ] **Cursor에서 터미널 열기** (`Ctrl + ` ` 또는 `Cmd + ` `)
- [ ] 아래 명령어를 **한 줄씩** 붙여넣고 Enter
```bash
git status
```
→ 변경사항이 있으면 먼저 커밋하거나 `git stash` 하세요.

```bash
git checkout main
git pull origin main
git checkout -b security/week1-pin-hashing
```
→ 이제 `security/week1-pin-hashing` 브랜치에서 작업합니다.

## 0-3. 로컬 환경변수 백업

- [ ] 프로젝트 루트의 `.env.local` 파일을 복사해서 같은 폴더에 `.env.local.backup-20260422` 이름으로 저장
- [ ] **중요**: 이 백업 파일도 `.gitignore`에 포함되어 있는지 확인
  - `.gitignore` 파일 열기 → `.env*` 또는 `.env.local*` 같은 줄이 있으면 OK

## 0-4. Vercel 프로젝트 현재 상태 확인

- [ ] [Vercel Dashboard](https://vercel.com/dashboard) 접속 → PayNote 프로젝트 클릭
- [ ] `Deployments` 탭 → 현재 Production 배포 상태 스크린샷으로 기록 (되돌림 기준점)
- [ ] `Settings` → `Environment Variables` 탭 → 변수 목록 스크린샷

**Task 0 완료 조건**: `git branch` 입력 시 `* security/week1-pin-hashing` 이 보이면 통과 ✅

---

# 🔐 Task 1: PIN 해싱 적용

**목표**: 직원 PIN을 평문으로 저장·비교하는 구조를 해시로 바꾼다.  
**왜 필요한가?**: 현재는 DB가 유출되면 모든 직원 PIN이 그대로 노출됨. 개인정보보호법상 인증정보는 **일방향 해시 저장이 의무**입니다.  
**예상 시간**: 4~6시간

## 1-1. 현재 PIN 처리 코드 찾기

- [ ] Cursor에서 `Ctrl/Cmd + Shift + F` → 전역 검색
- [ ] 아래 키워드들을 하나씩 검색해서 **결과 파일 목록을 메모장에 기록**
  - `pin` (대소문자 구분 없이)
  - `PIN`
  - `employee.pin`
  - `checkin` (체크인 시 PIN 검증 코드 위치 확인용)
- [ ] 주로 아래 위치에 있을 가능성이 높습니다:
  - `app/api/checkin/**/*.ts` (체크인 API)
  - `app/api/employees/**/*.ts` (직원 등록 API)
  - `lib/auth/**/*.ts` 또는 `lib/pin/**/*.ts`
  - `app/(dashboard)/employees/**/*.tsx` (직원 등록 UI)
  - `supabase/migrations/*.sql` (DB 스키마)

## 1-2. 해싱 라이브러리 설치

- [ ] Cursor 터미널에서 실행:
```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

**왜 bcryptjs인가?**
- `bcrypt`(네이티브)는 Vercel 서버리스 환경에서 종종 빌드 문제를 일으킴
- `bcryptjs`는 순수 JS라서 Vercel Edge/Node 둘 다 안정적으로 동작
- `argon2`가 더 강력하지만 서버리스 환경 호환성 때문에 초보에겐 비권장

## 1-3. 해싱 유틸리티 파일 만들기

- [ ] Cursor에서 `lib/security/pin.ts` 파일을 새로 만들고 아래 내용 붙여넣기

```typescript
// lib/security/pin.ts
import bcrypt from "bcryptjs";

/**
 * PIN 해싱에 사용되는 rounds (비용 계수).
 * 12면 일반 서버에서 약 150~250ms 소요, 보안/UX 균형.
 */
const SALT_ROUNDS = 12;

/**
 * 평문 PIN을 해시로 변환한다.
 * - 결과: $2a$... 로 시작하는 60자 내외 문자열
 * - 같은 PIN이라도 호출할 때마다 다른 해시가 나온다 (salt 내장)
 */
export async function hashPin(plainPin: string): Promise<string> {
  if (!plainPin || typeof plainPin !== "string") {
    throw new Error("hashPin: 유효한 PIN 문자열이 필요합니다.");
  }
  // 4~6자리 숫자 PIN 기준. 형식 검증은 상위 레이어에서.
  return bcrypt.hash(plainPin, SALT_ROUNDS);
}

/**
 * 사용자가 입력한 평문 PIN이 저장된 해시와 일치하는지 검증한다.
 */
export async function verifyPin(
  plainPin: string,
  storedHash: string
): Promise<boolean> {
  if (!plainPin || !storedHash) return false;
  try {
    return await bcrypt.compare(plainPin, storedHash);
  } catch {
    return false;
  }
}

/**
 * 저장된 값이 이미 bcrypt 해시인지 판별 (마이그레이션용).
 * 마이그레이션 중 "이 레코드는 이미 변환됐는지" 확인할 때 사용.
 */
export function isHashed(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\$2[aby]?\$\d{2}\$.{53}$/.test(value);
}
```

## 1-4. DB 스키마 변경 계획

**현재**: `employees.pin` 컬럼에 평문 PIN 저장 (예: `"1234"`)  
**목표**: 같은 컬럼에 해시 저장. 단, **기존 데이터를 보존**해야 함.

- [ ] Supabase Dashboard → `SQL Editor` → `New query`
- [ ] 현재 컬럼 구조 확인:
```sql
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'employees' AND column_name LIKE '%pin%';
```

- [ ] **PIN 컬럼의 길이가 20자 이하라면 반드시 늘려야 합니다** (bcrypt 해시는 60자):
```sql
-- 이 SQL은 아직 실행하지 마세요. Task 2에서 백업 후 실행합니다.
ALTER TABLE employees ALTER COLUMN pin TYPE varchar(100);
```

## 1-5. 🤖 Cursor에 붙여넣을 프롬프트 (PIN 저장부 리팩터)

Cursor Chat을 열고 (`Ctrl/Cmd + L`) 아래 내용을 통째로 붙여넣으세요:

```
PayNote 프로젝트에서 PIN을 평문으로 저장하는 구조를 bcrypt 해시로 전환하려고 합니다.

작업 전에 반드시 지켜주세요:
1. lib/security/pin.ts 파일은 이미 만들어져 있습니다. 이 파일의 hashPin / verifyPin 함수만 사용하세요.
2. 기존에 PIN을 평문으로 비교하던 모든 지점(== 또는 ===, .eq('pin', ...))을 찾아서 verifyPin으로 교체하세요.
3. 기존에 PIN을 저장하던 모든 지점(insert/update에서 pin: plainValue)을 찾아서 hashPin으로 교체하세요.
4. 변경 대상 파일을 수정하기 전에, 먼저 파일 목록과 변경 요약을 저에게 보여주세요. 제가 승인하면 그 다음 수정하세요.
5. PIN 길이/형식 검증(4자리 숫자 등)은 해싱 전에 수행하세요.
6. 에러 메시지는 "PIN이 일치하지 않습니다" 수준으로만 노출하고, 내부 상세 에러는 console.error로만 남기세요.
7. 테스트 코드가 있다면 함께 업데이트하고, 없다면 lib/security/pin.test.ts를 간단히 만들어주세요.

먼저 변경될 파일 목록과, 각 파일의 변경 요약을 보여주세요.
```

## 1-6. AI 제안 검증 체크리스트

AI가 파일 목록을 제시하면, 수락하기 전에 아래를 확인:

- [ ] 변경 대상 파일이 **PIN 관련 파일만** 포함되어 있는가? (관련 없는 파일이 섞여 있으면 ❌)
- [ ] `hashPin`이 **PIN을 새로 저장하는 곳 전부**에 들어갔는가? (직원 등록, 직원 수정, PIN 재설정)
- [ ] `verifyPin`이 **PIN을 검증하는 곳 전부**에 들어갔는가? (체크인, 체크아웃, 관리자 PIN 확인)
- [ ] `pin` 컬럼을 셀렉트해서 **클라이언트로 전송하는 코드가 없는가?** (있으면 반드시 제거)
- [ ] 해시값을 **로그로 출력하는 코드가 없는가?**

**의심스러운 부분이 있으면 Cursor에 이렇게 다시 물어보세요:**
```
[파일명]의 [라인번호] 부분에서 왜 이렇게 수정했는지 설명해주세요. 
그리고 이 수정 때문에 기존 동작이 깨지지 않는지 확인해주세요.
```

## 1-7. 로컬 테스트

- [ ] 터미널에서 개발 서버 실행:
```bash
npm run dev
```
- [ ] 브라우저에서 `http://localhost:3000` 접속
- [ ] **테스트 시나리오**
  1. 새 직원 등록 → PIN 입력 (예: `1234`) → 저장
  2. Supabase Dashboard → `Table Editor` → `employees` 테이블 → 방금 만든 직원의 `pin` 컬럼 확인
     - ✅ `$2a$12$...` 로 시작하면 성공
     - ❌ `1234` 그대로 보이면 실패 (코드 다시 확인)
  3. 체크인 페이지에서 방금 만든 PIN `1234` 입력 → 정상 체크인되는지 확인
  4. 일부러 틀린 PIN `9999` 입력 → "PIN이 일치하지 않습니다" 에러 뜨는지 확인
  5. 관리자에서 해당 직원의 PIN을 `5678`로 수정 → 새 PIN으로 체크인 되는지, 이전 PIN `1234`는 거부되는지 확인

- [ ] **자동 테스트 실행** (있다면):
```bash
npm run test
```

## 1-8. 커밋

- [ ] 터미널:
```bash
git add .
git status
```
→ 변경 파일이 **PIN 관련 + `lib/security/pin.ts` + `package.json`/`package-lock.json`** 만 있는지 확인

```bash
git commit -m "security: bcrypt 해시로 PIN 저장/검증 전환"
git push origin security/week1-pin-hashing
```

- [ ] GitHub에 올라가면 Vercel이 자동으로 **Preview 배포**를 만듭니다.
- [ ] Vercel Dashboard → `Deployments` → 방금 만들어진 Preview 링크 클릭
- [ ] Preview 환경에서 위 테스트 시나리오 다시 1회 실행 (Preview는 Production DB를 바라보지 않도록 환경변수 분리되어 있어야 함 — Task 4에서 확인)

**Task 1 완료 조건**: 신규 PIN은 해시로 저장되고, 로그인/체크인이 정상 동작 ✅

---

# 🔄 Task 2: 기존 평문 PIN 일괄 변환 (마이그레이션)

**목표**: DB에 이미 평문으로 저장된 PIN들을 해시로 일괄 변환한다.  
**왜 필요한가?**: Task 1은 "앞으로 저장되는 것"만 해시로 만듭니다. 기존 데이터는 여전히 평문이라 위험.  
**예상 시간**: 2~3시간

## 2-1. 사전 체크

- [ ] 현재 Task 1이 Preview에서 동작 확인 완료된 상태여야 합니다.
- [ ] Task 0에서 DB 백업이 완료되어 있어야 합니다.
- [ ] **Production DB에 대해 직접 마이그레이션하기 전에, 반드시 로컬/Staging 환경에서 먼저 리허설**합니다.

## 2-2. 평문 PIN 개수 파악

- [ ] Supabase Dashboard → `SQL Editor`:
```sql
-- 전체 직원 수
SELECT COUNT(*) AS total FROM employees;

-- PIN이 평문으로 보이는 레코드 수
-- (해시는 $2a$, $2b$, $2y$ 로 시작하므로 그 외는 평문)
SELECT COUNT(*) AS plain_count 
FROM employees 
WHERE pin IS NOT NULL 
  AND pin NOT LIKE '$2%';
```

- [ ] 결과를 메모: `전체 n명 / 평문 m명`

## 2-3. PIN 컬럼 길이 확장 (해시는 60자)

- [ ] Supabase Dashboard → `SQL Editor`:
```sql
-- 현재 컬럼 정의 확인
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'employees' AND column_name = 'pin';
```

- [ ] `character_maximum_length`가 60보다 작으면 확장:
```sql
ALTER TABLE employees ALTER COLUMN pin TYPE varchar(100);
```

- [ ] 같은 SQL을 다시 실행해서 `100`으로 변경됐는지 확인

## 2-4. 마이그레이션 스크립트 파일 만들기

일회성 스크립트이므로 프로젝트 루트에 `scripts/migrate-pins.ts` 로 작성합니다.

- [ ] Cursor에서 `scripts/migrate-pins.ts` 파일 생성 후 아래 코드 붙여넣기:

```typescript
// scripts/migrate-pins.ts
// 목적: employees 테이블의 평문 PIN을 bcrypt 해시로 일괄 변환.
// 실행: npx tsx scripts/migrate-pins.ts
// 주의: Production 실행 전에 반드시 DB 백업이 있어야 하며, dry-run 모드로 먼저 확인할 것.

import { createClient } from "@supabase/supabase-js";
import { hashPin, isHashed } from "../lib/security/pin";

// ⚠️ Service Role Key를 사용. 절대 브라우저/클라이언트에서 실행 금지.
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN !== "false"; // 기본값: dry-run

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log(`\n=== PIN 마이그레이션 시작 (${DRY_RUN ? "DRY RUN" : "REAL RUN"}) ===\n`);

  // 1. 대상 조회: pin이 있고, 해시 포맷이 아닌 것만
  const { data: employees, error } = await admin
    .from("employees")
    .select("id, store_id, name, pin")
    .not("pin", "is", null);

  if (error) {
    console.error("❌ 조회 실패:", error.message);
    process.exit(1);
  }

  const targets = employees.filter((e) => !isHashed(e.pin));
  console.log(`총 직원: ${employees.length}명 / 변환 대상: ${targets.length}명\n`);

  if (targets.length === 0) {
    console.log("✅ 변환할 평문 PIN이 없습니다. 종료.");
    return;
  }

  // 2. 한 건씩 해시 후 업데이트
  let success = 0;
  let fail = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const emp of targets) {
    try {
      const hashed = await hashPin(emp.pin!);
      
      if (DRY_RUN) {
        console.log(`[DRY] ${emp.name} (${emp.id}) → 해시 생성 OK (${hashed.slice(0, 10)}...)`);
        success++;
        continue;
      }

      const { error: updateError } = await admin
        .from("employees")
        .update({ pin: hashed })
        .eq("id", emp.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      console.log(`✅ ${emp.name} (${emp.id}) 변환 완료`);
      success++;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`❌ ${emp.name} (${emp.id}) 실패: ${reason}`);
      failures.push({ id: emp.id, reason });
      fail++;
    }
  }

  console.log(`\n=== 결과: 성공 ${success} / 실패 ${fail} ===`);
  if (failures.length > 0) {
    console.log("\n실패 상세:");
    console.table(failures);
  }

  if (DRY_RUN) {
    console.log("\nℹ️  Dry-run 모드였습니다. 실제 적용하려면 DRY_RUN=false 로 다시 실행하세요.");
  }
}

main().catch((e) => {
  console.error("치명적 에러:", e);
  process.exit(1);
});
```

## 2-5. 🤖 Cursor에 붙여넣을 프롬프트 (스크립트 검증)

```
scripts/migrate-pins.ts 파일을 만들었습니다. 아래 관점으로 이 스크립트를 검토해주세요:

1. SUPABASE_SERVICE_ROLE_KEY가 서버에서만 사용되는지 (브라우저 번들에 들어가지 않는지)
2. dry-run 모드가 기본값이고, 명시적으로 끄지 않으면 절대 실제 업데이트가 안 일어나는지
3. 이미 해시된 값을 실수로 또 해싱하지 않는지 (isHashed 체크 포함)
4. 한 건이 실패해도 나머지는 계속 진행되는지
5. 실패한 건에 대한 로그가 충분한지

문제가 있으면 구체적 수정안을 제시해주세요. 문제 없으면 "통과"라고만 답해주세요.
```

## 2-6. 로컬에서 dry-run 먼저

- [ ] 프로젝트 루트의 `.env.local`에 아래 변수가 있는지 확인 (없으면 Supabase Dashboard → `Settings` → `API`에서 가져와서 추가):
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

⚠️ **`NEXT_PUBLIC_` 접두사는 절대 붙이지 마세요.** 붙이면 브라우저에 노출됩니다.

- [ ] tsx 설치 (아직 없다면):
```bash
npm install --save-dev tsx
```

- [ ] Dry-run 실행:
```bash
npx tsx scripts/migrate-pins.ts
```

- [ ] 출력 확인:
  - 대상 인원수가 2-2에서 측정한 `plain_count`와 **일치**하는지
  - 모든 직원이 `[DRY] ... → 해시 생성 OK`로 나오는지
  - 실패가 1건이라도 있다면 **절대 실제 실행 금지**, 원인부터 해결

## 2-7. Staging/로컬 DB에서 실제 실행 리허설

- [ ] 가능하면 별도 Staging Supabase 프로젝트(또는 로컬 Supabase)에 동일한 데이터를 복제하고 거기에서 먼저 실행
- [ ] 리허설 실행:
```bash
DRY_RUN=false npx tsx scripts/migrate-pins.ts
```

- [ ] 리허설 후 검증:
  1. Supabase Dashboard → `Table Editor` → `employees` → pin 컬럼이 모두 `$2a$...` 형태인지 시각적으로 확인
  2. SQL로 재확인:
```sql
SELECT COUNT(*) FROM employees WHERE pin IS NOT NULL AND pin NOT LIKE '$2%';
```
     → 결과가 `0`이면 성공
  3. 리허설 환경에서 실제로 기존 PIN으로 체크인이 되는지 (해시 변환 후에도 검증은 `verifyPin`으로 처리되므로 정상 동작해야 함)

## 2-8. Production 실행

**🚨 여기서부터는 되돌리기 어렵습니다. 반드시 백업 존재 확인!**

- [ ] 백업 존재 재확인 (Task 0-1)
- [ ] 가능한 한 **사용자가 적은 시간대**에 실행 (예: 새벽, 매장 영업 종료 후)
- [ ] Vercel Dashboard에서 해당 시점 접속 사용자 없는지 대략 확인
- [ ] Production 환경변수로 실행:
  - `.env.local`의 SUPABASE_URL, SERVICE_ROLE_KEY가 Production을 가리키는지 재확인
- [ ] 실행:
```bash
DRY_RUN=false npx tsx scripts/migrate-pins.ts
```
- [ ] 실행 직후 체크:
  1. SQL `SELECT COUNT(*) FROM employees WHERE pin IS NOT NULL AND pin NOT LIKE '$2%';` → `0` 확인
  2. 본인 테스트 계정으로 체크인 시도 → 정상 동작 확인

## 2-9. 스크립트 정리

- [ ] 마이그레이션이 완료되면 `scripts/migrate-pins.ts`를 **삭제하거나 `scripts/_archive/` 폴더로 이동** (실수로 재실행되는 것 방지)
- [ ] 커밋:
```bash
git add .
git commit -m "security: 평문 PIN 일괄 해시 마이그레이션 완료"
git push origin security/week1-pin-hashing
```

**Task 2 완료 조건**: DB 내 모든 PIN이 `$2a$...` 해시 형태 ✅

---

# 🛡️ Task 3: Supabase RLS 교차 테스트

**목표**: A 매장 관리자가 B 매장 데이터를 **절대 볼 수 없음**을 실제 계정으로 증명한다.  
**왜 필요한가?**: RLS(Row Level Security) 정책은 써놨어도, 실제 2개 계정으로 시험해봐야 진짜 막혔는지 알 수 있습니다. 이건 문서가 아니라 **실측**이 중요합니다.  
**예상 시간**: 2~3시간

## 3-1. 테스트 매장/계정 준비

- [ ] **매장 A 준비**
  - 이름: `테스트매장_A`
  - 관리자 이메일: `test-store-a@본인이메일도메인.com` (예: Gmail `+` 트릭 사용 → `본인이름+storeA@gmail.com`)
  - 직원 2~3명 등록 (이름: A직원1, A직원2, A직원3)
  - 체크인 기록 몇 건 생성
  - 급여 레코드 1건 생성

- [ ] **매장 B 준비**
  - 이름: `테스트매장_B`
  - 관리자 이메일: `test-store-b@본인이메일도메인.com`
  - 직원 2~3명 등록 (이름: B직원1, B직원2)
  - 체크인 기록, 급여 레코드 생성

- [ ] 각 계정의 로그인 정보를 **암호관리자(1Password, Bitwarden 등)**에 저장

## 3-2. RLS 정책 목록 확인

- [ ] Supabase Dashboard → `Authentication` → `Policies`
- [ ] 또는 SQL:
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

- [ ] 결과를 스프레드시트나 메모로 옮겨 아래 체크리스트 만들기:

| 테이블 | SELECT 정책 있음 | INSERT 정책 있음 | UPDATE 정책 있음 | DELETE 정책 있음 | store_id 기준 격리 OK |
|---|---|---|---|---|---|
| employees | | | | | |
| timecards | | | | | |
| stores | | | | | |
| payroll | | | | | |
| reviews | | | | | |
| (기타) | | | | | |

**반드시 확인**: 각 테이블의 정책 조건(`qual`)에 `store_id = (SELECT store_id FROM ... WHERE user_id = auth.uid())` 같은 **매장 격리 조건**이 걸려 있어야 합니다.

## 3-3. 🤖 Cursor에 붙여넣을 프롬프트 (RLS 검토)

```
Supabase RLS 정책을 검토하려고 합니다. 아래 SQL을 실행해서 얻은 정책 목록을 붙여넣을 테니, 
각 테이블에 대해 아래 항목을 점검해주세요.

1. SELECT/INSERT/UPDATE/DELETE 4가지 모두에 정책이 있는지
2. 정책 조건에 auth.uid() 또는 매장 격리용 store_id 필터가 확실히 걸려 있는지
3. "USING (true)" 같은 위험한 느슨한 정책이 있는지
4. anon 역할에 대한 허용 범위가 최소한인지
5. Realtime 구독 대상 테이블에 SELECT 정책이 확실히 걸려 있는지 (Realtime은 SELECT 정책을 따름)

[여기에 pg_policies SELECT 결과 붙여넣기]

점검 결과를 표로 정리하고, 보강이 필요한 정책의 수정 SQL을 제시해주세요.
```

## 3-4. 브라우저 2개로 교차 접속 실험

- [ ] **브라우저 1 (일반 창)**: 매장 A 관리자로 로그인
- [ ] **브라우저 2 (시크릿/프라이빗 창 또는 다른 브라우저)**: 매장 B 관리자로 로그인

### 실험 A: URL 직접 접근

- [ ] 브라우저 1에서 매장 A의 직원 상세 페이지 URL 확인 (예: `/employees/abc-123`)
- [ ] 그 URL을 복사해서 **브라우저 2에 붙여넣기**
- [ ] 기대 결과: 404, 권한 없음, 또는 빈 화면
- [ ] 실패 결과: 매장 A 직원 정보가 보이면 ❌ (RLS 구멍)

### 실험 B: API 직접 호출

- [ ] 브라우저 2에서 개발자 도구(F12) → `Network` 탭 열기
- [ ] 매장 B의 직원 목록 페이지 열어서 API 엔드포인트 하나 확인 (예: `/api/employees?store_id=B의_ID`)
- [ ] 매장 A의 `store_id`를 알고 있다면, URL의 store_id만 A로 바꿔서 다시 요청
- [ ] 개발자 도구 → 해당 요청 우클릭 → `Copy as fetch` → 콘솔에 붙여넣고 수정 실행
- [ ] 기대 결과: 빈 배열 `[]` 또는 403/404
- [ ] 실패 결과: 매장 A 직원 데이터가 반환되면 ❌

### 실험 C: Supabase SDK 직접 공격 시뮬레이션

브라우저 2(매장 B 로그인 상태)의 개발자 도구 콘솔에서:

```javascript
// Supabase 클라이언트 객체를 찾아 직접 쿼리
// (PayNote가 window에 노출한 supabase 객체를 사용하거나, 임시로 노출시켜서 실행)
const { data, error } = await window.__supabase.from('employees').select('*');
console.log('data count:', data?.length, 'error:', error);
```

- [ ] 기대 결과: `data` 배열에 **매장 B 직원만** 포함되어야 함 (매장 A 데이터 0건)
- [ ] 실패 결과: 매장 A 데이터가 섞여 있으면 ❌

### 실험 D: Realtime 구독 교차 확인

- [ ] 브라우저 1에서 매장 A의 체크인 페이지 열어두기 (Realtime 구독 중인 상태)
- [ ] 브라우저 2에서 매장 B의 직원이 체크인
- [ ] 브라우저 1 화면에 **매장 B의 체크인 이벤트가 실시간으로 뜨지 않아야** 함
- [ ] 반대로도 테스트 (브라우저 2에 A 이벤트 나타나지 않아야 함)

### 실험 E: 수정/삭제 시도

- [ ] 브라우저 2에서 콘솔로 매장 A의 직원 ID를 대상으로 업데이트 시도:
```javascript
const { data, error } = await window.__supabase
  .from('employees')
  .update({ name: '해킹시도' })
  .eq('id', '매장A_직원_ID');
console.log(data, error);
```
- [ ] 기대 결과: `data`가 빈 배열이거나 error 발생
- [ ] 실패 결과: 업데이트가 성공하면 ❌

## 3-5. 결과 기록

프로젝트에 `docs/security/H02_realtime_rls_check_2026-04-22.md` 파일(또는 기존 문서 업데이트)을 만들고 아래 표로 결과 정리:

| 실험 | 대상 테이블/엔드포인트 | 기대 결과 | 실제 결과 | 판정 |
|---|---|---|---|---|
| A | /employees/:id (매장 A) | 403/404 | | |
| B | /api/employees?store_id=A | 빈 배열 | | |
| C | SDK SELECT employees | 매장 B만 | | |
| D | Realtime timecards | B만 수신 | | |
| E | SDK UPDATE 매장 A | 거부 | | |

- [ ] ❌ 1건이라도 있으면 Task 3 완료 불가. 해당 정책을 수정 후 재테스트.

## 3-6. 정책 보강이 필요한 경우 (자주 나오는 패턴)

- [ ] `employees` 테이블에 누락된 경우 예시:
```sql
-- 예시: 자기 매장 직원만 조회 가능
CREATE POLICY "employees_select_own_store" ON employees
FOR SELECT USING (
  store_id IN (
    SELECT store_id FROM store_members WHERE user_id = auth.uid()
  )
);
```

⚠️ **정책 SQL은 직접 Supabase Dashboard → `SQL Editor`에서 실행하지 말고**, 먼저 `supabase/migrations/` 폴더에 새 파일로 저장 후 CLI로 적용하는 것이 안전합니다. Cursor에 구체적 조건을 알려주고 정책 SQL을 만들게 하세요.

**Task 3 완료 조건**: 실험 A~E 모두 `판정` 열이 ✅ ✅

---

# 🔑 Task 4: 환경변수·API 키 유출 점검

**목표**: `.env`에 있어야 할 비밀키가 Git에 올라가지 않았는지, 브라우저에 노출되지 않는지 확인한다.  
**예상 시간**: 2~3시간

## 4-1. `.gitignore` 확인

- [ ] 프로젝트 루트의 `.gitignore` 열기
- [ ] 아래 항목이 모두 포함되어 있는지 확인 (없으면 추가):
```
# env files
.env
.env.local
.env.*.local
.env.development.local
.env.production.local
.env.*.backup*
*.env.backup
```

- [ ] 추가했다면 커밋:
```bash
git add .gitignore
git commit -m "chore: .env 백업 파일 .gitignore 보강"
```

## 4-2. Git 히스토리에 비밀키가 이미 올라갔는지 점검

### 방법 1: Cursor 전역 검색

- [ ] Cursor에서 `Ctrl/Cmd + Shift + F`로 아래 패턴 하나씩 검색:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `service_role`
  - `eyJhbGciOiJIUzI1NiIsInR5` (Supabase JWT 앞부분)
  - `sk-` (OpenAI / Anthropic 등 API 키 접두어)
  - `sk-ant-` (Anthropic)
  - `BEGIN RSA PRIVATE KEY`
  - `BEGIN PRIVATE KEY`

- [ ] 현재 작업 트리에서 나왔다면 즉시 `.env.local`로 옮기고, 코드에서는 `process.env.XXX`만 참조하도록 수정

### 방법 2: Git 히스토리 전체 검색

- [ ] 터미널에서:
```bash
git log --all --full-history -p | grep -iE "(SUPABASE_SERVICE_ROLE|sk-ant-|sk-[A-Za-z0-9]{20,}|PRIVATE KEY)" | head -50
```

- [ ] 결과가 **비어 있으면 안전** ✅
- [ ] 결과에 키가 하나라도 찍히면 🚨 **유출된 상태** — 아래 4-3 진행

### 방법 3: 전문 도구 (선택, 더 정확)

- [ ] trufflehog 설치 (macOS 기준):
```bash
brew install trufflehog
```
- [ ] 실행:
```bash
trufflehog git file://. --only-verified
```
- [ ] `--only-verified` 플래그는 "실제 살아있는 키"만 알려주므로, 결과가 있으면 지금 당장 무효화해야 합니다.

## 4-3. 키가 유출된 경우 긴급 대응 순서

**⚠️ 키가 Git 히스토리에 있었다면, 삭제해도 "노출된 사실"은 되돌릴 수 없습니다. 반드시 키를 교체(rotate)해야 합니다.**

- [ ] **Supabase Service Role Key 교체**
  1. Supabase Dashboard → `Settings` → `API`
  2. `service_role` 섹션 → `Reset` 또는 `Regenerate` 클릭
  3. 새 키 확인 → 복사
  4. Vercel Dashboard → `Settings` → `Environment Variables` → `SUPABASE_SERVICE_ROLE_KEY` 업데이트 (Production, Preview, Development 모두)
  5. 로컬 `.env.local`도 업데이트
  6. Vercel에서 `Redeploy` 실행

- [ ] **OpenAI/Anthropic 등 외부 API 키 교체**
  1. 해당 서비스 콘솔 접속 → 기존 키 Revoke
  2. 새 키 발급 → Vercel + 로컬 업데이트

- [ ] **Git 히스토리에서 파일 삭제** (선택, 하지만 권장)
  - `git-filter-repo` 사용 (초보자는 공개 저장소가 아니면 굳이 안 해도 됨)
  - 공개 저장소라면 필수

## 4-4. Next.js 클라이언트 번들 노출 점검

**위험 패턴**: Next.js에서 `NEXT_PUBLIC_` 접두사가 붙은 환경변수는 **브라우저 번들에 그대로 들어갑니다.** 민감한 키에 실수로 이 접두사를 붙였으면 누구나 볼 수 있습니다.

- [ ] `.env.local`과 Vercel 환경변수 목록에서 아래 변수 확인:
  - `NEXT_PUBLIC_SUPABASE_URL` ✅ OK (이건 공개되어도 됨)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅ OK (anon은 공개 전제)
  - `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` ❌❌❌ 존재하면 치명적
  - `NEXT_PUBLIC_OPENAI_API_KEY` ❌ 존재하면 치명적
  - `NEXT_PUBLIC_*` 로 시작하면서 실제로는 비밀인 것 없는지 전체 스캔

- [ ] Cursor 전역 검색:
  - `NEXT_PUBLIC_` 로 검색 → 모든 결과를 훑어보며 "이게 브라우저에 공개돼도 되는 값인가?" 스스로 질문

- [ ] **실제 브라우저 번들에서 확인**
  1. Production 또는 Preview 사이트 접속
  2. 개발자 도구 `Sources` 탭
  3. `_next/static/chunks/` 하위 JS 파일들에서 `Ctrl/Cmd + F`로 아래 문자열 검색:
     - `service_role`
     - `sk-ant-`
     - `sk-` (정식 API 키 형태)
  4. 하나라도 걸리면 🚨 즉시 키 교체

## 4-5. 🤖 Cursor에 붙여넣을 프롬프트 (민감정보 코드 감사)

```
PayNote 프로젝트의 민감정보 처리 코드를 감사하려고 합니다. 아래 관점으로 전체 코드베이스를 훑어주세요:

1. process.env.* 사용처를 전부 나열하고, 각각이 서버 컴포넌트/API 라우트/클라이언트 컴포넌트 중 어디에서 쓰이는지 분류
2. "use client" 파일에서 process.env.SUPABASE_SERVICE_ROLE_KEY 같은 서버 전용 변수를 참조하는 곳이 있는지
3. Supabase 클라이언트 생성 시 anon key와 service_role key를 헷갈려 쓰는 곳이 있는지
4. 로그(console.log/error)로 토큰, PIN, 세션 정보 등을 찍는 곳이 있는지
5. 클라이언트에서 fetch로 요청할 때 Authorization 헤더에 서버 키를 박아두는 곳이 있는지

결과를 파일 경로 + 라인 번호 + 위험도(High/Medium/Low) + 수정 제안 형태로 표로 정리해주세요. 수정은 제 승인 후에만 해주세요.
```

## 4-6. Vercel 환경변수 정리

- [ ] Vercel Dashboard → PayNote 프로젝트 → `Settings` → `Environment Variables`
- [ ] 각 변수 우측의 환경(Environment) 설정 확인:
  - Production / Preview / Development 중 **꼭 필요한 곳만 체크**
  - 예: Production DB 키가 Preview에도 켜져 있으면 Preview에서 실수로 실제 DB 건드릴 수 있음
- [ ] `Team` 플랜이면 **Sensitive** 옵션 켜기 (표시되지 않도록)

## 4-7. 점검 결과 문서화

- [ ] `docs/security/H03_secrets_audit_2026-04-22.md` 작성:

```markdown
# 시크릿/환경변수 감사 - 2026-04-22

## 1. .gitignore 커버리지
- [x] .env, .env.local, .env.*.local, .env.*.backup 모두 포함

## 2. Git 히스토리 스캔
- 도구: `git log -p | grep` + trufflehog
- 결과: 유출 0건 / N건 (N건이면 교체 완료 기록)

## 3. 교체한 키 목록
| 키 이름 | 교체 일시 | 교체 사유 |
|---|---|---|
| | | |

## 4. 브라우저 번들 스캔
- Chrome DevTools Sources 탭에서 service_role / sk- 검색: 0건 ✅

## 5. 남은 리스크
- (없으면 "없음")

## 6. 다음 감사 예정일
- 2026-05-22
```

**Task 4 완료 조건**: 
- Git 히스토리에서 실제 키가 발견되지 않거나, 발견되었다면 전부 교체 완료
- 브라우저 번들에서 서버 전용 키 발견 0건
- `NEXT_PUBLIC_` 접두사 오용 0건 ✅

---

# ✅ Task 5: Week 1 완료 체크리스트

모든 체크박스가 채워져야 Week 1이 끝난 것으로 간주합니다.

## 5-1. 기술 완료 기준

### 해싱 & 마이그레이션
- [ ] `lib/security/pin.ts` 존재하고 `hashPin` / `verifyPin` / `isHashed` 함수가 정상 동작
- [ ] 신규 등록하는 PIN은 모두 `$2a$...` 해시로 저장됨
- [ ] 기존 직원 PIN도 전부 해시로 변환 완료
- [ ] DB 쿼리 `SELECT COUNT(*) FROM employees WHERE pin IS NOT NULL AND pin NOT LIKE '$2%'` = 0
- [ ] 마이그레이션 스크립트는 `scripts/_archive/`로 이동 또는 삭제

### RLS
- [ ] 매장 A/B 두 계정으로 실험 A~E 전부 통과
- [ ] `docs/security/H02_realtime_rls_check_2026-04-22.md`에 실험 결과 기록
- [ ] Realtime 구독이 매장 경계를 넘어가지 않음 확인

### 시크릿
- [ ] Git 히스토리에 서버 전용 키 노출 0건
- [ ] `NEXT_PUBLIC_` 접두사가 붙은 민감 변수 0건
- [ ] 브라우저 번들에 service_role / API 키 노출 0건
- [ ] Vercel 환경변수의 환경별 분리 정리 완료
- [ ] `docs/security/H03_secrets_audit_2026-04-22.md` 작성 완료

## 5-2. 운영 완료 기준

- [ ] `security/week1-*` 브랜치에서 `main`으로 PR 생성
- [ ] PR 설명란에 이 문서 링크 + 완료 체크리스트 붙여넣기
- [ ] Vercel Preview URL에서 전체 사용자 플로우 한 번 직접 수행 (로그인 → 직원 등록 → 체크인 → 체크아웃 → 급여 확인)
- [ ] Main 머지 후 Production 배포 완료
- [ ] Production에서 본인 계정으로 1회 스모크 테스트 (간단한 체크인 1건)

## 5-3. 기록 완료 기준

- [ ] `.gstack/qa-reports/` 또는 `docs/security/`에 Week 1 완료 보고서 1장 작성
  - 무엇을 했는지, 무엇이 남았는지, Week 2에서 이어서 할 것

## 5-4. 다음 주 준비

- [ ] Week 2 진입 준비: 에러 추적(Sentry) + 자동 백업 + E2E 5개 테스트
- [ ] 이 시점에서 베타 사장님 섭외 시작 (1~3명, Week 4 오픈 목표)

---

# 🆘 자주 나오는 문제 해결 (트러블슈팅)

## Q1. `npm install bcryptjs` 후 Vercel 빌드 실패
- **원인**: 종종 `bcrypt`(네이티브)와 이름이 비슷해서 import 경로가 꼬임
- **해결**: `import bcrypt from "bcryptjs";` (❌ `from "bcrypt"` 금지)

## Q2. 마이그레이션 스크립트 실행 시 `Cannot find module 'tsx'`
- **해결**:
```bash
npm install --save-dev tsx
npx tsx scripts/migrate-pins.ts
```

## Q3. bcrypt.compare가 Vercel Edge Runtime에서 안 돌아감
- **원인**: Edge Runtime은 Node API가 제한됨
- **해결**: PIN 검증 API route에 `export const runtime = 'nodejs';` 선언 (Edge 대신 Node Runtime으로 강제)

## Q4. RLS 실험 C에서 콘솔로 쿼리할 때 `window.__supabase` 가 없음
- **해결**: 개발 모드에서만 임시로 노출
```typescript
// app/layout.tsx 또는 client entry
if (process.env.NODE_ENV === 'development') {
  // @ts-ignore
  window.__supabase = supabase;
}
```
**⚠️ Production 빌드에는 절대 들어가지 않도록**

## Q5. Vercel Preview에서 Supabase 접속 실패
- **원인**: Preview 환경변수 누락
- **해결**: Vercel → Settings → Environment Variables에서 각 변수의 `Preview` 체크박스 켜기

## Q6. Dry-run 결과와 실제 실행 결과 인원수가 다름
- **원인**: 중간에 새 직원이 추가됨 / 트랜잭션 이슈
- **해결**: 실행 직후 다시 COUNT 쿼리로 `plain_count = 0` 확인. 0이 아니면 다시 실행.

## Q7. 기존 PIN으로 체크인이 안 됨 (마이그레이션 후)
- **원인 1**: 마이그레이션 전 PIN 값이 `"1234"`이 아니라 공백 포함 `" 1234 "` 였을 가능성
- **원인 2**: `verifyPin` 호출부가 업데이트 안 됐거나 여전히 평문 비교
- **해결**: Cursor에서 `=== pin` 또는 `.eq('pin',` 같은 평문 비교 패턴 다시 전역 검색

---

# 🧭 이 문서 사용 후 다음 채팅 프롬프트

Week 1 작업 중 막히면, 새 Claude 채팅에 아래를 붙여넣으세요:

```
PayNote 서비스 Week 1 보안 작업 중입니다. 
현재 Task [숫자]번 [작업명]을 진행하고 있습니다.

[에러 메시지 전체 또는 막힌 상황 상세히]

관련 파일 첨부합니다. 원인과 해결책을 비개발자도 따라할 수 있게 
마우스 클릭 순서대로 알려주세요.
```

---

**작성**: Claude (Anthropic)  
**버전**: v1.0 · 2026-04-22  
**다음 버전 예정**: Week 2 작업 지시서 (에러 추적 + 백업 + E2E 테스트)
