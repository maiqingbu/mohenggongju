<template>
  <Teleport to="body">
    <div class="pam-overlay" @click.self="emit('close')">
      <div class="pam-root" :class="isDark !== false ? 'pam-dark' : 'pam-light'">
        <!-- Header -->
        <div class="pam-header">
          <div class="pam-header-left">
            <h2 class="pam-title">📊 网文潜力评估</h2>
            <span class="pam-subtitle">6 维度加权模型 · 实时分析</span>
          </div>
          <div class="pam-header-right">
            <button class="pam-btn-text" @click="refresh" :disabled="refreshing">
              {{ refreshing ? loadingText : '刷新评估' }}
            </button>
            <button class="pam-close" @click="emit('close')">✕</button>
          </div>
        </div>

        <!-- Body -->
        <div class="pam-body" v-if="result">
          <!-- 总览卡片 -->
          <div class="pam-overview">
            <div class="pam-score-ring">
              <svg viewBox="0 0 120 120" class="pam-ring-svg">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--ring-bg, rgba(128,128,128,0.12))" stroke-width="8" />
                <circle cx="60" cy="60" r="52" fill="none"
                  :stroke="gradeColor"
                  stroke-width="8"
                  stroke-linecap="round"
                  :stroke-dasharray="circumference"
                  :stroke-dashoffset="dashOffset"
                  transform="rotate(-90 60 60)"
                  class="pam-ring-progress"
                />
              </svg>
              <div class="pam-score-inner">
                <span class="pam-score-num" :style="{ color: gradeColor }">{{ result.totalScore }}</span>
                <span class="pam-score-unit">分</span>
              </div>
            </div>
            <div class="pam-overview-info">
              <div class="pam-grade-badge" :style="{ background: gradeColor }">{{ result.grade }}</div>
              <p class="pam-grade-label">{{ result.gradeLabel }}</p>
              <div class="pam-meta-row">
                <span>{{ settings?.title || '未命名作品' }}</span>
                <span class="pam-meta-dot">·</span>
                <span>{{ settings?.genre || '未分类' }}</span>
                <span class="pam-meta-dot">·</span>
                <span>{{ settings?.platformId ? platformName : '未选平台' }}</span>
              </div>
            </div>
          </div>

          <!-- 雷达图 + 维度明细 -->
          <div class="pam-main-grid">
            <!-- 雷达图 -->
            <div class="pam-radar-card">
              <h3 class="pam-card-title">能力雷达图</h3>
              <div class="pam-radar-wrap">
                <svg viewBox="-140 -140 280 280" class="pam-radar-svg">
                  <!-- 网格 -->
                  <polygon v-for="r in [0.25, 0.5, 0.75, 1]" :key="r"
                    :points="radarPoints(r)"
                    fill="none"
                    :stroke="isDark !== false ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'"
                    stroke-width="0.5"
                  />
                  <!-- 轴 -->
                  <line v-for="(axis, i) in radarAxes" :key="'axis'+i"
                    :x1="0" :y1="0"
                    :x2="axis.x" :y2="axis.y"
                    :stroke="isDark !== false ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'"
                    stroke-width="0.5"
                  />
                  <!-- 数据多边形 -->
                  <polygon
                    :points="radarDataPoints"
                    :fill="gradeColor"
                    fill-opacity="0.15"
                    :stroke="gradeColor"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  />
                  <!-- 数据点 -->
                  <circle v-for="(pt, i) in radarDataPts" :key="'pt'+i"
                    :cx="pt.x" :cy="pt.y" r="3"
                    :fill="gradeColor"
                    stroke="#fff"
                    stroke-width="1"
                  />
                  <!-- 标签 -->
                  <text v-for="(axis, i) in radarAxes" :key="'lbl'+i"
                    :x="axis.labelX" :y="axis.labelY"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    :fill="isDark !== false ? '#aaa' : '#666'"
                    font-size="11"
                  >{{ axis.label }}</text>
                  <!-- 分数标注 -->
                  <text v-for="(axis, i) in radarAxes" :key="'s'+i"
                    :x="axis.scoreX" :y="axis.scoreY"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    :fill="gradeColor"
                    font-size="10"
                    font-weight="600"
                  >{{ result.dimensions[i].score }}</text>
                </svg>
              </div>
            </div>

            <!-- 维度明细 -->
            <div class="pam-dims-card">
              <h3 class="pam-card-title">维度明细</h3>
              <div class="pam-dim-list">
                <div v-for="d in result.dimensions" :key="d.key" class="pam-dim-item">
                  <div class="pam-dim-head">
                    <span class="pam-dim-label">{{ d.label }}</span>
                    <span class="pam-dim-weight">权重 {{ (d.weight * 100).toFixed(0) }}%</span>
                    <span class="pam-dim-score" :style="{ color: dimColor(d.score) }">{{ d.score }}</span>
                  </div>
                  <div class="pam-dim-bar-track">
                    <div class="pam-dim-bar-fill"
                      :style="{ width: d.score + '%', background: dimColor(d.score) }"
                    ></div>
                  </div>
                  <div class="pam-dim-subs">
                    <span v-for="s in d.subScores.slice(0, 4)" :key="s.label" class="pam-dim-sub">
                      {{ s.label }} {{ s.score }}/{{ s.max }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部：优势/劣势/建议 -->
          <div class="pam-bottom-grid">
            <div class="pam-insight-card">
              <h3 class="pam-card-title">✅ 优势</h3>
              <ul class="pam-insight-list">
                <li v-for="s in result.strengths" :key="s">{{ s }}</li>
              </ul>
            </div>
            <div class="pam-insight-card">
              <h3 class="pam-card-title">⚠️ 短板</h3>
              <ul class="pam-insight-list">
                <li v-for="w in result.weaknesses" :key="w">{{ w }}</li>
              </ul>
            </div>
            <div class="pam-insight-card">
              <h3 class="pam-card-title">💡 优化建议</h3>
              <ul class="pam-insight-list">
                <li v-for="sg in result.suggestions" :key="sg">{{ sg }}</li>
              </ul>
            </div>
          </div>

          <!-- 平台推荐 -->
          <div class="pam-platforms-card" v-if="result.bestPlatforms.length > 0">
            <h3 class="pam-card-title">🎯 推荐发布平台</h3>
            <div class="pam-platform-list">
              <div v-for="(p, i) in result.bestPlatforms" :key="p.id" class="pam-platform-item">
                <span class="pam-platform-rank">{{ i + 1 }}</span>
                <span class="pam-platform-name">{{ p.name }}</span>
                <div class="pam-platform-bar-track">
                  <div class="pam-platform-bar-fill" :style="{ width: p.score + '%', background: dimColor(p.score) }"></div>
                </div>
                <span class="pam-platform-score">{{ p.score }}%</span>
              </div>
            </div>
          </div>

          <!-- LLM 市场分析 -->
          <div v-if="llmAnalysis" class="pam-llm-card">
            <div class="pam-llm-header">
              <h3 class="pam-card-title">🤖 AI 市场分析</h3>
              <span class="pam-llm-badge" :class="result?.assessmentMode === 'llm_search' ? 'pam-badge-search' : 'pam-badge-llm'">
                {{ result?.assessmentMode === 'llm_search' ? '🔍 实时搜索 + LLM' : '🧠 LLM 分析' }}
              </span>
            </div>
            <div class="pam-llm-grid">
              <div class="pam-llm-item">
                <span class="pam-llm-label">📈 市场趋势</span>
                <p class="pam-llm-text">{{ llmAnalysis.marketTrends }}</p>
              </div>
              <div class="pam-llm-item">
                <span class="pam-llm-label">🎯 题材潜力</span>
                <p class="pam-llm-text">{{ llmAnalysis.genrePotential }}</p>
              </div>
              <div class="pam-llm-item">
                <span class="pam-llm-label">⚔️ 竞争优势</span>
                <p class="pam-llm-text">{{ llmAnalysis.competitiveEdge }}</p>
              </div>
              <div class="pam-llm-item">
                <span class="pam-llm-label">⚠️ 风险因素</span>
                <p class="pam-llm-text">{{ llmAnalysis.riskFactors }}</p>
              </div>
              <div class="pam-llm-item pam-llm-full">
                <span class="pam-llm-label">💰 变现建议</span>
                <p class="pam-llm-text">{{ llmAnalysis.monetizationTips }}</p>
              </div>
            </div>
            <div v-if="searchSummary" class="pam-search-meta">
              <span>{{ searchSummary }}</span>
              <span v-if="result?.searchQueries" class="pam-search-queries">
                关键词：{{ result?.searchQueries?.join(' · ') }}
              </span>
            </div>
          </div>

          <!-- 无搜索 Key 提示 -->
          <div v-if="!hasSearchKey && !refreshing && result" class="pam-nokey-hint">
            <span>💡 配置 Tavily Search API Key 可获取实时市场数据，评估更精准。</span>
            <button class="pam-link-btn" @click="showKeyInput = !showKeyInput">
              {{ showKeyInput ? '收起' : '配置 Key' }}
            </button>
            <div v-if="showKeyInput" class="pam-key-row">
              <input
                v-model="searchKeyDraft"
                class="pam-key-input"
                type="password"
                placeholder="输入 Tavily Search API Key"
                @keyup.enter="saveSearchKey"
              />
              <button class="pam-btn-text sm" @click="saveSearchKey">保存</button>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div class="pam-body pam-loading" v-else-if="!result">
          <div class="pam-spinner"></div>
          <p>{{ refreshing ? loadingText : '正在分析作品潜力...' }}</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  assessPotential,
  buildSearchQueries,
  buildLLMAnalysisPrompt,
  parseLLMAnalysis,
  type AssessmentResult,
  type AssessmentInput,
  type LLMAnalysis,
  type EnrichedAssessmentResult,
} from '../composables/usePotentialAssessment'
import { WorkspaceSettings, type WorkspaceSettingsData } from '../composables/useWorkspaceSettings'
import { SettingsManager } from '../composables/useSettings'
import { getGenreScore } from '../composables/usePlatformData'
import { getOutline } from '../composables/useOutlines'
import { isTauri, localCurrentWorkId } from '../composables/useLocalWorkTree'
import { useWorkRepo } from '../composables/useWorkRepo'
import { useLLM } from '../composables/useLLM'
import { getSearchApiKey, setSearchApiKey, parallelSearch } from '../composables/useWebSearch'

const props = defineProps<{
  isDark?: boolean | null
  workId: number
  settings?: WorkspaceSettingsData | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const refreshing = ref(false)
const refreshPhase = ref<'algorithm' | 'search' | 'llm' | 'done'>('algorithm')
const result = ref<EnrichedAssessmentResult | null>(null)
const llmAnalysis = ref<LLMAnalysis | null>(null)
const searchSummary = ref('')
const hasSearchKey = computed(() => !!getSearchApiKey())

const { generate, generating: llmGenerating } = useLLM()

const loadingText = computed(() => {
  switch (refreshPhase.value) {
    case 'algorithm': return '正在计算结构维度评分...'
    case 'search': return '正在搜索最新市场情报...'
    case 'llm': return 'AI 正在分析市场潜力...'
    default: return '正在分析作品潜力...'
  }
})

const showKeyInput = ref(false)
const searchKeyDraft = ref(getSearchApiKey() || '')

function saveSearchKey() {
  setSearchApiKey(searchKeyDraft.value.trim())
  showKeyInput.value = false
}

const platformName = computed(() => {
  if (!props.settings?.platformId) return '未选平台'
  const map: Record<string, string> = {
    fanqie: '番茄小说', qimao: '七猫小说', qidian: '起点中文网',
    jjwxc: '晋江文学城', faloo: '飞卢小说', ciweimao: '刺猬猫',
    zhihu_salt: '知乎盐选', douban_read: '豆瓣阅读',
    toutiao: '今日头条', xiaohongshu: '小红书', weixin_mp: '微信公众号',
  }
  return map[props.settings.platformId] || props.settings.platformId
})

// ── 收集评估数据 ──

async function collectInput(): Promise<AssessmentInput> {
  const settings = props.settings || new WorkspaceSettings(props.workId).data

  // 设定条目统计
  const mgr = new SettingsManager()
  if (props.workId) {
    try { await mgr.load(props.workId) } catch {}
  }
  const settingCounts: Record<string, number> = {}
  for (const type of ['character', 'world_setting', 'item', 'foreshadowing', 'plot_arc'] as const) {
    settingCounts[type] = mgr.listByType(type).filter(e => !e.deprecated).length
  }

  // 大纲完整度
  const repo = useWorkRepo()
  let hasMainOutline = false
  let hasVolumeOutlines = false
  let hasChapterOutlines = false
  try {
    const mainOutline = await getOutline('main', props.workId)
    hasMainOutline = !!(mainOutline?.content && mainOutline.content.length > 50)
    // 检查卷纲
    const allChs = Object.values(repo.chapterMap.value || {}).flat()
    hasVolumeOutlines = allChs.length > 0
    const chOutline = allChs.length > 0 ? await getOutline('chapter', allChs[0]?.id) : null
    hasChapterOutlines = !!(chOutline?.content || chOutline?.structuredData)
  } catch {}

  // 章节一致性
  const allChapters = Object.values(repo.chapterMap.value || {}).flat()
  const chapterCount = allChapters.length
  let chapterLengthVariance = 0
  if (chapterCount >= 2) {
    const lengths = allChapters.map((c: any) => c.wordCount || c.content?.length || 0)
    const avg = lengths.reduce((a: number, b: number) => a + b, 0) / lengths.length
    if (avg > 0) {
      chapterLengthVariance = Math.sqrt(
        lengths.reduce((sum: number, l: number) => sum + (l - avg) ** 2, 0) / lengths.length
      ) / avg * 100
    }
  }

  // 平台题材匹配
  const genrePlatformScores: Record<string, number> = {}
  const genre = settings.genre || settings.subgenre || ''
  if (genre) {
    const platforms = ['fanqie', 'qimao', 'qidian', 'jjwxc', 'faloo', 'ciweimao', 'zhihu_salt', 'douban_read', 'toutiao', 'xiaohongshu', 'weixin_mp']
    for (const pid of platforms) {
      const s = getGenreScore(pid, genre)
      if (s > 0) genrePlatformScores[pid] = s
    }
  }

  // IP改编潜力
  let ipAdaptationPotential: string | undefined
  if (settings.platformId) {
    try {
      const strategies = (await import('../data/platform_strategies.json')).default
      const found = (strategies as any[]).find((s: any) => s.id === settings.platformId)
      ipAdaptationPotential = found?.ip_adaptation_potential
    } catch {}
  }

  return {
    settings,
    settingCounts,
    hasMainOutline,
    hasVolumeOutlines,
    hasChapterOutlines,
    chapterCount,
    chapterLengthVariance,
    genrePlatformScores,
    ipAdaptationPotential,
  }
}

async function refresh() {
  refreshing.value = true
  llmAnalysis.value = null
  searchSummary.value = ''

  try {
    // 阶段1：算法评估（快速）
    refreshPhase.value = 'algorithm'
    const input = await collectInput()
    await new Promise(r => setTimeout(r, 200))
    const algoResult = assessPotential(input)
    result.value = { ...algoResult, assessmentMode: 'algorithm' }

    // 阶段2：Web 搜索（可选，需要 API Key）
    let searchContext = ''
    const queries = buildSearchQueries(input.settings)

    if (hasSearchKey.value && queries.length > 0) {
      refreshPhase.value = 'search'
      try {
        const searchResult = await parallelSearch(queries.slice(0, 3))
        searchContext = searchResult.mergedContent
        searchSummary.value = `搜索了 ${queries.length} 个关键词，获取 ${searchResult.searches.filter(s => s.response.results.length > 0).length} 组结果`
      } catch (e) {
        console.warn('[PotentialAssessment] 搜索失败，回退到 LLM-only 模式:', e)
        searchSummary.value = '搜索未配置或失败，使用 LLM 内嵌知识分析'
      }
    }

    // 阶段3：LLM 市场分析
    refreshPhase.value = 'llm'
    const llmPrompt = buildLLMAnalysisPrompt(input, algoResult, searchContext || undefined)

    try {
      const llmOutput = await generate({
        systemPrompt: '你是专业的网文市场分析师。只输出要求的JSON格式，不要markdown代码块，不要任何解释文字。',
        userPrompt: llmPrompt,
        maxTokens: 2048,
      })

      const parsed = parseLLMAnalysis(llmOutput)
      if (parsed) {
        llmAnalysis.value = parsed
        // 用 LLM 分析增强结果
        const enhancedSuggestions = [...algoResult.suggestions]
        if (parsed.riskFactors && !enhancedSuggestions.includes(parsed.riskFactors)) {
          enhancedSuggestions.push(`市场风险：${parsed.riskFactors}`)
        }
        if (parsed.monetizationTips && !enhancedSuggestions.includes(parsed.monetizationTips)) {
          enhancedSuggestions.push(`变现建议：${parsed.monetizationTips}`)
        }

        result.value = {
          ...algoResult,
          llmAnalysis: parsed,
          searchQueries: queries,
          searchSummary: searchSummary.value || (hasSearchKey.value ? '搜索完成' : '未配置搜索 Key，基于 LLM 训练数据分析'),
          suggestions: enhancedSuggestions.slice(0, 8),
          assessmentMode: hasSearchKey.value && searchContext ? 'llm_search' : 'llm',
        }
      }
    } catch (e) {
      console.warn('[PotentialAssessment] LLM 分析失败，保留算法评估:', e)
      result.value = {
        ...algoResult,
        searchQueries: queries,
        searchSummary: searchSummary.value || 'LLM 调用失败',
        assessmentMode: 'algorithm',
      }
    }
  } catch (e) {
    console.error('[PotentialAssessment] 评估失败:', e)
  } finally {
    refreshing.value = false
    refreshPhase.value = 'done'
  }
}

// ── 雷达图计算 ──

const radarAxes = computed(() => {
  if (!result.value) return []
  const dims = result.value.dimensions
  const count = dims.length
  const angleStep = (2 * Math.PI) / count
  const startAngle = -Math.PI / 2 // 从顶部开始

  return dims.map((d, i) => {
    const angle = startAngle + i * angleStep
    const r = 120 // 最大半径
    return {
      label: d.label,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      labelX: Math.cos(angle) * (r + 24),
      labelY: Math.sin(angle) * (r + 24),
      scoreX: Math.cos(angle) * (r + 40),
      scoreY: Math.sin(angle) * (r + 40),
    }
  })
})

function radarPoints(ratio: number): string {
  return radarAxes.value.map(a => `${a.x * ratio},${a.y * ratio}`).join(' ')
}

const radarDataPts = computed(() => {
  if (!result.value) return []
  return result.value.dimensions.map((d, i) => {
    const axis = radarAxes.value[i]
    const ratio = d.score / 100
    return { x: axis.x * ratio, y: axis.y * ratio }
  })
})

const radarDataPoints = computed(() => {
  return radarDataPts.value.map(p => `${p.x},${p.y}`).join(' ')
})

// ── 环形进度条 ──

const circumference = 2 * Math.PI * 52
const dashOffset = computed(() => {
  if (!result.value) return circumference
  return circumference - (result.value.totalScore / 100) * circumference
})

const gradeColor = computed(() => {
  if (!result.value) return '#aaa'
  const s = result.value.totalScore
  if (s >= 90) return '#ffd700' // S - 金
  if (s >= 80) return '#52c8a0' // A - 绿
  if (s >= 70) return '#4a9eff' // B - 蓝
  if (s >= 60) return '#f0a040' // C - 橙
  if (s >= 40) return '#e08060' // D
  return '#e05050'             // E - 红
})

function dimColor(score: number): string {
  if (score >= 75) return '#52c8a0'
  if (score >= 50) return '#f0a040'
  return '#e05050'
}

onMounted(() => { refresh() })
watch(() => props.workId, () => { if (props.workId) refresh() })
</script>

<style scoped>
.pam-overlay {
  position: fixed; inset: 0; z-index: 10020;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}
.pam-root {
  width: 860px; max-height: 90vh; border-radius: 14px;
  display: flex; flex-direction: column;
  box-shadow: 0 12px 60px rgba(0,0,0,0.4);
  border: 1px solid rgba(128,128,128,0.12);
  overflow: hidden;
}
.pam-dark { background: #1a1a20; color: #d4d4d4; --ring-bg: rgba(255,255,255,0.08); }
.pam-light { background: #fff; color: #1a1a1a; --ring-bg: rgba(0,0,0,0.08); }

/* Header */
.pam-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 22px; border-bottom: 1px solid rgba(128,128,128,0.1);
  flex-shrink: 0;
}
.pam-header-left { display: flex; align-items: baseline; gap: 10px; }
.pam-title { margin: 0; font-size: 17px; font-weight: 700; }
.pam-subtitle { font-size: 11px; opacity: 0.4; }
.pam-header-right { display: flex; align-items: center; gap: 8px; }
.pam-btn-text {
  background: rgba(82,200,160,0.12); border: 1px solid rgba(82,200,160,0.25);
  border-radius: 6px; padding: 5px 14px; font-size: 12px; cursor: pointer;
  font-family: inherit; color: #52c8a0;
  transition: background 0.15s;
}
.pam-btn-text:hover { background: rgba(82,200,160,0.2); }
.pam-btn-text:disabled { opacity: 0.5; cursor: not-allowed; }
.pam-close {
  width: 28px; height: 28px; border: none; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer; font-size: 15px; opacity: 0.4;
}
.pam-close:hover { opacity: 1; background: rgba(128,128,128,0.1); }

/* Body */
.pam-body {
  flex: 1; overflow-y: auto; padding: 20px 22px;
}
.pam-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 300px; gap: 12px; opacity: 0.5;
}
.pam-spinner {
  width: 32px; height: 32px; border: 3px solid rgba(128,128,128,0.15);
  border-top-color: #52c8a0; border-radius: 50%;
  animation: pam-spin 0.7s linear infinite;
}
@keyframes pam-spin { to { transform: rotate(360deg); } }

/* Overview */
.pam-overview {
  display: flex; align-items: center; gap: 28px;
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 20px 24px; margin-bottom: 18px;
}
.pam-score-ring { position: relative; width: 120px; height: 120px; flex-shrink: 0; }
.pam-ring-svg { width: 100%; height: 100%; }
.pam-ring-progress { transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
.pam-score-inner {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.pam-score-num { font-size: 36px; font-weight: 800; line-height: 1; }
.pam-score-unit { font-size: 12px; opacity: 0.4; margin-top: -2px; }
.pam-overview-info { display: flex; flex-direction: column; gap: 6px; }
.pam-grade-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 8px; font-size: 18px; font-weight: 800; color: #fff;
}
.pam-grade-label { font-size: 14px; font-weight: 500; margin: 0; }
.pam-meta-row { font-size: 11px; opacity: 0.4; display: flex; align-items: center; gap: 4px; }
.pam-meta-dot { opacity: 0.3; }

/* Main grid */
.pam-main-grid {
  display: grid; grid-template-columns: 320px 1fr; gap: 18px; margin-bottom: 18px;
}
.pam-card-title {
  font-size: 13px; font-weight: 600; margin: 0 0 14px;
  opacity: 0.7; text-transform: uppercase; letter-spacing: 0.5px;
}

/* Radar */
.pam-radar-card {
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 16px 18px;
}
.pam-radar-wrap { display: flex; justify-content: center; }
.pam-radar-svg { width: 280px; height: 280px; }

/* Dimension list */
.pam-dims-card {
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 16px 18px;
}
.pam-dim-list { display: flex; flex-direction: column; gap: 12px; }
.pam-dim-item {}
.pam-dim-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.pam-dim-label { font-size: 12px; font-weight: 600; min-width: 64px; }
.pam-dim-weight { font-size: 10px; opacity: 0.35; }
.pam-dim-score { font-size: 18px; font-weight: 700; margin-left: auto; }
.pam-dim-bar-track {
  height: 4px; border-radius: 2px; background: rgba(128,128,128,0.1); overflow: hidden; margin-bottom: 4px;
}
.pam-dim-bar-fill {
  height: 100%; border-radius: 2px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.pam-dim-subs {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
}
.pam-dim-sub { font-size: 10px; opacity: 0.35; }

/* Bottom grid */
.pam-bottom-grid {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 18px;
}
.pam-insight-card {
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 14px 16px;
}
.pam-insight-list {
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: 6px;
}
.pam-insight-list li {
  font-size: 11px; line-height: 1.5; opacity: 0.7;
}
.pam-insight-list li::before {
  content: ''; display: inline-block; width: 5px; height: 5px;
  border-radius: 50%; margin-right: 6px; vertical-align: middle;
  background: currentColor; opacity: 0.4;
}

/* Platform recommendations */
.pam-platforms-card {
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 16px 18px;
}
.pam-platform-list { display: flex; flex-direction: column; gap: 8px; }
.pam-platform-item { display: flex; align-items: center; gap: 10px; }
.pam-platform-rank {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; background: rgba(128,128,128,0.1);
}
.pam-platform-name { font-size: 12px; font-weight: 500; min-width: 80px; }
.pam-platform-bar-track {
  flex: 1; height: 6px; border-radius: 3px; background: rgba(128,128,128,0.1); overflow: hidden;
}
.pam-platform-bar-fill {
  height: 100%; border-radius: 3px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.pam-platform-score { font-size: 12px; font-weight: 600; min-width: 36px; text-align: right; }

/* LLM Analysis Card */
.pam-llm-card {
  background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 12px; padding: 16px 18px; margin-top: 18px;
}
.pam-llm-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;
}
.pam-llm-badge {
  font-size: 10px; padding: 2px 8px; border-radius: 8px; font-weight: 600;
}
.pam-badge-search { background: rgba(82,200,160,0.15); color: #52c8a0; }
.pam-badge-llm { background: rgba(74,158,255,0.15); color: #4a9eff; }
.pam-llm-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.pam-llm-item {
  background: rgba(128,128,128,0.02); border-radius: 8px; padding: 10px 12px;
}
.pam-llm-full { grid-column: 1 / -1; }
.pam-llm-label {
  font-size: 11px; font-weight: 600; opacity: 0.6; display: block; margin-bottom: 4px;
}
.pam-llm-text {
  font-size: 12px; line-height: 1.55; opacity: 0.8; margin: 0;
}
.pam-search-meta {
  margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.06);
  display: flex; flex-direction: column; gap: 4px;
  font-size: 10px; opacity: 0.35;
}
.pam-search-queries { opacity: 0.7; }

/* No Key Hint */
.pam-nokey-hint {
  display: flex; align-items: center; gap: 8px; margin-top: 14px;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(255,200,50,0.06); border: 1px solid rgba(255,200,50,0.12);
  font-size: 11px; opacity: 0.7; flex-wrap: wrap;
}
.pam-link-btn {
  background: none; border: none; color: #52c8a0; cursor: pointer;
  font-size: 11px; font-family: inherit; text-decoration: underline;
}
.pam-link-btn:hover { opacity: 0.8; }
.pam-key-row {
  display: flex; gap: 6px; align-items: center; width: 100%; margin-top: 6px;
}
.pam-key-input {
  flex: 1; padding: 4px 8px; font-size: 11px; font-family: "SF Mono", monospace;
  background: rgba(128,128,128,0.06); border: 1px solid rgba(128,128,128,0.15);
  border-radius: 4px; color: inherit; outline: none;
}
.pam-key-input:focus { border-color: rgba(82,200,160,0.3); }
.pam-btn-text.sm { padding: 3px 10px; font-size: 10px; }

/* Loading phase indicator */
.pam-phase-indicator {
  display: flex; align-items: center; gap: 8px; margin-left: 12px; font-size: 11px; opacity: 0.5;
}

/* Light mode overrides */
.pam-light .pam-btn-text { background: rgba(46,168,106,0.08); border-color: rgba(46,168,106,0.2); color: #2ea86a; }
.pam-light .pam-btn-text:hover { background: rgba(46,168,106,0.15); }
</style>
