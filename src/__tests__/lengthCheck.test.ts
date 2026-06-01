/**
 * lengthCheck agent 测试 — 字数统计 + 偏差计算 + 判定逻辑
 */
import { describe, it, expect } from 'vitest'
import { countChineseChars, createLengthCheckAgent } from '../agents/steps/lengthCheck'

describe('countChineseChars', () => {
  it('counts Chinese characters and ignores whitespace', () => {
    expect(countChineseChars('你好世界')).toBe(4)
    expect(countChineseChars('你好   世界')).toBe(4)
    expect(countChineseChars('  你好\n世界  ')).toBe(4)
  })

  it('counts mixed Chinese and punctuation', () => {
    expect(countChineseChars('他说："你好。"')).toBe(8)  // 全部字符去空白
  })

  it('returns 0 for empty or whitespace-only', () => {
    expect(countChineseChars('')).toBe(0)
    expect(countChineseChars('   \n  ')).toBe(0)
  })

  it('counts all characters after removing whitespace', () => {
    expect(countChineseChars('hello世界123')).toBe(10)  // 全部字符去空白
  })
})

describe('createLengthCheckAgent', () => {
  const agent = createLengthCheckAgent()

  it('has correct metadata', () => {
    expect(agent.id).toBe('length_check')
    expect(agent.name).toBe('长度检测')
    expect(agent.badge).toBe('系统')
  })

  it('has empty systemPrompt (local execution)', () => {
    expect(agent.systemPrompt).toBe('')
  })

  it('parseOutput parses JSON', () => {
    const result = agent.parseOutput(JSON.stringify({ passed: true, wordCount: 2100 }))
    expect(result).toEqual({ passed: true, wordCount: 2100 })
  })

  it('parseOutput returns raw on invalid JSON', () => {
    const result = agent.parseOutput('not json')
    expect(result).toEqual({ raw: 'not json' })
  })
})

describe('lengthCheck localExecute', () => {
  const agent = createLengthCheckAgent()

  it('passes when deviation is within -30%/+15%', async () => {
    // 2000 words content, target 2000 → deviation 0%
    const content = '字'.repeat(2000)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(true)
    expect(result.wordCount).toBe(2000)
    expect(result.targetWords).toBe(2000)
    expect(result.deviation).toBe(0)
    expect(result.needsCompress).toBe(false)
    expect(result.needsExpand).toBe(false)
    expect(result.lowerThreshold).toBe(-0.3)
    expect(result.upperThreshold).toBe(0.15)
  })

  it('fails when deviation exceeds +15%（上限）', async () => {
    // 2500 words content, target 2000 → deviation +25%
    const content = '字'.repeat(2500)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(false)
    expect(result.wordCount).toBe(2500)
    expect(result.needsCompress).toBe(true)
    expect(result.needsExpand).toBe(false)
    expect(result.summary).toContain('压缩')
  })

  it('fails when deviation exceeds -30%（下限）', async () => {
    // 1300 words content, target 2000 → deviation -35%
    const content = '字'.repeat(1300)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(false)
    expect(result.wordCount).toBe(1300)
    expect(result.needsCompress).toBe(false)
    expect(result.needsExpand).toBe(true)
    expect(result.summary).toContain('扩展')
  })

  it('passes at -25%（下探范围内）', async () => {
    // 1500 words content, target 2000 → deviation -25%
    const content = '字'.repeat(1500)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(true)
    expect(result.wordCount).toBe(1500)
    expect(result.needsCompress).toBe(false)
    expect(result.needsExpand).toBe(false)
  })

  it('edge case: passes at exactly +15%（上限边界）', async () => {
    // 2300 words content, target 2000 → deviation +15%
    const content = '字'.repeat(2300)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(true)
    expect(result.deviation).toBe(0.15)
  })

  it('edge case: passes at exactly -30%（下限边界）', async () => {
    // 1400 words content, target 2000 → deviation -30%
    const content = '字'.repeat(1400)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(true)
    expect(result.deviation).toBe(-0.3)
  })

  it('edge case: fails at +16%（超过上限）', async () => {
    // 2320 words content, target 2000 → deviation +16%
    const content = '字'.repeat(2320)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.passed).toBe(false)
    expect(result.needsCompress).toBe(true)
  })

  it('default targetWords is 2000', async () => {
    const content = '字'.repeat(1800)
    const ctx = { 'step:gen_body_1': content }
    const inputs = { genBodyStepId: 'gen_body_1' }  // no targetWords

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.targetWords).toBe(2000)
  })

  it('reads from correct gen_body step based on genBodyStepId', async () => {
    const content1 = '第'.repeat(500)
    const content3 = '章'.repeat(3000)
    const ctx = {
      'step:gen_body_1': content1,
      'step:gen_body_3': content3,
    }
    const inputs = { genBodyStepId: 'gen_body_3', targetWords: '2000' }

    const rawOutput = await agent.localExecute!(inputs, ctx)
    const result = JSON.parse(rawOutput)

    expect(result.wordCount).toBe(3000)
    expect(result.needsCompress).toBe(true)
  })
})
