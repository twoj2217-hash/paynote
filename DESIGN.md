# Design System — PayNote

## Product Context
- **What this is:** F&B 매장용 근태·급여 관리 웹앱
- **Who it's for:** 소상공인 사장님, 매장 직원
- **Space/industry:** F&B 운영/노무 관리
- **Project type:** 웹 앱 (모바일 + 데스크톱 혼용)

## Aesthetic Direction
- **Direction:** Practical Modern
- **Decoration level:** minimal
- **Mood:** 업무 화면은 빠르게 읽히고, 핵심 액션은 분명하게 보이는 톤

## Typography
- **Display/Hero:** SUIT 700 (헤더/강조 타이틀 전용)
- **Body/UI/Table:** Noto Sans KR 400/500/700
- **Data/Numeric:** Noto Sans KR + `tabular-nums`
- **PDF documents:** Noto Sans KR 고정 (보조 폰트 미사용)

## Color
- **Approach:** restrained + focused accent
- **Primary:** `#1E40AF` (CTA, 활성 상태, 핵심 링크)
- **Accent:** `#0F766E` (포인트 배지, 일부 강조)
- **Background:** `#F8FAFC`
- **Surface:** `#FFFFFF`
- **Text:** `#0F172A`
- **Usage ratio:** Primary 80% / Accent 20%
- **Status colors:** success/warning/error는 의미 색상 유지

## Spacing
- **Base unit:** 4px
- **Density:** compact on mobile, comfortable on desktop
- **Token scale:** 8, 12, 16, 20, 24, 32

## Layout
- **Mobile:** 단일 컬럼, 핵심 정보 우선
- **Tablet:** 2열
- **Desktop:** 다열 + 표 확장
- **Container:** 페이지 기본 패딩 `p-4`(mobile) → `sm:p-6`(desktop)

## Motion
- **Approach:** minimal-functional
- **Duration:** 120ms~220ms
- **Easing:** ease-out 중심

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-20 | Noto Sans KR + SUIT 조합 확정 | 한국어 가독성 + 헤더 임팩트 균형 |
| 2026-04-20 | Deep Blue + Teal 팔레트 확정 | 무난함 유지 + 포인트 임팩트 |
