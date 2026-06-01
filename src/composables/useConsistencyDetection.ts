/**
 * 内容一致性检测引擎
 *
 * 4 个检测层级：
 *   L1 硬约束 — 角色名/性别/年龄/生死/物品状态
 *   L2 软约束 — 时间线顺序
 *   L3 伏笔追踪 — 未回收伏笔
 *   L4 风格一致性 — (预留 LLM 检查)
 */

export type IssueLevel = 'ERROR' | 'WARNING' | 'INFO'

export interface ConsistencyIssue {
  level: IssueLevel
  type: string
  message: string
  chapter: number
}

export interface CharacterBaseline {
  name: string
  gender: string
  age: number
  alive: boolean
  location: string
  identity: string
  abilities: string[]
}

export interface TimelineEntry {
  chapter: number
  timestamp: number
  events: string[]
}

export interface ItemState {
  name: string
  owner: string
  destroyed: boolean
  properties: string[]
}

export interface ForeshadowEntry {
  id: string
  description: string
  plantedChapter: number
  resolvedChapter: number | null
  resolved: boolean
}

export interface WorldState {
  characters: Map<string, CharacterBaseline>
  timeline: TimelineEntry[]
  items: Map<string, ItemState>
  foreshadowing: ForeshadowEntry[]
}

// ── L1: 角色硬约束 ──

export function checkCharacterConsistency(
  newState: { name: string; gender: string; age: number; alive: boolean },
  baseline: CharacterBaseline,
  chapter: number,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  if (newState.name !== baseline.name) {
    issues.push({ level: 'ERROR', type: 'name_changed', message: `角色名称从 "${baseline.name}" 变为 "${newState.name}"`, chapter })
  }
  if (newState.gender !== baseline.gender) {
    issues.push({ level: 'ERROR', type: 'gender_changed', message: `角色性别从 "${baseline.gender}" 变为 "${newState.gender}"`, chapter })
  }
  if (newState.age < baseline.age) {
    issues.push({ level: 'ERROR', type: 'age_decreased', message: `角色年龄从 ${baseline.age} 倒退到 ${newState.age}`, chapter })
  }
  if (!baseline.alive && newState.alive) {
    issues.push({ level: 'ERROR', type: 'dead_revived', message: `已死亡角色 "${baseline.name}" 在第 ${chapter} 章复活（无复活设定）`, chapter })
  }

  return issues
}

// ── L2: 时间线 ──

export function checkTimelineOrder(entries: TimelineEntry[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].timestamp < entries[i - 1].timestamp) {
      issues.push({
        level: 'WARNING',
        type: 'time_reversal',
        message: `第 ${entries[i].chapter} 章时间倒退`,
        chapter: entries[i].chapter,
      })
    }
  }
  return issues
}

// ── L1: 物品状态 ──

export function checkItemConsistency(
  itemUse: { itemName: string; usedBy: string },
  itemState: ItemState,
  chapter: number,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  if (itemState.destroyed) {
    issues.push({ level: 'ERROR', type: 'destroyed_item_used', message: `已销毁物品 "${itemState.name}" 在第 ${chapter} 章被使用`, chapter })
  }
  if (itemUse.usedBy !== itemState.owner) {
    issues.push({ level: 'WARNING', type: 'item_owner_mismatch', message: `物品 "${itemState.name}" 当前属于 "${itemState.owner}"，被 "${itemUse.usedBy}" 使用`, chapter })
  }

  return issues
}

// ── L3: 伏笔 ──

export function checkForeshadowing(
  foreshadows: ForeshadowEntry[],
  currentChapter: number,
  isLastChapter: boolean,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  for (const fs of foreshadows) {
    if (fs.resolved) continue
    if (fs.resolvedChapter !== null && fs.resolvedChapter <= currentChapter && !fs.resolved) {
      issues.push({
        level: 'WARNING',
        type: 'unresolved_foreshadow',
        message: `伏笔 "${fs.description}" 预期在第 ${fs.resolvedChapter} 章回收但未回收`,
        chapter: currentChapter,
      })
    }
  }

  if (isLastChapter) {
    const unresolved = foreshadows.filter(f => !f.resolved)
    if (unresolved.length > 0) {
      issues.push({
        level: 'ERROR',
        type: 'ending_with_unresolved',
        message: `完结时有 ${unresolved.length} 个未回收伏笔`,
        chapter: currentChapter,
      })
    }
  }

  return issues
}

// ── 聚合 ──

export interface ChapterEvent {
  chapter: number
  characters: { name: string; gender: string; age: number; alive: boolean }[]
  itemUses: { itemName: string; usedBy: string }[]
  isLastChapter: boolean
}

export function runAllChecks(world: WorldState, event: ChapterEvent): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  for (const char of event.characters) {
    const baseline = world.characters.get(char.name)
    if (baseline) {
      issues.push(...checkCharacterConsistency(char, baseline, event.chapter))
    }
  }

  issues.push(...checkTimelineOrder(world.timeline))

  for (const use of event.itemUses) {
    const state = world.items.get(use.itemName)
    if (state) {
      issues.push(...checkItemConsistency(use, state, event.chapter))
    }
  }

  issues.push(...checkForeshadowing(world.foreshadowing, event.chapter, event.isLastChapter))

  return issues
}
