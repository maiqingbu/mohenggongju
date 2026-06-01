/**
 * Token 预算计算器 + 上下文预算管理器
 * 对标 inkos 的 capContextBlock + plotbunni 的 tokenCount
 *
 * 设计原则：
 *   - 上下文块类型决定硬上限，防止某类上下文挤占其他 block
 *   - 总预算 = 模型上下文长度 - 输出预留 - system prompt - 安全缓冲
 *   - 超预算时头尾保留式截断，不丢最新信息
 */

// ── 上下文块类型与硬上限 ──

export type ContextBlockType =
  | 'chapter_outline'
  | 'recent_chapters'
  | 'character_matrix'
  | 'foreshadow_ledger'
  | 'world_settings'
  | 'style_guide'
  | 'previous_chapter'
  | 'global_outline'
  | 'volume_outline'
  | 'custom'

/** 每个上下文块类型的硬上限（字符数） */
export const CONTEXT_BLOCK_CAPS: Record<ContextBlockType, number> = {
  chapter_outline:    1500,
  recent_chapters:    2000,
  character_matrix:   1200,
  foreshadow_ledger:  1000,
  world_settings:      800,
  style_guide:         600,
  previous_chapter:   3000,
  global_outline:     2000,
  volume_outline:     1500,
  custom:             1000,
}

export interface ContextBlock {
  type: ContextBlockType
  label: string
  content: string
  maxChars?: number
}

export interface BudgetedContext {
  blocks: ContextBlock[]
  totalTokens: number
  totalBudget: number
  truncatedBlocks: number
}

// ── Token 估算 ──

/** 粗略 token 估算：中文每字 ≈1.5 token，英文每词 ≈1.3 token，标点 ≈1 token */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length
  const others = text.replace(/[一-鿿a-zA-Z\s]/g, '').length
  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + others)
}

/** 字符数 → 近似 token（中文约 2 字符/token，保守取 0.5） */
export function charsToTokens(chars: number): number {
  return Math.ceil(chars * 0.5)
}

/** token → 近似字符数 */
export function tokensToChars(tokens: number): number {
  return tokens * 2
}

// ── 上下文块裁剪 ──

/**
 * 按上下文块类型硬上限裁剪单个块
 * 对标 inkos capContextBlock — 超限则头尾保留式截断
 */
export function capContextBlock(block: ContextBlock): ContextBlock {
  const maxChars = block.maxChars ?? CONTEXT_BLOCK_CAPS[block.type] ?? 1000
  if (block.content.length <= maxChars) return block

  const headRatio = 0.35
  const headLen = Math.floor(maxChars * headRatio)
  const tailLen = maxChars - headLen - 60 // 留 60 字符给省略声明
  const omitted = block.content.length - maxChars

  const truncated =
    block.content.slice(0, headLen) +
    `\n\n[${block.label} 省略了约 ${omitted} 字符 — 保留了开头和最新尾部]\n\n` +
    block.content.slice(-tailLen)

  return { ...block, content: truncated }
}

/**
 * 批量裁剪上下文块，并计算总 token 预算
 * 返回裁剪后的块列表 + 预算摘要
 */
export function enforceContextBudget(
  blocks: ContextBlock[],
  totalTokenBudget?: number,
): BudgetedContext {
  let truncatedBlocks = 0
  const capped: ContextBlock[] = []

  for (const block of blocks) {
    const result = capContextBlock(block)
    if (result.content !== block.content) truncatedBlocks++
    capped.push(result)
  }

  const allContent = capped.map(b => `## ${b.label}\n${b.content}`).join('\n\n')
  const totalTokens = estimateTokens(allContent)

  return {
    blocks: capped,
    totalTokens,
    totalBudget: totalTokenBudget ?? -1,
    truncatedBlocks,
  }
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
