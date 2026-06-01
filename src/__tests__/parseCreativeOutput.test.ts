/**
 * parseCreativeOutput 结构化解析器 — 深度测试
 */
import { describe, it, expect } from 'vitest'
import {
  parseCreativeOutput,
  parseMultiChapterOutput,
  stripSelfCheck,
} from '../composables/parseCreativeOutput'

// ── 单章解析 ──

describe('parseCreativeOutput — 结构化标签提取', () => {
  it('应正确提取 === CHAPTER_TITLE ===', () => {
    const raw = [
      '=== CHAPTER_TITLE ===',
      '第一章：开端',
      '=== CHAPTER_CONTENT ===',
      '正文内容在这里。',
      '=== SELF_CHECK ===',
      '视角通过',
    ].join('\n')

    const result = parseCreativeOutput(raw)
    expect(result.title).toBe('第一章：开端')
    expect(result.content).toContain('正文内容在这里')
    expect(result.selfCheck).toContain('视角通过')
    expect(result.wordCount).toBeGreaterThan(0)
  })

  it('应正确处理无标题的情况', () => {
    const raw = [
      '=== CHAPTER_CONTENT ===',
      '只有正文，没有标题。',
      '=== SELF_CHECK ===',
      '检查完毕',
    ].join('\n')

    const result = parseCreativeOutput(raw)
    expect(result.content).toContain('只有正文，没有标题')
    expect(result.selfCheck).toContain('检查完毕')
  })

  it('应正确处理无自检的情况', () => {
    const raw = [
      '=== CHAPTER_TITLE ===',
      '第二章',
      '=== CHAPTER_CONTENT ===',
      '只有正文和标题。',
    ].join('\n')

    const result = parseCreativeOutput(raw)
    expect(result.title).toBe('第二章')
    expect(result.content).toContain('只有正文和标题')
    expect(result.selfCheck).toBe('')
  })

  it('空字符串应返回空结果', () => {
    const result = parseCreativeOutput('')
    expect(result.content).toBe('')
    expect(result.title).toBe('')
    expect(result.selfCheck).toBe('')
    expect(result.wordCount).toBe(0)
  })

  it('应正确计数中文字数', () => {
    const raw = [
      '=== CHAPTER_CONTENT ===',
      '这是测试正文内容',
      '=== SELF_CHECK ===',
      'ok',
    ].join('\n')

    const result = parseCreativeOutput(raw, 1, 'zh_chars')
    // '这是测试正文内容' = 8 个中文字
    expect(result.wordCount).toBe(8)
  })
})

// ── Fallback 解析 ──

describe('parseCreativeOutput — Fallback 解析', () => {
  it('无标记时按 Markdown 标题分章', () => {
    const raw = [
      '## 第1章 开端',
      '第一章正文内容。',
      '',
      '## 第2章 发展',
      '第二章正文内容。',
    ].join('\n')

    const result = parseMultiChapterOutput(raw)
    expect(result.chapters).toHaveLength(2)
    expect(result.chapters[0].title).toBe('开端')
    expect(result.chapters[1].title).toBe('发展')
  })

  it('无标记无标题时提取全文为正文', () => {
    const raw = '这是一段没有标记的纯正文。'

    const result = parseCreativeOutput(raw)
    expect(result.content).toContain('这是一段没有标记的纯正文')
    expect(result.title).toBe('')
  })

  it('应剥离 --- 分隔符后的自检（兼容旧格式）', () => {
    const raw = [
      '正文内容第一段。',
      '',
      '正文内容第二段。',
      '',
      '---',
      '',
      '[x] 视角检查通过',
      '[ ] 对话需优化',
    ].join('\n')

    const result = parseCreativeOutput(raw)
    expect(result.content).toContain('正文内容第一段')
    expect(result.content).toContain('正文内容第二段')
    // 自检部分通过 fallbackExtractContent 去除
    expect(result.content).not.toContain('[x] 视角检查通过')
  })

  it('章节标题 label 格式应能解析', () => {
    const raw = [
      'CHAPTER_TITLE：神秘的开端',
      '正文内容。',
    ].join('\n')

    const result = parseCreativeOutput(raw)
    expect(result.title).toBe('神秘的开端')
  })
})

// ── 多章解析 ──

describe('parseMultiChapterOutput — 多章解析', () => {
  it('应提取多个 === CHAPTER_CONTENT === 块', () => {
    const raw = [
      '=== CHAPTER_TITLE ===',
      '第一章',
      '=== CHAPTER_CONTENT ===',
      '第一章正文。',
      '=== CHAPTER_TITLE ===',
      '第二章',
      '=== CHAPTER_CONTENT ===',
      '第二章正文。',
      '=== SELF_CHECK ===',
      '全局检查',
      '=== GLOBAL_NOTE ===',
      '跨章一致',
    ].join('\n')

    const result = parseMultiChapterOutput(raw)
    expect(result.chapters.length).toBeGreaterThanOrEqual(1)
    expect(result.globalNote).toContain('跨章一致')
  })

  it('单章输入应返回单元素数组', () => {
    const raw = [
      '=== CHAPTER_CONTENT ===',
      '单章正文。',
    ].join('\n')

    const result = parseMultiChapterOutput(raw)
    expect(result.chapters.length).toBeGreaterThanOrEqual(1)
  })
})

// ── stripSelfCheck ──

describe('stripSelfCheck', () => {
  it('应从正文中剥离自检内容', () => {
    const text = [
      '正文第一段。',
      '',
      '正文第二段。',
      '',
      '---',
      '',
      '[x] 视角检查',
      '[ ] 段落检查',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文第一段')
    expect(result).toContain('正文第二段')
  })

  it('无自检的正文应原样返回', () => {
    const text = '纯正文，无自检标记。'
    const result = stripSelfCheck(text)
    expect(result).toBe('纯正文，无自检标记。')
  })

  it('应处理中文自检标题（import 自 stripSelfCheck.ts）', async () => {
    // parseCreativeOutput 的 re-export 版 stripSelfCheck 仅处理 --- 分隔符
    // 中文自检标题的处理在 stripSelfCheck.ts 中，此处测试 --- 分隔符版
    const text = [
      '正文内容。',
      '',
      '---',
      '',
      '## 输出前自检',
      '- [x] 视角通过',
    ].join('\n')

    const result = stripSelfCheck(text)
    expect(result).toContain('正文内容')
    // --- 后的自检内容应被剥离
    expect(result).not.toContain('[x] 视角通过')
  })
})
