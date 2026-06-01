/**
 * 阶段2：信息设定检测器
 *
 * 检测作品的信息设定是否完整：
 * - 主要角色
 * - 世界观/背景
 * - 伏笔/悬念
 * - 关键物品
 * - 情节线/主线
 */

import type { MissingItem } from '../types'
import type { SettingEntityType } from '../../composables/useSettings'

export interface InfoDetectionResult {
  /** 是否全部齐全 */
  complete: boolean
  /** 缺失项列表 */
  missing: MissingItem[]
  /** 已完成项列表 */
  completed: string[]
  /** 各类型数量统计 */
  counts: Record<SettingEntityType, number>
}

/** 信息类型定义 */
interface InfoFieldDef {
  key: SettingEntityType
  label: string
  /** 最少需要的数量 */
  minCount: number
  /** 是否可由 AI 自动生成 */
  autoGeneratable?: boolean
}

/** 所有信息类型定义 */
const INFO_FIELDS: InfoFieldDef[] = [
  {
    key: 'character',
    label: '主要角色',
    minCount: 1,
    autoGeneratable: true,
  },
  {
    key: 'world_setting',
    label: '世界观/背景',
    minCount: 1,
    autoGeneratable: true,
  },
  {
    key: 'foreshadowing',
    label: '伏笔/悬念',
    minCount: 0, // 伏笔可以没有
    autoGeneratable: true,
  },
  {
    key: 'item',
    label: '关键物品',
    minCount: 0, // 物品可以没有
    autoGeneratable: true,
  },
  {
    key: 'plot_arc',
    label: '情节线/主线',
    minCount: 1,
    autoGeneratable: true,
  },
]

/**
 * 检测信息设定是否完整
 *
 * @param settings 设定实体列表（从 useSettings 获取）
 * @returns 检测结果
 */
export function detectInfoCompleteness(settings: Array<{ type: SettingEntityType }>): InfoDetectionResult {
  const counts: Record<SettingEntityType, number> = {
    character: 0,
    world_setting: 0,
    item: 0,
    foreshadowing: 0,
    plot_arc: 0,
  }

  // 统计各类型数量
  for (const setting of settings) {
    if (setting.type in counts) {
      counts[setting.type]++
    }
  }

  const missing: MissingItem[] = []
  const completed: string[] = []

  for (const field of INFO_FIELDS) {
    if (counts[field.key] >= field.minCount) {
      completed.push(field.label)
    } else {
      missing.push({
        type: 'info',
        field: field.key,
        label: field.label,
        autoGeneratable: field.autoGeneratable,
      })
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    completed,
    counts,
  }
}

/**
 * 生成信息检测结果的文本描述
 */
export function formatInfoDetectionResult(result: InfoDetectionResult): string {
  if (result.complete) {
    const lines = ['✅ 信息设定已全部齐全', '']
    for (const [key, count] of Object.entries(result.counts)) {
      if (count > 0) {
        const label = INFO_FIELDS.find(f => f.key === key)?.label || key
        lines.push(`· ${label}：${count} 项`)
      }
    }
    return lines.join('\n')
  }

  const lines = [
    `📋 检测到 ${result.missing.length} 项信息设定缺失：`,
    '',
    ...result.missing.map(item =>
      `· ${item.label}：数量不足（当前 ${result.counts[item.field as SettingEntityType] || 0} 项，至少需要 ${INFO_FIELDS.find(f => f.key === item.field)?.minCount || 1} 项）`
    ),
  ]

  return lines.join('\n')
}
