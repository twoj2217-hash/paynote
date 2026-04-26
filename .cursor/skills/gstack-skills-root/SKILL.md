---
name: gstack-skills-root
description: >-
  Locates vendored gstack Agent Skills under .agents/skills/gstack/ for this
  repository. Use when editing gstack skills (browse, qa, ship, autoplan, etc.),
  listing skill folders, or when the user mentions cd .agents/skills/gstack or
  project gstack skills vs ~/.claude/skills/gstack.
---

# gstack 스킬 디렉터리 (PayNote / paynote)

이 워크스페이스에서 **gstack 관련 에이전트 스킬**을 읽거나 수정할 때는 아래 경로를 기준으로 한다.

## 정식 경로

- **상대 경로(권장)**: 워크스페이스 루트 기준 `.agents/skills/gstack/`
- **터미널에서 이동**: 저장소 루트에서 `cd .agents/skills/gstack` (PowerShell·bash 공통)

## 에이전트 동작 규칙

1. **Read / Edit 대상**: 개별 스킬은 하위 폴더의 `SKILL.md` (예: `.agents/skills/gstack/browse/SKILL.md`).
2. **전역 설치와 구분**: 사용자 홈의 `~/.claude/skills/gstack` 등은 **다른 복사본**일 수 있다. **이 레포 코드·스킬을 바꿀 때는 반드시 `.agents/skills/gstack/` 아래를 연다.**
3. **목록 확인**: 터미널에서 해당 디렉터리로 이동한 뒤 하위 폴더 이름으로 어떤 스킬이 있는지 확인하거나, `Glob`으로 `.agents/skills/gstack/**/SKILL.md`를 검색한다.
4. **새 스킬 추가**: 동일하게 `.agents/skills/gstack/<skill-name>/SKILL.md` 구조를 따른다 (프로젝트 규칙과 충돌 시 사용자에게 확인).

## 왜 필요한가

Cursor가 여러 경로에서 스킬을 불러오므로, **이 프로젝트에 포함된 gstack 스킬의 단일 소스**를 `.agents/skills/gstack/`으로 고정해 혼선을 줄인다.
