<template>
  <Teleport to="body">
    <div v-if="visible" class="ss-overlay" @click.self="emit('close')">
      <div class="ss-root" :class="{ 'ss-dark': isDark !== false }">
        <!-- 左侧步骤导航 -->
        <aside class="ss-sidebar">
          <div class="ss-sidebar-header">
            <span class="ss-sb-icon">📱</span>
            <span class="ss-sb-title">短篇创作向导</span>
          </div>
          <nav class="ss-steps">
            <button
              v-for="s in steps"
              :key="s.step"
              class="ss-step-nav"
              :class="{ active: currentStep === s.step, done: currentStep > s.step }"
              @click="goTo(s.step)"
            >
              <span class="ss-step-num">
                <span v-if="currentStep > s.step">✓</span>
                <span v-else>{{ s.step }}</span>
              </span>
              <span class="ss-step-info">
                <span class="ss-step-label">{{ s.label }}</span>
                <span class="ss-step-desc">{{ s.desc }}</span>
              </span>
            </button>
          </nav>

          <!-- 实时预览 -->
          <div class="ss-preview-mini" v-if="selectedPlatform">
            <div class="ss-pm-title">已选配置</div>
            <div class="ss-pm-item" v-if="selectedPlatform">
              <span class="ss-pm-dot"></span>
              {{ getPlatform(selectedPlatform)?.name || selectedPlatform }}
            </div>
            <div class="ss-pm-item" v-if="selectedGenre">
              <span class="ss-pm-dot"></span>
              {{ genreLabel(selectedGenre) }}
            </div>
            <div class="ss-pm-item" v-if="selectedSubgenres.length">
              <span class="ss-pm-dot"></span>
              子标签 ×{{ selectedSubgenres.length }}
            </div>
            <div class="ss-pm-item" v-if="selectedElements.length">
              <span class="ss-pm-dot"></span>
              元素 ×{{ selectedElements.length }}
            </div>
            <div class="ss-pm-item">
              <span class="ss-pm-dot"></span>
              {{ wordCount >= 10000 ? (wordCount / 10000) + '万字' : wordCount + '字' }}
            </div>
          </div>
        </aside>

        <!-- 右侧内容区 -->
        <div class="ss-main">
          <div class="ss-main-header">
            <h2 class="ss-step-title">{{ steps[currentStep - 1].label }}</h2>
            <p class="ss-step-hint">{{ steps[currentStep - 1].hint }}</p>
            <button class="ss-close" @click="emit('close')">✕</button>
          </div>

          <div class="ss-content">
            <!-- ① 选择平台 -->
            <div v-if="currentStep === 1" class="ss-page">
              <div class="ss-platform-grid">
                <button
                  v-for="p in allPlatforms"
                  :key="p.id"
                  class="ss-plat-card"
                  :class="{ active: selectedPlatform === p.id }"
                  @click="selectPlatform(p.id)"
                >
                  <span class="ss-plat-icon">{{ platformIcon(p.id) }}</span>
                  <span class="ss-plat-name">{{ p.name }}</span>
                  <span class="ss-plat-meta">⭐{{ p.rating }} · {{ p.owner }}</span>
                </button>
              </div>
            </div>

            <!-- ② 频道 + 题材 -->
            <div v-if="currentStep === 2" class="ss-page">
              <div class="ss-field" v-if="channels.length > 1">
                <label class="ss-field-label">目标频道 <span class="ss-required">*</span></label>
                <p class="ss-field-hint">选择目标读者群体，将影响创作风格和推荐策略</p>
                <div class="ss-chip-row">
                  <button
                    v-for="ch in channels"
                    :key="ch.key"
                    class="ss-chip lg"
                    :class="{ active: channel === ch.key }"
                    @click="channel = ch.key"
                  >{{ ch.label }}</button>
                </div>
              </div>

              <div class="ss-field">
                <label class="ss-field-label">题材类型 <span class="ss-required">*</span></label>
                <p class="ss-field-hint">选择故事的主要题材方向</p>
                <div class="ss-chip-row">
                  <button
                    v-for="g in genreOptions"
                    :key="g"
                    class="ss-chip lg"
                    :class="{ active: selectedGenre === g }"
                    @click="selectedGenre = selectedGenre === g ? '' : g"
                  >{{ genreLabel(g) }}</button>
                  <button class="ss-chip lg ss-chip-add" @click="startAddTag('genre')">+ 自定义</button>
                </div>
                <div v-if="addingTag === 'genre'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="输入自定义题材名称" @keydown.enter="confirmAddTag('genre')" ref="tagInput" />
                  <button class="ss-add-confirm" @click="confirmAddTag('genre')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>
            </div>

            <!-- ③ 子标签 + 核心元素 -->
            <div v-if="currentStep === 3" class="ss-page">
              <div class="ss-field">
                <label class="ss-field-label">子标签 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">细分标签，帮助 AI 更精准理解故事定位（可多选）</p>
                <div class="ss-chip-row">
                  <button
                    v-for="t in subgenreOptions"
                    :key="t"
                    class="ss-chip"
                    :class="{ active: selectedSubgenres.includes(t) }"
                    @click="toggleTag(selectedSubgenres, t)"
                  >{{ subgenreLabel(t) }}</button>
                  <button
                    v-for="t in customSubgenres.items.value"
                    :key="'c'+t"
                    class="ss-chip active custom"
                    @click="toggleTag(selectedSubgenres, t)"
                  >{{ subgenreLabel(t) }}<span class="ss-chip-del" @click.stop="customSubgenres.remove(t)">×</span></button>
                  <button class="ss-chip ss-chip-add" @click="startAddTag('subgenre')">+ 自定义</button>
                </div>
                <div v-if="addingTag === 'subgenre'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="输入自定义子标签" @keydown.enter="confirmAddTag('subgenre')" />
                  <button class="ss-add-confirm" @click="confirmAddTag('subgenre')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>

              <div class="ss-field">
                <label class="ss-field-label">核心元素 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">故事的核心卖点和设定元素，按分类选择或自定义</p>
                <div v-for="cat in elementPresets" :key="cat.label" class="ss-preset-group">
                  <span class="ss-preset-label">{{ cat.label }}</span>
                  <div class="ss-chip-row">
                    <button
                      v-for="t in cat.items"
                      :key="t"
                      class="ss-chip"
                      :class="{ active: selectedElements.includes(t) }"
                      @click="toggleTag(selectedElements, t)"
                    >{{ t }}</button>
                  </div>
                </div>
                <!-- 用户自定义元素 -->
                <div v-if="customElements.items.value.length" class="ss-preset-group">
                  <span class="ss-preset-label">自定义</span>
                  <div class="ss-chip-row">
                    <button
                      v-for="t in customElements.items.value"
                      :key="t"
                      class="ss-chip custom"
                      :class="{ active: selectedElements.includes(t) }"
                      @click="toggleTag(selectedElements, t)"
                    >{{ t }}<span class="ss-chip-del" @click.stop="customElements.remove(t)">×</span></button>
                  </div>
                </div>
                <div class="ss-chip-row" style="margin-top:8px">
                  <button class="ss-chip ss-chip-add" @click="startAddTag('elements')">+ 自定义元素</button>
                </div>
                <div v-if="addingTag === 'elements'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="如：穿越、替身、契约婚姻" @keydown.enter="confirmAddTag('elements')" />
                  <button class="ss-add-confirm" @click="confirmAddTag('elements')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>
            </div>

            <!-- ④ 情绪 + 爽点 -->
            <div v-if="currentStep === 4" class="ss-page">
              <div class="ss-field">
                <label class="ss-field-label">情绪曲线 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">故事的情感走向和节奏变化（可多选）</p>
                <div class="ss-chip-row">
                  <button v-for="e in emotionPresets" :key="e" class="ss-chip" :class="{ active: selectedEmotions.includes(e) }" @click="toggleTag(selectedEmotions, e)">{{ e }}</button>
                  <button v-for="t in customEmotions.items.value" :key="'c'+t" class="ss-chip" :class="{ active: selectedEmotions.includes(t) }" @click="toggleTag(selectedEmotions, t)">{{ t }}<span class="ss-chip-del" @click.stop="customEmotions.remove(t)">×</span></button>
                  <button class="ss-chip ss-chip-add" @click="startAddTag('emotion')">+ 自定义</button>
                </div>
                <div v-if="addingTag === 'emotion'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="如：甜中带虐、先苦后甜" @keydown.enter="confirmAddTag('emotion')" />
                  <button class="ss-add-confirm" @click="confirmAddTag('emotion')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>

              <div class="ss-field">
                <label class="ss-field-label">爽点元素 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">读者期待的爽感触发点，按分类选择或自定义</p>
                <div v-for="cat in coolPointPresets" :key="cat.label" class="ss-preset-group">
                  <span class="ss-preset-label">{{ cat.label }}</span>
                  <div class="ss-chip-row">
                    <button
                      v-for="t in cat.items"
                      :key="t"
                      class="ss-chip"
                      :class="{ active: selectedCoolPoints.includes(t) }"
                      @click="toggleTag(selectedCoolPoints, t)"
                    >{{ t }}</button>
                  </div>
                </div>
                <!-- 用户自定义爽点 -->
                <div v-if="customCoolPoints.items.value.length" class="ss-preset-group">
                  <span class="ss-preset-label">自定义</span>
                  <div class="ss-chip-row">
                    <button
                      v-for="t in customCoolPoints.items.value"
                      :key="t"
                      class="ss-chip custom"
                      :class="{ active: selectedCoolPoints.includes(t) }"
                      @click="toggleTag(selectedCoolPoints, t)"
                    >{{ t }}<span class="ss-chip-del" @click.stop="customCoolPoints.remove(t)">×</span></button>
                  </div>
                </div>
                <div class="ss-chip-row" style="margin-top:8px">
                  <button class="ss-chip ss-chip-add" @click="startAddTag('cool_points')">+ 自定义爽点</button>
                </div>
                <div v-if="addingTag === 'cool_points'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="如：打脸、逆袭、修罗场" @keydown.enter="confirmAddTag('cool_points')" />
                  <button class="ss-add-confirm" @click="confirmAddTag('cool_points')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>
            </div>

            <!-- ⑤ 视角 + 风格 -->
            <div v-if="currentStep === 5" class="ss-page">
              <div class="ss-field">
                <label class="ss-field-label">叙事视角 <span class="ss-required">*</span></label>
                <p class="ss-field-hint">决定故事以谁的视角展开，影响读者代入感</p>
                <div class="ss-chip-row">
                  <button v-for="pv in povOptions" :key="pv.key" class="ss-chip lg" :class="{ active: pov === pv.key }" @click="pov = pv.key">
                    <span class="ss-pov-label">{{ pv.label }}</span>
                    <span class="ss-pov-example">{{ pv.example }}</span>
                  </button>
                </div>
              </div>

              <div class="ss-field">
                <label class="ss-field-label">写作风格 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">选择或自定义文风类型</p>
                <div class="ss-chip-row">
                  <button v-for="s in stylePresets" :key="s" class="ss-chip" :class="{ active: selectedStyle === s }" @click="selectedStyle = selectedStyle === s ? '' : s">{{ s }}</button>
                  <button v-for="t in customStyles.items.value" :key="'c'+t" class="ss-chip" :class="{ active: selectedStyle === t }" @click="selectedStyle = selectedStyle === t ? '' : t">{{ t }}<span class="ss-chip-del" @click.stop="customStyles.remove(t)">×</span></button>
                  <button class="ss-chip ss-chip-add" @click="startAddTag('style')">+ 自定义</button>
                </div>
                <div v-if="addingTag === 'style'" class="ss-add-row">
                  <input v-model="newTagName" class="ss-add-input" placeholder="输入自定义风格" @keydown.enter="confirmAddTag('style')" />
                  <button class="ss-add-confirm" @click="confirmAddTag('style')">确认</button>
                  <button class="ss-add-cancel" @click="cancelAddTag">取消</button>
                </div>
              </div>
            </div>

            <!-- ⑥ 字数 + 补充 -->
            <div v-if="currentStep === 6" class="ss-page">
              <div class="ss-field">
                <label class="ss-field-label">目标字数 <span class="ss-required">*</span></label>
                <p class="ss-field-hint">选择短篇目标字数，影响生成的篇幅和节奏</p>
                <div class="ss-chip-row">
                  <button v-for="wc in wordCountOptions" :key="wc" class="ss-chip lg" :class="{ active: wordCount === wc }" @click="wordCount = wc">
                    {{ wc >= 10000 ? (wc / 10000) + '万字' : wc + '字' }}
                    <span class="ss-wc-hint">{{ wc <= 3000 ? '超短篇' : wc <= 8000 ? '短篇' : wc <= 15000 ? '中篇' : '长篇' }}</span>
                  </button>
                </div>
              </div>

              <div class="ss-field">
                <label class="ss-field-label">补充说明 <span class="ss-optional">选填</span></label>
                <p class="ss-field-hint">其他特殊要求：角色设定、情节方向、避雷要求等</p>
                <textarea v-model="extra" class="ss-extra" rows="5" placeholder="例如：&#10;· 主角是穿越到现代的修仙者，隐藏身份在大城市生活&#10;· 必须有反转结局，前期伏笔铺垫&#10;· 面向男性读者，节奏要快&#10;· 不要出现系统面板、数据流等元素"></textarea>
              </div>
            </div>

            <!-- ⑦ 确认生成 -->
            <div v-if="currentStep === 7" class="ss-page">
              <div class="ss-review">
                <h3 class="ss-review-title">📋 创作配置确认</h3>
                <p class="ss-review-hint">请确认以下信息，确认无误后点击生成</p>

                <div class="ss-review-grid">
                  <div class="ss-review-item">
                    <span class="ss-review-key">目标平台</span>
                    <span class="ss-review-val">{{ getPlatform(selectedPlatform)?.name || '-' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">频道</span>
                    <span class="ss-review-val">{{ CHANNEL_LABELS[channel] || channel || '-' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">题材</span>
                    <span class="ss-review-val">{{ genreLabel(selectedGenre) || '-' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">子标签</span>
                    <span class="ss-review-val">{{ selectedSubgenres.map(s => subgenreLabel(s)).join('、') || '未选择' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">核心元素</span>
                    <span class="ss-review-val">{{ selectedElements.join('、') || '未选择' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">情绪走向</span>
                    <span class="ss-review-val">{{ selectedEmotions.join(' → ') || '未选择' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">爽点</span>
                    <span class="ss-review-val">{{ selectedCoolPoints.join('、') || '未选择' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">叙事视角</span>
                    <span class="ss-review-val">{{ povOptions.find(p => p.key === pov)?.label || pov }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">风格</span>
                    <span class="ss-review-val">{{ selectedStyle || '默认' }}</span>
                  </div>
                  <div class="ss-review-item">
                    <span class="ss-review-key">目标字数</span>
                    <span class="ss-review-val">{{ wordCount >= 10000 ? (wordCount / 10000) + '万字' : wordCount + '字' }}</span>
                  </div>
                </div>

                <div class="ss-review-item extra" v-if="extra">
                  <span class="ss-review-key">补充说明</span>
                  <span class="ss-review-val pre">{{ extra }}</span>
                </div>

                <div class="ss-review-token">
                  💡 预计消耗约 <strong>{{ Math.round(wordCount * 1.5).toLocaleString() }}</strong> token
                </div>
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="ss-footer">
            <div class="ss-footer-left">
              <span class="ss-step-counter">第 {{ currentStep }} / {{ totalSteps }} 步</span>
            </div>
            <div class="ss-footer-right">
              <button v-if="currentStep > 1" class="ss-btn-prev" @click="currentStep--">← 上一步</button>
              <button
                v-if="currentStep < totalSteps"
                class="ss-btn-next"
                :disabled="!canAdvance"
                @click="currentStep++"
              >
                {{ canAdvance ? '下一步 →' : '请完成当前步骤' }}
              </button>
              <button
                v-if="currentStep === totalSteps"
                class="ss-btn-gen"
                :disabled="!canGenerate"
                @click="doGenerate"
              >
                {{ canGenerate ? '✨ 开始生成短篇' : '请先选择平台和题材' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getAllPlatforms, getPlatform } from '../composables/usePlatformData'
import {
  type TagSet, GENRE_LABELS, SUBGENRE_LABELS, CHANNEL_LABELS, type PresetCategory,
  getGenresForChannel, getSubgenresForGenre,
  getCoolPointsForChannel, getElementsForChannel,
  getEmotionPresetsForChannel,
} from '../composables/usePlatformTags'
import { useCustomTags } from '../composables/useCustomTags'

const props = defineProps<{
  visible: boolean
  isDark?: boolean
  preselectedPlatform?: string
}>()

const emit = defineEmits<{
  close: []
  generate: [{ platformId: string; tagSet: TagSet; wordCount: number; extra: string }]
}>()

// ── 步骤定义 ──
const steps = [
  { step: 1, label: '选择平台', desc: '选平台', hint: '选择目标发布平台，系统将自动匹配该平台的创作偏好和读者画像' },
  { step: 2, label: '配置题材', desc: '题材', hint: '选择目标频道后，题材列表将自动过滤为该频道的热门方向' },
  { step: 3, label: '细化标签', desc: '标签', hint: '选择细分标签和核心元素，标签已按频道+题材智能推荐' },
  { step: 4, label: '情绪爽点', desc: '情绪', hint: '设定情绪曲线和爽点，已按男频/女频分别推荐' },
  { step: 5, label: '风格视角', desc: '风格', hint: '选择叙事视角和写作风格' },
  { step: 6, label: '字数说明', desc: '字数', hint: '设定目标字数和补充说明' },
  { step: 7, label: '确认生成', desc: '确认', hint: '确认所有创作配置，开始 AI 生成' },
]
const totalSteps = steps.length
const currentStep = ref(1)

function goTo(step: number) {
  if (step <= currentStep.value + 1) currentStep.value = step
}

// ── 平台 ──
const allPlatforms = computed(() => getAllPlatforms().sort((a, b) => b.rating - a.rating))
const selectedPlatform = ref(props.preselectedPlatform || '')

function selectPlatform(id: string) {
  selectedPlatform.value = id
  selectedGenre.value = ''
  selectedSubgenres.value = []
  selectedElements.value = []
  selectedEmotions.value = []
  selectedCoolPoints.value = []
  selectedStyle.value = ''
  channel.value = ''
  pov.value = 'third_person_limited'
  // 自动选中唯一频道（双频道平台让用户手动选）
  const p = getPlatform(id)
  if (p?.channels.length === 1) {
    channel.value = p.channels[0] === 'unisex' ? 'male' : p.channels[0]
  }
}

function platformIcon(id: string): string {
  const map: Record<string, string> = {
    zhihu_salt: '🧂', fanqie: '🍅', qimao: '🐱', toutiao: '📰',
    weixin_mp: '💬', xiaohongshu: '📕', faloo: '🚀', qidian: '🏁',
    jjwxc: '💚', douban_read: '📗', ciweimao: '🦔', everyday_story: '📖',
    jianshu: '✍️', lofter: '🎨',
  }
  return map[id] || '📱'
}

function genreLabel(key: string): string {
  // 优先查频道过滤表，再查全量表（兼容旧平台 preferred_genres 的 key）
  const ch = channel.value as 'male' | 'female'
  if (ch) {
    const filtered = getGenresForChannel(ch)
    if (filtered[key]) return filtered[key]
  }
  return GENRE_LABELS[key] || key
}
function subgenreLabel(key: string): string {
  // 新体系下子标签直接是中文，SUBGENRE_LABELS 也以中文为 key
  return SUBGENRE_LABELS[key] || GENRE_LABELS[key] || key
}

// ── 频道 ──
const channel = ref('')
const channels = computed(() => {
  const p = selectedPlatform.value ? getPlatform(selectedPlatform.value) : null
  const list: { key: string; label: string }[] = []
  if (p?.channels.includes('male')) list.push({ key: 'male', label: '♂ 男频' })
  if (p?.channels.includes('female')) list.push({ key: 'female', label: '♀ 女频' })
  return list
})

// ── 题材（按频道过滤，未选频道时回退到平台推荐） ──
const customGenres = useCustomTags('genre')
const selectedGenre = ref('')
const genreOptions = computed(() => {
  const ch = channel.value as 'male' | 'female'
  const customs = customGenres.items.value
  if (ch) {
    const presets = getGenresForChannel(ch)
    return [...new Set([...Object.keys(presets), ...customs])]
  }
  // 未选频道：回退到平台推荐 + 自定义
  const p = selectedPlatform.value ? getPlatform(selectedPlatform.value) : null
  const platformPresets = p?.preferred_genres || []
  return [...new Set([...platformPresets, ...customs])]
})

// ── 子标签（按频道+题材联动，未选时回退到平台推荐） ──
const customSubgenres = useCustomTags('subgenre')
const selectedSubgenres = ref<string[]>([])
const subgenreOptions = computed(() => {
  const ch = channel.value as 'male' | 'female'
  const genre = selectedGenre.value
  const customs = customSubgenres.items.value
  if (ch && genre) {
    const presets = getSubgenresForGenre(ch, genre)
    return [...new Set([...presets, ...customs])]
  }
  // 未选频道或题材：回退到平台推荐
  const p = selectedPlatform.value ? getPlatform(selectedPlatform.value) : null
  const platformPresets = p?.preferred_subgenres || []
  return [...new Set([...platformPresets, ...customs])]
})

// ── 核心元素（按频道预设 + 自定义） ──
const customElements = useCustomTags('elements')
const selectedElements = ref<string[]>([])
const elementPresets = computed<PresetCategory[]>(() => {
  const ch = channel.value as 'male' | 'female'
  return ch ? getElementsForChannel(ch) : []
})

// ── 情绪（按频道预设，未选时用通用默认值） ──
const customEmotions = useCustomTags('emotion')
const selectedEmotions = ref<string[]>([])
const DEFAULT_EMOTION_PRESETS = ['甜→虐→爽', '爽→虐→甜', '全程甜宠', '虐到底', '酸涩向', '先婚后爱', '破镜重圆']
const emotionPresets = computed(() => {
  const ch = channel.value as 'male' | 'female'
  return ch ? getEmotionPresetsForChannel(ch) : DEFAULT_EMOTION_PRESETS
})

// ── 人称 ──
const pov = ref('third_person_limited')
const povOptions = [
  { key: 'first_person', label: '第一人称', example: '"我走进房间..."' },
  { key: 'third_person_limited', label: '第三人称限知', example: '"她走进房间，感觉..."' },
  { key: 'third_person_omniscient', label: '全知视角', example: '"她走进房间，殊不知..."' },
]

// ── 风格 ──
const customStyles = useCustomTags('style')
const selectedStyle = ref('')
const stylePresets = ['知乎体', '番茄风', '晋江风', '起点风', '飞卢风', '豆瓣风', '轻小说风']

// ── 爽点（按频道预设 + 自定义） ──
const customCoolPoints = useCustomTags('cool_points')
const selectedCoolPoints = ref<string[]>([])
const coolPointPresets = computed<PresetCategory[]>(() => {
  const ch = channel.value as 'male' | 'female'
  return ch ? getCoolPointsForChannel(ch) : []
})

// ── 联动 watcher ──
// 单频道平台自动选中；unisex平台默认选男频
watch(channels, (list) => {
  if (list.length === 1 && !channel.value) {
    channel.value = list[0].key
  } else if (list.length === 0 && !channel.value) {
    // unisex 平台（toutiao/weixin_mp/jianshu 等）无男/女频选项，默认男频
    channel.value = 'male'
  }
}, { immediate: true })

// 切换频道时清空题材及以下所有选择
watch(channel, () => {
  selectedGenre.value = ''
  selectedSubgenres.value = []
  selectedElements.value = []
  selectedEmotions.value = []
  selectedCoolPoints.value = []
})

// 切换题材时清空子标签
watch(selectedGenre, () => {
  selectedSubgenres.value = []
})

// ── 字数 ──
const wordCount = ref(5000)
const wordCountOptions = [2000, 3000, 5000, 8000, 10000, 15000, 20000]

// ── 补充说明 ──
const extra = ref('')

// ── 自定义标签 ──
const addingTag = ref('')
const newTagName = ref('')
const tagInput = ref<HTMLInputElement | null>(null)

function startAddTag(category: string) {
  addingTag.value = category
  newTagName.value = ''
}

function confirmAddTag(category: string) {
  const name = newTagName.value.trim()
  if (!name) { cancelAddTag(); return }
  const map: Record<string, { items: ReturnType<typeof useCustomTags>['items']; selected: ReturnType<typeof ref<string[]>> | ReturnType<typeof ref<string>> }> = {
    genre: { items: customGenres.items, selected: selectedGenre },
    subgenre: { items: customSubgenres.items, selected: selectedSubgenres },
    elements: { items: customElements.items, selected: selectedElements },
    emotion: { items: customEmotions.items, selected: selectedEmotions },
    style: { items: customStyles.items, selected: selectedStyle },
    cool_points: { items: customCoolPoints.items, selected: selectedCoolPoints },
  }
  const target = map[category]
  if (target) {
    if (!target.items.value.includes(name)) target.items.value.push(name)
    if (Array.isArray(target.selected.value)) {
      if (!target.selected.value.includes(name)) target.selected.value.push(name)
    } else {
      target.selected.value = name
    }
  }
  cancelAddTag()
}

function cancelAddTag() { addingTag.value = ''; newTagName.value = '' }
function toggleTag(arr: string[], tag: string) {
  const idx = arr.indexOf(tag)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(tag)
}

// ── 步骤校验 ──
const canAdvance = computed(() => {
  switch (currentStep.value) {
    case 1: return !!selectedPlatform.value
    case 2: return !!channel.value && !!selectedGenre.value
    case 5: return !!pov.value
    default: return true
  }
})
const canGenerate = computed(() => !!selectedPlatform.value && !!selectedGenre.value)

// ── 生成 ──
function doGenerate() {
  if (!canGenerate.value) return
  const p = getPlatform(selectedPlatform.value)
  const tagSet: TagSet = {
    platform: selectedPlatform.value,
    channel: channel.value || (p?.channels[0] || ''),
    genre: selectedGenre.value,
    subgenre: selectedSubgenres.value,
    elements: selectedElements.value,
    emotion: selectedEmotions.value,
    pov: pov.value,
    style: selectedStyle.value || (p?.style || ''),
    length: wordCount.value <= 5000 ? 'short' : wordCount.value <= 20000 ? 'medium' : 'long',
    cool_points: selectedCoolPoints.value,
    taboo: p?.taboo || [],
  }
  emit('generate', { platformId: selectedPlatform.value, tagSet, wordCount: wordCount.value, extra: extra.value })
}
</script>

<style scoped>
/* ── Overlay ── */
.ss-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(2px);
}

/* ── Root ── */
.ss-root {
  width: 860px; max-width: calc(100vw - 48px); max-height: 92vh;
  background: #fff; border-radius: 16px;
  display: flex; overflow: hidden;
  box-shadow: 0 16px 60px rgba(0,0,0,.25);
}
.ss-dark { background: #1c1c22; color: #e0e0e0; }

/* ── 左侧边栏 ── */
.ss-sidebar {
  width: 220px; flex-shrink: 0;
  background: #f8f9fb; border-right: 1px solid rgba(0,0,0,.06);
  display: flex; flex-direction: column; padding: 20px 16px; gap: 20px;
}
.ss-dark .ss-sidebar { background: #25252c; border-color: rgba(255,255,255,.06); }

.ss-sidebar-header {
  display: flex; align-items: center; gap: 10px;
}
.ss-sb-icon { font-size: 22px; }
.ss-sb-title { font-size: 15px; font-weight: 700; }

/* 步骤导航 */
.ss-steps { display: flex; flex-direction: column; gap: 2px; }
.ss-step-nav {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px; border: none;
  background: transparent; cursor: pointer; text-align: left;
  transition: all .15s;
}
.ss-step-nav:hover { background: rgba(99,102,241,.06); }
.ss-step-nav.active { background: rgba(99,102,241,.1); }
.ss-step-num {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  background: #e5e7eb; color: #9ca3af;
}
.ss-step-nav.active .ss-step-num { background: #6366f1; color: #fff; }
.ss-step-nav.done .ss-step-num { background: #6366f1; color: #fff; }
.ss-step-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ss-step-label { font-size: 13px; font-weight: 600; color: #6b7280; }
.ss-step-nav.active .ss-step-label { color: #6366f1; }
.ss-step-nav.done .ss-step-label { color: #6366f1; }
.ss-step-desc { font-size: 11px; color: #9ca3af; }

/* 迷你预览 */
.ss-preview-mini {
  margin-top: auto; padding: 12px;
  background: rgba(99,102,241,.06); border-radius: 10px;
  border: 1px solid rgba(99,102,241,.1);
}
.ss-pm-title { font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 8px; }
.ss-pm-item {
  font-size: 11px; color: #6b7280; padding: 2px 0;
  display: flex; align-items: center; gap: 6px;
}
.ss-pm-dot { width: 5px; height: 5px; border-radius: 50%; background: #6366f1; flex-shrink: 0; }

/* ── 右侧主内容 ── */
.ss-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.ss-main-header {
  padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,.06);
  display: flex; align-items: baseline; gap: 12px;
}
.ss-dark .ss-main-header { border-color: rgba(255,255,255,.06); }
.ss-step-title { font-size: 18px; font-weight: 700; margin: 0; flex-shrink: 0; }
.ss-step-hint { font-size: 13px; color: #9ca3af; margin: 0; }
.ss-close {
  margin-left: auto; border: none; background: none;
  font-size: 18px; cursor: pointer; color: #9ca3af; padding: 4px 8px;
}
.ss-close:hover { color: #ef4444; }

/* 内容区 */
.ss-content { flex: 1; overflow-y: auto; padding: 24px; }
.ss-page { display: flex; flex-direction: column; gap: 24px; }

/* 字段 */
.ss-field { }
.ss-field-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 4px; color: #374151; }
.ss-dark .ss-field-label { color: #d1d5db; }
.ss-field-hint { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
.ss-required { color: #ef4444; font-size: 11px; font-weight: 400; }
.ss-optional { color: #9ca3af; font-size: 10px; font-weight: 400; background: #f3f4f6; padding: 1px 6px; border-radius: 4px; }
.ss-dark .ss-optional { background: #333; }

/* ── 平台网格 ── */
.ss-platform-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.ss-plat-card {
  display: flex; flex-direction: column; align-items: center;
  padding: 16px 10px; border: 2px solid #e5e7eb; border-radius: 12px;
  background: #fff; cursor: pointer; transition: all .15s;
  font-size: 12px; gap: 6px;
}
.ss-dark .ss-plat-card { background: #2a2a32; border-color: #333; }
.ss-plat-card:hover { border-color: #818cf8; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,.1); }
.ss-plat-card.active { border-color: #6366f1; background: #eef2ff; box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
.ss-dark .ss-plat-card.active { background: #2d2b4b; }
.ss-plat-icon { font-size: 28px; }
.ss-plat-name { font-weight: 700; color: #1f2937; font-size: 13px; }
.ss-dark .ss-plat-name { color: #e5e7eb; }
.ss-plat-meta { font-size: 11px; color: #9ca3af; }

/* ── Chips ── */
.ss-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.ss-chip {
  padding: 8px 16px; font-size: 13px; border: 1.5px solid #e5e7eb;
  border-radius: 10px; background: #fff; cursor: pointer;
  color: #4b5563; transition: all .12s; display: inline-flex; align-items: center; gap: 4px;
}
.ss-dark .ss-chip { background: #2a2a32; border-color: #333; color: #9ca3af; }
.ss-chip:hover { border-color: #818cf8; color: #6366f1; }
.ss-chip.active { background: #6366f1; color: #fff; border-color: #6366f1; }
.ss-dark .ss-chip.active { background: #6366f1; color: #fff; border-color: #6366f1; }
.ss-chip.lg { padding: 10px 20px; font-size: 14px; font-weight: 500; }
.ss-chip.custom { padding-right: 6px; }
.ss-chip-del {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: 2px; width: 18px; height: 18px; border-radius: 50%;
  font-size: 12px; opacity: .7;
}
.ss-chip-del:hover { opacity: 1; background: rgba(255,255,255,.2); }
.ss-chip-add { border-style: dashed; color: #9ca3af; background: transparent; }
.ss-chip-add:hover { border-color: #6366f1; color: #6366f1; background: rgba(99,102,241,.04); }
.ss-dark .ss-chip-add { background: transparent; }

/* 预设分组 */
.ss-preset-group { margin-bottom: 12px; }
.ss-preset-label {
  display: inline-block; font-size: 11px; font-weight: 600; color: #6366f1;
  background: rgba(99,102,241,.08); padding: 2px 8px; border-radius: 4px;
  margin-bottom: 6px;
}
.ss-dark .ss-preset-label { background: rgba(99,102,241,.15); }

/* POV 示例 */
.ss-pov-label { font-weight: 600; }
.ss-pov-example { font-size: 11px; opacity: .5; font-style: italic; }
.ss-wc-hint { font-size: 11px; opacity: .5; }

/* ── 自定义标签输入 ── */
.ss-add-row { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.ss-add-input {
  flex: 1; padding: 8px 12px; font-size: 13px;
  border: 1.5px solid #e5e7eb; border-radius: 8px; outline: none;
  background: #fff; color: #1f2937;
}
.ss-dark .ss-add-input { background: #2a2a32; border-color: #333; color: #e0e0e0; }
.ss-add-input:focus { border-color: #6366f1; }
.ss-add-confirm {
  padding: 8px 16px; border: none; border-radius: 8px;
  background: #6366f1; color: #fff; cursor: pointer; font-size: 13px; font-weight: 500;
}
.ss-add-cancel {
  padding: 8px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px;
  background: #fff; cursor: pointer; font-size: 13px; color: #6b7280;
}
.ss-dark .ss-add-cancel { background: #2a2a32; border-color: #333; color: #9ca3af; }

/* ── 补充说明 ── */
.ss-extra {
  width: 100%; padding: 12px 14px; font-size: 13px; line-height: 1.6;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  resize: vertical; font-family: inherit; box-sizing: border-box;
  background: #fff; color: #1f2937;
}
.ss-dark .ss-extra { background: #2a2a32; border-color: #333; color: #e0e0e0; }
.ss-extra:focus { outline: none; border-color: #6366f1; }

/* ── 确认页 ── */
.ss-review { }
.ss-review-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
.ss-review-hint { font-size: 13px; color: #9ca3af; margin: 0 0 20px; }
.ss-review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ss-review-item {
  padding: 10px 14px; border-radius: 8px;
  background: #f9fafb; display: flex; flex-direction: column; gap: 2px;
}
.ss-dark .ss-review-item { background: #25252c; }
.ss-review-item.extra { grid-column: 1 / -1; }
.ss-review-key { font-size: 11px; color: #9ca3af; font-weight: 500; text-transform: uppercase; }
.ss-review-val { font-size: 14px; font-weight: 600; color: #1f2937; }
.ss-dark .ss-review-val { color: #e5e7eb; }
.ss-review-val.pre { white-space: pre-wrap; font-weight: 400; font-size: 13px; }
.ss-review-token {
  margin-top: 20px; padding: 12px 16px; border-radius: 10px;
  background: rgba(99,102,241,.06); font-size: 13px; color: #6366f1;
}

/* ── 底部操作栏 ── */
.ss-footer {
  padding: 14px 24px; border-top: 1px solid rgba(0,0,0,.06);
  display: flex; align-items: center; justify-content: space-between;
}
.ss-dark .ss-footer { border-color: rgba(255,255,255,.06); }
.ss-step-counter { font-size: 12px; color: #9ca3af; }
.ss-footer-right { display: flex; gap: 10px; }
.ss-btn-prev {
  padding: 10px 20px; font-size: 14px; border: 1.5px solid #e5e7eb;
  border-radius: 10px; background: #fff; cursor: pointer; color: #4b5563;
  transition: all .12s;
}
.ss-dark .ss-btn-prev { background: #2a2a32; border-color: #333; color: #9ca3af; }
.ss-btn-prev:hover { border-color: #6366f1; color: #6366f1; }
.ss-btn-next {
  padding: 10px 24px; font-size: 14px; font-weight: 600;
  border: none; border-radius: 10px; cursor: pointer;
  background: #6366f1; color: #fff; transition: all .12s;
}
.ss-btn-next:hover:not(:disabled) { background: #4f46e5; }
.ss-btn-next:disabled { opacity: .35; cursor: not-allowed; }
.ss-btn-gen {
  padding: 10px 28px; font-size: 14px; font-weight: 700;
  border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff;
  transition: all .12s;
}
.ss-btn-gen:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,.3); }
.ss-btn-gen:disabled { opacity: .35; cursor: not-allowed; }
</style>
