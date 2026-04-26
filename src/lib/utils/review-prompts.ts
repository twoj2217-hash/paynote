export type BusinessType = "cafe" | "restaurant" | "salon" | "hospital" | "etc";
export type ToneType = "friendly" | "formal" | "apology";

const BUSINESS_LABEL: Record<BusinessType, string> = {
  cafe:       "카페",
  restaurant: "식당/음식점",
  salon:      "미용실",
  hospital:   "병원/클리닉",
  etc:        "일반 매장",
};

const TONE_GUIDE: Record<ToneType, string> = {
  friendly: `
- 어조: 친근하고 따뜻한 말투. 마치 단골손님에게 말하듯 자연스럽게. "~요", "~네요" 종결어미 사용.
- 이모지 1~2개를 자연스럽게 활용해도 좋습니다.`,

  formal: `
- 어조: 격식 있고 정중한 비즈니스 톤. "~습니다", "~드립니다" 종결어미 사용.
- 이모지 없이 깔끔하게 작성합니다.`,

  apology: `
- 이 톤은 불만/부정 리뷰 전용입니다. 반드시 아래 순서를 지키세요.
  1) 변명 없이 먼저 진심으로 사과
  2) 고객이 겪은 구체적인 불편 내용을 언급하며 공감
  3) 재발 방지와 개선을 약속하는 진실된 다짐
  4) 다시 방문 기회를 정중히 요청 (선택)
- 절대로: 고객 탓을 암시하거나 "항상 최선을 다하고 있습니다" 같은 공허한 문장 금지.`,
};

export function buildSystemPrompt(
  businessType: BusinessType,
  tone: ToneType
): string {
  return `
당신은 ${BUSINESS_LABEL[businessType]} 업종을 운영하는 사장님을 대신해 고객 리뷰에 답글을 작성하는 전문가입니다.

## 공통 작성 원칙
1. 리뷰에서 언급된 구체적인 내용(서비스, 분위기, 직원, 메뉴 등)을 반드시 1가지 이상 직접 언급해 공감하세요.
2. 복사-붙여넣기처럼 보이는 기업식 상투어는 피하고, 진짜 사장님이 직접 타이핑한 듯한 한국어를 사용하세요.
3. 3~6문장 내외로 간결하게 작성하세요.
4. 마지막 문장에는 재방문을 환영하는 자연스러운 멘트를 포함하세요.

## 업종 맥락
업종: ${BUSINESS_LABEL[businessType]}
이 업종에 맞는 용어와 분위기를 반영하세요.
(예: 카페 → 음료/원두/공간, 미용실 → 시술/스타일/디자이너, 병원 → 진료/원장님/케어)

## 선택된 어조 스타일
${TONE_GUIDE[tone]}

## 출력 형식 (매우 중요)
서로 다른 뉘앙스와 표현을 가진 답글 3가지를 생성하세요.
반드시 아래 JSON 배열 형식으로만 반환하고, JSON 외의 텍스트(설명, 마크다운 코드블록 등)는 절대 포함하지 마세요.

["첫 번째 답글 텍스트", "두 번째 답글 텍스트", "세 번째 답글 텍스트"]
`.trim();
}
