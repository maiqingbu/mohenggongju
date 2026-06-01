/**
 * 信息设定管理
 *
 * 统一管理 5 类设定实体：角色 / 世界观 / 物品 / 伏笔 / 情节线
 * 持久化到 settings.json（Tauri FS），浏览器模式回退到 localStorage
 */

import type { EntityType } from './useChangeLog'

// ── 统一实体类型 ──

export type SettingEntityType = 'character' | 'world_setting' | 'item' | 'foreshadowing' | 'plot_arc'

export const SETTING_TYPE_LABELS: Record<SettingEntityType, string> = {
  character: '角色',
  world_setting: '世界观',
  item: '物品',
  foreshadowing: '伏笔',
  plot_arc: '情节线',
}

export interface SettingEntity {
  id: string
  type: SettingEntityType
  name: string
  chapterNo: number           // 首次出现的章节
  summary: string             // 100字以内可读摘要
  structuredData: Record<string, unknown>  // 结构化字段
  version: number
  createdAt: string           // ISO timestamp
  updatedAt: string
  source: 'manual' | 'ai_extraction' | 'chapter_generation'
  deprecated?: boolean
}

// ── 各类型结构化数据 ──

export interface CharacterData {
  gender: string
  age: string
  identity: string
  nickname: string
  personality: string
  appearance: string
  abilities: string[]
  characterTags: string[]
  skills: string[]
  keyItems: string[]
  relationships: { name: string; relation: string }[]
  alive: boolean
  location: string
  // 生态人物树字段
  category: string          // 主角/配角/反派/路人/特殊
  volume: string            // 登场卷号
  ending: string            // 最终结局
  coreTrauma: string        // 核心创伤/心理动机
  motivation: string        // 源动力
  growthArc: string         // 成长弧光（全书变化轨迹）
}

export interface WorldSettingData {
  category: string            // 地理/势力/规则/历史/文化/魔法体系/其他
  description: string
  scope: string               // 全局/特定区域
  rules: string[]
  relatedEntities: string[]
}

export interface ItemData {
  owner: string
  location: string
  function: string
  status: string
  properties: string[]
  destroyed: boolean
}

export interface ForeshadowData {
  plantedChapter: string     // 埋设章节
  expectedChapter: string    // 预期揭示章节
  secret: string             // 伏笔秘密详细内容
  tags: string[]             // 分类标签
  resolved: boolean
  resolvedAt: string | null
  relatedAnchors: string[]
}

export interface PlotArcData {
  arcType: 'main' | 'sub' | 'side'
  status: 'planned' | 'in_progress' | 'completed'
  chapters: number[]
  relatedCharacters: string[]
  description: string
}

// ── 默认数据工厂 ──

export function defaultDataForType(type: SettingEntityType): Record<string, unknown> {
  switch (type) {
    case 'character':
      return { gender: '', age: '', identity: '', nickname: '', personality: '', appearance: '', abilities: [], characterTags: [], skills: [], keyItems: [], relationships: [], alive: true, location: '', category: '', volume: '', ending: '', coreTrauma: '', motivation: '', growthArc: '' }
    case 'world_setting':
      return { category: '', description: '', scope: '全局', status: '活跃', rules: [], relatedEntities: [], numericValue: null, quantity: null, currency: '', unit: '', direction: '', timePoint: '', timePrecision: '', terms: '' }
    case 'item':
      return { owner: '', location: '', function: '', status: '正常', properties: [], destroyed: false }
    case 'foreshadowing':
      return { plantedChapter: '', expectedChapter: '', secret: '', tags: [], resolved: false, resolvedAt: null, relatedAnchors: [] }
    case 'plot_arc':
      return { arcType: 'sub', status: 'planned', chapters: [], relatedCharacters: [], description: '' }
  }
}

// ── 存储抽象（Tauri FS → localStorage 回退）──

let _cachedFs: any = null
let _cachedIsTauri: boolean | null = null
async function getFs() {
  if (_cachedFs !== null) return _cachedFs
  const { isTauri } = await import('./useLocalWorkTree')
  _cachedIsTauri = isTauri()
  if (!_cachedIsTauri) { _cachedFs = false; return false }
  _cachedFs = await import('@tauri-apps/plugin-fs')
  return _cachedFs
}

const storage = {
  async get(key: string): Promise<string | null> {
    try {
      const fs = await getFs()
      if (fs) {
        const fileName = key.replace(/:/g, '_') + '.json'
        const fileExists = await fs.exists(fileName, { baseDir: fs.BaseDirectory.AppData })
        if (!fileExists) return null
        return await fs.readTextFile(fileName, { baseDir: fs.BaseDirectory.AppData })
      }
      return localStorage.getItem(key)
    } catch { return null }
  },
  async set(key: string, value: string) {
    try {
      const fs = await getFs()
      if (fs) {
        const fileName = key.replace(/:/g, '_') + '.json'
        await fs.writeTextFile(fileName, value, { baseDir: fs.BaseDirectory.AppData })
        return
      }
      localStorage.setItem(key, value)
    } catch (e) {
      console.warn('[storage.set] 写入失败:', key, e)
    }
  },
  async remove(key: string) {
    try {
      const fs = await getFs()
      if (fs) {
        const fileName = key.replace(/:/g, '_') + '.json'
        await fs.remove(fileName, { baseDir: fs.BaseDirectory.AppData })
        return
      }
      localStorage.removeItem(key)
    } catch {}
  },
}

function settingsKey(workId: number): string {
  return `ns:settings:w${workId}`
}

// ── 智能字段合并 ──

/** 状态型字段：新值直接覆盖旧值 */
const STATE_FIELDS = new Set([
  'location', 'status', 'alive', 'importance',
  'identity', 'personality', 'appearance',
  'category', 'coreTrauma', 'motivation', 'growthArc',
  'ending', 'volume', 'age', 'gender', 'nickname',
])

/** 累加型字段：合并去重（数组拼接 / 字符串分隔符追加） */
const ACCUMULATIVE_FIELDS = new Set([
  'abilities', 'skills', 'keyItems', 'characterTags',
])

/** 对象数组字段：按 name 合并 */
const OBJECT_ARRAY_FIELDS: Record<string, string> = {
  relationships: 'name',
}

function mergeStructuredData(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing }

  for (const [key, newVal] of Object.entries(patch)) {
    if (newVal === undefined || newVal === null || newVal === '') {
      // 空值不覆盖已有数据（防止 AI 提取空字段冲掉手工填写的内容）
      continue
    }
    // 空数组也不覆盖（防止 AI 返回 [] 清空手工填写的列表数据）
    if (Array.isArray(newVal) && newVal.length === 0) {
      continue
    }

    const oldVal = result[key]

    if (STATE_FIELDS.has(key)) {
      // 状态型：直接覆盖
      result[key] = newVal
    } else if (ACCUMULATIVE_FIELDS.has(key)) {
      // 累加型：合并去重
      result[key] = mergeAccumulative(oldVal, newVal)
    } else if (OBJECT_ARRAY_FIELDS[key]) {
      // 对象数组：按指定 key 合并
      result[key] = mergeObjectArray(oldVal, newVal, OBJECT_ARRAY_FIELDS[key])
    } else {
      // 默认：覆盖
      result[key] = newVal
    }
  }

  return result
}

/** 合并累加型字段：数组拼接去重，或字符串追加去重 */
function mergeAccumulative(oldVal: unknown, newVal: unknown): unknown {
  const oldArr = toArray(oldVal)
  const newArr = toArray(newVal)
  const merged = [...oldArr]
  for (const item of newArr) {
    if (!merged.includes(item)) {
      merged.push(item)
    }
  }
  // 保持原有类型：原来是什么类型就返回什么
  if (Array.isArray(oldVal) || Array.isArray(newVal)) return merged
  return merged.join('、')
}

function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') return val.split(/[,，、;；]\s*/).filter(Boolean)
  return []
}

/** 合并对象数组：按 matchKey 匹配，已有的更新，新的追加 */
function mergeObjectArray(oldVal: unknown, newVal: unknown, matchKey: string): unknown {
  const oldArr = Array.isArray(oldVal) ? [...oldVal] as Record<string, unknown>[] : []
  const newArr = Array.isArray(newVal) ? newVal as Record<string, unknown>[] : []
  if (newArr.length === 0) return oldArr

  for (const newItem of newArr) {
    const matchVal = newItem[matchKey]
    if (matchVal === undefined || matchVal === null) {
      oldArr.push(newItem)
      continue
    }
    const idx = oldArr.findIndex(o => o[matchKey] === matchVal)
    if (idx >= 0) {
      // 同 name：覆盖更新（保留旧属性，新属性覆盖）
      oldArr[idx] = { ...oldArr[idx], ...newItem }
    } else {
      // 新 name：追加
      oldArr.push(newItem)
    }
  }
  return oldArr
}

// ── SettingsManager 类 ──

export class SettingsManager {
  private entities: SettingEntity[] = []
  private idCounter = 0
  private version = 0
  private currentWorkId: number | null = null

  getVersion(): number { return this.version }

  private _saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 内部自动保存（防抖 300ms）：优先用已加载的 currentWorkId，兜底从 useWorkRepo 获取 */
  private autoSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this._doSave(), 500)
  }

  /** 立即刷盘：取消 debounce 并同步写入。关闭窗口前或测试中需要确保持久化时调用。 */
  async flush(): Promise<void> {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
    await this._doSave()
  }

  private async _doSave(): Promise<void> {
    let wid = this.currentWorkId
    if (wid === null) {
      try {
        const { useWorkRepo } = await import('./useWorkRepo')
        wid = useWorkRepo().currentWorkId.value ?? null
      } catch { /* 兜底获取失败，放弃保存 */ }
    }
    if (wid !== null) {
      await this.save(wid)
    }
  }

  // ── CRUD ──

  async add(input: {
    type: SettingEntityType
    name: string
    chapterNo?: number
    summary?: string
    structuredData?: Record<string, unknown>
    source?: SettingEntity['source']
  }): Promise<SettingEntity> {
    const now = new Date().toISOString()
    const entity: SettingEntity = {
      id: `set_${Date.now()}_${++this.idCounter}`,
      type: input.type,
      name: input.name,
      chapterNo: input.chapterNo ?? 1,
      summary: input.summary ?? '',
      structuredData: input.structuredData ?? defaultDataForType(input.type),
      version: 1,
      createdAt: now,
      updatedAt: now,
      source: input.source ?? 'manual',
      deprecated: false,
    }
    this.entities.push(entity)
    this.version++
    await this.autoSave()
    return entity
  }

  get(id: string): SettingEntity | undefined {
    return this.entities.find(e => e.id === id)
  }

  listByType(type: SettingEntityType): SettingEntity[] {
    return this.entities
      .filter(e => e.type === type)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }

  listAll(): SettingEntity[] {
    return [...this.entities].sort((a, b) => {
      const typeOrder = ['character', 'world_setting', 'item', 'foreshadowing', 'plot_arc']
      const ta = typeOrder.indexOf(a.type)
      const tb = typeOrder.indexOf(b.type)
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name, 'zh')
    })
  }

  async update(id: string, patch: {
    name?: string
    summary?: string
    structuredData?: Record<string, unknown>
    chapterNo?: number
  }): Promise<boolean> {
    const e = this.entities.find(x => x.id === id)
    if (!e) return false
    if (patch.name !== undefined) e.name = patch.name
    if (patch.summary !== undefined) e.summary = patch.summary
    if (patch.structuredData !== undefined) {
      e.structuredData = mergeStructuredData(e.structuredData, patch.structuredData)
    }
    if (patch.chapterNo !== undefined) e.chapterNo = patch.chapterNo
    e.version++
    e.updatedAt = new Date().toISOString()
    this.version++
    await this.autoSave()
    return true
  }

  async remove(id: string): Promise<boolean> {
    const idx = this.entities.findIndex(e => e.id === id)
    if (idx === -1) return false
    this.entities.splice(idx, 1)
    this.version++
    await this.autoSave()
    return true
  }

  /** 标记/取消弃用 */
  async setDeprecated(id: string, val: boolean): Promise<boolean> {
    const e = this.entities.find(x => x.id === id)
    if (!e) return false
    e.deprecated = val
    e.updatedAt = new Date().toISOString()
    this.version++
    await this.autoSave()
    return true
  }

  /** 列表（可选过滤弃用项）*/
  listByTypeWithDeprecated(type: SettingEntityType, showDeprecated: boolean): SettingEntity[] {
    let items = this.listByType(type)
    if (!showDeprecated) items = items.filter(e => !e.deprecated)
    return items
  }

  /** 批量导入（AI 提取审核通过后调用）*/
  async importMany(entities: Omit<SettingEntity, 'version' | 'createdAt' | 'updatedAt'>[]): Promise<SettingEntity[]> {
    const now = new Date().toISOString()
    const result: SettingEntity[] = []
    for (const input of entities) {
      const id = input.id || `set_${Date.now()}_${++this.idCounter}`
      // 检查是否已存在同名同类型
      const exists = this.entities.find(e =>
        e.type === input.type && e.name === input.name
      )
      if (exists) {
        // 更新已有
        exists.structuredData = mergeStructuredData(exists.structuredData || {}, input.structuredData || {})
        exists.summary = input.summary || exists.summary
        exists.version++
        exists.updatedAt = now
        result.push(exists)
      } else {
        const entity: SettingEntity = {
          ...input,
          id,
          version: 1,
          createdAt: now,
          updatedAt: now,
        }
        this.entities.push(entity)
        result.push(entity)
      }
    }
    this.version++
    await this.autoSave()
    return result
  }

  async clear() {
    this.entities = []
    this.idCounter = 0
    this.version = 0
    this.currentWorkId = null
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null }
    await this._doSave()
  }

  // ── 持久化 ──

  async load(workId: number): Promise<void> {
    this.currentWorkId = workId
    // 先清空旧数据，防止加载失败时交叉污染上一作品的 settings
    this.entities = []
    this.idCounter = 0
    this.version = 0
    console.log(`[SettingsManager] load 开始, workId=${workId}`)
    try {
      const raw = await storage.get(settingsKey(workId))
      if (raw) {
        const data = JSON.parse(raw)
        this.entities = data.entities ?? []
        this.idCounter = data.idCounter ?? 0
        this.version = data.version ?? 0
        console.log(`[SettingsManager] load 完成, workId=${workId}, entities=${this.entities.length}, version=${this.version}`)
      } else {
        console.log(`[SettingsManager] load 完成, workId=${workId}, 无已有数据（首次使用）`)
      }
    } catch (e) {
      console.error(`[SettingsManager] load 失败, workId=${workId}`, e)
      // 状态已在开头清空，保持空状态而非旧数据
    }
  }

  async save(workId: number): Promise<void> {
    const data = {
      entities: this.entities,
      idCounter: this.idCounter,
      version: this.version,
    }
    await storage.set(settingsKey(workId), JSON.stringify(data))
  }
}
