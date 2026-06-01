<template>
  <Teleport to="body">
    <div v-if="visible" class="ba-overlay" @click.self="visible = false">
      <div class="ba-root" :class="isDark ? 'ba-dark' : 'ba-light'">
        <!-- Header -->
        <header class="ba-header">
          <div class="ba-header-left">
            <h1 class="ba-title">AI 拆书 · {{ props.workTitle || '当前作品' }}</h1>
            <p class="ba-subtitle">{{ chapterIndexText }} · {{ selectedCount }} 章已选</p>
          </div>
          <div class="ba-header-right">
            <span class="ba-cost">预估 {{ estimatedCost }} 灵石</span>
            <button class="ba-btn-outline" @click="syncChapters">同步章节</button>
            <button class="ba-close" @click="visible = false">✕</button>
          </div>
        </header>

        <div class="ba-body">
          <!-- 左：章节列表 -->
          <aside class="ba-left">
            <div class="ba-left-toolbar">
              <span class="ba-section-label">目录 <span class="ba-count">{{ chapters.length }}</span></span>
              <span class="ba-section-hint">已选 {{ selectedCount }}</span>
              <div class="ba-chapter-actions">
                <button class="ba-btn-sm primary" @click="selectRange">范围选择</button>
                <button class="ba-btn-sm" @click="selectedIds = []">清空</button>
                <button class="ba-btn-sm" @click="selectFirstN(3)">前3章</button>
                <button class="ba-btn-sm" @click="selectAll">全选</button>
              </div>
              <input class="ba-search" v-model="chapterSearch" placeholder="搜索章节" />
            </div>
            <div class="ba-chapter-list">
              <div v-for="ch in filteredChapters" :key="ch.id"
                class="ba-chapter-item" :class="{ selected: selectedIds.includes(ch.id) }"
                @click="toggleChapter(ch.id)">
                <span class="ba-chapter-dot"></span>
                <div class="ba-chapter-info">
                  <span class="ba-chapter-title">{{ ch.title }}</span>
                  <span class="ba-chapter-meta">正文 {{ ch.wordCount }}</span>
                </div>
              </div>
              <div v-if="!filteredChapters.length" class="ba-empty">暂无章节</div>
            </div>
          </aside>

          <!-- 中：结果区 -->
          <main class="ba-center">
            <div class="ba-toolbar">
              <span class="ba-toolbar-title">本次拆书结果</span>
              <span class="ba-toolbar-meta">{{ outputLength }} 字</span>
              <div class="ba-toolbar-right">
                <button class="ba-btn-sm" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">预览</button>
                <button class="ba-btn-sm" :class="{ active: viewMode === 'edit' }" @click="viewMode = 'edit'">编辑</button>
                <button class="ba-btn-sm primary" @click="startAnalyze('chapter')">分章拆</button>
                <button class="ba-btn-sm" @click="startAnalyze('merged')">合并拆</button>
                <button class="ba-btn-cta" @click="startAnalyze(currentMode)" :disabled="!selectedCount || isRunning">
                  {{ isRunning ? '拆书中...' : '▶ 开始拆书' }}
                </button>
              </div>
            </div>
            <div class="ba-content">
              <div v-if="!output" class="ba-placeholder">
                <p>拆书结果会以 Markdown 格式展示在这里</p>
                <p class="ba-hint">选中章节后点击「开始拆书」，生成中会实时流式刷新，完成后可切到"编辑"修改原文。</p>
              </div>
              <div v-else-if="viewMode === 'edit'" class="ba-editor-wrap">
                <textarea class="ba-editor" v-model="output" placeholder="拆书结果（可编辑）..."></textarea>
              </div>
              <div v-else class="ba-preview" v-html="renderedOutput"></div>
            </div>
            <div class="ba-statusbar">
              <span>字数 {{ outputLength }} 字 · 自动保存到本地拆书历史</span>
              <span>实际扣费以生成完成后的结算为准</span>
            </div>
          </main>

          <!-- 右：配置 -->
          <aside class="ba-right">
            <div class="ba-config-card">
              <h3 class="ba-config-title">拆书配置</h3>

              <!-- 策略选择 -->
              <button class="ba-selector" @click="showPromptModal = true">
                <span class="ba-selector-icon">✨</span>
                <div class="ba-selector-info">
                  <span class="ba-selector-name">{{ selectedStrategy.name }}</span>
                </div>
                <span class="ba-selector-arrow">▾</span>
              </button>

              <!-- 模型选择 -->
              <button class="ba-selector" @click="showModelModal = true">
                <span class="ba-selector-icon">⚙</span>
                <div class="ba-selector-info">
                  <span class="ba-selector-name">{{ selectedModel }}</span>
                </div>
                <span class="ba-selector-arrow">▾</span>
              </button>

              <!-- 消耗预估 -->
              <div class="ba-cost-card">
                <div class="ba-cost-row">
                  <span>输入消耗预估</span>
                  <span class="ba-cost-val">约 {{ estimatedCost }} 灵石</span>
                </div>
                <p class="ba-cost-hint">已选 {{ selectedCount }} 章 · 仅估算输入侧消耗。</p>
              </div>

              <!-- 补充需求 -->
              <div class="ba-config-section">
                <h4 class="ba-config-subtitle">补充需求</h4>
                <textarea class="ba-textarea" v-model="extraReq" rows="3" placeholder="可选：补充分析要求..."></textarea>
              </div>

              <!-- 快捷操作 -->
              <div class="ba-actions">
                <button class="ba-btn-sm" @click="copyOutput">复制</button>
                <button class="ba-btn-sm" @click="exportTxt">TXT</button>
                <button class="ba-btn-sm" @click="saveToNotes">保存笔记</button>
              </div>
            </div>
          </aside>
        </div>

        <!-- 策略选择弹窗 -->
        <div v-if="showPromptModal" class="ba-modal-overlay" @click.self="showPromptModal = false">
          <div class="ba-modal">
            <h3>选择拆书策略</h3>
            <div class="ba-modal-list">
              <div v-for="s in strategies" :key="s.name" class="ba-modal-item"
                :class="{ active: selectedStrategy.name === s.name }"
                @click="selectedStrategy = s; showPromptModal = false">
                <span class="ba-modal-item-name">{{ s.name }}</span>
                <span class="ba-modal-item-desc">{{ s.desc }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型选择弹窗 -->
        <div v-if="showModelModal" class="ba-modal-overlay" @click.self="showModelModal = false">
          <div class="ba-modal">
            <h3>选择模型</h3>
            <div class="ba-modal-list">
              <div v-for="m in models" :key="m" class="ba-modal-item"
                :class="{ active: selectedModel === m }"
                @click="selectedModel = m; showModelModal = false">
                <span class="ba-modal-item-name">{{ m }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useLLM } from '../composables/useLLM'
import { countWords } from '../composables/useDatabase'
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'
import { useWorkStore } from '../stores/workStore'

const props = defineProps<{
  isDark?: boolean
  workTitle?: string
  chapters?: { id: string; title: string; wordCount: string; content?: string }[]
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const msg = useMessage()
const visible = ref(false)
const selectedIds = ref<string[]>([])
const chapterSearch = ref('')
const viewMode = ref<'preview' | 'edit'>('preview')
const currentMode = ref<'chapter' | 'merged'>('chapter')
const output = ref('')
const extraReq = ref('')
const isRunning = ref(false)
const showPromptModal = ref(false)
const showModelModal = ref(false)

const chapters = ref<{ id: string; title: string; wordCount: string; content?: string }[]>([])
watch(() => props.chapters, (val) => { if (val) chapters.value = [...val] }, { immediate: true })
const filteredChapters = computed(() => {
  if (!chapterSearch.value) return chapters.value
  const q = chapterSearch.value.toLowerCase()
  return chapters.value.filter(c => c.title.toLowerCase().includes(q))
})
const selectedCount = computed(() => selectedIds.value.length)

const strategies = [
  { name: '官方-拆书提取剧情 1.0', desc: '提取剧情脉络和结构分析，支持分章拆/合并拆两种模式' },
  { name: '深度人物分析', desc: '逐章分析人物弧光、动机变化、关系网络' },
  { name: '节奏与冲突分析', desc: '分析章节节奏曲线、冲突强度、爽点密度' },
  { name: '写作技巧拆解', desc: '分析句式结构、对话设计、描写手法' },
]
const selectedStrategy = ref(strategies[0])

const models = ['吉皮特5.5 · 灵感大师', 'DeepSeek V3', '千问-Max', '豆包-Pro']
const selectedModel = ref(models[0])

const chapterIndexText = computed(() => {
  if (!chapters.value.length) return ''
  const sel = chapters.value.filter(c => selectedIds.value.includes(c.id))
  if (!sel.length) return `第1-${chapters.value.length}章`
  const indices = sel.map(c => chapters.value.indexOf(c)).filter(i => i >= 0).sort((a, b) => a - b)
  return indices.length ? `第${indices[0] + 1}-${indices[indices.length - 1] + 1}章` : `第1-${chapters.value.length}章`
})

const estimatedCost = computed(() => {
  const selChs = chapters.value.filter(c => selectedIds.value.includes(c.id))
  const totalChars = selChs.reduce((sum, c) => {
    const wc = parseInt(c.wordCount.replace(/[^0-9]/g, '') || '0')
    return sum + wc
  }, 0)
  return Math.max(1, Math.ceil(totalChars / 1000 * 3))
})

const outputLength = computed(() => countWords(output.value))

const renderedOutput = computed(() => {
  const escaped = output.value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br>').replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>')
})

function toggleChapter(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function selectRange() {
  const range = window.prompt?.('输入章节范围，如 1-3', '1-3')
  if (!range) return
  const [s, e] = range.split('-').map(Number)
  if (!s || !e) return
  selectedIds.value = chapters.value.slice(s - 1, e).map(c => c.id)
}

function selectFirstN(n: number) {
  selectedIds.value = chapters.value.slice(0, n).map(c => c.id)
}

function selectAll() {
  selectedIds.value = chapters.value.map(c => c.id)
}

function syncChapters() {
  msg.info('已同步最新章节列表')
}

async function startAnalyze(mode: 'chapter' | 'merged') {
  if (!selectedCount.value) { msg.warning('请先选择章节'); return }
  currentMode.value = mode
  isRunning.value = true
  output.value = ''

  const selChs = chapters.value.filter(c => selectedIds.value.includes(c.id))
  const chapterTitles = selChs.map(c => c.title).join('、')

  // 读取作品设定
  let wsCtx = ''
  try {
    const wid = useWorkStore().currentWorkId
    const ws = new WorkspaceSettings(wid || 0)
    const d = ws.data
    const parts: string[] = []
    if (d.title) parts.push(`书名：${d.title}`)
    if (d.genre) parts.push(`类型：${d.genre}`)
    if (d.tags?.length) parts.push(`标签：${d.tags.join('、')}`)
    if (d.intro) parts.push(`简介：${d.intro}`)
    if (d.worldSetting) parts.push(`世界观：${d.worldSetting}`)
    if (d.mainCharacter) parts.push(`主角：${d.mainCharacter}`)
    if (parts.length) wsCtx = '\n【作品信息】\n' + parts.join('\n')
  } catch {}

  const modeHint = mode === 'chapter'
    ? '请对每一章进行独立分析，输出各章的剧情脉络、人物发展、冲突节点。'
    : '请对所有选中章节进行综合分析，输出整体剧情脉络、人物弧光、结构技巧。'

  const { generate } = useLLM()
  try {
    const result = await generate({
      systemPrompt: `你是专业的小说拆书分析师。使用策略：${selectedStrategy.value.name}。${modeHint}${wsCtx}`,
      userPrompt: `拆书章节：${chapterTitles}\n补充要求：${extraReq.value || '无'}`,
      extraContext: selChs.map(c => c.content || '').join('\n---\n').slice(0, 50000),
    })
    output.value = result || '生成失败：未收到 AI 响应'
  } catch {
    output.value = '生成失败：请检查模型配置和API Key'
  }
  isRunning.value = false
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => msg.success('已复制')).catch(() => {})
}

function exportTxt() {
  if (!output.value) return
  const blob = new Blob([output.value], { type: 'text/plain' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = `拆书结果_${new Date().toISOString().slice(0,10)}.txt`; a.click()
}

function saveToNotes() {
  if (!output.value) { msg.warning('无内容可保存'); return }
  msg.success('已保存到笔记')
}

function open(chs?: { id: string; title: string; wordCount: string; content?: string }[]) {
  if (chs) {
    chapters.value = chs
    selectedIds.value = chs.slice(0, 3).map(c => c.id)
  }
  visible.value = true
}

defineExpose({ open })
</script>

<style scoped>
.ba-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.ba-root { width: 95vw; max-width: 1400px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
.ba-dark { background: #1c1c22; color: #d4d4d4; }
.ba-light { background: #fff; color: #1a1a1a; }

.ba-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }
.ba-header-left { min-width: 0; }
.ba-title { font-size: 16px; font-weight: 700; margin: 0; }
.ba-subtitle { font-size: 11px; opacity: 0.4; margin: 2px 0 0; }
.ba-header-right { display: flex; align-items: center; gap: 10px; }
.ba-cost { font-size: 12px; padding: 3px 10px; border-radius: 12px; background: rgba(46,168,106,0.1); color: #2ea86a; }
.ba-btn-outline { padding: 4px 12px; border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; }
.ba-btn-outline:hover { background: rgba(128,128,128,0.06); }
.ba-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; display: flex; align-items: center; justify-content: center; }

.ba-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* Left */
.ba-left { width: 260px; flex-shrink: 0; border-right: 1px solid rgba(128,128,128,0.08); display: flex; flex-direction: column; background: rgba(128,128,128,0.02); }
.ba-left-toolbar { padding: 12px; border-bottom: 1px solid rgba(128,128,128,0.06); display: flex; flex-direction: column; gap: 6px; }
.ba-section-label { font-size: 13px; font-weight: 600; }
.ba-count { color: #2ea86a; font-size: 12px; }
.ba-section-hint { font-size: 10px; opacity: 0.4; }
.ba-chapter-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.ba-btn-sm { padding: 3px 10px; border: 1px solid rgba(128,128,128,0.15); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; }
.ba-btn-sm:hover { background: rgba(128,128,128,0.06); }
.ba-btn-sm.primary { background: #2ea86a; color: #fff; border-color: #2ea86a; }
.ba-btn-sm.primary:hover { background: #258d58; }
.ba-btn-sm.active { background: rgba(46,168,106,0.1); color: #2ea86a; border-color: rgba(46,168,106,0.3); }
.ba-btn-cta { padding: 4px 16px; border: none; border-radius: 8px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 12px; font-family: inherit; font-weight: 600; }
.ba-btn-cta:hover:not(:disabled) { background: #258d58; }
.ba-btn-cta:disabled { opacity: 0.4; cursor: not-allowed; }
.ba-search { width: 100%; padding: 5px 10px; border: 1px solid rgba(128,128,128,0.1); border-radius: 6px; background: transparent; color: inherit; font-size: 11px; font-family: inherit; outline: none; box-sizing: border-box; }
.ba-search:focus { border-color: rgba(46,168,106,0.4); }
.ba-chapter-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.ba-chapter-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-size: 12px; }
.ba-chapter-item:hover { background: rgba(128,128,128,0.04); }
.ba-chapter-item.selected { background: rgba(46,168,106,0.06); border-color: rgba(46,168,106,0.2); }
.ba-chapter-dot { width: 6px; height: 6px; border-radius: 50%; background: #eab308; flex-shrink: 0; }
.ba-chapter-item.selected .ba-chapter-dot { background: #2ea86a; }
.ba-chapter-info { min-width: 0; }
.ba-chapter-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-chapter-meta { font-size: 10px; opacity: 0.35; }
.ba-empty { text-align: center; padding: 30px; opacity: 0.3; font-size: 12px; }

/* Center */
.ba-center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ba-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid rgba(128,128,128,0.08); flex-shrink: 0; }
.ba-toolbar-title { font-size: 13px; font-weight: 600; }
.ba-toolbar-meta { font-size: 10px; opacity: 0.35; margin-right: auto; }
.ba-toolbar-right { display: flex; gap: 4px; }
.ba-content { flex: 1; overflow-y: auto; padding: 20px 28px; }
.ba-placeholder { text-align: center; padding: 60px 0; opacity: 0.35; }
.ba-placeholder p { margin: 4px 0; }
.ba-hint { font-size: 11px; opacity: 0.5; }
.ba-editor-wrap { height: 100%; }
.ba-editor { width: 100%; height: 100%; min-height: 400px; padding: 20px; border: none; outline: none; background: transparent; color: inherit; font-size: 14px; font-family: 'SF Mono', 'Cascadia Code', monospace; line-height: 1.6; resize: none; }
.ba-editor:focus { background: rgba(128,128,128,0.02); }
.ba-preview { font-size: 14px; line-height: 1.8; }
.ba-preview :deep(h1) { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
.ba-preview :deep(h2) { font-size: 1.2em; font-weight: 600; margin: 0.4em 0; }
.ba-preview :deep(h3) { font-size: 1.05em; font-weight: 600; }
.ba-preview :deep(ul), .ba-preview :deep(ol) { padding-left: 1.5em; }
.ba-preview :deep(li) { margin: 0.2em 0; }
.ba-preview :deep(strong) { font-weight: 700; }
.ba-preview :deep(em) { font-style: italic; }
.ba-preview :deep(hr) { border: none; border-top: 1px solid rgba(128,128,128,0.2); margin: 1em 0; }
.ba-statusbar { display: flex; justify-content: space-between; padding: 6px 16px; border-top: 1px solid rgba(128,128,128,0.08); font-size: 10px; opacity: 0.35; flex-shrink: 0; }

/* Right */
.ba-right { width: 280px; flex-shrink: 0; border-left: 1px solid rgba(128,128,128,0.08); overflow-y: auto; padding: 14px; }
.ba-config-card { display: flex; flex-direction: column; gap: 10px; }
.ba-config-title { font-size: 13px; font-weight: 600; margin: 0; }
.ba-config-subtitle { font-size: 12px; font-weight: 600; margin: 0 0 4px; }
.ba-selector { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px; border: 1px solid rgba(128,128,128,0.1); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-family: inherit; text-align: left; }
.ba-selector:hover { border-color: rgba(46,168,106,0.3); background: rgba(46,168,106,0.02); }
.ba-selector-icon { font-size: 16px; flex-shrink: 0; }
.ba-selector-info { flex: 1; min-width: 0; }
.ba-selector-name { font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ba-selector-arrow { opacity: 0.3; }
.ba-cost-card { padding: 10px 12px; border-radius: 8px; background: rgba(46,168,106,0.04); border: 1px solid rgba(46,168,106,0.1); }
.ba-cost-row { display: flex; justify-content: space-between; font-size: 12px; color: #2ea86a; }
.ba-cost-val { font-weight: 700; }
.ba-cost-hint { font-size: 10px; opacity: 0.5; margin: 4px 0 0; }
.ba-config-section { }
.ba-textarea { width: 100%; padding: 6px 10px; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.03); border: 1px solid rgba(128,128,128,0.1); border-radius: 6px; color: inherit; outline: none; resize: vertical; box-sizing: border-box; }
.ba-actions { display: flex; gap: 4px; }

/* Modals */
.ba-modal-overlay { position: fixed; inset: 0; z-index: 10020; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; }
.ba-modal { width: 420px; max-height: 60vh; background: #fff; border-radius: 12px; padding: 20px; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
.ba-dark .ba-modal { background: #1c1c22; color: #d4d4d4; }
.ba-modal h3 { margin: 0 0 12px; font-size: 15px; }
.ba-modal-list { display: flex; flex-direction: column; gap: 4px; }
.ba-modal-item { padding: 10px 12px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; }
.ba-modal-item:hover { background: rgba(128,128,128,0.04); }
.ba-modal-item.active { border-color: rgba(46,168,106,0.3); background: rgba(46,168,106,0.06); }
.ba-modal-item-name { font-size: 13px; font-weight: 500; display: block; }
.ba-modal-item-desc { font-size: 11px; opacity: 0.4; }
</style>
