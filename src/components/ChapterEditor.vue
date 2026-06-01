<template>
  <div class="ce-root">
    <!-- 顶部 -->
    <div class="ce-topbar">
      <span class="ce-breadcrumb">工作台</span><span class="ce-breadcrumb-sep">|</span>
      <span class="ce-breadcrumb active">作品目录</span>
      <div class="ce-topbar-right">
        <button class="ce-icon-btn" @click="reloadChapter" title="刷新"><n-icon size="16"><RefreshOutline /></n-icon></button>
        <button class="ce-icon-btn" @click="markComplete" title="标记完成"><n-icon size="16"><CheckmarkOutline /></n-icon></button>
      </div>
    </div>

    <!-- AI 工具栏 -->
    <div class="ce-ai-bar">
      <button v-for="a in aiActions" :key="a.key" class="ce-ai-btn" @click="triggerAi(a.key)">{{ a.label }}</button>
    </div>

    <!-- 章节标题 -->
    <div class="ce-title-bar">
      <span class="ce-chapter-no">{{ chapterIndexText }}</span>
      <input class="ce-title-input" v-model="editTitle" name="chapterTitle" placeholder="输入章节标题" @blur="saveTitle" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
      <button class="ce-ai-title-btn" @click="triggerAi('optimizeTitle')">✨ 优化标题</button>
    </div>

    <!-- 编辑工具 -->
    <div class="ce-toolbar">
      <button class="ce-tool-btn" @click="showReplace = true">🔄 替换</button>
      <button class="ce-tool-btn" @click="showWordFreq = true">📊 高频词</button>
      <button class="ce-tool-btn" @click="findBar = !findBar">🔍 查找</button>
      <span class="ce-tool-sep"></span>
      <button class="ce-tool-btn" @click="copyTitle">📋 复制标题</button>
      <button class="ce-tool-btn" @click="copyBody">📄 复制正文</button>
      <span class="ce-tool-sep"></span>
      <button class="ce-tool-btn" @click="smartFormat">✨ 排版</button>
      <button class="ce-tool-btn danger" @click="clearContent">🗑 清空</button>
      <span class="ce-tool-sep"></span>
      <button class="ce-tool-btn" @click="openHighlightPanel">🖍 高亮管理</button>
      <span class="ce-word-count">字数 {{ formattedWordCount }}</span>
    </div>

    <!-- 查找 -->
    <div v-if="findBar" class="ce-find-bar">
      <input class="ce-find-input" v-model="findText" name="findText" placeholder="查找..." @input="updateFind" @keydown.enter="findNext" />
      <span v-if="findText" class="ce-find-count">{{ findResults.length > 0 ? `${currentFind + 1}/${findResults.length}` : '0' }}</span>
      <button class="ce-find-nav" @click="findPrev" :disabled="!findResults.length">↑</button>
      <button class="ce-find-nav" @click="findNext" :disabled="!findResults.length">↓</button>
      <input class="ce-find-input" v-model="replaceText" name="replaceText" placeholder="替换为..." @keydown.enter="replaceOne" />
      <button class="ce-find-btn" @click="replaceOne" :disabled="!findResults.length">替换</button>
      <button class="ce-find-btn warn" @click="replaceAll" :disabled="!findResults.length">全部</button>
    </div>

    <!-- 编辑区 -->
    <div class="ce-editor">
      <div v-if="!chapter" class="ce-empty">← 从左侧目录选择章节开始编辑</div>
      <div v-else class="ce-editor-wrap">
        <div class="ce-hl-bar">
          <div v-for="hl in hlMgr.list()" :key="hl.id" class="ce-hl-mark"
            :style="{ background: hl.color, top: getHighlightLinePosition(hl.start, bodyContent) + '%' }"
            :title="hl.text.slice(0, 50)"
            @click="goToHighlight(hl)"
          ></div>
        </div>
        <div class="ce-textarea-stack">
          <div class="ce-hl-overlay" ref="hlOverlay" aria-hidden="true" :style="{ willChange: 'scroll-position' }">
            <span v-for="(seg,i) in highlightedSegments" :key="i"
              :style="seg.style"
            >{{ seg.text }}</span>
          </div>
          <div
            ref="editorEl"
            class="ce-textarea"
            contenteditable="true"
            data-placeholder="开始撰写本章内容..."
            @input="onContentEditableInput"
            @keydown="onKeydownCE"
            @paste="onPasteCE"
            @mouseup="onSelectionChange"
            @keyup="onSelectionChange"
            @scroll="syncOverlayScroll"
          ></div>
        </div>
      </div>
    </div>


    <!-- 底部 -->
    <div class="ce-statusbar">
      <span>字数 {{ formattedWordCount }} · {{ saveLabel }}</span>
      <div class="ce-status-actions">
        <button class="ce-status-btn" title="在平台发布" @click="emit('publish')">↗ 发布</button>
        <button class="ce-status-btn" title="导出为 TXT" @click="exportTxt">⬇ 导出</button>
      </div>
    </div>

    <!-- 替换弹窗 -->
    <Teleport to="body" v-if="showReplace">
      <div class="ce-sp-overlay" @click.self="showReplace = false">
        <div class="ce-sp-root" :class="props.isDark === false ? 'ce-theme-light' : 'ce-theme-dark'">
          <div class="ce-sp-header"><span class="ce-sp-title">替换</span><button class="ce-sp-close" @click="showReplace = false">✕</button></div>
          <p class="ce-sp-desc">支持替换当前正文。建议先查找定位再应用。</p>
          <div class="ce-sp-body">
            <div class="ce-sp-field"><label>查找</label><input class="ce-sp-input" v-model="replaceFindText" placeholder="输入要查找的文本" /></div>
            <div class="ce-sp-field"><label>替换为</label><input class="ce-sp-input" v-model="replaceToText" placeholder="输入替换文本" /></div>
            <div class="ce-sp-row"><span class="ce-sp-label">替换范围</span>
              <select class="ce-sp-input" v-model="replaceScope" style="width:auto"><option>当前正文</option></select>
            </div>
            <div class="ce-sp-row"><label class="ce-check"><input type="checkbox" v-model="replaceUseRegex" /> 使用正则</label></div>
            <div class="ce-sp-row" v-if="replaceRules.length">
              <span class="ce-sp-label">规则列表（{{ replaceRules.length }} 条）</span>
              <button class="ce-tool-btn" @click="replaceRules = []">清空</button>
            </div>
            <div v-for="(r,i) in replaceRules" :key="i" class="ce-sp-row"><span>{{ r.find }} → {{ r.replace }}</span><button class="ce-tool-btn danger" @click="replaceRules.splice(i,1)">✕</button></div>
            <div class="ce-sp-row"><button class="ce-tool-btn" @click="addReplaceRule" :disabled="!replaceFindText">加入规则</button></div>
          </div>
          <div class="ce-sp-bottom">
            <button class="ce-sp-cancel-btn" @click="showReplace = false">取消</button>
            <button class="ce-sp-gen-btn" @click="doReplaceAll" :disabled="!replaceFindText && !replaceRules.length">开始替换</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 高频词弹窗 -->
    <Teleport to="body" v-if="showWordFreq">
      <div class="ce-sp-overlay" @click.self="showWordFreq = false">
        <div class="ce-sp-root" :class="props.isDark === false ? 'ce-theme-light' : 'ce-theme-dark'">
          <div class="ce-sp-header"><span class="ce-sp-title">高频词设置</span><button class="ce-sp-close" @click="showWordFreq = false">✕</button></div>
          <p class="ce-sp-desc">添加需要高亮的高频词。支持正则表达式。</p>
          <div class="ce-sp-body">
            <div class="ce-sp-row"><button class="ce-switch-btn" :class="{on:wordFreqEnabled}" @click="wordFreqEnabled=!wordFreqEnabled"><span class="ce-switch-knob" :class="{on:wordFreqEnabled}"></span></button><span>启用高亮</span></div>
            <div class="ce-sp-field"><label>添加高频词</label><div class="ce-sp-row"><input class="ce-sp-input" v-model="newWordFreq" placeholder="例如：天才、忽然、他{0,2}想" @keydown.enter="addWordFreq" /><button class="ce-tool-btn" @click="addWordFreq">添加</button></div></div>
            <div v-if="wordFreqList.length" class="ce-tags"><span v-for="(w,i) in wordFreqList" :key="i" class="ce-tag">{{ w }}<button @click="wordFreqList.splice(i,1)">✕</button></span></div>
            <p v-else class="ce-hint">暂无高频词，请在下方添加</p>
            <div class="ce-hint-box">
              <p>正则表达式使用说明：</p>
              <p>1) 支持普通词：例如「天才」「忽然」</p>
              <p>2) 支持量词：例如「他{0,2}想」</p>
              <p>3) 支持分组：例如「(忽然|突然)」</p>
              <p>4) 多条规则可用逗号或换行分隔</p>
              <p>内置高亮规则：英文字母与半角符号</p>
            </div>
            <button class="ce-tool-btn" @click="smartPolishAll">智能润色全文</button>
          </div>
          <div class="ce-sp-bottom"><button class="ce-sp-cancel-btn" @click="showWordFreq = false">取消</button></div>
        </div>
      </div>
    </Teleport>

    <!-- 选中文字工具栏 -->
    <SelectionToolbar
      ref="selToolbar"
      :is-dark="props.isDark"
      @copy="copySelection"
      @highlight="highlightSelection"
      @unhighlight="unhighlightSelection"
      @rewrite="openSelectionAction('rewrite')"
      @expand="openSelectionAction('expand')"
      @continue="openSelectionAction('continue')"
      @summarize="openSelectionAction('summarize')"
    />

    <!-- AI 弹窗 -->
    <AiModal
      v-if="aiModal.visible && aiModal.type === 'standard'"
      :is-dark="isDark"
      :title="aiModal.title" :description="aiModal.desc" :target-label="aiModal.target"
      :write-label="aiModal.write" :chapter-label="chapterLabel" :mode="aiModal.mode"
      :show-gen-count="aiModal.showGenCount" :show-note-count="aiModal.showNoteCount"
      :template-name="aiModal.templateName" :template-desc="aiModal.templateDesc"
      :platform-id="platformId" :default-extra-prompt="aiModal.defaultExtraPrompt"
      :context-switches="aiModal.contextSwitches" :special-switches="aiModal.specialSwitches"
      :use-workflow="aiModal.useWorkflow" :chapter-count="aiModal.chapterCount"
      :max-chapters="aiModal.maxChapters" :field="aiModal.field"
      :default-range-start="aiModal.rangeStart" :default-range-end="aiModal.rangeEnd"
      @close="aiModal.visible = false" @write="onAiWrite" @start="onApprovalStart"
    />

    <!-- 短篇创作弹窗 -->
    <ShortStoryModal
      :visible="shortStoryModalVisible"
      :is-dark="isDark"
      @close="shortStoryModalVisible = false"
      @generate="onShortStoryGenerate"
    />

    <!-- 短篇生成审阅弹窗（独立闭环，不走 agent 管线） -->
    <ShortStoryReviewModal
      :visible="reviewModal.visible"
      :platform-id="reviewModal.platformId"
      :tag-set="reviewModal.tagSet"
      :word-count="reviewModal.wordCount"
      :extra="reviewModal.extra"
      :is-dark="isDark"
      @close="reviewModal.visible = false"
      @approve="handleShortStoryApprove"
    />

    <!-- 优化标题 -->
    <Teleport to="body" v-if="showOptimizeTitle">
      <div class="ce-sp-overlay" @click.self="showOptimizeTitle = false">
        <div class="ce-sp-root" :class="props.isDark === false ? 'ce-theme-light' : 'ce-theme-dark'">
          <div class="ce-sp-header"><span class="ce-sp-title">AI 标题优化</span><button class="ce-sp-close" @click="showOptimizeTitle = false">✕</button></div>
          <p class="ce-sp-desc">根据当前正文和平台风格生成爆款标题</p>
          <div class="ce-sp-body">
            <div class="ce-sp-row"><span class="ce-sp-label">目标平台</span><input class="ce-sp-input" v-model="otPlatform" placeholder="例如：番茄 / 起点" :disabled="otGenerating" /></div>
            <div class="ce-sp-row"><span class="ce-sp-label">标题字数</span><input class="ce-sp-input sm" type="number" v-model.number="otTitleLen" :disabled="otGenerating" /></div>
            <div class="ce-sp-row"><span class="ce-sp-label">参考标题</span><textarea class="ce-sp-textarea" v-model="otRefTitles" rows="2" placeholder="粘贴爆款标题参考…" :disabled="otGenerating"></textarea></div>
            <div class="ce-sp-row"><span class="ce-sp-label">生成数量</span><input class="ce-sp-input sm" type="number" v-model.number="otCount" :disabled="otGenerating" /></div>

            <!-- 加载状态 -->
            <div v-if="otGenerating" class="ce-sp-loading">
              <div class="ce-sp-spinner"></div>
              <p>AI 正在生成标题方案…</p>
            </div>

            <!-- 错误 -->
            <div v-if="otError" class="ce-sp-error">{{ otError }}</div>

            <!-- 结果列表 -->
            <div v-if="otTitles.length > 0 && !otGenerating" class="ce-sp-results">
              <p class="ce-sp-results-hint">点击标题可直接替换当前章节标题（共 {{ otTitles.length }} 个方案）</p>
              <button
                v-for="(t, i) in otTitles"
                :key="i"
                class="ce-sp-title-opt"
                @click="applyOptimizedTitle(t)"
              >{{ t }}</button>
            </div>
          </div>
          <div class="ce-sp-bottom">
            <button class="ce-sp-cancel-btn" @click="showOptimizeTitle = false">取消</button>
            <button
              v-if="otTitles.length > 0 && !otGenerating"
              class="ce-sp-gen-btn"
              @click="genOptimizeTitle"
            >重新生成</button>
            <button
              v-else
              class="ce-sp-gen-btn"
              @click="genOptimizeTitle"
              :disabled="otGenerating || !bodyContent.trim()"
            >{{ otGenerating ? '生成中…' : '生成' }}</button>
          </div>
        </div>
      </div>
    </Teleport>


    <!-- 拆书 -->
    <BookAnalyzer ref="bookAnalyzer" :is-dark="props.isDark" :chapters="analysisChapters" @close="(bookAnalyzer as any)?.close?.()" />

    <!-- 设定更新 -->
    <SettingsUpdateModal
      v-if="showSettingsUpdateModal"
      :is-dark="props.isDark" @close="showSettingsUpdateModal = false" @rollback="onSettingsRollback"
    />

    <!-- 高亮管理弹窗（Teleport） -->
    <HighlightPanel
      ref="hlPanelRef"
      :is-dark="props.isDark"
      @go-to="goToHighlight" @remove="removeHighlightById"
      @change-color="changeHighlightColor" @clear-all="clearAllHighlights"
      @update-category="onHighlightUpdateCategory"
      @regex-rules-changed="onRegexRulesChanged"
      @syntax-rules-changed="onSyntaxRulesChanged"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue'
import { NIcon, useMessage } from 'naive-ui'
import { RefreshOutline, CheckmarkOutline } from '@vicons/ionicons5'
import AiModal, { type ContextSwitch } from './AiModal.vue'
import ShortStoryModal from './ShortStoryModal.vue'
import ShortStoryReviewModal from './ShortStoryReviewModal.vue'
import SelectionToolbar from './SelectionToolbar.vue'
import HighlightPanel from './HighlightPanel.vue'
import SettingsUpdateModal from './SettingsUpdateModal.vue'
import BookAnalyzer from './BookAnalyzer.vue'
import { getTemplate } from '../composables/useTemplates'
import { useLLM } from '../composables/useLLM'
import { SettingsManager } from '../composables/useSettings'
import { StateKeeperVersionManager } from '../composables/useStateKeeper'
import { getOutline, upsertOutline } from '../composables/useOutlines'
import { updateChapterContent, updateChapterTitle, countWords } from '../composables/useDatabase'
import { GENRE_LABELS } from '../composables/usePlatformTags'
import { useWorkStore } from '../stores/workStore'
import { showConfirm } from '../composables/useConfirm'
import { isTauri, localCurrentChapterId, localCurrentWorkId, localChapterMap, localUpdateChapterContent, localRenameChapter } from '../composables/useLocalWorkTree'
import { useWorkRepo } from '../composables/useWorkRepo'
import { useHighlights, loadHighlightRegexRules, getHighlightLinePosition } from '../composables/useHighlights'
import { computeHighlights, loadRules, injectEntityPatterns, getManualHighlightColor, type SyntaxRule, type CustomRegexRule, type EntityNames } from '../composables/useSyntaxHighlight'
import type { Chapter } from '../composables/useDatabase'

const props = defineProps<{ isDark?: boolean; platformId?: string | null; settingsMgr?: SettingsManager; settingsVersion?: number }>()
const emit = defineEmits<{ (e: 'ai-action', action: string): void; (e: 'save-status-change', status: 'saved' | 'saving' | 'unsaved'): void; (e: 'open-inspire-modal'): void; (e: 'publish'): void }>()
const message = useMessage()
const tauri = isTauri()
const platformId = computed(() => props.platformId || null)
const store = tauri ? useWorkStore() : null

const aiActions = [
  { key: 'opening', label: '开篇' }, { key: 'continue', label: '✏️ 续写' }, { key: 'optimize', label: '✨ 优化' },
  { key: 'unmark', label: '🔥 消痕' }, { key: 'review', label: '📝 审稿' }, { key: 'polish', label: '✨ 润色' },
  { key: 'comment', label: '✨ 神评' }, { key: 'analyze', label: '📖 拆书' }, { key: 'rewrite', label: '🔄 重写' },
  { key: 'inspire', label: '💡 灵感' }, { key: 'updateSettings', label: '📋 设定更新' },
  { key: 'shortStory', label: '📱 短篇' },
]

// ── 章节 ──
const chapter = computed<Chapter | null>(() => {
  const cid = tauri && store ? store.currentChapterId : localCurrentChapterId.value
  if (!cid) return null
  for (const chs of Object.values(tauri && store ? store.chapterMap : localChapterMap.value)) {
    const f = chs.find(c => c.id === cid)
    if (f) return f
  }
  return null
})
const chapterIndexText = computed(() => {
  if (!chapter.value) return '第 ? 章'
  const chs = Object.values(tauri && store ? store.chapterMap : localChapterMap.value).flat().sort((a, b) => a.sort_order - b.sort_order)
  const idx = chs.findIndex(c => c.id === chapter.value!.id)
  return idx >= 0 ? `第 ${idx + 1} 章` : '第 ? 章'
})

const editTitle = ref('')
const bodyContent = ref('')
const editorEl = ref<HTMLDivElement | null>(null)
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')
const showOptimizeTitle = ref(false)

const shortStoryModalVisible = ref(false)
const reviewModal = reactive<{
  visible: boolean
  platformId: string
  tagSet: any
  wordCount: number
  extra: string
}>({
  visible: false,
  platformId: '',
  tagSet: {},
  wordCount: 5000,
  extra: '',
})
const showSettingsUpdateModal = ref(false)
const findBar = ref(false)
const findText = ref('')
const replaceText = ref('')
const findResults = ref<number[]>([])
const currentFind = ref(0)

// ── 高亮管理弹窗 ──
const hlPanelRef = ref<InstanceType<typeof HighlightPanel> | null>(null)

function openHighlightPanel() {
  hlPanelRef.value?.open(hlMgr.value.list(), bodyContent.value)
}

// ── 选中文字工具栏 ──
const selToolbar = ref<InstanceType<typeof SelectionToolbar> | null>(null)
const selectedText = ref('')
const selectionRange = ref<{start:number;end:number} | null>(null)
const activeHighlightId = ref<string | null>(null) // 当前选区覆盖的高亮 ID

function onSelectionChange() {
  const el = editorEl.value
  if (!el) return
  const { start: s, end: e } = getCEOffsets(el)
  if (s !== e) {
    // 直接从 Selection API 取选中文字，避免 bodyContent 偏移切片不一致
    selectedText.value = window.getSelection()?.toString() || bodyContent.value.slice(s, e)
    const hls = hlMgr.value.list()
    const hl = hls.find(h => s < h.end && e > h.start)
    activeHighlightId.value = hl?.id ?? null
    const rect = el.getBoundingClientRect()
    const x = rect ? rect.left + (rect.width / 2) : 200
    const y = rect ? rect.top - 10 : 100
    selToolbar.value?.show(x, y, !!hl)
  } else {
    selectedText.value = ''
    selectionRange.value = null
    activeHighlightId.value = null
    selToolbar.value?.hide()
  }
}

function copySelection() {
  if (!selectedText.value) return
  navigator.clipboard.writeText(selectedText.value).then(() => message.success('已复制')).catch(() => {})
}

// ── 高亮管理 ──
const hlOverlay = ref<HTMLDivElement | null>(null)
const chapterId = computed(() => chapter.value?.id != null ? String(chapter.value.id) : '')
const hlMgr = computed(() => useHighlights(chapterId.value))
const hlVersion = ref(0) // 强制触发高亮覆盖层重新渲染

// ── contentEditable 选区辅助函数 ──
// contentEditable div 不支持 textarea 的 selectionStart/selectionEnd，
// 需要使用 window.getSelection() + Range API 来获取/设置光标位置。

/** 获取 contentEditable div 中当前选区的字符偏移量 */
function getCEOffsets(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
    return { start: 0, end: 0 }
  }
  const range = sel.getRangeAt(0)
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  pre.setEnd(range.endContainer, range.endOffset)
  const end = pre.toString().length
  return { start, end }
}

/** 在 contentEditable div 中设置选区到指定字符偏移量 */
function setCEOffsets(el: HTMLElement, start: number, end: number) {
  // 遍历 div 内所有文本节点，累计偏移量定位目标节点
  const walk = (node: Node): Text | null => {
    if (node.nodeType === Node.TEXT_NODE) return node as Text
    for (const child of node.childNodes) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }

  let currentOffset = 0
  let startNode: Text | null = null; let startOff = 0
  let endNode: Text | null = null; let endOff = 0

  function traverse(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const tn = node as Text
      const len = tn.length
      if (!startNode && currentOffset + len > start) {
        startNode = tn; startOff = start - currentOffset
      }
      if (!endNode && currentOffset + len >= end) {
        endNode = tn; endOff = end - currentOffset
        return true
      }
      currentOffset += len
      return false
    }
    // 兼容 <br> 标签：每个 <br> 计为 1 个字符（\n）
    if (node.nodeName === 'BR') {
      if (!startNode && currentOffset + 1 > start) {
        // br 作为位置标记：使用其父节点和对应的 child offset
        startNode = walk(node.parentNode!)
        // 简单处理：跳过 br
      }
      if (!endNode && currentOffset + 1 >= end) {
        endNode = walk(node.parentNode!)
        return true
      }
      currentOffset += 1
      return false
    }
    for (const child of node.childNodes) {
      if (traverse(child)) return true
    }
    return false
  }
  traverse(el)

  if (startNode && endNode) {
    const range = document.createRange()
    range.setStart(startNode, Math.min(startOff, (startNode as Text).length))
    range.setEnd(endNode, Math.min(endOff, (endNode as Text).length))
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

/** contentEditable @input：同步 innerText 到 bodyContent */
function onContentEditableInput(e: Event) {
  suppressSync = true
  const el = e.target as HTMLElement
  bodyContent.value = el.innerText || ''
  suppressSync = false
  onContentChange()
}

/** contentEditable Tab 键：插入两个空格 */
function onKeydownCE(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
  }
}

/** contentEditable 粘贴：仅允许纯文本，避免带入 HTML 格式 */
function onPasteCE(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain')
  if (text) {
    document.execCommand('insertText', false, text)
  }
}

	// 语法高亮规则 — 加载内置规则并注入设定中的实体名（角色/物品/设定）
	const dynamicRulesVersion = ref(0)
	function loadSyntaxRules(): SyntaxRule[] {
	  void dynamicRulesVersion.value // 追踪依赖，设定变更时重新计算
	  const rules = loadRules()
	  const mgr = props.settingsMgr
	  if (!mgr) return rules
	  // 从 SettingsManager 提取实体名，构建动态正则
	  const entities: EntityNames = {
	    characters: mgr.listByType('character').map(e => e.name),
	    items: mgr.listByType('item').map(e => e.name),
	    settings: mgr.listByType('world_setting').map(e => e.name),
	  }
	  return injectEntityPatterns(rules, entities)
	}

function loadCustomRegexRules(): CustomRegexRule[] {
  try {
    const raw = localStorage.getItem('ns:customRegexRules')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// 高亮段落计算：合并手动高亮 + 语法高亮 + 正则规则高亮
const MAX_HL_SPANS = 500 // 防御性限制，防止海量 span 卡死浏览器
const highlightedSegments = computed(() => {
  try {
  void hlVersion.value
  const text = bodyContent.value
  if (!text) return [{ text, style: {} }]

  // 收集所有高亮区间
  const allSpans: { start: number; end: number; color: string; type: 'manual' | 'syntax' }[] = []

  // 手动高亮（用户选中标记）
  for (const h of hlMgr.value.list()) {
    if (allSpans.length >= MAX_HL_SPANS) break
    allSpans.push({ start: h.start, end: h.end, color: h.color, type: 'manual' })
  }

  // 语法高亮（规则自动匹配，useSyntaxHighlight 内部已有 MAX_SPANS 限制）
  const rules = loadSyntaxRules().filter(r => r.enabled)
  const customRules = loadCustomRegexRules()
  if ((rules.length || customRules.length) && allSpans.length < MAX_HL_SPANS) {
    const syntaxSpans = computeHighlights(text, rules, customRules)
    for (const s of syntaxSpans) {
      if (allSpans.length >= MAX_HL_SPANS) break
      allSpans.push({ start: s.start, end: s.end, color: s.color, type: 'syntax' })
    }
  }

  // 高亮正则规则（来自 HighlightPanel，自动着色到编辑器覆盖层）
  const hlRegexRules = loadHighlightRegexRules().filter(r => r.enabled)
  if (hlRegexRules.length && allSpans.length < MAX_HL_SPANS) {
    for (const rule of hlRegexRules) {
      if (allSpans.length >= MAX_HL_SPANS) break
      try {
        const re = new RegExp(rule.pattern, 'g')
        let m: RegExpExecArray | null
        let safety = 0
        while ((m = re.exec(text)) !== null && allSpans.length < MAX_HL_SPANS) {
          // 防御零长度匹配（如 /(?=.)/g），防止死循环
          if (m[0].length === 0) {
            if (++safety > 100) break // 连续 100 次零长匹配则终止
            // 手动推进 lastIndex 避免原地踏步
            re.lastIndex = m.index + 1
            if (re.lastIndex > text.length) break
            continue
          }
          safety = 0
          allSpans.push({ start: m.index, end: m.index + m[0].length, color: rule.color, type: 'syntax' })
        }
      } catch { /* skip invalid regex */ }
    }
  }

  // 高频词高亮（用户自定义，来自高频词弹窗）
  if (wordFreqEnabled.value && wordFreqList.value.length && allSpans.length < MAX_HL_SPANS) {
    for (const word of wordFreqList.value) {
      if (allSpans.length >= MAX_HL_SPANS) break
      try {
        const re = new RegExp(word, 'g')
        let m: RegExpExecArray | null
        let safety = 0
        while ((m = re.exec(text)) !== null && allSpans.length < MAX_HL_SPANS) {
          if (m[0].length === 0) {
            if (++safety > 100) break
            re.lastIndex = m.index + 1
            if (re.lastIndex > text.length) break
            continue
          }
          safety = 0
          allSpans.push({ start: m.index, end: m.index + m[0].length, color: '#e06060', type: 'syntax' })
        }
      } catch { /* skip invalid regex */ }
    }
  }

  if (!allSpans.length) return [{ text: text || '', style: {} }]

  // 合并重叠区间（手动高亮优先覆盖语法高亮）
  const sorted = [...allSpans].sort((a, b) => a.start - b.start || (a.type === 'manual' ? -1 : 1) - (b.type === 'manual' ? -1 : 1))
  const merged: { start: number; end: number; color: string; type: 'manual' | 'syntax' }[] = []
  for (const s of sorted) {
    const last = merged[merged.length - 1]
    if (last && s.start <= last.end) {
      if (s.type === 'manual' && last.type === 'syntax') {
        last.color = s.color
        last.type = 'manual'
      }
      last.end = Math.max(last.end, s.end)
    } else {
      merged.push({ ...s })
    }
  }

  const segments: { text: string; style: Record<string, string> }[] = []
  let pos = 0
  for (const m of merged) {
    // 安全检查：跳过越界或无效区间
    if (m.start < 0 || m.end > text.length || m.start >= m.end) continue
    if (m.start > pos) {
      const t = text.slice(pos, m.start)
      if (t) segments.push({ text: t, style: {} })
    }
    const segText = text.slice(m.start, m.end)
    if (!segText) continue
    const isManual = m.type === 'manual'
    // 主题感知 alpha：深色模式需要更高不透明度才能保证对比度
    const dark = props.isDark !== false
    const manualBgA = dark ? '99' : '80'   // 60% 深色 / 50% 浅色
    const syntaxBgA = dark ? '55' : '40'   // 33% 深色 / 25% 浅色
    const syntaxBdA = dark ? 'CC' : 'B3'   // 80% 深色 / 70% 浅色
    segments.push({
      text: segText,
      style: isManual
        ? { background: m.color + manualBgA, borderBottom: '2px solid ' + m.color, borderRadius: '2px' }
        : { background: m.color + syntaxBgA, borderBottom: '1.5px solid ' + m.color + syntaxBdA, borderRadius: '1px' },
    })
    pos = m.end
  }
  if (pos < text.length) {
    const t = text.slice(pos)
    if (t) segments.push({ text: t, style: {} })
  }
  return segments
  } catch (err) {
    console.error('[highlightedSegments] 计算失败，回退到纯文本渲染:', err)
    return [{ text: bodyContent.value || '', style: {} }]
  }
})

function syncOverlayScroll() {
  const ta = editorEl.value
  const ov = hlOverlay.value
  if (!ta || !ov) return

  // 按比例同步滚动（非直接复制 scrollTop），解决 overlay 与 textarea
  // scrollHeight 因字体渲染差异不同而导致底部错位的问题。
  const taMaxScroll = Math.max(ta.scrollHeight - ta.clientHeight, 0)
  const pct = taMaxScroll > 0 ? ta.scrollTop / taMaxScroll : 0
  const ovMaxScroll = Math.max(ov.scrollHeight - ov.clientHeight, 0)
  ov.scrollTop = pct * ovMaxScroll
  ov.scrollLeft = ta.scrollLeft
}

function highlightSelection() {
  const el = editorEl.value
  if (!el || !selectedText.value) return
  let { start: s, end: e } = getCEOffsets(el)
  if (s === e) return

  // 校验偏移：bodyContent 切片应与选中文字一致，不一致则自动纠正
  if (bodyContent.value.slice(s, e) !== selectedText.value) {
    // 在原始位置附近搜索实际选中文字（±300 字符窗口）
    const searchStart = Math.max(0, s - 300)
    const foundIdx = bodyContent.value.indexOf(selectedText.value, searchStart)
    if (foundIdx >= 0 && Math.abs(foundIdx - s) < 500) {
      s = foundIdx
      e = foundIdx + selectedText.value.length
    } else {
      // 全文回退搜索
      const globalIdx = bodyContent.value.indexOf(selectedText.value)
      if (globalIdx >= 0) {
        s = globalIdx
        e = globalIdx + selectedText.value.length
      }
    }
  }

  const existing = hlMgr.value.list()
  if (existing.some(h => (s < h.end && e > h.start))) {
    message.warning('高亮区域不能重叠')
    return
  }

  // 统一使用用户预设的手动高亮色
  const newHl = hlMgr.value.add(s, e, selectedText.value, '', '', getManualHighlightColor())
  hlVersion.value++
  // 标记成功后立即更新 toolbar 状态，让「取消高亮」剪刀按钮立即可用
  activeHighlightId.value = newHl.id
  // 重新通知 toolbar 当前选区有高亮覆盖
  const rect = el.getBoundingClientRect()
  const x = rect ? rect.left + (rect.width / 2) : 200
  const y = rect ? rect.top - 10 : 100
  selToolbar.value?.show(x, y, true)
  message.success('已高亮')
}

function unhighlightSelection() {
  const el = editorEl.value
  if (!el) return

  // 优先用 onSelectionChange 记录的高亮 ID（与工具栏判断一致，避免匹配到旁边的高亮）
  if (activeHighlightId.value) {
    hlMgr.value.remove(activeHighlightId.value)
    hlVersion.value++
    activeHighlightId.value = null
    message.success('已取消高亮')
    return
  }

  // 回退：重叠查找
  const { start: s, end: e } = getCEOffsets(el)
  const hls = hlMgr.value.list()
  const hl = hls.find(h => s < h.end && e > h.start)
  if (hl) {
    hlMgr.value.remove(hl.id)
    hlVersion.value++
    message.success('已取消高亮')
    return
  }
  // 最终回退：精确位置匹配
  const removed = hlMgr.value.removeAt(s, e)
  if (removed) { hlVersion.value++; message.success('已取消高亮') }
}

function removeHighlightById(id: string) {
  hlMgr.value.remove(id)
  hlVersion.value++
  message.success('已删除高亮')
}

function changeHighlightColor(id: string, color: string) {
  hlMgr.value.update(id, { color })
  hlVersion.value++
  message.success('颜色已更新')
}

function clearAllHighlights() {
  hlMgr.value.clearAll()
  hlVersion.value++
  message.success('已清除所有高亮')
}

function onHighlightUpdateCategory(id: string, category: string) {
  hlMgr.value.update(id, { category })
  hlVersion.value++
}

function onRegexRulesChanged(_rules: any[]) {
  hlVersion.value++
}

function onSyntaxRulesChanged() {
  hlVersion.value++
}

function goToHighlight(hl: { start: number; end: number }) {
  const el = editorEl.value
  if (!el) return
  el.focus()
  setCEOffsets(el, hl.start, hl.end)
  // 按行号比例计算滚动位置（比字符比例更准确）
  const text = bodyContent.value
  const linePos = getHighlightLinePosition(hl.start, text) / 100
  el.scrollTop = el.scrollHeight * linePos - el.clientHeight / 2
}

function getHighlights() { return hlMgr.value.list() }
// ── 拆书 ──
const bookAnalyzer = ref<InstanceType<typeof BookAnalyzer> | null>(null)
const analysisChapters = computed(() => {
  const chs = Object.values(tauri && store ? store.chapterMap : localChapterMap.value).flat().sort((a: any, b: any) => a.sort_order - b.sort_order)
  return chs.map((ch: any) => ({ id: ch.id, title: ch.title, wordCount: (ch.word_count || 0) + '字', content: ch.content || '' }))
})

function openBookAnalyzer() {
  bookAnalyzer.value?.open(analysisChapters.value)
}

defineExpose({
  insertText: (text: string) => { bodyContent.value = bodyContent.value + '\n\n' + text; doSave() },
  getHighlights, clearAllHighlights,
  triggerAi,
})

// ── 选中文字 AI 动作（改写/扩写/续写/总结）──
const selActions: Record<string, AiModalConfig> = {
  rewrite:  { title: '润色纠错', desc: '润色语句并修正错别字，保持人设语气。', target: '写入正文选区', write: '✓ 替换选区', templateName: '官方-强力去AI味', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'选中文字', desc:'当前选中的正文片段', enabled:true }] },
  expand:   { title: 'AI 创作', desc: '根据选中内容展开创作，自动对齐当前章节。', target: '写入正文选区', write: '✓ 替换选区', templateName: '通用扩写', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'选中文字', desc:'当前选中的正文片段', enabled:true }] },
  continue: { title: 'AI 创作', desc: '接续选中内容进行创作。', target: '写入正文选区', write: '✓ 追加到光标', templateName: '官方-章节续写 5.88 开篇+时空优化版', templateAuthor: '系统内置', templateDesc: '增强去AI句式 开篇优化', contextSwitches: [{ key:'body', label:'选中文字', desc:'当前选中的正文片段', enabled:true }] },
  summarize:{ title: 'AI 创作', desc: '总结选中段落的核心要点。', target: '写入正文选区', write: '✓ 替换选区', templateName: '通用总结', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'选中文字', desc:'当前选中的正文片段', enabled:true }] },
}

const selDefaultPrompts: Record<string, (text: string) => string> = {
  rewrite: (text) => `请对【选中文本】进行改写（不改剧情走向、不改人设语气，可提升节奏与表达张力）。\n\n【选中文本】：\n${text}\n\n要求：只输出改写后的文本，不要输出解释、不要加标题、不要用 Markdown。`,
  expand: (text) => `请对【选中文本】进行扩写：在不改变剧情走向/人设语气的前提下，增加细节、动作、心理与环境描写，让文字更饱满。\n\n【选中文本】：\n${text}\n\n要求：只输出扩写后的文本，不要输出解释、不要加标题、不要用 Markdown。`,
  continue: (text) => `请原样保留【选中文本】（不得改动其中任何字），并在其后继续续写，保持剧情走向与人设语气一致。\n\n【选中文本】：\n${text}\n\n输出 = 【选中文本】 + 续写内容。要求：只输出续写后的完整文本，不要输出解释、不要加标题、不要用 Markdown。`,
  summarize: (text) => `请对【选中文本】进行总结，提炼关键信息与要点。\n\n【选中文本】：\n${text}\n\n要求：输出 3~6 条要点（可分行），语言简洁；不要输出解释、不要加标题、不要用 Markdown。`,
}

function openSelectionAction(action: string) {
  const cfg = selActions[action]
  if (!cfg) return
  // A6: 快照当前选区，避免 AI 生成期间光标移动导致写入错位
  const el = editorEl.value
  if (el) {
    const { start, end } = getCEOffsets(el)
    selectionRange.value = { start, end }
  }

  // 选中文字操作的针对性模板描述（不依赖全文级模板）
  const selTemplateDescs: Record<string, { name: string; desc: string }> = {
    rewrite:  { name: '选中文字·改写', desc: '对选中文字进行改写：修复语句问题、提升表达张力、优化节奏，保持原意和人设语气不变。' },
    expand:   { name: '选中文字·扩写', desc: '对选中文字进行扩写：增加细节描写、动作刻画、心理活动或环境渲染，让文字更饱满。不改变剧情走向和人设语气。' },
    continue: { name: '选中文字·续写', desc: '接续选中文字进行续写：原样保留选中内容，在其后自然接续。保持剧情走向、文风和人设语气一致。' },
    summarize:{ name: '选中文字·总结', desc: '对选中文字进行总结：提炼3~6条核心要点，语言简洁。' },
  }
  const td = selTemplateDescs[action]

  aiModal.type = 'standard'; aiModal.visible = true
  aiModal.title = cfg.title; aiModal.desc = cfg.desc; aiModal.target = '写入正文选区'; aiModal.write = cfg.write
  aiModal.mode = cfg.mode || 'default'; aiModal.templateName = td?.name || cfg.templateName || ''; aiModal.templateDesc = td?.desc || ''
  aiModal.showGenCount = false; aiModal.showNoteCount = false; aiModal.modelName = 'DeepSeek V3'
  aiModal.contextSwitches = (cfg.contextSwitches || []).map(cs => ({...cs}))
  aiModal.defaultExtraPrompt = (selDefaultPrompts[action] || (() => ''))(selectedText.value)
  aiModal.field = 'sel_' + action
  selToolbar.value?.hide()
}

// ── 替换弹窗 ──
const showReplace = ref(false)
const replaceFindText = ref('')
const replaceToText = ref('')
const replaceScope = ref('当前正文')
const replaceUseRegex = ref(false)
const replaceRules = ref<{find:string;replace:string}[]>([])
function addReplaceRule() {
  if (!replaceFindText.value) return
  replaceRules.value.push({ find: replaceFindText.value, replace: replaceToText.value })
  replaceFindText.value = ''; replaceToText.value = ''
}
function doReplaceAll() {
  const rules = replaceRules.value.length ? replaceRules.value : [{ find: replaceFindText.value, replace: replaceToText.value }]
  let text = bodyContent.value; let total = 0
  for (const r of rules) {
    if (!r.find) continue
    let re: RegExp
    try { re = replaceUseRegex.value ? new RegExp(r.find, 'g') : new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') }
    catch { message.warning(`无效的正则表达式: ${r.find}`); return }
    const m = text.match(re); if (m) total += m.length
    text = text.replace(re, r.replace)
  }
  bodyContent.value = text; showReplace.value = false
  replaceRules.value = []
  message.success(`已替换 ${total} 处`)
}

// ── 高频词弹窗 ──
const WORD_FREQ_KEY = 'ns:wordFreqList'
const showWordFreq = ref(false)
const wordFreqEnabled = ref(true)
const newWordFreq = ref('')
function loadWordFreqList(): string[] {
  try { const raw = localStorage.getItem(WORD_FREQ_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
const wordFreqList = ref<string[]>(loadWordFreqList())
watch(wordFreqList, (v) => { localStorage.setItem(WORD_FREQ_KEY, JSON.stringify(v)) }, { deep: true })
function addWordFreq() {
  const items = newWordFreq.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  for (const w of items) { if (!wordFreqList.value.includes(w)) wordFreqList.value.push(w) }
  newWordFreq.value = ''
}
function smartPolishAll() {
  if (!bodyContent.value.trim()) {
    message.warning('正文内容为空，无法润色')
    return
  }
  showWordFreq.value = false
  aiModal.type = 'standard'; aiModal.visible = true
  aiModal.title = 'AI 创作'
  aiModal.desc = '智能润色全文：优化语句、修正错别字、提升表达张力，保持人设语气和剧情走向。'
  aiModal.target = '写入正文'
  aiModal.write = '✓ 覆盖正文'
  aiModal.mode = 'default'
  aiModal.templateName = '智能润色全文'
  aiModal.templateDesc = '全文章节润色：修正错别字、优化语句表达、提升文笔张力，不改剧情走向和人设语气。'
  aiModal.showGenCount = false; aiModal.showNoteCount = false
  aiModal.modelName = 'DeepSeek V3'
  aiModal.contextSwitches = [{ key: 'body', label: '当前正文', desc: '当前章节完整正文', enabled: true }]
  aiModal.specialSwitches = []
  aiModal.useWorkflow = false
  aiModal.defaultExtraPrompt = `请对以下正文进行智能润色：修正错别字、优化语句表达、提升文笔张力。\n要求：不改变剧情走向、不改变人设语气，只输出润色后的完整正文，不要输出解释、不要加标题、不要用 Markdown。\n\n【当前正文】\n${bodyContent.value.slice(0, 8000)}`
  aiModal.field = 'smartPolish'
}

// ── 查找 ──
function updateFind() {
  findResults.value = []
  currentFind.value = 0
  if (!findText.value) return
  const q = findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(q, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(bodyContent.value)) !== null) findResults.value.push(m.index)
}

function findPrev() {
  if (!findResults.value.length) return
  currentFind.value = currentFind.value > 0 ? currentFind.value - 1 : findResults.value.length - 1
  highlightFind()
}

function findNext() {
  if (!findResults.value.length) return
  currentFind.value = currentFind.value < findResults.value.length - 1 ? currentFind.value + 1 : 0
  highlightFind()
}

function highlightFind() {
  const el = editorEl.value
  if (!el || !findResults.value.length) return
  const pos = findResults.value[currentFind.value]
  el.focus()
  setCEOffsets(el, pos, pos + findText.value.length)
  el.scrollTop = el.scrollHeight * (pos / bodyContent.value.length) - el.clientHeight / 2
}

function replaceOne() {
  if (!findResults.value.length) return
  const idx = findResults.value[currentFind.value]
  bodyContent.value = bodyContent.value.slice(0, idx) + replaceText.value + bodyContent.value.slice(idx + findText.value.length)
  updateFind()
  if (findResults.value.length) highlightFind()
  onContentChange()
}

function replaceAll() {
  if (!findText.value) return
  const q = findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(q, 'gi')
  const before = bodyContent.value
  bodyContent.value = bodyContent.value.replace(re, replaceText.value)
  const count = (before.match(re) || []).length
  updateFind()
  message.success(`已替换 ${count} 处`)
  onContentChange()
}

// ── 内容 ──
const formattedWordCount = computed(() => {
  const cnt = countWords(bodyContent.value)
  if (cnt < 1000) return `${cnt}`
  if (cnt < 10000) return `${(cnt / 1000).toFixed(1)}k`
  return `${(cnt / 10000).toFixed(1)}万`
})
const saveLabel = computed(() => ({ saved: '已保存', saving: '保存中...', unsaved: '未保存' }[saveStatus.value]))

let lastLoadedContent = ''
watch(chapter, (ch) => {
  if (!ch) return
  editTitle.value = ch.title
  const content = ch.content || ''
  lastLoadedContent = content
  bodyContent.value = content
  // contentEditable div: 需要手动同步内容
  if (editorEl.value && editorEl.value.innerText !== content) {
    editorEl.value.innerText = content
  }
  saveStatus.value = 'saved'
  emit('save-status-change', 'saved')
}, { immediate: true })

// 当设定数据变化时，刷新语法高亮中的实体名
watch(() => props.settingsVersion, () => {
  dynamicRulesVersion.value++
  hlVersion.value++
})

// contentEditable 双向同步：用户输入 → bodyContent（通过 @input），
// AI 写入/程序修改 bodyContent → div.innerText（通过此 watcher）
// 同时监听 editorEl 可用性，确保 v-if 重建组件时首次渲染后同步内容
let suppressSync = false
watch([bodyContent, () => editorEl.value], ([newVal]) => {
  if (suppressSync) return
  const el = editorEl.value
  if (el && el.innerText !== newVal) {
    el.innerText = newVal
  }
})

// 自动保存
let saveTimer: ReturnType<typeof setTimeout> | null = null
let changedSinceLastSave = false
let _saving = false // 并发锁，防止 autoSave + manualSave 双写

function onContentChange() {
  changedSinceLastSave = true
  saveStatus.value = 'unsaved'
  emit('save-status-change', 'unsaved')
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(doSave, 500)
}

function exportTxt() {
  if (!bodyContent.value.trim()) { message.warning('暂无内容可导出'); return }
  const blob = new Blob([bodyContent.value], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = (chapter.value?.title || '章节') + '.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function doSave() {
  if (!chapter.value || _saving) return
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  _saving = true
  saveStatus.value = 'saving'
  emit('save-status-change', 'saving')
  try {
    const wc = countWords(bodyContent.value)
    if (tauri) {
      await updateChapterContent(chapter.value.id, bodyContent.value)
      store?.updateLocalWordCount(chapter.value.id, chapter.value.volume_id, wc)
    } else {
      localUpdateChapterContent(chapter.value.id, chapter.value.volume_id, bodyContent.value, wc)
    }

    // 内容大幅变更时，自动重对齐高亮位置
    const oldLen = lastLoadedContent.length
    const newLen = bodyContent.value.length
    const lenDiff = Math.abs(newLen - oldLen)
    if (lenDiff > 50 || (oldLen > 0 && lenDiff / oldLen > 0.1)) {
      const realigned = hlMgr.value.realignHighlights(bodyContent.value)
      if (realigned > 0) hlVersion.value++
    }

    lastLoadedContent = bodyContent.value
    changedSinceLastSave = false
    saveStatus.value = 'saved'
    emit('save-status-change', 'saved')
  } catch {
    saveStatus.value = 'unsaved'
    emit('save-status-change', 'unsaved')
  } finally {
    _saving = false
  }
}

async function manualSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  await doSave()
}

onUnmounted(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (changedSinceLastSave) doSave().catch(e => console.error('ChapterEditor unmount save failed:', e))
})

async function saveTitle() {
  if (!chapter.value) return
  const oldTitle = chapter.value.title
  const title = editTitle.value.trim() || chapter.value.title
  editTitle.value = title
  if (title === oldTitle) return
  try {
    if (tauri) {
      await updateChapterTitle(chapter.value.id, title)
      store?.renameChapter(chapter.value.volume_id, chapter.value.id, title)
    } else {
      localRenameChapter(chapter.value.volume_id, chapter.value.id, title)
    }
  } catch (e: any) {
    console.error('[saveTitle] 失败:', e)
    message.error('标题保存失败: ' + (e.message || String(e)))
  }
}

function reloadChapter() {
  if (chapter.value) {
    bodyContent.value = chapter.value.content || ''
    editTitle.value = chapter.value.title
    lastLoadedContent = bodyContent.value
    saveStatus.value = 'saved'
  }
}

function markComplete() { message.success('已标记为完成') }

// ── 复制 ──
function copyTitle() {
  if (!editTitle.value.trim()) { message.warning('标题为空'); return }
  navigator.clipboard.writeText(editTitle.value).then(() => message.success('标题已复制')).catch(() => {})
}
function copyBody() {
  if (!bodyContent.value.trim()) { message.warning('正文为空'); return }
  navigator.clipboard.writeText(bodyContent.value).then(() => message.success('正文已复制')).catch(() => {})
}

// ── 排版 ──
function smartFormat() {
  let t = bodyContent.value
  if (!t.trim()) { message.info('暂无正文'); return }
  // 先去掉已有的段首缩进（半角+全角空格），防止重复点击缩进加倍
  t = t.replace(/^[ 　]+/gm, '')
  // 对非空行统一加两个全角空格
  t = t.replace(/^(?!\s*$)/gm, '　　')
  // 合并连续空行
  t = t.replace(/\n{3,}/g, '\n\n')
  // 去行尾空格
  t = t.replace(/[ 　]+$/gm, '')
  bodyContent.value = t
  message.success('排版完成')
  onContentChange()
}

// ── 清空 ──
function clearContent() {
  showConfirm('确认清空当前章节正文？', () => {
  bodyContent.value = ''
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  doSave()
  })
}

// ── AI ──
const aiModal = reactive({
  visible: false, type: '' as string, title: '', desc: '', target: '', write: '', field: '',
  mode: 'default' as string, modelName: 'DeepSeek V3', showGenCount: false, showNoteCount: false,
  chapterRange: '', taskTarget: '', templateName: '', templateDesc: '', maxChapters: 5,
  defaultExtraPrompt: '', contextSwitches: [] as ContextSwitch[], specialSwitches: [] as ContextSwitch[],
  useWorkflow: false, chapterCount: 3, rangeStart: '第1章', rangeEnd: '第1章',
})

const chapterLabel = computed(() => chapter.value ? chapterIndexText.value : '暂无章节')

interface AiModalConfig { type?: string; title: string; desc: string; target: string; write: string; mode?: string; showGenCount?: boolean; showNoteCount?: boolean; chapterRange?: string; taskTarget?: string; costEstimate?: string; templateName?: string; templateAuthor?: string; templateDesc?: string; maxChapters?: number; contextSwitches?: ContextSwitch[]; specialSwitches?: any[] }
const AI_EDITOR_CONFIG: Record<string, AiModalConfig> = {
  opening:    { type: 'approval', title: '黄金开篇', desc: '基于作品设定与大綱规划，生成黄金三章开篇正文，逐章审批后写入。', target: '写入正文', write: '✓ 写入', chapterRange: '1-3', taskTarget: '黄金开篇 第1-3章 正文', templateName: '官方-黄金三章 3.7 节奏优化版', templateDesc: '节奏优化 强力去AI味 增强字数 专注增强版 增加镜头感', maxChapters: 5, contextSwitches: [{ key:'platform', label:'发布平台', desc:'发布平台（影响写作口味，可手填）', enabled:true },{ key:'outline', label:'总纲', desc:'全书总纲', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'worldview', label:'世界观', desc:'世界观设定', enabled:true },{ key:'cheat', label:'金手指', desc:'金手指机制', enabled:true },{ key:'powerSystem', label:'力量体系', desc:'力量/等级体系', enabled:true },{ key:'protagonist', label:'主角', desc:'主角核心构架', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'targetWordCount', label:'目标字数', desc:'目标总字数（默认100万）', enabled:true },{ key:'chapterOutline', label:'本章章纲', desc:'当前章节大纲', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }], specialSwitches: [] },
  continue:   { type: 'approval', title: '章节续写', desc: '在已有章节基础上续写新章节，保持文风与设定一致性，逐章审批后写入。', target: '写入正文', write: '✓ 写入', chapterRange: '1-3', taskTarget: '章节续写', templateName: '官方-章节续写 5.88 开篇+时空优化版', templateDesc: '增强去AI句式 开篇优化 时空场景优化 钩子优化', maxChapters: 5, contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲', enabled:true },{ key:'recentChapters', label:'前N章正文', desc:'最近 N 章有效正文拼接', enabled:true, hasCount:true, count:3, countMin:1, countMax:20 },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'currentSettings', label:'当前设定数据', desc:'渐进式披露版（根据当前章节自动隐藏未揭示的秘密/伏笔）', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:false },{ key:'targetWordCount', label:'目标字数', desc:'目标总字数（默认100万）', enabled:true },{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'chapterOutline', label:'本章章纲', desc:'当前章节大纲', enabled:true },{ key:'prevChapterOutline', label:'前文章纲', desc:'当前章之前最近一章的章纲', enabled:true },{ key:'charStateSnapshot', label:'角色状态快照', desc:'所有角色当前状态（位置/情绪/目标）', enabled:true },{ key:'foreshadowStatus', label:'伏笔状态', desc:'全部伏笔回收状态汇总', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }], specialSwitches: [{ key:'emoji', label:'表情包', desc:'提示词参数', enabled:false },{ key:'kaomoji', label:'颜文字', desc:'提示词参数', enabled:false }] },
  optimize:   { title: '优化改进', desc: '在不改变剧情走向的前提下，优化文字节奏、张力和可读性。', target: '写入正文', write: '✓ 替换', mode: 'chapterRange', templateName: '优化重写 3.1 局部改动版', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  unmark:     { title: '消除AI痕迹', desc: '将AI生成风格的文字改写为自然中文：去虚词、去翻译腔、去机器味。', target: '写入正文', write: '✓ 替换', templateName: '官方-AI消痕 2.51', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/文风/目标字数', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  review:     { title: '编辑审稿', desc: '审阅当前章节，检测剧情矛盾、人设偏离、节奏问题和文法错误，输出审稿报告。', target: '写入笔记', write: '✓ 写入', mode: 'noteTarget', templateName: '官方-修改建议 1.38 增强边界', templateAuthor: '系统内置', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'recentChapters', label:'前N章正文', desc:'最近 N 章有效正文拼接', enabled:true, hasCount:true, count:3, countMin:1, countMax:20 },{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'charStateSnapshot', label:'角色状态快照', desc:'所有角色当前状态（位置/情绪/目标）', enabled:true },{ key:'foreshadowStatus', label:'伏笔状态', desc:'全部伏笔回收状态汇总', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  polish:     { title: '润色纠错', desc: '修正错别字、病句、标点错误，优化不通顺表达，保持作者原意和语气不变。', target: '写入正文', write: '✓ 替换', templateName: '官方-润色纠错 2.0', templateAuthor: '系统内置', contextSwitches: [{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/文风/目标字数', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  comment:    { title: '神评吐槽', desc: '为本章生成段评吐槽与整本神评，风格幽默犀利，默认写入笔记。', target: '写入笔记', write: '✓ 写入', mode: 'noteTarget', showNoteCount: true, templateName: '官方-神评吐槽（段评+整本神评）', templateAuthor: '系统内置', contextSwitches: [{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'body', label:'本章正文', desc:'当前章节正文', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  inspire:    { type: 'special', title: 'AI 灵感', desc: '', target: '', write: '' },
  updateSettings:{ type: 'special', title: '设定数据自动更新', desc: '', target: '', write: '' },
  optimizeTitle:{ type: 'special', title: 'AI 标题优化', desc: '', target: '', write: '' },
  shortStory:  { type: 'special', title: '平台短篇', desc: '选择目标平台和标签，AI 一次性生成完整短篇', target: '', write: '' },
}

function triggerAi(action: string) {
  if (action === 'analyze') { openBookAnalyzer(); return }
  const cfg = AI_EDITOR_CONFIG[action]
  if (!cfg) { emit('ai-action', action); return }
  if (cfg.type === 'special') {
    if (action === 'inspire') emit('open-inspire-modal')
    else if (action === 'updateSettings') showSettingsUpdateModal.value = true
    else if (action === 'optimizeTitle') showOptimizeTitle.value = true
    else if (action === 'shortStory') {
      shortStoryModalVisible.value = true
      return
    }
    return
  }
  const tpl = getTemplate(('ed_' + action) as any, platformId.value || '')
  const isApproval = cfg.type === 'approval'
  const chIdx = chapter.value ? chapterIndexText.value : '第1章'

  aiModal.type = 'standard'
  aiModal.visible = true
  aiModal.field = action
  aiModal.desc = cfg.desc
  aiModal.target = cfg.target
  aiModal.write = cfg.write
  aiModal.mode = isApproval ? 'chapterRange' : (cfg.mode || 'default')
  aiModal.rangeStart = cfg.chapterRange ? ('第' + cfg.chapterRange.split('-')[0] + '章') : '第1章'
  aiModal.rangeEnd = cfg.chapterRange ? ('第' + cfg.chapterRange.split('-')[1] + '章') : '第1章'
  aiModal.showGenCount = cfg.showGenCount || false
  aiModal.showNoteCount = cfg.showNoteCount || false
  aiModal.templateName = tpl.name || cfg.templateName || ''
  aiModal.templateDesc = tpl.desc || cfg.templateDesc || ''
  aiModal.maxChapters = cfg.maxChapters || 5
  aiModal.chapterCount = cfg.maxChapters || 3
  aiModal.contextSwitches = (cfg.contextSwitches || []).map(cs => ({...cs}))
  aiModal.specialSwitches = (cfg.specialSwitches || []).map(ss => ({...ss}))
  aiModal.useWorkflow = false

  if (isApproval && action === 'continue') {
    // 自动检测最后一章，从下一章开始续写
    const allChs = Object.values(tauri && store ? store.chapterMap : localChapterMap.value).flat()
    const lastCh = allChs.length > 0 ? allChs.sort((a: any, b: any) => b.sort_order - a.sort_order)[0] : null
    const nextChNo = lastCh ? (lastCh.sort_order + 2) : 1  // sort_order 从0起，所以+2
    const genCount = cfg.chapterRange ? parseInt(cfg.chapterRange.split('-')[1]) : 3
    aiModal.title = (cfg.title || '章节续写') + ' 第' + nextChNo + '章起'
    aiModal.rangeStart = '第' + nextChNo + '章'
    aiModal.rangeEnd = '第' + (nextChNo + genCount - 1) + '章'
    // 注入前文作为上下文
    if (lastCh?.content) {
      aiModal.defaultExtraPrompt = '【前文结尾（续写起点）】\n' + (lastCh.content || '').slice(-1500) + '\n\n请严格接续上述内容续写下一章。'
    }
  } else if (isApproval && action === 'opening') {
    aiModal.title = '黄金开篇 审批'
  } else {
    aiModal.title = cfg.title
  }
}

async function onAiWrite(value: string) {
  // 兜底剥离自检清单（AiModal 路径已剥离，此处作为安全网）
  const { stripSelfCheck } = await import('../composables/stripSelfCheck')
  const cleaned = stripSelfCheck(value)

  // 单章替换操作：优化/消痕/润色 → 直接覆盖当前章正文
  if (aiModal.field === 'optimize' || aiModal.field === 'unmark' || aiModal.field === 'polish') {
    bodyContent.value = cleaned
    await doSave()
    aiModal.visible = false
    message.success(`${aiModal.title || '操作'}已完成`)
    return
  }

  // 章节范围模式：拆分为多章分别写入
  if (aiModal.mode === 'chapterRange' && (aiModal.field === 'opening' || aiModal.field === 'continue')) {
    const sections = splitChapterContent(cleaned)
    if (sections.length === 0) {
      // 完全无法拆分 → 全量写入当前章
      bodyContent.value = bodyContent.value + '\n\n' + cleaned
    } else {
      const workId = tauri ? (store?.currentWorkId as number) : localCurrentWorkId.value
      if (!workId) { message.warning('请先选择作品'); return }

      // 确保有卷
      const repo = useWorkRepo()
      let vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
      if (vols.length === 0) {
        const newVolId = await repo.addVolume(workId, '第一卷')
        if (newVolId) vols = repo.volumes.value.filter(v => v.work_id === workId)
      }
      if (vols.length === 0) { message.error('请先创建至少一个卷'); return }
      // 开篇：固定从第1卷开始，复用章纲创建的已有章节（保留标题）
      // 续写：在最后一个章节所在的卷中追加
      const isOpening = aiModal.field === 'opening'
      const allChs = Object.values(repo.chapterMap.value || {}).flat()
      let targetVol: any
      let startChNo: number
      if (isOpening) {
        targetVol = vols[0]
        startChNo = 1
      } else {
        const lastCh = allChs.sort((a, b) => b.sort_order - a.sort_order)[0]
        targetVol = lastCh ? vols.find(v => v.id === lastCh.volume_id) || vols[vols.length - 1] : vols[vols.length - 1]
        startChNo = lastCh ? (lastCh.sort_order + 2) : 1
      }
      const targetVolId = targetVol.id

      // 扫描目标卷中已有章节（按 sort_order）及章纲
      const existingChs = (repo.chapterMap.value[targetVolId] || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
      const existingByOrder = new Map<number, any>()
      for (const ch of existingChs) {
        existingByOrder.set(ch.sort_order + 1, ch) // sort_order 从0起，章号从1起
      }

      // 检测是否有章纲目录冲突：对即将写入的章号，检查是否已有章纲
      let hasExistingOutline = false
      const outlineChecks: Promise<any>[] = []
      for (let i = 0; i < sections.length; i++) {
        const chNo = startChNo + i
        const existing = existingByOrder.get(chNo)
        if (existing) {
          outlineChecks.push(getOutline('chapter', existing.id).then(o => ({ chNo, existing, hasOutline: !!o })))
        }
      }
      const outlineResults = await Promise.all(outlineChecks)
      const existingOutlineChs = outlineResults.filter(r => r.hasOutline)
      if (existingOutlineChs.length > 0) {
        const names = existingOutlineChs.map(r => `第${r.chNo}章「${r.existing.title || ''}」`).join('、')
        hasExistingOutline = true
        showConfirm(`检测到以下章节已有章纲：\n${names}\n\n写入正文将覆盖章纲内容。是否继续？`, () => {
          doWrite()
        })
        return
      }
      await doWrite()
      return

      async function doWrite() {
      // 对已有章节（含章纲或正文）复用 ID，否则新建
      let written = 0
      let reusedCount = 0
      try {
        for (const sec of sections) {
          const chNo = startChNo + written
          const existing = existingByOrder.get(chNo)
          let chId: number | null = null

          if (existing) {
            // 复用已有章节
            chId = existing.id
            reusedCount++
            // 如果正文已有内容，提示覆盖
            if (existing.content && existing.content.trim().length > 100) {
              message.info(`第${chNo}章已有正文（${existing.word_count || 0}字），新内容将覆盖旧内容`)
            }
          } else {
            // 新建章节
            chId = await repo.addChapter(targetVolId, sec.title || `第${chNo}章`)
          }

          if (!chId) continue

          // 写入正文到章节
          if (tauri && store) {
            await updateChapterContent(chId, sec.content)
          } else {
            localUpdateChapterContent(chId, targetVolId, sec.content, countWords(sec.content))
          }

          // 同步创建/更新章纲（保持目录系统一致）
          const outlineTitle = sec.title || `第${chNo}章`
          await upsertOutline({
            workId,
            type: 'chapter',
            volumeId: targetVolId,
            chapterId: chId,
            content: `# ${outlineTitle}\n\n${sec.content.slice(0, 500)}`,
          }).catch(() => {})

          written++
        }
      } catch (err: any) {
        console.error('[onAiWrite] 批量写入章节失败:', err)
        if (written > 0) {
          message.warning(`写入过程出错：已成功写入 ${written}/${sections.length} 章，第${startChNo + written}章写入失败。${err?.message || ''}`)
        } else {
          message.error(`章节写入失败：${err?.message || '未知错误'}`)
        }
        return
      }

      // 选中最后一个写入的章
      if (written > 0) {
        const chs = repo.chapterMap.value[targetVolId] || []
        const lastWritten = chs.sort((a: any, b: any) => b.sort_order - a.sort_order)[0]
        if (lastWritten) {
          if (tauri && store) {
            store.currentChapterId = lastWritten.id
          } else {
            localCurrentChapterId.value = lastWritten.id
          }
          bodyContent.value = lastWritten.content || ''
          editTitle.value = lastWritten.title || ''
        }
      }

      const reuseMsg = reusedCount > 0 ? `（复用已有章节 ${reusedCount} 个）` : ''
      message.success(`${aiModal.field === 'continue' ? '续写' : '黄金开篇'}已写入 ${written} 章${reuseMsg}`)
      aiModal.visible = false
      }
    }
  }

  // 选区模式：替换或追加到选中文字位置
  const selFields = ['sel_rewrite', 'sel_expand', 'sel_continue', 'sel_summarize']
  if (selFields.includes(aiModal.field)) {
    const range = selectionRange.value
    if (range && selectedText.value) {
      const { start: s, end: e } = range
      if (aiModal.write === '✓ 替换选区') {
        bodyContent.value = bodyContent.value.slice(0, s) + value + bodyContent.value.slice(e)
      } else {
        bodyContent.value = bodyContent.value.slice(0, e) + '\n\n' + value + bodyContent.value.slice(e)
      }
    } else {
      bodyContent.value = bodyContent.value + '\n\n' + value
    }
  } else if (aiModal.field === 'smartPolish') {
    // 智能润色全文：覆盖整个正文
    bodyContent.value = value
  } else {
    bodyContent.value = bodyContent.value + '\n\n' + value
  }
  selectionRange.value = null
  await doSave()
  aiModal.visible = false
  selToolbar.value?.hide()
}

/** 从 AI 正文中按 ### 第X章 拆分为独立章节 */
function splitChapterContent(text: string): { title: string; content: string }[] {
  const lines = text.split('\n')
  const sections: { title: string; content: string }[] = []
  let currentTitle = ''
  let currentLines: string[] = []
  let foundAny = false

  // 中文数字映射（支持一到九十九）
  const cnNumPattern = '(?:十[一二三四五六七八九]?|[一二三四五六七八九]十[一二三四五六七八九]?|[一二三四五六七八九])'

  for (const line of lines) {
    // 匹配 ### 第1章 / ## 第1章 / 第1章、第十一章 等格式
    const m = line.match(new RegExp(`^(?:#{1,3}\\s*)?第\\s*(\\d+|${cnNumPattern})\\s*章`))
    if (m) {
      foundAny = true
      // 跳过空标题（导言/引子文本），将其合并到第一个有效章节
      if (currentTitle || currentLines.some(l => l.trim())) {
        if (!currentTitle && sections.length === 0) {
          // 首个章节前的导言：合并到第一个章节
          currentLines = []
        } else {
          sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
        }
      }
      currentTitle = line.replace(/^[#]+\s*/, '').trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentTitle || currentLines.some(l => l.trim())) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  // 没标题 → 整个文本视为单章
  if (!foundAny && sections.length <= 1) {
    return [{ title: '第1章', content: text.trim() }]
  }

  return sections
}

function onApprovalStart(_field: string) {
  emit('ai-action', aiModal.field)
}

function onShortStoryGenerate(config: { platformId: string; tagSet: any; wordCount: number; extra: string }) {
  shortStoryModalVisible.value = false
  // 直接打开审阅弹窗，不走 agent 管线
  reviewModal.platformId = config.platformId
  reviewModal.tagSet = config.tagSet
  reviewModal.wordCount = config.wordCount
  reviewModal.extra = config.extra || ''
  reviewModal.visible = true
}

/** 短篇审阅通过 → 落库（平台分类） */
async function handleShortStoryApprove(content: string) {
  if (!content.trim()) return

  const { getPlatform } = await import('../composables/usePlatformData')
  const { WorkspaceSettings } = await import('../composables/useWorkspaceSettings')

  const platform = getPlatform(reviewModal.platformId)
  const platformShort = platform?.name?.replace('小说', '').replace('文学城', '') || reviewModal.platformId
  const genreName = reviewModal.tagSet.genre
    ? (GENRE_LABELS[reviewModal.tagSet.genre] || reviewModal.tagSet.genre)
    : '短篇'
  const title = `${platformShort}短文 · ${genreName}`

  try {
    const repo = useWorkRepo()
    const workId = await repo.addWork(title)
    if (!workId) { message.warning('创建作品失败'); return }

    const volumeId = await repo.addVolume(workId, '默认卷')
    if (!volumeId) { message.warning('创建卷失败'); return }

    const chapterId = await repo.addChapter(volumeId, '正文')
    if (!chapterId) { message.warning('创建章节失败'); return }

    // 写入章节内容
    await updateChapterContent(chapterId, content)

    // 记录平台/标签到 WorkspaceSettings
    const ws = new WorkspaceSettings(workId)
    ws.update({
      platformId: reviewModal.platformId,
      genre: reviewModal.tagSet.genre || '',
      tags: [
        ...(reviewModal.tagSet.subgenre || []),
        ...(reviewModal.tagSet.elements || []),
      ],
    })

    // 刷新作品树
    repo.loadWorks()

    reviewModal.visible = false
    message.success(`作品"${title}"已创建`)
  } catch (e: any) {
    console.error('[ChapterEditor] 短篇保存失败:', e)
    message.error('保存失败: ' + (e.message || String(e)))
  }
}

// ── 标题优化 ──
const otPlatform = ref('番茄'); const otTitleLen = ref(16); const otRefTitles = ref(''); const otCount = ref(10)
const otGenerating = ref(false); const otTitles = ref<string[]>([]); const otError = ref('')
const { generating: _otg, output: _oto, error: _ote, generate: otGenerate } = useLLM()

function genOptimizeTitle() {
  const content = bodyContent.value.trim()
  if (!content) { message.warning('当前章节没有正文内容'); return }

  otError.value = ''
  otTitles.value = []
  otGenerating.value = true

  const tpl = getTemplate('ed_optimizeTitle', platformId.value || '')
  const systemPrompt = `你是专业的网文标题优化专家。

${tpl.desc}

## 参数约束
- 目标平台：${otPlatform.value || '通用'}
- 标题字数范围：${otTitleLen.value - 5}~${otTitleLen.value + 5} 字
- 生成数量：${otCount.value} 个
${otRefTitles.value ? `- 参考风格标题：\n${otRefTitles.value}` : ''}

## 当前章节正文（前 2000 字供参考）
${content.slice(0, 2000)}

## 输出格式
每行一个标题，不要编号、不要前缀、不要 JSON、不要 markdown。
直接输出 ${otCount.value} 行标题。`

  otGenerate({
    systemPrompt,
    userPrompt: `请根据以上章节正文和参数约束，生成 ${otCount.value} 个爆款标题。`,
  }).then(() => {
    otGenerating.value = false
    if (_ote.value) {
      otError.value = _ote.value
      return
    }
    const raw = _oto.value
    if (!raw) { otError.value = '生成结果为空'; return }
    // 解析输出：按行拆分，过滤空行和编号前缀
    otTitles.value = raw
      .split('\n')
      .map(l => l.replace(/^[\d]+[\.\)、\s]+/, '').trim())
      .filter(l => l.length >= 3 && l.length <= 60)
    if (!otTitles.value.length) {
      otTitles.value = raw.split('\n').map(l => l.trim()).filter(Boolean).slice(0, otCount.value)
    }
    if (!otTitles.value.length) { otError.value = '未能解析出有效标题'; }
  }).catch((e: any) => {
    otGenerating.value = false
    otError.value = e?.message || String(e)
  })
}

function applyOptimizedTitle(title: string) {
  if (!chapter.value) return
  editTitle.value = title
  saveTitle()
  showOptimizeTitle.value = false
  message.success('标题已更新：' + title)
}

// ── State Keeper ──
async function onSettingsRollback(targetVersion: number) {
  const mgr = props.settingsMgr
  if (!mgr) { message.warning('设定管理器未就绪'); return }
  const allTypes = ['character', 'world_setting', 'foreshadowing'] as const
  let rolled = 0
  try {
    for (const type of allTypes) {
      for (const entity of mgr.listByType(type)) {
        const verMgr = new StateKeeperVersionManager(entity.id)
        const snapshot = verMgr.rollback(targetVersion)
        if (snapshot) {
          const patch: Record<string, any> = {}
          for (const [k, v] of Object.entries(snapshot)) {
            if (v !== undefined && v !== null && k !== 'name') patch[k] = v
          }
          if (Object.keys(patch).length) {
            await mgr.update(entity.id, { structuredData: { ...entity.structuredData, ...patch, _lastExtraction: new Date().toISOString() } })
            rolled++
          }
        }
      }
    }
    message.success(`回滚完成：${rolled} 个条目已恢复到 v${targetVersion} 状态`)
  } catch (e: any) {
    console.error('[onSettingsRollback] 失败:', e)
    message.error(`回滚失败：${e.message || String(e)}（已处理 ${rolled} 个条目）`)
  }
}

</script>

<style scoped>
.ce-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg-panel, #1e1e26); }
.ce-topbar { display: flex; align-items: center; justify-content: space-between; padding: 6px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; min-height: 36px; font-size: 11px; }
.ce-breadcrumb { opacity: 0.45; }
.ce-breadcrumb.active { opacity: 0.75; font-weight: 500; }
.ce-breadcrumb-sep { margin: 0 6px; opacity: 0.25; }
.ce-topbar-right { display: flex; gap: 4px; }
.ce-icon-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: none; border-radius: 4px; background: transparent; cursor: pointer; color: var(--btn-color); }
.ce-icon-btn:hover { background: var(--btn-hover-bg); }

.ce-ai-bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: rgba(128,128,128,0.02); }
.ce-ai-btn { padding: 4px 12px; font-size: 12px; font-family: inherit; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; background: #2ea86a; color: #fff; }
.ce-ai-btn:hover { background: #258d58; }

.ce-title-bar { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.ce-chapter-no { font-size: 13px; font-weight: 600; opacity: 0.5; white-space: nowrap; }
.ce-title-input { flex: 1; background: transparent; border: none; outline: none; font-size: 18px; font-weight: 600; font-family: inherit; color: inherit; }
.ce-title-input::placeholder { opacity: 0.25; }
.ce-ai-title-btn { background: #2ea86a; border: none; border-radius: 4px; padding: 4px 12px; font-size: 11px; cursor: pointer; font-family: inherit; color: #fff; white-space: nowrap; }
.ce-ai-title-btn:hover { background: #258d58; }

.ce-toolbar { display: flex; align-items: center; gap: 4px; padding: 5px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: rgba(128,128,128,0.03); }
.ce-tool-btn { display: flex; align-items: center; gap: 2px; padding: 3px 8px; font-size: 11px; font-family: inherit; background: rgba(128,128,128,0.08); border: 1px solid transparent; border-radius: 4px; cursor: pointer; color: inherit; opacity: 0.7; }
.ce-tool-btn:hover { opacity: 1; background: rgba(128,128,128,0.15); }
.ce-tool-btn.danger { color: #e06060; }
.ce-tool-sep { width: 1px; height: 16px; background: var(--border-color); margin: 0 2px; }

.ce-find-bar { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; background: rgba(128,128,128,0.04); }
.ce-find-input { width: 140px; padding: 3px 8px; font-size: 12px; font-family: inherit; background: rgba(128,128,128,0.08); border: 1px solid transparent; border-radius: 3px; color: inherit; outline: none; }
.ce-find-input:focus { border-color: rgba(82,200,160,0.4); }
.ce-find-count { font-size: 10px; opacity: 0.5; min-width: 32px; text-align: center; }
.ce-find-nav { background: transparent; border: none; cursor: pointer; color: inherit; opacity: 0.5; font-size: 12px; padding: 2px 4px; }
.ce-find-nav:hover:not(:disabled) { opacity: 1; }
.ce-find-nav:disabled { opacity: 0.2; cursor: default; }
.ce-find-btn { padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: inherit; cursor: pointer; font-family: inherit; }
.ce-find-btn:disabled { opacity: 0.3; cursor: default; }
.ce-find-btn.warn { border-color: rgba(240,160,20,0.4); color: #f0a020; }

.ce-editor { flex: 1; overflow: hidden; min-height: 0; }
.ce-editor-wrap { position: relative; height: 100%; display: flex; }
.ce-hl-bar { width: 8px; flex-shrink: 0; position: relative; background: rgba(128,128,128,0.04); border-right: 1px solid rgba(128,128,128,0.06); overflow: hidden; }
.ce-hl-mark { position: absolute; left: 1px; right: 1px; height: 4px; border-radius: 2px; cursor: pointer; opacity: 0.7; transition: opacity 0.15s; }
.ce-hl-mark:hover { opacity: 1; height: 6px; z-index: 1; }

.ce-textarea-stack { position: relative; flex: 1; min-width: 0; }
.ce-hl-overlay {
  position: absolute; inset: 0; padding: 20px 28px;
  font-family: var(--ce-font, ui-serif, Georgia, Cambria, 'Songti SC', STSong, 'Noto Serif SC', serif);
  font-size: var(--ce-font-size, 16px);
  line-height: var(--ce-line-height, 1.8);
  white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word;
  overflow: hidden;
  pointer-events: none; color: transparent;
  tab-size: 2; box-sizing: border-box;
}
.ce-empty { flex: 1; display: flex; align-items: center; justify-content: center; opacity: 0.3; font-size: 14px; height: 100%; }
.ce-textarea { position: absolute; inset: 0; padding: 20px 28px;
  font-family: var(--ce-font, ui-serif, Georgia, Cambria, 'Songti SC', STSong, 'Noto Serif SC', serif);
  font-size: var(--ce-font-size, 16px);
  line-height: var(--ce-line-height, 1.8);
  white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word;
  overflow-y: auto; overflow-x: hidden;
  background: transparent; border: none; color: inherit; outline: none;
  tab-size: 2; box-sizing: border-box; -webkit-text-fill-color: currentColor;
  -webkit-user-modify: read-write-plaintext-only;
}
/* contentEditable placeholder */
.ce-textarea:empty::before {
  content: attr(data-placeholder);
  opacity: 0.25;
  pointer-events: none;
}


.ce-statusbar { padding: 4px 16px; border-top: 1px solid var(--border-color); font-size: 11px; opacity: 0.35; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
.ce-status-actions { display: flex; gap: 8px; }
.ce-status-btn { padding: 2px 10px; border: 1px solid rgba(128,128,128,0.15); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.6; transition: all 0.15s; }
.ce-status-btn:hover { opacity: 1; border-color: rgba(46,168,106,0.4); color: #2ea86a; }

/* 弹窗 */
.ce-sp-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
.ce-sp-root { width: 560px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border: 1px solid rgba(128,128,128,0.15); }
.ce-theme-dark { background: #1c1c22; color: #d4d4d4; }
.ce-theme-light { background: #f5f5f5; color: #1a1a1a; }
.ce-sp-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 8px; }
.ce-sp-title { font-size: 18px; font-weight: 700; }
.ce-sp-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; }
.ce-sp-close:hover { opacity: 1; }
.ce-sp-desc { font-size: 12px; opacity: 0.4; padding: 0 20px 12px; }
.ce-sp-body { padding: 12px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.ce-sp-row { display: flex; align-items: center; gap: 8px; }
.ce-sp-label { font-size: 12px; opacity: 0.5; white-space: nowrap; min-width: 80px; }
.ce-sp-input { flex: 1; padding: 6px 10px; font-size: 13px; font-family: inherit; background: rgba(128,128,128,0.06); border: 1px solid transparent; border-radius: 6px; color: inherit; outline: none; }
.ce-sp-input:focus { border-color: rgba(46,168,106,0.4); }
.ce-sp-input.sm { width: 60px; flex: none; }
.ce-sp-textarea { flex: 1; padding: 6px 10px; font-size: 13px; font-family: inherit; background: rgba(128,128,128,0.06); border: 1px solid transparent; border-radius: 6px; color: inherit; outline: none; resize: vertical; }
.ce-sp-bottom { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid rgba(128,128,128,0.1); }
.ce-sp-gen-btn { padding: 8px 22px; border: none; border-radius: 20px; background: #2ea86a; color: #fff; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 600; }
.ce-sp-gen-btn:hover { background: #258d58; }
.ce-sp-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ce-sp-cancel-btn { padding: 8px 18px; border: 1px solid rgba(128,128,128,0.15); border-radius: 20px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; }
.ce-sp-card { padding: 20px; text-align: center; cursor: pointer; border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; }

/* 标题优化 — 加载 & 结果 */
.ce-sp-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }
.ce-sp-loading p { font-size: 13px; opacity: 0.5; margin: 0; }
.ce-sp-spinner { width: 32px; height: 32px; border: 3px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: ce-spin 0.8s linear infinite; }
@keyframes ce-spin { to { transform: rotate(360deg); } }
.ce-sp-error { padding: 12px; margin: 8px 0; border-radius: 8px; background: rgba(239,68,68,0.08); color: #ef4444; font-size: 12px; }
.ce-sp-results { margin-top: 8px; }
.ce-sp-results-hint { font-size: 11px; opacity: 0.4; margin-bottom: 8px; }
.ce-sp-title-opt { display: block; width: 100%; padding: 10px 14px; margin-bottom: 6px; border: 1px solid rgba(128,128,128,0.12); border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 14px; font-family: inherit; text-align: left; transition: all 0.15s; }
.ce-sp-title-opt:hover { border-color: rgba(46,168,106,0.4); background: rgba(46,168,106,0.06); }
.ce-sp-card:hover { border-color: rgba(46,168,106,0.3); background: rgba(46,168,106,0.04); }
.ce-sp-field { margin-bottom: 8px; }
.ce-sp-field label { display: block; font-size: 11px; opacity: 0.5; margin-bottom: 4px; }
.ce-check { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }

/* Switch toggle */
.ce-switch-btn { width: 36px; height: 20px; border-radius: 10px; border: none; background: rgba(128,128,128,0.2); cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
.ce-switch-btn.on { background: #2ea86a; }
.ce-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
.ce-switch-knob.on { left: 18px; }

/* Tags */
.ce-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.ce-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 12px; background: rgba(128,128,128,0.1); font-size: 11px; }
.ce-tag button { background: transparent; border: none; color: inherit; cursor: pointer; font-size: 10px; opacity: 0.4; padding: 0; }
.ce-tag button:hover { opacity: 1; }

/* Hint box */
.ce-hint-box { padding: 10px 14px; border-radius: 8px; background: rgba(128,128,128,0.04); font-size: 11px; opacity: 0.5; line-height: 1.6; margin: 8px 0; }
.ce-hint-box p { margin: 2px 0; }

/* Word count */
.ce-word-count { font-size: 10px; opacity: 0.35; margin-left: auto; }
.ce-hint { font-size: 11px; opacity: 0.3; text-align: center; padding: 12px 0; }
</style>
