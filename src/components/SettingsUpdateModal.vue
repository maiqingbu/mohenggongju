<template>
  <Teleport to="body">
    <div class="sum-overlay" @click.self="emit('close')">
      <div class="sum-root" :class="isDark !== false ? 'sum-theme-dark' : 'sum-theme-light'">
        <!-- Header -->
        <div class="sum-header">
          <div class="sum-header-left">
            <h2 class="sum-title">设定数据自动更新</h2>
            <p class="sum-desc">从选定章节正文中提取角色信息、世界观设定、物品数据、伏笔线索，自动写入设定面板。支持版本追溯与回滚。</p>
          </div>
          <button class="sum-close" @click="emit('close')">✕</button>
        </div>

        <div class="sum-body">
          <!-- Status -->
          <div class="sum-status">
            <span class="sum-badge">进度：{{ statusText }}</span>
            <span class="sum-badge">版本：v{{ versionCount }}</span>
            <span class="sum-badge">条目：角 {{ entityStats.charCount }} / 设 {{ entityStats.worldCount }} / 伏 {{ entityStats.foreshadowCount }} / 品 {{ entityStats.itemCount }}</span>
            <span class="sum-badge sum-badge-active">自动更新：{{ autoEnabled ? '已开启' : '已关闭' }}</span>
          </div>

          <!-- Auto update settings -->
          <div class="sum-card">
            <div class="sum-card-header">
              <span>自动更新设置</span>
              <button class="sum-save-btn" @click="saveAutoSettings">保存设置</button>
            </div>
            <p class="sum-hint">章节完成后后台按频率自动更新设定数据。</p>
            <div class="sum-row">
              <span>启用自动更新</span>
              <button class="sum-switch" :class="{ on: autoEnabled }" @click="autoEnabled = !autoEnabled" role="switch" :aria-checked="autoEnabled">
                <span class="sum-switch-knob" :class="{ on: autoEnabled }"></span>
              </button>
              <span class="sum-hint">章节完成后，按频率自动触发更新。</span>
            </div>
            <div class="sum-row">
              <span>每 N 章更新一次</span>
              <button class="sum-count-btn" @click="autoInterval = Math.max(1, autoInterval - 1)">−</button>
              <input class="sum-count-input" type="number" v-model.number="autoInterval" />
              <button class="sum-count-btn" @click="autoInterval = Math.min(100, autoInterval + 1)">+</button>
            </div>
            <div class="sum-row" style="position:relative">
              <span>更新模型</span>
              <span class="sum-badge">{{ selectedModelName }}</span>
              <button class="sum-link-btn" @click.stop="showModelMenu = !showModelMenu">选择</button>
              <div v-if="showModelMenu" class="sum-model-menu">
                <button v-for="m in availableModels" :key="m.id"
                  class="sum-model-opt" :class="{ active: selectedModelId === m.id }"
                  @click="selectedModelId = m.id; showModelMenu = false">{{ m.name }}</button>
              </div>
            </div>
            <div class="sum-row">
              <span>提示词模板</span>
              <span class="sum-badge">{{ selectedTemplateName }}</span>
              <div class="sum-template-select">
                <select v-model="selectedTemplateId" class="sum-select">
                  <option v-for="t in availableTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </div>
            </div>
            <div class="sum-row">
              <span>审批模式</span>
              <button class="sum-switch" :class="{ on: approvalMode }" @click="approvalMode = !approvalMode" role="switch" :aria-checked="approvalMode">
                <span class="sum-switch-knob" :class="{ on: approvalMode }"></span>
              </button>
              <span class="sum-hint">开启后点击"预览更新"，可先查看再选择写入。</span>
            </div>
          </div>

          <!-- Manual update -->
          <div class="sum-card">
            <div class="sum-card-header">
              <span>手动提取设定</span>
              <span class="sum-hint" v-if="extractResult">提取到 {{ extractResult.chars }} 角色 / {{ extractResult.worlds }} 世界观 / {{ extractResult.items }} 物品 / {{ extractResult.fores }} 伏笔</span>
            </div>
            <div class="sum-row">
              <span>处理最近</span>
              <button class="sum-count-btn" @click="chapterCount = Math.max(1, chapterCount - 1)">−</button>
              <input class="sum-count-input" type="number" v-model.number="chapterCount" />
              <button class="sum-count-btn" @click="chapterCount = Math.min(50, chapterCount + 1)">+</button>
              <span class="sum-hint">章</span>
            </div>
            <div class="sum-row">
              <button class="sum-action-btn" @click="startExtraction" :disabled="extracting">
                {{ extracting ? '提取中…' : '🔍 开始提取' }}
              </button>
              <button class="sum-action-btn" @click="applyExtraction" :disabled="!extractResult || extracting" style="background:rgba(46,168,106,0.8);color:#fff">
                ✓ 应用写入
              </button>
            </div>
            <div v-if="extracting" class="sum-extract-progress">
              <span class="sum-spinner"></span>
              <span>{{ extractStatus }}</span>
            </div>
            <div v-if="extractPreview.length" class="sum-extract-preview">
              <div v-for="(item, i) in extractPreview.slice(0, 20)" :key="i" class="sum-extract-item">
                <span class="sum-extract-type">{{ item.type === 'character' ? '👤' : item.type === 'world_setting' ? '🌍' : item.type === 'item' ? '📦' : '🔮' }}</span>
                <span class="sum-extract-name">{{ item.name }}</span>
                <span class="sum-extract-summary">{{ (item.summary || '').slice(0, 40) }}</span>
              </div>
              <p v-if="extractPreview.length > 20" class="sum-hint">...还有 {{ extractPreview.length - 20 }} 条</p>
            </div>
          </div>

          <!-- Metadata review -->
          <div class="sum-card" v-if="metadataFields.some(f => f.suggested)">
            <div class="sum-card-header">
              <span>元数据审阅</span>
              <button class="sum-action-btn" @click="applyMetadata" :disabled="!metadataFields.some(f => f.accept)" style="background:rgba(46,168,106,0.8);color:#fff">
                ✓ 写入接受项
              </button>
            </div>
            <p class="sum-hint">AI 从正文中提取的元数据建议。勾选接受后写入作品设定，生成章节时将自动注入到 AI 提示词中。</p>
            <div v-for="field in metadataFields" :key="field.key" class="sum-meta-row" v-show="field.suggested">
              <div class="sum-meta-header">
                <span class="sum-meta-label">{{ field.label }}</span>
                <button class="sum-switch" :class="{ on: field.accept }" @click="toggleMetadataAccept(field)" role="switch" :aria-checked="field.accept">
                  <span class="sum-switch-knob" :class="{ on: field.accept }"></span>
                </button>
                <span class="sum-hint" style="margin-left:4px">{{ field.accept ? '将写入' : '跳过' }}</span>
              </div>
              <div v-if="field.current" class="sum-meta-current">
                <span class="sum-hint">当前：</span>
                <span class="sum-meta-text">{{ field.current.slice(0, 80) }}{{ field.current.length > 80 ? '…' : '' }}</span>
              </div>
              <textarea
                v-model="field.suggested"
                class="sum-meta-textarea"
                :class="{ accepted: field.accept }"
                rows="3"
                :disabled="!field.accept"
              ></textarea>
            </div>
          </div>

          <!-- Version history -->
          <div class="sum-card">
            <div class="sum-card-header">
              <span>版本历史 / 回滚</span>
              <button class="sum-refresh-btn" @click="refreshHistory">刷新</button>
            </div>
            <p class="sum-hint">每次更新都会生成一条 Patch 记录；回滚会生成新版本，方便追溯与再次回滚。</p>
            <p class="sum-hint">仅保留最近 20 条记录（版本号会持续递增）。</p>
            <div v-if="!versions.length" class="sum-empty">暂无版本历史。完成一次更新后会自动生成版本记录。</div>
            <div v-for="v in versions" :key="v.version" class="sum-version-row">
              <div class="sum-version-info">
                <span class="sum-version-num">v{{ v.version }}</span>
                <span class="sum-version-tag">{{ v.source === 'auto_update' ? '自动' : '手动' }}</span>
                <span class="sum-version-range">{{ v.range }}</span>
                <span class="sum-version-meta">{{ v.timestamp }}</span>
              </div>
              <button class="sum-rollback-btn" @click="rollbackTo(v.version)">回滚到此版本</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useModelStore } from '../stores/modelStore'
import { SettingsManager, defaultDataForType, type SettingEntityType } from '../composables/useSettings'
import { useWorkRepo } from '../composables/useWorkRepo'
import { showConfirm } from '../composables/useConfirm'
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'

const props = defineProps<{
  isDark?: boolean
  manager?: any  // 可选：外部 SettingsManager 实例，用于条目统计
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'rollback', version: number): void; (e: 'settings-changed'): void }>()

let _extractData: any = null

const msg = useMessage()

// ── 数据条目统计：优先使用外部 manager，否则从 SettingsManager 实时读取 ──
const entityStats = ref({ charCount: 0, worldCount: 0, foreshadowCount: 0, itemCount: 0 })
function countEntities(mgr: any) {
  const all = mgr.listAll?.() || []
  entityStats.value = {
    charCount: all.filter((e: any) => e.type === 'character').length,
    worldCount: all.filter((e: any) => e.type === 'world_setting').length,
    foreshadowCount: all.filter((e: any) => e.type === 'foreshadowing').length,
    itemCount: all.filter((e: any) => e.type === 'item').length,
  }
}
async function loadEntityStats() {
  // 优先使用外部传入的 manager（已有数据，无需重新加载）
  if (props.manager && typeof props.manager.listAll === 'function') {
    countEntities(props.manager)
    return
  }
  try {
    const repo = useWorkRepo()
    const workId = repo.currentWorkId.value
    if (!workId) return
    const mgr = new SettingsManager()
    await mgr.load(workId)
    countEntities(mgr)
  } catch {}
}

// ── 模型选择：从 modelStore 实时读取 ──
const availableModels = computed(() => {
  const store = useModelStore()
  return store.getEnabledProviders().flatMap(p =>
    'models' in p ? p.models.map(m => ({ id: m.id, name: `${p.name} / ${m.name}`, providerId: p.id }))
    : [{ id: p.modelId, name: p.name, providerId: p.id }]
  )
})
const selectedModelId = ref(availableModels.value[0]?.id || '')
const selectedModelName = computed(() =>
  availableModels.value.find(m => m.id === selectedModelId.value)?.name || '未配置模型'
)
const showModelMenu = ref(false)

// ── 可用模板 ──
const availableTemplates = [
  { id: 'full', name: '全量提取', desc: '从选定章节中提取角色/世界观/物品/伏笔所有设定数据，新增+更新' },
  { id: 'char-only', name: '仅角色提取', desc: '只提取角色姓名/身份/性格/关系/能力/位置变化' },
  { id: 'world-only', name: '仅世界观提取', desc: '只提取世界观规则/势力/地理/魔法体系等设定' },
]
const selectedTemplateId = ref('full')
const selectedTemplateName = computed(() =>
  availableTemplates.find(t => t.id === selectedTemplateId.value)?.name || ''
)

// ── 自动更新设置 ──
const autoEnabled = ref(false)
const autoInterval = ref(3)
const chapterCount = ref(3)
const approvalMode = ref(false)
const statusText = ref('等待执行')
const versionCount = ref(0)

// ── 版本历史 ──
interface VersionRow { version: number; source: string; range: string; timestamp: string; snapshot?: any[] }
const versions = ref<VersionRow[]>([])

function versionKey(workId: number) { return `ns:statekeeper:v_${workId}` }

function saveVersionRecord(workId: number, record: VersionRow) {
  const key = versionKey(workId)
  const raw = localStorage.getItem(key)
  const all: VersionRow[] = raw ? JSON.parse(raw) : []
  all.push(record)
  if (all.length > 20) all.splice(0, all.length - 20)
  localStorage.setItem(key, JSON.stringify(all))
}

function loadVersions() {
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) { versions.value = []; versionCount.value = 0; return }
  const key = versionKey(workId)
  const raw = localStorage.getItem(key)
  const all: VersionRow[] = raw ? JSON.parse(raw) : []
  all.sort((a, b) => b.version - a.version)
  versions.value = all.slice(0, 20)
  versionCount.value = all.length ? all[0].version : 0
}

function saveAutoSettings() {
  const settings = {
    enabled: autoEnabled.value,
    interval: autoInterval.value,
    approvalMode: approvalMode.value,
    modelId: selectedModelId.value,
    templateId: selectedTemplateId.value,
  }
  localStorage.setItem('ns:statekeeper:autoSettings', JSON.stringify(settings))
  msg.success('自动更新设置已保存')
  emit('settings-changed')
}

// ── 设定提取 ──
const extracting = ref(false)
const extractStatus = ref('')
const extractResult = ref<{ chars: number; worlds: number; items: number; fores: number } | null>(null)
const extractPreview = ref<{ type: string; name: string; summary: string }[]>([])

// ── 元数据审阅 ──
interface MetadataField {
  key: string
  label: string
  current: string    // WorkspaceSettings 当前值
  suggested: string   // AI 提取值（可编辑）
  accept: boolean     // 是否接受
}
const metadataFields = ref<MetadataField[]>([
  { key: 'cheatAbility',  label: '金手指',   current: '', suggested: '', accept: false },
  { key: 'mainCharacter', label: '主角设定', current: '', suggested: '', accept: false },
  { key: 'powerSystem',   label: '力量体系', current: '', suggested: '', accept: false },
  { key: 'worldSetting',  label: '世界观',   current: '', suggested: '', accept: false },
])

function loadCurrentMetadata() {
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) return
  const ws = new WorkspaceSettings(workId)
  const d = ws.data
  const aiMeta = (_extractData?.metadata || {}) as Record<string, string>
  for (const field of metadataFields.value) {
    field.current = (d as any)[field.key] || ''
    field.suggested = aiMeta[field.key] || ''
    field.accept = !!(field.suggested && field.suggested !== field.current)
  }
}

function toggleMetadataAccept(field: MetadataField) {
  field.accept = !field.accept
}

async function applyMetadata() {
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) { msg.warning('请先选择作品'); return }

  const patch: Record<string, string> = {}
  for (const field of metadataFields.value) {
    if (field.accept && field.suggested) {
      patch[field.key] = field.suggested
    }
  }
  if (!Object.keys(patch).length) { msg.warning('没有需要写入的元数据字段'); return }

  const ws = new WorkspaceSettings(workId)
  ws.update(patch)

  // 更新当前值显示
  for (const field of metadataFields.value) {
    if (patch[field.key]) field.current = patch[field.key]
  }
  msg.success(`已写入 ${Object.keys(patch).length} 个元数据字段`)
  emit('settings-changed')
}

async function startExtraction() {
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) { msg.warning('请先选择作品'); return }

  const chs = (Object.values(repo.chapterMap.value).flat() as any[])
    .sort((a, b) => (a.sort_order ?? a.chapter_no ?? 0) - (b.sort_order ?? b.chapter_no ?? 0))
  if (!chs.length) { msg.warning('当前作品没有章节'); return }

  const targetChs = chs.slice(-chapterCount.value)
  const allContent = targetChs.map((c: any, i: number) => { const chNo = c.sort_order ?? c.chapter_no ?? i + 1; return `[第${chNo}章]\n${c.content || ''}` }).filter((s: string) => s.length > 4).join('\n\n')
  if (!allContent.trim()) { msg.warning('选中的章节正文为空'); return }

  extracting.value = true
  extractStatus.value = `正在从 ${targetChs.length} 个章节中提取设定...`
  statusText.value = '提取中…'

  try {
    const store = useModelStore()
    const providers = store.getEnabledProviders()
    if (!providers.length) { msg.error('请先在设置中启用 AI 模型'); extracting.value = false; return }

    const firstProvider = providers[0]
    const modelId = selectedModelId.value || ('models' in firstProvider ? firstProvider.models[0]?.id : (firstProvider as any).modelId)
    if (!modelId) { msg.error('未选择模型'); extracting.value = false; return }

    const prompt = `从以下小说正文中提取设定信息，输出纯JSON（不要markdown代码块）：
{
  "metadata": {
    "cheatAbility": "根据正文推断，主角金手指/核心能力的完整描述（含机制、限制、代价），如无变化填''",
    "mainCharacter": "根据正文推断，主角最新设定：姓名、年龄、性格演变、当前困境、源动力，如无变化填''",
    "powerSystem": "根据正文推断，力量体系/能力等级的最新描述，含各等级解锁内容，如无变化填''",
    "worldSetting": "根据正文推断，世界观最新描述：关键规则、势力分布、当前局势，如无变化填''"
  },
  "characters": [{"name":"","category":"主角/配角/反派/路人/特殊","gender":"男/女/其他","age":"","identity":"职业或身份","nickname":"","characterTags":"人设标签逗号分隔","personality":"50字角色简介","appearance":"","abilities":["技能"],"skills":"主要技能","keyItems":"关键物品","location":"当前所在/状态","alive":true,"importance":"1-5","volume":"登场卷号如第1卷","ending":"最终结局","coreTrauma":"核心心理创伤","motivation":"源动力","growthArc":"全书成长弧光"}],
  "worldSettings": [{"name":"","category":"地理/势力/规则/历史/文化/魔法体系/其他","scope":"全局/区域/局部/个人","status":"活跃/已落定/隐藏/废弃","description":"","rules":[],"summary":"50字内"}],
  "items": [{"name":"","owner":"","function":"","summary":"50字内"}],
  "foreshadowing": [{"name":"","plantedChapter":"纯数字如3表示第3章","expectedChapter":"纯数字不确定填0","status":"已埋/已触发/已回收","secret":"伏笔核心秘密","tags":"主线伏笔/角色秘密等","summary":"50字简述"}]
}

★★ metadata 填写原则 ★★
- 每个字段只在你认为正文中有新信息时才填，没有新发现就填空字符串 ""
- 综合已写章节的全局信息来推断，不要只看最后几章
- 描述要足够详细，能直接作为 AI 生成正文时的注入元数据

正文：\n${allContent.slice(0, 10000)}`

    extractStatus.value = '调用 AI 提取中...'
    const { sendAiMessageStream } = await import('../composables/useAiChat')
    let full = ''
    const { result } = sendAiMessageStream({
      providerId: ('id' in firstProvider ? firstProvider.id : (firstProvider as any).id) || '',
      modelId,
      messages: [
        { role: 'system', content: '你是专业的小说设定提取专家。只输出纯 JSON，不要 markdown 标记，不要解释。' },
        { role: 'user', content: prompt },
      ],
      stream: true,
    }, {
      onChunk(t: string) { full += t },
      onDone() {},
      onError(err: string) { throw new Error(err) },
    })
    await result

    const json = full.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(json)
    const chars = parsed.characters || []
    const worlds = parsed.worldSettings || []
    const items = parsed.items || []
    const fores = parsed.foreshadowing || []
    const metadata = parsed.metadata || {}

    extractResult.value = { chars: chars.length, worlds: worlds.length, items: items.length, fores: fores.length }
    extractPreview.value = [
      ...chars.map((c: any) => ({ type: 'character', name: c.name, summary: c.summary || c.identity || '' })),
      ...worlds.map((w: any) => ({ type: 'world_setting', name: w.name, summary: w.summary || w.description || '' })),
      ...items.map((i: any) => ({ type: 'item', name: i.name, summary: i.summary || i.function || '' })),
      ...fores.map((f: any) => ({ type: 'foreshadowing', name: f.name, summary: f.summary || '' })),
    ]

    // 暂存解析结果（含元数据）
    _extractData = { chars, worlds, items, fores, metadata }

    // 加载当前作品设定用于元数据对比
    loadCurrentMetadata()
    statusText.value = `提取完成：${chars.length}角色/${worlds.length}世界观/${items.length}物品/${fores.length}伏笔`
  } catch (e: any) {
    msg.error('提取失败: ' + (e.message || 'JSON解析错误'))
    statusText.value = '提取失败'
  } finally {
    extracting.value = false
  }
}

async function applyExtraction() {
  const data = _extractData
  if (!data) { msg.warning('请先执行提取'); return }

  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) return

  const mgr = new SettingsManager()
  await mgr.load(workId)

  // ── 保存版本快照（回滚用）──
  const snapshot = mgr.listAll().map(e => ({ ...e, structuredData: e.structuredData ? { ...e.structuredData } : undefined }))

  // ── 规范化：AI 输出 → SettingsPanel 结构化字段 ──

  function normalizeCharacter(c: any): Record<string, unknown> {
    const def = defaultDataForType('character')
    // 有效的角色分类值
    const validCategories = ['主角', '配角', '反派', '路人', '特殊']
    let category = validCategories.includes(c.category) ? c.category : ''
    // 推断：AI 未提供或提供了无效 category 时，综合 identity + importance 推断
    if (!category) {
      const idLower = (c.identity || '').toLowerCase()
      const importance = Number(c.importance) || 0
      if (idLower.includes('主角') || idLower.includes('主人公') || importance === 1) category = '主角'
      else if (idLower.includes('反派') || idLower.includes('敌人') || idLower.includes('魔') || idLower.includes('boss')) category = '反派'
      else if (idLower.includes('路人') || idLower.includes('龙套') || importance >= 5) category = '路人'
      else if (idLower.includes('特殊') || idLower.includes('神秘')) category = '特殊'
      else if (idLower.includes('盟友') || idLower.includes('同伴') || idLower.includes('战友')) category = '配角'
      else if (importance >= 2 && importance <= 4) category = '配角'
      else category = '配角'
    }
    // 确保 abilities 是字符串数组
    let abilities: string[] = def.abilities as string[] || []
    if (Array.isArray(c.abilities)) abilities = c.abilities.filter((a: any) => typeof a === 'string')
    // 确保 relationships 是 {name, relation} 数组
    let relationships: { name: string; relation: string }[] = def.relationships as any[] || []
    if (Array.isArray(c.relationships)) {
      relationships = c.relationships
        .filter((r: any) => r && typeof r.name === 'string')
        .map((r: any) => ({ name: r.name || '', relation: r.relation || '' }))
    }
    return {
      ...def,
      category: category || def.category || '配角',
      gender: c.gender || def.gender,
      age: c.age || def.age,
      identity: c.identity || def.identity,
      nickname: c.nickname || def.nickname,
      personality: c.personality || def.personality,
      characterTags: c.characterTags || c.personality || def.characterTags,
      appearance: c.appearance || def.appearance,
      abilities,
      skills: c.skills || def.skills,
      keyItems: c.keyItems || def.keyItems,
      relationships,
      alive: typeof c.alive === 'boolean' ? c.alive : def.alive,
      location: c.location || def.location,
      volume: c.volume || def.volume,
      ending: c.ending || def.ending,
      coreTrauma: c.coreTrauma || def.coreTrauma,
      motivation: c.motivation || def.motivation,
      growthArc: c.growthArc || def.growthArc,
    }
  }

  function normalizeWorldSetting(w: any): Record<string, unknown> {
    const def = defaultDataForType('world_setting')
    let rules: string[] = def.rules as string[] || []
    if (Array.isArray(w.rules)) rules = w.rules.filter((r: any) => typeof r === 'string')
    return {
      ...def,
      category: w.category || def.category,
      scope: w.scope || def.scope,
      status: w.status || def.status,
      description: w.description || def.description,
      rules,
    }
  }

  function normalizeItem(i: any): Record<string, unknown> {
    const def = defaultDataForType('item')
    return { ...def, owner: i.owner || def.owner, function: i.function || def.function }
  }

  /** 清洗章节号：去除"第""章"等中文修饰，只保留纯数字。兼容数字和字符串输入 */
  function sanitizeChapterNumber(val: any): string {
    if (val === null || val === undefined) return ''
    const str = String(val)
    const cleaned = str.replace(/[第章回节卷]|\s/g, '')
    const num = parseInt(cleaned, 10)
    return isNaN(num) ? str : String(num)
  }

  function normalizeForeshadowing(f: any): Record<string, unknown> {
    const def = defaultDataForType('foreshadowing')
    // 状态到 resolved 的映射
    const statusStr = String(f.status || '')
    const isResolved = statusStr.includes('已回收') || statusStr.includes('resolved')
    return {
      ...def,
      secret: f.secret || f.summary || def.secret,
      tags: f.tags || def.tags,
      resolved: isResolved,
      plantedChapter: sanitizeChapterNumber(f.plantedChapter) || def.plantedChapter,
      expectedChapter: sanitizeChapterNumber(f.expectedChapter) || def.expectedChapter,
    }
  }

  let added = 0; let updated = 0
  const applyEntity = async (type: SettingEntityType, items: any[], normalizeFn: (x: any) => Record<string, unknown>, summaryField: string) => {
    for (const item of items) {
      if (!item.name) continue
      const sd = normalizeFn(item)
      const existing = mgr.listByType(type).find((e: any) => e.name === item.name)
      if (existing) {
        await mgr.update(existing.id, { summary: item.summary || existing.summary, structuredData: { ...existing.structuredData, ...sd } as any })
        updated++
      } else {
        await mgr.add({ type: type as any, name: item.name, summary: item.summary || item[summaryField] || '', structuredData: sd, source: 'ai_extraction' })
        added++
      }
    }
  }

  await applyEntity('character', data.chars, normalizeCharacter, 'identity')
  await applyEntity('world_setting', data.worlds, normalizeWorldSetting, 'description')
  await applyEntity('item', data.items, normalizeItem, 'function')
  await applyEntity('foreshadowing', data.fores, normalizeForeshadowing, '')

  await mgr.save(workId)

  // ── 保存版本记录到 localStorage ──
  const vNext = versionCount.value + 1
  const versionRecord: VersionRow & { snapshot: any[] } = {
    version: vNext,
    source: '手动',
    range: `最近 ${chapterCount.value} 章`,
    timestamp: new Date().toLocaleString('zh-CN'),
    snapshot,
  }
  saveVersionRecord(workId, versionRecord)
  versionCount.value = vNext

  loadEntityStats()
  msg.success(`已写入：${added} 新增 / ${updated} 更新`)
  emit('settings-changed')
  _extractData = null
  extractResult.value = null
  extractPreview.value = []
}

function refreshHistory() {
  loadVersions()
  msg.success(versions.value.length > 0 ? `已刷新，共 ${versions.value.length} 条记录` : '已刷新，暂无版本记录')
}
onMounted(() => {
  // 加载已保存的自动更新设置
  try {
    const saved = localStorage.getItem('ns:statekeeper:autoSettings')
    if (saved) {
      const s = JSON.parse(saved)
      if (typeof s.enabled === 'boolean') autoEnabled.value = s.enabled
      if (typeof s.interval === 'number') autoInterval.value = s.interval
      if (typeof s.approvalMode === 'boolean') approvalMode.value = s.approvalMode
      if (s.modelId) selectedModelId.value = s.modelId
      if (s.templateId) selectedTemplateId.value = s.templateId
    }
  } catch {}
  loadVersions()
  loadEntityStats()
})
async function rollbackTo(v: number) {
  const repo = useWorkRepo()
  const workId = repo.currentWorkId.value
  if (!workId) { msg.warning('请先选择作品'); return }
  showConfirm(`确认回滚到 v${v}？回滚会生成新版本。`, async () => {
  try {
    const key = versionKey(workId)
    const raw = localStorage.getItem(key)
    const all: VersionRow[] = raw ? JSON.parse(raw) : []
    const target = all.find(r => r.version === v)
    if (!target?.snapshot?.length) { msg.error('该版本没有可用的回滚数据'); return }

    // 保存当前状态为新版本（回滚前快照）
    const mgr = new SettingsManager()
    await mgr.load(workId)
    const currentSnapshot = mgr.listAll().map(e => ({ ...e, structuredData: e.structuredData ? { ...e.structuredData } : undefined }))
    const vNext = versionCount.value + 1
    saveVersionRecord(workId, {
      version: vNext,
      source: '回滚',
      range: `回滚到 v${v} 前的状态`,
      timestamp: new Date().toLocaleString('zh-CN'),
      snapshot: currentSnapshot,
    })

    // 恢复目标版本的实体数据
    mgr.clear()
    for (const entity of target.snapshot) {
      await mgr.add({
        type: entity.type,
        name: entity.name,
        summary: entity.summary,
        structuredData: entity.structuredData,
        source: entity.source,
        chapterNo: entity.chapterNo,
      } as any)
    }
    await mgr.save(workId)
    versionCount.value = vNext
    loadVersions()
    loadEntityStats()
    msg.success(`已回滚到 v${v}（新版本 v${vNext}）`)
    emit('rollback', v)
  } catch (e: any) {
    msg.error('回滚失败: ' + (e.message || String(e)))
  }
  })
}
</script>

<style scoped>
.sum-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.sum-root { width: 600px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border: 1px solid rgba(128,128,128,0.15); }
.sum-theme-dark { background: #1c1c22; color: white; }
.sum-theme-light { background: #f5f5f5; color: #1a1a1a; }
.sum-theme-light .sum-card { background: #fff; border-color: rgba(0,0,0,0.06); }
.sum-theme-light .sum-input, .sum-theme-light .sum-count-input { background: #fff; color: #1a1a1a; border-color: white; }

.sum-header { display: flex; justify-content: space-between; padding: 16px 20px 8px; flex-shrink: 0; }
.sum-title { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
.sum-desc { font-size: 11px; opacity: 0.4; margin: 0; }
.sum-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; }
.sum-close:hover { opacity: 1; }

.sum-body { flex: 1; overflow-y: auto; padding: 12px 20px; display: flex; flex-direction: column; gap: 12px; }

.sum-status { display: flex; gap: 12px; font-size: 11px; opacity: 0.5; flex-wrap: wrap; }
.sum-status-tag { color: #2ea86a; }
.sum-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: rgba(128,128,128,0.08); white-space: nowrap; }
.sum-badge-active { background: rgba(46,168,106,0.1); color: #2ea86a; }

.sum-card { background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.08); border-radius: 10px; padding: 12px 14px; }
.sum-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.sum-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 12px; }
.sum-hint { font-size: 10px; opacity: 0.3; margin: 2px 0; }

.sum-save-btn { padding: 4px 14px; border: none; border-radius: 16px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 11px; font-family: inherit; }
.sum-link-btn { padding: 2px 8px; border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; background: transparent; color: inherit; cursor: pointer; font-size: 10px; font-family: inherit; opacity: 0.5; }
.sum-link-btn:hover { opacity: 1; }
.sum-action-btn { padding: 6px 16px; border: 1px solid rgba(46,168,106,0.3); border-radius: 16px; background: rgba(46,168,106,0.08); color: #2ea86a; cursor: pointer; font-size: 11px; font-family: inherit; }
.sum-refresh-btn { padding: 2px 8px; border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; background: transparent; color: inherit; cursor: pointer; font-size: 10px; font-family: inherit; opacity: 0.4; }

.sum-switch { width: 32px; height: 18px; border-radius: 9px; border: none; background: rgba(128,128,128,0.2); cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
.sum-switch.on { background: #2ea86a; }
.sum-switch-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: left 0.2s; }
.sum-switch-knob.on { left: 16px; }

.sum-count-btn { width: 22px; height: 22px; border: 1px solid rgba(128,128,128,0.15); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; font-size: 14px; font-family: inherit; display: flex; align-items: center; justify-content: center; }
.sum-count-btn:hover { background: rgba(128,128,128,0.08); }
.sum-count-input { width: 40px; padding: 3px 6px; text-align: center; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.06); border: 1px solid transparent; border-radius: 4px; color: inherit; outline: none; }

.sum-input { padding: 4px 8px; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.06); border: 1px solid transparent; border-radius: 4px; color: inherit; outline: none; width: 120px; }
.sum-input:disabled { opacity: 0.3; }
.sum-input:focus { border-color: rgba(46,168,106,0.4); }
.sum-check { display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer; }
.sum-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: rgba(128,128,128,0.08); }

.sum-empty { text-align: center; padding: 20px 0; font-size: 11px; opacity: 0.25; }
.sum-version-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(128,128,128,0.04); font-size: 11px; }

.sum-extract-progress { font-size: 12px; padding: 6px 0; opacity: 0.7; display: flex; align-items: center; gap: 8px; }
.sum-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: sum-spin 0.6s linear infinite; flex-shrink: 0; }
@keyframes sum-spin { to { transform: rotate(360deg); } }
.sum-extract-preview { max-height: 200px; overflow-y: auto; margin-top: 6px; }
.sum-extract-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; border-bottom: 1px solid rgba(128,128,128,0.04); }
.sum-extract-type { flex-shrink: 0; }
.sum-extract-name { font-weight: 500; white-space: nowrap; }
.sum-extract-summary { opacity: 0.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sum-version-info { display: flex; gap: 6px; align-items: center; }
.sum-version-num { font-weight: 600; }
.sum-version-tag { font-size: 9px; padding: 0 4px; border-radius: 3px; background: rgba(128,128,128,0.08); }
.sum-version-range { opacity: 0.4; }
.sum-version-meta { opacity: 0.25; }
.sum-rollback-btn { padding: 2px 8px; border: 1px solid rgba(240,160,20,0.3); border-radius: 4px; background: transparent; color: #f0a020; cursor: pointer; font-size: 10px; font-family: inherit; }
.sum-rollback-btn:hover { background: rgba(240,160,20,0.06); }
.sum-model-menu { position: absolute; top: 100%; left: 80px; background: #2a2a35; border: 1px solid rgba(128,128,128,0.2); border-radius: 8px; padding: 4px; min-width: 200px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); z-index: 50; }
.sum-model-opt { display: block; width: 100%; padding: 6px 12px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; text-align: left; }
.sum-model-opt:hover { background: rgba(128,128,128,0.1); }
.sum-model-opt.active { background: rgba(46,168,106,0.15); color: #2ea86a; }
.sum-theme-light .sum-model-menu { background: #fff; border-color: rgba(0,0,0,0.1); }
.sum-template-select { }
.sum-select { padding: 3px 8px; border: 1px solid rgba(128,128,128,0.15); border-radius: 6px; background: transparent; color: inherit; font-size: 11px; font-family: inherit; cursor: pointer; }

/* Metadata review */
.sum-meta-row { margin: 8px 0; padding: 8px; border-radius: 8px; background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.06); }
.sum-meta-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.sum-meta-label { font-size: 12px; font-weight: 600; min-width: 60px; }
.sum-meta-current { font-size: 10px; opacity: 0.4; margin-bottom: 4px; display: flex; align-items: baseline; gap: 4px; }
.sum-meta-text { font-style: italic; }
.sum-meta-textarea {
  width: 100%; padding: 6px 8px; font-size: 11px; font-family: inherit; line-height: 1.5;
  background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.1); border-radius: 6px;
  color: inherit; outline: none; resize: vertical; box-sizing: border-box;
}
.sum-meta-textarea:focus { border-color: rgba(46,168,106,0.4); }
.sum-meta-textarea.accepted { border-color: rgba(46,168,106,0.3); background: rgba(46,168,106,0.04); }
.sum-meta-textarea:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
