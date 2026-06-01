/**
 * 续写前置检测步骤
 *
 * 在续写循环中，检测下一章是否具备创作条件：
 * 1. 该章属于哪一卷？
 * 2. 该卷有卷纲吗？
 * 3. 该章有章纲吗？
 *
 * 如果缺失，返回缺失项供 runner 推送审批卡片
 */

import type { MissingItem } from '../types'
import { detectChapterPreflight, type ChapterPreflightResult } from '../detectors/outlineDetector'
import type { VolumeInfo, ChapterInfo } from '../detectors/outlineDetector'

export interface PreflightCheckResult {
  /** 是否可以续写 */
  ready: boolean
  /** 缺失项列表 */
  missingItems: MissingItem[]
  /** 章节所属卷序号 */
  volumeIndex: number
  /** 详细结果 */
  detail: ChapterPreflightResult
}

/**
 * 执行续写前置检测
 *
 * @param chapterNo 要续写的章节序号
 * @param workId 作品ID
 * @param volumes 卷列表
 * @param chapterMap 各卷的章节列表
 * @returns 检测结果
 */
export async function preflightCheck(
  chapterNo: number,
  workId: number,
  volumes: VolumeInfo[],
  chapterMap: Record<number, ChapterInfo[]>,
): Promise<PreflightCheckResult> {
  console.log(`[preflightCheck] 检测第${chapterNo}章前置条件...`)

  const result = await detectChapterPreflight(chapterNo, workId, volumes, chapterMap)

  console.log(`[preflightCheck] 检测结果:`, {
    ready: result.ready,
    volumeIndex: result.volumeIndex,
    hasVolumeOutline: result.hasVolumeOutline,
    hasChapterOutline: result.hasChapterOutline,
    missingCount: result.missing.length,
  })

  return {
    ready: result.ready,
    missingItems: result.missing,
    volumeIndex: result.volumeIndex,
    detail: result,
  }
}

/**
 * 生成前置检测报告（用于审批卡片展示）
 */
export function formatPreflightReport(result: PreflightCheckResult, chapterNo: number): string {
  if (result.ready) {
    return `✅ 第${chapterNo}章续写前置条件已满足，可以开始创作`
  }

  const lines: string[] = []

  // 按优先级列出缺失项
  for (const item of result.missingItems) {
    if (item.field === 'volume_outline') {
      lines.push(`📖 ${item.label}未生成，需要先生成卷纲`)
    } else if (item.field === 'chapter_outline') {
      lines.push(`📝 ${item.label}未生成，需要先生成章纲`)
    }
  }

  return lines.join('\n')
}