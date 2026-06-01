/**
 * 项目编排器 — 状态机驱动的推荐引擎
 *
 * 状态（严格对齐设计文档 S0-S8）：
 *   S0 无作品           → 灵感火花 / 手动新建
 *   S1 有作品未选中      → 提示在左侧选择作品
 *   S2 已选中·空作品     → 填写作品信息 / 跳过
 *   S3 有信息·缺设定     → 逐项补充（人物→世界观→物品→伏笔）/ 稍后再说
 *   S4 设定齐全          → 生成总纲
 *   S5 有总纲            → 生成卷纲
 *   S6 有卷纲            → 生成章纲
 *   S7 有章纲            → 黄金开篇
 *   S8 已开篇            → 更新设定 ⇄ 续写（循环）
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useWorkRepo } from './useWorkRepo'
import { SettingsManager } from './useSettings'
import { getOutline } from './useOutlines'
import { WorkspaceSettings } from './useWorkspaceSettings'

// ── 类型 ──

export interface RecommendationCard {
  id: string
  stage: string
  message: string
  buttons: RecommendationButton[]
  prominent?: boolean
}

export interface RecommendationButton {
  label: string
  action: string
  primary?: boolean
}

export interface OrchestratorState {
  currentCard: Ref<RecommendationCard | null>
  hasRecommendation: ComputedRef<boolean>
  refresh(): Promise<RecommendationCard | null>
  handleAction(action: string): Promise<RecommendationCard | null>
}

// ── 状态枚举（S0-S8，9 个状态）──

type State = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8'

// ── 检测函数 ──

function hasWorks(): boolean {
  return useWorkRepo().works.value.length > 0
}

function hasSelectedWork(): boolean {
  return useWorkRepo().currentWorkId.value != null
}

function isWorkInfoEmpty(workId: number): boolean {
  try {
    const d = new WorkspaceSettings(workId).data
    return !d.title && !d.genre && !d.mainCharacter
  } catch { return true }
}

function detectMissingSettings(sm: SettingsManager): string[] {
  const missing: string[] = []
  if (sm.listByType('character').length === 0) missing.push('character')
  if (sm.listByType('world_setting').length === 0) missing.push('world_setting')
  if (sm.listByType('item').length === 0) missing.push('item')
  if (sm.listByType('foreshadowing').length === 0) missing.push('foreshadowing')
  return missing
}

function hasChapters(): boolean {
  return Object.values(useWorkRepo().chapterMap.value ?? {}).flat().length > 0
}

async function detectOutlineState(workId: number) {
  const main = await getOutline('main', workId)
  const repo = useWorkRepo()
  const volumeIds = Object.keys(repo.chapterMap.value ?? {})

  // 直接遍历所有卷和章查 outline 文件
  let hasVolumeOutline = false
  let hasChapterOutlines = false

  for (const vid of volumeIds) {
    if (!hasVolumeOutline && await getOutline('volume', Number(vid))) {
      hasVolumeOutline = true
    }
    const chs = (repo.chapterMap.value as any)?.[vid] ?? []
    for (const ch of chs) {
      if (await getOutline('chapter', ch.id)) { hasChapterOutlines = true }
    }
    if (hasVolumeOutline && hasChapterOutlines) break
  }

  // 章纲存在 → 卷纲一定存在（因果推断）
  if (hasChapterOutlines) hasVolumeOutline = true

  const r = { hasMain: !!main, hasVolumeOutline, hasChapterOutlines, volumeIds, workId }
  console.log('[编排器] detectResult', JSON.stringify(r))

  return { hasMain: main !== null, hasVolumeOutline, hasChapterOutlines }
}

/** 判断是否有正文（不是章纲，是实际的章节内容） */
function hasBodyContent(): boolean {
  const repo = useWorkRepo()
  const volumeIds = Object.keys(repo.chapterMap.value ?? {})
  for (const vid of volumeIds) {
    const chs = (repo.chapterMap.value as any)?.[vid] ?? []
    for (const ch of chs) {
      if (ch.content && ch.content.trim().length > 10) return true
    }
  }
  return false
}

async function detectState(sm: SettingsManager, skipped: Set<string>): Promise<State> {
  if (!hasWorks()) return 'S0'
  if (!hasSelectedWork()) return 'S1'

  const workId = useWorkRepo().currentWorkId.value!
  if (isWorkInfoEmpty(workId)) return 'S2'

  const missing = detectMissingSettings(sm).filter(t => !skipped.has(t))
  if (missing.length > 0) return 'S3'

  const outline = await detectOutlineState(workId)

  // 从前往后跳过已完成的，找到第一个缺失的
  if (!outline.hasMain) return 'S4'
  if (!outline.hasVolumeOutline) return 'S5'
  if (!outline.hasChapterOutlines) return 'S6'
  if (!hasBodyContent()) return 'S7'
  return 'S8'
}

// ── 卡片工厂 ──

function makeCard(stage: string, message: string, buttons: RecommendationButton[]): RecommendationCard {
  return { id: `rec_${stage}_${Date.now()}`, stage, message, buttons, prominent: true }
}

const SETTING_LABELS: Record<string, string> = {
  character: '人物',
  world_setting: '世界观',
  item: '力量规则/金手指',
  foreshadowing: '伏笔',
}

// ── 创建编排器 ──

export function createProjectOrchestrator(
  sm: SettingsManager,
  navigate: (panel: string, action: string) => void,
): OrchestratorState {
  const currentCard = ref<RecommendationCard | null>(null)
  const hasRecommendation = computed(() => currentCard.value !== null)

  let _justExtractedSettings = false
  const _skippedMissing = new Set<string>()

  async function buildCard(state: State): Promise<RecommendationCard> {
    switch (state) {
      // ── S0: 系统中没有任何作品 ──
      case 'S0':
        return makeCard('S0', '还没有作品，从灵感火花开始创作，或手动新建一部作品', [
          { label: '灵感火花', action: 'create_work_inspire', primary: true },
          { label: '手动新建', action: 'create_work_manual' },
        ])

      // ── S1: 有作品但未选中 ──
      case 'S1':
        return makeCard('S1', '请在左侧作品目录中选择一部作品', [])

      // ── S2: 已选中但信息全空 ──
      case 'S2':
        return makeCard('S2', '新作品已创建！先填写书名、类型、主角等基础信息，后续 AI 生成才有依据', [
          { label: '填写作品信息', action: 'open_workspace_config', primary: true },
          { label: '跳过', action: 'skip_work_info' },
        ])

      // ── S3: 有信息但缺设定 ──
      case 'S3': {
        const missing = detectMissingSettings(sm).filter(t => !_skippedMissing.has(t))
        const first = missing[0]
        const label = SETTING_LABELS[first] || first
        return makeCard('S3', `建议补充「${label}」设定，让 AI 创作有据可依`, [
          { label: `补充${label}`, action: `add_${first}`, primary: true },
          { label: '稍后再说', action: 'skip' },
        ])
      }

      // ── S4: 设定齐全，缺总纲 ──
      case 'S4':
        return makeCard('S4', '设定已齐全，创建总纲确定故事走向', [
          { label: '生成总纲', action: 'gen_main_outline', primary: true },
          { label: '稍后再说', action: 'skip' },
        ])

      // ── S5: 有总纲，缺卷纲 ──
      case 'S5':
        return makeCard('S5', '总纲已就绪，为第 1 卷创建卷纲', [
          { label: '生成卷纲', action: 'gen_volume_outline', primary: true },
          { label: '稍后再说', action: 'skip' },
        ])

      // ── S6: 有卷纲，缺章纲 ──
      case 'S6':
        return makeCard('S6', '卷纲已就绪，规划章纲', [
          { label: '生成章纲', action: 'gen_chapter_outlines', primary: true },
          { label: '稍后再说', action: 'skip' },
        ])

      // ── S7: 有章纲，未开篇 ──
      case 'S7':
        return makeCard('S7', '大纲准备完毕，开始写黄金开篇', [
          { label: '开始黄金开篇', action: 'gen_opening', primary: true },
          { label: '稍后再说', action: 'skip' },
        ])

      // ── S8: 已开篇，续写循环 ──
      case 'S8':
        if (_justExtractedSettings) {
          return makeCard('S8', '设定已更新，继续创作下一章吗？', [
            { label: '续写下一章', action: 'continue_writing', primary: true },
            { label: '再次更新设定', action: 'extract_settings' },
          ])
        }
        return makeCard('S8', '新章节已生成，建议更新设定库', [
          { label: '更新设定', action: 'extract_settings', primary: true },
          { label: '跳过，直接续写', action: 'continue_writing' },
        ])
    }
  }

  async function refresh(): Promise<RecommendationCard | null> {
    const state = await detectState(sm, _skippedMissing)
    currentCard.value = await buildCard(state)
    return currentCard.value
  }

  async function handleAction(action: string): Promise<RecommendationCard | null> {
    switch (action) {
      case 'create_work_inspire':
        navigate('content', 'inspire')
        break

      case 'create_work_manual': {
        const id = await useWorkRepo().addWork('未命名作品')
        if (id) await useWorkRepo().selectWork(id)
        break
      }

      case 'open_workspace_config':
        navigate('workspace_config', 'open')
        break

      case 'skip_work_info':
        break

      case 'add_character':
      case 'add_world_setting':
      case 'add_item':
      case 'add_foreshadowing':
        navigate('settings', 'open')
        break

      case 'gen_main_outline':
        navigate('outline_config', 'gen_main')
        break

      case 'gen_volume_outline':
        navigate('outline_config', 'gen_volume')
        break

      case 'gen_chapter_outlines':
        navigate('outline_config', 'gen_chapter')
        break

      case 'gen_opening':
        navigate('content', 'opening')
        break

      case 'extract_settings':
        _justExtractedSettings = true
        navigate('content', 'updateSettings')
        break

      case 'continue_writing':
        _justExtractedSettings = false
        navigate('content', 'continue')
        break

      case 'skip': {
        const btnAction = currentCard.value?.buttons[0]?.action
        if (btnAction?.startsWith('add_')) {
          _skippedMissing.add(btnAction.replace('add_', ''))
        }
        break
      }
    }

    // 生成类操作（导航到其他面板）不立即清空卡片，等用户返回后再刷新
    const isGenAction = action.startsWith('gen_') || action === 'extract_settings' || action === 'continue_writing' || action.startsWith('add_') || action.startsWith('open_')
    if (!isGenAction) {
      currentCard.value = null
    }
    if (action === 'skip' || action === 'skip_work_info' || action === 'create_work_manual') {
      await refresh()
    }
    return currentCard.value
  }

  return { currentCard, hasRecommendation, refresh, handleAction }
}
