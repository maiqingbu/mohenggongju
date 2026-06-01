/**
 * 作品全生命周期工作流构建器
 *
 * 六阶段引导：
 *   灵感阶段 → 设定检测 → 信息检测 → 大纲检测 → 开篇 → 设定更新 → 续写循环
 *
 * 核心特性：
 *   1. 动态递进：按需检测，写到哪检测到哪
 *   2. 层级依赖强制：总纲 → 卷纲 → 章纲，必须按顺序
 *   3. 审批卡片消息化：所有审批以消息形式展示
 *   4. 状态字样实时更新：面板标签随进度变化
 *   5. 精准接通 AiModal：不只跳转面板，必须精准到按钮
 *   6. 落库触发更新：正文落库后自动触发设定更新检测
 *   7. 自动串联：缺失项补齐后自动回到续写流程
 */

import type { WorkflowStep, ApprovalLevel } from '../types'

// ── 生命周期阶段定义 ──

export type LifecyclePhase =
  | 'inspiration'      // 灵感阶段
  | 'setting_check'    // 设定检测
  | 'info_check'       // 信息检测
  | 'outline_check'    // 大纲检测
  | 'opening'          // 开篇
  | 'setting_update'   // 设定更新
  | 'continue_writing' // 续写循环

export interface LifecycleConfig {
  workId: number
  /** 目标总字数 */
  targetWords: number
  /** 每章目标字数 */
  wordsPerChapter: number
  /** 每卷章节数 */
  chaptersPerVolume: number
  /** 开篇章节数（默认3） */
  openingChapterCount?: number
  /** 用户提供的灵感/创意 */
  inspiration?: string
  /** 用户提供的基础设定 */
  initialSettings?: Record<string, unknown>
}

export interface LifecycleState {
  currentPhase: LifecyclePhase
  /** 各阶段完成状态 */
  phaseStatus: Record<LifecyclePhase, 'pending' | 'in_progress' | 'completed' | 'skipped'>
  /** 缺失项列表 */
  missingItems: MissingItemDetail[]
  /** 已完成项列表 */
  completedItems: string[]
  /** 当前进度信息 */
  progress: {
    totalChapters: number
    completedChapters: number
    currentVolume: number
    currentChapter: number
  }
}

export interface MissingItemDetail {
  type: 'setting' | 'info' | 'outline'
  field: string
  label: string
  phase: LifecyclePhase
  autoGeneratable: boolean
  /** 目标卷号（用于卷纲） */
  targetVolume?: number
  /** 目标章号（用于章纲） */
  targetChapter?: number
}

// ── 阶段状态管理 ──

export function createInitialLifecycleState(): LifecycleState {
  return {
    currentPhase: 'inspiration',
    phaseStatus: {
      inspiration: 'pending',
      setting_check: 'pending',
      info_check: 'pending',
      outline_check: 'pending',
      opening: 'pending',
      setting_update: 'pending',
      continue_writing: 'pending',
    },
    missingItems: [],
    completedItems: [],
    progress: {
      totalChapters: 0,
      completedChapters: 0,
      currentVolume: 1,
      currentChapter: 1,
    },
  }
}

export function updatePhaseStatus(
  state: LifecycleState,
  phase: LifecyclePhase,
  status: 'pending' | 'in_progress' | 'completed' | 'skipped',
): LifecycleState {
  return {
    ...state,
    phaseStatus: {
      ...state.phaseStatus,
      [phase]: status,
    },
    currentPhase: status === 'in_progress' ? phase : state.currentPhase,
  }
}

// ── 工作流构建器 ──

/**
 * 构建灵感阶段工作流
 * 用户提供创意，AI 帮助扩展和结构化
 */
export function buildInspirationWorkflow(config: LifecycleConfig): WorkflowStep[] {
  return [
    {
      id: 'inspiration_expand',
      agentId: 'idea',
      inputs: {
        action: 'expand',
        inspiration: config.inspiration || '',
        targetWords: String(config.targetWords),
      },
      approval: 'always',
      skippable: true,
      next: 'inspiration_commit',
    },
    {
      id: 'inspiration_commit',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: null,
    },
  ]
}

/**
 * 构建设定检测工作流
 * 检测作品基础设定是否完整，缺失项生成审批卡片
 */
export function buildSettingCheckWorkflow(config: LifecycleConfig): WorkflowStep[] {
  return [
    {
      id: 'setting_detect',
      agentId: 'setting_detector',
      inputs: {
        workId: String(config.workId),
      },
      approval: 'auto',
      skippable: false,
      next: 'setting_generate',
      condition: (output: string) => {
        try {
          const result = JSON.parse(output)
          if (result.complete) return null // 完成，跳过生成步骤
          return 'setting_generate' // 有缺失，进入生成步骤
        } catch {
          return 'setting_generate'
        }
      },
    },
    {
      id: 'setting_generate',
      agentId: 'setting',
      inputs: {
        action: 'generate',
        workId: String(config.workId),
      },
      approval: 'always',
      skippable: true,
      next: 'setting_commit',
    },
    {
      id: 'setting_commit',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: null,
    },
  ]
}

/**
 * 构建信息检测工作流
 * 检测人物、世界观等信息是否完整
 */
export function buildInfoCheckWorkflow(config: LifecycleConfig): WorkflowStep[] {
  return [
    {
      id: 'info_detect',
      agentId: 'info_detector',
      inputs: {
        workId: String(config.workId),
      },
      approval: 'auto',
      skippable: false,
      next: 'info_generate',
      condition: (output: string) => {
        try {
          const result = JSON.parse(output)
          if (result.complete) return null
          return 'info_generate'
        } catch {
          return 'info_generate'
        }
      },
    },
    {
      id: 'info_generate',
      agentId: 'character',
      inputs: {
        action: 'generate',
        workId: String(config.workId),
      },
      approval: 'always',
      skippable: true,
      next: 'info_commit',
    },
    {
      id: 'info_commit',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: null,
    },
  ]
}

/**
 * 构建大纲检测工作流
 * 检测大纲层级是否完整（总纲 → 卷纲 → 章纲）
 */
export function buildOutlineCheckWorkflow(config: LifecycleConfig): WorkflowStep[] {
  return [
    {
      id: 'outline_detect',
      agentId: 'outline_detector',
      inputs: {
        workId: String(config.workId),
      },
      approval: 'auto',
      skippable: false,
      next: 'outline_generate_main',
      condition: (output: string) => {
        try {
          const result = JSON.parse(output)
          if (result.complete) return null
          // 根据缺失项决定生成顺序
          if (!result.detail.hasMainOutline) return 'outline_generate_main'
          if (!result.detail.hasFirstVolume) return 'outline_generate_volume'
          return 'outline_generate_chapter'
        } catch {
          return 'outline_generate_main'
        }
      },
    },
    // 总纲生成
    {
      id: 'outline_generate_main',
      agentId: 'outline',
      inputs: {
        action: 'generate',
        type: 'main',
        targetWords: String(config.targetWords),
        wordsPerChapter: String(config.wordsPerChapter),
        chaptersPerVolume: String(config.chaptersPerVolume),
      },
      approval: 'always',
      skippable: false,
      next: 'outline_commit_main',
    },
    {
      id: 'outline_commit_main',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: 'outline_detect', // 回到检测，看是否需要生成卷纲
    },
    // 卷纲生成
    {
      id: 'outline_generate_volume',
      agentId: 'outline',
      inputs: {
        action: 'generate',
        type: 'volume',
        workId: String(config.workId),
      },
      approval: 'always',
      skippable: false,
      next: 'outline_commit_volume',
    },
    {
      id: 'outline_commit_volume',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: 'outline_detect', // 回到检测，看是否需要生成章纲
    },
    // 章纲生成
    {
      id: 'outline_generate_chapter',
      agentId: 'chapter',
      inputs: {
        action: 'generate_outline',
        workId: String(config.workId),
        chapterCount: String(config.openingChapterCount || 3),
      },
      approval: 'always',
      skippable: false,
      next: 'outline_commit_chapter',
    },
    {
      id: 'outline_commit_chapter',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: null, // 大纲检测完成
    },
  ]
}

/**
 * 构建开篇工作流
 * 生成开篇章节（默认3章）
 */
export function buildOpeningWorkflow(config: LifecycleConfig): WorkflowStep[] {
  const chapterCount = config.openingChapterCount || 3
  const steps: WorkflowStep[] = []

  // 开篇章节生成
  steps.push({
    id: 'opening_generate',
    agentId: 'body',
    inputs: {
      action: 'opening',
      chapterCount: String(chapterCount),
      wordsPerChapter: String(config.wordsPerChapter),
      startChapterNo: '1',
    },
    approval: 'always',
    skippable: false,
    next: 'opening_length_check',
  })

  // 字数检测
  steps.push({
    id: 'opening_length_check',
    agentId: 'length_check',
    inputs: {
      genBodyStepId: 'opening_generate',
      targetWords: String(config.wordsPerChapter),
    },
    approval: 'auto',
    skippable: true,
    next: 'opening_compress_expand',
  })

  // 字数调整
  steps.push({
    id: 'opening_compress_expand',
    agentId: 'compress_expand',
    inputs: {
      content: '@ctx.step:opening_generate',
      currentWords: '@ctx.step:opening_length_check',
      targetWords: String(config.wordsPerChapter),
    },
    approval: 'always',
    skippable: true,
    next: 'opening_style_review',
  })

  // 文风审查
  steps.push({
    id: 'opening_style_review',
    agentId: 'style_review',
    inputs: {
      content: '@ctx.step:opening_compress_expand',
    },
    approval: 'always',
    skippable: true,
    next: 'opening_commit',
  })

  // 落库
  steps.push({
    id: 'opening_commit',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'auto',
    skippable: false,
    next: null,
  })

  return steps
}

/**
 * 构建设定更新工作流
 * 正文落库后自动触发设定更新检测
 */
export function buildSettingUpdateWorkflow(config: LifecycleConfig): WorkflowStep[] {
  return [
    {
      id: 'setting_update_detect',
      agentId: 'setting_detector',
      inputs: {
        workId: String(config.workId),
        mode: 'update',
      },
      approval: 'auto',
      skippable: false,
      next: 'setting_update_generate',
      condition: (output: string) => {
        try {
          const result = JSON.parse(output)
          if (result.complete) return null
          return 'setting_update_generate'
        } catch {
          return 'setting_update_generate'
        }
      },
    },
    {
      id: 'setting_update_generate',
      agentId: 'setting',
      inputs: {
        action: 'update',
        workId: String(config.workId),
      },
      approval: 'always',
      skippable: true,
      next: 'setting_update_commit',
    },
    {
      id: 'setting_update_commit',
      agentId: 'commit_write',
      inputs: { action: 'commit' },
      approval: 'auto',
      skippable: false,
      next: null,
    },
  ]
}

/**
 * 构建续写循环工作流
 * 续写前动态递进检测（章纲依赖卷纲，卷纲依赖总纲）
 */
export function buildContinueWritingWorkflow(config: LifecycleConfig): WorkflowStep[] {
  const steps: WorkflowStep[] = []

  // 续写前置检测
  steps.push({
    id: 'continue_preflight',
    agentId: 'preflight_check',
    inputs: {
      workId: String(config.workId),
      chapterNo: '@ctx.currentChapter',
    },
    approval: 'auto',
    skippable: false,
    next: 'continue_generate',
    condition: (output: string) => {
      try {
        const result = JSON.parse(output)
        if (result.ready) return 'continue_generate'
        // 根据缺失项决定下一步
        if (result.missingItems.some((i: any) => i.field === 'volume_outline')) {
          return 'continue_generate_volume'
        }
        if (result.missingItems.some((i: any) => i.field === 'chapter_outline')) {
          return 'continue_generate_chapter'
        }
        return 'continue_generate'
      } catch {
        return 'continue_generate'
      }
    },
  })

  // 卷纲生成（如果缺失）
  steps.push({
    id: 'continue_generate_volume',
    agentId: 'outline',
    inputs: {
      action: 'generate',
      type: 'volume',
      workId: String(config.workId),
      volumeNo: '@ctx.currentVolume',
    },
    approval: 'always',
    skippable: false,
    next: 'continue_commit_volume',
  })

  steps.push({
    id: 'continue_commit_volume',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'auto',
    skippable: false,
    next: 'continue_preflight', // 回到前置检测
  })

  // 章纲生成（如果缺失）
  steps.push({
    id: 'continue_generate_chapter',
    agentId: 'chapter',
    inputs: {
      action: 'generate_outline',
      workId: String(config.workId),
      chapterNo: '@ctx.currentChapter',
    },
    approval: 'always',
    skippable: false,
    next: 'continue_commit_chapter',
  })

  steps.push({
    id: 'continue_commit_chapter',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'auto',
    skippable: false,
    next: 'continue_preflight', // 回到前置检测
  })

  // 正文生成
  steps.push({
    id: 'continue_generate',
    agentId: 'body',
    inputs: {
      action: 'continue',
      chapterNo: '@ctx.currentChapter',
      wordsPerChapter: String(config.wordsPerChapter),
    },
    approval: 'always',
    skippable: false,
    next: 'continue_length_check',
  })

  // 字数检测
  steps.push({
    id: 'continue_length_check',
    agentId: 'length_check',
    inputs: {
      genBodyStepId: 'continue_generate',
      targetWords: String(config.wordsPerChapter),
    },
    approval: 'auto',
    skippable: true,
    next: 'continue_compress_expand',
  })

  // 字数调整
  steps.push({
    id: 'continue_compress_expand',
    agentId: 'compress_expand',
    inputs: {
      content: '@ctx.step:continue_generate',
      currentWords: '@ctx.step:continue_length_check',
      targetWords: String(config.wordsPerChapter),
    },
    approval: 'always',
    skippable: true,
    next: 'continue_style_review',
  })

  // 文风审查
  steps.push({
    id: 'continue_style_review',
    agentId: 'style_review',
    inputs: {
      content: '@ctx.step:continue_compress_expand',
    },
    approval: 'always',
    skippable: true,
    next: 'continue_commit',
  })

  // 落库
  steps.push({
    id: 'continue_commit',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'auto',
    skippable: false,
    next: 'continue_setting_update', // 落库后触发设定更新
  })

  // 设定更新
  steps.push({
    id: 'continue_setting_update',
    agentId: 'setting_detector',
    inputs: {
      workId: String(config.workId),
      mode: 'update',
    },
    approval: 'auto',
    skippable: false,
    next: 'continue_setting_update_generate',
    condition: (output: string) => {
      try {
        const result = JSON.parse(output)
        if (result.complete) return 'continue_next_chapter'
        return 'continue_setting_update_generate'
      } catch {
        return 'continue_setting_update_generate'
      }
    },
  })

  steps.push({
    id: 'continue_setting_update_generate',
    agentId: 'setting',
    inputs: {
      action: 'update',
      workId: String(config.workId),
    },
    approval: 'always',
    skippable: true,
    next: 'continue_setting_update_commit',
  })

  steps.push({
    id: 'continue_setting_update_commit',
    agentId: 'commit_write',
    inputs: { action: 'commit' },
    approval: 'auto',
    skippable: false,
    next: 'continue_next_chapter',
  })

  // 下一章（条件路由：是否继续）
  steps.push({
    id: 'continue_next_chapter',
    agentId: 'preflight_check',
    inputs: {
      workId: String(config.workId),
      chapterNo: '@ctx.nextChapter',
    },
    approval: 'auto',
    skippable: false,
    next: null, // 结束，由外部决定是否继续
    condition: (output: string) => {
      try {
        const result = JSON.parse(output)
        if (result.ready) return 'continue_generate' // 继续下一章
        return null // 结束
      } catch {
        return null
      }
    },
  })

  return steps
}

// ── 完整生命周期构建器 ──

/**
 * 构建完整的生命周期工作流
 * 根据当前状态动态生成下一步工作流
 */
export function buildLifecycleWorkflow(
  config: LifecycleConfig,
  state: LifecycleState,
): WorkflowStep[] {
  const { currentPhase, phaseStatus } = state

  // 根据当前阶段生成对应工作流
  switch (currentPhase) {
    case 'inspiration':
      if (phaseStatus.inspiration === 'completed') {
        // 灵感阶段已完成，进入设定检测
        return buildSettingCheckWorkflow(config)
      }
      return buildInspirationWorkflow(config)

    case 'setting_check':
      if (phaseStatus.setting_check === 'completed') {
        return buildInfoCheckWorkflow(config)
      }
      return buildSettingCheckWorkflow(config)

    case 'info_check':
      if (phaseStatus.info_check === 'completed') {
        return buildOutlineCheckWorkflow(config)
      }
      return buildInfoCheckWorkflow(config)

    case 'outline_check':
      if (phaseStatus.outline_check === 'completed') {
        return buildOpeningWorkflow(config)
      }
      return buildOutlineCheckWorkflow(config)

    case 'opening':
      if (phaseStatus.opening === 'completed') {
        return buildContinueWritingWorkflow(config)
      }
      return buildOpeningWorkflow(config)

    case 'setting_update':
      return buildSettingUpdateWorkflow(config)

    case 'continue_writing':
      return buildContinueWritingWorkflow(config)

    default:
      return buildInspirationWorkflow(config)
  }
}

/**
 * 获取下一阶段
 */
export function getNextPhase(currentPhase: LifecyclePhase): LifecyclePhase | null {
  const phaseOrder: LifecyclePhase[] = [
    'inspiration',
    'setting_check',
    'info_check',
    'outline_check',
    'opening',
    'setting_update',
    'continue_writing',
  ]

  const currentIndex = phaseOrder.indexOf(currentPhase)
  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return null
  }
  return phaseOrder[currentIndex + 1]
}

/**
 * 获取阶段显示名称
 */
export function getPhaseDisplayName(phase: LifecyclePhase): string {
  const names: Record<LifecyclePhase, string> = {
    inspiration: '灵感阶段',
    setting_check: '设定检测',
    info_check: '信息检测',
    outline_check: '大纲检测',
    opening: '开篇创作',
    setting_update: '设定更新',
    continue_writing: '续写循环',
  }
  return names[phase]
}

/**
 * 获取阶段状态显示名称
 */
export function getPhaseStatusDisplayName(status: 'pending' | 'in_progress' | 'completed' | 'skipped'): string {
  const names = {
    pending: '待处理',
    in_progress: '进行中',
    completed: '已完成',
    skipped: '已跳过',
  }
  return names[status]
}

/**
 * 计算总章节数
 */
export function calculateTotalChapters(config: LifecycleConfig): number {
  return Math.ceil(config.targetWords / config.wordsPerChapter)
}

/**
 * 计算总卷数
 */
export function calculateTotalVolumes(config: LifecycleConfig): number {
  const totalChapters = calculateTotalChapters(config)
  return Math.ceil(totalChapters / config.chaptersPerVolume)
}

/**
 * 获取章节所属卷号
 */
export function getVolumeForChapter(chapterNo: number, chaptersPerVolume: number): number {
  return Math.ceil(chapterNo / chaptersPerVolume)
}
