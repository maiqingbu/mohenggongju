/**
 * 全生命周期工作流构建器
 *
 * 作品全生命周期6阶段引导：
 * 1. 灵感阶段 - 作品信息收集
 * 2. 设定检测 - 检查作品设定是否完整
 * 3. 信息检测 - 检查世界观、角色等信息
 * 4. 大纲检测 - 总纲 → 卷纲 → 章纲
 * 5. 开篇阶段 - 开篇3章创作
 * 6. 续写循环 - 动态递进检测 + 续写
 *
 * 核心特性：
 * - 阶段间自动流转，支持条件跳转
 * - 动态递进检测：续写前检测章纲依赖卷纲，卷纲依赖总纲
 * - 审批卡片消息化展示
 * - 精准接通AiModal按钮
 */

import type { WorkflowStep } from './types'

// ── 生命周期阶段定义 ──

export type LifecycleStage =
  | 'inspire'        // 灵感阶段
  | 'setting_check'  // 设定检测
  | 'info_check'     // 信息检测
  | 'outline_check'  // 大纲检测
  | 'opening'        // 开篇阶段
  | 'continue'       // 续写循环
  | 'completed'      // 完成

export interface LifecycleContext {
  workId: number
  currentStage: LifecycleStage
  /** 用户规划的总字数 */
  totalWords?: number
  /** 每章目标字数 */
  wordsPerChapter?: number
  /** 已完成章节数 */
  completedChapters?: number
  /** 总卷数 */
  totalVolumes?: number
  /** 当前卷号 */
  currentVolume?: number
}

export interface LifecycleDetectionResult {
  stage: LifecycleStage
  ready: boolean
  missing: Array<{
    type: 'setting' | 'info' | 'outline'
    field: string
    label: string
    autoGeneratable: boolean
  }>
  completed: string[]
  message: string
  /** 下一步推荐动作 */
  nextAction?: {
    type: 'generate' | 'check' | 'proceed'
    target: string
    label: string
  }
}

/**
 * 检测当前生命周期阶段状态
 */
export async function detectLifecycleStage(
  context: LifecycleContext
): Promise<LifecycleDetectionResult> {
  const { workId } = context

  // 动态导入依赖
  const { useWorkRepo } = await import('../composables/useWorkRepo')
  const repo = useWorkRepo()

  // 获取作品数据
  const work = repo.works.value.find((w: any) => w.id === workId)
  if (!work) {
    return {
      stage: 'inspire',
      ready: false,
      missing: [{ type: 'setting', field: 'work', label: '作品', autoGeneratable: false }],
      completed: [],
      message: '⚠️ 未找到作品信息',
    }
  }

  const missing: LifecycleDetectionResult['missing'] = []
  const completed: string[] = []

  // ── 阶段1：设定检测 ──
	const hasTitle = !!work.title
	// genre/description 存储在 workspace settings 中，不在 Work 表
	const wsRaw = typeof localStorage !== "undefined" ? localStorage.getItem(`ns:ws:${workId}`) : null
	const ws: Record<string, unknown> = wsRaw ? JSON.parse(wsRaw) : {}
	const hasGenre = !!(ws.genre as string)?.trim()
	const hasDesc = !!(ws.intro || ws.summary || (ws as any).description)?.toString().trim()

  if (hasTitle) completed.push('作品标题')
  if (hasGenre) completed.push('作品类型')
  if (hasDesc) completed.push('作品简介')

  if (!hasTitle || !hasGenre || !hasDesc) {
    if (!hasTitle) missing.push({ type: 'setting', field: 'title', label: '作品标题', autoGeneratable: false })
    if (!hasGenre) missing.push({ type: 'setting', field: 'genre', label: '作品类型', autoGeneratable: false })
    if (!hasDesc) missing.push({ type: 'setting', field: 'description', label: '作品简介', autoGeneratable: true })

    return {
      stage: 'setting_check',
      ready: false,
      missing,
      completed,
      message: '📋 作品基础设定不完整，请先完善以下信息',
      nextAction: { type: 'check', target: 'workspace_config', label: '填写作品信息' },
    }
  }

  // ── 阶段2：信息检测 ──
  const { getOutline } = await import('../composables/useOutlines')
  const mainOutline = await getOutline('main', workId)
  const hasWorldview = !!(work as any).worldview
  const hasCharacters = !!(work as any).characters && (work as any).characters.length > 0

  if (hasWorldview) completed.push('世界观设定')
  if (hasCharacters) completed.push('角色设定')

  // 世界观和角色不是必须的，但会影响大纲质量
  // 这里只做提示，不阻断流程

  // ── 阶段3：大纲检测 ──
  const hasMainOutline = mainOutline !== null
  if (hasMainOutline) completed.push('总纲')

  // 获取卷信息
  const volumes = repo.volumes.value.filter((v: any) => v.work_id === workId)
  const chapterMap = repo.chapterMap.value

  // 检测第一卷卷纲
  let hasFirstVolumeOutline = false
  if (volumes.length > 0) {
    const volOutline = await getOutline('volume', volumes[0].id)
    hasFirstVolumeOutline = volOutline !== null
    if (hasFirstVolumeOutline) completed.push('第一卷卷纲')
  }

  // 检测章纲（至少开篇3章）
  const allChapters: any[] = []
  for (const vol of volumes) {
    const chs = chapterMap[vol.id] || []
    allChapters.push(...chs)
  }
  allChapters.sort((a: any, b: any) => a.sort_order - b.sort_order)

  let openingOutlineCount = 0
  for (const ch of allChapters.slice(0, 3)) {
    const chOutline = await getOutline('chapter', ch.id)
    if (chOutline) openingOutlineCount++
  }
  const hasOpening3Chapters = openingOutlineCount >= 3
  if (hasOpening3Chapters) completed.push('开篇3章章纲')

  // 大纲层级依赖检测
  if (!hasMainOutline) {
    missing.push({ type: 'outline', field: 'main_outline', label: '总纲', autoGeneratable: true })
  }
  if (!hasFirstVolumeOutline && volumes.length > 0) {
    missing.push({ type: 'outline', field: 'volume_outline', label: '第一卷卷纲', autoGeneratable: true })
  }
  if (!hasOpening3Chapters) {
    missing.push({ type: 'outline', field: 'chapter_outline', label: `开篇章纲（${openingOutlineCount}/3）`, autoGeneratable: true })
  }

  if (missing.length > 0) {
    return {
      stage: 'outline_check',
      ready: false,
      missing,
      completed,
      message: '📋 大纲层级不完整，请按顺序生成：总纲 → 卷纲 → 章纲',
      nextAction: {
        type: 'generate',
        target: missing[0].field,
        label: `生成${missing[0].label}`,
      },
    }
  }

  // ── 阶段4：开篇/续写检测 ──
  const totalChapters = allChapters.length
  const chaptersWithContent = allChapters.filter(
    (ch: any) => ch.content && ch.content.trim().length > 100
  ).length

  if (totalChapters === 0 || chaptersWithContent === 0) {
    return {
      stage: 'opening',
      ready: true,
      missing: [],
      completed,
      message: '🚀 大纲已齐全，可以开始开篇创作！',
      nextAction: { type: 'proceed', target: 'opening', label: '开始开篇' },
    }
  }

  // ── 阶段5：续写循环 ──
  // 动态递进检测：检查下一章的前置条件
  const nextChapterNo = chaptersWithContent + 1
  const nextChapter = allChapters.find((ch: any) => ch.sort_order === nextChapterNo - 1)

  if (nextChapter) {
    // 检测该章所属卷的卷纲
    const vol = volumes.find((v: any) => v.id === nextChapter.volume_id)
    if (vol) {
      const volOutline = await getOutline('volume', vol.id)
      if (!volOutline) {
        missing.push({
          type: 'outline',
          field: 'volume_outline',
          label: `第${volumes.indexOf(vol) + 1}卷卷纲`,
          autoGeneratable: true,
        })
      }
    }

    // 检测该章章纲
    const chOutline = await getOutline('chapter', nextChapter.id)
    if (!chOutline) {
      missing.push({
        type: 'outline',
        field: 'chapter_outline',
        label: `第${nextChapterNo}章章纲`,
        autoGeneratable: true,
      })
    }
  }

  if (missing.length > 0) {
    return {
      stage: 'continue',
      ready: false,
      missing,
      completed,
      message: `📋 续写第${nextChapterNo}章前需要补齐前置条件`,
      nextAction: {
        type: 'generate',
        target: missing[0].field,
        label: `生成${missing[0].label}`,
      },
    }
  }

  // 一切就绪
  return {
    stage: 'continue',
    ready: true,
    missing: [],
    completed,
    message: `✅ 已完成${chaptersWithContent}章，可以继续创作第${nextChapterNo}章`,
    nextAction: { type: 'proceed', target: 'continue', label: `续写第${nextChapterNo}章` },
  }
}

/**
 * 构建开篇工作流
 */
export function buildOpeningWorkflow(config: {
  chapterCount: number
  wordsPerChapter: number
  chapterIds: number[]
}): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const { chapterCount, wordsPerChapter, chapterIds } = config
  const targetWords = String(wordsPerChapter || 2000)

  // 章纲规划
  steps.push({
    id: 'plan_opening',
    agentId: 'chapter',
    inputs: {
      action: 'plan',
      chapterRange: `1-${chapterCount}`,
      wordsPerChapter: targetWords,
      isOpening: 'true',
    },
    approval: 'auto',
    skippable: false,
    next: chapterCount > 0 ? 'gen_body_1' : 'commit_write',
  })

  // 逐章生成
  for (let i = 0; i < chapterCount; i++) {
    const chNo = i + 1
    const chapterId = chapterIds[i] ?? chNo
    const isLast = i === chapterCount - 1

    steps.push({
      id: `gen_body_${chNo}`,
      agentId: 'body',
      inputs: {
        chapterNo: String(chNo),
        chapterId: String(chapterId),
        plan: '@ctx.step:plan_opening',
        continueFrom: i === 0 ? '@ctx.step:plan_opening' : `@ctx.step:gen_body_${i}`,
        targetWords,
        isOpening: 'true',
      },
      approval: 'always',
      skippable: true,
      next: `length_check_${chNo}`,
    })

    // 字数检测
    steps.push({
      id: `length_check_${chNo}`,
      agentId: 'length_check',
      inputs: {
        genBodyStepId: `gen_body_${chNo}`,
        targetWords,
      },
      approval: 'auto',
      skippable: true,
      next: `length_normalizer_${chNo}`,
    })

    // 字数修正
    steps.push({
      id: `length_normalizer_${chNo}`,
      agentId: 'length_normalizer',
      inputs: {
        content: `@ctx.step:gen_body_${chNo}`,
        currentWords: `@ctx.step:length_check_${chNo}`,
        targetWords,
        action: 'compress',
      },
      approval: 'always',
      skippable: true,
      next: `paragraph_fix_${chNo}`,
    })

    // 段落修复
    steps.push({
      id: `paragraph_fix_${chNo}`,
      agentId: 'paragraph_fix',
      inputs: {
        contentKey: `step:length_normalizer_${chNo}`,
      },
      approval: 'auto',
      skippable: true,
      next: `style_review_${chNo}`,
    })

    // 文风审查
    steps.push({
      id: `style_review_${chNo}`,
      agentId: 'style_review',
      inputs: {
        content: `@ctx.step:paragraph_fix_${chNo}`,
        chapterNo: String(chNo),
      },
      approval: 'on_warning',
      skippable: true,
      next: `reviser_${chNo}`,
    })

    // 审计驱动修订
    steps.push({
      id: `reviser_${chNo}`,
      agentId: 'reviser',
      inputs: {
        mode: 'auto',
        content: `@ctx.step:paragraph_fix_${chNo}`,
        issues: `@ctx.step:style_review_${chNo}`,
      },
      approval: 'always',
      skippable: true,
      next: isLast ? 'consistency_check' : `gen_body_${chNo + 1}`,
    })
  }

  // 一致性检测
  steps.push({
    id: 'consistency_check',
    agentId: 'consistency_check',
    inputs: {
      action: 'check',
      contentKey: `step:gen_body_${chapterCount}`,
      chapterNo: String(chapterCount),
    },
    approval: 'on_warning',
    skippable: true,
    next: 'extract_settings',
  })

  // 设定提取
  steps.push({
    id: 'extract_settings',
    agentId: 'extract_settings',
    inputs: { action: 'extract', target: `@ctx.step:paragraph_fix_${chapterCount}` },
    approval: 'on_warning',
    skippable: true,
    next: 'commit_write',
  })

  // 终端落盘
  steps.push({
    id: 'commit_write',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'always',
    skippable: false,
    next: null,
  })

  return steps
}

/**
 * 构建续写工作流（带动态递进检测）
 */
export function buildContinueWithPreflightWorkflow(config: {
  startChapterNo: number
  chapterCount: number
  wordsPerChapter: number
  chapterIds: number[]
}): WorkflowStep[] {
  const steps: WorkflowStep[] = []
  const { startChapterNo, chapterCount, wordsPerChapter, chapterIds } = config
  const targetWords = String(wordsPerChapter || 2000)

  // 前置检测步骤
  steps.push({
    id: 'preflight_check',
    agentId: 'preflight_check',
    inputs: {
      chapterNo: String(startChapterNo),
    },
    approval: 'auto',
    skippable: false,
    next: 'load_context',
  })

  // 章纲规划
  steps.push({
    id: 'load_context',
    agentId: 'chapter',
    inputs: {
      action: 'plan',
      chapterRange: `${startChapterNo}-${startChapterNo + chapterCount - 1}`,
      wordsPerChapter: targetWords,
    },
    approval: 'auto',
    skippable: false,
    next: chapterCount > 0 ? 'gen_body_1' : 'consistency_check',
  })

  // 逐章生成
  for (let i = 0; i < chapterCount; i++) {
    const chNo = startChapterNo + i
    const chapterId = chapterIds[i] ?? chNo
    const isLast = i === chapterCount - 1
    const idx = i + 1

    steps.push({
      id: `gen_body_${idx}`,
      agentId: 'body',
      inputs: {
        chapterNo: String(chNo),
        chapterId: String(chapterId),
        plan: '@ctx.step:load_context',
        continueFrom: i === 0 ? '@ctx.step:load_context' : `@ctx.step:gen_body_${i}`,
        targetWords,
      },
      approval: 'always',
      skippable: true,
      next: `length_check_${idx}`,
    })

    // 字数检测
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

    // 字数修正
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

    // 段落修复
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

    // 文风审查
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

    // 审计驱动修订
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
      next: isLast ? 'consistency_check' : `gen_body_${idx + 1}`,
    })
  }

  // 一致性检测
  steps.push({
    id: 'consistency_check',
    agentId: 'consistency_check',
    inputs: {
      action: 'check',
      contentKey: `step:gen_body_${chapterCount}`,
      chapterNo: String(startChapterNo + chapterCount - 1),
    },
    approval: 'on_warning',
    skippable: true,
    next: 'extract_settings',
  })

  // 设定提取
  steps.push({
    id: 'extract_settings',
    agentId: 'extract_settings',
    inputs: { action: 'extract', target: `@ctx.step:paragraph_fix_${chapterCount}` },
    approval: 'on_warning',
    skippable: true,
    next: 'commit_write',
  })

  // 终端落盘
  steps.push({
    id: 'commit_write',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'always',
    skippable: false,
    next: null,
  })

  return steps
}

/**
 * 格式化生命周期检测结果
 */
export function formatLifecycleResult(result: LifecycleDetectionResult): string {
  const lines: string[] = []

  // 阶段标签
  const stageLabels: Record<LifecycleStage, string> = {
    inspire: '灵感阶段',
    setting_check: '设定检测',
    info_check: '信息检测',
    outline_check: '大纲检测',
    opening: '开篇阶段',
    continue: '续写循环',
    completed: '已完成',
  }

  lines.push(`📍 当前阶段：${stageLabels[result.stage]}`)
  lines.push('')

  // 已完成项
  if (result.completed.length > 0) {
    lines.push('✅ 已完成：')
    for (const item of result.completed) {
      lines.push(`  · ${item}`)
    }
    lines.push('')
  }

  // 缺失项
  if (result.missing.length > 0) {
    lines.push('❌ 待完成：')
    for (const item of result.missing) {
      const autoTag = item.autoGeneratable ? '（可AI生成）' : ''
      lines.push(`  · ${item.label}${autoTag}`)
    }
    lines.push('')
  }

  // 推荐动作
  if (result.nextAction) {
    lines.push(`💡 推荐操作：${result.nextAction.label}`)
  }

  return lines.join('\n')
}
