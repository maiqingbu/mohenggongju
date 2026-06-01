/**
 * LLM 输出的结构化解析器。
 *
 * 用 === TAG === 标记替代 --- 分隔符，从源头保证正文与自检隔离。
 * 支持多级 fallback 解析（本地模型不遵守格式时也能提取有效内容）。
 */
import { countWords } from './useDatabase'

export interface CreativeOutput {
  /** 章节标题（纯文本） */
  title: string
  /** 章节正文（已剥离所有元数据标记） */
  content: string
  /** 正文字数 */
  wordCount: number
  /** 写前/写后自检（仅审批展示，永不落库） */
  selfCheck: string
}

export interface MultiChapterOutput {
  chapters: CreativeOutput[]
  /** 全局审计备注（跨章问题等） */
  globalNote: string
}

function extractTag(raw: string, tag: string): string {
  const regex = new RegExp(
    `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
  )
  const match = raw.match(regex)
  return match?.[1]?.trim() ?? ''
}

// ── Fallback：按 Markdown 标题分章 ──

function fallbackSplitByHeading(raw: string, _countingMode?: string): string[] {
  // 匹配 "### 第N章" 或 "## 第N章" 或 "# 第N章"
  const parts = raw.split(/(?=^#{1,3}\s*第\d+章)/m)
  if (parts.length >= 2) {
    // 去掉第一个空段/前言
    const first = parts[0]?.trim()
    if (first && !/^#{1,3}\s*第\d+章/.test(first) && first.length < 100) {
      return parts.slice(1)
    }
    return parts.filter(p => p.trim())
  }
  return [raw]
}

function fallbackExtractTitle(raw: string, chapterNumber?: number): string {
  const headingMatch = raw.match(/^#{1,3}\s*第(\d+)章\s*(.+)/m)
  if (headingMatch) return headingMatch[2]!.trim()
  const labelMatch = raw.match(/(?:章节标题|CHAPTER_TITLE)[：:]\s*(.+)/)
  if (labelMatch) return labelMatch[1]!.trim()
  return chapterNumber ? `第${chapterNumber}章` : ''
}

function fallbackExtractContent(raw: string): string {
  // 去掉开头的标题行
  let content = raw.replace(/^#{1,3}\s*第\d+章[^\n]*\n+/, '').trim()
  // 去掉末尾的自检段（如果存在）
  const selfCheckIdx = content.search(/\n---\n/)
  if (selfCheckIdx >= 0) {
    content = content.slice(0, selfCheckIdx).trim()
  }
  return content
}

// ── 公开 API ──

/** 解析单章 LLM 输出 */
export function parseCreativeOutput(
  raw: string,
  chapterNumber?: number,
  countingMode: 'zh_chars' | 'en_words' = 'zh_chars',
): CreativeOutput {
  let title = extractTag(raw, 'CHAPTER_TITLE')
  let content = extractTag(raw, 'CHAPTER_CONTENT')
  const selfCheck = extractTag(raw, 'SELF_CHECK')

  // Fallback: === TAG === 解析失败
  if (!content) {
    content = fallbackExtractContent(raw)
  }
  if (!title) {
    title = fallbackExtractTitle(raw, chapterNumber)
  }

  const wordCount = countingMode === 'en_words'
    ? content.split(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g).length - 1
    : countWords(content)

  return { title, content, wordCount, selfCheck }
}

/** 解析多章 LLM 输出（开篇批量生成场景） */
export function parseMultiChapterOutput(
  raw: string,
  countingMode: 'zh_chars' | 'en_words' = 'zh_chars',
): MultiChapterOutput {
  const globalNote = extractTag(raw, 'GLOBAL_NOTE')

  // 尝试按 === CHAPTER_CONTENT === 提取多章
  const contentBlocks = extractMultiTag(raw, 'CHAPTER_CONTENT')
  if (contentBlocks.length > 0) {
    const chapters = contentBlocks.map((block, i) => {
      const title = extractTag(block, 'CHAPTER_TITLE') || fallbackExtractTitle(block, i + 1)
      const content = block.trim()
      const selfCheck = extractTag(block, 'SELF_CHECK')
      const wordCount = countingMode === 'en_words'
        ? content.split(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g).length - 1
        : countWords(content)
      return { title, content, wordCount, selfCheck }
    })
    return { chapters, globalNote }
  }

  // Fallback：按 Markdown 标题分章
  const parts = fallbackSplitByHeading(raw, countingMode)
  const chapters = parts.map((part, i) => {
    const title = fallbackExtractTitle(part, i + 1)
    const content = fallbackExtractContent(part)
    const wordCount = countingMode === 'en_words'
      ? content.split(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g).length - 1
      : countWords(content)
    const selfCheck = extractTag(part, 'SELF_CHECK')
    return { title, content, wordCount, selfCheck }
  })

  return { chapters, globalNote }
}

/** 从正文中剥离自检（兼容旧格式 --- 分隔符） */
export function stripSelfCheck(text: string): string {
  const parsed = parseCreativeOutput(text)
  return parsed.content || text
}

// ── 内部工具 ──

function extractMultiTag(raw: string, tag: string): string[] {
  const regex = new RegExp(
    `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
    'g',
  )
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    if (match[1]?.trim()) {
      results.push(match[1].trim())
    }
  }
  return results
}
