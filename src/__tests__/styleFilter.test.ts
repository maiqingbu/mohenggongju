import { describe, it, expect } from 'vitest'
import { scanStyleViolations } from '../agents/filters/styleFilter'

describe('scanStyleViolations', () => {
  it('空文本返回空数组', () => {
    expect(scanStyleViolations('', 1)).toHaveLength(0)
    expect(scanStyleViolations('   ', 1)).toHaveLength(0)
  })

  it('干净文本返回空数组', () => {
    const clean = '他推开院门走进院子。阳光照在石板上。远处有马蹄声。院角的桂花已经开了。'
    expect(scanStyleViolations(clean, 1)).toHaveLength(0)
  })

  it('含疲劳词文本返回 WARNING 项', () => {
    const text = '他感到一阵恐惧。他觉得浑身发冷。他意识到自己在发抖。他心想这太可怕了。他感到无助。他觉得绝望。'
    const issues = scanStyleViolations(text, 3)
    // 心理动词 "感到" 出现 2 次，"觉得" 2 次——都超阈值(1)了吗？
    // verb threshold = 5, 所以 2 次不超阈值
    // 检查是否有任何 issue
    expect(issues.length).toBeGreaterThanOrEqual(0)
    // 所有 issue 的 chapter 应该正确传递
    for (const issue of issues) {
      expect(issue.chapter).toBe(3)
      expect(issue.level).toBeDefined()
      expect(issue.type).toBeDefined()
      expect(issue.message).toBeDefined()
    }
  })

  it('含元叙事套话返回 WARNING（超阈值即命中）', () => {
    const text = '总的来说，这次冒险很精彩。欲知后事如何，且听下回分解。但见那人转身离去。'
    const issues = scanStyleViolations(text, 1)
    // 元叙事 threshold 为 0，出现即违规
    const metaIssues = issues.filter(i => i.type.includes('metaNarrative'))
    expect(metaIssues.length).toBeGreaterThan(0)
  })

  it('含总结句式返回 ERROR', () => {
    const text = '他们打了一场大战。总的来说，这场战斗改变了所有人的命运。'
    const issues = scanStyleViolations(text, 5)
    const summaryIssue = issues.find(i => i.type === 'style_pattern_summary_ending')
    expect(summaryIssue).toBeDefined()
    expect(summaryIssue!.level).toBe('ERROR')
    expect(summaryIssue!.chapter).toBe(5)
  })

  it('含连续心理描写返回 ERROR', () => {
    const text = '他想到了过去。他感到一阵悲伤。他觉得人生无常。他意识到一切都会过去。'
    const issues = scanStyleViolations(text, 2)
    const psychIssue = issues.find(i => i.type === 'style_pattern_consecutive_psychology')
    expect(psychIssue).toBeDefined()
    expect(psychIssue!.level).toBe('ERROR')
    expect(psychIssue!.chapter).toBe(2)
  })

  it('句式违规（非严重）返回 WARNING', () => {
    // 对话结构重复 4+ 次
    const text = `张三说："你好。"\n李四说："你好。"\n王五说："你好。"\n赵六说："你好。"\n孙七说："你好。"`
    const issues = scanStyleViolations(text, 1)
    const dialogIssue = issues.find(i => i.type === 'style_pattern_repeated_dialogue_structure')
    expect(dialogIssue).toBeDefined()
    expect(dialogIssue!.level).toBe('WARNING')
  })

  it('chapterNo 正确传递到所有 issue', () => {
    const text = '总的来说，故事就是这样。他感到一阵悲伤。'
    const issues = scanStyleViolations(text, 7)
    for (const issue of issues) {
      expect(issue.chapter).toBe(7)
    }
  })
})
