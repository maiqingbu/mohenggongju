/**
 * 段落修复 Agent — 第1.5层防御（介于 compress_expand 和 style_review 之间）
 *
 * localExecute 实现规则引擎段落合并（零 token 成本）：
 * 检测相邻的、非对话的单句段，自动合并为多句段落。
 *
 * 插入位置：compress_expand_N 之后、style_review_N 之前
 * 阻塞策略：approval='auto'（自动修复），skippable=true
 */
import type { AgentSpec } from '../types'

// ── 分析 ──

export interface ParagraphAnalysis {
  totalParagraphs: number
  singleSentenceParagraphs: number
  nonDialogueSingleSentence: number
  ratio: number
  needsFix: boolean
}

export function analyzeParagraphs(text: string): ParagraphAnalysis {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
  if (paragraphs.length === 0) {
    return { totalParagraphs: 0, singleSentenceParagraphs: 0, nonDialogueSingleSentence: 0, ratio: 0, needsFix: false }
  }

  const sentenceEnders = /[。！？!?]/g
  let singleCount = 0
  let nonDialogueSingle = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    const matches = trimmed.match(sentenceEnders)
    const isSingle = !matches || matches.length <= 1

    if (isSingle) {
      singleCount++
      if (!isDialogue(trimmed) && !isSystemMessage(trimmed)) {
        nonDialogueSingle++
      }
    }
  }

  const ratio = nonDialogueSingle / paragraphs.length
  return {
    totalParagraphs: paragraphs.length,
    singleSentenceParagraphs: singleCount,
    nonDialogueSingleSentence: nonDialogueSingle,
    ratio,
    needsFix: ratio > 0.25,
  }
}

// ── 分类 ──

function isDialogue(para: string): boolean {
  const t = para.trim()
  // 以引号开头
  if (/^[""'「『“”「『]/.test(t)) return true
  // 以引号结尾
  if (/[""」』”」』]$/.test(t)) return true
  // 对话属性行："xxx。"他说。
  if (/^[^" "'「『“]{1,40}[。！？!?]["'」』”」]?\S*(说|道|问|答|喊|叫|吼|骂|笑|叹|嘟囔|嘀咕|开口|回|点头|摇头)[。]?$/.test(t)) return true
  return false
}

function isSystemMessage(para: string): boolean {
  const t = para.trim()
  return /^(叮|系统|提示|警告|新手|签到|绑定|奖励)[：:\-—]/.test(t) ||
    /^(新手签到|签到成功|系统提示|系统消息|检测到|正在绑定|绑定完成)/.test(t)
}

function isSingleSentence(para: string): boolean {
  const matches = para.trim().match(/[。！？!?]/g)
  return !matches || matches.length <= 1
}

// ── 合并引擎 ──

/**
 * 规则引擎段落合并：将相邻的非对话单句段合并为多句段落。
 * 不动字词内容，只移除段落间的双换行。
 */
export function mergeParagraphs(text: string): { result: string; fixed: number } {
  const rawParagraphs = text.split(/\n\n+/)
  if (rawParagraphs.length <= 1) return { result: text, fixed: 0 }

  const merged: string[] = []
  const buffer: string[] = []
  let fixCount = 0

  function flushBuffer() {
    if (buffer.length === 0) return
    if (buffer.length === 1) {
      merged.push(buffer[0])
    } else {
      // 合并 buffer 中的所有段落为一个段落
      merged.push(buffer.join('\n'))
      fixCount += buffer.length - 1
    }
    buffer.length = 0
  }

  for (const para of rawParagraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // 空行保留为段落分隔
    if (trimmed === '') {
      flushBuffer()
      continue
    }

    const isDialoguePara = isDialogue(trimmed)
    const isSystem = isSystemMessage(trimmed)
    const isSingle = isSingleSentence(trimmed)

    if (isDialoguePara || isSystem) {
      // 对话和系统消息 — 立即刷新缓冲区，自身独立成段
      flushBuffer()
      merged.push(trimmed)
    } else if (isSingle) {
      // 非对话单句段 — 加入缓冲区，等待合并
      buffer.push(trimmed)
    } else {
      // 多句段 — 刷新缓冲区后独立成段
      flushBuffer()
      merged.push(trimmed)
    }
  }
  flushBuffer()

  const result = merged.join('\n\n')
  return { result, fixed: fixCount }
}

// ── Agent 定义 ──

export function createParagraphFixAgent(): AgentSpec {
  return {
    id: 'paragraph_fix',
    name: '段落修复',
    badge: '系统',
    desc: '自动检测并合并一句一段等段落结构问题，零 token 成本',
    requiredContext: [],

    systemPrompt: '', // localExecute 替代，无需 LLM 系统提示词

    parseOutput(rawText: string) {
      // 尝试解析 JSON 包装（含分析数据），失败则当纯文本
      try {
        const parsed = JSON.parse(rawText.trim())
        if (parsed._analysis && parsed.content) {
          return { content: parsed.content, warnings: [] }
        }
        return { content: rawText.trim(), warnings: [] }
      } catch {
        return { content: rawText.trim(), warnings: [] }
      }
    },

    /**
     * localExecute：规则引擎段落合并（零 token 成本）
     *
     * 从 ctx 中读取 compress_expand_N 或 gen_body_N 的正文，
     * 检测并合并相邻的非对话单句段。
     * 返回合并后的纯文本（由 runner 存入 ctx）。
     */
    async localExecute(inputs: Record<string, string>, ctx: Record<string, unknown>) {
      const contentKey = inputs.contentKey ||
        Object.keys(ctx).find(k => k.includes('compress_expand_') || k.includes('gen_body_')) || ''
      const content = String(ctx[contentKey] || '')

      if (!content) return '' // 空内容直接透传

      const before = analyzeParagraphs(content)
      const { result: mergedText, fixed } = mergeParagraphs(content)
      const after = analyzeParagraphs(mergedText)

      // 日志：段落修复统计
      if (fixed > 0) {
        console.log(
          `[paragraphFix] 合并 ${fixed} 处: ` +
          `${before.totalParagraphs}段 → ${after.totalParagraphs}段, ` +
          `单句段占比 ${Math.round(before.ratio * 100)}% → ${Math.round(after.ratio * 100)}%`
        )
      }

      // 返回合并后的纯文本，runner 存入 ctx 供后续步骤读取
      return mergedText
    },

    async writeBack(_parsed, _ctx) {
      // 段落结构修复后的正文由后续步骤（style_review）引用
    },
  }
}
