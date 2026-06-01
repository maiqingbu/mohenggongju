/**
 * 阶段3：大纲层级检测器
 *
 * 检测大纲层级是否完整（总纲 → 卷纲 → 章纲）
 * 层级依赖强制：必须按顺序完成
 *
 * 用于两个场景：
 * 1. 首次创作流程的阶段3检测
 * 2. 续写循环中的 preflightCheck
 */

import type { MissingItem } from '../types'
import { getOutline } from '../../composables/useOutlines'

export interface OutlineDetectionResult {
  /** 是否全部齐全（总纲 + 至少第一卷卷纲 + 至少开篇3章章纲） */
  complete: boolean
  /** 缺失项列表 */
  missing: MissingItem[]
  /** 已完成项列表 */
  completed: string[]
  /** 详细状态 */
  detail: OutlineDetail
}

export interface OutlineDetail {
  /** 总纲是否存在 */
  hasMainOutline: boolean
  /** 各卷卷纲状态：volumeIndex → boolean */
  volumeOutlines: Record<number, boolean>
  /** 各章章纲状态：chapterId → boolean */
  chapterOutlines: Record<number, boolean>
  /** 第一卷是否存在卷纲 */
  hasFirstVolume: boolean
  /** 开篇3章章纲是否齐全 */
  hasOpening3Chapters: boolean
}

/** 卷信息（用于检测） */
export interface VolumeInfo {
  id: number
  index: number // 从1开始的卷序号
}

/** 章信息（用于检测） */
export interface ChapterInfo {
  id: number
  volumeId: number
  sort_order: number
  content?: string
}

/**
 * 检测大纲层级是否完整
 *
 * @param workId 作品ID
 * @param volumes 卷列表
 * @param chapterMap 各卷的章节列表 { volumeId: ChapterInfo[] }
 * @returns 检测结果
 */
export async function detectOutlineCompleteness(
  workId: number,
  volumes: VolumeInfo[],
  chapterMap: Record<number, ChapterInfo[]>,
): Promise<OutlineDetectionResult> {
  const missing: MissingItem[] = []
  const completed: string[] = []
  const detail: OutlineDetail = {
    hasMainOutline: false,
    volumeOutlines: {},
    chapterOutlines: {},
    hasFirstVolume: false,
    hasOpening3Chapters: false,
  }

  // 1. 检测总纲
  const mainOutline = await getOutline('main', workId)
  detail.hasMainOutline = mainOutline !== null

  if (detail.hasMainOutline) {
    completed.push('总纲')
  } else {
    missing.push({
      type: 'outline',
      field: 'main_outline',
      label: '总纲',
      autoGeneratable: true,
    })
  }

  // 2. 检测卷纲（至少第一卷）
  for (const vol of volumes) {
    const volOutline = await getOutline('volume', vol.id)
    detail.volumeOutlines[vol.index] = volOutline !== null
  }

  if (volumes.length > 0) {
    detail.hasFirstVolume = detail.volumeOutlines[1] === true
    if (detail.hasFirstVolume) {
      completed.push('第一卷卷纲')
    } else {
      missing.push({
        type: 'outline',
        field: 'volume_outline',
        label: '第一卷卷纲',
        autoGeneratable: true,
      })
    }
  }

  // 3. 检测章纲（至少开篇3章）
  // 获取所有章节，按 sort_order 排序
  const allChapters: ChapterInfo[] = []
  for (const vid of Object.keys(chapterMap)) {
    const chs = chapterMap[Number(vid)] ?? []
    allChapters.push(...chs)
  }
  allChapters.sort((a, b) => a.sort_order - b.sort_order)

  // 检查前3章是否有章纲
  const opening3 = allChapters.slice(0, 3)
  let openingCount = 0

  for (const ch of allChapters) {
    const chOutline = await getOutline('chapter', ch.id)
    detail.chapterOutlines[ch.id] = chOutline !== null
  }

  for (const ch of opening3) {
    if (detail.chapterOutlines[ch.id]) {
      openingCount++
    }
  }

  detail.hasOpening3Chapters = opening3.length >= 3 && openingCount >= 3

  if (detail.hasOpening3Chapters) {
    completed.push('开篇3章章纲')
  } else {
    missing.push({
      type: 'outline',
      field: 'chapter_outline',
      label: `开篇章纲（当前 ${openingCount}/3）`,
      autoGeneratable: true,
    })
  }

  return {
    complete: missing.length === 0,
    missing,
    completed,
    detail,
  }
}

// ── 续写循环专用：检测特定章节的前置条件 ──

export interface ChapterPreflightResult {
  /** 是否可以续写 */
  ready: boolean
  /** 缺失项列表（按优先级：卷纲 → 章纲） */
  missing: MissingItem[]
  /** 章节所属卷序号 */
  volumeIndex: number
  /** 该卷是否有卷纲 */
  hasVolumeOutline: boolean
  /** 该章是否有章纲 */
  hasChapterOutline: boolean
}

/**
 * 检测特定章节是否具备续写条件
 *
 * 续写循环中的动态递进检测：
 * 1. 该章属于哪一卷？
 * 2. 该卷有卷纲吗？（没有则需要先生成）
 * 3. 该章有章纲吗？（没有则需要先生成）
 *
 * @param chapterNo 章节序号（从1开始）
 * @param workId 作品ID
 * @param volumes 卷列表（含 chaptersPerVolume 配置）
 * @param chapterMap 各卷的章节列表
 * @returns 检测结果
 */
export async function detectChapterPreflight(
  chapterNo: number,
  workId: number,
  volumes: VolumeInfo[],
  chapterMap: Record<number, ChapterInfo[]>,
): Promise<ChapterPreflightResult> {
  const missing: MissingItem[] = []

  // 1. 确定该章属于哪一卷
  // 通过 sort_order 找到对应章节
  const allChapters: ChapterInfo[] = []
  for (const vid of Object.keys(chapterMap)) {
    const chs = chapterMap[Number(vid)] ?? []
    allChapters.push(...chs)
  }
  allChapters.sort((a, b) => a.sort_order - b.sort_order)

  // chapterNo 对应 sort_order = chapterNo - 1
  const targetChapter = allChapters.find(ch => ch.sort_order === chapterNo - 1)
  const volumeIndex = targetChapter
    ? volumes.find(v => v.id === targetChapter.volumeId)?.index ?? 1
    : 1

  // 2. 检测该卷是否有卷纲
  const volumeId = targetChapter?.volumeId ?? volumes[0]?.id
  const hasVolumeOutline = volumeId ? (await getOutline('volume', volumeId)) !== null : false

  if (!hasVolumeOutline) {
    missing.push({
      type: 'outline',
      field: 'volume_outline',
      label: `第${volumeIndex}卷卷纲`,
      autoGeneratable: true,
    })
  }

  // 3. 检测该章是否有章纲
  const hasChapterOutline = targetChapter
    ? (await getOutline('chapter', targetChapter.id)) !== null
    : false

  if (!hasChapterOutline) {
    missing.push({
      type: 'outline',
      field: 'chapter_outline',
      label: `第${chapterNo}章章纲`,
      autoGeneratable: true,
    })
  }

  return {
    ready: missing.length === 0,
    missing,
    volumeIndex,
    hasVolumeOutline,
    hasChapterOutline,
  }
}

/**
 * 生成大纲检测结果的文本描述
 */
export function formatOutlineDetectionResult(result: OutlineDetectionResult): string {
  if (result.complete) {
    const lines = ['✅ 大纲层级已全部齐全', '']
    lines.push(`· 总纲：已有`)
    lines.push(`· 第一卷卷纲：已有`)

    // 统计章纲数量
    const totalChapters = Object.keys(result.detail.chapterOutlines).length
    const confirmedChapters = Object.values(result.detail.chapterOutlines).filter(Boolean).length
    lines.push(`· 章纲：${confirmedChapters}/${totalChapters} 章`)

    return lines.join('\n')
  }

  const lines = [
    `📋 检测到 ${result.missing.length} 项大纲缺失：`,
    '',
    ...result.missing.map(item =>
      `· ${item.label}：未生成${item.autoGeneratable ? '（可AI生成）' : ''}`
    ),
  ]

  // 添加层级依赖说明
  lines.push('', '⚠️ 大纲必须按层级生成：总纲 → 卷纲 → 章纲')

  return lines.join('\n')
}

/**
 * 生成续写前置检测结果的文本描述
 */
export function formatChapterPreflightResult(result: ChapterPreflightResult, chapterNo: number): string {
  if (result.ready) {
    return `✅ 第${chapterNo}章续写前置条件已满足`
  }

  const lines = [
    `📋 第${chapterNo}章续写前置条件不足：`,
    '',
    ...result.missing.map(item =>
      `· ${item.label}：未生成（可AI生成）`
    ),
    '',
    '⚠️ 请先补齐缺失项后再续写',
  ]

  return lines.join('\n')
}