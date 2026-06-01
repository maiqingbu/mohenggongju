/**
 * 写后校验器 — 对标 inkos PostWriteValidator
 * AI 产出正文后自动执行 7 条硬规则检查，附带可操作自动修复
 */

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  rule: string
  description: string
  suggestion: string
}

export interface AutoFix {
  /** 修复类型 */
  type: 'rename_title' | 'mark_hook_deferred' | 'truncate_content'
  /** 修复描述（告知用户做了什么） */
  description: string
  /** 修复后的值（如新标题） */
  newValue?: string
  /** 标记为 deferred 的伏笔名列表 */
  deferredHooks?: string[]
  /** 截断后的正文 */
  truncatedContent?: string
}

export interface ValidationResult {
  passed: boolean
  issues: ValidationIssue[]
  wordCount: number
  chapterWordTarget: number
  /** 自动修复建议列表（调用方按需执行） */
  autoFixes: AutoFix[]
}

interface ValidationParams {
  content: string
  chapterTitle: string
  existingTitles: string[]
  wordTarget: number
  previousEndingLines: string[]
  hookChecks: { committedHooks: string[]; content: string }[]
  avoidPhrases?: string[]
}

const CLICHES = [
  '不知过了多久', '与此同时', '就在这时', '突然', '忽然', '猛地',
  '只见', '只听得', '心中一凛', '眉头一皱', '嘴角勾起', '眼中闪过',
  '深吸一口气', '冷笑一声', '沉声说道', '缓缓开口', '淡淡地说道',
  '冷哼一声', '嘴角微扬', '微微一愣', '心中暗想', '不由得',
]

/** 统计每个套话出现的次数 */
export interface ClicheStat {
  cliche: string
  count: number
}

// ============================================================
// 主校验函数 — 7 条硬规则 + 自动修复建议
// ============================================================

export function validatePostWrite(params: ValidationParams): ValidationResult {
  const issues: ValidationIssue[] = []
  const autoFixes: AutoFix[] = []

  // ── 规则 1：空内容检查 ──
  if (!params.content || params.content.trim().length < 50) {
    issues.push({
      severity: 'error',
      rule: '空内容',
      description: 'AI 产出正文不足 50 字符，可能是生成失败',
      suggestion: '重试生成，或检查模型配置',
    })
    return { passed: false, issues, wordCount: 0, chapterWordTarget: params.wordTarget, autoFixes: [] }
  }

  // ── 规则 2：标题重复检查 → 自动追加序号 ──
  const normalizedTitle = stripChapterPrefix(params.chapterTitle)
  const duplicateCount = params.existingTitles.filter((t) =>
    stripChapterPrefix(t) === normalizedTitle,
  ).length
  if (duplicateCount > 0) {
    const newTitle = `${params.chapterTitle}（续${duplicateCount + 1}）`
    issues.push({
      severity: 'warning',
      rule: '标题重复',
      description: `章节标题"${params.chapterTitle}"与已有 ${duplicateCount} 章重复`,
      suggestion: `已自动修改为"${newTitle}"，不满意可手动调整`,
    })
    autoFixes.push({
      type: 'rename_title',
      description: `标题"${params.chapterTitle}"重复，自动重命名为"${newTitle}"`,
      newValue: newTitle,
    })
  }

  // ── 规则 3：字数检查 ──
  const chineseChars = (params.content.match(/[\u4e00-\u9fff]/g) || []).length
  if (chineseChars < params.wordTarget * 0.5) {
    issues.push({
      severity: 'warning',
      rule: '字数不足',
      description: `正文 ${chineseChars} 字，不足目标 ${params.wordTarget} 字的 50%`,
      suggestion: '可点击工具栏「AI 扩充」补充内容',
    })
  }
  if (chineseChars > params.wordTarget * 1.5) {
    issues.push({
      severity: 'info',
      rule: '字数超出',
      description: `正文 ${chineseChars} 字，超出目标 ${params.wordTarget} 字的 50%`,
      suggestion: '可手动删减或点击工具栏「AI 压缩」',
    })
  }

  // ── 规则 4：结尾同构检查 → 展示最近结尾供对比 ──
  const lastSentence = extractLastSentence(params.content)
  if (lastSentence && params.previousEndingLines.length > 0) {
    const similarEndings = params.previousEndingLines.filter(
      (ending) => textSimilarity(lastSentence, ending) > 0.5,
    )
    if (similarEndings.length >= 2) {
      const examples = similarEndings.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
      issues.push({
        severity: 'warning',
        rule: '结尾同构',
        description: `本章结尾与最近 ${similarEndings.length} 章高度相似`,
        suggestion: `修改结尾句式。最近相似结尾：\n${examples}`,
      })
    }
  }

  // ── 规则 5：伏笔推进检查 → 标记为 deferred ──
  for (const hc of params.hookChecks) {
    const missedHooks: string[] = []
    for (const hookName of hc.committedHooks) {
      if (!hc.content.includes(hookName)) {
        missedHooks.push(hookName)
      }
    }
    if (missedHooks.length > 0) {
      issues.push({
        severity: 'warning',
        rule: '伏笔遗漏',
        description: `章纲承诺推进的 ${missedHooks.length} 条伏笔未在正文中出现：${missedHooks.join('、')}`,
        suggestion: '这些伏笔状态已标记为"延后"，下章生成时将继续提醒',
      })
      autoFixes.push({
        type: 'mark_hook_deferred',
        description: `${missedHooks.length} 条伏笔未推进，标记为延后`,
        deferredHooks: missedHooks,
      })
    }
  }

  // ── 规则 6：避免项检查 ──
  if (params.avoidPhrases && params.avoidPhrases.length > 0) {
    const foundPhrases: string[] = []
    for (const phrase of params.avoidPhrases) {
      if (params.content.includes(phrase)) {
        foundPhrases.push(phrase)
      }
    }
    if (foundPhrases.length > 0) {
      issues.push({
        severity: 'warning',
        rule: '避免项违规',
        description: `正文出现 ${foundPhrases.length} 处应避免的内容：${foundPhrases.join('、')}`,
        suggestion: '请在编辑器中查找并修改这些段落',
      })
    }
  }

  // ── 规则 7：套话密度 → 列出 Top 5 高频套话 ──
  const clicheStats: ClicheStat[] = CLICHES
    .map((cliche) => ({
      cliche,
      count: params.content.split(cliche).length - 1,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count)

  const totalClicheCount = clicheStats.reduce((sum, s) => sum + s.count, 0)
  if (totalClicheCount > 5) {
    const top5 = clicheStats.slice(0, 5).map((s) => `「${s.cliche}」×${s.count}`).join('、')
    issues.push({
      severity: 'info',
      rule: '套话密度偏高',
      description: `正文中出现 ${totalClicheCount} 处常见套话`,
      suggestion: `高频套话：${top5}。可批量替换为原创表达`,
    })
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    passed: errors.length === 0,
    issues,
    wordCount: chineseChars,
    chapterWordTarget: params.wordTarget,
    autoFixes,
  }
}

// ============================================================
// 自动修复执行（由 AiModal 调用）
// ============================================================

/** 执行自动修复，返回修复后的正文和标题 */
export function applyAutoFixes(
  fixes: AutoFix[],
  currentContent: string,
  currentTitle: string,
): { content: string; title: string; messages: string[] } {
  let content = currentContent
  let title = currentTitle
  const messages: string[] = []

  for (const fix of fixes) {
    switch (fix.type) {
      case 'rename_title':
        if (fix.newValue) {
          title = fix.newValue
          messages.push(fix.description)
        }
        break
      case 'mark_hook_deferred':
        // 标记伏笔为延后状态在这里执行，由调用方传入回调
        messages.push(fix.description)
        break
      case 'truncate_content':
        if (fix.truncatedContent) {
          content = fix.truncatedContent
          messages.push(fix.description)
        }
        break
    }
  }

  return { content, title, messages }
}

// ============================================================
// 辅助函数
// ============================================================

function stripChapterPrefix(title: string): string {
  return title.replace(/^第[0-9零一二三四五六七八九十百千]+章[:：\s]*/, '').trim()
}

function extractLastSentence(content: string): string | undefined {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'))
  const last = lines[lines.length - 1]
  return last && last.length > 60 ? last.slice(0, 57) + '...' : last
}

function textSimilarity(a: string, b: string): number {
  const setA = new Set(a.replace(/\s/g, ''))
  const setB = new Set(b.replace(/\s/g, ''))
  if (setA.size === 0 || setB.size === 0) return 0
  let overlap = 0
  for (const char of setA) {
    if (setB.has(char)) overlap++
  }
  return overlap / Math.max(setA.size, setB.size)
}

// ============================================================
// 工具导出
// ============================================================

export function getLastEndingLines(
  chapters: { title?: string; content?: string; sort_order?: number }[],
  count = 3,
): string[] {
  return chapters
    .sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
    .slice(0, count + 1)
    .map((c) => extractLastSentence(c.content || ''))
    .filter((s): s is string => !!s)
}

export function getExistingTitles(
  chapters: { title?: string; sort_order?: number }[],
): string[] {
  return chapters
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((c) => c.title || '')
    .filter(Boolean)
}
