/**
 * reviser 修订 Agent — 深度测试
 */
import { describe, it, expect } from 'vitest'
import { applySpotFixPatches } from '../agents/steps/reviser'

describe('applySpotFixPatches', () => {
  it('应精确替换目标文本', () => {
    const content = '他慢慢地推开了那扇沉重的木门。'
    const patches = [
      { target: '慢慢地', replacement: '缓缓地' },
    ]
    const result = applySpotFixPatches(content, patches)
    expect(result).toBe('他缓缓地推开了那扇沉重的木门。')
  })

  it('应支持多补丁', () => {
    const content = '他感到一阵愤怒涌上心头。他深吸一口气，准备说话。'
    const patches = [
      { target: '他感到一阵愤怒涌上心头。', replacement: '他的后槽牙咬紧了。' },
      { target: '他深吸一口气，准备说话。', replacement: '他停了两秒才开口。' },
    ]
    const result = applySpotFixPatches(content, patches)
    expect(result).toBe('他的后槽牙咬紧了。他停了两秒才开口。')
  })

  it('目标不存在时应跳过', () => {
    const content = '原文内容。'
    const patches = [
      { target: '不存在的文本', replacement: '替换文本' },
    ]
    const result = applySpotFixPatches(content, patches)
    expect(result).toBe('原文内容。')
  })

  it('空补丁列表应不变', () => {
    const content = '原文。'
    expect(applySpotFixPatches(content, [])).toBe('原文。')
  })

  it('应处理全文范围内的替换', () => {
    const content = '他笑了笑，她也笑了笑。'
    const patches = [
      { target: '笑了笑', replacement: '嘴角微动' },
    ]
    // 只替换第一个匹配
    const result = applySpotFixPatches(content, patches)
    expect(result).toContain('嘴角微动')
  })
})
