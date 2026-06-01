/**
 * D1: 上下文 Resolver
 * expandPrompt 把模板中的 @变量 替换为实际数据
 */

import { getPlatformProfile } from './usePlatformData'

export interface ResolverCtx {
  workStore: () => any          // 惰性取值，避免循环依赖
  settingsManager: () => any
  workspaceSettings: () => any
  /** 预加载的大纲数据：key = "main" | "volume_123" | "chapter_456" */
  outlines?: Map<string, string>
}

export class UnknownVariable extends Error {
  constructor(public key: string) {
    super(`未知变量: ${key}`)
  }
}

type Resolver = (ctx: ResolverCtx, param?: string) => string

// ── 解析器注册表 ──

const registry = new Map<string, Resolver>()

function register(key: string, resolver: Resolver) {
  registry.set(key, resolver)
}

// ── 基础信息 ──

register('@基础信息', (ctx) => {
  const s = ctx.workspaceSettings()
  const ws = ctx.workStore()
  const w = ws?.currentWork
  const parts: string[] = []
  if (w?.title) parts.push(`书名：${w.title}`)
  if (s?.genre) parts.push(`类型：${s.genre}`)
  if (s?.style) parts.push(`文风：${s.style}`)
  if (s?.summary) parts.push(`作品简介：${s.summary}`)
  if (s?.targetWordCount && s.targetWordCount > 0) parts.push(`目标字数：${s.targetWordCount}（${Math.round(s.targetWordCount / 10000)}万字）`)
  return parts.join('\n') || '(基础信息未填写)'
})

register('@书名', (ctx) => {
  const ws = ctx.workStore()
  return ws?.currentWork?.title || '(未命名作品)'
})

register('@类型', (ctx) => {
  const s = ctx.workspaceSettings()
  return s?.genre || '(未设置)'
})

register('@标签', (ctx) => {
  const s = ctx.workspaceSettings()
  return s?.tags?.join(', ') || '(无标签)'
})

register('@文风', (ctx) => {
  const s = ctx.workspaceSettings()
  return s?.style || '(未设置)'
})

register('@作品简介', (ctx) => {
  const s = ctx.workspaceSettings()
  return s?.summary || '(未填写)'
})

register('@故事视角', (ctx) => {
  const s = ctx.workspaceSettings()
  return s?.perspective || '(未设置)'
})

register('@发布平台', (ctx) => {
  const ws = ctx.workspaceSettings()
  const platformId = ws?.data?.platformId || ws?.platformId
  if (platformId) return getPlatformProfile(platformId)
  return '(未选择发布平台)'
})

register('@目标字数', (ctx) => {
  const s = ctx.workspaceSettings()
  const v = s?.targetWordCount
  return String(v != null && v > 0 ? v : '1000000')
})

register('@每章目标字数', (ctx) => {
  const s = ctx.workspaceSettings()
  const v = s?.wordsPerChapter
  return String(v != null && v > 0 ? v : '2000')
})

register('@每卷章节数', (ctx) => {
  const s = ctx.workspaceSettings()
  const v = s?.chaptersPerVolume
  return String(v != null && v > 0 ? v : '50')
})

// ── 核心构架 ──

register('@核心构架', (ctx) => {
  const ws = ctx.workspaceSettings()
  const sm = ctx.settingsManager()
  const parts: string[] = []

  // 从 WorkspaceSettings 读取 6 大核心要素
  if (ws) {
    const d = ws.data || ws
    if (d.cheatAbility) parts.push('## 金手指/特殊能力\n' + d.cheatAbility)
    if (d.mainCharacter) parts.push('## 主角设定\n' + d.mainCharacter)
    if (d.powerSystem) parts.push('## 力量体系\n' + d.powerSystem)
    if (d.styleDescription) parts.push('## 写作风格\n' + d.styleDescription)
    if (d.intro) parts.push('## 作品简介\n' + d.intro)
    if (d.pov) parts.push('## 叙事视角\n' + d.pov)
  }

  // 此外也注入世界观设定条目
  if (sm) {
    const worlds = sm.listByType('world_setting')
    if (worlds.length) parts.push('## 世界观条目\n' + worlds.map((w: any) => formatWorldSetting(w)).join('\n'))
  }

  return parts.join('\n\n') || '(核心构架未填写 — 请先在设定面板的「核心」标签页中填写六大核心要素)'
})

register('@世界观', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const worlds = sm.listByType('world_setting')
  return worlds.map((w: any) => formatWorldSetting(w)).join('\n') || '(无)'
})

register('@金手指', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const items = sm.listByType('item')
  // B11 fix: ItemData 使用 properties 字段而非 tags；同时兜底 name/summary 包含"金手指"
  const cheat = items.find((i: any) =>
    i.structuredData?.properties?.includes('金手指') ||
    i.name?.includes('金手指') ||
    i.summary?.includes('金手指')
  )
  return cheat ? `${cheat.name}: ${cheat.summary || cheat.structuredData?.function || ''}` : '(无)'
})

register('@力量体系', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const worlds = sm.listByType('world_setting')
  // 通过 structuredData.category 或 name 匹配
  const powerSystem = worlds.find((w: any) =>
    w.structuredData?.category === '力量体系' ||
    w.name?.includes('力量') || w.name?.includes('等级') || w.name?.includes('修炼')
  )
  return powerSystem?.summary || powerSystem?.structuredData?.description || '(未填写)'
})

register('@主角', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const chars = sm.listByType('character')
  // B12 fix: SettingEntity 无 isProtagonist/tags 顶层字段，
  // 主角标识在 structuredData.category 或 structuredData.characterTags 中
  const protag = chars.find((c: any) =>
    c.structuredData?.category === '主角' ||
    c.structuredData?.characterTags?.includes('主角')
  )
  return protag ? formatCharacter(protag) : '(未设置主角)'
})

// ── 设定与角色 ──

register('@设定数据', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const chars = sm.listByType('character')
  const worlds = sm.listByType('world_setting')
  const fores = sm.listByType('foreshadowing')
  const items = sm.listByType('item')
  const arcs = sm.listByType('plot_arc')
  const parts: string[] = []
  if (chars.length) parts.push('## 角色\n' + chars.map((c: any) => formatCharacter(c)).join('\n\n'))
  if (worlds.length) parts.push('## 世界观条目\n' + worlds.map((w: any) => formatWorldSetting(w)).join('\n'))
  if (items.length) parts.push('## 物品\n' + items.map((i: any) => `- ${i.name}: ${i.raw_text || (i.structuredData?.function || '')}`).join('\n'))
  if (fores.length) parts.push('## 伏笔\n' + fores.map((f: any) => formatForeshadowing(f)).join('\n'))
  if (arcs.length) {
    const arcTypeLabel: Record<string, string> = { main: '主线', sub: '支线', side: '暗线' }
    const arcStatusLabel: Record<string, string> = { planned: '待开始', in_progress: '进行中', completed: '已完成' }
    parts.push('## 情节线\n' + arcs.map((a: any) => {
      const sd = a.structuredData || {}
      return `- ${a.name}【${arcTypeLabel[sd.arcType] || sd.arcType || '未分类'}·${arcStatusLabel[sd.status] || sd.status || '未知'}】${sd.description || a.summary || ''}`
    }).join('\n'))
  }
  return parts.join('\n\n') || '(设定数据为空)'
})

register('@当前设定数据', (ctx) => {
  // 渐进式披露：返回角色+世界观+物品，伏笔只返回已揭示的
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const parts: string[] = []
  const chars = sm.listByType('character')
  if (chars.length) parts.push('## 角色\n' + chars.map((c: any) => formatCharacter(c)).join('\n\n'))
  const worlds = sm.listByType('world_setting')
  if (worlds.length) parts.push('## 世界观\n' + worlds.map((w: any) => formatWorldSetting(w)).join('\n'))
  const items = sm.listByType('item')
  if (items.length) parts.push('## 物品\n' + items.map((i: any) => `- ${i.name}: ${i.structuredData?.function || i.summary || ''}`).join('\n'))
  // 伏笔只返回未揭示的（渐进式披露）
  const fores = sm.listByType('foreshadowing').filter((f: any) => !f.structuredData?.resolved)
  if (fores.length) parts.push('## 待揭示伏笔\n' + fores.map((f: any) => formatForeshadowing(f)).join('\n'))
  return parts.join('\n\n') || '(设定数据为空)'
})

// ── 生态人物树 & 伏笔表 ──

register('@角色表', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无角色数据)'
  const chars = sm.listByType('character')
  if (!chars.length) return '(尚无角色数据)'

  const header = '| 姓名 | 分类 | 身份 | 登场卷号 | 结局 | 性格 | 核心创伤 | 源动力 | 成长弧 |'
  const sep = '|------|------|------|----------|------|------|----------|--------|--------|'
  const rows = chars.map((c: any) => {
    const sd = c.structuredData || {}
    const name = c.name
    const category = sd.category || '配角'
    const identity = sd.identity || '-'
    const volume = sd.volume || '-'
    const ending = sd.ending || '-'
    const personality = (sd.personality || '').slice(0, 24) || '-'
    const trauma = (sd.coreTrauma || '').slice(0, 16) || '-'
    const motivation = (sd.motivation || '').slice(0, 16) || '-'
    const growth = (sd.growthArc || '').slice(0, 24) || '-'
    return `| ${name} | ${category} | ${identity} | ${volume} | ${ending} | ${personality} | ${trauma} | ${motivation} | ${growth} |`
  })
  return [header, sep, ...rows].join('\n')
})

register('@伏笔表', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无伏笔数据)'
  const fores = sm.listByType('foreshadowing')
  if (!fores.length) return '(暂无伏笔)'

  const header = '| 伏笔名称 | 秘密内容 | 埋设章节 | 预期揭示 | 状态 | 标签 |'
  const sep = '|----------|----------|----------|----------|------|------|'
  const rows = fores.map((f: any) => {
    const sd = f.structuredData || {}
    const name = f.name
    const secret = (sd.secret || f.summary || '').slice(0, 40) || '-'
    const planted = sd.plantedChapter || '-'
    const expected = sd.expectedChapter || '-'
    const status = sd.resolved ? '✅已揭示' : '⏳待揭示'
    const tags = Array.isArray(sd.tags) ? sd.tags.join('、') : (sd.tags || '-')
    return `| ${name} | ${secret} | ${planted} | ${expected} | ${status} | ${tags} |`
  })
  return [header, sep, ...rows].join('\n')
})

register('@所有角色', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  return sm.listByType('character').map((c: any) => `- ${c.name}`).join('\n') || '(无)'
})

register('@角色列表', (ctx) => resolveVariable('@所有角色', ctx))

register('@选择角色', (_ctx) => '(请在 @引用面板中手动选择角色)')

register('@补充信息', (ctx) => {
  // 从 workspaceSettings 读取用户补充要求（如有的话）
  const ws = ctx.workspaceSettings()
  const d = ws?.data || ws
  if (d?.extra) return d.extra
  return '(无补充信息)'
})

register('@补充要求', (ctx) => {
  const ws = ctx.workspaceSettings()
  const d = ws?.data || ws
  if (d?.extra) return d.extra
  return '(无补充要求)'
})

// ── 大纲结构 ──

register('@总纲', (ctx) => {
  return ctx.outlines?.get('main') || '(总纲尚未生成，请先到「大纲设定」面板生成总纲)'
})

register('@卷纲', (ctx) => {
  const parts: string[] = []
  if (ctx.outlines) {
    for (const [k, v] of ctx.outlines) {
      if (k.startsWith('volume_')) parts.push(`【${k.replace('volume_', '卷ID:')}】\n${v}`)
    }
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : '(卷纲尚未生成)'
})

register('@当前卷纲', (ctx) => {
  const store = ctx.workStore()
  const vid = store?.currentVolumeId || store?.volumes?.[0]?.id
  if (vid && ctx.outlines) {
    const content = ctx.outlines.get(`volume_${vid}`)
    if (content) return content
  }
  return '(当前卷纲未找到，请先在「大纲设定」面板中选中一个卷)'
})

register('@章纲', (ctx) => {
  const parts: string[] = []
  if (ctx.outlines) {
    for (const [k, v] of ctx.outlines) {
      if (k.startsWith('chapter_')) parts.push(`【${k.replace('chapter_', '章ID:')}】\n${v}`)
    }
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : '(章纲尚未生成)'
})

register('@当前章纲', (ctx) => {
  const store = ctx.workStore()
  const chId = store?.currentChapterId
  if (chId && ctx.outlines) {
    const content = ctx.outlines.get(`chapter_${chId}`)
    if (content) return content
  }
  return '(当前章纲未找到，请先在「大纲设定」面板中选中一个章)'
})

register('@选择卷纲', (ctx) => resolveVariable('@当前卷纲', ctx))
register('@选择章纲', (ctx) => resolveVariable('@当前章纲', ctx))
register('@章纲范围', (ctx) => resolveVariable('@章纲', ctx))

register('@前25章细纲', (ctx) => {
  const parts: string[] = []
  if (ctx.outlines) {
    let count = 0
    for (const [k, v] of ctx.outlines) {
      if (k.startsWith('chapter_') && count < 25) {
        parts.push(v.slice(0, 500))
        count++
      }
    }
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : '(章纲尚未生成)'
})

register('@前N章章纲', (ctx, param) => {
  const n = parseInt(param || '3') || 3
  const parts: string[] = []
  if (ctx.outlines) {
    let count = 0
    for (const [k, v] of ctx.outlines) {
      if (k.startsWith('chapter_') && count < n) {
        parts.push(v.slice(0, 500))
        count++
      }
    }
  }
  return parts.length > 0 ? parts.join('\n\n---\n\n') : '(章纲尚未生成)'
})

register('@自然衔接提醒', (ctx) => {
  const parts: string[] = []
  if (ctx.outlines) {
    const chs: { id: string; content: string }[] = []
    for (const [k, v] of ctx.outlines) {
      if (k.startsWith('chapter_')) chs.push({ id: k.replace('chapter_', ''), content: v })
    }
    if (chs.length >= 2) {
      const last = chs[chs.length - 2]
      const curr = chs[chs.length - 1]
      parts.push(`前一章（ID:${last.id}）概要：${last.content.slice(0, 300)}`)
      parts.push(`当前章（ID:${curr.id}）概要：${curr.content.slice(0, 300)}`)
      parts.push('请在续写时注意：保持时间线连续、人物状态一致、情绪和冲突线衔接到位。')
    }
  }
  return parts.length > 0 ? parts.join('\n') : '(章节数据不足，无法生成衔接提醒)'
})

register('@前文章纲', (ctx) => {
  const store = ctx.workStore()
  const currentChId = store?.currentChapterId
  if (!currentChId || !ctx.outlines) return '(无法确定前文章纲：缺少当前章节信息)'

  const chIds: string[] = []
  for (const [k] of ctx.outlines) {
    if (k.startsWith('chapter_')) {
      chIds.push(k.replace('chapter_', ''))
    }
  }
  chIds.sort((a, b) => Number(a) - Number(b))

  const idx = chIds.indexOf(String(currentChId))
  if (idx <= 0) return '(无前文章纲：当前为第一个有章纲的章节)'

  return ctx.outlines.get(`chapter_${chIds[idx - 1]}`) || '(前文章纲为空)'
})

register('@角色状态快照', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const chars = sm.listByType('character')
  if (!chars.length) return '(尚无角色数据)'
  return chars.map((c: any) => formatCharacter(c)).join('\n') || '(角色数据为空)'
})

register('@伏笔状态', (ctx) => {
  const sm = ctx.settingsManager()
  if (!sm) return '(无)'
  const fores = sm.listByType('foreshadowing')
  if (!fores.length) return '(暂无伏笔)'

  const total = fores.length
  const recovered = fores.filter((f: any) => {
    return f.structuredData?.resolved === true
  }).length

  const parts: string[] = [`共 ${total} 条伏笔，已回收 ${recovered} 条，待推进 ${total - recovered} 条。`]
  for (const f of fores) {
    parts.push(formatForeshadowing(f))
  }
  return parts.join('\n')
})

// ── 正文上下文 ──

register('@章节标题', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const cid = ws.currentChapterId
  if (!cid) return '(未选中章节)'
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    const ch = (chs as any[]).find((c: any) => c.id === cid)
    if (ch) return ch.title || '(无标题)'
  }
  return '(未找到章节)'
})

register('@本章正文', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const cid = ws.currentChapterId
  if (!cid) return '(未选中章节)'
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    const ch = (chs as any[]).find((c: any) => c.id === cid)
    if (ch) return ch.content || '(章节无内容)'
  }
  return '(未找到章节)'
})

register('@当前正文', (ctx) => resolveVariable('@本章正文', ctx))

register('@前文', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const allChs: any[] = []
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    allChs.push(...(chs as any[]))
  }
  allChs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const cid = ws.currentChapterId
  const idx = allChs.findIndex((c: any) => c.id === cid)
  const prev = idx > 0 ? allChs[idx - 1] : null
  return prev ? `${prev.title}\n${(prev.content || '').slice(0, 3000)}` : '(无前文)'
})

register('@最近章节', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const allChs: any[] = []
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    allChs.push(...(chs as any[]))
  }
  allChs.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
  const last = allChs[0]
  return last ? `${last.title}\n${(last.content || '').slice(0, 2000)}` : '(无)'
})

register('@前3章正文', (ctx) => {
  return resolveRecentChapters(ctx, 3)
})

register('@前N章正文', (ctx, param) => {
  const n = param ? (parseInt(param) || 3) : 3
  return resolveRecentChapters(ctx, isNaN(n) ? 3 : n)
})

// ── 进度辅助 ──

register('@目前章数', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '0'
  let count = 0
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    count += (chs as any[]).length
  }
  return String(count)
})

register('@续写章数', (_ctx) => '(请在续写配置中设置)')

register('@续写章节数', (_ctx) => '(请在续写配置中设置)')

register('@当前卷数', (ctx) => {
  const ws = ctx.workStore()
  if (!ws) return '0'
  return String(ws.volumes?.length || 0)
})

register('@第N章正文', (ctx, param) => {
  const n = param ? parseInt(param) : 1
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const allChs: any[] = []
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    allChs.push(...(chs as any[]))
  }
  const ch = allChs.find((c: any) => (c.sort_order ?? 0) + 1 === n)
  return ch?.content || `(第${n}章无内容)`
})

register('@能力KPI', (_ctx) => '(用户可手动填写 KPI 目标：如点击率、收藏数、追读率等)')

register('@环境要素', (_ctx) => '(用户可手动填写环境要素：如天气、场景氛围、地理特征等)')

// ── 内部辅助 ──

function formatCharacter(c: any): string {
  const sd = c.structuredData || {}
  const parts = [`角色名：${c.name}`]
  if (sd.category) parts.push(`分类：${sd.category}`)
  if (c.nickname || sd.nickname) parts.push(`昵称：${c.nickname || sd.nickname}`)
  if (sd.gender) parts.push(`性别：${sd.gender}`)
  if (sd.age) parts.push(`年龄：${sd.age}`)
  if (sd.identity) parts.push(`身份：${sd.identity}`)
  if (sd.volume) parts.push(`登场卷号：${sd.volume}`)
  if (sd.ending) parts.push(`结局：${sd.ending}`)
  if (sd.personality) parts.push(`性格：${sd.personality}`)
  if (sd.coreTrauma) parts.push(`核心创伤：${sd.coreTrauma}`)
  if (sd.motivation) parts.push(`源动力：${sd.motivation}`)
  if (sd.growthArc) parts.push(`成长弧：${sd.growthArc}`)
  if (sd.appearance) parts.push(`外貌：${sd.appearance}`)
  if (sd.abilities?.length) parts.push(`能力：${(sd.abilities as string[]).join('、')}`)
  if (sd.relationships?.length) parts.push(`关系：${(sd.relationships as any[]).map((r: any) => `${r.name || '?'}(${r.relation || ''})`).join('、')}`)
  const tags = c.tags || sd.characterTags
  if (tags?.length) parts.push(`标签：${Array.isArray(tags) ? tags.join('、') : tags}`)
  if (typeof sd.alive === 'boolean') parts.push(`存活：${sd.alive ? '是' : '否'}`)
  if (c.raw_text || sd.raw_text) parts.push(`描述：${c.raw_text || sd.raw_text || ''}`)
  // 状态快照
  const state = c.state || sd.state
  const stateParts: string[] = []
  if (state?.status) stateParts.push(`状态：${state.status}`)
  if (state?.location || sd.location) stateParts.push(`位置：${state.location || sd.location}`)
  if (state?.mood) stateParts.push(`情绪：${state.mood}`)
  if (state?.goal) stateParts.push(`目标：${state.goal}`)
  if (stateParts.length) parts.push(stateParts.join(' / '))
  return parts.join(' | ')
}

function formatWorldSetting(w: any): string {
  const sd = w.structuredData || {}
  const parts = [`- ${w.name}`]
  if (sd.category) parts.push(`分类：${sd.category}`)
  if (sd.scope) parts.push(`范围：${sd.scope}`)
  if (sd.status) parts.push(`状态：${sd.status}`)
  const desc = w.raw_text || w.desc || sd.description || ''
  if (desc) parts.push(desc)
  return parts.join(' | ')
}

function formatForeshadowing(f: any): string {
  const sd = f.structuredData || {}
  const status = f.status || sd.status || '待推进'
  const icon = status.includes('回收') || status === 'resolved' ? '✅' : '⏳'
  const parts = [`${icon} [${status}] ${f.name}`]
  if (sd.plantedChapter) parts.push(`埋于：第${sd.plantedChapter}章`)
  if (sd.expectedChapter) parts.push(`预计回收：第${sd.expectedChapter}章`)
  if (sd.secret) parts.push(`秘密：${sd.secret}`)
  const desc = f.raw_text || f.summary || ''
  if (desc) parts.push(desc)
  return parts.join(' | ')
}

function resolveRecentChapters(ctx: ResolverCtx, n: number): string {
  const ws = ctx.workStore()
  if (!ws) return '(无)'
  const allChs: any[] = []
  for (const chs of Object.values(ws.chapterMap || {}) as any[]) {
    allChs.push(...(chs as any[]))
  }
  allChs.sort((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
  return allChs.slice(0, n).map((c: any) => `${c.title || ''}\n${(c.content || '').slice(0, 3000)}`).join('\n\n---\n\n') || '(无)'
}

// ── 对外 API ──

/** 展开单个变量 */
export function resolveVariable(key: string, ctx: ResolverCtx): string {
  // 支持 @前N章正文(N=5) 格式
  const match = key.match(/^(@[^(]+)(?:\(([^)]+)\))?$/)
  const varName = match ? match[1] : key
  const param = match?.[2] || undefined

  const resolver = registry.get(varName)
  if (!resolver) {
    throw new UnknownVariable(varName)
  }
  return resolver(ctx, param)
}

/** 展开模板中所有 @变量 */
export function expandPrompt(template: string, ctx: ResolverCtx): string {
  const unknown: string[] = []

  const result = template.replace(/@[^\s一-鿿，。！？、；：""''）】》)]*[一-鿿\w()]+/g, (match) => {
    try {
      return resolveVariable(match, ctx)
    } catch (e) {
      if (e instanceof UnknownVariable) {
        unknown.push(e.key)
        return `[${e.key}: 未知变量]`
      }
      return match // 其他错误保留原样
    }
  })

  if (unknown.length) {
    // 在末尾追加未知变量列表提示
    return result + '\n\n---\n⚠️ 以下变量未识别：' + unknown.join(', ')
  }

  return result
}
