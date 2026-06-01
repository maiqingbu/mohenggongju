<template>
  <div class="ws-panel">
    <!-- A. 顶部工具栏 -->
    <div class="ws-toolbar">
      <div class="ws-toolbar-left">
        <span class="ws-breadcrumb">工作台 / 作品信息</span>
      </div>
      <div class="ws-toolbar-center">
        <button class="ws-tag green ws-tag-btn" @click="showPotentialModal = true">📊 网文潜力评估</button>
      </div>
      <div class="ws-toolbar-right">
        <button class="ws-icon-btn" title="刷新" @click="loadData"><n-icon size="16"><RefreshOutline /></n-icon></button>
        <button class="ws-text-btn" @click="handleImport">导入</button>
        <button class="ws-text-btn" @click="handleExport">导出</button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="ws-content">
      <!-- B. 基础信息 -->
      <div class="ws-section-label">基础信息</div>
      <div class="ws-grid ws-grid-2col">
        <!-- 板块1：作品信息 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">作品信息</span>
            <button class="ws-ai-btn" @click="emitAi('title')" title="AI 书名">✨ AI 书名</button>
          </div>
          <div class="ws-card-body">
            <input
              class="ws-input"
              v-model="settings.data.title"
              placeholder="书名用于封面与推荐"
              @change="persist"
            />
          </div>
        </div>

        <!-- 板块2：作品标签 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">作品标签</span>
            <button class="ws-ai-btn" @click="openTagEditor">编辑标签</button>
          </div>
          <div class="ws-card-body">
            <div class="ws-tags-row">
              <n-tag
                v-for="(t, i) in settings.data.tags"
                :key="i"
                closable
                size="small"
                @close="removeTag(i)"
              >{{ t }}</n-tag>
              <input
                class="ws-tag-input"
                v-model="tagDraft"
                placeholder="添加标签"
                @keydown.enter="addTag"
                @blur="addTag"
                size="8"
              />
            </div>
            <div class="ws-field-row">
              <span class="ws-field-label">类型（题材/赛道）</span>
              <input class="ws-input sm" v-model="settings.data.genre" placeholder="如：实用短篇" @change="persist" />
              <span class="ws-field-hint">必填；标签会用于 AI 提示与检索</span>
            </div>
          </div>
        </div>

        <!-- 板块3：故事视角 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">故事视角</span>
          </div>
          <div class="ws-card-body">
            <input
              class="ws-input"
              v-model="settings.data.pov"
              placeholder="例：第一人称 / 第三人称 / 多视角切换"
              @change="persist"
            />
          </div>
        </div>

        <!-- 板块4：发布平台 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">发布平台</span>
          </div>
          <div class="ws-card-body">
            <div style="display:flex;align-items:center;gap:8px">
              <n-select
                v-model:value="settings.data.platformId"
                :options="platformOptions"
                placeholder="例：番茄 / 起点 / 飞卢 / 纵横"
                @update:value="persist"
                style="flex:1"
              />
              <button v-if="settings.data.platformId" class="ws-link-btn" @click="openProfileEditor" title="查看/编辑平台画像">✏️ 画像</button>
            </div>
            <!-- 平台画像弹窗 -->
            <Teleport to="body" v-if="showProfileEditor">
              <div class="ws-profile-overlay" @click.self="showProfileEditor = false">
                <div class="ws-profile-modal" :class="props.isDark !== false ? 'ws-profile-dark' : 'ws-profile-light'">
                  <div class="ws-profile-header">
                    <h3>平台画像 · {{ settings.data.platformId }}</h3>
                    <button @click="showProfileEditor = false">✕</button>
                  </div>
                  <div class="ws-profile-body">
                    <textarea class="ws-profile-textarea" v-model="platformProfileDraft" rows="16"></textarea>
                  </div>
                  <div class="ws-profile-footer">
                    <button class="ws-save-btn" @click="saveCustomPlatformProfile">保存</button>
                    <button class="ws-link-btn" @click="resetCustomPlatformProfile">重置为默认</button>
                    <button class="ws-link-btn" @click="showProfileEditor = false">取消</button>
                  </div>
                </div>
              </div>
            </Teleport>
          </div>
        </div>

        <!-- 板块5：目标字数 -->
        <div class="ws-card ws-card-full">
          <div class="ws-card-header">
            <span class="ws-card-title">目标字数</span>
            <button class="ws-link-btn" @click="openWordCountPlanner">字数规划</button>
          </div>
          <div class="ws-card-body">
            <input
              class="ws-input sm"
              type="number"
              v-model.number="settings.data.targetWordCount"
              placeholder="例：100000"
              @change="persist"
            />
            <span class="ws-field-hint">用于后续设定推荐数量与卷/章节奏规划</span>
          </div>
        </div>
      </div>

      <!-- C. 详细说明 -->
      <div class="ws-section-label">详细说明</div>
      <div class="ws-grid ws-grid-2col">
        <!-- 板块6：作品简介 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">作品简介</span>
            <button class="ws-ai-btn" @click="emitAi('intro')" title="AI 简介">✨ AI 简介</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.intro"
              placeholder="控制在 150 字以内，提炼题材与冲突"
              maxlength="150"
              rows="3"
              @change="persist"
            ></textarea>
            <div class="ws-char-count">{{ settings.data.intro.length }}/150</div>
          </div>
        </div>

        <!-- 板块7：文风说明 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">文风说明</span>
            <button class="ws-ai-btn" @click="emitAi('style')" title="AI 文风">✨ AI 文风</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.styleDescription"
              placeholder="描述语气、句式偏好、代入视角等关键要点"
              rows="3"
              @change="persist"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- D. 核心构架 -->
      <div class="ws-divider"></div>
      <div class="ws-section-label">💠 核心构架</div>
      <div class="ws-grid ws-grid-2col">
        <!-- 板块8：世界观/背景 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">世界观 / 背景</span>
            <button class="ws-ai-btn" @click="emitAi('world')" title="AI 世界观">✨ AI 世界观</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.worldSetting"
              placeholder="系统自动创建，用于保存实用短篇生成文章"
              rows="3"
              @change="persist"
            ></textarea>
          </div>
        </div>

        <!-- 板块9：主角 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">主角（仅主角）</span>
            <button class="ws-ai-btn" @click="emitAi('character')" title="AI 主角">✨ AI 主角</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.mainCharacter"
              placeholder="填写主角背景、性格、驱动力、弧光"
              rows="3"
              @change="persist"
            ></textarea>
          </div>
        </div>

        <!-- 板块10：力量体系 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">力量体系</span>
            <button class="ws-ai-btn" @click="emitAi('power')" title="AI 力量">✨ AI 力量</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.powerSystem"
              placeholder="填写力量等级、突破条件、能力规则"
              rows="3"
              @change="persist"
            ></textarea>
          </div>
        </div>

        <!-- 板块11：金手指 -->
        <div class="ws-card">
          <div class="ws-card-header">
            <span class="ws-card-title">金手指</span>
            <button class="ws-ai-btn" @click="emitAi('cheat')" title="AI 金手指">✨ AI 金手指</button>
          </div>
          <div class="ws-card-body">
            <textarea
              class="ws-textarea"
              v-model="settings.data.cheatAbility"
              placeholder="填写金手指触发、能力、限制、负面效果"
              rows="3"
              @change="persist"
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 弹窗 -->
    <AiModal
      v-if="aiModal.visible"
      :is-dark="isDark"
      :title="aiModal.title"
      :description="aiModal.description"
      :target-label="aiModal.targetLabel"
      :write-label="aiModal.writeLabel"
      :show-gen-count="aiModal.showGenCount"
      :template-name="aiModal.templateName"
      :template-desc="aiModal.templateDesc"
      :platform-id="settings.data.platformId || null"
      :context-switches="aiModal.contextSwitches"
      :special-fields="aiModal.specialFields"
      :hide-chapter="true"
      @close="aiModal.visible = false"
      @write="onAiWrite"
    />

    <!-- 标签编辑器 -->
    <TagEditor ref="tagEditor" :is-dark="isDark" @apply="onTagsApplied" />

    <!-- 字数规划 -->
    <WordCountPlanner ref="wordCountPlanner" :is-dark="isDark" @apply="onWordCountApplied" />

    <!-- 网文潜力评估 -->
    <PotentialAssessmentModal
      v-if="showPotentialModal"
      :is-dark="isDark"
      :work-id="currentWorkId"
      :settings="settings.data"
      @close="showPotentialModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { NSelect, NTag, NIcon, useMessage } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import AiModal, { type ContextSwitch } from './AiModal.vue'
import { WorkspaceSettings, type WorkspaceSettingsData } from '../composables/useWorkspaceSettings'
import { getTemplate } from '../composables/useTemplates'
import { getAllPlatforms, getPlatformProfile, loadPlatformProfile, savePlatformProfile } from '../composables/usePlatformData'
import { useWorkStore } from '../stores/workStore'
import { isTauri, localCurrentWorkId } from '../composables/useLocalWorkTree'
import TagEditor from './TagEditor.vue'
import WordCountPlanner from './WordCountPlanner.vue'
import PotentialAssessmentModal from './PotentialAssessmentModal.vue'

const props = defineProps<{ isDark?: boolean }>()
const message = useMessage()
const emit = defineEmits<{
  (e: 'ai-generate', field: string): void
}>()

const tauri = isTauri()
const piniaStore = tauri ? useWorkStore() : null
const workId = tauri
  ? (piniaStore?.currentWorkId ?? 0)
  : localCurrentWorkId.value ?? 0

// 实时 workId（Tauri 下 Pinia store 可能后续更新）
const currentWorkId = computed(() => tauri ? (piniaStore?.currentWorkId ?? 0) : (localCurrentWorkId.value ?? 0))

const settings = ref(new WorkspaceSettings(workId))
const showPotentialModal = ref(false)
const tagDraft = ref('')

const platformOptions = getAllPlatforms().map(p => ({ label: p.name, value: p.id }))

// 平台画像编辑器
const showProfileEditor = ref(false)
const platformProfileDraft = ref('')
function saveCustomPlatformProfile() {
  if (!settings.value.data.platformId) return
  savePlatformProfile(settings.value.data.platformId, platformProfileDraft.value)
  showProfileEditor.value = false
  message.success('平台画像已保存')
}
function resetCustomPlatformProfile() {
  if (!settings.value.data.platformId) return
  platformProfileDraft.value = getPlatformProfile(settings.value.data.platformId)
}
function openProfileEditor() {
  if (!settings.value.data.platformId) return
  platformProfileDraft.value = loadPlatformProfile(settings.value.data.platformId) || getPlatformProfile(settings.value.data.platformId)
  showProfileEditor.value = true
}

function loadData() {
  const id = tauri ? ((piniaStore!.currentWorkId as number) ?? 0) : (localCurrentWorkId.value ?? 0)
  settings.value = new WorkspaceSettings(id)
}

function persist() {
  settings.value.save()
}

function addTag() {
  const t = tagDraft.value.trim()
  if (!t) return
  if (!settings.value.data.tags.includes(t)) {
    settings.value.data.tags.push(t)
    persist()
  }
  tagDraft.value = ''
}

function removeTag(i: number) {
  settings.value.data.tags.splice(i, 1)
  persist()
}

// ── 标签编辑器 ──
const tagEditor = ref<InstanceType<typeof TagEditor> | null>(null)
function openTagEditor() {
  tagEditor.value?.open({ type: settings.value.data.genre || '', tags: [...(settings.value.data.tags || [])] })
}
function onTagsApplied(data: { type: string; tags: string[] }) {
  settings.value.data.genre = data.type
  settings.value.data.tags = data.tags
  persist()
  message.success(`标签已更新：${data.tags.length} 个标签`)
}

// ── 字数规划 ──
const wordCountPlanner = ref<InstanceType<typeof WordCountPlanner> | null>(null)
function openWordCountPlanner() {
  wordCountPlanner.value?.open({
    targetWords: settings.value.data.targetWordCount || 100000,
    wordsPerChapter: settings.value.data.wordsPerChapter || 2000,
    chaptersPerVolume: settings.value.data.chaptersPerVolume || 50,
  })
}
function onWordCountApplied(data: { targetWords: number; wordsPerChapter: number; chaptersPerVolume: number }) {
  settings.value.data.targetWordCount = data.targetWords
  settings.value.data.wordsPerChapter = data.wordsPerChapter
  settings.value.data.chaptersPerVolume = data.chaptersPerVolume
  persist()
  const volumes = data.wordsPerChapter && data.chaptersPerVolume
    ? Math.ceil(data.targetWords / (data.wordsPerChapter * data.chaptersPerVolume))
    : 0
  message.success(`字数规划已更新：${data.targetWords.toLocaleString()} 字 / ${volumes} 卷`)
}

// AI 弹窗状态
const aiModal = reactive({
  visible: false,
  title: '',
  description: '',
  targetLabel: '',
  writeLabel: '',
  field: '' as string,
  showGenCount: false,
  templateName: '',
  templateDesc: '',
  contextSwitches: [] as ContextSwitch[],
  specialFields: [] as any[],
})

const AI_FIELD_CONFIG: Record<string, { title: string; desc: string; target: string; write: string; showGenCount?: boolean; template?: string;  defaultPrompt?: string; contextSwitches?: ContextSwitch[]; specialFields?: { key: string; label: string; type: string; placeholder?: string; defaultValue?: string }[] }> = {
  title:    { title: 'AI 书名生成', desc: '基于作品题材与核心设定，生成爆款书名方案。', target: '写入书名', write: '✓ 写入书名', showGenCount: true, template: '官方-番茄爆款书名 1.2', defaultPrompt: '生成 6 个书名备选，每行一个，格式：书名 — 一句话卖点。总输出不超过 200 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台信息（影响书名风格）', enabled:true },{ key:'outline', label:'总纲', desc:'全书总纲', enabled:false }] },
  intro:    { title: 'AI 简介生成', desc: '基于作品设定生成吸引读者的作品简介。', target: '写入作品简介', write: '✓ 写入作品简介', template: '3.0简介生成', defaultPrompt: '输出 120~180 字的作品简介。开头即冲突，结尾留钩子，禁止空洞形容词。总输出不超过 200 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台信息', enabled:true }] },
  style:    { title: 'AI 文风说明', desc: '根据作品设定生成文风与写作风格说明。', target: '写入文风说明', write: '✓ 写入文风说明', template: '官方-文风说明 2.0', defaultPrompt: '输出 3~5 条文风说明，覆盖语气调性、叙述节奏、句式风格、情绪导向。每条不超过 20 字。总输出不超过 150 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台信息', enabled:true }] },
  world:    { title: 'AI 世界观扩写', desc: '基于作品类型与已有设定，扩写世界观核心框架。', target: '写入世界观设定', write: '✓ 写入世界观设定', template: '多维世界观', defaultPrompt: '用 200~300 字概括世界观框架，覆盖：时代背景、势力格局、核心规则、底层矛盾。每条一句话，不展开叙述。总输出不超过 300 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'world', label:'当前世界观', desc:'已填写的世界观设定草稿', enabled:true }] },
  character:{ title: 'AI 主角设定', desc: '基于作品设定生成主角完整人设卡。', target: '写入主角信息', write: '✓ 写入主角信息', template: '创建角色', defaultPrompt: '输出主角人设卡，字段：姓名/年龄/身份/性格关键词(3个)/核心驱动力/成长弧光/外貌标志/口头禅。每项不超过 15 字。总输出不超过 250 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true }] },
  power:    { title: 'AI 力量体系', desc: '为作品设计修炼/力量等级体系。', target: '写入力量体系', write: '✓ 写入力量体系', template: '多维世界观', defaultPrompt: '输出力量等级体系，3~5 个等级，每级一行：等级名 — 核心能力。末尾写一句核心规则与代价。总输出不超过 300 字。', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'world', label:'世界观', desc:'已有的世界观设定', enabled:true }] },
  cheat:    { title: 'AI 金手指设计', desc: '为作品设计主角金手指/外挂机制。', target: '写入金手指', write: '✓ 写入金手指', template: '爆款飞卢番茄金手指', defaultPrompt: '输出金手指设定：类型/获取方式/核心能力/限制代价/成长路线。每项一句话。禁止无代价无敌流。总输出不超过 250 字。', specialFields: [{ key:'cheatIdea', label:'金手指灵感 *', type:'textarea', placeholder:'请输入你已有的金手指初步设想', defaultValue:'' }], contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台信息', enabled:true }] },
}

function emitAi(field: string) {
  const wid = tauri ? (piniaStore!.currentWorkId as number) : localCurrentWorkId.value
  if (!wid) { message.warning('请先在左侧目录中选择或创建一个作品'); return }
  const cfg = AI_FIELD_CONFIG[field]
  if (!cfg) { emit('ai-generate', field); return }

  // 根据平台选择模板
  const tpl = getTemplate(('ws_' + field) as any, settings.value.data.platformId || null)

  aiModal.visible = true
  aiModal.title = cfg.title
  aiModal.description = cfg.desc
  aiModal.targetLabel = cfg.target
  aiModal.writeLabel = cfg.write
  aiModal.field = field
  aiModal.showGenCount = cfg.showGenCount || false
  aiModal.templateName = tpl.name
  aiModal.templateDesc = tpl.desc
  aiModal.specialFields = (cfg.specialFields || []).map(f => ({...f}))
  aiModal.contextSwitches = cfg.contextSwitches || []
}

// AiModal field → WorkspaceSettingsData 字段映射
const FIELD_MAP: Record<string, string> = {
  title: 'title',
  intro: 'intro',
  style: 'styleDescription',
  world: 'worldSetting',
  character: 'mainCharacter',
  power: 'powerSystem',
  cheat: 'cheatAbility',
}

function onAiWrite(value: string) {
  const targetField = FIELD_MAP[aiModal.field]
  if (!targetField) { message.error('未知写入目标: ' + aiModal.field); return }
  ;(settings.value.data as any)[targetField] = value
  persist()
  message.success(`已写入${aiModal.targetLabel || targetField}`)
  aiModal.visible = false
}

// 导入白名单：仅允许 WorkspaceSettingsData 中用户可编辑的字段
const IMPORT_WHITELIST: Record<string, (v: any) => boolean> = {
  title:            v => typeof v === 'string',
  tags:             v => Array.isArray(v) && v.every((t: any) => typeof t === 'string'),
  genre:            v => typeof v === 'string',
  subgenre:         v => typeof v === 'string',
  pov:              v => typeof v === 'string',
  platformId:       v => typeof v === 'string',
  targetWordCount:  v => typeof v === 'number',
  wordsPerChapter:  v => typeof v === 'number',
  chaptersPerVolume:v => typeof v === 'number',
  intro:            v => typeof v === 'string',
  styleDescription: v => typeof v === 'string',
  worldSetting:     v => typeof v === 'string',
  mainCharacter:    v => typeof v === 'string',
  powerSystem:      v => typeof v === 'string',
  cheatAbility:     v => typeof v === 'string',
}

function validateImportData(raw: any): Partial<WorkspaceSettingsData> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const clean: any = {}
  let hasValidField = false
  for (const key of Object.keys(raw)) {
    const validator = IMPORT_WHITELIST[key]
    if (!validator) continue  // 跳过不在白名单中的字段
    if (!validator(raw[key])) {
      message.warning(`字段"${key}"类型不匹配，已跳过`)
      continue
    }
    clean[key] = raw[key]
    hasValidField = true
  }
  return hasValidField ? clean : null
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const clean = validateImportData(raw)
        if (!clean) { message.error('文件中没有可识别的设定数据'); return }
        const mergedCount = Object.keys(clean).length
        Object.assign(settings.value.data, clean)
        persist()
        message.success(`已导入 ${mergedCount} 个字段`)
      } catch { message.error('JSON 格式无效，请检查文件编码') }
    }
    reader.readAsText(file)
  }
  input.click()
}

function handleExport() {
  // 仅导出用户可编辑的设定字段，排除 progress、agentConfig 等内部状态
  const exportData: any = {}
  for (const key of Object.keys(IMPORT_WHITELIST)) {
    exportData[key] = (settings.value.data as any)[key]
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'workspace-settings.json'; a.click()
  URL.revokeObjectURL(url)
}

// 当 workStore 的 currentWorkId 变化时重新加载
watch(
  () => tauri ? (piniaStore!.currentWorkId as number) : localCurrentWorkId.value,
  (newId) => {
    if (newId !== null && newId !== undefined && newId !== workId) {
      settings.value = new WorkspaceSettings(newId)
    }
  },
)

defineExpose({ triggerAi: emitAi })
</script>

<style scoped>
.ws-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── A. 顶部工具栏 ── */
.ws-toolbar {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border-color);
  gap: 12px;
  flex-shrink: 0;
  min-height: 38px;
}
.ws-toolbar-left { display: flex; align-items: center; }
.ws-breadcrumb { font-size: 12px; opacity: 0.5; }
.ws-toolbar-center { flex: 1; display: flex; justify-content: center; }
.ws-tag {
  font-size: 11px; padding: 1px 10px; border-radius: 10px; font-weight: 500;
}
.ws-tag.green { background: rgba(82,200,160,0.15); color: #52c8a0; }
.ws-tag-btn {
  cursor: pointer; transition: background 0.15s, transform 0.15s;
  font-family: inherit; border: none; outline: none;
}
.ws-tag-btn:hover { background: rgba(82,200,160,0.25); transform: translateY(-1px); }
.ws-tag-btn:active { transform: translateY(0); }
.ws-toolbar-right { display: flex; align-items: center; gap: 4px; }
.ws-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--btn-color);
}
.ws-icon-btn:hover { background: var(--btn-hover-bg); }
.ws-toolbar-divider { width: 1px; height: 16px; background: var(--border-color); margin: 0 4px; }
.ws-text-btn {
  background: transparent; border: 1px solid var(--border-color); border-radius: 4px;
  padding: 3px 10px; font-size: 11px; cursor: pointer; font-family: inherit; color: inherit;
}
.ws-text-btn:hover { background: var(--btn-hover-bg); }

/* ── Content ── */
.ws-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.ws-section-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 16px 0 8px;
}
.ws-section-label:first-child { margin-top: 0; }

.ws-divider {
  border-top: 1px solid var(--border-color);
  margin: 20px 0 12px;
}

/* ── Grid ── */
.ws-grid { display: grid; gap: 10px; }
.ws-grid-2col { grid-template-columns: 1fr 1fr; }

/* ── Card ── */
.ws-card {
  background: rgba(128,128,128,0.04);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
}
.ws-card-full { grid-column: 1 / -1; }
.ws-card-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}
.ws-card-title { font-size: 13px; font-weight: 600; }
.ws-card-subtitle { font-size: 11px; opacity: 0.5; }
.ws-ai-btn {
  background: #2ea86a; border: none; border-radius: 4px;
  padding: 2px 8px; font-size: 11px; cursor: pointer; font-family: inherit; color: #fff;
  transition: background 0.15s;
}
.ws-ai-btn:hover { background: #258d58; }
.ws-link-btn {
  background: transparent; border: none; font-size: 11px; cursor: pointer;
  font-family: inherit; color: #52c8a0; opacity: 0.6;
}
.ws-link-btn:hover { opacity: 1; }
.ws-card-body { }

/* ── Inputs ── */
.ws-input {
  width: 100%; padding: 6px 10px; font-size: 13px; font-family: inherit;
  background: rgba(128,128,128,0.08); border: 1px solid transparent;
  border-radius: 4px; color: inherit; outline: none;
  transition: border-color 0.15s;
}
.ws-input:focus { border-color: rgba(82,200,160,0.4); }
.ws-input.sm { width: auto; min-width: 120px; }
.ws-input::placeholder { opacity: 0.3; }

.ws-textarea {
  width: 100%; padding: 6px 10px; font-size: 13px; font-family: inherit;
  background: rgba(128,128,128,0.08); border: 1px solid transparent;
  border-radius: 4px; color: inherit; outline: none; resize: vertical;
  transition: border-color 0.15s;
}
.ws-textarea:focus { border-color: rgba(82,200,160,0.4); }
.ws-textarea::placeholder { opacity: 0.3; }

.ws-char-count { text-align: right; font-size: 10px; opacity: 0.3; margin-top: 2px; }

.ws-field-row {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
}
.ws-field-label { font-size: 11px; opacity: 0.5; white-space: nowrap; }
.ws-field-hint { font-size: 10px; opacity: 0.3; }

/* ── Tags ── */
.ws-tags-row {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.ws-tag-input {
  width: 80px; padding: 2px 6px; font-size: 11px; font-family: inherit;
  background: transparent; border: 1px dashed rgba(128,128,128,0.3);
  border-radius: 3px; color: inherit; outline: none;
}
.ws-tag-input:focus { border-color: rgba(82,200,160,0.4); }

/* ── Bottom bar ── */
.ws-bottom-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-top: 1px solid var(--border-color); flex-shrink: 0;
  background: rgba(128,128,128,0.03);
}
.ws-bottom-left { display: flex; gap: 8px; }
.ws-bottom-right { }
.ws-ai-float {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #2ea86a; color: #fff; font-size: 16px; cursor: pointer;
  box-shadow: 0 2px 12px rgba(46,168,106,0.4);
  transition: transform 0.15s;
}
.ws-ai-float:hover { transform: scale(1.1); }

:global(html .theme-light .ws-input),
:global(html .theme-light .ws-textarea),
:global(html .theme-light .ws-tag-input) {
  background: white;
  border-color: white;
}

/* 平台画像弹窗 */
.ws-profile-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.ws-profile-modal { width: 660px; max-height: 85vh; border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border: 1px solid rgba(128,128,128,0.15); }
.ws-profile-dark { background: #1c1c22; color: #d4d4d4; }
.ws-profile-light { background: #fff; color: #1a1a1a; }
.ws-profile-light .ws-profile-textarea { background: #f5f5f5; border-color: #e5e5e5; }
.ws-profile-light .ws-profile-header, .ws-profile-light .ws-profile-footer { border-color: #eee; }
.ws-profile-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(128,128,128,0.1); }
.ws-profile-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
.ws-profile-header button { width: 26px; height: 26px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 14px; opacity: 0.4; }
.ws-profile-header button:hover { opacity: 1; }
.ws-profile-body { flex: 1; overflow-y: auto; padding: 14px 18px; }
.ws-profile-textarea { width: 100%; min-height: 400px; padding: 10px; font-size: 12px; font-family: "SF Mono", "Cascadia Code", monospace; background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; color: inherit; outline: none; resize: vertical; line-height: 1.7; }
.ws-profile-textarea:focus { border-color: rgba(46,168,106,0.3); }
.ws-profile-footer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid rgba(128,128,128,0.1); justify-content: flex-end; }
</style>
