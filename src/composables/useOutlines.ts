/** H6: 大纲管理 — Tauri FS + 浏览器 localStorage fallback */
import { countWords } from './useDatabase'

export type OutlineType = 'main' | 'volume' | 'chapter'
export type OutlineStatus = 'draft' | 'confirmed' | 'done'

/** 章纲结构化数据（11 字段） */
export interface ChapterOutlineStructured {
  chapterTitle: string          // 章节标题（如：第4章：签字笔锋下的逆转）
  chapterType: string           // 类型：冲突升级 / 揭秘 / 解谜 / 转折 / 过渡
  wordLimit: number             // 字数限制（默认 3000）

  // 逻辑控制台
  characters: string            // 全部出场角色（逗号分隔）
  coreScene: string             // 核心场景
  timeSpan: string              // 时间跨度
  coreCoolPoint: string         // 核心爽点
  underlyingGame: string        // 底层博弈
  chapterGains: string          // 本章收益

  // Phase 对齐
  phaseAlignment: string        // 对应Phase节点
  progressCheck: string         // 剧情进度自检

  // 剧情推演（起承转合四段式）
  act1_entryAndCrisis: string   // 起：切入与危机
  act2_conflictEscalation: string // 承：冲突升级
  act3_keyBreakthrough: string  // 转：关键破局
  act4_aftermathAndCost: string // 合：余波与代价

  // 黄金钩子
  goldenHook: string            // 章末钩子
  hookType: string              // 信息钩 / 危机钩 / 情绪钩
}

export interface Outline {
  id: number
  work_id?: number
  type: OutlineType
  ref_id: number
  content: string
  /** 章纲结构化数据（仅 chapter 类型） */
  structuredData?: ChapterOutlineStructured | null
  status: OutlineStatus
  word_count: number
}

let nextId = 1
const LS_PREFIX = 'ns:outline:'

function outlineKey(type: OutlineType, refId: number): string {
  return `${LS_PREFIX}${type}_${refId}`
}

// ── 懒加载 Tauri FS ──
let _tauriFs: any = null
async function ensureTauriFs() {
  if (_tauriFs !== null) return _tauriFs
  const { isTauri } = await import('./useLocalWorkTree')
  if (!isTauri()) { _tauriFs = false; return false }
  try {
    _tauriFs = await import('@tauri-apps/plugin-fs')
    return true
  } catch (e) {
    console.error('[useOutlines] Tauri FS 插件加载失败，大纲将无法落盘:', e)
    _tauriFs = false; return false
  }
}

// ── localStorage fallback ──
function lsGet(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function lsSet(key: string, v: string) {
  try { localStorage.setItem(key, v) }
  catch (e) { console.error('[useOutlines] localStorage 写入失败，大纲未持久化:', e); throw new Error('大纲保存失败：无法写入本地存储') }
}

// ── API ──

export async function getOutline(type: OutlineType, refId: number | null): Promise<Outline | null> {
  if (refId === null) return null
  if (await ensureTauriFs()) {
    try {
      const { BaseDirectory, readTextFile } = _tauriFs
      const text = await readTextFile(`${import.meta.env.VITE_DATA_DIR || 'novel-studio'}/outlines/${type}_${refId}.json`, { baseDir: BaseDirectory.AppData })
      return JSON.parse(text) as Outline
    } catch (e) {
      console.warn(`[useOutlines] 读取大纲失败 (${type}_${refId}):`, e)
      return null
    }
  }
  const raw = lsGet(outlineKey(type, refId))
  return raw ? JSON.parse(raw) : null
}

export async function upsertOutline(params: {
  workId: number | null
  type: OutlineType
  volumeId?: number | null
  chapterId?: number | null
  content: string
  structuredData?: ChapterOutlineStructured | null
  status?: OutlineStatus
}): Promise<Outline | null> {
  const refId = params.type === 'main' ? params.workId
    : params.type === 'volume' ? (params.volumeId ?? 0)
    : (params.chapterId ?? 0)
  if (refId === null || refId === undefined) return null

  const existing = await getOutline(params.type, refId)
  const outline: Outline = existing
    ? { ...existing, content: params.content, structuredData: params.structuredData ?? existing.structuredData, status: params.status ?? existing.status, word_count: countWords(params.content) }
    : { id: Date.now(), type: params.type, ref_id: refId, content: params.content, structuredData: params.structuredData ?? null, status: params.status ?? 'draft', word_count: countWords(params.content) }

  const json = JSON.stringify(outline, null, 2)

  if (await ensureTauriFs()) {
    const { BaseDirectory, writeTextFile, mkdir, exists } = _tauriFs
    const DATA_DIR = import.meta.env.VITE_DATA_DIR || 'novel-studio'
    const dirPath = `${DATA_DIR}/outlines`
    const dirExists = await exists(dirPath, { baseDir: BaseDirectory.AppData })
    if (!dirExists) await mkdir(dirPath, { baseDir: BaseDirectory.AppData, recursive: true })
    const filePath = `${DATA_DIR}/outlines/${params.type}_${refId}.json`
    await writeTextFile(filePath, json, { baseDir: BaseDirectory.AppData })
    console.log('[useOutlines] 已写入 Tauri FS:', filePath)
  } else {
    console.debug('[useOutlines] Tauri FS 不可用（dev 模式正常），使用 localStorage 保存大纲')
    lsSet(outlineKey(params.type, refId), json)
  }

  return outline
}

/** 将结构化章纲格式化为 AI prompt 可读的文本 */
export function formatChapterOutlineForPrompt(sd: ChapterOutlineStructured): string {
  const lines: string[] = []
  if (sd.chapterTitle) {
    lines.push(sd.chapterTitle)
  } else {
    lines.push('第...章')
  }
  lines.push(`类型：${sd.chapterType} | 字数限制：${sd.wordLimit}`)
  lines.push('')
  lines.push('【逻辑控制台】')
  if (sd.characters) lines.push(`出场角色：${sd.characters}`)
  if (sd.coreScene) lines.push(`核心场景：${sd.coreScene}`)
  if (sd.timeSpan) lines.push(`时间跨度：${sd.timeSpan}`)
  if (sd.coreCoolPoint) lines.push(`核心爽点：${sd.coreCoolPoint}`)
  if (sd.underlyingGame) lines.push(`底层博弈：${sd.underlyingGame}`)
  if (sd.chapterGains) lines.push(`本章收益：${sd.chapterGains}`)
  lines.push('')
  if (sd.phaseAlignment) lines.push(`Phase对齐：${sd.phaseAlignment}`)
  if (sd.progressCheck) lines.push(`进度自检：${sd.progressCheck}`)
  lines.push('')
  lines.push('【剧情推演·起承转合】')
  if (sd.act1_entryAndCrisis) lines.push(`起（切入与危机）：${sd.act1_entryAndCrisis}`)
  if (sd.act2_conflictEscalation) lines.push(`承（冲突升级）：${sd.act2_conflictEscalation}`)
  if (sd.act3_keyBreakthrough) lines.push(`转（关键破局）：${sd.act3_keyBreakthrough}`)
  if (sd.act4_aftermathAndCost) lines.push(`合（余波与代价）：${sd.act4_aftermathAndCost}`)
  lines.push('')
  if (sd.goldenHook) {
    const hookLabel = sd.hookType || '钩子'
    lines.push(`【黄金${hookLabel}】${sd.goldenHook}`)
  }
  return lines.join('\n')
}

/** 字段标签 → structuredData key 映射表 */
const LABEL_TO_KEY: Record<string, keyof ChapterOutlineStructured> = {
  '类型': 'chapterType',
  '字数限制': 'wordLimit',
  '出场角色': 'characters',
  '核心场景': 'coreScene',
  '时间跨度': 'timeSpan',
  '核心爽点': 'coreCoolPoint',
  '底层博弈': 'underlyingGame',
  '本章收益': 'chapterGains',
  '对应Phase节点': 'phaseAlignment',
  '剧情进度自检': 'progressCheck',
  '进度自检': 'progressCheck',
  '起·切入与危机': 'act1_entryAndCrisis',
  '起': 'act1_entryAndCrisis',
  '承·冲突升级': 'act2_conflictEscalation',
  '承': 'act2_conflictEscalation',
  '转·关键破局': 'act3_keyBreakthrough',
  '转': 'act3_keyBreakthrough',
  '合·余波与代价': 'act4_aftermathAndCost',
  '合': 'act4_aftermathAndCost',
  '黄金钩子': 'goldenHook',
  '章末钩子': 'goldenHook',
  '钩子类型': 'hookType',
}

/** 清洗标签文本：去除 markdown 粗体/斜体、emoji、多余空格 */
function cleanLabel(raw: string): string {
  return raw
    .replace(/^[\*\s]+|[\*\s]+$/g, '')   // 去除首尾星号和空格（markdown 粗体）
    .replace(/^[_]+|[_]+$/g, '')          // 去除首尾下划线（斜体）
    .replace(/^[📌🔖🎯📍📖🧠📐🪝\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]\s*/gu, '') // 去除 emoji 前缀
    .trim()
}

/** 从中文标签文本解析章纲结构化数据 */
export function parseChapterOutlineText(text: string): { chapterTitle: string; data: Partial<ChapterOutlineStructured> } | null {
  const lines = text.split('\n')
  let chapterTitle = ''
  const data: any = {}

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // 跳过 markdown 标题标记行（如单独的 #、##）
    if (/^#{1,6}\s*$/.test(line)) continue

    // 去掉 markdown 标题前缀（# / ## / ### 等），AI 常无视"不要 markdown"的指令
    const lineNoHash = line.replace(/^#{1,6}\s+/, '')

    // 第N章：标题 → chapterTitle（容忍 markdown 粗体包裹）
    const titleMatch = lineNoHash.match(/^(?:\*\*)?第[一二三四五六七八九十百千\d]+章[：:]\s*(.+?)(?:\*\*)?$/)
    if (titleMatch) {
      chapterTitle = lineNoHash.replace(/\*\*/g, '').replace(/：/, ':').trim()
      continue
    }

    // 如果以"第N章"开头但没有冒号（如：第1章）
    const chMatch = lineNoHash.match(/^(?:\*\*)?第[一二三四五六七八九十百千\d]+章\s*(?:\*\*)?$/)
    if (chMatch && !chapterTitle) {
      chapterTitle = lineNoHash.replace(/\*\*/g, '').trim()
      continue
    }

    // 标签：内容 格式
    const colonIdx = line.indexOf('：')
    if (colonIdx === -1) {
      // 尝试英文冒号
      const enColon = line.indexOf(':')
      if (enColon === -1) continue
      const label = cleanLabel(line.slice(0, enColon))
      const value = line.slice(enColon + 1).trim()
      if (!value) continue
      const key = LABEL_TO_KEY[label]
      if (key) data[key] = value
      continue
    }

    const label = cleanLabel(line.slice(0, colonIdx))
    const value = line.slice(colonIdx + 1).trim()
    if (!value) continue

    const key = LABEL_TO_KEY[label]
    if (key) {
      if (key === 'wordLimit') {
        data[key] = parseInt(value) || 3000
      } else {
        data[key] = value
      }
    }
  }

  if (!chapterTitle) {
    console.debug('[章纲解析] 未找到章节标题（第N章：标题），首行:', lines[0]?.slice(0, 80))
    return null
  }
  // 至少要有 1 个有意义字段（类型/场景/起承转合任一）才能确认是章纲
  const hasContent = data.chapterType || data.coreScene
    || data.act1_entryAndCrisis || data.act2_conflictEscalation
    || data.act3_keyBreakthrough || data.act4_aftermathAndCost
    || data.goldenHook || data.characters
  if (!hasContent) {
    console.debug(`[章纲解析] 标题「${chapterTitle}」已匹配，但未找到任何有效字段。已解析字段:`, Object.keys(data))
    return null
  }

  return { chapterTitle, data }
}

/** 将完整文本（可能含多个章纲，用 --- 分隔）解析为章纲数组 */
export function parseChapterOutlinesText(fullText: string): { chapterTitle: string; data: Partial<ChapterOutlineStructured> }[] {
  console.debug('[章纲解析] 输入文本长度:', fullText.length, '前200字:', fullText.slice(0, 200).replace(/\n/g, '\\n'))

  // 1. 剥离 markdown 代码块（AI 经常无视"不要代码块"的指令）
  let cleaned = fullText
    .replace(/^```[\w]*\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim()
  console.debug('[章纲解析] 清洗后长度:', cleaned.length)

  // 2. 按 --- 分隔各章（容忍空格/星号等常见 markdown 噪音）
  const blocks = cleaned.split(/\n{1,2}\s*-{3,}\s*\n{1,2}/)
  console.debug('[章纲解析] 分割后块数:', blocks.length)
  const results: { chapterTitle: string; data: Partial<ChapterOutlineStructured> }[] = []

  for (let i = 0; i < blocks.length; i++) {
    const trimmed = blocks[i].trim()
    if (!trimmed) continue
    const parsed = parseChapterOutlineText(trimmed)
    if (parsed) {
      results.push(parsed)
    } else {
      console.warn(`[章纲解析] 第${i + 1}块解析失败，该块前100字:`, trimmed.slice(0, 100).replace(/\n/g, '\\n'))
    }
  }

  // 3. 兜底：如果按章分隔失败，尝试把全文当作单章解析
  if (!results.length && cleaned.length > 20) {
    console.debug('[章纲解析] 分块无结果，尝试全文单章解析')
    const parsed = parseChapterOutlineText(cleaned)
    if (parsed) results.push(parsed)
  }

  console.debug('[章纲解析] 最终结果:', results.length, '章')
  return results
}

export async function deleteOutline(type: OutlineType, refId: number): Promise<void> {
  if (await ensureTauriFs()) {
    try {
      const { BaseDirectory, remove } = _tauriFs
      await remove(`${import.meta.env.VITE_DATA_DIR || 'novel-studio'}/outlines/${type}_${refId}.json`, { baseDir: BaseDirectory.AppData })
    } catch (e) { console.warn(`[useOutlines] 删除大纲文件失败 (${type}_${refId}):`, e) }
  } else {
    try { localStorage.removeItem(outlineKey(type, refId)) } catch {}
  }
}
