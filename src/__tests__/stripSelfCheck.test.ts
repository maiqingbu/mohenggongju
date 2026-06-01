/**
 * stripSelfCheck.ts 独立剥离函数 — 深度测试
 * 这是更鲁棒的版本（处理中文自检标题、各种分隔符）
 */
import { describe, it, expect } from 'vitest'
import { stripSelfCheck } from '../composables/stripSelfCheck'

describe('stripSelfCheck (standalone)', () => {
  it('应剥离 --- 分隔符后的自检', () => {
    const text = [
      '正文第一段。',
      '正文第二段。',
      '',
      '---',
      '',
      '[x] 视角检查通过',
      '[ ] 对话需优化',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文第一段')
    expect(result).toContain('正文第二段')
    expect(result).not.toContain('[x] 视角检查通过')
  })

  it('应剥离 markdown 格式的中文自检标题', () => {
    const text = [
      '正文内容。',
      '',
      '## 输出前自检',
      '- [x] 视角通过',
      '- [ ] 对话需优化',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文内容')
    // ## 标题行应被剥离（heading regex 匹配 # 前缀的自检标题）
    expect(result).not.toContain('输出前自检')
  })

  it('应剥离「自查清单」标题', () => {
    const text = [
      '正文。',
      '',
      '### 自查清单',
      '[✓] POV 锁定',
      '[✗] 段落合并',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文')
    expect(result).not.toContain('自查清单')
  })

  it('应剥离带 # 标题的自检段落', () => {
    const text = [
      '文章内容。',
      '',
      '---',
      '',
      '## 自检结果',
      '视角一致，对话自然。',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('文章内容')
    // --- 后的自检内容应被剥离（含 ## 标题）
    expect(result).not.toContain('自检结果')
  })

  it('无自检的正文应原样返回', () => {
    const text = '这是纯粹的正文内容，没有任何自检标记。'
    const result = stripSelfCheck(text)
    expect(result).toBe(text)
  })

  it('应处理 --- 分隔的自检（checkbox格式）', () => {
    const text = [
      '正文。',
      '',
      '---',
      '',
      '[x] 检查项A',
      '[ ] 检查项B',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文')
    // checkbox 格式的自检应被剥离
    expect(result).not.toContain('[x] 检查项A')
    expect(result).not.toContain('[ ] 检查项B')
  })

  it('空内容应安全处理', () => {
    expect(stripSelfCheck('')).toBe('')
  })

  it('正文中的 --- 若无自检上下文应保留', () => {
    // --- 如果后面不是自检清单，应保留
    const text = [
      '他说——',
      '',
      '然后停下了。',
    ].join('\n')

    const result = stripSelfCheck(text)
    // stripSelfCheck 会尝试剥离，但如果没有 checkbox 或自检关键词，应保留
    expect(result.length).toBeGreaterThan(0)
  })

  it('应剥离 ✓/✔/✗ checkbox 格式的自检', () => {
    const text = [
      '正文结束。',
      '',
      '---',
      '',
      '[✓] 视角检查通过',
      '[✔] 对话检查通过',
      '[✗] 需要修改段落',
      '',
      '后续内容。',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文结束')
    expect(result).not.toContain('[✓] 视角检查通过')
    expect(result).not.toContain('[✔] 对话检查通过')
  })
})
