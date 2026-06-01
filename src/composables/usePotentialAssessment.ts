/**
 * 网文潜力评估引擎
 *
 * 6 维度加权评分模型，评估作品在目标平台上的商业潜力。
 * 数据来源：作品设定 + 设定数据 + 平台策略矩阵 + 大纲完整度
 */

import type { WorkspaceSettingsData } from './useWorkspaceSettings'
import type { SettingEntityType } from './useSettings'

// ── 维度定义 ──

export interface AssessmentDimension {
  key: string
  label: string
  weight: number          // 0-1
  score: number           // 0-100
  subScores: { label: string; score: number; max: number; comment?: string }[]
}

export interface AssessmentResult {
  totalScore: number       // 0-100
  grade: string            // S/A/B/C/D/E
  gradeLabel: string       // 中文等级描述
  dimensions: AssessmentDimension[]
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  bestPlatforms: { id: string; name: string; score: number }[]
  assessedAt: string
}

// ── 输入数据 ──

export interface AssessmentInput {
  settings: WorkspaceSettingsData
  settingCounts: Record<string, number>        // type → count
  hasMainOutline: boolean
  hasVolumeOutlines: boolean
  hasChapterOutlines: boolean
  chapterCount: number
  chapterLengthVariance: number                // 越小越一致
  genrePlatformScores: Record<string, number>   // platformId → 0-3
  ipAdaptationPotential: string | undefined
}

// ── 等级系统 ──

const GRADE_TABLE: { grade: string; label: string; min: number }[] = [
  { grade: 'S', label: '顶级潜力 · 建议全力投入', min: 90 },
  { grade: 'A', label: '优秀 · 具备爆款潜质', min: 80 },
  { grade: 'B', label: '良好 · 值得持续耕耘', min: 70 },
  { grade: 'C', label: '一般 · 需针对性优化', min: 60 },
  { grade: 'D', label: '待提升 · 建议先完善基础', min: 40 },
  { grade: 'E', label: '起步阶段 · 需大幅完善', min: 0 },
]

// ── 热门题材（2026年趋势权重）──

const HOT_GENRES: Record<string, number> = {
  '都市': 85, '现代都市': 85, '都市异能': 90,
  '玄幻': 80, '东方玄幻': 85,
  '仙侠': 75, '古典仙侠': 80,
  '科幻': 70, '末世': 85, '星际': 75,
  '悬疑': 80, '灵异': 75, '恐怖': 70,
  '游戏': 85, '电竞': 80,
  '轻小说': 85, '同人': 60,
  '历史': 65, '架空历史': 75,
  '军事': 55,
  '武侠': 60,
  '奇幻': 70, '西方奇幻': 65,
  '言情': 75, '现代言情': 80, '古代言情': 70,
  '纯爱': 65,
  '二次元': 85,
  '短篇': 70,
  '脑洞': 90, '系统': 85, '穿越': 80, '重生': 85,
}

function genreHeatScore(genre: string, subgenre: string): number {
  const g = genre || subgenre || ''
  for (const [key, score] of Object.entries(HOT_GENRES)) {
    if (g.includes(key)) return score
  }
  return 50 // 未知题材，中等偏下
}

// ── 平台字数适合度 ──

function wordCountPlatformFit(targetWords: number, platformId: string): number {
  if (!platformId || targetWords == null) return 50
  // 各平台最优字数范围（单位：万）
  const ranges: Record<string, [number, number]> = {
    fanqie: [50, 300],
    qimao: [60, 300],
    qidian: [100, 500],
    jjwxc: [20, 80],
    faloo: [80, 500],
    ciweimao: [60, 200],
    zhihu_salt: [1, 5],
    douban_read: [10, 30],
    toutiao: [10, 300],
    xiaohongshu: [0.5, 5],
    weixin_mp: [1, 50],
    bilibili: [5, 100],
    kuaishou: [1, 30],
  }
  const range = ranges[platformId]
  if (!range) return 60
  const w = targetWords / 10000
  if (w >= range[0] && w <= range[1]) return 100
  if (w < range[0]) return Math.max(20, 100 - (range[0] - w) * 30)
  return Math.max(20, 100 - (w - range[1]) * 5)
}

// ── IP 改编潜力分数 ──

function ipPotentialScore(value: string | undefined): number {
  if (!value) return 30
  const v = value.toLowerCase()
  if (v.includes('very_high')) return 95
  if (v.includes('high') || v.includes('rising')) return 75
  if (v.includes('medium')) return 55
  if (v.includes('low')) return 25
  // 特定改编方向加分
  if (v.includes('drama') || v.includes('animation') || v.includes('anime')) return 70
  if (v.includes('publication') || v.includes('literary')) return 60
  return 45
}

// ── 核心评估函数 ──

export function assessPotential(input: AssessmentInput): AssessmentResult {
  const { settings, settingCounts } = input

  // ═══ 维度1：题材热度 (20%) ═══
  const genreHeat = genreHeatScore(settings.genre, settings.subgenre)
  const platformGenreAvg = Object.values(input.genrePlatformScores).length > 0
    ? Object.values(input.genrePlatformScores).reduce((a, b) => a + b, 0) / Object.values(input.genrePlatformScores).length
    : 0
  const marketAlignment = Math.round(platformGenreAvg / 3 * 100)
  const dim1Score = Math.round(genreHeat * 0.6 + marketAlignment * 0.4)

  const dim1: AssessmentDimension = {
    key: 'genre_heat', label: '题材热度', weight: 0.20, score: dim1Score,
    subScores: [
      { label: '题材趋势热度', score: genreHeat, max: 100, comment: settings.genre ? `"${settings.genre}" 当前市场关注度` : '未设置题材' },
      { label: '平台题材匹配', score: marketAlignment, max: 100, comment: Object.keys(input.genrePlatformScores).length > 0 ? `覆盖 ${Object.keys(input.genrePlatformScores).length} 个平台` : '未选择目标平台' },
    ],
  }

  // ═══ 维度2：设定完整度 (25%) ═══
  const charCount = settingCounts['character'] || 0
  const worldCount = settingCounts['world_setting'] || 0
  const foreshadowCount = settingCounts['foreshadowing'] || 0
  const plotArcCount = settingCounts['plot_arc'] || 0
  const itemCount = settingCounts['item'] || 0

  const charScore = Math.min(100, charCount * 15 + 10)
  const worldScore = Math.min(100, worldCount * 20)
  const foreshadowScore = Math.min(100, foreshadowCount * 20)
  const plotArcScore = Math.min(100, plotArcCount * 25)
  const itemScore = Math.min(100, (itemCount >= 2 ? 70 : itemCount * 35))
  const hasIntro = settings.intro && settings.intro.length >= 30 ? 60 : settings.intro ? 30 : 0
  const hasStyle = settings.styleDescription && settings.styleDescription.length >= 20 ? 40 : 0

  const dim2Score = Math.round(
    charScore * 0.25 + worldScore * 0.15 + foreshadowScore * 0.15 +
    plotArcScore * 0.15 + itemScore * 0.10 + hasIntro * 0.10 + hasStyle * 0.10
  )

  const dim2: AssessmentDimension = {
    key: 'setting_completeness', label: '设定完整度', weight: 0.25, score: dim2Score,
    subScores: [
      { label: '角色数量', score: charScore, max: 100, comment: `${charCount} 个角色${charCount < 3 ? '（建议 ≥3）' : charCount >= 7 ? '（角色丰富）' : ''}` },
      { label: '世界观设定', score: worldScore, max: 100, comment: `${worldCount} 条世界观${worldCount < 2 ? '（建议 ≥2）' : ''}` },
      { label: '伏笔铺设', score: foreshadowScore, max: 100, comment: `${foreshadowCount} 条伏笔${foreshadowCount < 2 ? '（建议 ≥2）' : ''}` },
      { label: '情节线', score: plotArcScore, max: 100, comment: `${plotArcCount} 条情节线${plotArcCount < 1 ? '（建议 ≥1）' : ''}` },
      { label: '物品/道具', score: itemScore, max: 100, comment: `${itemCount} 件物品` },
      { label: '作品简介', score: hasIntro, max: 100, comment: settings.intro ? '已填写' : '未填写（影响推荐转化）' },
      { label: '文风说明', score: hasStyle, max: 100, comment: settings.styleDescription ? '已填写' : '未填写（AI生成一致性会降低）' },
    ],
  }

  // ═══ 维度3：平台匹配度 (25%) ═══
  const platformId = settings.platformId
  const genrePlatformScore = platformId ? (input.genrePlatformScores[platformId] || 0) : 0
  const genreFit = Math.round(genrePlatformScore / 3 * 100)
  const wcFit = wordCountPlatformFit(settings.targetWordCount, platformId)
  const hasPlatform = !!platformId

  const dim3Score = hasPlatform
    ? Math.round(genreFit * 0.5 + wcFit * 0.3 + 60 * 0.2)
    : 30 // 未选平台

  const dim3: AssessmentDimension = {
    key: 'platform_fit', label: '平台匹配度', weight: 0.25, score: dim3Score,
    subScores: [
      { label: '题材契合度', score: genreFit, max: 100, comment: platformId ? `在当前平台的题材匹配得分` : '未选择目标平台' },
      { label: '字数适合度', score: wcFit, max: 100, comment: settings.targetWordCount ? `目标 ${(settings.targetWordCount / 10000).toFixed(0)} 万字` : '未设定目标字数' },
      { label: '平台选择', score: hasPlatform ? 100 : 20, max: 100, comment: hasPlatform ? '已选定目标平台' : '未选择平台（建议在下方选择）' },
    ],
  }

  // ═══ 维度4：商业潜力 (15%) ═══
  const ipScore = ipPotentialScore(input.ipAdaptationPotential)
  const crossPlatformAppeal = Object.values(input.genrePlatformScores).filter(s => s >= 2).length
  const crossScore = Math.min(100, crossPlatformAppeal * 25 + 20)

  const dim4Score = Math.round(ipScore * 0.6 + crossScore * 0.4)

  const dim4: AssessmentDimension = {
    key: 'commercial_potential', label: '商业潜力', weight: 0.15, score: dim4Score,
    subScores: [
      { label: 'IP改编潜力', score: ipScore, max: 100, comment: input.ipAdaptationPotential ? `平台标注：${input.ipAdaptationPotential}` : '未选择平台，无法评估' },
      { label: '跨平台适配性', score: crossScore, max: 100, comment: `${crossPlatformAppeal} 个平台匹配度 ≥ 2/3` },
    ],
  }

  // ═══ 维度5：结构完整度 (10%) ═══
  const outlineScore = (input.hasMainOutline ? 35 : 0) + (input.hasVolumeOutlines ? 25 : 0) + (input.hasChapterOutlines ? 20 : 0)
  const chapterEnough = input.chapterCount >= 10 ? 15 : input.chapterCount >= 3 ? 8 : 0
  const consistencyScore = Math.max(0, 100 - input.chapterLengthVariance * 2)
  const structScore = Math.min(100, outlineScore + chapterEnough + Math.round(consistencyScore * 0.05))

  const dim5Score = Math.round(structScore)

  const dim5: AssessmentDimension = {
    key: 'structural_integrity', label: '结构完整度', weight: 0.10, score: dim5Score,
    subScores: [
      { label: '总纲', score: input.hasMainOutline ? 35 : 0, max: 35, comment: input.hasMainOutline ? '已生成' : '未生成（建议先生成总纲）' },
      { label: '卷纲', score: input.hasVolumeOutlines ? 25 : 0, max: 25, comment: input.hasVolumeOutlines ? '已生成' : '未生成' },
      { label: '章纲', score: input.hasChapterOutlines ? 20 : 0, max: 20, comment: input.hasChapterOutlines ? '已生成' : '未生成' },
      { label: '章节数量', score: chapterEnough, max: 15, comment: `已写 ${input.chapterCount} 章` },
      { label: '章节长度一致性', score: Math.round(consistencyScore * 0.05), max: 5, comment: consistencyScore >= 90 ? '长度一致' : consistencyScore >= 70 ? '略有波动' : '长度波动较大' },
    ],
  }

  // ═══ 维度6：差异化程度 (5%) ═══
  const tagCount = (settings.tags || []).length
  const tagScore = Math.min(100, tagCount * 15 + 10)
  const hasPowerSystem = settings.powerSystem && settings.powerSystem.length >= 20
  const hasCheat = settings.cheatAbility && settings.cheatAbility.length >= 20
  const hasWorld = settings.worldSetting && settings.worldSetting.length >= 30
  const uniquenessScore = (hasPowerSystem ? 35 : 10) + (hasCheat ? 35 : 10) + (hasWorld ? 30 : 10)

  const dim6Score = Math.round(tagScore * 0.3 + uniquenessScore * 0.7)

  const dim6: AssessmentDimension = {
    key: 'differentiation', label: '差异化程度', weight: 0.05, score: dim6Score,
    subScores: [
      { label: '标签覆盖', score: tagScore, max: 100, comment: `${tagCount} 个标签${tagCount < 3 ? '（建议 ≥3）' : tagCount >= 5 ? '（标签丰富）' : ''}` },
      { label: '力量体系独创性', score: hasPowerSystem ? 70 : 20, max: 70, comment: hasPowerSystem ? '已设定' : '未设定（建议填写）' },
      { label: '金手指独特性', score: hasCheat ? 70 : 20, max: 70, comment: hasCheat ? '已设定' : '未设定（建议填写）' },
      { label: '世界观丰富度', score: hasWorld ? 60 : 20, max: 60, comment: hasWorld ? '已扩写' : '未扩写' },
    ],
  }

  // ═══ 加权总分 ═══
  const dimensions = [dim1, dim2, dim3, dim4, dim5, dim6]
  const totalScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  )

  // ═══ 等级判定 ═══
  const gradeEntry = GRADE_TABLE.find(g => totalScore >= g.min) || GRADE_TABLE[GRADE_TABLE.length - 1]

  // ═══ 优势 / 劣势 / 建议 ═══
  const strengths: string[] = []
  const weaknesses: string[] = []
  const suggestions: string[] = []

  for (const d of dimensions) {
    if (d.score >= 75) {
      strengths.push(`${d.label}：${d.score} 分 — 表现优异`)
    } else if (d.score < 45) {
      weaknesses.push(`${d.label}：${d.score} 分 — 需重点关注`)
      const firstLow = d.subScores.find(s => s.score < s.max * 0.4)
      if (firstLow) suggestions.push(`提升「${d.label}」→ 优先完善「${firstLow.label}」`)
    }
  }

  // 具体建议
  if (charCount < 3) suggestions.push('角色不足 3 个：前往「设定数据」面板添加主要角色')
  if (!settings.platformId) suggestions.push('未选择目标平台：在下方「发布平台」中选择，以获取精准匹配评估')
  if (!input.hasMainOutline) suggestions.push('未生成总纲：前往「大纲设定」面板生成全书总纲')
  if (!settings.intro) suggestions.push('未填写作品简介：在「基础信息」卡片中点击 AI 简介生成')
  if (!settings.powerSystem && !settings.cheatAbility) suggestions.push('力量体系与金手指均未设定：建议至少填写一项以提升差异化')
  if (tagCount < 3) suggestions.push('标签不足 3 个：点击「编辑标签」丰富作品定位')

  // ═══ 最佳平台推荐 ═══
  const bestPlatforms = Object.entries(input.genrePlatformScores)
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => {
      const nameMap: Record<string, string> = {
        fanqie: '番茄小说', qimao: '七猫小说', qidian: '起点中文网',
        jjwxc: '晋江文学城', faloo: '飞卢小说', ciweimao: '刺猬猫',
        zhihu_salt: '知乎盐选', douban_read: '豆瓣阅读',
        toutiao: '今日头条', xiaohongshu: '小红书', weixin_mp: '微信公众号',
      }
      return { id, name: nameMap[id] || id, score: Math.round(score / 3 * 100) }
    })

  if (bestPlatforms.length === 0 && settings.genre) {
    bestPlatforms.push({ id: 'fanqie', name: '番茄小说', score: 50 })
    bestPlatforms.push({ id: 'qidian', name: '起点中文网', score: 45 })
  }

  return {
    totalScore,
    grade: gradeEntry.grade,
    gradeLabel: gradeEntry.label,
    dimensions,
    strengths: strengths.length > 0 ? strengths : ['暂无突出优势项，建议全面完善作品设定'],
    weaknesses: weaknesses.length > 0 ? weaknesses : ['各项指标基本达标，继续深化设定可冲击更高等级'],
    suggestions: suggestions.slice(0, 6),
    bestPlatforms,
    assessedAt: new Date().toISOString(),
  }
}

// ── LLM 增强评估 ──

export interface LLMAnalysis {
  marketTrends: string         // 当前市场趋势分析
  genrePotential: string       // 该题材在目标平台的潜力评估
  competitiveEdge: string      // 作品差异化竞争优势
  riskFactors: string          // 潜在风险
  monetizationTips: string     // 变现建议
  rawResponse: string          // LLM 原始输出
}

export interface EnrichedAssessmentResult extends AssessmentResult {
  llmAnalysis?: LLMAnalysis
  searchQueries?: string[]
  searchSummary?: string       // 搜索摘要
  assessmentMode: 'algorithm' | 'llm' | 'llm_search'
}

/** 构建搜索查询 */
export function buildSearchQueries(settings: WorkspaceSettingsData): string[] {
  const queries: string[] = []
  const genre = settings.genre || settings.subgenre || '网文'
  const platform = settings.platformId || ''

  queries.push(`${genre} 网文 市场趋势 2026`)

  if (platform) {
    const platformNames: Record<string, string> = {
      fanqie: '番茄小说', qidian: '起点中文网', qimao: '七猫小说',
      jjwxc: '晋江文学城', faloo: '飞卢小说', ciweimao: '刺猬猫',
      zhihu_salt: '知乎盐选', douban_read: '豆瓣阅读',
      toutiao: '今日头条', xiaohongshu: '小红书', weixin_mp: '微信公众号',
    }
    const pname = platformNames[platform] || platform
    queries.push(`${pname} 热门题材 推荐 2026`)
  }

  if (settings.tags && settings.tags.length > 0) {
    queries.push(`${settings.tags.slice(0, 3).join(' ')} 网文 爆款 趋势`)
  }

  queries.push(`${genre} 小说 IP改编 影视 短剧 2026`)
  return queries
}

/** 构建 LLM 市场分析提示词 */
export function buildLLMAnalysisPrompt(
  input: AssessmentInput,
  algoResult: AssessmentResult,
  searchContext?: string,
): string {
  const s = input.settings
  return `你是一位资深的网文市场分析师和IP孵化顾问。请基于以下作品信息，对其市场潜力和商业价值进行深度分析。

## 作品基础信息
- 书名：${s.title || '未命名'}
- 题材：${s.genre || '未设置'} / ${s.subgenre || '未设置'}
- 标签：${(s.tags || []).join('、') || '未设置'}
- 目标平台：${s.platformId || '未选择'}
- 目标字数：${s.targetWordCount ? (s.targetWordCount / 10000).toFixed(0) + '万字' : '未设定'}
- 视角：${s.pov || '未设定'}
- 作品简介：${s.intro || '未填写'}
- 文风说明：${s.styleDescription || '未填写'}

## 设定完整度
- 角色：${input.settingCounts['character'] || 0} 个
- 世界观设定：${input.settingCounts['world_setting'] || 0} 条
- 伏笔：${input.settingCounts['foreshadowing'] || 0} 条
- 情节线：${input.settingCounts['plot_arc'] || 0} 条
- 物品/道具：${input.settingCounts['item'] || 0} 件

## 结构状态
- 总纲：${input.hasMainOutline ? '已生成' : '未生成'}
- 卷纲：${input.hasVolumeOutlines ? '已生成' : '未生成'}
- 章纲：${input.hasChapterOutlines ? '已生成' : '未生成'}
- 已写章节：${input.chapterCount} 章

## 核心构架
- 世界观/背景：${s.worldSetting || '未填写'}
- 主角设定：${s.mainCharacter || '未填写'}
- 力量体系：${s.powerSystem || '未填写'}
- 金手指：${s.cheatAbility || '未填写'}

## 算法预评估
- 总分：${algoResult.totalScore}/100 (${algoResult.grade}级)
- 题材热度：${algoResult.dimensions[0].score}/100
- 设定完整度：${algoResult.dimensions[1].score}/100
- 平台匹配度：${algoResult.dimensions[2].score}/100
- 商业潜力：${algoResult.dimensions[3].score}/100
- 结构完整度：${algoResult.dimensions[4].score}/100
- 差异化程度：${algoResult.dimensions[5].score}/100

${searchContext ? `## 市场情报（实时搜索）\n${searchContext}` : '## 市场情报\n请基于你的训练数据知识，提供当前（2026年）该题材的市场趋势分析。'}

---
请按以下结构输出分析报告（JSON格式，不要markdown代码块）：

{
  "marketTrends": "该题材在当前市场的整体趋势和热度分析（2-3句话）",
  "genrePotential": "该题材在目标平台的发展潜力和读者接受度（2-3句话）",
  "competitiveEdge": "这部作品的差异化优势和竞争壁垒（2-3句话）",
  "riskFactors": "需要注意的市场风险和创作陷阱（2-3句话）",
  "monetizationTips": "变现路径建议，包括IP改编方向（2-3句话）"
}

要求：每条分析具体、可操作，避免空洞套话。引用具体数据和趋势。`
}

/** 解析 LLM 返回的 JSON 分析 */
export function parseLLMAnalysis(rawText: string): LLMAnalysis | null {
  try {
    // 尝试提取 JSON
    const jsonMatch = rawText.match(/\{[\s\S]*"marketTrends"[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    return {
      marketTrends: parsed.marketTrends || '',
      genrePotential: parsed.genrePotential || '',
      competitiveEdge: parsed.competitiveEdge || '',
      riskFactors: parsed.riskFactors || '',
      monetizationTips: parsed.monetizationTips || '',
      rawResponse: rawText,
    }
  } catch {
    // JSON 解析失败，用原始文本填充 marketTrends
    return {
      marketTrends: rawText.slice(0, 500),
      genrePotential: '',
      competitiveEdge: '',
      riskFactors: '',
      monetizationTips: '',
      rawResponse: rawText,
    }
  }
}
