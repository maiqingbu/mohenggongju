/**
 * 独立章节审计系统 — 对标 InkOS ContinuityAuditor
 * 独立 LLM 调用，与确定性 postWriteValidator 互补（前者零成本、后者深分析）
 */

import { useLLM } from './useLLM'
import { estimateTokens } from './tokenBudget'

// ── 审计维度与评分 ──

export interface AuditIssue {
  severity: 'error' | 'warning' | 'info'
  category: string
  description: string
  suggestion: string
}

export interface AuditResult {
  passed: boolean
  overallScore: number        // 0-100
  issues: AuditIssue[]
  summary: string
  dimensionScores: Record<string, number>
}

const AUDIT_DIMENSIONS = [
  '视角一致性',
  '段落节奏',
  '对话自然度',
  '具象展示',
  '套话密度',
  '章末钩子',
  '情绪表达',
  '世界观呈现',
]

const AUDIT_SYSTEM_PROMPT = `你是小说审稿专家。请对以下章节进行独立审计，输出 JSON 格式。

## 审计维度（每项 0-100 分）

1. **视角一致性** — POV 是否严格锁定？是否有广角镜头或上帝视角越界？
2. **段落节奏** — 单句段是否过多？连续短段是否造成节奏断裂？段落脉冲是否有变化？
3. **对话自然度** — 是否直问直答？是否有副词修饰属性词？是否有口语化瑕疵？
4. **具象展示** — 形容词是否通过行动证明？是否有"感到/觉得/意识到"等抽象标签？
5. **套话密度** — AI 高频词数量、成语堆砌、排比罗列等机械表达
6. **章末钩子** — 结尾是否有新危机/悬念/让人想翻页的画面？
7. **情绪表达** — 身体信号是否在心理之前？是否避免了情绪标签堆砌？
8. **世界观呈现** — 设定术语是否自然融入？是否有"设定说明式"段落？

## 评分标准
- 90-100: 出版级质量
- 80-89: 合格，少量小问题
- 60-79: 需修改，有明显缺陷
- 40-59: 不合格，多维度失败
- 0-39: 严重失败

## 输出格式（严格 JSON）
{
  "passed": true/false,
  "overallScore": 0-100,
  "issues": [{ "severity": "error/warning/info", "category": "维度名", "description": "具体问题", "suggestion": "修改建议" }],
  "summary": "一句话审计结论",
  "dimensionScores": { "视角一致性": 85, "段落节奏": 72, ... }
}

注意：passed 为 false 仅当存在 severity=error 的问题。prose 层面的措辞优化建议用 "info" 级别，不影响 passed。`

export function useChapterAudit() {
  const { generating, output, error, generate, abort } = useLLM()

  async function auditChapter(params: {
    content: string
    chapterTitle?: string
    chapterOutline?: string
    previousChapterEnding?: string
    modelId?: string
    think?: boolean
  }): Promise<AuditResult | null> {
    const contentTokens = estimateTokens(params.content)
    // 章节太长时只审计首尾各 40%
    let auditContent = params.content
    if (contentTokens > 8000) {
      const headLen = Math.floor(params.content.length * 0.4)
      const tailLen = Math.floor(params.content.length * 0.4)
      auditContent = params.content.slice(0, headLen)
        + '\n\n[...中间省略，审计首尾各40%...]\n\n'
        + params.content.slice(-tailLen)
    }

    let contextBlock = ''
    if (params.chapterTitle) contextBlock += `章节标题：${params.chapterTitle}\n`
    if (params.chapterOutline) contextBlock += `章纲参考：\n${params.chapterOutline}\n`
    if (params.previousChapterEnding) contextBlock += `上一章结尾：${params.previousChapterEnding}\n`

    const userPrompt = `${contextBlock}
## 待审计章节正文
${auditContent}

请按审计维度逐项评分，输出 JSON 结果。`

    try {
      const raw = await generate({
        systemPrompt: AUDIT_SYSTEM_PROMPT,
        userPrompt,
        modelId: params.modelId,
        think: params.think ?? false,
      })

      if (!raw) return null

      // 解析 JSON 结果
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0]) as AuditResult
      return {
        passed: parsed.passed ?? (parsed.overallScore >= 80),
        overallScore: parsed.overallScore ?? 0,
        issues: parsed.issues ?? [],
        summary: parsed.summary ?? '审计完成',
        dimensionScores: parsed.dimensionScores ?? {},
      }
    } catch (e: any) {
      console.error('[ChapterAudit] 审计失败:', e)
      return null
    }
  }

  /** 格式化审计结果为可读文本 */
  function formatAuditReport(result: AuditResult): string {
    const lines = [
      `## 审计结论：${result.passed ? '✅ 通过' : '❌ 未通过'} (${result.overallScore}/100)`,
      `> ${result.summary}`,
      '',
      '### 维度评分',
    ]
    for (const dim of AUDIT_DIMENSIONS) {
      const score = result.dimensionScores[dim]
      if (score !== undefined) {
        const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10))
        lines.push(`- ${dim}: ${bar} ${score}/100`)
      }
    }

    if (result.issues.length > 0) {
      lines.push('', '### 发现的问题')
      for (const iss of result.issues) {
        const icon = iss.severity === 'error' ? '🔴' : iss.severity === 'warning' ? '🟡' : '🔵'
        lines.push(`- ${icon} **${iss.category}**: ${iss.description}`)
        if (iss.suggestion) lines.push(`  ↳ ${iss.suggestion}`)
      }
    }

    return lines.join('\n')
  }

  return { generating, output, error, auditChapter, formatAuditReport, abort }
}
