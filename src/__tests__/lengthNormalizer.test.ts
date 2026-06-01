/**
 * lengthNormalizer 字数修正器 — 深度测试
 */
import { describe, it, expect } from 'vitest'
import {
  looksTruncated,
  sanitizeNormalizedContent,
} from '../agents/steps/lengthNormalizer'

// ── 截断检测 ──

describe('looksTruncated', () => {
  // 所有字符串需 >= 20 字符（looksTruncated 的最短判定阈值）

  it('以句号结尾应判为完整', () => {
    expect(looksTruncated('这是一个完整的句子，包含了足够的文字来测试截断检测逻辑。')).toBe(false)
  })

  it('以问号结尾应判为完整', () => {
    expect(looksTruncated('这真的是一个完整的问句吗，它包含了足够多的文字内容？')).toBe(false)
  })

  it('以感叹号结尾应判为完整', () => {
    expect(looksTruncated('终于写完了这一章的全部内容，真是太好了！')).toBe(false)
  })

  it('以省略号结尾应判为完整', () => {
    expect(looksTruncated('他默默地走远了，身影逐渐消失在暮色之中……')).toBe(false)
  })

  it('以逗号结尾应判为截断', () => {
    expect(looksTruncated('这是不完整的句子它没有写完就被截断了，')).toBe(true)
  })

  it('以顿号结尾应判为截断', () => {
    expect(looksTruncated('还有一个重要的情节没有交代清楚、')).toBe(true)
  })

  it('短于 20 字符应判为截断', () => {
    expect(looksTruncated('短。')).toBe(true)
  })

  it('空字符串应判为截断', () => {
    expect(looksTruncated('')).toBe(true)
  })

  it('英文/数字结尾无标点应判为截断', () => {
    expect(looksTruncated('The end of the chapter was drawing near but something')).toBe(true)
  })

  it('引号结尾应判为完整', () => {
    expect(looksTruncated('他转过身说："这是一句完整的话，应该不会被判定为截断。"')).toBe(false)
  })
})

// ── 内容净化 ──

describe('sanitizeNormalizedContent', () => {
  it('应剥离 markdown 代码围栏', () => {
    const raw = '```\n正文内容\n```'
    const result = sanitizeNormalizedContent(raw)
    expect(result).toBe('正文内容')
  })

  it('应剥离修正后/压缩后标题', () => {
    expect(sanitizeNormalizedContent('## 修正后\n正文')).toBe('正文')
    expect(sanitizeNormalizedContent('# 压缩后\n正文')).toBe('正文')
    expect(sanitizeNormalizedContent('### 输出\n正文')).toBe('正文')
  })

  it('纯正文应不变', () => {
    const text = '这是纯粹的正文内容。'
    expect(sanitizeNormalizedContent(text)).toBe(text)
  })
})
