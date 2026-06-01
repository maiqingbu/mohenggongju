/**
 * 文风自查适配器 — 第1层防御
 *
 * 薄适配器，把 useAntiAiVoice 的 generateAntiAiReport() 结果
 * 转换为 ConsistencyIssue[]，供 bodyAgent.parseOutput 直接产出 warnings。
 *
 * 第1层：规则引擎，零 token 成本
 * 第2层：style_review Agent（LLM），深度审查
 * 第3层：人类审阅卡决策
 */
import { generateAntiAiReport } from '../../composables/useAntiAiVoice'
import type { ConsistencyIssue } from '../types'
import type { FatigueWordHit, PatternViolation } from '../../composables/useAntiAiVoice'

/** 疲劳词类别 → 中文标签 */
const CATEGORY_LABELS: Record<string, string> = {
  adverb: '副词滥用',
  verb: '心理动词/感知动词',
  adjective: '空洞形容词',
  connector: '连接词/翻译腔句式',
  bodyReaction: '身体反应模板',
  metaNarrative: '元叙事/AI套话',
  englishTone: '英文/翻译腔残留',
}

/**
 * 扫描文本中的文风违规，返回 ConsistencyIssue 数组
 *
 * @param text 待检测的小说正文
 * @param chapterNo 章节编号（用于审阅卡展示）
 * @returns 违规项列表，空文本/无违规返回 []
 */
export function scanStyleViolations(text: string, chapterNo: number): ConsistencyIssue[] {
  if (!text || !text.trim()) return []

  const report = generateAntiAiReport(text)
  const issues: ConsistencyIssue[] = []

  // ── 疲劳词命中 → WARNING ──
  for (const hit of report.fatigueWordHits) {
    if (!hit.exceeded) continue
    issues.push(fatigueWordToIssue(hit, chapterNo))
  }

  // ── 句式违规 → ERROR（严重）或 WARNING ──
  for (const v of report.patternViolations) {
    if (!v.exceeded) continue
    issues.push(patternViolationToIssue(v, chapterNo))
  }

  return issues
}

/** 将疲劳词命中转换为 ConsistencyIssue */
function fatigueWordToIssue(hit: FatigueWordHit, chapterNo: number): ConsistencyIssue {
  const catLabel = CATEGORY_LABELS[hit.category] || hit.category
  return {
    level: 'WARNING',
    type: `style_fatigue_${hit.category}`,
    message: `【${catLabel}】"${hit.word}" 出现 ${hit.count} 次（阈值 ${hit.threshold} 次）。` +
      `${suggestionForCategory(hit.category)}`,
    chapter: chapterNo,
  }
}

/** 将句式违规转换为 ConsistencyIssue */
function patternViolationToIssue(v: PatternViolation, chapterNo: number): ConsistencyIssue {
  // summary_ending 和 consecutive_psychology 是严重违规 → ERROR
  const isSevere = v.patternKey === 'summary_ending' || v.patternKey === 'consecutive_psychology'
  let message = `【句式违规】${v.description}`
  if (v.samples.length > 0) {
    message += `。示例：${v.samples[0].slice(0, 80)}`
  }

  return {
    level: isSevere ? 'ERROR' : 'WARNING',
    type: `style_pattern_${v.patternKey}`,
    message,
    chapter: chapterNo,
  }
}

/** 按疲劳词类别返回简短改进建议 */
function suggestionForCategory(category: string): string {
  switch (category) {
    case 'adverb':
      return '建议：删除模糊副词，用具体动作和画面替代。'
    case 'verb':
      return '建议：用外部动作和外化行为替代直接心理报告。'
    case 'adjective':
      return '建议：写具体是什么让人感到"强大/恐怖"，不写抽象形容词。'
    case 'connector':
      return '建议：删除多余连接词，让句子直接碰撞产生张力。'
    case 'bodyReaction':
      return '建议：换用更独特的身体反应，避免模板化表达。'
    case 'metaNarrative':
      return '建议：删除所有元叙事，直接从场景切入。'
    case 'englishTone':
      return '建议：用中文口语化表达替代翻译腔。'
    default:
      return ''
  }
}
