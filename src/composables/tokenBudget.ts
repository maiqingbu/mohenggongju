/**
 * Token 预算计算器
 * 对标 inkos 的 capContextBlock + plotbunni 的 tokenCount
 */

/** 粗略 token 估算：中文每字 ≈1.5 token，英文每词 ≈1.3 token，标点 ≈1 token */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const others = text.replace(/[\u4e00-\u9fffa-zA-Z\s]/g, '').length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + others)
}

export interface TokenBudget {
  contextLength: number
  maxOutputTokens: number
  systemPromptTokens: number
  availableForContext: number
  currentContextTokens: number
  remaining: number
  needsTruncation: boolean
}

/** 计算 token 预算 */
export function calculateBudget(params: {
  contextLength: number
  maxOutputTokens: number
  systemPrompt: string
  context: string
  safetyBuffer?: number
}): TokenBudget {
  const safety = params.safetyBuffer ?? 200
  const systemPromptTokens = estimateTokens(params.systemPrompt)
  const availableForContext =
    params.contextLength - params.maxOutputTokens - systemPromptTokens - safety
  const currentContextTokens = estimateTokens(params.context)
  const remaining = availableForContext - currentContextTokens
  return {
    contextLength: params.contextLength,
    maxOutputTokens: params.maxOutputTokens,
    systemPromptTokens,
    availableForContext,
    currentContextTokens,
    remaining,
    needsTruncation: remaining < 0,
  }
}

/**
 * 头尾保留式截断 — 对标 inkos capContextBlock
 * 保留开头 40% + 末尾 60%，中间省略并声明
 */
export function truncateHeadTail(
  text: string,
  maxTokens: number,
  label = '上下文',
): { truncated: string; omitted: number } {
  const currentTokens = estimateTokens(text)
  if (currentTokens <= maxTokens) return { truncated: text, omitted: 0 }

  const omitted = currentTokens - maxTokens
  const headRatio = 0.4
  const note = `\n\n[上下文预算限制：${label}省略了约 ${omitted} tokens；保留了开头和最新尾部]\n\n`
  const noteTokens = estimateTokens(note)

  const keepTokens = maxTokens - noteTokens
  const headTokens = Math.floor(keepTokens * headRatio)
  const tailTokens = keepTokens - headTokens

  const totalChars = text.length
  const headChars = Math.floor(totalChars * (headTokens / currentTokens))
  const tailChars = Math.floor(totalChars * (tailTokens / currentTokens))

  return {
    truncated: text.slice(0, headChars) + note + text.slice(-tailChars),
    omitted,
  }
}
