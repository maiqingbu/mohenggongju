import { describe, it, expect } from 'vitest'
import { createStyleReviewAgent } from '../agents/steps/styleReview'
import type { ConsistencyIssue } from '../agents/types'

describe('createStyleReviewAgent', () => {
  const agent = createStyleReviewAgent()

  it('agent 基本属性正确', () => {
    expect(agent.id).toBe('style_review')
    expect(agent.name).toBe('文风审查')
    expect(agent.badge).toBe('旗舰版')
    expect(agent.requiredContext).toEqual([])
  })

  it('parseOutput 解析有效 JSON（通过）', () => {
    const result = agent.parseOutput(JSON.stringify({
      passed: true,
      warnings: [],
      summary: '审查完成，未发现文风问题',
    }))
    expect(result.passed).toBe(true)
    expect((result.warnings as ConsistencyIssue[])).toHaveLength(0)
    expect(result.summary).toContain('审查完成')
  })

  it('parseOutput 解析有效 JSON（有 warning）', () => {
    const result = agent.parseOutput(JSON.stringify({
      passed: false,
      warnings: [
        { level: 'WARNING', type: 'style_pov', message: 'POV 越界', chapter: 3 },
        { level: 'ERROR', type: 'style_dialogue', message: '对话回答问题', chapter: 3 },
      ],
      summary: '发现 2 个问题',
    }))
    expect(result.passed).toBe(false)
    const warnings = result.warnings as ConsistencyIssue[]
    expect(warnings).toHaveLength(2)
    expect(warnings[0].level).toBe('WARNING')
    expect(warnings[1].level).toBe('ERROR')
    expect(warnings[0].chapter).toBe(3)
    expect(warnings[0].type).toBe('style_pov')
  })

  it('parseOutput 解析填充检测 warning（style_padding）', () => {
    const result = agent.parseOutput(JSON.stringify({
      passed: false,
      warnings: [
        { level: 'ERROR', type: 'style_padding', message: '"没说话"出现3次，超过上限1次', chapter: 2 },
        { level: 'WARNING', type: 'style_padding', message: '连续4回合无推进问答：林逸问-秦月答循环', chapter: 2 },
      ],
      summary: '发现填充注水问题',
    }))
    expect(result.passed).toBe(false)
    const warnings = result.warnings as ConsistencyIssue[]
    expect(warnings).toHaveLength(2)
    expect(warnings[0].type).toBe('style_padding')
    expect(warnings[0].level).toBe('ERROR')
    expect(warnings[1].type).toBe('style_padding')
    expect(warnings[1].level).toBe('WARNING')
  })

  it('parseOutput 解析有效 JSON（markdown 代码块包裹）', () => {
    const result = agent.parseOutput('```json\n' + JSON.stringify({
      passed: true,
      warnings: [],
      summary: '一切正常',
    }) + '\n```')
    expect(result.passed).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('parseOutput 无效 JSON fallback 不阻塞', () => {
    const result = agent.parseOutput('这不是有效的 JSON 响应')
    expect(result.passed).toBe(true)
    expect(result.parseError).toBe(true)
    expect(result.warnings).toHaveLength(0)
    expect(result.summary).toContain('解析失败')
  })

  it('parseOutput 空字符串 fallback', () => {
    const result = agent.parseOutput('')
    expect(result.passed).toBe(true)
    expect(result.parseError).toBe(true)
  })

  it('parseOutput 空 warnings 时 passed=true', () => {
    const result = agent.parseOutput(JSON.stringify({
      passed: true,
      warnings: [],
      summary: '无问题',
    }))
    expect(result.passed).toBe(true)
  })

  it('writeBack 是空操作', async () => {
    // 不应抛出异常
    await agent.writeBack({ some: 'data' }, {})
    expect(true).toBe(true) // 到达这里即成功
  })
})
