     1|     1|/**
     2|     2| * 阶段1：作品设定检测器
     3|     3| *
     4|     4| * 检测作品的基础设定是否完整：
     5|     5| * - 书名
     6|     6| * - 类型/题材
     7|     7| * - 简介/一句话概述
     8|     8| * - 核心卖点
     9|     9| * - 目标读者
    10|    10| * - 金手指/核心设定
    11|    11| */
    12|    12|
    13|    13|import type { MissingItem } from '../types'
    14|    14|
    15|    15|export interface SettingDetectionResult {
    16|    16|  /** 是否全部齐全 */
    17|    17|  complete: boolean
    18|    18|  /** 缺失项列表 */
    19|    19|  missing: MissingItem[]
    20|    20|  /** 已完成项列表 */
    21|    21|  completed: string[]
    22|    22|}
    23|    23|
    24|    24|/** 设定字段定义 */
    25|    25|interface SettingFieldDef {
    26|    26|  key: string
    27|    27|  label: string
    28|    28|  /** 检查函数：返回 true 表示该项已填写 */
    29|    29|  check: (work: any) => boolean
    30|    30|  /** 是否可由 AI 自动生成 */
    31|    31|  autoGeneratable?: boolean
    32|    32|}
    33|    33|
    34|    34|/** 所有设定字段定义 */
    35|    35|const SETTING_FIELDS: SettingFieldDef[] = [
    36|    36|  {
    37|    37|    key: 'title',
    38|    38|    label: '书名',
    39|    39|    check: (work) => !!(work?.title && work.title.trim().length > 0),
    40|    40|    autoGeneratable: true,
    41|    41|  },
    42|    42|  {
    43|    43|    key: 'genre',
    44|    44|    label: '类型/题材',
    45|    45|    check: (work) => !!(work?.genre && work.genre.trim().length > 0),
    46|    46|    autoGeneratable: true,
    47|    47|  },
    48|    48|  {
    49|    49|    key: 'synopsis',
    50|    50|    label: '简介/一句话概述',
    51|    51|    check: (work) => !!(work?.synopsis && work.synopsis.trim().length > 0),
    52|    52|    autoGeneratable: true,
    53|    53|  },
    54|    54|  {
    55|    55|    key: 'core_selling_point',
    56|    56|    label: '核心卖点',
    57|    57|    check: (work) => !!(work?.core_selling_point && work.core_selling_point.trim().length > 0),
    58|    58|    autoGeneratable: true,
    59|    59|  },
    60|    60|  {
    61|    61|    key: 'target_reader',
    62|    62|    label: '目标读者',
    63|    63|    check: (work) => !!(work?.target_reader && work.target_reader.trim().length > 0),
    64|    64|    autoGeneratable: false,
    65|    65|  },
    66|    66|  {
    67|    67|    key: 'golden_finger',
    68|    68|    label: '金手指/核心设定',
    69|    69|    check: (work) => !!(work?.golden_finger && work.golden_finger.trim().length > 0),
    70|    70|    autoGeneratable: true,
    71|    71|  },
    72|    72|]
    73|    73|
    74|    74|/**
    75|    75| * 检测作品设定是否完整
    76|    76| *
    77|    77| * @param work 作品对象（从 workStore 获取）
    78|    78| * @returns 检测结果
    79|    79| */
    80|    80|export function detectSettingCompleteness(work: any): SettingDetectionResult {
    81|    81|  const missing: MissingItem[] = []
    82|    82|  const completed: string[] = []
    83|    83|
    84|    84|  for (const field of SETTING_FIELDS) {
    85|    85|    if (field.check(work)) {
    86|    86|      completed.push(field.label)
    87|    87|    } else {
    88|    88|      missing.push({
    89|    89|        type: 'setting',
    90|    90|        field: field.key,
    91|    91|        label: field.label,
    92|    92|        autoGeneratable: field.autoGeneratable,
    93|    93|      })
    94|    94|    }
    95|    95|  }
    96|    96|
    97|    97|  return {
    98|    98|    complete: missing.length === 0,
    99|    99|    missing,
   100|   100|    completed,
   101|   101|  }
   102|   102|}
   103|   103|
   104|   104|/**
   105|   105| * 生成设定检测结果的文本描述
   106|   106| */
   107|   107|export function formatSettingDetectionResult(result: SettingDetectionResult): string {
   108|   108|  if (result.complete) {
   109|   109|    return '✅ 作品设定已全部齐全'
   110|   110|  }
   111|   111|
   112|   112|  const lines = [
   113|   113|    `📋 检测到 ${result.missing.length} 项设定缺失：`,
   114|   114|    '',
   115|   115|    ...result.missing.map(item =>
   116|   116|      `· ${item.label}：未设置${item.autoGeneratable ? '（可AI生成）' : ''}`
   117|   117|    ),
   118|   118|  ]
   119|   119|
   120|   120|  return lines.join('\n')
   121|   121|}
   122|   122|