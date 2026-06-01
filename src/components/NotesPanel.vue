<template>
  <div class="np-root">
    <!-- 1. 顶部工具栏 -->
    <div class="np-topbar">
      <div class="np-topbar-left">
        <span class="np-breadcrumb">工作台</span>
        <span class="np-breadcrumb-sep">|</span>
        <span class="np-breadcrumb active">写作笔记</span>
      </div>
      <div class="np-topbar-right">
        <button class="np-icon-btn" title="刷新" @click="refreshNotes"><n-icon size="16"><RefreshOutline /></n-icon></button>
      </div>
    </div>

    <!-- 提示栏 -->
    <div class="np-hint-bar">
      <div class="np-hint-left">
        <span class="np-hint-text">笔记默认不对AI不可见，需要 @ 引用</span>
      </div>
      <div class="np-hint-right">
        <button class="np-text-btn" @click="handleImport">↻ 导入</button>
        <button class="np-text-btn" @click="handleExport">↓ 导出</button>
      </div>
    </div>

    <!-- 主体 -->
    <div class="np-body">
      <!-- 2. 左侧边栏 -->
      <aside class="np-sidebar">
        <div class="np-sidebar-header">
          <span class="np-sidebar-title">笔记目录</span>
        </div>
        <div class="np-sidebar-actions">
          <button class="np-action-btn" @click="addFolder">新建目录</button>
          <button class="np-action-btn primary" @click="startNewNote">+ 新笔记</button>
          <button class="np-action-btn danger" :disabled="!selectedId" @click="deleteCurrent">🗑</button>
        </div>

        <!-- 目录列表 -->
        <div class="np-folder-list">
          <div
            class="np-folder-item"
            :class="{ active: currentFolder === '' }"
            @click="currentFolder = ''; clearSelection()"
          >📁 全部笔记</div>
          <div
            v-for="f in folders"
            :key="f"
            class="np-folder-item"
            :class="{ active: currentFolder === f }"
            @click="currentFolder = f; clearSelection()"
          >📁 {{ f }}</div>
          <div v-if="showFolderInput" class="np-folder-input-wrap">
            <input
              class="np-folder-input"
              v-model="newFolderName"
              placeholder="目录名"
              @keydown.enter="confirmAddFolder"
              @keydown.escape="showFolderInput = false"
              @blur="confirmAddFolder"
              ref="folderInputRef"
            />
          </div>
        </div>

        <!-- 笔记列表 -->
        <div class="np-note-list">
          <div
            v-for="note in filteredNotes"
            :key="note.id"
            class="np-note-item"
            :class="{ selected: selectedId === note.id }"
            @click="selectNote(note)"
          >
            <span class="np-note-icon">📄</span>
            <span class="np-note-title" :title="note.title">{{ note.title || '未命名笔记' }}</span>
            <button class="np-note-delete" @click.stop="deleteNote(note.id)" title="删除">🗑</button>
          </div>
          <div v-if="filteredNotes.length === 0" class="np-note-empty">暂无笔记</div>
        </div>
      </aside>

      <!-- 3. 右侧编辑区 -->
      <section class="np-detail">
        <template v-if="!editingNote">
          <div class="np-detail-empty">
            <p>选择或新建一条笔记开始编辑</p>
            <p style="font-size:12px;opacity:0.4;margin-top:4px">笔记默认不对AI可见，需要 @ 引用才会注入上下文</p>
          </div>
        </template>
        <template v-else>
          <div class="np-detail-header">
            <input
              class="np-title-input"
              v-model="editTitle"
              placeholder="笔记标题"
              @change="saveCurrent"
            />
          </div>
          <div class="np-editor">
            <textarea
              class="np-content-textarea"
              v-model="editContent"
              placeholder="笔记内容（支持多级目录引用）"
              @change="saveCurrent"
            ></textarea>
          </div>
          <div class="np-extra-row">
            <div class="np-extra-header">
              <label class="np-extra-label">创作需求</label>
              <button class="np-ai-btn" :disabled="!editingNote || !editContent.trim()" @click="openAiChat">
                🤖 AI 讨论
              </button>
            </div>
            <textarea
              class="np-extra-textarea"
              v-model="editExtra"
              placeholder="直接描述你的创作需求，例如：先和我讨论这一卷最该强化的冲突，再根据我的反馈继续改。"
              @change="saveExtra"
            ></textarea>
          </div>
          <div class="np-detail-footer">
            <span class="np-meta">字数 {{ wordCount }}</span>
            <span class="np-meta" v-if="editingNote">{{ editingNote.folder || '根目录' }}</span>
            <span class="np-meta" v-if="editingNote">{{ fmtDate(editingNote.updatedAt) }}</span>
          </div>
        </template>
      </section>
    </div>

    <AiModal
      v-if="aiModal.visible"
      :is-dark="isDark"
      :title="aiModal.title"
      :description="aiModal.desc"
      :target-label="aiModal.target"
      :write-label="aiModal.write"
      :default-extra-prompt="aiModal.defaultExtraPrompt"
      :field="aiModal.field"
      :hide-chapter="true"
      @close="aiModal.visible = false"
      @write="onAiWrite"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, reactive, onUnmounted } from 'vue'
import { NIcon, useMessage } from 'naive-ui'
import { RefreshOutline } from '@vicons/ionicons5'
import { NotesManager, type Note } from '../composables/useNotes'
import AiModal from './AiModal.vue'
import { showConfirm } from '../composables/useConfirm'

defineProps<{ isDark?: boolean }>()
const message = useMessage()

const mgr = new NotesManager()

// ── 左侧 ──
const currentFolder = ref('')
const _refreshKey = ref(0)
const showFolderInput = ref(false)
const newFolderName = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)

const folders = computed(() => mgr.folders())
const filteredNotes = computed(() => { void _refreshKey.value; return mgr.list(currentFolder.value) })

function addFolder() {
  showFolderInput.value = true
  newFolderName.value = ''
  nextTick(() => folderInputRef.value?.focus())
}

function confirmAddFolder() {
  const name = newFolderName.value.trim()
  if (!name) { showFolderInput.value = false; return }
  currentFolder.value = name
  showFolderInput.value = false
}

function startNewNote() {
  const note = mgr.create('新笔记', currentFolder.value)
  selectNote(note)
}

function selectNote(note: Note) {
  selectedId.value = note.id
}

function clearSelection() {
  selectedId.value = null
  editTitle.value = ''
  editContent.value = ''
  lastSavedContent = ''
}

function deleteNote(id: string) {
  const note = mgr.get(id)
  if (!note) return
  showConfirm(`确认删除笔记「${note.title || '未命名笔记'}」？`, () => {
  mgr.remove(id)
  if (selectedId.value === id) clearSelection()
  })
}

function deleteCurrent() {
  if (selectedId.value) deleteNote(selectedId.value)
}

// ── 右侧编辑 ──
const selectedId = ref<string | null>(null)
const editTitle = ref('')
const editContent = ref('')
const editExtra = ref('')
let lastSavedContent = ''

const wordCount = computed(() => {
  if (!editContent.value) return 0
  const cn = (editContent.value.match(/[一-龥]/g) || []).length
  const en = (editContent.value.match(/[a-zA-Z]+/g) || []).length
  return cn + en
})

const editingNote = computed(() =>
  selectedId.value ? mgr.get(selectedId.value) ?? null : null
)

watch(editingNote, (note) => {
  if (!note) return
  editTitle.value = note.title
  editContent.value = note.content
  editExtra.value = note.extra || ''
  lastSavedContent = note.content
})

function saveCurrent() {
  if (!selectedId.value) return
  mgr.update(selectedId.value, {
    title: editTitle.value.trim(),
    content: editContent.value,
  })
  lastSavedContent = editContent.value
}

function saveExtra() {
  if (!selectedId.value) return
  mgr.update(selectedId.value, { extra: editExtra.value })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(editContent, (val) => {
  if (val === lastSavedContent) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCurrent, 500)
})
watch(editTitle, () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCurrent, 500)
})

onUnmounted(() => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (editContent.value !== lastSavedContent) saveCurrent() // 销毁前刷盘，防止笔记丢失
})

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function handleImport() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const items = Array.isArray(raw) ? raw : []
        if (!items.length) { message.warning('文件中无可导入的笔记'); return }
        showConfirm(`将导入 ${items.length} 条笔记，同名笔记将更新内容。是否继续？`, () => {
        let imported = 0
        for (const item of items) {
          if (!item.title) continue
          const existing = mgr.list().find((n: Note) => n.title === item.title)
          if (existing) {
            mgr.update(existing.id, { title: item.title, content: item.content || existing.content, folder: item.folder || existing.folder })
          } else {
            const note = mgr.create(item.title, item.folder || '')
            if (item.content) mgr.update(note.id, { content: item.content })
          }
          imported++
        }
        _refreshKey.value++
        message.success(`已导入 ${imported} 条笔记`)
        })
      } catch { message.error('JSON 格式无效') }
    }
    reader.readAsText(file)
  }
  input.click()
}

function handleExport() {
  const data = mgr.list()
  if (!data.length) return
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'notes-export.json'; a.click()
  URL.revokeObjectURL(url)
}

function refreshNotes() {
  _refreshKey.value++
  message.success('已刷新')
}

// ── AI 讨论 ──
const aiModal = reactive({
  visible: false,
  title: '',
  desc: '',
  target: '',
  write: '',
  field: '',
  defaultExtraPrompt: '',
})

function openAiChat() {
  if (!editingNote.value || !editContent.value.trim()) return
  const noteTitle = editTitle.value || '未命名笔记'
  const noteContent = editContent.value
  const request = editExtra.value.trim()

  aiModal.visible = true
  aiModal.title = `讨论笔记：${noteTitle}`
  aiModal.desc = '基于当前笔记内容和你的创作需求，AI 将与你讨论并提供建议。'
  aiModal.target = '讨论笔记'
  aiModal.write = '✓ 追加到笔记'
  aiModal.field = 'note_discuss'
  aiModal.defaultExtraPrompt = [
    request ? `## 创作需求\n${request}` : '',
    `## 当前笔记\n${noteContent.slice(0, 3000)}`,
  ].filter(Boolean).join('\n\n')
}

function onAiWrite(value: string) {
  if (!editingNote.value) return
  // 将 AI 回复追加到笔记内容末尾
  const separator = '\n\n---\n## AI 讨论回复\n'
  editContent.value = (editContent.value || '') + separator + value
  saveCurrent()
  aiModal.visible = false
  message.success('AI 回复已追加到笔记')
}
</script>

<style scoped>
.np-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.np-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.np-breadcrumb { font-size: 11px; opacity: 0.45; }
.np-breadcrumb.active { opacity: 0.75; font-weight: 500; }
.np-breadcrumb-sep { margin: 0 6px; opacity: 0.25; }
.np-topbar-right { display: flex; gap: 4px; }
.np-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; color: var(--btn-color);
}
.np-icon-btn:hover { background: var(--btn-hover-bg); }

.np-hint-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; border-bottom: 1px solid var(--border-color); flex-shrink: 0;
  background: rgba(128,128,128,0.02); gap: 8px;
}
.np-hint-left { display: flex; align-items: center; gap: 8px; }
.np-hint-text { font-size: 11px; opacity: 0.35; }
.np-text-btn {
  background: rgba(200,160,80,0.1); border: 1px solid rgba(200,160,80,0.3);
  border-radius: 4px; padding: 3px 10px; font-size: 11px; cursor: pointer;
  font-family: inherit; color: #d4a040;
}
.np-text-btn:hover { background: rgba(200,160,80,0.2); }

.np-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* 左侧栏 */
.np-sidebar {
  width: 220px; flex-shrink: 0; border-right: 1px solid var(--border-color);
  display: flex; flex-direction: column; overflow: hidden;
}
.np-sidebar-header { padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
.np-sidebar-title { font-size: 12px; font-weight: 600; opacity: 0.5; }
.np-sidebar-actions {
  display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border-color);
}
.np-action-btn {
  flex: 1; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 4px;
  background: rgba(128,128,128,0.06); color: inherit; cursor: pointer;
  font-size: 10px; font-family: inherit; text-align: center;
}
.np-action-btn:hover { background: rgba(128,128,128,0.12); }
.np-action-btn.primary { color: #52c8a0; border-color: rgba(82,200,160,0.3); background: rgba(82,200,160,0.08); }
.np-action-btn.danger { color: #e06060; border-color: rgba(224,96,96,0.3); flex: 0 0 32px; }
.np-action-btn.danger:disabled { opacity: 0.3; cursor: not-allowed; }

.np-folder-list { padding: 4px 0; border-bottom: 1px solid var(--border-color); }
.np-folder-item {
  padding: 5px 10px; font-size: 12px; cursor: pointer; transition: background 0.1s;
}
.np-folder-item:hover { background: rgba(128,128,128,0.06); }
.np-folder-item.active { background: rgba(128,128,128,0.1); font-weight: 500; }
.np-folder-input-wrap { padding: 4px 8px; }
.np-folder-input {
  width: 100%; padding: 3px 6px; font-size: 11px; font-family: inherit;
  background: rgba(128,128,128,0.1); border: 1px solid rgba(82,200,160,0.4);
  border-radius: 3px; color: inherit; outline: none;
}

.np-note-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.np-note-item {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px;
  cursor: pointer; font-size: 12px; transition: background 0.1s;
}
.np-note-item:hover { background: rgba(128,128,128,0.06); }
.np-note-item.selected { background: rgba(128,128,128,0.12); font-weight: 500; }
.np-note-icon { flex-shrink: 0; font-size: 12px; }
.np-note-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-note-delete {
  width: 20px; height: 20px; border: none; border-radius: 3px;
  background: transparent; cursor: pointer; font-size: 10px; opacity: 0;
  display: flex; align-items: center; justify-content: center;
}
.np-note-item:hover .np-note-delete { opacity: 0.4; }
.np-note-delete:hover { opacity: 1 !important; background: rgba(224,96,96,0.1); }
.np-note-empty { text-align: center; padding: 20px 0; opacity: 0.3; font-size: 12px; }

/* 右侧 */
.np-detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.np-detail-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; opacity: 0.3; font-size: 14px;
}
.np-detail-header { padding: 8px 16px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.np-title-input {
  width: 100%; background: transparent; border: none; outline: none;
  font-size: 16px; font-weight: 600; font-family: inherit; color: inherit;
}
.np-title-input::placeholder { opacity: 0.3; }
.np-editor { flex: 1; overflow: hidden; display: flex; }
.np-content-textarea {
  flex: 1; padding: 12px 16px; font-size: 14px; font-family: inherit; line-height: 1.8;
  background: transparent; border: none; color: inherit; outline: none; resize: none;
}
.np-content-textarea::placeholder { opacity: 0.25; }
.np-extra-row { padding: 8px 16px; border-top: 1px solid rgba(128,128,128,0.08); flex-shrink: 0; }
.np-extra-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.np-extra-label { font-size: 11px; opacity: 0.4; }
.np-ai-btn {
  padding: 3px 12px; border: 1px solid rgba(46,168,106,0.3); border-radius: 12px;
  background: rgba(46,168,106,0.08); color: #2ea86a; cursor: pointer;
  font-size: 11px; font-family: inherit; font-weight: 500;
  transition: all 0.15s;
}
.np-ai-btn:hover:not(:disabled) { background: rgba(46,168,106,0.16); }
.np-ai-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.np-extra-textarea {
  width: 100%; padding: 6px 8px; font-size: 12px; font-family: inherit;
  background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.08);
  border-radius: 6px; color: inherit; outline: none; resize: vertical;
  min-height: 60px;
}
.np-extra-textarea:focus { border-color: rgba(46,168,106,0.4); }
.np-detail-footer {
  display: flex; align-items: center; gap: 16px; padding: 4px 16px;
  border-top: 1px solid var(--border-color); flex-shrink: 0; font-size: 11px;
}
.np-meta { opacity: 0.4; }

:global(html .theme-light .np-folder-input),
:global(html .theme-light .np-title-input),
:global(html .theme-light .np-content-textarea),
:global(html .theme-light .np-extra-textarea) {
  background: white;
  border-color: white;
}
</style>
