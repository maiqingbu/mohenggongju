<template>
  <Teleport to="body">
    <div v-if="visible" class="iw-overlay" @click.self="visible = false">
      <div class="iw-root" :class="isDark ? 'iw-dark' : 'iw-light'">
        <!-- Header -->
        <div class="iw-header">
          <div class="iw-header-left">
            <h2 class="iw-title">✨ 灵感火花·抽卡</h2>
            <p class="iw-subtitle">选择赛道 → 世界观 → 人设 → 金手指 → 小说立项书</p>
          </div>
          <div class="iw-header-right">
            <span class="iw-model" :class="{ 'iw-model-warn': !hasModel }">{{ hasModel ? currentModelName : '⚠️ 未配置模型' }}</span>
            <span class="iw-progress">进度 {{ Math.round((currentStep - 1) / 4 * 100) }}%</span>
          </div>
          <button class="iw-close" @click="visible = false">✕</button>
        </div>

        <!-- Step indicators -->
        <div class="iw-steps">
          <div v-for="(s, i) in steps" :key="s.key" class="iw-step"
            :class="{ done: i + 1 < currentStep, current: i + 1 === currentStep }"
            @click="i + 1 < currentStep ? currentStep = i + 1 : null">
            <span class="iw-step-dot">{{ i + 1 < currentStep ? '✓' : i + 1 }}</span>
            <span class="iw-step-label">{{ s.label }}</span>
            <span v-if="i < steps.length - 1" class="iw-step-line" :class="{ filled: i + 1 < currentStep }"></span>
          </div>
        </div>

        <!-- Body -->
        <div class="iw-body">

          <!-- Step 1: 选择频道 + 赛道 -->
          <div v-if="currentStep === 1" class="iw-step-content">
            <!-- 未配置模型警告 -->
            <div v-if="!hasModel" class="iw-no-model-banner">
              <div class="iw-no-model-icon">⚠️</div>
              <div class="iw-no-model-text">
                <strong>尚未配置 AI 模型，无法生成立项卡片</strong>
                <p>灵感火花依赖 AI 模型生成世界观、人设、金手指方案。请先配置模型后再使用。</p>
              </div>
              <button class="iw-no-model-btn" @click="goToModelSettings">去配置 →</button>
            </div>

            <div class="iw-step-block">
              <h3>Step 1 · 选择频道</h3>
              <p class="iw-step-desc">先定男频/女频，再展示对应赛道列表。</p>
              <div class="iw-channel-row">
                <button class="iw-channel-btn" :class="{ active: channel === 'male' }" @click="channel = 'male'">
                  <span class="iw-channel-icon">♂</span>
                  <div><strong>男频</strong><p>热血爽感 / 升级流 / 强冲突</p></div>
                </button>
                <button class="iw-channel-btn" :class="{ active: channel === 'female' }" @click="channel = 'female'">
                  <span class="iw-channel-icon">♀</span>
                  <div><strong>女频</strong><p>情感张力 / 人设驱动 / 关系网</p></div>
                </button>
              </div>
            </div>

            <div class="iw-step-block">
              <h3>Step 2 · 选择赛道</h3>
              <p class="iw-step-desc">点击一个类型作为本次立项的主方向。</p>
              <div class="iw-track-grid">
                <button v-for="t in currentTracks" :key="t" class="iw-track-btn"
                  :class="{ active: selectedTrack === t }" @click="selectTrack(t)">{{ t }}</button>
              </div>

              <!-- Sub-types (per track, placeholder for now) -->
              <div v-if="selectedTrack && subTypes.length" style="margin-top:14px">
                <p class="iw-step-desc">细分类型（可不选）</p>
                <div class="iw-track-grid">
                  <button v-for="st in subTypes" :key="st" class="iw-track-btn sm"
                    :class="{ active: selectedSubType === st }" @click="selectedSubType = st">{{ st }}</button>
                </div>
              </div>
            </div>

            <!-- 发布平台 -->
            <div v-if="selectedTrack" class="iw-step-block">
              <h3>Step 3 · 选择发布平台</h3>
              <p class="iw-step-desc">选择目标发布平台，影响立项书的平台适配策略。</p>
              <div class="iw-track-grid">
                <button v-for="p in allPlatforms" :key="p.id" class="iw-track-btn"
                  :class="{ active: selectedPlatform === p.id }" @click="selectedPlatform = p.id">{{ p.name }}</button>
              </div>
            </div>

            <!-- Tags -->
            <div v-if="selectedTrack" class="iw-tags-section">
              <div v-for="cat in tagCategories" :key="cat.name" class="iw-tag-cat">
                <p class="iw-tag-cat-label">{{ cat.name }}</p>
                <div class="iw-tag-cat-row">
                  <button v-for="t in cat.tags" :key="t" class="iw-tag-btn"
                    :class="{ active: selectedTags.includes(t) }" @click="toggleTag(t)">{{ t }}</button>
                  <!-- 自定义标签输入 -->
                  <template v-if="customInputCat === cat.name">
                    <input
                      class="iw-custom-tag-input"
                      v-model="newCustomTag"
                      placeholder="输入标签"
                      @keydown.enter="addCustomTag(cat.name)"
                      @keydown.escape="cancelCustomTag"
                      @blur="addCustomTag(cat.name)"
                      ref="customTagInputRef"
                    />
                  </template>
                  <button v-else class="iw-tag-btn iw-tag-add" @click="openCustomTag(cat.name)" title="添加自定义标签">+</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Steps 3-5: Card Draw System -->
          <div v-else class="iw-step-content">
            <div class="iw-draw-header">
              <div class="iw-draw-locked">
                {{ channel === 'male' ? '男频' : '女频' }}×{{ selectedTrack }}已锁定：
                {{ currentStep === 2 ? '抽世界观，定舞台底色' : currentStep === 3 ? '挑主角，定人物核心' : currentStep === 4 ? '选金手指，定爽点引擎' : '整理立项书' }}
              </div>
              <button v-if="currentStep < 5" class="iw-regenerate-btn" @click="generateCards(currentStep)" :disabled="generating">
                <span v-if="generating" class="iw-spinner"></span>
                <span v-else>🔄</span> 重新生成
              </button>
            </div>

            <!-- 加载动画 -->
            <div v-if="generating" class="iw-generating">
              <div class="iw-gen-spinner"></div>
              <p>AI 正在生成{{ currentStepNames[currentStep] }}方案...</p>
            </div>

            <!-- Card grid -->
            <div v-else-if="currentStep < 5" class="iw-card-grid">
              <div v-for="(card, i) in drawCards" :key="i" class="iw-draw-card"
                :class="{ selected: selectedCard === i }" @click="selectedCard = i">
                <div class="iw-draw-card-top">
                  <span class="iw-draw-card-badge">{{ card.badge || currentStepNames[currentStep] }}</span>
                </div>
                <h4 class="iw-draw-card-title">{{ card.title }}</h4>
                <p class="iw-draw-card-desc">{{ card.desc }}</p>
                <div class="iw-draw-card-tags">
                  <span v-for="t in card.tags" :key="t" class="iw-draw-card-tag">{{ t }}</span>
                </div>
              </div>
            </div>

            <!-- Step 6: Final book plan -->
            <div v-else class="iw-final">
              <div class="iw-final-card">
                <h3>📋 小说立项书</h3>
                <div class="iw-final-item"><span>频道</span> {{ channel === 'male' ? '男频' : '女频' }}</div>
                <div class="iw-final-item"><span>赛道</span> {{ selectedTrack }}</div>
                <div class="iw-final-item" v-if="selectedSubType"><span>细分</span> {{ selectedSubType }}</div>
                <div class="iw-final-item"><span>标签</span> {{ selectedTags.join('、') || '未选择' }}</div>
                <div class="iw-final-item"><span>世界观</span> {{ savedWorldCard?.title || '待选择' }}</div>
                <div class="iw-final-item"><span>主角人设</span> {{ savedCharCard?.title || '待选择' }}</div>
                <div class="iw-final-item"><span>金手指</span> {{ savedCheatCard?.title || '待选择' }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="iw-footer">
          <button v-if="currentStep > 1" class="iw-btn-back" @click="currentStep--">← 返回上一步</button>
          <span v-else></span>
          <div class="iw-footer-right">
            <button v-if="currentStep >= 3 && currentStep <= 5 && drawCards.length && !generating"
              class="iw-btn-ghost" @click="selectedCard = Math.floor(Math.random() * drawCards.length)">
              🎲 随机选
            </button>
            <button v-if="currentStep < 5" class="iw-btn-next"
              :disabled="generating || (currentStep >= 3 && !drawCards.length) || (currentStep === 1 && !hasModel)"
              @click="advanceStep">
              <template v-if="generating">生成中...</template>
              <template v-else-if="currentStep === 1 && !hasModel">请先配置模型</template>
              <template v-else>{{ currentStep === 1 ? '开始抽卡：世界观定制' : '提交' }}</template>
            </button>
            <button v-else class="iw-btn-next" @click="finish">✅ 生成立项书</button>
            <button v-if="currentStep >= 5" class="iw-btn-next iw-btn-ss" @click="generateShortStory">📱 生成短篇</button>
          </div>
        </div>

        <p class="iw-hint">当你不知道下一步做什么的时候，在对话框输入「继续」试试</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { useModelStore } from '../stores/modelStore'

defineProps<{ isDark?: boolean }>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'finish', data: any): void
  (e: 'generate-short-story', payload: {
    platformId: string
    tagSet: any
    wordCount: number
    settings: any
  }): void
  (e: 'open-settings'): void
}>()
const msg = useMessage()
const visible = ref(false)
const currentStep = ref(1)

// 模型配置检查
const hasModel = computed(() => useModelStore().getEnabledProviders().length > 0)

function goToModelSettings() {
  visible.value = false
  emit('open-settings')
}

const steps = [
  { key: 'info', label: '基本信息' },
  { key: 'world', label: '世界观' },
  { key: 'char', label: '主角人设' },
  { key: 'cheat', label: '金手指' },
  { key: 'plan', label: '生成立项' },
  // TODO: { key: 'cover', label: '封面生成' } — 延后功能，暂无图片生成 API
]

// 当前模型（从 store 读取）
const currentModelName = computed(() => {
  const store = useModelStore()
  const p = store.getEnabledProviders()[0]
  if (!p) return '未配置模型'
  if ('models' in p) {
    const m = p.models.find(x => x.id === p.defaultModelId) || p.models[0]
    return `${p.name} / ${m?.name || '?'}`
  }
  return p.name
})

// Step 1 data
const channel = ref<'male' | 'female'>('male')
const selectedTrack = ref('')
const selectedSubType = ref('')
const selectedTags = ref<string[]>([])
const selectedPlatform = ref('fanqie')
const allPlatforms = getAllPlatforms()

const maleTracks = ['西方奇幻', '东方仙侠', '科幻末世', '都市日常', '都市修真', '都市高武', '历史古代', '战神赘婿', '都市种田', '传统玄幻', '历史脑洞', '悬疑脑洞', '都市脑洞', '玄幻脑洞', '悬疑灵异', '抗战谍战', '游戏体育', '动漫衍生', '男频衍生']
const femaleTracks = ['古风世情', '科幻末世', '游戏体育', '女频衍生', '玄幻言情', '种田', '年代', '现言脑洞', '宫斗宅斗', '悬疑脑洞', '古言脑洞', '快穿', '青春甜宠', '星光璀璨', '女频悬疑', '职场婚恋', '豪门总裁', '民国言情']
const currentTracks = computed(() => channel.value === 'male' ? maleTracks : femaleTracks)

const subTypes = ref<string[]>([])
// 赛道 → 子类型映射
const trackSubTypeMap: Record<string, string[]> = {
  '西方奇幻': ['剑与魔法', '史诗奇幻', '黑暗奇幻', '低魔世界'],
  '东方仙侠': ['凡人流', '修真体系', '洪荒流', '仙界篇'],
  '科幻末世': ['末日废土', '星际殖民', 'AI觉醒', '基因进化'],
  '都市日常': ['校园', '职场', '日常恋爱', '美食'],
  '都市修真': ['隐藏宗门', '灵气复苏', '都市异能', '修行学院'],
  '都市高武': ['古武世家', '龙组', '佣兵', '格斗竞技'],
  '历史古代': ['历史穿越', '王朝争霸', '科举官场', '古代商战'],
  '战神赘婿': ['战神归来', '赘婿逆袭', '医武双修', '豪门'],
  '都市种田': ['都市农场', '美食经营', '宠物', '休闲生活'],
  '传统玄幻': ['异世大陆', '升级打怪', '血脉觉醒', '宗门流'],
  '历史脑洞': ['历史改写', '穿越种田', '科技降维', '改革变法'],
  '悬疑脑洞': ['悬疑推理', '密室逃脱', '时间循环', '无限流'],
  '都市脑洞': ['规则怪谈', '游戏降临', '超能力', '反套路'],
  '玄幻脑洞': ['反套路修仙', '科学修仙', '系统流', '幕后流'],
  '悬疑灵异': ['捉鬼', '探灵', '民俗恐怖', '盗墓'],
  '抗战谍战': ['抗战', '谍战卧底', '特种兵', '情报战'],
  '游戏体育': ['电竞', '网游', '竞技体育', '运动番'],
  '动漫衍生': ['同人', '综漫', '角色扮演', '次元穿越'],
  '男频衍生': ['诸天流', '聊天群', '跨界', '综武'],
  '古风世情': ['古言', '宅斗', '经商种田', '王府'],
  '女频衍生': ['同人', '综影视', '快穿衍生', '跨界'],
  '玄幻言情': ['仙侠言情', '女强玄幻', '师徒', '神魔'],
  '种田': ['种田经商', '美食种田', '基建', '科举种田'],
  '年代': ['七零年代', '八零年代', '九零年代', '上山下乡'],
  '现言脑洞': ['系统', '穿书', '重生', '规则怪谈'],
  '宫斗宅斗': ['宫斗', '重生宅斗', '庶女', '王府嫡女'],
  '古言脑洞': ['穿越古言', '系统古言', '反派自救', '科技古言'],
  '快穿': ['任务快穿', '拯救反派', '攻略', '打脸渣男'],
  '青春甜宠': ['校园', '双向暗恋', '青梅竹马', '欢喜冤家'],
  '星光璀璨': ['娱乐圈', '选秀', '追星', '影帝'],
  '女频悬疑': ['悬疑言情', '探案', '心理', '惊悚'],
  '职场婚恋': ['都市职场', '先婚后爱', '契约夫妻', '职场逆袭'],
  '豪门总裁': ['霸道总裁', '替身', '萌宝', '契约情人'],
  '民国言情': ['军阀', '民国千金', '旗袍', '乱世佳人'],
  '末世': ['末世重生', '末世空间', '丧尸', '变异'],
  '游戏': ['电竞', '全息网游', '游戏直播', '游戏制作'],
}
function selectTrack(track: string) {
  selectedTrack.value = track
  selectedSubType.value = ''
  subTypes.value = trackSubTypeMap[track] || []
}

// Tags (灵感火花卡片标签合并，共 93 个：剧情44 + 情绪18 + 背景31)
const plotTags = ['重生', '穿越', '退婚打脸', '签到变强', '无敌流', '群像', '多女主', '单女主', '成长流', '反套路', '直播', '诸天万界', '无系统', '传承', '冒险', '创新', '反转', '吞噬', '商战', '回归', '复仇', '大佬', '守护', '幸运', '成长', '战斗', '打脸', '捡漏', '探险', '管理', '系统', '聊天群', '融合', '被动', '被迫', '误解', '躺赢', '进化', '逆袭', '重建', '量化', '金手指', '鉴定', '重启']
const moodTags = ['热血', '轻松搞笑', '杀伐果断', '爽文', '慢热', '快节奏', '暗黑', '治愈', '甜宠', '代价', '双面', '反噬', '女强', '情绪', '惩罚', '搞笑', '日常', '轻松']
const bgTags = ['现代', '古代', '未来', '异世界', '民国', '校园', '宗门', '军旅', '职场', '娱乐圈', '信息差', '修仙', '医术', '国家', '奇幻', '学院', '学霸', '异能', '文明碰撞', '时间', '星际', '末世', '火系', '炼丹', '知识', '社畜', '科幻', '血脉', '身份', '遗迹', '都市']

// 自定义标签（按分类持久化到 localStorage）
const CUSTOM_TAGS_KEY = 'ns:inspireCustomTags'
function loadCustomTags(): Record<string, string[]> {
  try { const raw = localStorage.getItem(CUSTOM_TAGS_KEY); return raw ? JSON.parse(raw) : {} }
  catch { return {} }
}
function saveCustomTags(data: Record<string, string[]>) {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(data))
}
const customTagsMap = ref<Record<string, string[]>>(loadCustomTags())
// UI 状态
const customInputCat = ref('')
const newCustomTag = ref('')
const customTagInputRef = ref<HTMLInputElement | null>(null)

function openCustomTag(catName: string) {
  customInputCat.value = catName
  newCustomTag.value = ''
  nextTick(() => customTagInputRef.value?.focus())
}
function cancelCustomTag() {
  customInputCat.value = ''
  newCustomTag.value = ''
}
function addCustomTag(catName: string) {
  const tag = newCustomTag.value.trim()
  if (!tag) { cancelCustomTag(); return }
  if (!customTagsMap.value[catName]) customTagsMap.value[catName] = []
  if (!customTagsMap.value[catName].includes(tag)) {
    customTagsMap.value[catName].push(tag)
    saveCustomTags(customTagsMap.value)
  }
  cancelCustomTag()
}

const tagCategories = computed(() => {
  const custom = customTagsMap.value
  return [
    { name: '剧情 / 爽点', tags: [...plotTags, ...(custom['剧情 / 爽点'] || [])] },
    { name: '情绪 / 文风', tags: [...moodTags, ...(custom['情绪 / 文风'] || [])] },
    { name: '时空 / 背景', tags: [...bgTags, ...(custom['时空 / 背景'] || [])] },
  ]
})

function toggleTag(tag: string) {
  const idx = selectedTags.value.indexOf(tag)
  if (idx > -1) selectedTags.value.splice(idx, 1)
  else selectedTags.value.push(tag)
}

// Card draw system — 每步独立保存选中卡
const generating = ref(false)
const selectedCard = ref(-1)
const drawCards = ref<{ title: string; desc: string; tags: string[]; badge?: string }[]>([])
// 保存各步选中结果（跨步不丢失）
const savedWorldCard = ref<{ title: string; desc: string; tags: string[] } | null>(null)
const savedCharCard = ref<{ title: string; desc: string; tags: string[] } | null>(null)
const savedCheatCard = ref<{ title: string; desc: string; tags: string[] } | null>(null)
const currentStepNames: Record<number, string> = { 2: '世界观', 3: '人设', 4: '金手指' }
const drawPrompts: Record<number, string> = {
  2: '抽世界观：定舞台底色，选你最对味的世界设定',
  3: '挑主角：谁能把故事撑起来？',
  4: '选金手指：主角凭什么翻盘？',
}

// H3: LLM 驱动的卡片生成
import { useLLM } from '../composables/useLLM'
import { useWorkRepo } from '../composables/useWorkRepo'
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'
import { SettingsManager } from '../composables/useSettings'
import { getAllPlatforms } from '../composables/usePlatformData'

const stepPrompts: Record<number, string> = {
  2: `你是一个小说世界观设计师。根据以下信息生成 9 个世界观方案：
频道：{channel}，赛道：{track}，标签：{tags}
每个方案包含：title（世界观名称）、desc（50字描述）、tags（3个标签数组）。
输出纯 JSON 数组格式：[{"title":"...","desc":"...","tags":["...","...","..."]},...]`,
  3: `你是一个角色设计师。根据以下信息生成 9 个主角人设方案：
频道：{channel}，赛道：{track}，标签：{tags}
【已选定世界观 — 以下是你必须围绕创作的世界设定】
{worldContext}
请在以上世界观的框架内设计主角人设。每个方案必须与选定世界观高度契合。
每个方案包含：title（人设名称）、desc（50字描述）、tags（3个标签数组）。
输出纯 JSON 数组格式。`,
  4: `你是一个小说金手指设计师。根据以下信息生成 9 个金手指方案：
频道：{channel}，赛道：{track}，标签：{tags}
【已选定世界观 — 金手指必须适配此世界设定】
{worldContext}
【已选定主角人设 — 金手指必须针对此人物特点设计】
{charContext}
请在世界观框架内，针对主角的特点设计专属金手指。金手指应与世界观规则自洽，并突出主角的独特优势。
每个方案包含：title（金手指名称）、desc（50字描述）、tags（3个标签数组）。
输出纯 JSON 数组格式。`,
}

async function generateCards(step: number) {
  if (generating.value) return
  if (!hasModel.value) {
    msg.error('请先配置 AI 模型后再生成卡片。')
    return
  }
  const prompt = stepPrompts[step]
  if (!prompt) return

  generating.value = true

  let filled = prompt
    .replace('{channel}', channel.value === 'male' ? '男频' : '女频')
    .replace('{track}', selectedTrack.value)
    .replace('{tags}', selectedTags.value.slice(0, 10).join(','))
    .replace('{worldContext}', savedWorldCard.value
      ? `名称：${savedWorldCard.value.title}\n描述：${savedWorldCard.value.desc}\n标签：${(savedWorldCard.value.tags || []).join('、')}`
      : '（尚未选择世界观，请在合理范围内自由发挥）')
    .replace('{charContext}', savedCharCard.value
      ? `名称：${savedCharCard.value.title}\n描述：${savedCharCard.value.desc}\n标签：${(savedCharCard.value.tags || []).join('、')}`
      : '（尚未选择主角人设，请在合理范围内自由发挥）')

  // 注入创作向导中填写的灵感上下文
  if (wizardInspiration.value.trim() || wizardWordCount.value !== 100) {
    const ctxParts: string[] = []
    if (wizardWordCount.value !== 100) ctxParts.push(`目标字数：${wizardWordCount.value}万字`)
    if (wizardInspiration.value.trim()) ctxParts.push(`创作灵感：${wizardInspiration.value.trim()}`)
    filled += `\n额外上下文：${ctxParts.join('，')}`
  }

  try {
    const llm = useLLM()
    const result = await llm.generate({
      systemPrompt: filled,
      userPrompt: '请生成 9 个方案。',
      maxTokens: 8192,  // 9 张卡片 JSON 需要足够空间
    })

    if (!result || !result.trim()) {
      throw new Error('LLM 返回空结果（可能模型配置问题或 API 错误）')
    }

    // 从 LLM 回复中提取 JSON 数组
    // 策略 1：匹配 markdown 代码块（支持 ```json 和 ``` 两种写法）
    const codeBlock = result.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    let json = codeBlock ? codeBlock[1].trim() : result

    // 策略 2：括号定位（处理 LLM 在 JSON 前后加说明文字的情况）
    const firstBracket = json.indexOf('[')
    const lastBracket = json.lastIndexOf(']')
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      json = json.slice(firstBracket, lastBracket + 1)
    }

    // 策略 3：修复常见 JSON 格式问题
    json = json
      .replace(/,\s*]/g, ']')       // 修复尾部多余逗号
      .replace(/,\s*}/g, '}')       // 修复对象尾部多余逗号
      .replace(/“/g, '"').replace(/”/g, '"') // 中文引号→英文引号

    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) throw new Error('LLM 返回非数组格式')
    if (parsed.length === 0) throw new Error('LLM 返回空数组')
    drawCards.value = parsed
  } catch (e: any) {
    console.error('[InspireWizard] AI 生成失败:', e.message || e)
    msg.error('AI 生成失败：' + (e.message || '请检查模型配置后重试'))
    drawCards.value = []
  }
  selectedCard.value = -1
  generating.value = false
}

function advanceStep() {
  if (currentStep.value === 1) {
    if (!selectedTrack.value) { msg.warning('请选择赛道'); return }
    if (!hasModel.value) { msg.error('请先配置 AI 模型。点击顶部「去配置」按钮进入模型设置。'); return }
    currentStep.value = 2
    generateCards(2)
  } else if (currentStep.value >= 2 && currentStep.value <= 4) {
    // 保存当前步的选中卡
    if (selectedCard.value >= 0 && drawCards.value[selectedCard.value]) {
      const card = drawCards.value[selectedCard.value]
      if (currentStep.value === 2) savedWorldCard.value = { ...card }
      else if (currentStep.value === 3) savedCharCard.value = { ...card }
      else if (currentStep.value === 4) savedCheatCard.value = { ...card }
    } else {
      // 必须选择一张卡片才能继续（世界/人设/金手指三步均不可跳过）
      const stepLabel = currentStepNames[currentStep.value] || '当前'
      msg.warning(`请先选择一个${stepLabel}方案，或点击「随机选」让 AI 帮你挑`)
      return
    }
    if (currentStep.value < 4) {
      currentStep.value++
      generateCards(currentStep.value)
    } else {
      currentStep.value = 5
    }
  }
}

function generateShortStory() {
  const payload = {
    platformId: selectedPlatform.value,
    tagSet: {
      platform: selectedPlatform.value,
      channel: channel.value,
      genre: selectedTrack.value || '',
      subgenre: [],
      elements: [],
      emotion: [],
      pov: 'third_person_limited',
      style: '',
      length: 'short',
      cool_points: [],
      taboo: [],
    },
    wordCount: 5000,
    settings: {
      worldCard: savedWorldCard.value,
      charCard: savedCharCard.value,
      cheatCard: savedCheatCard.value,
    },
  }
  emit('generate-short-story', payload)
  visible.value = false
}

async function finish() {
  // ── 0. 守卫：核心数据检查 ──
  if (!selectedTrack.value) { msg.warning('请先选择赛道'); return }
  if (!savedWorldCard.value) { msg.warning('请先在 Step 2 选择一个世界观方案，或点击「随机选」'); return }
  if (!savedCharCard.value) { msg.warning('请先在 Step 3 选择一个主角人设方案，或点击「随机选」'); return }
  if (!savedCheatCard.value) { msg.warning('请先在 Step 4 选择一个金手指方案，或点击「随机选」'); return }

  try {
    const repo = useWorkRepo()
    const channelName = channel.value === 'male' ? '男频' : '女频'
    const workTitle = `${channelName}·${selectedTrack.value}${savedWorldCard.value ? '·' + savedWorldCard.value.title : ''}`

    // 始终创建新作品（灵感火花立项不应覆盖现有作品）
    const workId = await repo.addWork(workTitle)
    if (!workId) throw new Error('作品创建失败')
    await repo.selectWork(workId)
    await repo.addVolume(workId, '默认卷')

    // ── 提炼关联数据（标签→世界观→人设→金手指 逐级约束）──
    const worldTags = savedWorldCard.value?.tags || []
    const charTags = savedCharCard.value?.tags || []
    const cheatTags = savedCheatCard.value?.tags || []
    const allDerivedTags = [...new Set([...worldTags, ...charTags, ...cheatTags])]

    // 从标签中分类提取 mood/背景 标签
    const moodSet = new Set(moodTags)
    const bgSet = new Set(bgTags)
    const styleMoods = selectedTags.value.filter(t => moodSet.has(t))  // 如：热血、轻松搞笑
    const bgLabels = selectedTags.value.filter(t => bgSet.has(t))      // 如：古代、修仙
    const styleText = styleMoods.length > 0
      ? `${channelName} × ${selectedTrack.value} | ${styleMoods.join('·')}`
      : `${channelName} × ${selectedTrack.value}${selectedSubType.value ? ' · ' + selectedSubType.value : ''}`

    // 力量体系：从世界观+金手指标签中推导
    const powerSystemText = savedCheatCard.value
      ? `${savedCheatCard.value.title}：${savedCheatCard.value.desc}（所属世界观：${savedWorldCard.value?.title || '未定'}）`
      : ''

    // 叙述视角：女频默认第一人称，男频默认第三人称
    const povText = channel.value === 'female' ? '第一人称' : '第三人称'

    // 作品简介
    const introText = `${channelName}·${selectedTrack.value}。${savedWorldCard.value.desc}。主角${savedCharCard.value.title}，${savedCharCard.value.desc}，凭借${savedCheatCard.value.title}——${savedCheatCard.value.desc}——在${selectedTrack.value}的舞台上展开故事。`

    // ── 1. 先写入 SettingsManager 实体（失败不影响 WorkspaceSettings）──
    const mgr = new SettingsManager()
    await mgr.load(workId)

    // 世界观实体（含标签约束）
    if (savedWorldCard.value) {
      await mgr.add({
        type: 'world_setting',
        name: savedWorldCard.value.title,
        summary: savedWorldCard.value.desc,
        source: 'ai_extraction',
        structuredData: {
          category: bgLabels.length > 0 ? bgLabels[0] : '世界观',
          description: savedWorldCard.value.desc,
          scope: '全局',
          status: '活跃',
          rules: worldTags.map(t => `【${t}】约束`),
          relatedEntities: [savedCharCard.value?.title || '', savedCheatCard.value?.title || ''],
        },
      })
    }

    // 主角实体（丰富字段）
    if (savedCharCard.value) {
      await mgr.add({
        type: 'character',
        name: savedCharCard.value.title,
        summary: savedCharCard.value.desc,
        source: 'ai_extraction',
        structuredData: {
          gender: channel.value === 'male' ? '男' : '女',
          age: '',
          identity: savedCharCard.value.title,
          nickname: '',
          personality: savedCharCard.value.desc,
          appearance: '',
          abilities: charTags,
          characterTags: charTags,
          skills: [],
          keyItems: [savedCheatCard.value?.title || ''],
          alive: true,
          location: savedWorldCard.value?.title || '',
          volume: 1,
          ending: '',
          coreTrauma: '',
          motivation: charTags.slice(0, 3).join('、'),
          growthArc: '',
          category: '主角',
        },
      })
    }

    // 金手指物品实体
    if (savedCheatCard.value) {
      await mgr.add({
        type: 'item',
        name: savedCheatCard.value.title,
        summary: savedCheatCard.value.desc,
        source: 'ai_extraction',
        structuredData: {
          owner: savedCharCard.value?.title || '主角',
          location: '',
          function: savedCheatCard.value.desc,
          status: '已获得',
          properties: cheatTags,
          destroyed: false,
          tags: ['金手指', ...cheatTags],
        },
      })

      // 力量体系实体（独立的世界设定子类）
      await mgr.add({
        type: 'world_setting',
        name: '力量体系：' + savedCheatCard.value.title,
        summary: savedCheatCard.value.desc,
        source: 'ai_extraction',
        structuredData: {
          category: '规则',
          description: `${savedCheatCard.value.title}：${savedCheatCard.value.desc}。世界观「${savedWorldCard.value?.title || ''}」下的核心力量规则。`,
          scope: '全局',
          status: '活跃',
          rules: [...cheatTags, ...worldTags].map(t => `${t}相关规则`),
          relatedEntities: [savedWorldCard.value?.title || '', savedCharCard.value?.title || ''],
        },
      })
    }

    // 世界标签作为独立设定实体（确保标签入设定面板）
    if (selectedTags.value.length > 0) {
      await mgr.add({
        type: 'world_setting',
        name: '标签集',
        summary: selectedTags.value.join('、'),
        source: 'ai_extraction',
        structuredData: {
          category: '文化',
          description: `作品标签：${selectedTags.value.join('、')}。频道：${channelName}，赛道：${selectedTrack.value}。`,
          scope: '全局',
          status: '活跃',
          rules: allDerivedTags.map(t => `标签「${t}」衍生约束`),
          relatedEntities: [savedWorldCard.value?.title || '', savedCharCard.value?.title || '', savedCheatCard.value?.title || ''],
        },
      })
    }

    await mgr.save(workId)

    // ── 2. 最后写入 WorkspaceSettings（SettingsManager 成功后再写，避免部分落库）──
    const ws = new WorkspaceSettings(workId)
    ws.update({
      title: workTitle,
      genre: channelName,
      subgenre: selectedTrack.value,
      tags: selectedTags.value,
      platformId: selectedPlatform.value,
      targetWordCount: wizardWordCount.value * 10000,
      wordsPerChapter: 2000,
      chaptersPerVolume: 50,
      pov: povText,
      intro: introText,
      styleDescription: styleText,
      worldSetting: savedWorldCard.value
        ? [savedWorldCard.value.title, savedWorldCard.value.desc, ...worldTags].join(' / ')
        : '',
      mainCharacter: savedCharCard.value
        ? [savedCharCard.value.title, savedCharCard.value.desc, ...charTags].join(' / ')
        : '',
      powerSystem: powerSystemText,
      cheatAbility: savedCheatCard.value
        ? [savedCheatCard.value.title, savedCheatCard.value.desc, ...cheatTags].join(' / ')
        : '',
    })

    visible.value = false
    msg.success('立项书已写入创作台！作品设定已填充。')
  } catch (e: any) {
    console.error('立项落库失败:', e)
    msg.error('立项落库失败: ' + (e.message || String(e)))
  }
}

const wizardWordCount = ref(100)
const wizardInspiration = ref('')

function open(payload?: { wordCount?: number; inspiration?: string }) {
  currentStep.value = 1
  channel.value = 'male'
  selectedTrack.value = ''
  selectedSubType.value = ''
  selectedPlatform.value = 'fanqie'
  selectedTags.value = []
  selectedCard.value = -1
  savedWorldCard.value = null
  savedCharCard.value = null
  savedCheatCard.value = null
  drawCards.value = []
  generating.value = false
  customInputCat.value = ''
  newCustomTag.value = ''
  // 重置到默认值，防止上次会话数据泄漏
  wizardWordCount.value = 100
  wizardInspiration.value = ''
  if (payload) {
    wizardWordCount.value = payload.wordCount || 100
    wizardInspiration.value = payload.inspiration || ''
  }
  visible.value = true
}

defineExpose({ open })
</script>

<style scoped>
/* ── 弹窗外壳 ── */
.iw-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
.iw-root { width: 940px; max-width: calc(100vw - 48px); max-height: 90vh; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 12px 48px rgba(0,0,0,0.4); }
.iw-dark { background: #1a1a20; color: #d4d4d4; }
.iw-light { background: #fafafa; color: #1a1a1a; }

/* ── 顶栏 ── */
.iw-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 28px 16px; border-bottom: 1px solid rgba(128,128,128,0.08); flex-shrink: 0; }
.iw-header-left { min-width: 0; }
.iw-title { font-size: 20px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 8px; }
.iw-subtitle { font-size: 12px; opacity: 0.35; margin: 6px 0 0; }
.iw-header-right { display: flex; align-items: center; gap: 12px; }
.iw-model { font-size: 11px; padding: 3px 10px; border-radius: 10px; background: rgba(128,128,128,0.06); opacity: 0.6; }
.iw-model-warn { background: rgba(224,96,96,0.1); color: #e06060; opacity: 1; font-weight: 500; }
.iw-progress { font-size: 11px; opacity: 0.35; }
.iw-close { width: 32px; height: 32px; border: none; border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.3; flex-shrink: 0; transition: all 0.15s; }
.iw-close:hover { opacity: 0.8; background: rgba(128,128,128,0.08); }

/* ── 步骤指示器（带连接线）── */
.iw-steps { display: flex; align-items: center; justify-content: center; padding: 16px 28px; border-bottom: 1px solid rgba(128,128,128,0.06); flex-shrink: 0; }
.iw-step { display: flex; align-items: center; gap: 6px; cursor: default; font-size: 12px; opacity: 0.3; position: relative; }
.iw-step.current { opacity: 1; font-weight: 600; }
.iw-step.done { opacity: 0.55; cursor: pointer; }
.iw-step-dot { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; background: rgba(128,128,128,0.08); transition: all 0.2s; }
.iw-step.current .iw-step-dot { background: #2ea86a; color: #fff; box-shadow: 0 2px 8px rgba(46,168,106,0.3); }
.iw-step.done .iw-step-dot { background: #2ea86a; color: #fff; }
.iw-step-label { white-space: nowrap; }
.iw-step-line { display: inline-block; width: 32px; height: 2px; background: rgba(128,128,128,0.1); margin: 0 6px; border-radius: 1px; transition: background 0.2s; }
.iw-step-line.filled { background: #2ea86a; }

/* ── 主体 ── */
.iw-body { flex: 1; overflow-y: auto; padding: 20px 28px; }
.iw-step-content { }

/* ── 未配置模型警告 ── */
.iw-no-model-banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-bottom: 24px; border-radius: 12px; border: 1px solid rgba(224,96,96,0.2); background: rgba(224,96,96,0.04); }
.iw-no-model-icon { font-size: 22px; flex-shrink: 0; }
.iw-no-model-text { flex: 1; min-width: 0; }
.iw-no-model-text strong { font-size: 13px; color: #e06060; }
.iw-no-model-text p { font-size: 11px; opacity: 0.45; margin: 3px 0 0; }
.iw-no-model-btn { flex-shrink: 0; padding: 7px 18px; border: none; border-radius: 8px; background: #e06060; color: #fff; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; transition: all 0.15s; }
.iw-no-model-btn:hover { background: #c94a4a; }

/* ── 区块 ── */
.iw-step-block { margin-bottom: 24px; }
.iw-step-block h3 { font-size: 13px; font-weight: 600; margin: 0 0 6px; letter-spacing: 0.3px; }
.iw-step-desc { font-size: 12px; opacity: 0.4; margin: 0 0 12px; line-height: 1.5; }

/* ── 频道选择 ── */
.iw-channel-row { display: flex; gap: 12px; }
.iw-channel-btn { flex: 1; display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 14px; border: 2px solid rgba(128,128,128,0.08); background: rgba(128,128,128,0.02); color: inherit; cursor: pointer; font-family: inherit; text-align: left; transition: all 0.2s; }
.iw-channel-btn:hover { border-color: rgba(46,168,106,0.25); background: rgba(46,168,106,0.02); }
.iw-channel-btn.active { border-color: #2ea86a; background: rgba(46,168,106,0.04); box-shadow: 0 2px 12px rgba(46,168,106,0.1); }
.iw-channel-icon { font-size: 22px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(128,128,128,0.06); flex-shrink: 0; }
.iw-channel-btn strong { font-size: 14px; display: block; }
.iw-channel-btn p { font-size: 11px; opacity: 0.4; margin: 3px 0 0; line-height: 1.4; }

/* ── 赛道/平台标签 ── */
.iw-track-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.iw-track-btn { padding: 6px 16px; border-radius: 20px; border: 1px solid rgba(128,128,128,0.1); background: rgba(128,128,128,0.02); color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; }
.iw-track-btn:hover { border-color: rgba(128,128,128,0.3); background: rgba(128,128,128,0.04); }
.iw-track-btn.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }
.iw-track-btn.sm { font-size: 11px; padding: 4px 12px; }
.iw-dark .iw-track-btn.active { background: #e8e8e8; color: #111; border-color: #e8e8e8; }

/* ── 标签区 ── */
.iw-tags-section { margin-top: 20px; display: flex; flex-direction: column; gap: 16px; }
.iw-tag-cat-label { font-size: 11px; font-weight: 600; opacity: 0.4; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.iw-tag-cat-row { display: flex; flex-wrap: wrap; gap: 7px; }
.iw-tag-btn { padding: 4px 13px; border-radius: 16px; border: 1px solid rgba(128,128,128,0.1); background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; transition: all 0.15s; }
.iw-tag-btn:hover { border-color: rgba(46,168,106,0.25); background: rgba(46,168,106,0.02); }
.iw-tag-btn.active { background: rgba(46,168,106,0.1); color: #2ea86a; border-color: rgba(46,168,106,0.3); font-weight: 500; }
.iw-tag-add { padding: 4px 11px; border-style: dashed; opacity: 0.35; font-weight: 700; }
.iw-tag-add:hover { opacity: 0.7; border-color: rgba(46,168,106,0.4); }
.iw-custom-tag-input { padding: 4px 11px; border-radius: 16px; border: 1px solid rgba(46,168,106,0.5); background: rgba(46,168,106,0.04); color: inherit; font-size: 11px; font-family: inherit; outline: none; width: 90px; }
.iw-custom-tag-input::placeholder { opacity: 0.25; }

/* ── 抽卡区 ── */
.iw-draw-header { margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
.iw-draw-locked { font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 10px; background: rgba(46,168,106,0.05); color: #2ea86a; }
.iw-regenerate-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 14px; border: 1px solid rgba(128,128,128,0.12); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; flex-shrink: 0; }
.iw-regenerate-btn:hover:not(:disabled) { border-color: rgba(46,168,106,0.3); color: #2ea86a; }
.iw-regenerate-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.iw-spinner { width: 14px; height: 14px; border: 2px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: iw-spin 0.6s linear infinite; display: inline-block; }

/* ── 加载动画 ── */
.iw-generating { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; gap: 18px; }
.iw-gen-spinner { width: 36px; height: 36px; border: 3px solid rgba(128,128,128,0.08); border-top-color: #2ea86a; border-radius: 50%; animation: iw-spin 0.8s linear infinite; }
.iw-generating p { font-size: 13px; opacity: 0.4; margin: 0; }
@keyframes iw-spin { to { transform: rotate(360deg); } }

/* ── 卡片网格（3×3）── */
.iw-card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.iw-draw-card { padding: 16px; border-radius: 14px; border: 1.5px solid rgba(128,128,128,0.08); background: rgba(128,128,128,0.015); cursor: pointer; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); position: relative; }
.iw-draw-card:hover { border-color: rgba(46,168,106,0.25); transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
.iw-draw-card.selected { border-color: #2ea86a; background: rgba(46,168,106,0.04); box-shadow: 0 2px 12px rgba(46,168,106,0.12); }
.iw-draw-card.selected::after { content: '✓'; position: absolute; top: 10px; right: 12px; width: 20px; height: 20px; border-radius: 50%; background: #2ea86a; color: #fff; font-size: 11px; display: flex; align-items: center; justify-content: center; }
.iw-draw-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.iw-draw-card-badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; background: rgba(128,128,128,0.06); opacity: 0.6; }
.iw-draw-card-title { font-size: 14px; font-weight: 600; margin: 0 0 8px; line-height: 1.4; }
.iw-draw-card-desc { font-size: 11.5px; opacity: 0.5; line-height: 1.6; margin: 0 0 10px; }
.iw-draw-card-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.iw-draw-card-tag { font-size: 10px; padding: 2px 8px; border-radius: 6px; background: rgba(128,128,128,0.05); opacity: 0.7; }

/* ── 立项书 ── */
.iw-final-card { padding: 24px; border-radius: 16px; border: 1.5px solid rgba(46,168,106,0.15); background: rgba(46,168,106,0.02); }
.iw-final-card h3 { font-size: 16px; font-weight: 700; margin: 0 0 16px; }
.iw-final-item { font-size: 13px; margin: 8px 0; display: flex; gap: 10px; line-height: 1.5; }
.iw-final-item span { opacity: 0.4; min-width: 60px; flex-shrink: 0; font-weight: 500; }

/* ── 底栏 ── */
.iw-footer { display: flex; justify-content: space-between; align-items: center; padding: 16px 28px; border-top: 1px solid rgba(128,128,128,0.06); flex-shrink: 0; }
.iw-btn-back { padding: 7px 18px; border: 1px solid rgba(128,128,128,0.12); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; }
.iw-btn-back:hover { border-color: rgba(128,128,128,0.3); }
.iw-btn-next { padding: 9px 30px; border: none; border-radius: 10px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 600; transition: all 0.15s; box-shadow: 0 2px 8px rgba(46,168,106,0.2); }
.iw-btn-next:hover { background: #258d58; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(46,168,106,0.25); }
.iw-btn-next:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
.iw-btn-ss { background: #6366f1; margin-left: 8px; box-shadow: 0 2px 8px rgba(99,102,241,0.2); }
.iw-btn-ss:hover { background: #4f46e5; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
.iw-footer-right { display: flex; gap: 8px; }
.iw-btn-ghost { padding: 8px 16px; border: 1px solid rgba(128,128,128,0.12); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.15s; }
.iw-btn-ghost:hover { border-color: rgba(128,128,128,0.3); background: rgba(128,128,128,0.03); }
.iw-hint { text-align: center; font-size: 10px; opacity: 0.15; padding: 4px 28px 10px; margin: 0; }
</style>
