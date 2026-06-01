/**
 * 平台数据加载：platform_strategies.json + 平台题材匹配矩阵.csv
 * 提供平台查询、题材匹配评分、标签推荐
 */

import platformData from '../data/platform_strategies.json'

export interface PlatformStrategy {
  id: string
  name: string
  owner: string
  url: string
  app?: string
  rating: number
  channels: string[]
  audience: {
    gender: string
    age: string
    tier: string
    payment_will: string
  }
  preferred_genres: string[]
  preferred_subgenres: string[]
  word_count: { min: number; max: number; ideal?: number }
  rhythm: string
  pov: string[]
  style: string
  style_rules: string[]
  structure: {
    opening: string
    middle: string
    ending: string
  }
  taboo: string[]
  revenue_model: string
  revenue_typical_range: [number, number]
  revenue_unit: string
  submission: {
    url?: string
    min_words: number
    needs_outline: boolean
    review_time_days?: number
    green_channel_genres?: string[]
    green_channel_requirement?: string
  }
  hot_topics_2026?: string[]
  iconic_works?: string[]
  ip_adaptation_potential?: string
  ai_friendly?: string
}

// ── CSV 匹配矩阵 ──

interface MatrixRow {
  category: string
  subgenre: string
  scores: Record<string, number> // platform_id → 0-3
}

let matrixRows: MatrixRow[] = []

function loadMatrixCSV(csvText: string): MatrixRow[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',')
  // 跳过前两列（题材分类、题材子项），后面的都是平台名
  // 平台名映射到 platform id
  const platformColMap: Record<number, string> = {}
  const platformNameToId: Record<string, string> = {
    '知乎盐选': 'zhihu_salt', '番茄小说': 'fanqie', '七猫小说': 'qimao',
    '晋江文学城': 'jjwxc', '起点中文网': 'qidian', '飞卢小说': 'faloo',
    '刺猬猫': 'ciweimao', '豆瓣阅读': 'douban_read',
    '今日头条': 'toutiao', '小红书': 'xiaohongshu', '微信公众号': 'weixin_mp',
  }

  for (let i = 2; i < headers.length; i++) {
    const name = headers[i].trim()
    const id = platformNameToId[name]
    if (id) platformColMap[i] = id
  }

  const rows: MatrixRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length < 3) continue
    const scores: Record<string, number> = {}
    for (let j = 2; j < cols.length; j++) {
      const platId = platformColMap[j]
      if (platId && cols[j]) {
        scores[platId] = parseInt(cols[j]) || 0
      }
    }
    rows.push({ category: cols[0], subgenre: cols[1], scores })
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

// ── 公共 API ──

const strategies = (platformData as any).platforms as Record<string, PlatformStrategy>
const mvpPlatforms = (platformData as any).recommended_mvp_platforms as string[]
const tierMap = (platformData as any).platform_tier_for_short_story as Record<string, string[]>

/** 获取所有平台列表 */
export function getAllPlatforms(): PlatformStrategy[] {
  return Object.values(strategies)
}

/** 获取 MVP 推荐平台 */
export function getMVPPlatforms(): PlatformStrategy[] {
  return mvpPlatforms.map(id => strategies[id]).filter(Boolean)
}

/** 根据 ID 获取单个平台 */
export function getPlatform(id: string): PlatformStrategy | undefined {
  return strategies[id]
}

/** 获取平台的推荐题材（按优先级排序） */
export function getPlatformGenres(platformId: string): string[] {
  return strategies[platformId]?.preferred_genres || []
}

/** 获取平台的禁用项 */
export function getPlatformTaboos(platformId: string): string[] {
  return strategies[platformId]?.taboo || []
}

/** 获取平台的爆款趋势 */
export function getPlatformHotTopics(platformId: string): string[] {
  return strategies[platformId]?.hot_topics_2026 || []
}

/** 获取平台的受众描述 */
export function getPlatformAudience(platformId: string): string {
  const a = strategies[platformId]?.audience
  if (!a) return ''
  const gender = a.gender.includes('female') ? '女性' : a.gender.includes('male') ? '男性' : '均衡'
  return `${gender}为主，${a.age}岁，${a.tier}`
}

/** 自定义平台画像存储 */
const LS_PROFILE_PREFIX = 'ns:platformProfile:'
export function loadPlatformProfile(platformId: string): string | null {
  try { return localStorage.getItem(LS_PROFILE_PREFIX + platformId) } catch { return null }
}
export function savePlatformProfile(platformId: string, text: string) {
  try { localStorage.setItem(LS_PROFILE_PREFIX + platformId, text) } catch {}
}

/**
 * 生成平台画像文本（用于 AI prompt 上下文）
 *
 * 设计原则：只提供平台风格参考和硬性禁忌，不规定频道/字数/题材。
 * 频道、标签、字数等由用户在立项阶段选择，平台画像不与之冲突。
 */
export function getPlatformProfile(platformId: string): string {
  // 优先使用用户自定义画像
  const custom = loadPlatformProfile(platformId)
  if (custom) return custom

  const p = strategies[platformId]
  if (!p) return ''

  const parts: string[] = []
  parts.push(`## ${p.name} 平台风格参考`)

  // 读者特征（仅描述，不规定频道）
  const age = p.audience.age || ''
  const tier = p.audience.tier || ''
  const pay = p.audience.payment_will || ''
  if (age || tier || pay) {
    parts.push(`读者特征：${[age ? age + '岁' : '', tier, pay ? '付费意愿' + pay : ''].filter(Boolean).join('，')}`)
  }

  // 节奏参考（不规定具体字数）
  if (p.rhythm) parts.push(`节奏风格：${p.rhythm}`)

  // 文风参考
  if (p.style) parts.push(`文风倾向：${p.style}`)
  if (p.style_rules.length) parts.push(`写作建议：${p.style_rules.join('；')}`)

  // 结构参考
  const opening = p.structure?.opening
  const middle = p.structure?.middle
  const ending = p.structure?.ending
  if (opening || middle || ending) {
    parts.push(`结构参考：开篇${opening || '无特殊'}；中段${middle || '无特殊'}；收尾${ending || '无特殊'}`)
  }

  // 硬性禁忌（这是 LLM 必须遵守的）
  if (p.taboo.length) parts.push(`⚠️ 平台禁忌（严格禁止）：${p.taboo.join('、')}`)

  // 爆款趋势（仅供参考）
  if (p.hot_topics_2026?.length) parts.push(`近期热门方向（仅供参考，不强制）：${p.hot_topics_2026.join('、')}`)

  return parts.join('\n')
}

/** 查询平台-题材匹配度 (0-3) */
export function getGenreScore(platformId: string, subgenre: string): number {
  const row = matrixRows.find(r => r.subgenre === subgenre)
  return row?.scores[platformId] ?? 0
}

/** 获取某题材在哪些平台是爆款（3分） */
export function getBestPlatformsForGenre(subgenre: string): string[] {
  const row = matrixRows.find(r => r.subgenre === subgenre)
  if (!row) return []
  return Object.entries(row.scores).filter(([_, s]) => s >= 3).map(([k]) => k)
}

/** 获取某平台所有爆款题材（3分） */
export function getBestGenresForPlatform(platformId: string): string[] {
  return matrixRows.filter(r => (r.scores[platformId] || 0) >= 3).map(r => r.subgenre)
}

/** 初始化：加载 CSV 矩阵 */
export async function initPlatformData(csvText?: string): Promise<void> {
  if (csvText) {
    matrixRows = loadMatrixCSV(csvText)
  }
}
