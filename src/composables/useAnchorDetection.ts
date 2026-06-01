/**
 * 锚点机制 — 轻量级结构化记忆单元
 *
 * 6 类锚点：character / event / time / item / foreshadow / setting
 * 每章生成后提取新锚点、检测矛盾、更新设定
 * Token 节省核心：不读全文，只查相关锚点
 */

export type AnchorType = 'character' | 'event' | 'time' | 'item' | 'foreshadow' | 'setting'

export interface Anchor {
  id: string
  type: AnchorType
  name: string
  chapterNo: number
  summary: string
  entities: string[]
  structuredData: Record<string, unknown>
  version: number
  isNew?: boolean
}

export interface ChapterText {
  chapterNo: number
  content: string
  existingEntities: string[]
}

export interface ConflictResult {
  level: 'ERROR' | 'WARNING'
  type: string
  message: string
  entityName: string
}

// ── AnchorStore ──

export class AnchorStore {
  private anchors: Anchor[] = []
  private idCounter = 0

  add(anchor: Omit<Anchor, 'version' | 'id'> & { version?: number; id?: string }): Anchor {
    const a: Anchor = {
      ...anchor,
      version: anchor.version ?? 1,
      id: anchor.id || `anc_${++this.idCounter}`,
    }
    this.anchors.push(a)
    return a
  }

  update(id: string, patch: Partial<Pick<Anchor, 'chapterNo' | 'summary' | 'structuredData'>>) {
    const a = this.anchors.find(x => x.id === id)
    if (a) {
      a.version++
      if (patch.chapterNo !== undefined) a.chapterNo = patch.chapterNo
      if (patch.summary !== undefined) a.summary = patch.summary
      if (patch.structuredData) {
        a.structuredData = { ...a.structuredData, ...patch.structuredData }
      }
    }
  }

  getById(id: string): Anchor | undefined {
    return this.anchors.find(a => a.id === id)
  }

  getByEntity(name: string): Anchor[] {
    return this.anchors.filter(a => a.entities.includes(name))
  }

  getByType(type: AnchorType): Anchor[] {
    return this.anchors.filter(a => a.type === type)
  }

  getAll(): Anchor[] {
    return [...this.anchors].sort((a, b) => a.chapterNo - b.chapterNo)
  }

  getForeshadowStats(): { total: number; resolved: number; unresolved: number } {
    const fores = this.getByType('foreshadow')
    return {
      total: fores.length,
      resolved: fores.filter(f => f.structuredData.resolved === true).length,
      unresolved: fores.filter(f => f.structuredData.resolved !== true).length,
    }
  }

  clear() { this.anchors = []; this.idCounter = 0 }
}

// ── 锚点提取 (基于规则 + 简单 NER) ──

function extractNames(text: string, existingEntities: string[]): { name: string; isNew: boolean }[] {
  if (!text) return []

  // 规则 1: 从已有实体中检测出现
  const foundNames = new Map<string, boolean>()

  for (const entity of existingEntities) {
    if (text.includes(entity)) {
      foundNames.set(entity, false)
    }
  }

  // 规则 2: 简单中文名提取（基于常见姓氏 + 上下文）
  const commonSurnames = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公'
  const surnameSet = new Set(commonSurnames.split(''))

  // 用简单的方式：找"X说"、"X的"、"X和"等模式中的X，且X的第一个字是姓氏
  const nameMatchPattern = /([一-龥]{2,3})(?=说|问|告诉|道|的|和|与|对|从|在|把|被|给|去|来|到|出|上|下|走|跑|笑|哭|站|坐|拿|放|递|看|听|想|觉得|发现|突然|已经|之前|之后|当时|现在|那时|推开|走进|转头|冷冷|慢慢|突然|转身)/g

  let match
  while ((match = nameMatchPattern.exec(text)) !== null) {
    const name = match[1]
    const firstChar = name[0]
    if (surnameSet.has(firstChar) && !foundNames.has(name)) {
      foundNames.set(name, true)
    }
  }

  return Array.from(foundNames, ([name, isNew]) => ({ name, isNew }))
}

export function extractAnchors(text: ChapterText): Anchor[] {
  const names = extractNames(text.content, text.existingEntities)
  return names.map(({ name, isNew }) => ({
    id: `anc_${text.chapterNo}_${name}`,
    type: 'character' as AnchorType,
    name,
    chapterNo: text.chapterNo,
    summary: `${name}在第${text.chapterNo}章出现`,
    entities: [name],
    structuredData: { firstSeen: text.chapterNo },
    version: 1,
    isNew,
  }))
}

// ── 相关锚点检索 ──

export function findRelevantAnchors(store: AnchorStore, entityNames: string[]): Anchor[] {
  const seen = new Set<string>()
  const result: Anchor[] = []

  for (const name of entityNames) {
    const matches = store.getByEntity(name)
    for (const m of matches) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        result.push(m)
      }
    }
  }

  return result
}

// ── 锚点摘要生成 ──

export function buildAnchorSummary(anchors: Anchor[]): string {
  if (anchors.length === 0) return ''

  const lines: string[] = ['【当前故事设定摘要】']

  const chars = anchors.filter(a => a.type === 'character')
  const items = anchors.filter(a => a.type === 'item')
  const fores = anchors.filter(a => a.type === 'foreshadow')

  if (chars.length > 0) {
    lines.push('--- 角色 ---')
    for (const c of chars) {
      const sd = c.structuredData
      const alive = sd.alive !== false ? '存活' : '已死亡'
      const loc = sd.location || '未知'
      lines.push(`${c.name}：${c.summary}（${alive}，位置：${loc}）`)
    }
  }

  if (items.length > 0) {
    lines.push('--- 物品 ---')
    for (const i of items) {
      const sd = i.structuredData
      const owner = sd.owner || '未知'
      const destroyed = sd.destroyed ? '（已毁）' : ''
      lines.push(`${i.name}：${i.summary}${destroyed}（归属：${owner}）`)
    }
  }

  if (fores.length > 0) {
    lines.push('--- 伏笔 ---')
    for (const f of fores) {
      const sd = f.structuredData
      const resolved = sd.resolved ? '✅已回收' : '⏳未回收'
      lines.push(`${f.name}：${f.summary} ${resolved}`)
    }
  }

  return lines.join('\n')
}

// ── G8: 从章节正文中提取实体声明 ──

/**
 * 从章节正文中提取已知实体的当前状态声明（alive/location/destroyed/owner）
 * 用于与累积锚点做差异对比
 */
export function extractEntityMentions(
  content: string,
  knownEntities: { name: string; type: AnchorType }[],
): EntityMention[] {
  if (!content || knownEntities.length === 0) return []

  const mentions: EntityMention[] = []

  for (const entity of knownEntities) {
    const name = entity.name
    if (!content.includes(name)) continue // 未出场，跳过

    const mention: EntityMention = { name }

    if (entity.type === 'character') {
      // 检测死亡标志
      const deadPatterns = ['死了', '去世', '牺牲', '殒命', '陨落', '尸体', '遗骸', '不复存在', '倒下', '断气', '咽气']
      const alive = !deadPatterns.some(p =>
        content.includes(name + p) || content.includes(p + name)
      )
      mention.alive = alive

      // 检测位置：简单规则 — 找"在XX"模式
      const locMatch = content.match(new RegExp(`${escapeRegex(name)}(?:在|来到|回到|前往|抵达|进入)([一-龥]{2,6}(?:城|镇|村|山|谷|阁|楼|殿|府|院|室|厅|街|巷|市|州|县|省|国|界|域))`))
      if (locMatch) {
        mention.location = locMatch[1]
      }
    }

    if (entity.type === 'item') {
      // 检测物品销毁标志
      const destroyedPatterns = ['碎了', '断了', '毁了', '炸了', '化为碎片', '化为齑粉', '灰飞烟灭', '消失', '崩碎', '碎裂']
      mention.destroyed = destroyedPatterns.some(p =>
        content.includes(name + p) || content.includes(p + name)
      )

      // 检测归属变化
      const ownerMatch = content.match(new RegExp(`(?:${escapeRegex(name)}(?:在|归|属于)|(?:拿着|持有|握|佩|带|抓|拾|捡)[^。，,\\n]{0,10})${escapeRegex(name)}`))
      // 简化：找"XX的name" 或 "XX拿着name"
      const ownerMatch2 = content.match(new RegExp(`([一-龥]{2,4})(?:的|拿着|握着|佩着|带着|取出)${escapeRegex(name)}`))
      if (ownerMatch2) {
        mention.owner = ownerMatch2[1]
      }
    }

    mentions.push(mention)
  }

  return mentions
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── 冲突检测 ──

interface EntityMention {
  name: string
  alive?: boolean
  location?: string
  owner?: string
  destroyed?: boolean
}

export function detectConflicts(anchors: Anchor[], newMentions: EntityMention[]): ConflictResult[] {
  const conflicts: ConflictResult[] = []

  for (const mention of newMentions) {
    const relatedAnchors = anchors.filter(a => a.entities.includes(mention.name))

    if (relatedAnchors.length === 0) continue // 新实体，无锚点可比较

    for (const anchor of relatedAnchors) {
      const sd = anchor.structuredData

      if (anchor.type === 'character') {
        if (mention.alive !== undefined && sd.alive === true && mention.alive === false) {
          conflicts.push({
            level: 'ERROR', type: 'alive_changed',
            message: `${mention.name}：锚点记录为存活，新章节中已死亡`,
            entityName: mention.name,
          })
        }
        if (mention.location && sd.location && mention.location !== sd.location) {
          conflicts.push({
            level: 'WARNING', type: 'location_changed',
            message: `${mention.name}：位置从"${sd.location}"变为"${mention.location}"`,
            entityName: mention.name,
          })
        }
      }

      if (anchor.type === 'item') {
        if (sd.destroyed === true && mention.destroyed === false) {
          conflicts.push({
            level: 'ERROR', type: 'destroyed_item_reused',
            message: `${mention.name}：锚点记录已销毁，新章节中再次出现`,
            entityName: mention.name,
          })
        }
        if (mention.owner && sd.owner && mention.owner !== sd.owner) {
          conflicts.push({
            level: 'WARNING', type: 'item_owner_changed',
            message: `${mention.name}：归属从"${sd.owner}"变为"${mention.owner}"`,
            entityName: mention.name,
          })
        }
      }
    }
  }

  return conflicts
}
