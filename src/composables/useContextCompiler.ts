/**
 * 上下文编译器 — 对标 inkos Composer + MemoryRetrieval
 * 输入：章纲结构化数据 + 作品全局状态
 * 输出：精简的上下文字符串，随章节数增长自动控制体积
 */

import type { ChapterOutlineStructured } from './useOutlines'
import { estimateTokens, calculateBudget, truncateHeadTail, enforceContextBudget, type ContextBlock } from './tokenBudget'

// ============================================================
// 类型定义
// ============================================================

export interface NovelState {
  title: string
  genre: string
  style: string
  summary: string
  targetWordCount: number
  wordsPerChapter: number
  currentChapter: number
  characters: CharacterSnapshot[]
  foreshadowings: ForeshadowingSnapshot[]
  recentChapters: ChapterSnapshot[]
  worldSettings: WorldSettingSnapshot[]
  volumeOutlines: string[]
  avoidItems: string[]  // 作品级避免项
}

export interface CharacterSnapshot {
  name: string
  category?: string
  status?: string
  location?: string
  mood?: string
  goal?: string
  lastAppearedChapter?: number
}

export interface ForeshadowingSnapshot {
  id: string
  name: string
  status: string
  plantedChapter: number
  expectedChapter?: number
  secret?: string
  silenceChapters: number
}

export interface ChapterSnapshot {
  chapterNumber: number
  title: string
  summary: string
  mood?: string
  chapterType?: string
  endingLine?: string
}

export interface WorldSettingSnapshot {
  name: string
  category?: string
  description: string
}

export interface CompiledContext {
  systemContext: string
  tokenUsage: {
    estimated: number
    budget: number
    truncated: boolean
  }
}

// ============================================================
// 关键词提取 — 对标 inkos extractQueryTerms
// ============================================================

const STOP_WORDS = new Set([
  '本章', '继续', '推进', '优先', '围绕', '聚焦', '保持', '本章重点',
  'bring', 'focus', 'chapter', 'keep', 'must', 'avoid', 'without',
  'current', 'state', 'advance', 'conflict', 'story', 'local',
])

function extractKeywords(outline: ChapterOutlineStructured): string[] {
  const source = [
    outline.coreCoolPoint,
    outline.underlyingGame,
    outline.chapterGains,
    outline.act3_keyBreakthrough,
    outline.characters,
  ].filter(Boolean).join(' ')

  const chinese = (source.match(/[\u4e00-\u9fff]{2,4}/g) || [])
    .filter((t) => !STOP_WORDS.has(t))
    .slice(0, 8)

  const english = (source.match(/[a-z]{4,}/gi) || [])
    .filter((t) => !STOP_WORDS.has(t.toLowerCase()))
    .slice(0, 4)

  return [...new Set([...chinese, ...english])]
}

function scoreByKeywords(text: string, keywords: string[]): number {
  return keywords.reduce((score, kw) => score + (text.includes(kw) ? kw.length : 0), 0)
}

// ============================================================
// 选择器 — 对标 inkos selectRelevant*
// ============================================================

function selectRelevantCharacters(
  characters: CharacterSnapshot[],
  keywords: string[],
  currentChapter: number,
): CharacterSnapshot[] {
  const scored = characters
    .filter((c) => c.lastAppearedChapter == null || currentChapter - c.lastAppearedChapter <= 20)
    .map((c) => ({
      char: c,
      score: scoreByKeywords(
        [c.name, c.location || '', c.goal || '', c.status || '', c.category || ''].join(' '),
        keywords,
      ),
    }))

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const recent = scored.sort(
    (a, b) => (b.char.lastAppearedChapter || 0) - (a.char.lastAppearedChapter || 0),
  )

  const selected = new Set<CharacterSnapshot>()
  for (const { char } of [...matched, ...recent]) {
    if (selected.size >= 5) break
    selected.add(char)
  }
  return [...selected]
}

function selectRelevantHooks(
  hooks: ForeshadowingSnapshot[],
  keywords: string[],
): ForeshadowingSnapshot[] {
  const active = hooks.filter((h) => h.status !== 'resolved' && h.status !== '已回收')
  const scored = active.map((h) => ({
    hook: h,
    score: scoreByKeywords([h.name, h.secret || ''].join(' '), keywords),
    silence: h.silenceChapters,
  }))

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  const stale = scored
    .filter((s) => !matched.includes(s))
    .filter((s) => s.silence >= 8)
    .sort((a, b) => b.silence - a.silence)

  const selected = new Set<ForeshadowingSnapshot>()
  for (const { hook } of [...matched, ...stale]) {
    if (selected.size >= 6) break
    selected.add(hook)
  }
  return [...selected]
}

// ============================================================
// Phase 信息构建
// ============================================================

function buildPhaseInfo(outline: ChapterOutlineStructured): string {
  const parts: string[] = [`Phase 对齐：${outline.phaseAlignment}`]
  if (outline.progressCheck) parts.push(`进度自检：${outline.progressCheck}`)
  return parts.join('\n')
}

// ============================================================
// 主编译函数
// ============================================================

export function compileChapterContext(params: {
  chapterOutline: ChapterOutlineStructured
  novelState: NovelState
  modelContextLength?: number
  modelMaxOutputTokens?: number
  systemPrompt: string
  extraContext?: string
}): CompiledContext {
  const {
    chapterOutline,
    novelState,
    modelContextLength = 65536,
    modelMaxOutputTokens = 4096,
    systemPrompt,
    extraContext,
  } = params

  const keywords = extractKeywords(chapterOutline)
  const { currentChapter } = novelState

  const relevantChars = selectRelevantCharacters(novelState.characters, keywords, currentChapter)
  const relevantHooks = selectRelevantHooks(novelState.foreshadowings, keywords)
  const recentChapters = novelState.recentChapters.slice(-5)

  const phaseInfo = buildPhaseInfo(chapterOutline)

  // 组装上下文 — 分块构建，通过 enforceContextBudget 控制每块体积
  const blocks: ContextBlock[] = []

  // 作品基础信息
  let workInfo = `【作品信息】\n`
  workInfo += `书名：${novelState.title}\n`
  workInfo += `类型：${novelState.genre} | 文风：${novelState.style}\n`
  if (novelState.summary) workInfo += `简介：${novelState.summary}\n`
  workInfo += `目标字数：${novelState.targetWordCount} | 每章：${novelState.wordsPerChapter}字\n`
  workInfo += `当前写作位置：第 ${currentChapter} 章`
  blocks.push({ type: 'global_outline', label: '作品信息', content: workInfo })

  // Phase 位置
  blocks.push({ type: 'chapter_outline', label: 'Phase位置', content: `【Phase 位置】\n${phaseInfo}` })

  // 本章目标
  let chapterGoal = `【本章目标】\n`
  chapterGoal += `标题：${chapterOutline.chapterTitle}\n`
  chapterGoal += `类型：${chapterOutline.chapterType}\n`
  chapterGoal += `场景：${chapterOutline.coreScene}\n`
  chapterGoal += `时间：${chapterOutline.timeSpan}\n`
  chapterGoal += `核心爽点：${chapterOutline.coreCoolPoint}\n`
  chapterGoal += `底层博弈：${chapterOutline.underlyingGame}\n`
  chapterGoal += `字数限制：${chapterOutline.wordLimit}字`
  blocks.push({ type: 'chapter_outline', label: '本章目标', content: chapterGoal })

  // 出场角色
  if (relevantChars.length > 0) {
    let charBlock = `【本章相关角色】\n`
    for (const c of relevantChars) {
      const parts = [`- ${c.name}`]
      if (c.location) parts.push(`位置:${c.location}`)
      if (c.mood) parts.push(`情绪:${c.mood}`)
      if (c.goal) parts.push(`目标:${c.goal}`)
      if (c.lastAppearedChapter != null) parts.push(`上次出场:第${c.lastAppearedChapter}章`)
      charBlock += parts.join(' | ') + '\n'
    }
    blocks.push({ type: 'character_matrix', label: '相关角色', content: charBlock })
  }

  // 待推进伏笔
  if (relevantHooks.length > 0) {
    let hookBlock = `【待推进伏笔】\n`
    for (const h of relevantHooks) {
      const icon = h.silenceChapters >= 10 ? '🔴' : h.silenceChapters >= 5 ? '🟡' : '🟢'
      hookBlock += `${icon} ${h.name}（静默${h.silenceChapters}章）`
      if (h.secret) hookBlock += ` → ${h.secret}`
      hookBlock += '\n'
    }
    blocks.push({ type: 'foreshadow_ledger', label: '待推进伏笔', content: hookBlock })
  }

  // 最近章节回顾
  if (recentChapters.length > 0) {
    let recentBlock = `【最近章节回顾】\n`
    for (const ch of recentChapters) {
      recentBlock += `第${ch.chapterNumber}章 ${ch.title}: ${ch.summary.slice(0, 200)}\n`
      if (ch.endingLine) recentBlock += `  结尾: ${ch.endingLine}\n`
    }
    blocks.push({ type: 'recent_chapters', label: '最近章节', content: recentBlock })
  }

  // 起承转合
  let plotRef = `【剧情推演参考】\n`
  plotRef += `起: ${chapterOutline.act1_entryAndCrisis}\n`
  plotRef += `承: ${chapterOutline.act2_conflictEscalation}\n`
  plotRef += `转: ${chapterOutline.act3_keyBreakthrough}\n`
  plotRef += `合: ${chapterOutline.act4_aftermathAndCost}\n`
  plotRef += `钩子（${chapterOutline.hookType}）: ${chapterOutline.goldenHook}`
  blocks.push({ type: 'chapter_outline', label: '剧情推演', content: plotRef })

  // 避免项
  if (novelState.avoidItems.length > 0) {
    blocks.push({
      type: 'style_guide',
      label: '避免项',
      content: `【本书避免项】\n${novelState.avoidItems.map((a) => `- ${a}`).join('\n')}`,
    })
  }

  // 用户补充上下文
  if (extraContext) {
    blocks.push({ type: 'custom', label: '补充要求', content: `【补充要求】\n${extraContext}` })
  }

  // 应用上下文块硬上限裁剪
  const budgeted = enforceContextBudget(blocks)
  let context = budgeted.blocks.map(b => b.content).join('\n\n')

  // Token 预算检查
  const budget = calculateBudget({
    contextLength: modelContextLength,
    maxOutputTokens: modelMaxOutputTokens,
    systemPrompt,
    context,
  })

  let wasTruncated = false
  if (budget.needsTruncation) {
    const { truncated } = truncateHeadTail(context, budget.availableForContext, '章节编译上下文')
    context = truncated
    wasTruncated = true
  }

  return {
    systemContext: context,
    tokenUsage: {
      estimated: budget.currentContextTokens,
      budget: budget.availableForContext,
      truncated: wasTruncated,
    },
  }
}

// ============================================================
// 从 workStore 提取 NovelState
// ============================================================

function extractEndingLine(content: string): string | undefined {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'))
  const last = lines[lines.length - 1]
  return last && last.length > 60 ? last.slice(0, 57) + '...' : last
}

export function extractNovelState(workStore: any, outlines?: Map<string, string>): NovelState {
  const w = workStore?.currentWork
  const settings = workStore?.workspaceSettings

  const characters: CharacterSnapshot[] = (w?.characters || []).map((c: any) => ({
    name: c.name || '',
    category: c.structuredData?.category || c.category,
    status: c.state?.status || c.structuredData?.state?.status || 'alive',
    location: c.state?.location || c.structuredData?.location,
    mood: c.state?.mood,
    goal: c.state?.goal,
    lastAppearedChapter: c.lastAppearedChapter || c.structuredData?.lastAppearedChapter,
  }))

  const nextChapter = (((): number => {
    const allChapters: any[] = []
    for (const chs of Object.values(w?.chapterMap || {}) as any[]) {
      allChapters.push(...(chs as any[]))
    }
    return allChapters.length + 1
  })())

  const foreshadowings: ForeshadowingSnapshot[] = (w?.foreshadowings || []).map(
    (f: any, i: number) => ({
      id: f.id || `hook-${i}`,
      name: f.name || '',
      status: f.status || 'open',
      plantedChapter: f.structuredData?.plantedChapter || f.plantedChapter || 1,
      expectedChapter: f.structuredData?.expectedChapter,
      secret: f.structuredData?.secret || f.secret,
      silenceChapters: nextChapter - (f.lastPushedChapter || f.plantedChapter || 1),
    }),
  )

  const allChapters: any[] = []
  for (const chs of Object.values(w?.chapterMap || {}) as any[]) {
    allChapters.push(...(chs as any[]))
  }
  allChapters.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))

  const recentChapters: ChapterSnapshot[] = allChapters
    .slice(0, 5)
    .map((c: any) => ({
      chapterNumber: (c.sort_order || 0) + 1,
      title: c.title || '',
      summary: (c.content || '').slice(0, 300),
      mood: c.mood || c.structuredData?.mood,
      chapterType: c.chapterType || c.structuredData?.chapterType,
      endingLine: extractEndingLine(c.content || ''),
    }))
    .reverse()

  const worldSettings: WorldSettingSnapshot[] = (w?.worldSettings || []).map((ws: any) => ({
    name: ws.name || '',
    category: ws.structuredData?.category,
    description: ws.raw_text || ws.desc || '',
  }))

  const volumeOutlines: string[] = []
  if (outlines) {
    for (const [key, content] of outlines) {
      if (key.startsWith('volume_')) volumeOutlines.push(content)
    }
  }

  const avoidItems: string[] =
    settings?.avoidItems || settings?.tabooItems || settings?.avoid || []

  return {
    title: w?.title || '',
    genre: settings?.genre || '',
    style: settings?.style || '',
    summary: settings?.summary || '',
    targetWordCount: settings?.targetWordCount || 1000000,
    wordsPerChapter: settings?.wordsPerChapter || 2500,
    currentChapter: nextChapter,
    characters,
    foreshadowings,
    recentChapters,
    worldSettings,
    volumeOutlines,
    avoidItems: Array.isArray(avoidItems) ? avoidItems : [],
  }
}
