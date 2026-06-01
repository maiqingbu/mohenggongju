/**
 * compressExpand agent 测试 — 创建函数 + parseOutput
 */
import { describe, it, expect } from 'vitest'
import { createCompressExpandAgent } from '../agents/steps/compressExpand'

describe('createCompressExpandAgent', () => {
  const agent = createCompressExpandAgent()

  it('has correct metadata', () => {
    expect(agent.id).toBe('compress_expand')
    expect(agent.name).toBe('字数调整')
    expect(agent.badge).toBe('旗舰版')
  })

  it('system prompt contains compress and expand principles', () => {
    const sp = agent.systemPrompt
    expect(sp).toContain('压缩原则')
    expect(sp).toContain('扩展原则')
    expect(sp).toContain('铁律')
    expect(sp).toContain('偏差 ≤20%')
  })

  it('system prompt instructs raw output (not JSON)', () => {
    expect(agent.systemPrompt).toContain('直接输出')
    expect(agent.systemPrompt).toContain('不要 JSON')
  })

  it('parseOutput extracts content from raw text', () => {
    const result = agent.parseOutput('这是调整后的正文内容')
    expect(result).toEqual({ content: '这是调整后的正文内容', warnings: [] })
  })

  it('parseOutput trims whitespace', () => {
    const result = agent.parseOutput('  正文前后有空格  \n')
    expect(result).toEqual({ content: '正文前后有空格', warnings: [] })
  })

  it('parseOutput handles empty output', () => {
    const result = agent.parseOutput('')
    expect(result).toEqual({ content: '', warnings: [] })
  })

  it('writeBack is no-op', async () => {
    // Should not throw
    await agent.writeBack({ content: 'test' }, {})
  })

  it('has empty requiredContext', () => {
    expect(agent.requiredContext).toEqual([])
  })

  it('has no localExecute (goes through LLM)', () => {
    expect(agent.localExecute).toBeUndefined()
  })
})
