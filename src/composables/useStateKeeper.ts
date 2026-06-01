/**
 * State Keeper — 从章节正文中自动提取角色长期状态
 * 每次设定更新覆盖以下字段：状态/重要度/身体状态/心理结构/性格/技能/物品/人际关系
 * 支持版本历史与回滚
 */

export interface ExtractedState {
  location: string                // 在场 / 失踪 / 死亡
  importance: number | null       // 重要度 Rank
  longTermEffects: string         // 身体状态
  tendencies: string              // 心理结构 / 立场
  behaviorPatterns: string        // 性格 / 行为模式
  abilities: string[]             // 技能 / 能力
  items: string                   // 关键物品
  relationships: string           // 人际关系
}

export interface StateKeeperVersion {
  version: number
  timestamp: string
  source: 'manual' | 'auto_update'
  range: string
  entityId: string
  /** G7: snapshot 改为泛型，不限定 ExtractedState */
  snapshot: Record<string, unknown>
}

const LS_PREFIX = 'ns:statekeeper:'

/** 从正文中提取角色状态 */
export function extractCharacterState(
  characterName: string,
  chapterContents: { chapterNo: number; title: string; content: string }[],
  /** G9: 已知角色名列表，用于人际关系提取。不传则回退到通用中文名匹配。 */
  characterNames?: string[],
): ExtractedState {
  const allText = chapterContents.map(c => c.content).join('\n')

  // 状态检测
  const deadPatterns = ['死了', '去世', '牺牲', '殒命', '陨落', '尸体', '遗骸', '不复存在']
  const missingPatterns = ['失踪', '消失', '下落不明', '杳无音信', '不知去向', '再也找不到']
  const alivePatterns = ['在场', '活着', '出现', '现身', '归来', '回来', '回归']

  let location = '在场'
  for (const p of deadPatterns) {
    if (allText.includes(characterName + p) || allText.includes(p + characterName)) {
      location = '死亡'; break
    }
  }
  if (location === '在场') {
    for (const p of missingPatterns) {
      if (allText.includes(characterName + p) || allText.includes(p + characterName)) {
        location = '失踪'; break
      }
    }
  }

  // 重要度 Rank — 基于出场频次和关键词
  const mentions = (allText.match(new RegExp(characterName, 'g')) || []).length
  const chaptersAppeared = chapterContents.filter(c => c.content.includes(characterName)).length
  const importance = Math.max(1, Math.min(10, Math.round(mentions / 5 + chaptersAppeared)))

  // 关键词邻近检测：仅在角色名附近 200 字符内出现的关键词才计入
  const windowSize = 200
  function nearCharacter(kw: string): boolean {
    let pos = 0
    while ((pos = allText.indexOf(characterName, pos)) !== -1) {
      const segment = allText.slice(pos, pos + characterName.length + windowSize)
      if (segment.includes(kw)) return true
      pos += characterName.length
    }
    return false
  }

  // 身体状态提取
  const bodyKeywords = ['受伤', '重伤', '残疾', '疤痕', '烧伤', '中毒', '虚弱', '昏迷', '失忆',
    '断臂', '断腿', '眼盲', '失明', '聋', '哑', '诅咒', '封印', '病', '痛', '苍老', '衰老']
  const bodyParts = bodyKeywords.filter(kw => nearCharacter(kw))
  const longTermEffects = bodyParts.length ? bodyParts.join('；') : ''

  // 心理结构 / 立场提取
  const psychKeywords = ['复仇', '守护', '追求', '拯救', '逃避', '抗争', '隐忍', '疯狂',
    '坚定', '动摇', '绝望', '希望', '冷漠', '温柔', '残暴', '善良', '阴暗']
  const psychParts = psychKeywords.filter(kw => nearCharacter(kw))
  const tendencies = psychParts.length ? psychParts.join('；') : ''

  // 性格 / 行为模式提取
  const behaviorKeywords = ['冲动', '谨慎', '果断', '犹豫', '强势', '温和', '孤僻', '开朗',
    '多疑', '信任', '自私', '无私', '怯懦', '勇敢', '傲慢', '谦逊']
  const behaviorParts = behaviorKeywords.filter(kw => nearCharacter(kw))
  const behaviorPatterns = behaviorParts.length ? behaviorParts.join('；') : ''

  // 能力/技能提取
  const skillPatterns = /(?:会|掌握|修炼|使用|施展|发动|觉醒|拥有)[^。，,\n]{2,20}(?:术|法|功|技|力|诀|剑|刀|拳|掌|指|步|遁|化|变|破|斩|杀|治|控|御)/g
  const skillMatches = allText.match(skillPatterns) || []
  const abilities = [...new Set(skillMatches)].slice(0, 10)

  // 关键物品提取
  const itemPatterns = /(?:持有|拿着|佩戴|使用|祭出|取出|掏出|亮出|掌握着|拥有)[^。，,\n]{2,15}(?:剑|刀|枪|棍|弓|鞭|环|珠|鼎|炉|印|符|玉|石|丹|药|书|卷|甲|袍|戒)/g
  const itemMatches = allText.match(itemPatterns) || []
  const items = [...new Set(itemMatches)].slice(0, 5).join('；')

  // G9: 人际关系提取 — 优先用传入的角色名列表，兜底通用中文名匹配
  const knownNames = (characterNames && characterNames.length > 0)
    ? characterNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : ''
  const nameAlt = knownNames
    ? `(?:${knownNames}|[A-Z一-龥]{2,4})`
    : `[A-Z一-龥]{2,4}`
  const connector = '(?:与|和|对|向|跟|帮|救|杀|打|追|问|告诉|说|叫|找)'
  const namePattern = new RegExp(`${nameAlt}${connector}${nameAlt}`, 'g')
  const relMatches = allText.match(namePattern) || []
  const relationships = [...new Set(relMatches)].slice(0, 10).join('；')

  return {
    location, importance: isNaN(importance) ? null : importance,
    longTermEffects, tendencies, behaviorPatterns,
    abilities, items, relationships,
  }
}

/** 版本管理 */
export class StateKeeperVersionManager {
  private versions: StateKeeperVersion[] = []

  constructor(private entityId: string) {
    this.load()
  }

  private key() { return LS_PREFIX + this.entityId }

  load() {
    try {
      const raw = localStorage.getItem(this.key())
      if (raw) this.versions = JSON.parse(raw)
    } catch {}
  }

  save() {
    try { localStorage.setItem(this.key(), JSON.stringify(this.versions)) } catch {}
  }

  latest(): StateKeeperVersion | null {
    return this.versions[0] || null
  }

  list(): StateKeeperVersion[] {
    return [...this.versions]
  }

  // G7: snapshot 接受任意对象，内部 shallow copy
  push(snapshot: object, source: 'manual' | 'auto_update', range: string) {
    const version = (this.versions[0]?.version || 0) + 1
    this.versions.unshift({
      version, source, range, entityId: this.entityId,
      timestamp: new Date().toISOString(),
      snapshot: { ...snapshot },
    })
    // 仅保留最近 20 条
    if (this.versions.length > 20) this.versions = this.versions.slice(0, 20)
    this.save()
    return version
  }

  rollback(targetVersion: number): Record<string, unknown> | null {
    const v = this.versions.find(x => x.version === targetVersion)
    if (!v) return null
    // 回滚创建一个新版本
    this.push(v.snapshot, 'manual', `回滚到 v${targetVersion}`)
    return v.snapshot
  }

  clear() {
    this.versions = []
    this.save()
  }
}
