/**
 * 章节长度修正器 — 对标 InkOS length-normalizer
 *
 * lengthCheck step 的后续修正步骤。
 * LLM 驱动的单次压缩/扩写，temperature=0.2，不可递归。
 * 保留事实、钩子、人名；禁止新子情节或解释性总结。
 */
import type { AgentSpec } from '../types'

export function createLengthNormalizerAgent(): AgentSpec {
  return {
    id: 'length_normalizer',
    name: '字数修正',
    badge: '系统',
    desc: '单次压缩或扩写章节到目标字数，保留事实与钩子',
    requiredContext: [],
    systemPrompt: '',

    parseOutput(rawText: string) {
      return { content: rawText }
    },

    async writeBack(_parsed, _ctx) {
      // commitWrite step 统一落盘
    },

    async localExecute(inputs, ctx) {
      const stepIndex = String(inputs.genBodyStepId || 'gen_body_1')
      const contentKey = `step:${stepIndex}`
      const content = (ctx as any)[contentKey] as string || ''
      const action = String(inputs.action || 'compress') // 'compress' | 'expand'
      const targetWords = parseInt(String(inputs.targetWords || '2000'))

      // 构建修正 system prompt
      const systemPrompt = buildNormalizerPrompt(action, targetWords)

      return JSON.stringify({
        systemPrompt,
        content,
        targetWords,
        action,
        needsLLM: true,
      })
    },
  }
}

function buildNormalizerPrompt(action: string, targetWords: number): string {
  const actionDesc = action === 'compress' ? '压缩' : '扩展'
  const constraint = action === 'compress'
    ? '删减冗余描写、合并重复信息、精简对话回合。不删剧情节点、不删人物对话的核心信息、不删伏笔线索。'
    : '补充感官细节、环境质感、角色内心反应。不新增子情节、不新增角色、不改变剧情走向。'

  return `你是章节长度修正器。请将以下章节${actionDesc}到目标 ${targetWords} 字左右（偏差不超过 ±15%）。

## 硬规则
1. 单次修正，不可递归
2. 保留所有事实、人名、地名、关键对话
3. 保留章末钩子（最后一句/段的悬念效果）
4. ${constraint}
5. 禁止新增解释性总结（"这一章讲述了..."）
6. 禁止新增伏笔或回收不存在伏笔
7. 直接输出修正后全文，不要任何前缀/后缀/注释`
}

// ── 截断检测 ──

/** 检测 LLM 输出是否被截断（对标 InkOS looksTruncated） */
export function looksTruncated(text: string): boolean {
  if (!text || text.length < 20) return true
  const lastChar = text.trim().slice(-1)
  // 以标点结尾 = 正常结束
  const sentenceEnders = /[。！？…."」』）\)】]/
  if (sentenceEnders.test(lastChar)) return false
  // 逗号结尾 = 可能截断
  if (/[，,、]/.test(lastChar)) return true
  // 英文/数字结尾但没有标点 = 可能截断
  if (/[a-zA-Z0-9]$/.test(text.trim())) return true
  return false
}

/** 剥离 LLM 输出的围栏和包装行 */
export function sanitizeNormalizedContent(raw: string): string {
  return raw
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/\n```$/, '')
    .replace(/^#{1,3}\s*(修正后|压缩后|扩展后|输出|结果).*(\n|$)/gmi, '')
    .trim()
}
