<template>
  <Teleport to="body">
    <div class="am-overlay" @click.self="$emit('close')">
      <div class="am-root" :class="isDark === false ? 'am-theme-light' : 'am-theme-dark'">
        <!-- 头部 -->
        <div class="am-header">
          <span class="am-title">{{ title || 'AI 助手' }}</span>
          <span v-if="description" class="am-desc">{{ description }}</span>
          <div class="am-header-right">
            <button class="am-icon-btn" title="选择模型" @click="showModelMenu = !showModelMenu">
              <NIcon><HardwareChipOutline /></NIcon>
              <span class="am-model-name">{{ currentModelLabel }}</span>
            </button>
            <div v-if="showModelMenu" class="am-model-popup">
              <div v-for="provider in enabledProviders" :key="provider.id" class="am-model-group">
                <div class="am-model-provider">{{ provider.name }}</div>
                <div
                  v-for="model in ('models' in provider ? (provider as any).models : [{ id: (provider as any).modelId, name: provider.name }])"
                  :key="model.id"
                  class="am-model-item"
                  :class="{ selected: selectedModelId === model.id && selectedProviderId === provider.id }"
                  @click="selectModel(provider.id, model.id)"
                >{{ model.name }}</div>
              </div>
            </div>
            <button class="am-icon-btn" title="系统提示词" @click="openPromptEditor">
              <NIcon><CodeSlashOutline /></NIcon>
            </button>
            <button class="am-icon-btn" title="关闭" @click="$emit('close')">
              <NIcon><CloseOutline /></NIcon>
            </button>
          </div>
        </div>

        <!-- 提示词编辑弹窗 -->
        <Teleport to="body">
          <div v-if="showPromptEditor" class="am-overlay am-prompt-overlay" @click.self="resetEditedPrompt">
            <div class="am-prompt-panel" :class="isDark === false ? 'am-theme-light' : 'am-theme-dark'">
              <div class="am-prompt-header">
                <span>编辑系统提示词</span>
                <button class="am-icon-btn" @click="resetEditedPrompt">✕</button>
              </div>
              <textarea
                v-model="editedPrompt"
                class="am-prompt-textarea"
                :class="{ 'am-font-sm': editorFontSize === 'sm', 'am-font-md': editorFontSize === 'md', 'am-font-lg': editorFontSize === 'lg' }"
                spellcheck="false"
              ></textarea>
              <div class="am-prompt-footer">
                <div class="am-prompt-font-btns">
                  <button :class="{ active: editorFontSize === 'sm' }" @click="editorFontSize = 'sm'">小</button>
                  <button :class="{ active: editorFontSize === 'md' }" @click="editorFontSize = 'md'">中</button>
                  <button :class="{ active: editorFontSize === 'lg' }" @click="editorFontSize = 'lg'">大</button>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="am-btn am-btn-default" @click="resetEditedPrompt">取消</button>
                  <button class="am-btn am-btn-primary" @click="saveEditedPrompt">保存</button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 内容区 -->
        <div class="am-body">
          <!-- 配置区（非生成中可见） -->
          <div class="am-config" v-if="!llmGen">
            <!-- 动作类型切换 -->
            <div class="am-config-row" v-if="field && promptTypes.length >= 2">
              <span class="am-label">类型</span>
              <div class="am-prompt-type-switch">
                <button
                  v-for="pt in promptTypes"
                  :key="pt.key"
                  class="am-pt-btn"
                  :class="{ active: promptType === pt.key }"
                  @click="switchPromptType(pt.key)"
                >{{ pt.label }}</button>
              </div>
            </div>

            <!-- 模板选择 -->
            <div class="am-config-row" v-if="savedTemplates.length > 0 || (field && Object.keys(actionPrompts).length > 0)">
              <span class="am-label">模板</span>
              <NSelect
                v-model:value="selectedTemplateId"
                :options="templateOptions"
                placeholder="选择模板..."
                size="small"
                style="flex:1; max-width: 260px"
              />
              <button class="am-icon-btn" title="保存当前为模板" @click="saveCustomTemplate">
                <NIcon><SaveOutline /></NIcon>
              </button>
              <button
                v-if="selectedTemplateId && !isBuiltinTemplate"
                class="am-icon-btn"
                title="删除模板"
                @click="deleteCustomTemplate"
              >
                <NIcon><TrashOutline /></NIcon>
              </button>
            </div>

            <!-- 额外提示 -->
            <div class="am-config-row">
              <span class="am-label">{{ extraLabel }}</span>
              <textarea
                v-model="extra"
                class="am-extra-input"
                rows="3"
                :placeholder="extraPlaceholder"
              ></textarea>
            </div>

            <!-- 章节范围 -->
            <div class="am-config-row" v-if="!hideChapter && mode === 'chapterRange'">
              <span class="am-label">范围</span>
              <input v-model="rangeStart" class="am-input am-input-sm" placeholder="第1章" />
              <span class="am-range-sep">-</span>
              <input v-model="rangeEnd" class="am-input am-input-sm" placeholder="第3章" />
            </div>

            <!-- 上下文开关 -->
            <div class="am-config-row" v-if="contextSwitches && contextSwitches.length > 0">
              <span class="am-label">上下文</span>
              <div class="am-switch-list">
                <label
                  v-for="cs in contextSwitches"
                  :key="cs.key"
                  class="am-switch-item"
                  :title="cs.desc"
                >
                  <input type="checkbox" v-model="cs.enabled" />
                  <span>{{ cs.label }}</span>
                  <input
                    v-if="cs.hasCount && cs.enabled"
                    type="number"
                    v-model.number="cs.count"
                    class="am-count-input"
                    :min="cs.countMin || 1"
                    :max="cs.countMax || 20"
                  />
                </label>
              </div>
            </div>

            <!-- 特殊开关 -->
            <div class="am-config-row" v-if="specialSwitches && specialSwitches.length > 0">
              <span class="am-label">参数</span>
              <div class="am-switch-list">
                <label
                  v-for="ss in specialSwitches"
                  :key="ss.key"
                  class="am-switch-item"
                  :title="ss.desc"
                >
                  <input type="checkbox" v-model="ss.enabled" />
                  <span>{{ ss.label }}</span>
                </label>
              </div>
            </div>

            <!-- 深度思考 -->
            <div class="am-config-row" v-if="currentModelSupportsThink">
              <span class="am-label">深度思考</span>
              <label class="am-switch-item">
                <input type="checkbox" v-model="thinkOn" />
                <span>{{ thinkOn ? '已启用' : '关闭' }}</span>
              </label>
            </div>

            <!-- 最大输出 token -->
            <div class="am-config-row">
              <span class="am-label">最大Token</span>
              <input v-model.number="maxTokenOverride" type="number" class="am-input am-input-sm" placeholder="自动" />
              <span class="am-hint">留空=自动</span>
            </div>

            <!-- 预设管理 -->
            <div class="am-config-row">
              <button class="am-btn am-btn-default" @click="showPresets = !showPresets">
                <NIcon><BookmarkOutline /></NIcon> 预设 {{ presets.length ? '(' + presets.length + ')' : '' }}
              </button>
              <button class="am-btn am-btn-default" @click="savePreset()">
                <NIcon><SaveOutline /></NIcon> 保存配置
              </button>
            </div>

            <!-- 预设面板 -->
            <div v-if="showPresets" class="am-presets-panel">
              <div v-if="presets.length === 0" class="am-empty">暂无预设配置</div>
              <div v-for="(preset, i) in presets" :key="i" class="am-preset-item">
                <span class="am-preset-name" @click="applyPreset(i)">{{ preset.name }}</span>
                <button class="am-icon-btn sm" title="删除" @click="deletePreset(i)">
                  <NIcon><TrashOutline /></NIcon>
                </button>
              </div>
            </div>

            <!-- 笔记引用 -->
            <div class="am-config-row" v-if="showNoteCount">
              <button class="am-btn am-btn-default" @click="refreshNotes">
                <NIcon><DocumentTextOutline /></NIcon> 笔记 ({{ noteCount }})
              </button>
              <button class="am-btn am-btn-default" @click="createAndSelectNote">
                + 新建
              </button>
              <NSelect
                v-if="notes.length > 0"
                v-model:value="selectedNoteId"
                :options="noteOptions"
                placeholder="选择笔记..."
                size="small"
                style="flex:1; max-width: 200px"
              />
              <button
                v-if="selectedNoteId"
                class="am-btn am-btn-default"
                @click="insertNoteRefs"
              >引用</button>
            </div>
          </div>

          <!-- 输出区 -->
          <div class="am-output-area" ref="outputRef">
            <div v-if="llmErr" class="am-error">{{ llmErr }}</div>
            <div
              v-if="output"
              class="am-output-text"
              :class="{ 'am-font-sm': fontSize === 'sm', 'am-font-md': fontSize === 'md', 'am-font-lg': fontSize === 'lg' }"
            >{{ output }}</div>
            <div v-if="llmGen && !output" class="am-loading">
              <div class="am-spinner"></div>
              <span>AI 正在生成中...</span>
            </div>
            <div v-if="!llmGen && !output && !llmErr" class="am-placeholder">
              <p>配置生成参数后点击下方按钮开始</p>
            </div>
          </div>

          <!-- 字体大小 -->
          <div class="am-font-controls" v-if="output">
            <button :class="{ active: fontSize === 'sm' }" @click="fontSize = 'sm'">A-</button>
            <button :class="{ active: fontSize === 'md' }" @click="fontSize = 'md'">A</button>
            <button :class="{ active: fontSize === 'lg' }" @click="fontSize = 'lg'">A+</button>
          </div>

          <!-- 追问区 -->
          <div class="am-follow-up" v-if="output && !llmGen">
            <textarea
              v-model="followUp"
              class="am-follow-input"
              rows="2"
              placeholder="输入追问或修改要求..."
            ></textarea>
            <button
              class="am-btn am-btn-primary"
              :disabled="!followUp.trim()"
              @click="doFollowUp"
            >追问</button>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="am-footer">
          <div class="am-footer-left">
            <span v-if="output" class="am-word-count">{{ wordCount }} 字</span>
            <span v-if="genCount > 0" class="am-gen-count">已生成 {{ genCount }} 次</span>
          </div>
          <div class="am-footer-right">
            <button
              v-if="!llmGen"
              class="am-btn am-btn-primary am-btn-gen"
              @click="onGenerate"
            >{{ genButtonLabel }}</button>
            <button
              v-else
              class="am-btn am-btn-danger"
              @click="abortGeneration"
            >停止生成</button>
            <button
              v-if="output && writeLabel"
              class="am-btn am-btn-success"
              @click="doWrite"
            >{{ writeLabel }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {
  ref, computed, watch, onMounted, onUnmounted, nextTick,
} from 'vue'
import {
  NSelect, NButton, NIcon, NTag, useMessage,
} from 'naive-ui'
import {
  CloseOutline, CodeSlashOutline, HardwareChipOutline,
  SaveOutline, TrashOutline, BookmarkOutline, DocumentTextOutline,
} from '@vicons/ionicons5'
import { useWorkStore } from '../stores/workStore'
import { useModelStore } from '../stores/modelStore'
import { useWorkRepo } from '../composables/useWorkRepo'
import { SettingsManager } from '../composables/useSettings'
import { COMPACT_CONSTITUTION } from '../agents/shared/compactConstitution'
import { getDefaultTags, buildGenerationPrompt } from '../composables/usePlatformTags'
import { mergeParagraphs } from '../agents/steps/paragraphFix'
import { showConfirm } from '../composables/useConfirm'
import { scanStyleViolations } from '../agents/filters/styleFilter'
import {
  getOutline, formatChapterOutlineForPrompt,
  type ChapterOutlineStructured, type Outline,
} from '../composables/useOutlines'
import {
  resolveVariable, expandPrompt, UnknownVariable,
  type ResolverCtx,
} from '../composables/useContextResolver'
import { compileChapterContext, extractNovelState } from '../composables/useContextCompiler'
import { isTauri, localCurrentChapterId, localCurrentWorkId } from '../composables/useLocalWorkTree'
import { type Note, NotesManager } from '../composables/useNotes'
import { getPlatformProfile } from '../composables/usePlatformData'
import { parseCreativeOutput } from '../composables/parseCreativeOutput'
import { useLLM, type LLMGenerateParams } from '../composables/useLLM'

// ── 类型 ──
export interface ContextSwitch {
  key: string
  label: string
  desc?: string
  enabled: boolean
  hasCount?: boolean
  count?: number
  countMin?: number
  countMax?: number
}

// ── Props & Emits ──
const props = defineProps<{
  field?: string
  title?: string
  description?: string
  targetLabel?: string
  writeLabel?: string
  chapterLabel?: string
  defaultExtraPrompt?: string
  defaultRangeStart?: string
  defaultRangeEnd?: string
  skipStrip?: boolean
  contextSwitches?: ContextSwitch[]
  specialSwitches?: ContextSwitch[]
  mode?: string
  showGenCount?: boolean
  showNoteCount?: boolean
  templateName?: string
  templateDesc?: string
  platformId?: string | null
  specialFields?: any[]
  hideChapter?: boolean
  isDark?: boolean
  useWorkflow?: boolean
  chapterCount?: number
  maxChapters?: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'write', value: string): void
  (e: 'start', field: string): void
}>()

const message = useMessage()
const tauri = isTauri()
const store = tauri ? useWorkStore() : null
const modelStore = useModelStore()
const repo = useWorkRepo()
const notesMgr = new NotesManager()

// ── LLM ──
const { generating: llmGen, output, error: llmErr, generate: llmGenerate, abort: llmAbort } = useLLM()

// ── 核心响应式状态 ──
const selectedModelId = ref('')
const selectedProviderId = ref('')
const promptType = ref('custom')
const extra = ref(props.defaultExtraPrompt || '')
const followUp = ref('')
const systemPrompt = ref('')
const fontSize = ref<'sm' | 'md' | 'lg'>('md')
const editorFontSize = ref<'sm' | 'md' | 'lg'>('md')
const genCount = ref(0)
const thinkOn = ref(false)
const maxTokenOverride = ref<number | null>(null)
const rangeStart = ref(props.defaultRangeStart || '第1章')
const rangeEnd = ref(props.defaultRangeEnd || '第1章')
const noteCount = ref(0)
const showPresets = ref(false)
const showModelMenu = ref(false)
const showPromptEditor = ref(false)
const editedPrompt = ref('')
const outputRef = ref<HTMLElement | null>(null)

// 模板
const selectedTemplateId = ref<string | null>(null)
const savedTemplates = ref<Array<{ id: string; name: string; prompt: string }>>([])
const actionPrompts = ref<Record<string, string>>({})

// 笔记
const notes = ref<Note[]>([])
const selectedNoteId = ref<string | null>(null)

// 预设
interface Preset {
  name: string
  promptType: string
  extra: string
  systemPrompt: string
  contextSwitches: ContextSwitch[]
  specialSwitches: ContextSwitch[]
  templateId: string | null
  modelId: string
  providerId: string
  thinkOn: boolean
  maxTokens: number | null
  rangeStart: string
  rangeEnd: string
}
const presets = ref<Preset[]>([])
const PRESETS_KEY = 'ns:ai_presets'

// ── 计算属性 ──
const field = computed(() => props.field)

const enabledProviders = computed(() => modelStore.getEnabledProviders())

const currentModelLabel = computed(() => {
  const config = modelStore.resolveModelConfig(selectedProviderId.value, selectedModelId.value)
  if (config?.modelInfo) return config.modelInfo.name
  const providers = modelStore.getEnabledProviders()
  if (providers.length > 0) {
    const first = providers[0] as any
    const mid = first.defaultModelId || first.modelId
    const models = first.models || [{ id: first.modelId, name: first.name }]
    const model = models.find((m: any) => m.id === (selectedModelId.value || mid))
    return model?.name || '选择模型'
  }
  return '未配置'
})

const currentModelSupportsThink = computed(() => {
  const config = modelStore.resolveModelConfig(selectedProviderId.value, selectedModelId.value)
  return config?.modelInfo?.supportsThink ?? false
})

const wordCount = computed(() => {
  if (!output.value) return 0
  // 中文按字符数计
  return [...output.value].filter(c => !/\s/.test(c)).length
})

const promptTypes = computed(() => {
  const types: Array<{ key: string; label: string }> = []
  if (field.value && Object.keys(actionPrompts.value).length > 0) {
    types.push({ key: 'template', label: '内置模板' })
  }
  types.push({ key: 'custom', label: '自定义' })
  return types
})

const genButtonLabel = computed(() => {
  if (field.value === 'opening') return '生成开篇'
  if (field.value === 'continue') return '开始续写'
  return '生成'
})

const extraLabel = computed(() => {
  if (field.value === 'review') return '审稿要求'
  if (field.value === 'comment') return '吐槽要求'
  return '额外提示'
})

const extraPlaceholder = computed(() => {
  if (field.value === 'review') return '例如：重点关注对话自然度和节奏把控...'
  if (field.value === 'continue') return '例如：本章需要揭示关键秘密、某个伏笔必须回收...'
  return '附加指令、上下文要求或特殊说明...'
})

const templateOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = []
  // 内置动作模板
  if (field.value && actionPrompts.value[field.value]) {
    opts.push({ label: props.templateName || '内置模板', value: field.value })
  }
  // 自定义模板
  for (const t of savedTemplates.value) {
    opts.push({ label: t.name, value: t.id })
  }
  return opts
})

const noteOptions = computed(() => {
  return notes.value.map(n => ({
    label: n.title + (n.folder ? ` [${n.folder}]` : ''),
    value: n.id,
  }))
})

const isBuiltinTemplate = computed(() => {
  if (!selectedTemplateId.value) return false
  return !!actionPrompts.value[selectedTemplateId.value]
})

// ── 生命周期 ──
onMounted(() => {
  loadSavedTemplates()
  loadPresets()

  // 初始化模型
  const providers = modelStore.getEnabledProviders()
  if (providers.length > 0) {
    const first = providers[0]
    selectedProviderId.value = first.id
    const bp = first as any
    if (bp.models && bp.models.length > 0) {
      selectedModelId.value = bp.defaultModelId || bp.models[0].id
    } else if ((bp as any).modelId) {
      selectedModelId.value = (bp as any).modelId
    }
  }

  // 加载动作提示词
  if (field.value) {
    loadActionPrompt(field.value).catch(() => {})
  }

  // 加载大纲
  if (!props.hideChapter) {
    autoFetchChapterOutline().catch(() => {})
  }

  // 笔记
  if (props.showNoteCount) {
    refreshNotes()
  }
})

// ── 监听 ──
watch(() => props.defaultExtraPrompt, (v) => {
  if (v !== undefined) extra.value = v
})

watch(promptType, (type) => {
  if (type === 'template' && field.value) {
    loadActionPrompt(field.value).catch(() => {})
  }
})

watch(selectedTemplateId, (id) => {
  if (!id) return
  if (isBuiltinTemplate.value && field.value) {
    loadActionPrompt(field.value).catch(() => {})
  } else {
    loadCustomTemplate(id).catch(() => {})
  }
})

onUnmounted(() => {
  try { persistPresets() } catch {}
})

// ═══════════════════════════════════════════════════
// 模型选择
// ═══════════════════════════════════════════════════
function selectModel(providerId: string, modelId: string) {
  selectedProviderId.value = providerId
  selectedModelId.value = modelId
  showModelMenu.value = false
}

// ═══════════════════════════════════════════════════
// 章节工具
// ═══════════════════════════════════════════════════
function getAllOrderedChapters(): any[] {
  const allChs: any[] = []
  const chMap = store?.chapterMap ?? repo.chapterMap.value
  if (!chMap) return allChs
  for (const chs of Object.values(chMap)) {
    allChs.push(...(chs as any[]))
  }
  allChs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  return allChs
}

function resolveAutoChapterNo(): number {
  const allChs = getAllOrderedChapters()
  if (allChs.length === 0) return 1
  const chId = store?.currentChapterId ?? repo.currentChapterId.value
  if (chId) {
    const idx = allChs.findIndex((c) => c.id === chId)
    if (idx >= 0) return idx + 1
  }
  return allChs.length + 1
}

function currentChapterTitle(): string {
  const chId = store?.currentChapterId ?? repo.currentChapterId.value
  if (!chId) return '第1章'
  const allChs = getAllOrderedChapters()
  const ch = allChs.find((c) => c.id === chId)
  if (ch) return ch.title || `第${(ch.sort_order ?? 0) + 1}章`
  return '第1章'
}

// ═══════════════════════════════════════════════════
// 预设管理
// ═══════════════════════════════════════════════════
function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (raw) presets.value = JSON.parse(raw)
  } catch {}
}

function persistPresets() {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.value))
  } catch {}
}

function applyPreset(index: number) {
  const p = presets.value[index]
  if (!p) return
  promptType.value = p.promptType
  extra.value = p.extra
  systemPrompt.value = p.systemPrompt
  selectedTemplateId.value = p.templateId
  selectedModelId.value = p.modelId
  selectedProviderId.value = p.providerId
  thinkOn.value = p.thinkOn
  maxTokenOverride.value = p.maxTokens
  rangeStart.value = p.rangeStart
  rangeEnd.value = p.rangeEnd
  if (props.contextSwitches && p.contextSwitches) {
    for (const saved of p.contextSwitches) {
      const current = props.contextSwitches.find(c => c.key === saved.key)
      if (current) {
        current.enabled = saved.enabled
        if (current.hasCount && saved.count != null) current.count = saved.count
      }
    }
  }
  if (props.specialSwitches && p.specialSwitches) {
    for (const saved of p.specialSwitches) {
      const current = props.specialSwitches.find(s => s.key === saved.key)
      if (current) current.enabled = saved.enabled
    }
  }
  showPresets.value = false
  message.success('已加载预设: ' + p.name)
}

function savePreset(name?: string) {
  const presetName = name || window.prompt('预设名称:', '预设 ' + (presets.value.length + 1))
  if (!presetName) return
  presets.value.push({
    name: presetName,
    promptType: promptType.value,
    extra: extra.value,
    systemPrompt: systemPrompt.value,
    contextSwitches: props.contextSwitches ? JSON.parse(JSON.stringify(props.contextSwitches)) : [],
    specialSwitches: props.specialSwitches ? JSON.parse(JSON.stringify(props.specialSwitches)) : [],
    templateId: selectedTemplateId.value,
    modelId: selectedModelId.value,
    providerId: selectedProviderId.value,
    thinkOn: thinkOn.value,
    maxTokens: maxTokenOverride.value,
    rangeStart: rangeStart.value,
    rangeEnd: rangeEnd.value,
  })
  persistPresets()
  message.success('配置已保存为预设')
  showPresets.value = true
}

function deletePreset(index: number) {
  const name = presets.value[index]?.name || '此项'
  showConfirm('确认删除预设 "' + name + '"？', () => {
    presets.value.splice(index, 1)
    persistPresets()
  }, '删除')
}

// ═══════════════════════════════════════════════════
// 笔记管理
// ═══════════════════════════════════════════════════
function refreshNotes() {
  notes.value = notesMgr.list()
  noteCount.value = notes.value.length
}

function createAndSelectNote() {
  const title = window.prompt('笔记标题:')
  if (!title) return
  const note = notesMgr.create(title)
  refreshNotes()
  selectedNoteId.value = note.id
  message.success('笔记已创建')
}

function insertNoteRefs() {
  if (!selectedNoteId.value) return
  const note = notesMgr.get(selectedNoteId.value)
  if (!note) return
  extra.value = extra.value + (extra.value ? '\n\n' : '') + '【引用笔记: ' + note.title + '】\n' + note.content
  message.success('笔记已引用')
}

function insertVariable(varName: string) {
  extra.value = extra.value + (extra.value ? ' ' : '') + varName
}

function onNewNoteFolder() {
  const folderName = window.prompt('文件夹名:')
  if (!folderName) return
  const title = window.prompt('笔记标题:')
  if (!title) return
  const note = notesMgr.create(title, folderName)
  refreshNotes()
  selectedNoteId.value = note.id
}

// ═══════════════════════════════════════════════════
// 提示词编辑器
// ═══════════════════════════════════════════════════
function openPromptEditor() {
  editedPrompt.value = systemPrompt.value
  showPromptEditor.value = true
}

function saveEditedPrompt() {
  systemPrompt.value = editedPrompt.value
  showPromptEditor.value = false
  message.success('系统提示词已更新')
}

function resetEditedPrompt() {
  editedPrompt.value = systemPrompt.value
  showPromptEditor.value = false
}

function _onPromptOk() { saveEditedPrompt() }
function _onPromptCancel() { resetEditedPrompt() }

// ═══════════════════════════════════════════════════
// 模板管理
// ═══════════════════════════════════════════════════
async function loadActionPrompt(actionKey: string) {
  try {
    const module = await import('../composables/useTemplates')
    const tpl = module.getTemplate(('ed_' + actionKey) as any, props.platformId || null)
    if (tpl?.desc) {
      actionPrompts.value[actionKey] = tpl.desc
      if (promptType.value === 'template' || !systemPrompt.value) {
        systemPrompt.value = tpl.desc
      }
    }
  } catch {
    // 加载失败不阻塞
  }
}

function saveActionPrompt() {
  if (!field.value) return
  actionPrompts.value[field.value] = systemPrompt.value
  message.success('动作提示词已更新')
}

function switchToCustom() {
  promptType.value = 'custom'
}

function switchPromptType(type: string) {
  promptType.value = type
  if (type === 'template' && field.value) {
    loadActionPrompt(field.value).catch(() => {})
  }
}

function selectSavedTemplate() {
  // 由 v-model 绑定 selectedTemplateId + watch 处理
}

// 自定义模板持久化
const TEMPLATES_KEY = 'ns:custom_ai_templates'

function loadSavedTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    if (raw) savedTemplates.value = JSON.parse(raw)
  } catch {}
}

function saveTemplatesToStorage() {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(savedTemplates.value))
  } catch {}
}

function saveCustomTemplate() {
  const name = window.prompt('模板名称:', '我的模板')
  if (!name) return
  savedTemplates.value.push({
    id: 'tpl_' + Date.now(),
    name,
    prompt: systemPrompt.value,
  })
  saveTemplatesToStorage()
  selectedTemplateId.value = savedTemplates.value[savedTemplates.value.length - 1].id
  message.success('模板已保存')
}

async function loadCustomTemplate(id: string) {
  const tpl = savedTemplates.value.find(t => t.id === id)
  if (tpl) {
    systemPrompt.value = tpl.prompt
  }
}

function deleteTemplate(id: string) {
  savedTemplates.value = savedTemplates.value.filter(t => t.id !== id)
  saveTemplatesToStorage()
  if (selectedTemplateId.value === id) selectedTemplateId.value = null
}

function deleteSelectedTemplate() {
  if (selectedTemplateId.value && !isBuiltinTemplate.value) {
    deleteTemplate(selectedTemplateId.value)
    message.success('模板已删除')
  }
}

function deleteCustomTemplate() {
  if (!selectedTemplateId.value) return
  showConfirm('确认删除此自定义模板？', () => {
    deleteSelectedTemplate()
  }, '删除')
}

// ═══════════════════════════════════════════════════
// 大纲
// ═══════════════════════════════════════════════════
async function autoFetchChapterOutline() {
  try {
    const chId = store?.currentChapterId ?? repo.currentChapterId.value
    if (chId) {
      await getOutline('chapter', chId)
    }
  } catch {
    // 静默
  }
}

async function findCurrentChapterOutline(): Promise<Outline | null> {
  const chId = store?.currentChapterId ?? repo.currentChapterId.value
  if (!chId) return null
  try {
    return await getOutline('chapter', chId)
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════
// 上下文编译 & 注入
// ═══════════════════════════════════════════════════
function buildResolverCtx(): ResolverCtx {
  const outlinesMap = new Map<string, string>()

  // 异步加载大纲到 map（同步返回 ctx，异步补数据）
  const loadAllOutlines = async () => {
    try {
      const wid = store?.currentWorkId ?? repo.currentWorkId.value
      if (wid) {
        const mainOutline = await getOutline('main', wid)
        if (mainOutline?.content) outlinesMap.set('main', mainOutline.content)
      }
      const volumes = store?.volumes ?? repo.volumes.value
      for (const vol of volumes) {
        const vo = await getOutline('volume', vol.id)
        if (vo?.content) outlinesMap.set('volume_' + vol.id, vo.content)
      }
      const chMap = store?.chapterMap ?? repo.chapterMap.value
      for (const chs of Object.values(chMap)) {
        for (const ch of chs) {
          const co = await getOutline('chapter', ch.id)
          if (co?.content) outlinesMap.set('chapter_' + ch.id, co.content)
        }
      }
    } catch {}
  }
  loadAllOutlines().catch(() => {})

  return {
    workStore: () => store,
    settingsManager: () => {
      // 返回全局 SettingsManager 实例（由外部注入的引用）
      return null
    },
    workspaceSettings: () => {
      try {
        const raw = localStorage.getItem('ns:ws:' + (store?.currentWorkId ?? repo.currentWorkId.value ?? 0))
        if (raw) return JSON.parse(raw)
      } catch {}
      return {}
    },
    outlines: outlinesMap,
  }
}

function resolveContextInjection(): string {
  const ctx = buildResolverCtx()
  const parts: string[] = []

  // 无 contextSwitches 时注入基础信息
  if (!props.contextSwitches || props.contextSwitches.length === 0) {
    try { parts.push(resolveVariable('@基础信息', ctx)) } catch {}
    try { parts.push(resolveVariable('@当前章纲', ctx)) } catch {}
    return parts.filter(Boolean).join('\n\n')
  }

  for (const cs of props.contextSwitches) {
    if (!cs.enabled) continue
    try {
      switch (cs.key) {
        case 'platform':
          if (props.platformId) {
            const profile = getPlatformProfile(props.platformId)
            if (profile) parts.push('【发布平台】\n' + profile)
          }
          break
        case 'outline':
          parts.push('【全书总纲】\n' + resolveVariable('@总纲', ctx))
          break
        case 'base':
          parts.push('【基础信息】\n' + resolveVariable('@基础信息', ctx))
          break
        case 'core':
          parts.push('【核心构架】\n' + resolveVariable('@核心构架', ctx))
          break
        case 'worldview':
          parts.push('【世界观设定】\n' + resolveVariable('@世界观', ctx))
          break
        case 'cheat':
          parts.push('【金手指】\n' + resolveVariable('@金手指', ctx))
          break
        case 'powerSystem':
          parts.push('【力量体系】\n' + resolveVariable('@力量体系', ctx))
          break
        case 'protagonist':
          parts.push('【主角设定】\n' + resolveVariable('@主角', ctx))
          break
        case 'settings':
          parts.push('【全部设定数据】\n' + resolveVariable('@设定数据', ctx))
          break
        case 'currentSettings':
          parts.push('【当前设定数据】\n' + resolveVariable('@当前设定数据', ctx))
          break
        case 'targetWordCount':
          parts.push('【目标字数】' + resolveVariable('@目标字数', ctx))
          break
        case 'body':
          parts.push('【本章正文】\n' + resolveVariable('@本章正文', ctx))
          break
        case 'recentChapters': {
          const n = cs.count ?? 3
          parts.push('【前' + n + '章正文】\n' + resolveVariable('@前N章正文(' + n + ')', ctx))
          break
        }
        case 'chapterOutline':
          parts.push('【当前章纲】\n' + resolveVariable('@当前章纲', ctx))
          break
        case 'prevChapterOutline':
          parts.push('【前文章纲】\n' + resolveVariable('@前文章纲', ctx))
          break
        case 'charStateSnapshot':
          parts.push('【角色状态快照】\n' + resolveVariable('@角色状态快照', ctx))
          break
        case 'foreshadowStatus':
          parts.push('【伏笔状态】\n' + resolveVariable('@伏笔状态', ctx))
          break
        case 'supplement':
          if (extra.value.trim()) {
            parts.push('【补充信息/额外要求】\n' + extra.value)
          }
          break
        default:
          // 尝试通用变量解析
          try {
            const resolved = resolveVariable('@' + cs.key, ctx)
            if (resolved && !resolved.startsWith('[')) {
              parts.push('【' + cs.label + '】\n' + resolved)
            }
          } catch {}
      }
    } catch (e) {
      if (!(e instanceof UnknownVariable)) {
        console.warn('[AiModal] 上下文变量 ' + cs.key + ' 解析失败:', e)
      }
    }
  }

  return parts.filter(Boolean).join('\n\n')
}

// ═══════════════════════════════════════════════════
// Token & 截断
// ═══════════════════════════════════════════════════
function computeMaxTokens(): number {
  if (maxTokenOverride.value && maxTokenOverride.value > 0) {
    return maxTokenOverride.value
  }
  const config = modelStore.resolveModelConfig(selectedProviderId.value, selectedModelId.value)
  if (config?.modelInfo?.maxOutputTokens) {
    const base = config.modelInfo.maxOutputTokens
    if (field.value === 'opening') return Math.min(base, 8192)
    return Math.min(base, 4096)
  }
  return field.value === 'opening' ? 8192 : 4096
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const truncated = text.slice(0, maxChars)
  const lastDoubleNewline = truncated.lastIndexOf('\n\n')
  if (lastDoubleNewline > maxChars * 0.6) {
    return truncated.slice(0, lastDoubleNewline) + '\n\n[输出超出长度限制，已截断]'
  }
  return truncated + '\n\n[输出超出长度限制，已截断]'
}

// ═══════════════════════════════════════════════════
// 自检剥离
// ═══════════════════════════════════════════════════
function stripSelfCheck(text: string): string {
  // 先用 parseCreativeOutput 提取正文
  const parsed = parseCreativeOutput(text)
  if (parsed.content && parsed.content.trim().length > 50) {
    return parsed.content
  }
  // 兜底：按 --- 切分并过滤自检段落
  const parts = text.split(/\n+---\n+/)
  const contentParts = parts.filter(p => {
    const isChecklist = /\[[ x✓✔✗]\s*\]/.test(p)
      || /^[\s　]*(自查|自检|检查清单|输出前|本章.?自)/.test(p)
    return !isChecklist
  })
  if (contentParts.length > 0) {
    return contentParts.join('\n\n')
  }
  return text
}

// ═══════════════════════════════════════════════════
// 验证摘要
// ═══════════════════════════════════════════════════
function formatValidationSummary(issues: any[]): string {
  if (!issues || issues.length === 0) return ''
  const parts = issues.map((i: any) => '- [' + (i.level || 'WARNING') + '] ' + (i.message || ''))
  return '\n\n---\n【风格检测发现以下问题】\n' + parts.join('\n')
}

// ═══════════════════════════════════════════════════
// 前置检查
// ═══════════════════════════════════════════════════
function checkPreflight(): { ok: boolean; message: string } {
  const providers = modelStore.getEnabledProviders()
  if (providers.length === 0) {
    return { ok: false, message: '请先在设置中配置并启用至少一个模型' }
  }
  const config = modelStore.resolveModelConfig(selectedProviderId.value, selectedModelId.value)
  if (!config) {
    return { ok: false, message: '请选择有效的模型' }
  }
  return { ok: true, message: '' }
}

// ═══════════════════════════════════════════════════
// 系统提示词构建
// ═══════════════════════════════════════════════════
function buildSystemPrompt(context: string): string {
  const parts: string[] = []

  // Layer 0: 创作宪法
  if (field.value === 'opening' || field.value === 'continue') {
    parts.push(COMPACT_CONSTITUTION)
  }

  // Layer 1: 用户/模板提示词
  if (systemPrompt.value) {
    parts.push(systemPrompt.value)
  }

  // Layer 2: 上下文
  if (context) {
    parts.push(context)
  }

  // Layer 3: 输出格式指令
  if (field.value === 'opening' || field.value === 'continue') {
    parts.push(`【输出格式要求】
请使用以下标记组织输出（不要用 markdown 代码块包裹）：
=== CHAPTER_TITLE ===
章节标题
=== CHAPTER_CONTENT ===
章节正文内容
=== SELF_CHECK ===
写作质量自查清单（不包含在正文中）`)
  }

  if (field.value === 'review') {
    parts.push(`【输出格式】
以编辑审稿报告形式输出：
1. 整体评价（2-3句）
2. 逐条问题与修改建议
3. 优先级排序
4. 综合评分（1-10分）
不要使用 markdown 代码块。`)
  }

  return parts.filter(Boolean).join('\n\n---\n\n')
}

// ═══════════════════════════════════════════════════
// 核心生成函数
// ═══════════════════════════════════════════════════

/* 通用生成 */
async function doGenerate() {
  const check = checkPreflight()
  if (!check.ok) {
    message.warning(check.message)
    return
  }

  genCount.value++

  try {
    const context = resolveContextInjection()
    const sysPrompt = buildSystemPrompt(context)
    const maxTokens = computeMaxTokens()

    const userPrompt = field.value === 'review'
      ? '请审阅以下内容并生成编辑审稿报告。'
      : field.value === 'comment'
        ? '请基于以下内容生成段评和整本神评。'
        : extra.value.trim()
          ? extra.value
          : '请开始。'

    await llmGenerate({
      systemPrompt: sysPrompt,
      userPrompt,
      extraContext: undefined,
      modelId: selectedModelId.value,
      providerId: selectedProviderId.value,
      think: thinkOn.value,
      maxTokens,
    })

    if (output.value) {
      const config = modelStore.resolveModelConfig(selectedProviderId.value, selectedModelId.value)
      const maxOut = config?.modelInfo?.maxOutputTokens ?? 4096
      const maxChars = maxOut * 2

      // 截断
      if (output.value.length > maxChars) {
        output.value = truncateOutput(output.value, maxChars)
      }

      // 风格检测
      try {
        const violations = scanStyleViolations(output.value, resolveAutoChapterNo())
        if (violations.length > 0) {
          const summary = formatValidationSummary(violations)
          if (output.value.length + summary.length < maxChars) {
            output.value += summary
          }
        }
      } catch {}
    }
  } catch (e: any) {
    message.error('生成失败: ' + (e.message || String(e)))
  }
}

/* 续写生成 */
async function doGenContinue() {
  promptType.value = 'custom'
  await doGenerate()
}

/* 开篇生成 */
async function doGenerateOpening() {
  const check = checkPreflight()
  if (!check.ok) {
    message.warning(check.message)
    return
  }

  genCount.value++

  try {
    const ctx = buildResolverCtx()
    const maxTokens = computeMaxTokens()
    const chaptersToGen = props.maxChapters || props.chapterCount || 3

    // 构建上下文
    const ctxParts: string[] = []
    ctxParts.push('【开篇生成任务】\n请为以下作品撰写黄金开篇正文，共 ' + chaptersToGen + ' 章。')

    try { ctxParts.push('\n【作品基础信息】\n' + resolveVariable('@基础信息', ctx)) } catch {}
    try { ctxParts.push('\n【核心构架】\n' + resolveVariable('@核心构架', ctx)) } catch {}

    if (props.platformId) {
      try {
        const profile = getPlatformProfile(props.platformId)
        if (profile) ctxParts.push('\n【目标平台信息】\n' + profile)
      } catch {}
    }

    if (extra.value.trim()) {
      ctxParts.push('\n【补充要求】\n' + extra.value)
    }

    const chapterContext = ctxParts.join('\n')

    // 构建系统提示词
    let fullPrompt = COMPACT_CONSTITUTION

    if (systemPrompt.value) {
      fullPrompt += '\n\n---\n\n' + systemPrompt.value
    }

    fullPrompt += '\n\n---\n\n【开篇任务详细要求】\n\n'
    fullPrompt += '你需要为一部新作品撰写' + chaptersToGen + '章开篇正文。\n\n'

    fullPrompt += `## 黄金三章核心目标
1. 让读者认识主角并产生代入感
2. 抛出核心冲突或悬念让读者产生好奇
3. 展示世界观中最有吸引力的一个切面
4. 在第3章结尾制造足够强的钩子

## 每章任务
### 第1章：钩子 + 代入
- 前300字内出现：主角 + 困境/异常事件，直接场景切入
- 用行动展示主角核心性格，禁止旁白介绍
- 结尾留下悬念
- 字数：1500-2500字

### 第2章：展开 + 动机
- 从第1章悬念出发，逐步展开信息
- 必须出现冲突场景：主角面对阻力 → 做出选择 → 产生后果
- 深化主角动机
- 结尾：冲突升级或新变量
- 字数：1500-2500字

### 第3章：小高潮 + 强钩子
- 必须有一个完整的小高潮（战斗/对决/揭秘/逆转）
- 结果产生新悬念或更深冲突
- 收尾强钩子
- 字数：1500-2500字`

    if (chaptersToGen > 3) {
      for (let i = 4; i <= chaptersToGen; i++) {
        fullPrompt += '\n\n### 第' + i + '章：持续推进\n- 继续推进主线冲突\n- 逐步展开世界和人物\n- 每章结尾留钩子\n- 字数：1500-2500字'
      }
    }

    fullPrompt += `

## 写作质量标准
- **小说化叙事**：写故事不是大纲，每段3-8句
- **禁止AI碎片化**：严禁一句一段
- **镜头感**：远景→中景→近景→特写
- **对话密度**：每章至少2-3组对话
- **去AI味**：禁止AI高频词汇
- **Show Don't Tell**：用行动展示性格

## 严格约束
- 严格基于提供的角色设定和世界观创作
- 主角姓名/性别/身份必须与设定一致
- 世界观规则不矛盾

${chapterContext}

## 输出格式
每章使用以下标记：
=== CHAPTER_TITLE ===
章节标题（如：第1章：觉醒之日）
=== CHAPTER_CONTENT ===
章节正文
=== SELF_CHECK ===
本章自查（不出现在正文中）

共需输出${chaptersToGen}章，章之间用 --- 分隔。禁止使用 markdown 代码块。`

    await llmGenerate({
      systemPrompt: fullPrompt,
      userPrompt: '请开始生成第1章的正文内容。',
      extraContext: extra.value || undefined,
      modelId: selectedModelId.value,
      providerId: selectedProviderId.value,
      think: thinkOn.value,
      maxTokens,
    })

    if (output.value) {
      // 后处理
      let processed = output.value

      // 段落合并
      try {
        const merged = mergeParagraphs(processed)
        processed = merged.result
      } catch {}

      // 风格检测
      try {
        const violations = scanStyleViolations(processed, 1)
        if (violations.length > 0) {
          processed += formatValidationSummary(violations)
        }
      } catch {}

      output.value = processed
    }
  } catch (e: any) {
    message.error('开篇生成失败: ' + (e.message || String(e)))
  }
}

/* 追问 */
async function doFollowUp() {
  if (!followUp.value.trim()) return

  const currentOutput = output.value
  extra.value = '【之前生成的内容】\n' + currentOutput + '\n\n【追问要求】\n' + followUp.value
  followUp.value = ''

  await doGenerate()
}

/* 中止生成 */
function abortGeneration() {
  llmAbort()
}

/* 写入 */
function doWrite() {
  if (!output.value) {
    message.warning('没有可写入的内容')
    return
  }

  let content = output.value

  if (!props.skipStrip) {
    content = stripSelfCheck(content)
  }

  emit('write', content)
}

/* 生成入口 */
function onGenerate() {
  if (field.value === 'opening') {
    doGenerateOpening()
  } else if (field.value === 'continue') {
    doGenContinue()
  } else {
    doGenerate()
  }
}

/* 外部询问输入 */
function askInput(prompt: string): string | null {
  return window.prompt(prompt) || null
}

// 暴露给父组件
defineExpose({
  askInput,
  openPromptEditor,
  selectModel,
  doGenerate,
  doGenerateOpening,
  doGenContinue,
  doFollowUp,
  doWrite,
  abortGeneration,
  resolveContextInjection,
  buildResolverCtx,
  checkPreflight,
})
</script>

<style scoped>
/* ═══════════════════════════════════════════════════
   Overlay & Root
   ═══════════════════════════════════════════════════ */
.am-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  animation: am-fadeIn 0.15s ease;
}
@keyframes am-fadeIn { from { opacity: 0; } to { opacity: 1; } }

.am-root {
  width: min(92vw, 920px); max-height: 92vh;
  display: flex; flex-direction: column;
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  animation: am-slideUp 0.2s ease;
}
@keyframes am-slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* ═══════════════════════════════════════════════════
   Dark Theme
   ═══════════════════════════════════════════════════ */
.am-theme-dark { background: #1a1a2e; color: #e0e0e0; }
.am-theme-dark .am-header { background: #16213e; border-bottom: 1px solid #0f3460; }
.am-theme-dark .am-btn-default { background: #16213e; color: #c0c0c0; border: 1px solid #0f3460; }
.am-theme-dark .am-btn-default:hover { background: #0f3460; color: #fff; }
.am-theme-dark .am-btn-primary { background: #e94560; color: #fff; border: none; }
.am-theme-dark .am-btn-primary:hover { background: #d63851; }
.am-theme-dark .am-btn-success { background: #0f9b8e; color: #fff; border: none; }
.am-theme-dark .am-btn-success:hover { background: #0c7d72; }
.am-theme-dark .am-btn-danger { background: #c0392b; color: #fff; border: none; }
.am-theme-dark .am-btn-danger:hover { background: #a93226; }
.am-theme-dark .am-input, .am-theme-dark .am-extra-input,
.am-theme-dark .am-follow-input, .am-theme-dark .am-prompt-textarea {
  background: #16213e; color: #e0e0e0; border: 1px solid #0f3460;
}
.am-theme-dark .am-input:focus, .am-theme-dark .am-extra-input:focus,
.am-theme-dark .am-follow-input:focus { border-color: #e94560; outline: none; }
.am-theme-dark .am-output-area { background: #0d1117; border: 1px solid #0f3460; }
.am-theme-dark .am-placeholder { color: #6c7a89; }
.am-theme-dark .am-pt-btn { background: #16213e; color: #a0a0a0; border: 1px solid #0f3460; }
.am-theme-dark .am-pt-btn.active { background: #e94560; color: #fff; border-color: #e94560; }
.am-theme-dark .am-presets-panel { background: #16213e; border: 1px solid #0f3460; }
.am-theme-dark .am-preset-name:hover { color: #e94560; }
.am-theme-dark .am-model-popup { background: #1a1a2e; border: 1px solid #0f3460; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
.am-theme-dark .am-model-item:hover { background: #16213e; }
.am-theme-dark .am-model-item.selected { background: #e94560; color: #fff; }
.am-theme-dark .am-model-provider { color: #6c7a89; }
.am-theme-dark .am-icon-btn { color: #a0a0a0; }
.am-theme-dark .am-icon-btn:hover { color: #e0e0e0; background: #16213e; }
.am-theme-dark .am-prompt-panel { background: #1a1a2e; border: 1px solid #0f3460; }
.am-theme-dark .am-prompt-header { background: #16213e; border-bottom: 1px solid #0f3460; }
.am-theme-dark .am-prompt-header button { color: #a0a0a0; }
.am-theme-dark .am-footer { background: #16213e; border-top: 1px solid #0f3460; }
.am-theme-dark .am-label { color: #a0a0a0; }
.am-theme-dark .am-error { color: #e94560; background: rgba(233,69,96,0.08); border: 1px solid rgba(233,69,96,0.2); }
.am-theme-dark .am-hint { color: #6c7a89; }
.am-theme-dark .am-spinner { border-color: #0f3460; border-top-color: #e94560; }
.am-theme-dark .am-font-controls button { color: #a0a0a0; border-color: #0f3460; }
.am-theme-dark .am-font-controls button.active { background: #e94560; color: #fff; border-color: #e94560; }
.am-theme-dark .am-switch-item { color: #c0c0c0; }
.am-theme-dark .am-count-input { background: #0d1117; color: #e0e0e0; border-color: #0f3460; }
.am-theme-dark .am-prompt-font-btns button { color: #a0a0a0; border-color: #0f3460; }
.am-theme-dark .am-prompt-font-btns button.active { background: #e94560; color: #fff; border-color: #e94560; }
.am-theme-dark .am-range-sep { color: #6c7a89; }
.am-theme-dark .am-prompt-textarea:focus { border-color: #e94560; outline: none; }

/* ═══════════════════════════════════════════════════
   Light Theme
   ═══════════════════════════════════════════════════ */
.am-theme-light { background: #ffffff; color: #333333; }
.am-theme-light .am-header { background: #f8f9fa; border-bottom: 1px solid #e9ecef; }
.am-theme-light .am-btn-default { background: #f8f9fa; color: #495057; border: 1px solid #dee2e6; }
.am-theme-light .am-btn-default:hover { background: #e9ecef; }
.am-theme-light .am-btn-primary { background: #4361ee; color: #fff; border: none; }
.am-theme-light .am-btn-primary:hover { background: #3a56d4; }
.am-theme-light .am-btn-success { background: #2d6a4f; color: #fff; border: none; }
.am-theme-light .am-btn-success:hover { background: #1f4d38; }
.am-theme-light .am-btn-danger { background: #dc3545; color: #fff; border: none; }
.am-theme-light .am-btn-danger:hover { background: #c82333; }
.am-theme-light .am-input, .am-theme-light .am-extra-input,
.am-theme-light .am-follow-input, .am-theme-light .am-prompt-textarea {
  background: #fff; color: #333; border: 1px solid #dee2e6;
}
.am-theme-light .am-input:focus, .am-theme-light .am-extra-input:focus,
.am-theme-light .am-follow-input:focus { border-color: #4361ee; outline: none; }
.am-theme-light .am-output-area { background: #f8f9fa; border: 1px solid #e9ecef; }
.am-theme-light .am-placeholder { color: #adb5bd; }
.am-theme-light .am-pt-btn { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
.am-theme-light .am-pt-btn.active { background: #4361ee; color: #fff; border-color: #4361ee; }
.am-theme-light .am-presets-panel { background: #f8f9fa; border: 1px solid #e9ecef; }
.am-theme-light .am-preset-name:hover { color: #4361ee; }
.am-theme-light .am-model-popup { background: #fff; border: 1px solid #e9ecef; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.am-theme-light .am-model-item:hover { background: #f0f1ff; }
.am-theme-light .am-model-item.selected { background: #4361ee; color: #fff; }
.am-theme-light .am-model-provider { color: #adb5bd; }
.am-theme-light .am-icon-btn { color: #6c757d; }
.am-theme-light .am-icon-btn:hover { color: #333; background: #e9ecef; }
.am-theme-light .am-prompt-panel { background: #fff; border: 1px solid #e9ecef; }
.am-theme-light .am-prompt-header { background: #f8f9fa; border-bottom: 1px solid #e9ecef; }
.am-theme-light .am-prompt-header button { color: #6c757d; }
.am-theme-light .am-footer { background: #f8f9fa; border-top: 1px solid #e9ecef; }
.am-theme-light .am-label { color: #6c757d; }
.am-theme-light .am-error { color: #dc3545; background: rgba(220,53,69,0.06); border: 1px solid rgba(220,53,69,0.15); }
.am-theme-light .am-hint { color: #adb5bd; }
.am-theme-light .am-spinner { border-color: #e9ecef; border-top-color: #4361ee; }
.am-theme-light .am-font-controls button { color: #6c757d; border-color: #dee2e6; }
.am-theme-light .am-font-controls button.active { background: #4361ee; color: #fff; border-color: #4361ee; }
.am-theme-light .am-switch-item { color: #555; }
.am-theme-light .am-count-input { background: #fff; color: #333; border-color: #dee2e6; }
.am-theme-light .am-prompt-font-btns button { color: #6c757d; border-color: #dee2e6; }
.am-theme-light .am-prompt-font-btns button.active { background: #4361ee; color: #fff; border-color: #4361ee; }
.am-theme-light .am-range-sep { color: #adb5bd; }
.am-theme-light .am-prompt-textarea:focus { border-color: #4361ee; outline: none; }

/* ═══════════════════════════════════════════════════
   Header
   ═══════════════════════════════════════════════════ */
.am-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; flex-shrink: 0;
}
.am-title { font-size: 16px; font-weight: 600; white-space: nowrap; }
.am-desc { font-size: 12px; opacity: 0.65; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-header-right { display: flex; align-items: center; gap: 4px; position: relative; }
.am-icon-btn {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  border: none; background: transparent; cursor: pointer;
  border-radius: 6px; font-size: 13px; transition: all 0.15s;
}
.am-icon-btn.sm { padding: 2px 4px; font-size: 11px; }
.am-model-name {
  font-size: 12px; max-width: 100px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Model Popup */
.am-model-popup {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  padding: 8px; border-radius: 8px; min-width: 220px; z-index: 20;
}
.am-model-provider {
  font-size: 11px; font-weight: 600; padding: 4px 8px 2px;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.am-model-item {
  padding: 6px 12px; border-radius: 4px; cursor: pointer;
  font-size: 13px; transition: background 0.1s;
}

/* ═══════════════════════════════════════════════════
   Body & Config
   ═══════════════════════════════════════════════════ */
.am-body {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}
.am-config { display: flex; flex-direction: column; gap: 10px; }
.am-config-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.am-label { font-size: 13px; font-weight: 500; min-width: 56px; flex-shrink: 0; }

/* Inputs */
.am-input { padding: 4px 8px; border-radius: 6px; font-size: 13px; }
.am-input-sm { width: 80px; }
.am-extra-input {
  flex: 1; padding: 6px 10px; border-radius: 6px; font-size: 13px;
  resize: vertical; min-width: 200px; font-family: inherit;
}
.am-range-sep { margin: 0 2px; font-size: 14px; }
.am-hint { font-size: 11px; flex-shrink: 0; }

/* Prompt Type Switch */
.am-prompt-type-switch { display: flex; gap: 4px; }
.am-pt-btn {
  padding: 4px 12px; border-radius: 6px; font-size: 12px;
  cursor: pointer; transition: all 0.15s;
}

/* Context Switches */
.am-switch-list { display: flex; flex-wrap: wrap; gap: 6px; }
.am-switch-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; cursor: pointer; user-select: none;
}
.am-switch-item input[type="checkbox"] { cursor: pointer; }
.am-count-input {
  width: 42px; padding: 1px 4px; border-radius: 4px;
  font-size: 11px; text-align: center; border-style: solid; border-width: 1px;
}

/* Presets */
.am-presets-panel {
  padding: 8px; border-radius: 8px; max-height: 160px; overflow-y: auto;
}
.am-preset-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 8px; border-radius: 4px;
}
.am-preset-name { font-size: 13px; cursor: pointer; flex: 1; }
.am-empty { font-size: 12px; opacity: 0.5; text-align: center; padding: 16px; }

/* ═══════════════════════════════════════════════════
   Output Area
   ═══════════════════════════════════════════════════ */
.am-output-area {
  flex: 1; min-height: 200px; max-height: 420px; overflow-y: auto;
  padding: 14px; border-radius: 8px;
}
.am-output-text { white-space: pre-wrap; word-break: break-word; }
.am-font-sm { font-size: 13px; line-height: 1.6; }
.am-font-md { font-size: 15px; line-height: 1.75; }
.am-font-lg { font-size: 18px; line-height: 1.85; }

.am-placeholder {
  display: flex; align-items: center; justify-content: center;
  height: 100%; font-size: 14px; min-height: 160px;
}
.am-error {
  padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.5;
}
.am-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; height: 100%; font-size: 14px; min-height: 160px;
}
.am-spinner {
  width: 32px; height: 32px; border: 3px solid;
  border-top-color: transparent; border-radius: 50%;
  animation: am-spin 0.8s linear infinite;
}
@keyframes am-spin { to { transform: rotate(360deg); } }

/* Font Controls */
.am-font-controls { display: flex; gap: 4px; }
.am-font-controls button {
  padding: 2px 8px; border-radius: 4px; font-size: 12px;
  cursor: pointer; border: 1px solid; background: transparent; transition: all 0.15s;
}

/* Follow Up */
.am-follow-up { display: flex; gap: 8px; align-items: flex-end; }
.am-follow-input {
  flex: 1; padding: 6px 10px; border-radius: 6px; font-size: 13px;
  resize: vertical; font-family: inherit;
}

/* ═══════════════════════════════════════════════════
   Footer
   ═══════════════════════════════════════════════════ */
.am-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; flex-shrink: 0;
}
.am-footer-left { display: flex; gap: 14px; font-size: 12px; }
.am-footer-right { display: flex; gap: 8px; }
.am-word-count { opacity: 0.7; }
.am-gen-count { opacity: 0.45; }

/* ═══════════════════════════════════════════════════
   Buttons
   ═══════════════════════════════════════════════════ */
.am-btn {
  padding: 6px 14px; border-radius: 6px; font-size: 13px;
  cursor: pointer; display: flex; align-items: center; gap: 5px;
  transition: all 0.15s; border: 1px solid transparent;
}
.am-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.am-btn-gen { padding: 8px 28px; font-size: 15px; font-weight: 600; }

/* ═══════════════════════════════════════════════════
   Prompt Editor Panel
   ═══════════════════════════════════════════════════ */
.am-prompt-overlay { z-index: 10001; }
.am-prompt-panel {
  width: min(88vw, 720px); max-height: 88vh;
  border-radius: 12px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.22);
  display: flex; flex-direction: column;
}
.am-prompt-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; font-size: 14px; font-weight: 600;
}
.am-prompt-textarea {
  flex: 1; min-height: 320px; padding: 12px 16px;
  border: none; resize: vertical; font-family: 'SF Mono','Cascadia Code','Fira Code',monospace;
  line-height: 1.65; font-size: 13px;
}
.am-prompt-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px;
}
.am-prompt-font-btns { display: flex; gap: 4px; }
.am-prompt-font-btns button {
  padding: 2px 8px; border-radius: 4px; font-size: 12px;
  cursor: pointer; border: 1px solid; background: transparent; transition: all 0.15s;
}
</style>
