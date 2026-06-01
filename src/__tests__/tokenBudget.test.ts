/**
 * tokenBudget.ts 上下文预算系统 — 深度测试
 * 覆盖：charsToTokens、tokensToChars、capContextBlock、enforceContextBudget、truncateHeadTail
 */
import { describe, it, expect } from 'vitest'
import {
  estimateTokens,
  charsToTokens,
  tokensToChars,
  capContextBlock,
  enforceContextBudget,
  calculateBudget,
  truncateHeadTail,
  CONTEXT_BLOCK_CAPS,
  type ContextBlock,
  type ContextBlockType,
} from '../composables/tokenBudget'

// ── 单位转换 ──

describe('charsToTokens / tokensToChars', () => {
  it('charsToTokens 应正比例转换', () => {
    expect(charsToTokens(2000)).toBe(1000)  // 2 chars/token
    expect(charsToTokens(0)).toBe(0)
  })

  it('tokensToChars 应正比例转换', () => {
    expect(tokensToChars(1000)).toBe(2000)
    expect(tokensToChars(0)).toBe(0)
  })

  it('charsToTokens → tokensToChars 应近似还原', () => {
    const original = 1500
    const tokens = charsToTokens(original)
    const restored = tokensToChars(tokens)
    // 因为取整可能有微小偏差
    expect(Math.abs(restored - original)).toBeLessThanOrEqual(2)
  })
})

// ── estimateTokens ──

describe('estimateTokens', () => {
  it('中文每字约 1.5 token', () => {
    expect(estimateTokens('你好')).toBe(3) // 2 chars × 1.5
  })

  it('空字符串返回 0', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('混合中英文应正确计算', () => {
    const result = estimateTokens('hello世界')
    expect(result).toBeGreaterThan(0)
  })
})

// ── capContextBlock ──

describe('capContextBlock', () => {
  it('未超限的块应原样返回', () => {
    const block: ContextBlock = {
      type: 'style_guide',
      label: '文风',
      content: '短内容',
    }
    const result = capContextBlock(block)
    expect(result.content).toBe('短内容')
  })

  it('超限块应被截断', () => {
    const longContent = 'A'.repeat(2000)
    const block: ContextBlock = {
      type: 'world_settings',
      label: '世界观',
      content: longContent,
    }
    // world_settings 上限 800 字符
    const result = capContextBlock(block)
    expect(result.content.length).toBeLessThan(longContent.length)
    expect(result.content).toContain('省略')
  })

  it('自定义 maxChars 应优先生效', () => {
    const longContent = 'B'.repeat(500)
    const block: ContextBlock = {
      type: 'custom',
      label: '自定义块',
      content: longContent,
      maxChars: 200,
    }
    const result = capContextBlock(block)
    expect(result.content.length).toBeLessThan(longContent.length)
  })

  it('截断后应保留头部和尾部', () => {
    const head = '【开头重要信息】'
    const tail = '【结尾重要信息】'
    const middle = 'X'.repeat(2000)
    const block: ContextBlock = {
      type: 'chapter_outline',
      label: '章纲',
      content: head + middle + tail,
    }
    const result = capContextBlock(block)
    expect(result.content).toContain('【开头重要信息】')
    expect(result.content).toContain('【结尾重要信息】')
    expect(result.content).toContain('省略')
  })

  it('所有类型都应有默认上限', () => {
    const types: ContextBlockType[] = [
      'chapter_outline', 'recent_chapters', 'character_matrix',
      'foreshadow_ledger', 'world_settings', 'style_guide',
      'previous_chapter', 'global_outline', 'volume_outline', 'custom',
    ]
    for (const t of types) {
      expect(CONTEXT_BLOCK_CAPS[t]).toBeGreaterThan(0)
    }
  })
})

// ── enforceContextBudget ──

describe('enforceContextBudget', () => {
  it('应批量裁剪所有块', () => {
    const blocks: ContextBlock[] = [
      { type: 'style_guide', label: '文风', content: '短内容' },
      { type: 'world_settings', label: '世界观', content: 'X'.repeat(2000) },
    ]
    const result = enforceContextBudget(blocks)
    expect(result.blocks).toHaveLength(2)
    expect(result.truncatedBlocks).toBeGreaterThanOrEqual(1)
    expect(result.totalTokens).toBeGreaterThan(0)
  })

  it('无超限时应无截断', () => {
    const blocks: ContextBlock[] = [
      { type: 'style_guide', label: '文风', content: '短' },
      { type: 'character_matrix', label: '角色', content: '也很短' },
    ]
    const result = enforceContextBudget(blocks)
    expect(result.truncatedBlocks).toBe(0)
  })

  it('空块列表应返回零值', () => {
    const result = enforceContextBudget([])
    expect(result.blocks).toHaveLength(0)
    expect(result.totalTokens).toBe(0)
    expect(result.truncatedBlocks).toBe(0)
  })
})

// ── calculateBudget ──

describe('calculateBudget', () => {
  it('应正确计算可用预算', () => {
    const result = calculateBudget({
      contextLength: 128000,
      maxOutputTokens: 16000,
      systemPrompt: '简短的系统提示。',
      context: '',
    })
    expect(result.availableForContext).toBeGreaterThan(0)
    expect(result.needsTruncation).toBe(false)
    expect(result.remaining).toBeGreaterThan(0)
  })

  it('上下文过大时应标记 needsTruncation', () => {
    const hugeContext = '很长的上下文。'.repeat(50000)
    const result = calculateBudget({
      contextLength: 32000,
      maxOutputTokens: 4096,
      systemPrompt: '简短系统提示。',
      context: hugeContext,
    })
    expect(result.needsTruncation).toBe(true)
  })

  it('safetyBuffer 应被正确使用', () => {
    const withoutBuffer = calculateBudget({
      contextLength: 128000,
      maxOutputTokens: 16000,
      systemPrompt: '',
      context: '',
      safetyBuffer: 0,
    })
    const withBuffer = calculateBudget({
      contextLength: 128000,
      maxOutputTokens: 16000,
      systemPrompt: '',
      context: '',
      safetyBuffer: 1000,
    })
    expect(withBuffer.availableForContext).toBeLessThan(withoutBuffer.availableForContext)
  })
})

// ── truncateHeadTail ──

describe('truncateHeadTail', () => {
  it('未超限应原样返回', () => {
    const { truncated, omitted } = truncateHeadTail('短文本', 1000, '测试')
    expect(truncated).toBe('短文本')
    expect(omitted).toBe(0)
  })

  it('超限应头尾保留式截断', () => {
    const longText = '长文本内容。'.repeat(5000)
    const { truncated, omitted } = truncateHeadTail(longText, 500, '测试上下文')
    expect(truncated.length).toBeLessThan(longText.length)
    expect(omitted).toBeGreaterThan(0)
    expect(truncated).toContain('省略')
  })

  it('截断后内容应包含标签', () => {
    const longText = '这是需要被截断的长文本内容。'.repeat(500)
    const { truncated } = truncateHeadTail(longText, 200, '章纲')
    expect(truncated).toContain('章纲')
  })
})
