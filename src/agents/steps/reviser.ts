/**
 * 修订 Agent — 对标 InkOS reviser
 *
 * audit→revise 闭环中的修订端。
 * 6 种模式：auto / polish / rewrite / rework / anti-detect / spot-fix
 * 结构化输出：FIXED_ISSUES → PATCHES → REVISED_CONTENT → UPDATED_HOOKS
 */
import type { AgentSpec } from '../types'

export type ReviseMode = 'auto' | 'polish' | 'rewrite' | 'rework' | 'anti-detect' | 'spot-fix'

export interface ReviseIssue {
  severity: string
  category: string
  description: string
  suggestion: string
}

export interface ReviseOutput {
  content: string
  patches: Array<{ target: string; replacement: string }>
  fixedIssues: string[]
  updatedHooks?: string
}

export function createReviserAgent(): AgentSpec {
  return {
    id: 'reviser',
    name: '修订编辑器',
    badge: '编辑',
    desc: '根据审计问题修订章节，支持 auto/polish/rewrite/rework/anti-detect/spot-fix 六种模式',
    requiredContext: [],
    systemPrompt: `你是网络小说修稿编辑。请根据用户消息中的审计问题和模式指示修订章节。

## 六种模式

### Auto 模式（默认）
根据问题严重程度自动选择修订策略：
- error 级别 → 结构性修改（重写相关段落）
- warning 级别 → 局部修改（精准替换问题句/段）
- info 级别 → 可选优化

规则：
1. 修根因，不修症状
2. 只改问题涉及的部分，不动其他
3. 保持伏笔/钩子完整
4. 不动剧情走向
5. 改后段落数变化不超过 ±1

### Polish 模式
仅限文字表层优化，不改情节/人物/主线：
- 合并过短段落（2-5 句/段）
- 句式多样化
- 动词替代形容词堆砌
- 对话自然度提升
- 删除 AI 常用词
- 篇幅变化 ≤ ±15%

### Rewrite 模式
完整重写问题段落，保持原意但提升表达质量。

### Rework 模式
大规模结构性修改。可重组段落顺序、改写对话结构。

### Anti-Detect 模式
专注消除 AI 写作痕迹：
- 合并单句段（每段至少 2-5 句）
- 消除套话
- 打断完美句式
- 替换抽象情绪标签为具体身体信号
- 对话偏移（直问直答→反问/沉默/动作回应）

### Spot-Fix 模式
仅通过 TARGET_TEXT/REPLACEMENT_TEXT 精准替换指定文本。

## 输出格式
=== FIXED_ISSUES ===
（每行一条已修复的问题编号和简述）

=== PATCHES ===
（仅 spot-fix 模式需要）
TARGET_TEXT: <原文精确文本>
REPLACEMENT_TEXT: <替换后文本>

=== REVISED_CONTENT ===
（修订后的完整章节正文）

=== UPDATED_HOOKS ===
（如有伏笔状态变更：advance/resolve/defer 列表）`,

    parseOutput(rawText: string): ReviseOutput {
      const fixedIssues = extractSection(rawText, 'FIXED_ISSUES')
        .split('\n')
        .filter(Boolean)

      const patchesRaw = extractSection(rawText, 'PATCHES')
      const patches = parseSpotFixPatches(patchesRaw)

      const content = extractSection(rawText, 'REVISED_CONTENT') || rawText
      const updatedHooks = extractSection(rawText, 'UPDATED_HOOKS')

      return { content, patches, fixedIssues, updatedHooks }
    },

    async writeBack(_parsed, _ctx) {
      // commitWrite step 统一落盘
    },
  }
}

// ── 辅助 ──

function extractSection(text: string, tag: string): string {
  const regex = new RegExp(`=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`)
  const match = text.match(regex)
  return match?.[1]?.trim() || ''
}

function parseSpotFixPatches(raw: string): Array<{ target: string; replacement: string }> {
  const patches: Array<{ target: string; replacement: string }> = []
  const blocks = raw.split(/(?=TARGET_TEXT:)/)
  for (const block of blocks) {
    const targetMatch = block.match(/TARGET_TEXT:\s*(.+?)(?=\nREPLACEMENT_TEXT:|\nTARGET_TEXT:|$)/s)
    const replacementMatch = block.match(/REPLACEMENT_TEXT:\s*(.+?)(?=\nTARGET_TEXT:|$)/s)
    if (targetMatch?.[1] && replacementMatch?.[1]) {
      patches.push({
        target: targetMatch[1].trim(),
        replacement: replacementMatch[1].trim(),
      })
    }
  }
  return patches
}

/** 应用 spot-fix 补丁到正文 */
export function applySpotFixPatches(
  content: string,
  patches: Array<{ target: string; replacement: string }>,
): string {
  let result = content
  for (const patch of patches) {
    if (result.includes(patch.target)) {
      result = result.replace(patch.target, patch.replacement)
    }
  }
  return result
}
