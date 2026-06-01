/**
 * 续写工作流 — 审阅模式兼容
 *
 * 流程：load_context → (gen_body → length_check → length_normalizer → paragraph_fix → style_review → reviser → extract_settings) × N → volume_boundary_check → consistency_check → commit_write
 *
 * 五层防御：
 *   第1层 — bodyAgent.parseOutput 内嵌 styleFilter 规则引擎（零 token）
 *   第2层 — length_check 字数检测（零 token，本地执行）
 *   第3层 — length_normalizer 字数调整（LLM 压缩/扩展）
 *   第3.5层 — paragraph_fix 段落结构修复（LLM，仅当单句段占比>25%时触发）
 *   第4层 — style_review Agent（LLM 深度审查）
 *   第5层 — 人类审阅卡决策
 *
 * 全自动模式增强：
 *   - 每章完成后自动更新设定（extract_settings）
 *   - 卷边界检测：第一卷写完后检测下一卷的卷纲、章纲
 */
import type { WorkflowStep } from '../types'

export interface ContinueChapterConfig {
  chapterCount: number
  startChapterNo: number
  wordsPerChapter: number
  /** F4: 真实 DB chapterId 列表，顺序与 gen_body_N 对应 */
  chapterIds?: number[]
  /** 全自动模式：每章完成后自动更新设定 */
  autoExtractSettings?: boolean
  /** 卷信息：用于卷边界检测 */
  volumeInfo?: {
    currentVolumeId: number
    currentVolumeChapterCount: number
    totalVolumes: number
  }
}

export function buildContinueChapterWorkflow(config: ContinueChapterConfig): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const autoExtract = config.autoExtractSettings ?? false

  // Step 1: 章纲规划
  steps.push({
    id: 'load_context',
    agentId: 'chapter',
    inputs: {
      action: 'plan',
      chapterRange: `${config.startChapterNo}-${config.startChapterNo + config.chapterCount - 1}`,
      wordsPerChapter: String(config.wordsPerChapter),
    },
    approval: 'auto',
    skippable: false,
    next: config.chapterCount > 0 ? 'gen_body_1' : 'consistency_check',
  })

  // Step 2-(2N+1): 逐章生成正文 + 长度检测 + 字数调整 + 文风审查
  const targetWords = String(config.wordsPerChapter || 2000)

  for (let i = 0; i < config.chapterCount; i++) {
    const chNo = config.startChapterNo + i
    const isLast = i === config.chapterCount - 1
    // F4: chapterId 取真实 DB 主键，没有则 fallback 到 chNo（调用方事后补）
    const chapterId = config.chapterIds?.[i] ?? chNo
    const idx = i + 1

    // gen_body_N
    // G7: plan 始终引用 load_context（章纲计划），continueFrom 引用前一章正文
    const prevBodyRef = i === 0
      ? '@ctx.step:load_context'   // 首章：无前文，用章纲作为上下文
      : `@ctx.step:gen_body_${i}`  // 第N章：引用前一章正文（gen_body 始终执行，可靠）

    steps.push({
      id: `gen_body_${idx}`,
      agentId: 'body',
      inputs: {
        chapterNo: String(chNo),
        chapterId: String(chapterId),
        plan: '@ctx.step:load_context',
        continueFrom: prevBodyRef,
        targetWords,
      },
      approval: 'always',
      skippable: true,
      next: `length_check_${idx}`,
    })

    // length_check_N — 第2层防御：本地字数检测（零 token）
    steps.push({
      id: `length_check_${idx}`,
      agentId: 'length_check',
      inputs: {
        genBodyStepId: `gen_body_${idx}`,
        targetWords,
      },
      approval: 'auto',
      skippable: true,
      next: `length_normalizer_${idx}`,
    })

    // length_normalizer_N — 第3层防御：LLM 字数修正（单次压缩/扩写）
    steps.push({
      id: `length_normalizer_${idx}`,
      agentId: 'length_normalizer',
      inputs: {
        content: `@ctx.step:gen_body_${idx}`,
        currentWords: `@ctx.step:length_check_${idx}`,
        targetWords,
        action: 'compress',
      },
      approval: 'always',
      skippable: true,
      next: `paragraph_fix_${idx}`,
    })

    // paragraph_fix_N — 第3.5层防御：段落结构修复（仅当单句段>25%时触发 LLM）
    steps.push({
      id: `paragraph_fix_${idx}`,
      agentId: 'paragraph_fix',
      inputs: {
        contentKey: `step:length_normalizer_${idx}`,
      },
      approval: 'auto',
      skippable: true,
      next: `style_review_${idx}`,
    })

    // style_review_N — 第4层防御：LLM 深度文风审查
    steps.push({
      id: `style_review_${idx}`,
      agentId: 'style_review',
      inputs: {
        content: `@ctx.step:paragraph_fix_${idx}`,
        chapterNo: String(chNo),
      },
      approval: 'on_warning',
      skippable: true,
      next: `reviser_${idx}`,
    })

    // reviser_N — 审计驱动修订（auto 模式：根据 style_review 问题自动选择策略）
    steps.push({
      id: `reviser_${idx}`,
      agentId: 'reviser',
      inputs: {
        mode: 'auto',
        content: `@ctx.step:paragraph_fix_${idx}`,
        issues: `@ctx.step:style_review_${idx}`,
      },
      approval: 'always',
      skippable: true,
      next: autoExtract ? `extract_settings_${idx}` : (isLast ? 'consistency_check' : `gen_body_${idx + 1}`),
    })

    // 全自动模式：每章完成后自动更新设定
    if (autoExtract) {
      steps.push({
        id: `extract_settings_${idx}`,
        agentId: 'extract_settings',
        inputs: {
          action: 'extract',
          target: `@ctx.step:paragraph_fix_${idx}`,
          chapterNo: String(chNo),
        },
        approval: 'auto',
        skippable: true,
        next: isLast ? (config.volumeInfo ? 'volume_boundary_check' : 'consistency_check') : `gen_body_${idx + 1}`,
      })
    }
  }

  // 卷边界检测（全自动模式）
  if (autoExtract && config.volumeInfo) {
    steps.push({
      id: 'volume_boundary_check',
      agentId: 'volume_boundary_check',
      inputs: {
        currentVolumeId: String(config.volumeInfo.currentVolumeId),
        currentVolumeChapterCount: String(config.volumeInfo.currentVolumeChapterCount),
        totalVolumes: String(config.volumeInfo.totalVolumes),
      },
      approval: 'auto',
      skippable: false,
      next: 'consistency_check',
    })
  }

  // 一致性检测（本地运行，不调 LLM）
  // G8: 显式引用最后一章 gen_body 正文，而非依赖 ctx.lastOutput
  steps.push({
    id: 'consistency_check',
    agentId: 'consistency_check',
    inputs: {
      action: 'check',
      contentKey: `step:gen_body_${config.chapterCount}`,
      chapterNo: String(config.startChapterNo + config.chapterCount - 1),
    },
    approval: 'on_warning',
    skippable: true,
    next: autoExtract ? 'foreshadow' : 'extract_settings',
  })

  // 非全自动模式：最后统一提取设定
  if (!autoExtract) {
    steps.push({
      id: 'extract_settings',
      agentId: 'extract_settings',
      inputs: {
        action: 'extract',
        target: `@ctx.step:paragraph_fix_${config.chapterCount}`,
      },
      approval: 'on_warning',
      skippable: true,
      next: 'foreshadow',
    })
  }

  // 伏笔分析：检测本章伏笔状态并更新账本
  steps.push({
    id: 'foreshadow',
    agentId: 'foreshadow',
    inputs: {
      chapterNumber: String(config.startChapterNo + config.chapterCount - 1),
      chapterRange: `${config.startChapterNo}-${config.startChapterNo + config.chapterCount - 1}`,
    },
    approval: 'auto',
    skippable: true,
    next: 'commit_write',
  })

  // 终端落盘
  steps.push({
    id: 'commit_write',
    agentId: 'commit_write',
    inputs: {
      action: 'commit',
    },
    approval: 'always',
    skippable: false,
    next: null,
  })

  return steps
}

export function extractChapterContent(rawOutput: string): string {
  const trimmed = rawOutput.trim()
  try {
    const parsed = JSON.parse(trimmed)
    return parsed.content || trimmed
  } catch {
    return trimmed
  }
}

export function computeProgress(steps: WorkflowStep[], completedStepIdx: number): number {
  if (steps.length === 0) return 100
  return Math.round(((completedStepIdx + 1) / steps.length) * 100)
}
