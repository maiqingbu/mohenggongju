<template>
  <div class="op-root">
    <!-- 1. 顶部工具栏 -->
    <div class="op-topbar">
      <div class="op-topbar-left">
        <span class="op-breadcrumb">工作台</span>
        <span class="op-breadcrumb-sep">|</span>
        <span class="op-breadcrumb active">大纲卷纲</span>
      </div>
      <div class="op-topbar-right">
        <button class="op-icon-btn" title="刷新" @click="reloadOutline"><n-icon size="16"><RefreshOutline /></n-icon></button>
      </div>
    </div>

    <!-- AI 功能栏 -->
    <div class="op-ai-bar">
      <div class="op-ai-bar-left">
        <button class="op-ai-btn ghost" @click="emit('toggle-directory')">☰ 隐藏目录</button>
        <button class="op-ai-btn primary" @click="triggerAi('ai-generate-main')">✨ 生成大纲</button>
        <button class="op-ai-btn primary" @click="triggerAi('ai-generate-volume')">✨ 生成卷纲</button>
        <button class="op-ai-btn primary" @click="triggerAi('ai-generate-chapter')">📝 自由章纲</button>
        <button class="op-ai-btn primary" @click="triggerAi('ai-generate-chapter-structured')">📐 结构化章纲</button>
        <button class="op-ai-btn accent" @click="triggerAi('ai-extract-volume')">✨ 总纲提取卷纲</button>
        <button class="op-ai-btn accent" @click="triggerAi('ai-import-chapter')">📥 智能导入章纲</button>
      </div>
      <div class="op-ai-bar-right">
        <button class="op-text-btn" @click="handleImport">↻ 导入</button>
        <button class="op-text-btn" @click="handleExport">↓ 导出</button>
      </div>
    </div>

    <!-- 主体：左右分栏 -->
    <div class="op-body">
      <!-- 2. 左侧边栏 -->
      <aside class="op-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="op-sidebar-header">
          <span class="op-sidebar-title">大纲目录</span>
          <div class="op-sidebar-btns">
            <button class="op-side-btn" title="新增卷" @click="addVolume">+ 卷</button>
          </div>
        </div>
        <div class="op-stats">{{ volumes.length }} 卷 | {{ totalChapters }} 章</div>

        <!-- 大纲树 -->
        <div class="op-tree">
          <!-- 总纲 -->
          <div
            class="op-tree-item main"
            :class="{ selected: selectedType === 'main' }"
            @click="selectMain"
          >
            <span>总纲</span>
            <button v-if="repo.currentWorkId.value" class="op-tree-del" title="清空总纲" @click.stop="deleteOutlineItem('main', repo.currentWorkId.value)">×</button>
          </div>

          <div class="op-tree-label">📚 卷纲 / 章纲</div>

          <template v-for="vol in volumes" :key="'vol'+vol.id">
            <!-- 卷纲 -->
            <div
              class="op-tree-item volume"
              :class="{ selected: selectedType === 'volume' && selectedId === vol.id }"
              @click="selectVolume(vol.id, vol.title)"
            >
              <span class="op-tree-vol-num">{{ vol.sort_order + 1 }}</span>
              <span class="op-tree-vol-title">{{ vol.title || '卷纲 第' + (vol.sort_order + 1) + '卷' }}</span>
              <span class="op-tree-ch-count">{{ (chaptersByVol[vol.id] || []).length }}章</span>
              <button class="op-tree-add-ch" title="新增章" @click.stop="addChapter(vol.id)">+</button>
              <button class="op-tree-del" title="删除卷及卷纲" @click.stop="deleteVolume(vol.id)">×</button>
            </div>

            <!-- 章纲（卷下） -->
            <div
              v-for="ch in (chaptersByVol[vol.id] || [])"
              :key="'ch'+ch.id"
              class="op-tree-item chapter"
              :class="{ selected: selectedType === 'chapter' && selectedId === ch.id }"
              @click="selectChapter(vol.id, ch.id, ch.title)"
            >
              <span class="op-tree-ch-title">{{ ch.title || '章纲 第' + (ch.sort_order + 1) + '章' }}</span>
              <button class="op-tree-del" title="删除章及章纲" @click.stop="deleteChapter(ch.id)">×</button>
            </div>

            <div v-if="!(chaptersByVol[vol.id] || []).length" class="op-tree-empty">
              本卷暂无章节 · <button class="op-tree-add-ch-inline" @click="addChapter(vol.id)">+ 新增</button>
            </div>
          </template>
        </div>
      </aside>

      <div class="op-resizer" @mousedown="startResize"></div>

      <!-- 3. 右侧详情 -->
      <section class="op-detail">
        <template v-if="!editing">
          <div class="op-detail-empty">
            <p>请从左侧选择大纲条目开始编辑</p>
          </div>
        </template>
        <template v-else>
          <!-- 标题栏 -->
          <div class="op-detail-header">
            <span class="op-detail-title">{{ editingTitle }}</span>
            <div class="op-detail-actions">
              <button class="op-icon-btn" title="撤销" @click="undo"><n-icon size="14"><ArrowUndoOutline /></n-icon></button>
              <button class="op-icon-btn" title="重做" @click="redo"><n-icon size="14"><ArrowRedoOutline /></n-icon></button>
              <button v-if="selectedType === 'chapter'"
                class="op-mode-btn"
                :class="{ active: structuredMode }"
                @click="toggleStructuredMode"
              >{{ structuredMode ? '自由' : '结构化' }}</button>
            </div>
          </div>

          <!-- 编辑器（自由文本模式，与作品内容编辑器统一） -->
          <div v-if="!structuredMode" class="op-editor">
            <div
              ref="editorEl"
              class="op-textarea"
              contenteditable="true"
              data-placeholder="开始撰写大纲..."
              @input="onEditorInput"
              @keydown="onEditorKeydown"
              @paste="onEditorPaste"
            ></div>
          </div>

          <!-- 结构化章纲编辑器（11字段） -->
          <div v-if="selectedType === 'chapter' && structuredMode" class="op-structured">
            <!-- 基础定位 -->
            <div class="op-struct-section">
              <div class="op-struct-section-title">📌 基础定位</div>
              <div class="op-struct-row">
                <label>章节标题</label>
                <input class="op-struct-input" v-model="structuredForm.chapterTitle" placeholder="如：第4章：签字笔锋下的逆转" />
              </div>
              <div class="op-struct-row cols-2">
                <div><label>类型</label>
                  <select class="op-struct-input" v-model="structuredForm.chapterType">
                    <option>冲突升级</option><option>揭秘</option><option>解谜</option><option>转折</option><option>过渡</option>
                  </select>
                </div>
                <div><label>字数限制</label>
                  <input class="op-struct-input sm" type="number" v-model.number="structuredForm.wordLimit" min="1000" max="10000" step="500" />
                </div>
              </div>
            </div>

            <!-- 逻辑控制台 -->
            <div class="op-struct-section">
              <div class="op-struct-section-title">🧠 逻辑控制台</div>
              <div class="op-struct-row">
                <label>全部出场角色</label>
                <input class="op-struct-input" v-model="structuredForm.characters" placeholder="角色名用中文逗号分隔" />
              </div>
              <div class="op-struct-row cols-2">
                <div><label>核心场景</label><input class="op-struct-input" v-model="structuredForm.coreScene" placeholder="1-2个具体地点" /></div>
                <div><label>时间跨度</label><input class="op-struct-input" v-model="structuredForm.timeSpan" placeholder="如：七点半至八点十五分" /></div>
              </div>
              <div class="op-struct-row">
                <label>核心爽点</label>
                <input class="op-struct-input" v-model="structuredForm.coreCoolPoint" placeholder="本章最让读者过瘾的1个操作/反转/打脸" />
              </div>
              <div class="op-struct-row">
                <label>底层博弈</label>
                <input class="op-struct-input" v-model="structuredForm.underlyingGame" placeholder="用一句话说明本章的权力/信息/心理博弈本质" />
              </div>
              <div class="op-struct-row">
                <label>本章收益</label>
                <input class="op-struct-input" v-model="structuredForm.chapterGains" placeholder="主角/读者在本章获得的关键信息或能力推进" />
              </div>
            </div>

            <!-- Phase 对齐 -->
            <div class="op-struct-section">
              <div class="op-struct-section-title">📐 Phase 对齐 & 进度控制</div>
              <div class="op-struct-row">
                <label>对应Phase节点</label>
                <input class="op-struct-input" v-model="structuredForm.phaseAlignment" placeholder="如：Phase 1（4-7章），会客厅第一阶段交锋" />
              </div>
              <div class="op-struct-row">
                <label>剧情进度自检</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.progressCheck" rows="2" placeholder="如：当前第4章，Phase规定在第7章结束。7-4=3>0，绝对禁止在本章写完Phase核心结局。"></textarea>
              </div>
            </div>

            <!-- 剧情推演：起承转合 -->
            <div class="op-struct-section">
              <div class="op-struct-section-title">📖 剧情推演（起承转合四段式）</div>
              <div class="op-struct-row">
                <label><span class="op-act-tag act-qi">起</span> 切入与危机</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.act1_entryAndCrisis" rows="3" placeholder="本章开篇如何承接上文，立即抛出的冲突/问题是什么"></textarea>
              </div>
              <div class="op-struct-row">
                <label><span class="op-act-tag act-cheng">承</span> 冲突升级</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.act2_conflictEscalation" rows="3" placeholder="冲突如何在对话/行动/信息揭露中逐层升级"></textarea>
              </div>
              <div class="op-struct-row">
                <label><span class="op-act-tag act-zhuan">转</span> 关键破局</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.act3_keyBreakthrough" rows="3" placeholder="主角用何种手段/信息/规则实现逆转或突破"></textarea>
              </div>
              <div class="op-struct-row">
                <label><span class="op-act-tag act-he">合</span> 余波与代价</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.act4_aftermathAndCost" rows="3" placeholder="逆转后的局面变化、留下的代价或新问题"></textarea>
              </div>
            </div>

            <!-- 黄金钩子 -->
            <div class="op-struct-section">
              <div class="op-struct-section-title">🪝 黄金钩子</div>
              <div class="op-struct-row cols-2">
                <div><label>钩子类型</label>
                  <select class="op-struct-input" v-model="structuredForm.hookType">
                    <option>信息钩</option><option>危机钩</option><option>情绪钩</option>
                  </select>
                </div>
              </div>
              <div class="op-struct-row">
                <label>章末钩子</label>
                <textarea class="op-struct-textarea" v-model="structuredForm.goldenHook" rows="2" placeholder="章末的最后一幕——让读者必须翻下一章的具体画面或信息"></textarea>
              </div>
            </div>
          </div>

          <!-- 底部状态 -->
          <div class="op-detail-footer">
            <span class="op-status">字数 {{ wordCount }}</span>
            <span class="op-save-status" :class="saveStatus">{{ saveStatusText }}</span>
          </div>
        </template>
      </section>
    </div>

    <ChapterOutlineImporter ref="outlineImporter" :is-dark="isDark" />

    <AiModal
      v-if="aiModal.visible"
      :is-dark="isDark"
      :title="aiModal.title"
      :description="aiModal.desc"
      :target-label="aiModal.target"
      :write-label="aiModal.write"
      :template-name="aiModal.templateName"
      :template-desc="aiModal.templateDesc"
      :context-switches="aiModal.contextSwitches || []"
      :special-fields="aiModal.specialFields"
      :field="aiModal.field"
      :hide-chapter="true"
      :skip-strip="aiModal.skipStrip"
      @close="aiModal.visible = false"
      @write="onAiWrite"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { NIcon, useMessage } from 'naive-ui'
import { RefreshOutline, ArrowUndoOutline, ArrowRedoOutline } from '@vicons/ionicons5'
import AiModal, { type ContextSwitch } from './AiModal.vue'
import ChapterOutlineImporter from './ChapterOutlineImporter.vue'
import { getTemplate } from '../composables/useTemplates'
import { useWorkRepo } from '../composables/useWorkRepo'
import { getOutline, upsertOutline, deleteOutline, parseChapterOutlinesText, type OutlineType, type ChapterOutlineStructured } from '../composables/useOutlines'
import { showConfirm } from '../composables/useConfirm'

const props = defineProps<{ isDark?: boolean }>()

const emit = defineEmits<{
  (e: 'toggle-directory'): void
  (e: 'ai-generate-main'): void
  (e: 'ai-generate-volume'): void
  (e: 'ai-extract-volume'): void
  (e: 'ai-import-chapter'): void
}>()

const message = useMessage()
const repo = useWorkRepo()
const sidebarWidth = ref(220)

function startResize(e: MouseEvent) {
  const startX = e.clientX
  const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent) => { sidebarWidth.value = Math.max(160, Math.min(500, startW + ev.clientX - startX)) }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── 左侧树数据 ──
const volumes = computed(() => repo.volumes.value)
const chaptersByVol = computed(() => repo.chapterMap.value)
const totalChapters = computed(() => {
  let n = 0
  for (const chs of Object.values(repo.chapterMap.value)) n += (chs as any[]).length
  return n
})

// ── 选择状态 ──
const selectedType = ref<OutlineType | null>(null)
const selectedId = ref<number | null>(null)
const editingTitle = ref('')

function selectMain() {
  selectedType.value = 'main'
  selectedId.value = repo.currentWorkId.value
  editingTitle.value = '总纲'
  loadOutline()
}

function selectVolume(volId: number, title: string) {
  selectedType.value = 'volume'
  selectedId.value = volId
  editingTitle.value = title || '卷纲 第' + volId + '卷'
  loadOutline()
}

function selectChapter(volId: number, chId: number, title: string) {
  repo.currentChapterId.value = chId
  selectedType.value = 'chapter'
  selectedId.value = chId
  editingTitle.value = title || '章纲'
  loadOutline()
}

// ── 编辑状态 ──
const editing = computed(() => selectedType.value !== null)
const localContent = ref('')
const wordCount = ref(0)
const structuredMode = ref(false)  // 章纲结构化编辑模式
const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')
const saveStatusText = computed(() => ({
  saved: '已保存', saving: '保存中...', unsaved: '未保存',
}[saveStatus.value]))
const editorEl = ref<HTMLDivElement | null>(null)

// ── contentEditable 事件处理 ──
let suppressSync = false

function onEditorInput(e: Event) {
  suppressSync = true
  const el = e.target as HTMLElement
  localContent.value = el.innerText || ''
  suppressSync = false
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
  }
}

function onEditorPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain')
  if (text) document.execCommand('insertText', false, text)
}

// ── 结构化章纲表单状态 ──
const structuredForm = ref<ChapterOutlineStructured>({
  chapterTitle: '', chapterType: '冲突升级', wordLimit: 3000,
  characters: '', coreScene: '', timeSpan: '', coreCoolPoint: '',
  underlyingGame: '', chapterGains: '',
  phaseAlignment: '', progressCheck: '',
  act1_entryAndCrisis: '', act2_conflictEscalation: '',
  act3_keyBreakthrough: '', act4_aftermathAndCost: '',
  goldenHook: '', hookType: '信息钩',
})

let lastLoadedContent = ''
let isLoading = false

// ── 加载大纲 ──
async function loadOutline() {
  if (!selectedType.value) return
  isLoading = true
  try {
    if (!repo.currentWorkId.value) {
      localContent.value = ''; wordCount.value = 0; lastLoadedContent = ''; return
    }
    const outline = await getOutline(selectedType.value, selectedId.value)
    if (outline) {
      localContent.value = outline.content || ''
      wordCount.value = outline.word_count
      // 同步到 contentEditable div
      if (editorEl.value && editorEl.value.innerText !== localContent.value) {
        editorEl.value.innerText = localContent.value
      }
      // 加载结构化数据（仅章纲）
      if (outline.structuredData) {
        structuredForm.value = { ...structuredForm.value, ...outline.structuredData }
        structuredMode.value = true
      } else {
        // 尝试从 content 解析旧格式 JSON
        tryParseStructuredFromContent(outline.content)
      }
    } else {
      localContent.value = ''
      wordCount.value = 0
      resetStructuredForm()
    }
    lastLoadedContent = localContent.value
    saveStatus.value = 'saved'
  } finally {
    setTimeout(() => { isLoading = false }, 0)
  }
}

/** 尝试从自由文本 content 中解析结构化 JSON（向后兼容） */
function tryParseStructuredFromContent(content: string) {
  if (!content) return
  try {
    const parsed = JSON.parse(content)
    if (parsed.chapterTitle || parsed.coreScene || parsed.act1_entryAndCrisis) {
      structuredForm.value = { ...structuredForm.value, ...parsed }
      structuredMode.value = true
    }
  } catch {
    // 不是 JSON，保持自由文本模式
    structuredMode.value = false
  }
}

function resetStructuredForm() {
  structuredForm.value = {
    chapterTitle: '', chapterType: '冲突升级', wordLimit: 3000,
    characters: '', coreScene: '', timeSpan: '', coreCoolPoint: '',
    underlyingGame: '', chapterGains: '',
    phaseAlignment: '', progressCheck: '',
    act1_entryAndCrisis: '', act2_conflictEscalation: '',
    act3_keyBreakthrough: '', act4_aftermathAndCost: '',
    goldenHook: '', hookType: '信息钩',
  }
  structuredMode.value = false
}

/** 切换自由/结构化章纲模式，保留双方数据 */
async function toggleStructuredMode() {
  if (selectedType.value !== 'chapter') return

  // 先保存当前模式下的数据
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  await doSave()

  const switchingTo = !structuredMode.value

  if (switchingTo) {
    // 自由 → 结构化：从 DB 重新加载，填充 structuredForm
    isLoading = true
    try {
      const outline = await getOutline('chapter', selectedId.value)
      if (outline?.structuredData) {
        structuredForm.value = { ...structuredForm.value, ...outline.structuredData }
      } else if (outline?.content) {
        // 尝试从 content 解析 JSON（旧格式兼容）
        try {
          const parsed = JSON.parse(outline.content)
          if (parsed.chapterTitle || parsed.coreScene || parsed.act1_entryAndCrisis) {
            structuredForm.value = { ...structuredForm.value, ...parsed }
          }
        } catch { /* 保持当前 structuredForm */ }
      }
    } finally {
      isLoading = false
    }
  } else {
    // 结构化 → 自由：将 structuredForm 转为可读文本显示
    const formatted = formatChapterOutlineAsText(structuredForm.value)
    localContent.value = formatted
    lastLoadedContent = formatted
    wordCount.value = countWordsCn(formatted)
    if (editorEl.value) {
      editorEl.value.innerText = formatted
    }
  }

  structuredMode.value = switchingTo
}

/** 将结构化章纲转为自由文本（可读格式，非 JSON） */
function formatChapterOutlineAsText(sd: ChapterOutlineStructured): string {
  const lines: string[] = []
  if (sd.chapterTitle) lines.push(sd.chapterTitle)
  else lines.push('章纲')
  lines.push('')
  if (sd.chapterType) lines.push(`类型：${sd.chapterType}`)
  if (sd.wordLimit) lines.push(`字数限制：${sd.wordLimit}`)
  lines.push('')
  lines.push('【逻辑控制台】')
  if (sd.characters) lines.push(`出场角色：${sd.characters}`)
  if (sd.coreScene) lines.push(`核心场景：${sd.coreScene}`)
  if (sd.timeSpan) lines.push(`时间跨度：${sd.timeSpan}`)
  if (sd.coreCoolPoint) lines.push(`核心爽点：${sd.coreCoolPoint}`)
  if (sd.underlyingGame) lines.push(`底层博弈：${sd.underlyingGame}`)
  if (sd.chapterGains) lines.push(`本章收益：${sd.chapterGains}`)
  lines.push('')
  if (sd.phaseAlignment || sd.progressCheck) {
    lines.push('【Phase 对齐 & 进度控制】')
    if (sd.phaseAlignment) lines.push(`对应Phase节点：${sd.phaseAlignment}`)
    if (sd.progressCheck) lines.push(`剧情进度自检：${sd.progressCheck}`)
    lines.push('')
  }
  lines.push('【剧情推演·起承转合】')
  if (sd.act1_entryAndCrisis) lines.push(`起（切入与危机）：${sd.act1_entryAndCrisis}`)
  if (sd.act2_conflictEscalation) lines.push(`承（冲突升级）：${sd.act2_conflictEscalation}`)
  if (sd.act3_keyBreakthrough) lines.push(`转（关键破局）：${sd.act3_keyBreakthrough}`)
  if (sd.act4_aftermathAndCost) lines.push(`合（余波与代价）：${sd.act4_aftermathAndCost}`)
  lines.push('')
  if (sd.goldenHook) {
    const hookLabel = sd.hookType ? `黄金${sd.hookType}` : '黄金钩子'
    lines.push(`【${hookLabel}】`)
    lines.push(sd.goldenHook)
  }
  return lines.join('\n')
}

function reloadOutline() {
  if (selectedType.value) loadOutline()
  message.success('已刷新')
}

// ── 自动保存 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null

watch(localContent, (val) => {
  if (val === lastLoadedContent || isLoading) return
  wordCount.value = countWordsCn(val)
  saveStatus.value = 'unsaved'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(doSave, 500)
})

// 结构化表单变化时也触发自动保存
watch(structuredForm, () => {
  if (!structuredMode.value || isLoading) return
  saveStatus.value = 'unsaved'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(doSave, 500)
}, { deep: true })

onUnmounted(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (saveStatus.value === 'unsaved') doSave().catch(e => console.error('OutlinePanel unmount save failed:', e))
})

async function doSave() {
  if (!selectedType.value || !repo.currentWorkId.value || selectedId.value === null) return
  saveStatus.value = 'saving'
  try {
    const volumeId = selectedType.value === 'volume' || selectedType.value === 'chapter'
      ? (selectedType.value === 'volume' ? selectedId.value : findVolumeOfChapter(selectedId.value!))
      : undefined
    // 结构化模式下：将 structuredForm 序列化为 content；章纲始终保留 structuredData
    const content = structuredMode.value && selectedType.value === 'chapter'
      ? JSON.stringify(structuredForm.value, null, 2)
      : localContent.value
    await upsertOutline({
      workId: repo.currentWorkId.value,
      type: selectedType.value,
      volumeId: selectedType.value === 'volume' ? selectedId.value : volumeId,
      chapterId: selectedType.value === 'chapter' ? selectedId.value : undefined,
      content,
      structuredData: selectedType.value === 'chapter' ? structuredForm.value : undefined,
    })
    lastLoadedContent = content
    saveStatus.value = 'saved'
  } catch (err) {
    console.error('大纲保存失败', err)
    saveStatus.value = 'unsaved'
  }
}

function findVolumeOfChapter(chId: number): number | null {
  for (const [volId, chs] of Object.entries(repo.chapterMap.value)) {
    if (chs.some(c => c.id === chId)) return Number(volId)
  }
  return null
}

function countWordsCn(text: string): number {
  return (text.match(/[一-龥]/g) || []).length + (text.match(/[a-zA-Z]+/g) || []).length
}

function undo() { document.execCommand('undo') }
function redo() { document.execCommand('redo') }

// ── 大纲目录增删 ──
async function addVolume() {
  const title = window.prompt?.('请输入卷名', `第${volumes.value.length + 1}卷`)
  if (!title?.trim()) return
  await repo.addVolume(repo.currentWorkId.value!, title.trim())
  message.success('已创建新卷')
}

async function addChapter(volumeId: number) {
  const count = (chaptersByVol.value[volumeId] || []).length
  const title = window.prompt?.('请输入章节名', `第${count + 1}章`)
  if (!title?.trim()) return
  const chId = await repo.addChapter(volumeId, title.trim())
  if (chId) message.success('已创建新章节')
}

async function deleteVolume(volId: number) {
  const vol = volumes.value.find((v: any) => v.id === volId)
  const name = vol?.title || `第${volId}卷`
  showConfirm(`删除「${name}」及其所有章节和大纲数据？此操作不可撤销。`, async () => {
  // 删除该卷下所有章的章纲
  for (const ch of (chaptersByVol.value[volId] || [])) {
    await deleteOutline('chapter', ch.id).catch(() => {})
  }
  // 删除卷纲
  await deleteOutline('volume', volId).catch(() => {})
  // 删除卷
  await repo.removeVolume(volId)
  // 如果当前选中了被删除的条目，清空编辑区
  if (selectedType.value === 'volume' && selectedId.value === volId) {
    localContent.value = ''; selectedType.value = null; selectedId.value = null
  }
  message.success('已删除「' + name + '」')
  })
}

async function deleteChapter(chId: number) {
  const volId = findVolumeOfChapter(chId)
  if (volId === null) { message.error('未找到该章节所属的卷'); return }
  const ch = Object.values(chaptersByVol.value).flat().find((c: any) => c.id === chId) as any
  const name = ch?.title || `第${chId}章`
  showConfirm(`删除「${name}」及其章纲数据？此操作不可撤销。`, async () => {
  await deleteOutline('chapter', chId).catch(() => {})
  await repo.removeChapter(volId, chId)
  if (selectedType.value === 'chapter' && selectedId.value === chId) {
    localContent.value = ''; selectedType.value = null; selectedId.value = null
  }
  message.success('已删除「' + name + '」')
  })
}

async function deleteOutlineItem(type: OutlineType, refId: number) {
  if (type === 'main') {
    showConfirm('清空总纲内容？此操作不可撤销。', async () => {
    await deleteOutline('main', refId).catch(() => {})
    if (selectedType.value === 'main') localContent.value = ''
    message.success('总纲已清空')
    reloadOutline()
    })
  }
}

// ── AI 弹窗 ──
const aiModal = reactive({ visible: false, title: '', desc: '', target: '', write: '', field: '', templateName: '', templateDesc: '', skipStrip: false, specialFields: [] as any[], contextSwitches: [] as any[] })

const outlineImporter = ref<InstanceType<typeof ChapterOutlineImporter> | null>(null)

function triggerAi(action: string) {
  if (action === 'ai-import-chapter') { outlineImporter.value?.open(); return }
  const cfg: Record<string, any> = {
    'ai-generate-main': { title: '总纲生成', desc: '基于作品设定与核心构架，生成全书总纲（主题、梗概、三幕结构、卷规划）。', target: '写入总纲', write: '✓ 智能写入', templateKey: 'op_genMain', specialFields: [{ key:'chaptersPerVol', label:'单卷章节数 *', type:'number', defaultValue:50 }], contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台（影响写作口味）', enabled:true },{ key:'targetWordCount', label:'目标字数', desc:'目标总字数（默认100万）', enabled:true },{ key:'recentChapters', label:'前N章正文', desc:'最近 N 章有效正文拼接', enabled:true, hasCount:true, count:3, countMin:1, countMax:20 },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
    'ai-generate-volume': { title: '卷纲生成', desc: '基于总纲与当前剧情进度，规划当前卷的主线推进、阶段冲突与章节布局。', target: '写入卷纲', write: '✓ 智能写入', templateKey: 'op_genVolume', specialFields: [{ key:'chaptersPerVol', label:'单卷章节数 *', type:'number', defaultValue:50 },{ key:'startChapter', label:'开始章数 *', type:'number', defaultValue:1 },{ key:'endChapter', label:'结束章数 *', type:'number', defaultValue:50 }], contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲（必带）', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台信息', enabled:true },{ key:'currentVolumeCount', label:'当前卷数', desc:'下一章所在卷数（默认50章/卷）', enabled:true },{ key:'specificChapterBody', label:'第N章正文', desc:'指定章节正文（可手填章节号）', enabled:true, hasCount:true, count:17, countMin:1, countMax:9999 },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
    'ai-generate-chapter': { title: '自由章纲生成', desc: '基于卷纲与当前剧情进度，为选定章节生成自由文本章纲（核心场景、人物出场、冲突推进、信息揭露、结尾落点）。', target: '写入章纲', write: '✓ 智能写入', templateKey: 'op_genChapter', specialFields: [{ key:'startCh', label:'起始章节', type:'number', defaultValue:1 },{ key:'endCh', label:'结束章节', type:'number', defaultValue:1 }], contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲', enabled:true },{ key:'volumeOutline', label:'卷纲', desc:'当前卷纲', enabled:true },{ key:'previousChapterOutline', label:'前文章纲', desc:'前一章的章纲（承接参考）', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台（影响写作口味）', enabled:true },{ key:'currentVolumeCount', label:'当前卷数', desc:'下一章所在卷数', enabled:true },{ key:'currentChapterCount', label:'目前章数', desc:'有效连载进度', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
    'ai-generate-chapter-structured': { title: '结构化章纲', desc: '6 模块结构化章纲提示词：基础定位/前置承接/人物即时状态/叙事任务/文字要求/真人感补充。', target: '写入章纲', write: '✓ 智能写入', templateKey: 'op_genChapterStructured', specialFields: [{ key:'startCh', label:'起始章节', type:'number', defaultValue:1 },{ key:'endCh', label:'结束章节', type:'number', defaultValue:10 }], contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲', enabled:true },{ key:'volumeOutline', label:'卷纲', desc:'当前卷纲', enabled:true },{ key:'previousChapterOutline', label:'前文章纲', desc:'前一章的章纲（承接参考）', enabled:true },{ key:'charStateSnapshot', label:'角色状态快照', desc:'所有角色当前状态（位置/情绪/目标）', enabled:true },{ key:'foreshadowStatus', label:'伏笔状态', desc:'全部伏笔回收状态汇总', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/简介/文风/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'settings', label:'设定数据', desc:'角色/设定条目/伏笔/秘密', enabled:true },{ key:'platform', label:'发布平台', desc:'发布平台（影响写作口味）', enabled:true },{ key:'currentVolumeCount', label:'当前卷数', desc:'下一章所在卷数', enabled:true },{ key:'currentChapterCount', label:'目前章数', desc:'有效连载进度', enabled:true },{ key:'recentChapterOutlines', label:'前N章章纲', desc:'最近 N 章章纲拼接', enabled:true, hasCount:true, count:5, countMin:1, countMax:20 },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
    'ai-extract-volume': { title: '总纲提取卷纲', desc: '从已生成的总纲中智能提取并拆分为各卷纲，自动写入卷纲目录。', target: '写入卷纲', write: '✓ 批量创建', templateKey: 'op_genVolume', contextSwitches: [{ key:'outline', label:'总纲', desc:'全书总纲（必带）', enabled:true },{ key:'base', label:'基础信息', desc:'书名/类型/标签/目标字数', enabled:true },{ key:'core', label:'核心构架', desc:'世界观/主角/力量体系/金手指', enabled:true },{ key:'supplement', label:'补充信息', desc:'审批弹窗/AI工具的附加指令输入框', enabled:true }] },
  }
  const c = cfg[action]
  if (c) {
    const tpl = getTemplate(c.templateKey as any)
    aiModal.visible = true
    aiModal.title = c.title
    aiModal.desc = c.desc
    aiModal.target = c.target
    aiModal.write = c.write
    aiModal.field = action
    aiModal.templateName = tpl.name
    aiModal.templateDesc = tpl.desc
    aiModal.skipStrip = action === 'ai-generate-chapter-structured'  // 结构化章纲用「---」分隔多章，不能剥离
    aiModal.contextSwitches = (c.contextSwitches || []).map((cs: any) => ({...cs}))
    aiModal.specialFields = (c.specialFields || []).map((f: any) => ({...f}))
  } else { emit(action as any) }
}

async function onAiWrite(value: string) {
  const workId = repo.currentWorkId.value
  if (!workId) { message.warning('请先选择作品'); return }

  if (aiModal.field === 'ai-generate-main') {
    // ── 总纲：整篇写入 ──
    selectedType.value = 'main'; selectedId.value = workId
    editingTitle.value = '总纲'
    localContent.value = value; lastLoadedContent = value
    wordCount.value = countWordsCn(value)
    await doSave()
    aiModal.visible = false
    message.success('总纲已写入')
    return
  }

  if (aiModal.field === 'ai-generate-volume' || aiModal.field === 'ai-extract-volume') {
    // ── 卷纲：按 ## 标题拆分为独立卷 ──
    const sections = splitOutlineSections(value, 'volume')
    if (sections.length === 0) {
      message.error('未能解析出卷纲章节，请确保 AI 输出包含"## 第X卷"标题')
      return
    }

    // 确保有第一卷（卷纲至少需要一个卷）
    let vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    const firstVol = vols[0]

    let written = 0
    for (let i = 0; i < sections.length; i++) {
      const { title, content } = sections[i]
      // 查找或创建对应卷
      let vol = vols[i]
      if (!vol) {
        const newId = await repo.addVolume(workId, title || `第${i + 1}卷`)
        if (!newId) continue
        vol = { id: newId, title: title || `第${i + 1}卷` } as any
        vols.push(vol)
      } else if (title && vol.title !== title) {
        // 更新卷名
        try { await repo.renameVolume((vol as any).id, title) } catch {}
      }
      // 写入该卷的卷纲
      const volId = (vol as any).id
      console.log('[OutlinePanel] 保存卷纲, volumeId:', volId, 'title:', vol.title)
      const result = await upsertOutline({
        workId, type: 'volume',
        volumeId: volId,
        content,
      })
      console.log('[OutlinePanel] 卷纲保存结果:', result ? '成功' : '失败', 'ref_id:', result?.ref_id)
      written++
    }

    // 选中最后一个写入的卷
    if (written > 0) {
      selectedType.value = 'volume'
      selectedId.value = (vols[written - 1] as any).id
      try { await loadOutline() } catch {}
      editingTitle.value = (vols[written - 1] as any).title || `第${written}卷`
    }

    aiModal.visible = false
    message.success(`卷纲已写入 ${written} 卷（共创建/更新 ${written} 个卷目录）`)
    return
  }

  if (aiModal.field === 'ai-import-chapter') {
    // ── 章纲：解析 + 按 specialFields 补齐 ──
    const sections = splitOutlineSections(value, 'chapter')

    // 从 specialFields 获取期望的章节数
    let expectedCount = sections.length
    if (aiModal.specialFields) {
      for (const sf of aiModal.specialFields) {
        if ((sf.key === 'startCh' || sf.key === 'startChapter') && sf.defaultValue) {
          const start = Number(sf.defaultValue) || 1
          const endField = aiModal.specialFields.find((f: any) => f.key === 'endCh' || f.key === 'endChapter')
          const end = endField ? (Number(endField.defaultValue) || start) : start
          if (end >= start) expectedCount = end - start + 1
        }
      }
    }

    // 确保有卷
    let vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    if (vols.length === 0) {
      const newVolId = await repo.addVolume(workId, '第一卷')
      if (newVolId) vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    }
    if (vols.length === 0) { message.error('请先创建至少一个卷'); return }

    const targetVol = vols[0] as any

    // 扫描目标卷中已有章节（按 sort_order）及章纲
    const existingInVol = (repo.chapterMap.value[targetVol.id] || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
    const existingByOrder = new Map<number, any>()
    for (const ch of existingInVol) {
      existingByOrder.set(ch.sort_order + 1, ch) // sort_order 从0起，章号从1起
    }

    // 检测是否有章纲目录冲突
    const maxCh = Math.max(sections.length, expectedCount)
    const outlineChecks: Promise<any>[] = []
    for (let i = 0; i < maxCh; i++) {
      const chNo = i + 1
      const existing = existingByOrder.get(chNo)
      if (existing) {
        outlineChecks.push(getOutline('chapter', existing.id).then(o => ({ chNo, existing, hasOutline: !!o })))
      }
    }
    const outlineResults = await Promise.all(outlineChecks)
    const existingOutlineChs = outlineResults.filter(r => r.hasOutline)
    if (existingOutlineChs.length > 0) {
      const names = existingOutlineChs.map(r => `第${r.chNo}章「${r.existing.title || ''}」`).join('、')
      showConfirm(`检测到以下章节已有章纲：\n${names}\n\n导入将覆盖章纲内容。是否继续？`, () => {
        doImportWrite()
      })
      return
    }
    await doImportWrite()
    return

    async function doImportWrite() {
    let written = 0
    let reusedCount = 0

    // 写入成功解析出的章节
    for (let i = 0; i < sections.length; i++) {
      const { title, content } = sections[i]
      const chNo = i + 1
      const existing = existingByOrder.get(chNo)
      let chId: number | null = null

      if (existing) {
        chId = existing.id
        reusedCount++
      } else {
        chId = await repo.addChapter(targetVol.id, title || `第${chNo}章`)
      }

      if (!chId) continue
      await upsertOutline({ workId, type: 'chapter', volumeId: targetVol.id, chapterId: chId, content })
      written++
    }

    // 如果解析出的章节数不足，补齐空章
    if (written < expectedCount) {
      for (let i = written; i < expectedCount; i++) {
        const chNo = i + 1
        const existing = existingByOrder.get(chNo)
        let chId: number | null = null

        if (existing) {
          chId = existing.id
          reusedCount++
        } else {
          chId = await repo.addChapter(targetVol.id, `第${chNo}章`)
        }

        if (!chId) continue
        await upsertOutline({ workId, type: 'chapter', volumeId: targetVol.id, chapterId: chId, content: sections.length > 0 ? '（内容未能自动拆分，请手动编辑）' : value.slice(0, 2000) })
        written++
      }
    }

    // 如果只解析出 1 段但期望多章，把全量内容写入第一个章
    if (sections.length === 1 && expectedCount > 1 && written >= expectedCount) {
      // 更新第一章的内容为全量
      const firstNewCh = (chaptersByVol.value[targetVol.id] || []).slice(-expectedCount)[0]
      if (firstNewCh) {
        await upsertOutline({ workId, type: 'chapter', volumeId: targetVol.id, chapterId: firstNewCh.id, content: value })
      }
    }

    // 选中第一个新写的章
    if (written > 0) {
      selectedType.value = 'chapter'
      const newChs = chaptersByVol.value[targetVol.id] || []
      const firstNew = newChs[Math.max(0, newChs.length - written)]
      if (firstNew) {
        selectedId.value = firstNew.id
        try { await loadOutline() } catch {}
        editingTitle.value = firstNew.title || '章纲'
      }
    }

    aiModal.visible = false
    const reuseMsg = reusedCount > 0 ? `（复用已有章节 ${reusedCount} 个）` : ''
    message.success(`章纲已写入 ${written} 章${reuseMsg}（卷「${targetVol.title || '第一卷'}」）`)
    return
  }
  }

  if (aiModal.field === 'ai-generate-chapter') {
    // ── 自由章纲：按 ## 标题拆分为独立章，写入自由文本 ──
    const sections = splitOutlineSections(value, 'chapter')

    // 确保有卷
    let vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    if (vols.length === 0) {
      const newVolId = await repo.addVolume(workId, '第一卷')
      if (newVolId) vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    }
    if (vols.length === 0) { message.error('请先创建至少一个卷'); return }
    const targetVol = vols[0] as any

    // 获取起始章节号
    let startCh = 1
    if (aiModal.specialFields) {
      for (const sf of aiModal.specialFields) {
        if ((sf.key === 'startCh' || sf.key === 'startChapter') && sf.defaultValue) {
          startCh = Number(sf.defaultValue) || 1
        }
      }
    }

    const existingInVol = (repo.chapterMap.value[targetVol.id] || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
    const existingByOrder = new Map<number, any>()
    for (const ch of existingInVol) existingByOrder.set(ch.sort_order + 1, ch)

    // 如果 AI 没有分章输出，全文写入单章
    if (!sections.length || (sections.length === 1 && !sections[0].title.includes('第'))) {
      const chNo = startCh
      const existing = existingByOrder.get(chNo)
      let chId: number | null = null
      if (existing) {
        chId = existing.id
      } else {
        chId = await repo.addChapter(targetVol.id, `第${chNo}章`)
      }
      if (chId) {
        await upsertOutline({ workId, type: 'chapter', volumeId: targetVol.id, chapterId: chId, content: value })
        selectedType.value = 'chapter'
        selectedId.value = chId
        editingTitle.value = `第${chNo}章`
        try { await loadOutline() } catch {}
      }
      aiModal.visible = false
      message.success('章纲已写入')
      return
    }

    let written = 0
    let saveErrors: string[] = []
    for (let i = 0; i < sections.length; i++) {
      const { title, content } = sections[i]
      const chNo = startCh + i
      const existing = existingByOrder.get(chNo)
      let chId: number | null = null
      try {
        if (existing) {
          chId = existing.id
        } else {
          chId = await repo.addChapter(targetVol.id, title || `第${chNo}章`)
        }
        if (!chId) continue
        const result = await upsertOutline({ workId, type: 'chapter', volumeId: targetVol.id, chapterId: chId, content })
        if (!result) {
          saveErrors.push(`第${chNo}章：保存返回空结果`)
          continue
        }
        written++
      } catch (e: any) {
        saveErrors.push(`第${chNo}章：${e.message || e}`)
      }
    }
    if (saveErrors.length) {
      console.error('自由章纲写入错误', saveErrors)
      if (written === 0) {
        message.error(`写入失败：${saveErrors.slice(0, 3).join('；')}`)
        aiModal.visible = false
        return
      }
      message.warning(`部分写入成功（${written}/${sections.length}），失败：${saveErrors.slice(0, 2).join('；')}`)
    }

    if (written > 0) {
      selectedType.value = 'chapter'
      const newChs = chaptersByVol.value[targetVol.id] || []
      const firstNew = newChs.find((c: any) => (c.sort_order + 1) === startCh)
      if (firstNew) {
        selectedId.value = firstNew.id
        try { await loadOutline() } catch {}
        editingTitle.value = firstNew.title || `第${startCh}章`
      }
    }

    aiModal.visible = false
    message.success(`自由章纲已写入 ${written} 章（卷「${targetVol.title || '第一卷'}」）`)
    return
  }

  if (aiModal.field === 'ai-generate-chapter-structured') {
    // ── 结构化章纲：解析中文标签文本，按章节写入结构化数据 ──
    const parsedChapters = parseChapterOutlinesText(value)
    if (!parsedChapters.length) {
      message.error('未能从 AI 输出中解析结构化章纲，请检查输出格式是否为中文标签列表。详情查看控制台日志。')
      return
    }

    // 确保有卷
    let vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    if (vols.length === 0) {
      const newVolId = await repo.addVolume(workId, '第一卷')
      if (newVolId) vols = repo.volumes.value.filter((v: any) => v.work_id === workId)
    }
    if (vols.length === 0) { message.error('请先创建至少一个卷'); return }
    const targetVol = vols[0] as any

    // 获取起始章节号
    let startCh = 1
    if (aiModal.specialFields) {
      for (const sf of aiModal.specialFields) {
        if ((sf.key === 'startCh' || sf.key === 'startChapter') && sf.defaultValue) {
          startCh = Number(sf.defaultValue) || 1
        }
      }
    }

    const existingInVol = (repo.chapterMap.value[targetVol.id] || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
    const existingByOrder = new Map<number, any>()
    for (const ch of existingInVol) existingByOrder.set(ch.sort_order + 1, ch)

    let written = 0
    let saveErrors: string[] = []
    for (let i = 0; i < parsedChapters.length; i++) {
      const chNo = startCh + i
      const { chapterTitle, data } = parsedChapters[i]
      const existing = existingByOrder.get(chNo)
      let chId: number | null = null
      try {
        if (existing) {
          chId = existing.id
        } else {
          // 用解析出的标题或第N章作为章节名
          const chName = chapterTitle || `第${chNo}章`
          chId = await repo.addChapter(targetVol.id, chName)
        }
        if (!chId) continue
        const result = await upsertOutline({
          workId, type: 'chapter', volumeId: targetVol.id, chapterId: chId,
          content: value.slice(0, 2000), // 保存原始文本片段作为摘要
          structuredData: { ...data, chapterTitle: chapterTitle || data.chapterTitle || `第${chNo}章` } as ChapterOutlineStructured,
        })
        if (!result) {
          saveErrors.push(`第${chNo}章：保存返回空结果`)
          continue
        }
        written++
      } catch (e: any) {
        saveErrors.push(`第${chNo}章：${e.message || e}`)
      }
    }

    if (saveErrors.length) {
      console.error('结构化章纲写入错误', saveErrors)
      if (written === 0) {
        message.error(`写入失败：${saveErrors.slice(0, 3).join('；')}`)
        aiModal.visible = false
        return
      }
      message.warning(`部分写入成功（${written}/${parsedChapters.length}），失败：${saveErrors.slice(0, 2).join('；')}`)
    }

    // 选中第一个
    if (written > 0) {
      selectedType.value = 'chapter'
      const newChs = chaptersByVol.value[targetVol.id] || []
      const firstNew = newChs.find((c: any) => (c.sort_order + 1) === startCh)
      if (firstNew) {
        selectedId.value = firstNew.id
        structuredMode.value = true
        try {
          const outline = await getOutline('chapter', firstNew.id)
          if (outline?.structuredData) structuredForm.value = { ...structuredForm.value, ...outline.structuredData }
        } catch {}
        editingTitle.value = firstNew.title || `第${startCh}章`
      }
    }

    aiModal.visible = false
    if (written > 0) {
      message.success(`结构化章纲已写入 ${written} 章（卷「${targetVol.title || '第一卷'}」）`)
    }
    return
  }

  // fallback
  localContent.value = value
  await doSave()
  aiModal.visible = false
  message.success('AI 内容已写入')
}

// 中文数字映射
const CN_NUMS: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20 }

/** 从一行文本中提取章/卷序号，支持多种格式 */
function parseSectionNumber(line: string, type: 'volume' | 'chapter'): number | null {
  const suffix = type === 'volume' ? '卷' : '章'
  // 匹配: ### 第1章 / ## 第1章 / # 第1章 / 第1章 / ### 第一章 / **第1章**
  const patterns = [
    new RegExp(`^#{1,3}\\s*第\\s*(\\d+)\\s*${suffix}`),
    new RegExp(`^#{1,3}\\s*第\\s*([${Object.keys(CN_NUMS).join('')}]+)\\s*${suffix}`),
    new RegExp(`^\\*{0,2}第\\s*(\\d+)\\s*${suffix}`),
    new RegExp(`^\\*{0,2}第\\s*([${Object.keys(CN_NUMS).join('')}]+)\\s*${suffix}`),
  ]
  for (const pat of patterns) {
    const m = line.match(pat)
    if (m) {
      const n = parseInt(m[1])
      return isNaN(n) ? (CN_NUMS[m[1]] || null) : n
    }
  }
  return null
}

/** 从 AI 输出中按章节标题拆分为独立节 */
function splitOutlineSections(text: string, type: 'volume' | 'chapter'): { title: string; content: string }[] {
  const lines = text.split('\n')
  const sections: { title: string; content: string }[] = []
  let currentTitle = ''
  let currentLines: string[] = []
  let foundAny = false

  for (const line of lines) {
    const n = parseSectionNumber(line, type)
    if (n !== null) {
      foundAny = true
      if (currentTitle || currentLines.some(l => l.trim())) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = line.replace(/^[#*]+\s*/, '').trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentTitle || currentLines.some(l => l.trim())) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  // 没有标题 → 尝试按空行粗略拆分（假设每个空行段是一个章）
  if (!foundAny && text.trim()) {
    const blocks = text.split(/\n\n+/).filter(b => b.trim())
    if (blocks.length > 1) {
      for (let i = 0; i < blocks.length; i++) {
        const firstLine = blocks[i].split('\n')[0].replace(/^[#*]+\s*/, '').trim()
        sections.push({ title: firstLine || `第${i + 1}${type === 'volume' ? '卷' : '章'}`, content: blocks[i].trim() })
      }
    } else {
      const firstLine = lines[0]?.replace(/^[#*]+\s*/, '').trim() || ''
      sections.push({ title: firstLine || (type === 'volume' ? '第一卷' : '第1章'), content: text.trim() })
    }
  }

  return sections
}


// ── 导入/导出 ──
function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.md,.json,.txt'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || ''
      if (!text.trim()) { message.warning('文件内容为空'); return }
      // 尝试解析 JSON（从其他工具导出的结构化大纲）
      try {
        const json = JSON.parse(text)
        if (json.content) {
          localContent.value = json.content
        } else if (typeof json === 'string') {
          localContent.value = json
        } else {
          localContent.value = text
        }
      } catch {
        // 纯文本/markdown 大纲
        localContent.value = text
      }
      wordCount.value = countWordsCn(localContent.value)
      lastLoadedContent = localContent.value
      saveStatus.value = 'unsaved'
      doSave()
      message.success('大纲已导入')
    }
    reader.readAsText(file)
  }
  input.click()
}
function handleExport() {
  if (!localContent.value.trim()) { message.warning('当前大纲为空'); return }
  const blob = new Blob([localContent.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `outline-${selectedType.value || 'main'}.md`; a.click()
  URL.revokeObjectURL(url)
  message.success('已导出')
}

// ── 初始化 ──
onMounted(() => {
  if (repo.currentWorkId.value) {
    selectMain()
  }
})

defineExpose({ reloadOutline, triggerAi })
</script>

<style scoped>
.op-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* 顶部 */
.op-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.op-breadcrumb { font-size: 11px; opacity: 0.45; }
.op-breadcrumb.active { opacity: 0.75; font-weight: 500; }
.op-breadcrumb-sep { margin: 0 6px; opacity: 0.25; }
.op-topbar-right { display: flex; gap: 4px; }
.op-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--btn-color);
}
.op-icon-btn:hover { background: var(--btn-hover-bg); }

/* AI 功能栏 */
.op-ai-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
  background: rgba(128,128,128,0.02); gap: 8px;
}
.op-ai-bar-left { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.op-ai-bar-right { display: flex; gap: 4px; }
.op-ai-btn {
  padding: 3px 10px; font-size: 11px; font-family: inherit; border: none;
  border-radius: 4px; cursor: pointer; font-weight: 500;
  transition: background 0.15s;
}
.op-ai-btn.primary { background: #2ea86a; color: #fff; }
.op-ai-btn.primary:hover { background: #258d58; }
.op-ai-btn.accent { background: #2ea86a; color: #fff; }
.op-ai-btn.accent:hover { background: #258d58; }
.op-ai-btn.ghost { background: transparent; color: inherit; opacity: 0.5; }
.op-ai-btn.ghost:hover { opacity: 1; background: rgba(128,128,128,0.1); }
.op-text-btn {
  background: rgba(200,160,80,0.1); border: 1px solid rgba(200,160,80,0.3);
  border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;
  font-family: inherit; color: #d4a040;
}
.op-text-btn:hover { background: rgba(200,160,80,0.2); }

/* 主体 */
.op-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* 左侧栏 */
.op-resizer { width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent; transition: background 0.2s; }
.op-resizer:hover { background: rgba(128,128,128,0.2); }
.op-sidebar {
  flex-shrink: 0; border-right: 1px solid var(--border-color);
  display: flex; flex-direction: column; overflow: hidden;
}
.op-sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 10px; border-bottom: 1px solid var(--border-color);
}
.op-sidebar-title { font-size: 12px; font-weight: 600; opacity: 0.5; }
.op-sidebar-btns { display: flex; gap: 2px; }
.op-side-btn {
  width: 24px; height: 24px; border: none; border-radius: 3px;
  background: transparent; cursor: pointer; font-size: 12px; opacity: 0.5;
}
.op-side-btn:hover { opacity: 1; background: rgba(128,128,128,0.1); }
.op-stats {
  padding: 6px 10px; font-size: 11px; opacity: 0.4; border-bottom: 1px solid var(--border-color);
}

/* 大纲树 */
.op-tree { flex: 1; overflow-y: auto; padding: 4px 0; }
.op-tree-label { padding: 6px 10px; font-size: 10px; opacity: 0.35; font-weight: 600; }
.op-tree-item {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  cursor: pointer; font-size: 12px; border-radius: 0; transition: background 0.1s;
}
.op-tree-item:hover { background: rgba(128,128,128,0.06); }
.op-tree-item.selected { background: rgba(40,140,100,0.2); color: #52c8a0; font-weight: 600; }
.op-tree-item.main { font-weight: 500; margin-bottom: 2px; }
.op-tree-item.volume { font-size: 12px; }
.op-tree-item.chapter { padding-left: 26px; font-size: 11px; opacity: 0.75; }
.op-tree-item.chapter.selected { opacity: 1; }
.op-tree-vol-num {
  width: 20px; height: 20px; border-radius: 4px; background: rgba(128,128,128,0.1);
  display: flex; align-items: center; justify-content: center; font-size: 10px;
  font-weight: 700; flex-shrink: 0;
}
.op-tree-item.selected .op-tree-vol-num { background: rgba(40,140,100,0.3); }
.op-tree-vol-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-tree-ch-count { font-size: 10px; opacity: 0.4; }
.op-tree-ch-title { padding-left: 20px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op-tree-empty { padding: 4px 24px; font-size: 11px; opacity: 0.3; }

.op-tree-del { width: 18px; height: 18px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 12px; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
.op-tree-item:hover .op-tree-del { opacity: 0.4; }
.op-tree-del:hover { opacity: 1 !important; color: #ef4444; background: rgba(239,68,68,0.1); }

.op-tree-add-ch { width: 18px; height: 18px; border: 1px solid rgba(128,128,128,0.15); border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 12px; opacity: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
.op-tree-item:hover .op-tree-add-ch { opacity: 0.5; }
.op-tree-add-ch:hover { opacity: 1 !important; color: #2ea86a; border-color: #2ea86a; background: rgba(46,168,106,0.08); }

.op-tree-add-ch-inline { background: none; border: none; color: #2ea86a; cursor: pointer; font-size: 11px; font-family: inherit; opacity: 0.6; }
.op-tree-add-ch-inline:hover { opacity: 1; }

/* 右侧详情 */
.op-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.op-detail-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  opacity: 0.3; font-size: 14px;
}
.op-detail-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.op-detail-title { font-size: 15px; font-weight: 600; }
.op-detail-actions { display: flex; gap: 4px; align-items: center; }
.op-mode-btn {
  padding: 3px 10px; font-size: 11px; border: 1px solid var(--border-color);
  border-radius: 4px; background: transparent; cursor: pointer; font-family: inherit;
  color: inherit; opacity: 0.6;
}
.op-mode-btn:hover { opacity: 1; }
.op-mode-btn.active { background: rgba(40,140,100,0.15); color: #52c8a0; border-color: rgba(82,200,160,0.3); }

.op-editor { flex: 1; overflow: hidden; display: flex; }

.op-textarea {
  flex: 1; padding: 20px 28px;
  font-family: ui-serif, Georgia, Cambria, 'Songti SC', STSong, 'Noto Serif SC', serif;
  font-size: 16px; line-height: 1.8;
  white-space: pre-wrap; overflow-wrap: break-word; word-wrap: break-word;
  overflow-y: auto; overflow-x: hidden;
  background: transparent; border: none; color: inherit; outline: none;
  tab-size: 2; box-sizing: border-box;
  -webkit-text-fill-color: currentColor;
  -webkit-user-modify: read-write-plaintext-only;
}

.op-textarea:empty::before {
  content: attr(data-placeholder);
  opacity: 0.25;
  pointer-events: none;
}

.op-detail-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 16px; border-top: 1px solid var(--border-color); flex-shrink: 0;
  font-size: 11px;
}
.op-status { opacity: 0.4; }
.op-save-status { }
.op-save-status.saved { color: #52c41a; }
.op-save-status.saving { color: #f0a020; }
.op-save-status.unsaved { color: #e06060; }

/* ── 结构化章纲编辑器 ── */
.op-structured {
  flex: 1; overflow-y: auto; padding: 16px 24px;
  display: flex; flex-direction: column; gap: 16px;
}
.op-struct-section {
  border: 1px solid var(--border-color); border-radius: 8px;
  padding: 12px 14px; background: rgba(128,128,128,0.02);
}
.op-struct-section-title {
  font-size: 13px; font-weight: 700; margin-bottom: 10px; opacity: 0.85;
}
.op-struct-row {
  margin-bottom: 10px;
}
.op-struct-row label {
  display: block; font-size: 11px; opacity: 0.5; margin-bottom: 3px;
}
.op-struct-row.cols-2 {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.op-struct-input {
  width: 100%; padding: 6px 10px; font-size: 12px; font-family: inherit;
  background: rgba(128,128,128,0.04); border: 1px solid transparent;
  border-radius: 6px; color: inherit; outline: none;
  transition: border-color 0.15s;
}
.op-struct-input:focus { border-color: rgba(46,168,106,0.4); }
.op-struct-input.sm { width: 100px; }
.op-struct-textarea {
  width: 100%; padding: 6px 10px; font-size: 12px; font-family: inherit;
  background: rgba(128,128,128,0.04); border: 1px solid transparent;
  border-radius: 6px; color: inherit; outline: none; resize: vertical;
  min-height: 52px; line-height: 1.6;
}
.op-struct-textarea:focus { border-color: rgba(46,168,106,0.4); }
.op-act-tag {
  display: inline-block; width: 22px; height: 22px; line-height: 22px;
  text-align: center; border-radius: 4px; font-size: 11px; font-weight: 700;
  margin-right: 4px; color: #fff;
}
.op-act-tag.act-qi    { background: #e06060; }
.op-act-tag.act-cheng { background: #f0a020; }
.op-act-tag.act-zhuan { background: #2ea86a; }
.op-act-tag.act-he    { background: #5b8def; }
</style>
