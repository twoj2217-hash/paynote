import { json, error } from '@sveltejs/kit'
import type { RequestEvent } from '@sveltejs/kit'
import Anthropic from '@anthropic-ai/sdk'
import { ANTHROPIC_API_KEY } from '$env/static/private'
import { REVIEW_DICTIONARY, RISK_DICTIONARY } from '$lib/utils/review-dictionary'

type BusinessType = 'cafe' | 'restaurant' | 'salon' | 'hospital' | 'etc'
type ToneType = 'friendly' | 'formal' | 'apology'
type PlatformType = 'delivery' | 'map'

type KeywordHit = { word: string; score: number; category: string }

type RiskResult = {
  riskLevel: number
  riskType: string
  strategyGuide: string
}

// 리뷰 문장에서 사전 키워드를 추출합니다.
function extractKeywords(review: string): KeywordHit[] {
  const hits: KeywordHit[] = []
  for (const [category, group] of Object.entries(REVIEW_DICTIONARY)) {
    for (const word of group.words) {
      if (review.includes(word)) {
        hits.push({ word, score: group.score, category })
      }
    }
  }
  return hits
}

// 키워드 점수를 합산해 리뷰 성향 점수를 계산합니다.
function calculateScore(keywords: KeywordHit[]): number {
  return keywords.reduce((acc, k) => acc + k.score, 0)
}

// 중요도가 높은 키워드 2개만 뽑아 템플릿 재료로 사용합니다.
function pickMainKeywords(keywords: KeywordHit[]): KeywordHit[] {
  return [...keywords]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 2)
}

// 점수와 핵심 키워드 기반으로 기본 답글 템플릿을 만듭니다.
function generateDynamicTemplate(score: number, mainKeywords: KeywordHit[]): string {
  const k = mainKeywords.map((item) => item.word)
  let template: string

  if (score >= 2) {
    template = `음식이 ${k[0]}다고 말씀해주셔서 감사합니다! ${k[1] ? `그리고 ${k[1]} 부분까지 좋게 봐주셔서` : ''} 큰 힘이 됩니다.`
  } else if (score === 1) {
    template = `소중한 리뷰 감사합니다! ${k[0] ? `${k[0]} 부분 말씀해주셔서` : ''} 정말 감사드립니다.`
  } else {
    template = `불편을 드려 죄송합니다. ${k[0] ? `${k[0]} 부분은` : ''} 바로 개선하도록 하겠습니다.`
  }

  return template
}

// 위험 키워드 사전으로 리뷰 위험도를 판정합니다.
function analyzeRisk(text: string): RiskResult {
  let result: RiskResult = {
    riskLevel: RISK_DICTIONARY[0].level,
    riskType: RISK_DICTIONARY[0].type,
    strategyGuide: RISK_DICTIONARY[0].guide
  }

  for (const entry of RISK_DICTIONARY) {
    for (const word of entry.words) {
      if (text.includes(word) && entry.level > result.riskLevel) {
        result = {
          riskLevel: entry.level,
          riskType: entry.type,
          strategyGuide: entry.guide
        }
        break
      }
    }
  }

  return result
}

// 리뷰 답글 생성을 위한 시스템 프롬프트를 구성합니다.
function buildReviewSystemPrompt(
  businessType: BusinessType,
  tone: ToneType,
  platform: PlatformType,
  marketingHook: boolean,
  riskResult: RiskResult,
  template: string
): string {
  const businessLabel: Record<BusinessType, string> = {
    cafe: '카페',
    restaurant: '식당/음식점',
    salon: '미용실',
    hospital: '병원/클리닉',
    etc: '일반 매장'
  }

  const toneInstruction: Record<ToneType, string> = {
    friendly: '친근하고 따뜻한 말투로 작성하세요.',
    formal: '정중하고 전문적인 말투로 작성하세요.',
    apology: '사과 중심의 진정성 있는 말투로 작성하세요.'
  }

  const platformInstruction =
    platform === 'delivery'
      ? '이모지를 적절히 섞어 친근하고 따뜻한 이웃 같은 말투로 작성해.'
      : '신규 고객이 검색 시 잘 노출되도록, 리뷰 내용에 있는 메뉴명이나 지역 키워드를 자연스럽게 한 번 더 언급하고, 정중하고 전문적인 말투로 작성해.'

  const marketingInstruction = marketingHook
    ? ' 답글 마지막에 "다음 방문(또는 주문) 시 요청사항에 남겨주시거나 이 답글을 보여주시면 작은 서비스를 준비하겠습니다" 같은 재방문 유도 멘트를 자연스럽게 추가해.'
    : ''

  const riskInstruction =
    riskResult.riskLevel >= 4
      ? ` 위험 리뷰(${riskResult.riskLevel}단계): 감정적 대응 절대 금지. 사실 관계만 중립적으로. 지침: ${riskResult.strategyGuide}`
      : riskResult.riskLevel >= 3
        ? ` 참고 지침: ${riskResult.strategyGuide}`
        : ''

  return `너는 ${businessLabel[businessType]} 사장님이야. 제공된 [동적 템플릿]의 핵심어와 의미를 100% 유지하면서, [사용자 리뷰] 맥락에 맞게 2~3줄로만 자연스럽게 윤문해. ${toneInstruction[tone]} ${platformInstruction}${marketingInstruction}${riskInstruction}

[동적 템플릿]
${template}

[절대 금지 사항]
- 환불, 교환, 재제조, 보상 등 구체적 약속을 임의로 생성하지 마세요.
- 직원 징계, 교육, 해고 등 내부 조치를 언급하지 마세요.
- 실제 존재하지 않을 수 있는 이벤트, 쿠폰, 혜택을 생성하지 마세요.
- 리뷰에 없는 사실을 추가하거나 과장하지 마세요.
- 답글은 반드시 200자 이내로 작성하세요.`
}

export const POST = async ({ request, locals }: RequestEvent) => {
  // 커스텀 locals.storeId는 런타임 주입값이므로 타입 가드로 안전하게 읽습니다.
  const storeId = (locals as { storeId?: string }).storeId
  if (!storeId) throw error(401, '인증이 필요합니다.')

  const body = await request.json()
  const { review, businessType, tone, platform, marketingHook } = body as {
    review?: unknown
    businessType?: unknown
    tone?: unknown
    platform?: unknown
    marketingHook?: unknown
  }

  // 기본 입력 검증
  if (!review || typeof review !== 'string') throw error(400, '리뷰 내용이 없습니다.')
  const trimmed = review.trim()
  if (trimmed.length < 5) throw error(400, '리뷰가 너무 짧습니다.')
  if (trimmed.length > 1000) throw error(400, '리뷰가 너무 깁니다. 1000자 이내로 입력해주세요.')

  // enum 값 검증
  const validBusinessTypes: BusinessType[] = ['cafe', 'restaurant', 'salon', 'hospital', 'etc']
  const validTones: ToneType[] = ['friendly', 'formal', 'apology']
  const validPlatforms: PlatformType[] = ['delivery', 'map']

  if (!businessType || typeof businessType !== 'string' || !validBusinessTypes.includes(businessType as BusinessType)) {
    throw error(400, '업종 값이 올바르지 않습니다.')
  }
  if (!tone || typeof tone !== 'string' || !validTones.includes(tone as ToneType)) {
    throw error(400, '톤 값이 올바르지 않습니다.')
  }
  if (!platform || typeof platform !== 'string' || !validPlatforms.includes(platform as PlatformType)) {
    throw error(400, '플랫폼 값이 올바르지 않습니다.')
  }
  if (typeof marketingHook !== 'boolean') {
    throw error(400, 'marketingHook 값이 올바르지 않습니다.')
  }

  // 프롬프트 인젝션 방어를 위해 위험 문자를 제거합니다.
  const safeReview = trimmed.replace(/[<>]/g, '').slice(0, 1000)

  // API 키는 서버 비밀 환경변수에서만 읽습니다.
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const riskResult = analyzeRisk(safeReview)
    const keywords = extractKeywords(safeReview)
    const score = calculateScore(keywords)
    const mainKeywords = pickMainKeywords(keywords)
    const template = generateDynamicTemplate(score, mainKeywords)
    const systemPrompt = buildReviewSystemPrompt(
      businessType as BusinessType,
      tone as ToneType,
      platform as PlatformType,
      marketingHook,
      riskResult,
      template
    )

    const message = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: safeReview }]
      },
      { signal: controller.signal }
    )

    const replyText =
      message.content[0]?.type === 'text' ? message.content[0].text : ''
    clearTimeout(timeout)

    // 이력 저장 실패는 응답 실패로 처리하지 않습니다.
    try {
      await locals.supabase.from('review_replies').insert({
        store_id: storeId,
        review_text: safeReview,
        business_type: businessType,
        tone,
        platform,
        marketing_hook: marketingHook,
        reply: replyText,
        risk_level: riskResult.riskLevel,
        risk_type: riskResult.riskType,
        strategy_guide: riskResult.strategyGuide
      })
    } catch (saveErr) {
      console.error('[review] 이력 저장 실패:', saveErr)
    }

    return json({
      reply: replyText,
      riskLevel: riskResult.riskLevel,
      riskType: riskResult.riskType,
      strategyGuide: riskResult.strategyGuide
    })
  } catch (e: unknown) {
    clearTimeout(timeout)
    if (e instanceof Error && e.name === 'AbortError') {
      throw error(504, 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
    }
    console.error('[review] Claude API 오류:', e)
    throw error(500, '답글 생성 중 오류가 발생했습니다.')
  }
}
