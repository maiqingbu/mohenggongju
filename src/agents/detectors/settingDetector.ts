/**
 * 阶段1：作品设定检测器
 *
 * 检测作品的基础设定是否完整：
 * - 书名
 * - 类型/题材
 * - 简介/一句话概述
 * - 核心卖点
 * - 目标读者
 * - 金手指/核心设定
 */

import type { MissingItem } from '../types'

export interface SettingDetectionResult {
  /** 是否全部齐全 */
  complete: boolean
  /** 缺失项列表 */
  missing: MissingItem[]
  /** 已完成项列表 */
  completed: string[]
}

/** 设定字段定义 */
interface SettingFieldDef {
  key: string
  label: string
  /** 检查函数：返回 true 表示该项已填写 */
  check: (work: any) => boolean
  /** 是否可由 AI 自动生成 */
  autoGeneratable?: boolean
}

/** 所有设定字段定义 */
const SETTING_FIELDS: SettingFieldDef[] = [
  {
    key: 'title',
    label: '书名',
    check: (work) => !!(work?.title && work.title.trim().length > 0),
    autoGeneratable: true,
  },
  {
    key: 'genre',
    label: '类型/题材',
    check: (work) => !!(work?.genre && work.genre.trim().length > 0),
    autoGeneratable: true,
  },
  {
    key: 'synopsis',
    label: '简介/一句话概述',
    check: (work) => !!(work?.synopsis && work.synopsis.trim().length > 0),
    autoGeneratable: true,
  },
  {
    key: 'core_selling_point',
    label: '核心卖点',
    check: (work) => !!(work?.core_selling_point && work.core_selling_point.trim().length > 0),
    autoGeneratable: true,
  },
  {
    key: 'target_reader',
    label: '目标读者',
    check: (work) => !!(work?.target_reader && work.target_reader.trim().length > 0),
    autoGeneratable: false,
  },
  {
    key: 'golden_finger',
    label: '金手指/核心设定',
    check: (work) => !!(work?.golden_finger && work.golden_finger.trim().length > 0),
    autoGeneratable: true,
  },
]

/**
 * 检测作品设定是否完整
 *
 * @param work 作品对象（从 workStore 获取）
 * @returns 检测结果
 */
export function detectSettingCompleteness(work: any): SettingDetectionResult {
  const missing: MissingItem[] = []
  const completed: string[] = []

  for (const field of SETTING_FIELDS) {
    if (field.check(work)) {
      completed.push(field.label)
    } else {
      missing.push({
        type: 'setting',
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
  }
}

/**
 * 生成设定检测结果的文本描述
 */
export function formatSettingDetectionResult(result: SettingDetectionResult): string {
  if (result.complete) {
    return '✅ 作品设定已全部齐全'
  }

  const lines = [
    `📋 检测到 ${result.missing.length} 项设定缺失：`,
    '',
    ...result.missing.map(item =>
      `· ${item.label}：未设置${item.autoGeneratable ? '（可AI生成）' : ''}`
    ),
  ]

  return lines.join('\n')
}
