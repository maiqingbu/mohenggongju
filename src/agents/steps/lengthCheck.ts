/**
 * 长度检测 step — 本地执行，零 LLM 调用
 *
 * 从 gen_body_N 产出中统计中文字数，与目标字数比较，
 * 计算偏差并决定是否需要压缩/扩展。
 *
 * approval: 'auto'（不阻塞流程，由 length_normalizer step 处理）
 * skippable: true
 */
import type { AgentSpec } from '../types'

/** 统计中文字数（去空白） */
export function countChineseChars(text: string): number {
  return text.replace(/\s/g, '').length
}

/**
 * 非对称偏差阈值（创作宪法 §8.5）
 * - 下探 -30%：宁可短也不要注水。700字好章节 > 2000字注水章节
 * - 上浮 +15%：超长也会拖节奏，但比短更宽松
 */
const LOWER_DEVIATION = -0.30
const UPPER_DEVIATION = 0.15

export function createLengthCheckAgent(): AgentSpec {
  return {
    id: 'length_check',
    name: '长度检测',
    badge: '系统',
    desc: '统计章节字数，与目标字数比较，决定是否需要压缩/扩展',
    requiredContext: [],
    systemPrompt: '',

    parseOutput(rawText: string) {
      try { return JSON.parse(rawText) }
      catch { return { raw: rawText } }
    },

    async writeBack(_parsed, _ctx) {
      // 只读检测，不写入数据层
    },

    // 本地执行：不调 LLM
    async localExecute(inputs, ctx) {
      const stepIndex = String(inputs.genBodyStepId || 'gen_body_1')
      const contentKey = `step:${stepIndex}`

      // 从 Runner 上下文中读取 gen_body_N 的产出
      const content = (ctx as any)[contentKey] as string || ''
      const targetWords = parseInt(String(inputs.targetWords || '2000'))

      const wordCount = countChineseChars(content)
      const deviation = targetWords > 0
        ? (wordCount - targetWords) / targetWords
        : 0
      const passed = deviation >= LOWER_DEVIATION && deviation <= UPPER_DEVIATION
      const needsCompress = deviation > UPPER_DEVIATION
      const needsExpand = deviation < LOWER_DEVIATION

      return JSON.stringify({
        passed,
        wordCount,
        targetWords,
        deviation: Math.round(deviation * 100) / 100,
        needsCompress,
        needsExpand,
        lowerThreshold: LOWER_DEVIATION,
        upperThreshold: UPPER_DEVIATION,
        summary: passed
          ? `字数 ${wordCount}，在目标 ${targetWords} 范围内（-30%/+15%），通过`
          : needsCompress
            ? `字数 ${wordCount}，超出目标 ${targetWords}（上限+15%，实际${Math.round(deviation * 100)}%），需要压缩`
            : `字数 ${wordCount}，不足目标 ${targetWords}（下限-30%，实际${Math.round(deviation * 100)}%），需要扩展`,
      })
    },
  }
}
