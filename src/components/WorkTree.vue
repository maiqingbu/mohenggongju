<template>
  <div class="work-tree">
    <!-- Loading -->
    <div v-if="!ready" class="tree-message">加载中...</div>

    <!-- Empty -->
    <div v-else-if="!works.length" class="tree-message" style="opacity:0.4">
      <p>暂无作品</p>
      <p style="font-size:11px;margin-top:4px">点击下方按钮新建</p>
    </div>

    <!-- Toolbar + Tree -->
    <template v-if="ready && works.length">
      <div class="tree-toolbar">
        <button class="tree-tb-btn" :class="{ active: multiSelectMode }" @click="toggleMultiSelect" title="多选管理">☑ {{ multiSelectMode ? '退出多选' : '多选管理' }}</button>
        <button class="tree-tb-btn" @click="toggleSortOrder" :title="sortDesc ? '切换为顺序' : '切换为倒序'">⇅ {{ sortDesc ? '倒序' : '顺序' }}</button>
        <span class="tree-tb-spacer"></span>
        <button class="tree-tb-btn" :class="{ active: showTrash }" @click="showTrash = !showTrash" title="回收站">🗑 回收站<span v-if="trashItems.length" class="trash-count">{{ trashItems.length }}</span></button>
        <span class="tree-tb-spacer"></span>
        <button class="tree-tb-btn" :class="{ active: viewMode === 'platform' }" @click="viewMode = viewMode === 'default' ? 'platform' : 'default'" title="按平台分组">
          📋 {{ viewMode === 'platform' ? '全部' : '按平台' }}
        </button>
      </div>
      <div class="tree-scroll">
      <div v-for="group in displayWorks" :key="group.key">
        <!-- Platform group header -->
        <div v-if="group.label" class="platform-group-header">
          <span class="platform-group-icon">📱</span>
          <span class="platform-group-name">{{ group.label }}</span>
          <span class="node-meta">({{ group.works.length }})</span>
        </div>
        <div v-if="!group.works.length && group.label" class="platform-group-empty">暂无</div>
        <div v-for="work in group.works" :key="'w'+work.id" class="tree-node-wrap">
        <!-- Work node -->
        <div
          class="tree-node work-node"
          :class="{ active: currentWorkId === work.id }"
          @click="onWorkClick(work.id)"
          @contextmenu.prevent="openContextMenu($event, 'work', work.id, work.title)"
        >
          <span class="node-arrow" @click.stop="toggleWork(work.id)">
            {{ expandedWorks.has(work.id) ? '▼' : '▶' }}
          </span>
          <template v-if="editingId === work.id && editingType === 'work'">
            <input
              class="node-inline-input"
              v-model="editTitle"
              @keydown.enter="confirmEdit()"
              @keydown.escape="cancelEdit()"
              @blur="confirmEdit()"
              @click.stop
              ref="editInputRef"
            />
          </template>
          <template v-else>
            <span class="node-label" :title="work.title">{{ work.title }}</span>
            <span class="node-meta">{{ wordCounts[work.id] ?? 0 }}字</span>
          </template>
        </div>

        <!-- Volumes (expanded work) -->
        <div v-if="expandedWorks.has(work.id)" class="tree-children">
          <template v-for="vol in (volumesByWork[work.id] ?? [])" :key="'v'+vol.id">
            <!-- Volume node (subtle) -->
            <div class="tree-node volume-node" @contextmenu.prevent="openContextMenu($event, 'volume', vol.id, vol.title)">
              <span class="node-arrow volume-arrow" @click.stop="toggleVolume(vol.id)">
                {{ expandedVolumes.has(vol.id) ? '▼' : '▶' }}
              </span>
              <template v-if="editingId === vol.id && editingType === 'volume'">
                <input
                  class="node-inline-input"
                  v-model="editTitle"
                  @keydown.enter="confirmEdit()"
                  @keydown.escape="cancelEdit()"
                  @blur="confirmEdit()"
                  @click.stop
                />
              </template>
              <template v-else>
                <span class="node-label volume-label" :title="vol.title">{{ vol.title }}</span>
                <span class="node-meta">{{ chapterWordCount(vol.id) }}字</span>
              </template>
            </div>

            <!-- Chapters (expanded volume) -->
            <draggable
              v-if="expandedVolumes.has(vol.id)"
              :list="getChapterList(vol.id)"
              :group="'chapters-' + work.id"
              item-key="id"
              handle=".drag-handle"
              ghost-class="chapter-ghost"
              @change="onChapterDragEnd(vol.id, $event)"
            >
              <template #item="{ element: ch }">
                <div
                  class="tree-node chapter-node"
                  :class="{ active: currentChapterId === ch.id }"
                  @click.stop="multiSelectMode ? toggleSelectChapter(ch.id) : selectChapter(ch.id)"
                  @contextmenu.prevent="openContextMenu($event, 'chapter', ch.id, ch.title)"
                >
                  <span v-if="multiSelectMode" class="multi-check" :class="{ checked: selectedIds.has(ch.id) }" @click.stop="toggleSelectChapter(ch.id)">{{ selectedIds.has(ch.id) ? '☑' : '☐' }}</span>
                  <span class="drag-handle" title="拖拽排序">⠿</span>
                  <template v-if="editingId === ch.id && editingType === 'chapter'">
                    <input
                      class="node-inline-input"
                      v-model="editTitle"
                      @keydown.enter="confirmEdit()"
                      @keydown.escape="cancelEdit()"
                      @blur="confirmEdit()"
                      @click.stop
                    />
                  </template>
                  <template v-else>
                    <span class="node-label" :title="ch.title">{{ ch.title }}</span>
                    <span class="node-meta">{{ ch.word_count }}字</span>
                  </template>
                </div>
              </template>
            </draggable>

            <!-- Inline add chapter -->
            <div v-if="expandedVolumes.has(vol.id)" class="tree-node new-node" @click.stop>
              <template v-if="addingChapterVolumeId === vol.id">
                <input
                  class="node-inline-input"
                  v-model="newChapterTitle"
                  placeholder="章节名，Enter 确认"
                  @keydown.enter="createChapter(vol.id)"
                  @keydown.escape="addingChapterVolumeId = null"
                  @blur="createChapter(vol.id)"
                  ref="newChapterInputRef"
                />
              </template>
              <template v-else>
                <button class="new-btn" @click="startAddChapter(vol.id)">+ 新建章节</button>
              </template>
            </div>
          </template>

          <!-- Add volume (always visible under expanded work) -->
          <div class="tree-node new-node" @click.stop>
            <template v-if="addingVolumeWorkId === work.id">
              <input
                class="node-inline-input"
                v-model="newVolumeTitle"
                placeholder="卷名，Enter 确认"
                @keydown.enter="createVolume(work.id)"
                @keydown.escape="addingVolumeWorkId = null"
                @blur="createVolume(work.id)"
              />
            </template>
            <template v-else>
              <button class="new-btn" @click="addingVolumeWorkId = work.id">
                {{ '+ 新建卷' }}
              </button>
            </template>
          </div>
        </div>
      </div>
      </div>
      </div>

      <!-- 多选批量操作栏 -->
      <div v-if="multiSelectMode && selectedIds.size > 0" class="tree-batch-bar">
        <span>已选 {{ selectedIds.size }} 项</span>
        <button class="tree-batch-btn" @click="batchMoveToTrash">🗑 批量删除</button>
      </div>

      <!-- 回收站面板 -->
      <div v-if="showTrash" class="tree-trash-panel">
        <div class="trash-header">🗑 回收站</div>
        <div v-if="!trashItems.length" class="trash-empty">回收站为空</div>
        <div v-for="item in trashItems" :key="item.type + item.id" class="trash-item">
          <span class="trash-type">{{ item.type === 'work' ? '📁' : item.type === 'volume' ? '📂' : '📄' }}</span>
          <span class="trash-title">{{ item.title }}</span>
          <span class="trash-date">{{ formatTrashDate(item.deletedAt) }}</span>
          <button class="trash-restore-btn" @click="restoreFromTrash(item)">恢复</button>
        </div>
        <button v-if="trashItems.length" class="trash-clear-btn" @click="emptyTrash">清空回收站</button>
      </div>
    </template>

    <!-- New work input / button -->
    <div class="tree-add-work" @click.stop>
      <template v-if="addingWork">
        <input
          class="node-inline-input full-width"
          v-model="newWorkTitle"
          placeholder="作品名，Enter 确认"
          @keydown.enter="createWork()"
          @keydown.escape="addingWork = false"
          @blur="createWork()"
          ref="newWorkInputRef"
        />
      </template>
      <template v-else>
        <button class="new-btn primary" @click="startAddWork">+ 新建作品</button>
      </template>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
      >
        <button class="ctx-menu-item" @click="startEdit()">✏️ 重命名</button>
        <button class="ctx-menu-item danger" @click="confirmDelete()">🗑️ 删除</button>
      </div>
    </Teleport>
    <div v-if="ctxMenu.visible" class="ctx-overlay" @click="ctxMenu.visible = false"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import draggable from 'vuedraggable'
import { useWorkRepo, isTauriRepo } from '../composables/useWorkRepo'
import { useWorkStore } from '../stores/workStore'
import { localCurrentChapterId, localLoadWorks } from '../composables/useLocalWorkTree'
import type { Work, Volume, Chapter } from '../composables/useDatabase'
import { WorkspaceSettings } from '../composables/useWorkspaceSettings'
import { getPlatform } from '../composables/usePlatformData'
import { showConfirm } from '../composables/useConfirm'

const emit = defineEmits<{ (e: 'chapter-select', ch: Chapter): void }>()

// E2: 使用统一数据源 useWorkRepo
const repo = useWorkRepo()
const ready = repo.dbReady
const works = repo.works
const volumesList = repo.volumes
const chapterMapData = repo.chapterMap
const currentWorkId = repo.currentWorkId
const currentChapterId = repo.currentChapterId

// ── 视图模式：默认 / 按平台分组 ──
const viewMode = ref<'default' | 'platform'>('default')

const worksByPlatform = computed(() => {
  const groups: Record<string, typeof works.value> = {}
  for (const w of works.value) {
    try {
      const ws = new WorkspaceSettings(w.id)
      const pid = ws.data.platformId || '__ungrouped__'
      if (!groups[pid]) groups[pid] = []
      groups[pid].push(w)
    } catch {
      if (!groups['__ungrouped__']) groups['__ungrouped__'] = []
      groups['__ungrouped__'].push(w)
    }
  }
  return groups
})

const platformGroupKeys = computed(() => {
  return Object.keys(worksByPlatform.value).sort((a, b) => {
    if (a === '__ungrouped__') return 1
    if (b === '__ungrouped__') return -1
    return a.localeCompare(b)
  })
})

function getPlatformName(platformId: string): string {
  if (platformId === '__ungrouped__') return '未分类'
  return getPlatform(platformId)?.name || platformId
}

const displayWorks = computed(() => {
  if (viewMode.value === 'default') return [{ key: '__all__', label: '', works: works.value }]
  return platformGroupKeys.value.map(pid => ({
    key: pid,
    label: getPlatformName(pid),
    works: worksByPlatform.value[pid] || [],
  }))
})

// 别名保持原有模板引用不变
const apiAddWork = repo.addWork
const apiRenameWork = repo.renameWork
const apiRemoveWork = repo.removeWork
const apiSelectWork = repo.selectWork
const apiAddVolume = repo.addVolume
const apiRenameVolume = repo.renameVolume
const apiRemoveVolume = repo.removeVolume
const apiAddChapter = repo.addChapter
const apiRenameChapter = repo.renameChapter
const apiRemoveChapter = repo.removeChapter
// ── 展开折叠状态 ──
const expandedWorks = ref(new Set<number>())
const expandedVolumes = ref(new Set<number>())

// ── 内联编辑 ──
const addingWork = ref(false)
const newWorkTitle = ref('')
const newWorkInputRef = ref<HTMLInputElement | null>(null)

const addingVolumeWorkId = ref<number | null>(null)
const newVolumeTitle = ref('')

const addingChapterVolumeId = ref<number | null>(null)
const newChapterTitle = ref('')
const newChapterInputRef = ref<HTMLInputElement | null>(null)

const editingId = ref<number | null>(null)
const editingType = ref<'work' | 'volume' | 'chapter' | null>(null)
const editTitle = ref('')
const editInputRef = ref<HTMLInputElement | null>(null)

const ctxMenu = reactive({ visible: false, x: 0, y: 0, id: 0, type: '' as string, title: '' })

// ── 多选管理 ──
const multiSelectMode = ref(false)
const selectedIds = ref(new Set<number>())

function toggleMultiSelect() {
  multiSelectMode.value = !multiSelectMode.value
  if (!multiSelectMode.value) selectedIds.value = new Set()
}

function toggleSelectChapter(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

async function batchMoveToTrash() {
  showConfirm(`确认将选中的 ${selectedIds.value.size} 个章节移入回收站？`, async () => {
  for (const id of selectedIds.value) {
    const ch = findChapterById(id)
    if (ch) moveToTrash('chapter', id, ch.title, findChapterVolumeId(id))
  }
  for (const id of selectedIds.value) {
    for (const [volId, chs] of Object.entries(chapterMapData.value)) {
      if (chs.some(c => c.id === id)) {
        await apiRemoveChapter(Number(volId), id)
        break
      }
    }
  }
  selectedIds.value = new Set()
  })
}

// ── 章节排序 ──
const sortDesc = ref(false)

function toggleSortOrder() {
  sortDesc.value = !sortDesc.value
}

// ── 回收站 ──
interface TrashItem { type: string; id: number; title: string; deletedAt: number; parentId?: number }
const showTrash = ref(false)
const trashItems = ref<TrashItem[]>([])

function moveToTrash(type: string, id: number, title: string, parentId?: number) {
  if (trashItems.value.some(t => t.type === type && t.id === id)) return
  trashItems.value.push({ type, id, title, deletedAt: Date.now(), parentId })
}

function rollbackTrash(type: string, id: number) {
  trashItems.value = trashItems.value.filter(t => !(t.type === type && t.id === id))
}

async function restoreFromTrash(item: TrashItem) {
  if (item.type === 'work') {
    await apiAddWork(item.title)
  } else if (item.type === 'volume' && item.parentId != null) {
    await apiAddVolume(item.parentId, item.title)
  } else if (item.type === 'chapter' && item.parentId != null) {
    await apiAddChapter(item.parentId, item.title)
  }
  trashItems.value = trashItems.value.filter(t => !(t.type === item.type && t.id === item.id))
}

function emptyTrash() {
  showConfirm('确认永久清空回收站？此操作不可恢复。', () => {
  trashItems.value = []
  })
}

function formatTrashDate(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}小时前`
  return `${Math.floor(hrs / 24)}天前`
}

// ── 分组数据 ──
const volumesByWork = computed(() => {
  const map: Record<number, Volume[]> = {}
  for (const v of volumesList.value) {
    if (!map[v.work_id]) map[v.work_id] = []
    map[v.work_id].push(v)
  }
  for (const vols of Object.values(map)) {
    vols.sort((a, b) => a.sort_order - b.sort_order)
  }
  return map
})

const wordCounts = computed(() => {
  const map: Record<number, number> = {}
  for (const w of works.value) {
    let total = 0
    const workVols = volumesByWork.value[w.id] ?? []
    for (const v of workVols) {
      const chs = chapterMapData.value[v.id] ?? []
      total += chs.reduce((s, c) => s + c.word_count, 0)
    }
    map[w.id] = total
  }
  return map
})

function chapterWordCount(volumeId: number): number {
  const chs = chapterMapData.value[volumeId] ?? []
  return chs.reduce((s, c) => s + c.word_count, 0)
}

function getChapterList(volumeId: number): Chapter[] {
  const chs = chapterMapData.value[volumeId] ?? []
  if (!sortDesc.value) return chs
  return [...chs].reverse()
}

// ── 展开/折叠 ──
async function toggleWork(workId: number) {
  if (expandedWorks.value.has(workId)) {
    expandedWorks.value.delete(workId)
  } else {
    expandedWorks.value.add(workId)
    await apiSelectWork(workId)
    const vols = volumesByWork.value[workId] ?? []
    for (const v of vols) {
      expandedVolumes.value.add(v.id)
    }
  }
  expandedWorks.value = new Set(expandedWorks.value)
}

function toggleVolume(volumeId: number) {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId)
  } else {
    expandedVolumes.value.add(volumeId)
  }
  expandedVolumes.value = new Set(expandedVolumes.value)
}

// ── 选中 ──
function onWorkClick(workId: number) {
  apiSelectWork(workId)
}

function selectChapter(chapterId: number) {
  if (isTauriRepo()) {
    useWorkStore().currentChapterId = chapterId
  } else {
    localCurrentChapterId.value = chapterId
  }
  const ch = findChapterById(chapterId)
  if (ch) emit('chapter-select', ch)
}

function findChapterById(id: number): Chapter | null {
  for (const chs of Object.values(chapterMapData.value)) {
    const found = chs.find(c => c.id === id)
    if (found) return found
  }
  return null
}

function findChapterVolumeId(chapterId: number): number | undefined {
  for (const [volId, chs] of Object.entries(chapterMapData.value)) {
    if (chs.some(c => c.id === chapterId)) return Number(volId)
  }
  return undefined
}

function findVolumeWorkId(volumeId: number): number | undefined {
  return volumesList.value.find(v => v.id === volumeId)?.work_id
}

// ── 新建 ──
function startAddWork() {
  addingWork.value = true
  newWorkTitle.value = ''
  nextTick(() => newWorkInputRef.value?.focus())
}

async function createWork() {
  const title = newWorkTitle.value.trim()
  if (!title) { addingWork.value = false; return }
  try {
    const id = await apiAddWork(title)
    newWorkTitle.value = ''
    expandedWorks.value.add(id)
    expandedWorks.value = new Set(expandedWorks.value)
  } catch (e: any) {
    console.error('[WorkTree] createWork failed:', e)
  } finally {
    addingWork.value = false
  }
}

async function createVolume(workId: number) {
  const title = newVolumeTitle.value.trim()
  if (!title) { addingVolumeWorkId.value = null; return }
  try {
    await apiAddVolume(workId, title)
    newVolumeTitle.value = ''
  } catch (e: any) {
    console.error('[WorkTree] createVolume failed:', e)
  } finally {
    addingVolumeWorkId.value = null
  }
}

function startAddChapter(volumeId: number) {
  addingChapterVolumeId.value = volumeId
  newChapterTitle.value = ''
  nextTick(() => newChapterInputRef.value?.focus())
}

async function createChapter(volumeId: number) {
  const title = newChapterTitle.value.trim()
  if (!title) { addingChapterVolumeId.value = null; return }
  try {
    await apiAddChapter(volumeId, title)
    newChapterTitle.value = ''
  } catch (e: any) {
    console.error('[WorkTree] createChapter failed:', e)
  } finally {
    addingChapterVolumeId.value = null
  }
}

// ── 编辑 ──
function openContextMenu(event: MouseEvent, type: string, id: number, title: string) {
  ctxMenu.visible = true
  ctxMenu.x = Math.min(event.clientX, window.innerWidth - 140)
  ctxMenu.y = Math.min(event.clientY, window.innerHeight - 80)
  ctxMenu.id = id
  ctxMenu.type = type
  ctxMenu.title = title
}

function startEdit() {
  ctxMenu.visible = false
  editingId.value = ctxMenu.id
  editingType.value = ctxMenu.type as any
  editTitle.value = ctxMenu.title
  nextTick(() => editInputRef.value?.focus())
}

async function confirmEdit() {
  const title = editTitle.value.trim()
  const id = editingId.value!
  const type = editingType.value!
  editingId.value = null
  editingType.value = null
  if (!title) return

  if (type === 'work') {
    await apiRenameWork(id, title)
  } else if (type === 'volume') {
    await apiRenameVolume(id, title)
  } else if (type === 'chapter') {
    for (const [volId, chs] of Object.entries(chapterMapData.value)) {
      if (chs.some(c => c.id === id)) {
        await apiRenameChapter(Number(volId), id, title)
        break
      }
    }
  }
}

function cancelEdit() {
  editingId.value = null
  editingType.value = null
}

async function confirmDelete() {
  const id = ctxMenu.id
  const type = ctxMenu.type
  const title = ctxMenu.title
  ctxMenu.visible = false

  const label = { work: '作品', volume: '卷', chapter: '章节' }[type] ?? '项目'
  showConfirm(`确认删除${label}「${title}」？将从列表中移除并移入回收站。`, async () => {

  // 软删除：先记入回收站，再从数据层移除（失败时回滚 trash）
  try {
    if (type === 'work') {
      moveToTrash('work', id, title)
      await apiRemoveWork(id)
    } else if (type === 'volume') {
      moveToTrash('volume', id, title, findVolumeWorkId(id))
      await apiRemoveVolume(id)
    } else if (type === 'chapter') {
      moveToTrash('chapter', id, title, findChapterVolumeId(id))
      for (const [volId, chs] of Object.entries(chapterMapData.value)) {
        if (chs.some(c => c.id === id)) {
          await apiRemoveChapter(Number(volId), id)
          break
        }
      }
    }
  } catch (e: any) {
    console.error('[WorkTree] confirmDelete failed, rolling back trash:', e)
    rollbackTrash(type, id)
  }
  })
}

// ── 拖拽排序 ──
// vuedraggable 通过 v-model 直接变异了数组，这里只需持久化新顺序
async function onChapterDragEnd(volumeId: number, event: { moved?: { oldIndex: number; newIndex: number } }) {
  if (!event.moved) return
  const chs = chapterMapData.value[volumeId] ?? []
  // 一次性重编号 sort_order 以匹配当前数组顺序
  chs.forEach((c, i) => { c.sort_order = i })
  if (isTauriRepo()) {
    const { reorderChapters } = await import('../composables/useDatabase')
    await reorderChapters(chs.map(c => c.id))
  } else {
    const { localPersistChapterOrder } = await import('../composables/useLocalWorkTree')
    localPersistChapterOrder(volumeId)
  }
}

// ── 初始化 ──
if (isTauriRepo()) {
  useWorkStore().loadWorks()
} else {
  localLoadWorks()
}

defineExpose({
  refreshOutlineStatus: () => {},
})
</script>

<style scoped>
.work-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.tree-message {
  padding: 20px 12px;
  font-size: 13px;
  text-align: center;
}
.tree-toolbar {
  display: flex; align-items: center; gap: 2px; padding: 4px 6px;
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.tree-tb-btn {
  padding: 2px 6px; border: none; border-radius: 3px;
  background: transparent; color: inherit; cursor: pointer;
  font-size: 10px; font-family: inherit; opacity: 0.4; transition: opacity 0.15s;
}
.tree-tb-btn:hover { opacity: 0.8; }
.tree-tb-spacer { flex: 1; }
.tree-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

/* 平台分组视图 */
.platform-group-header {
  padding: 6px 12px; font-size: 13px; font-weight: 600;
  color: var(--text-secondary); display: flex; align-items: center; gap: 6px;
  border-bottom: 1px solid var(--border-color); margin-bottom: 2px;
}
.platform-group-icon { font-size: 14px; }
.platform-group-name { flex: 1; }
.platform-group-empty {
  padding: 8px 16px; font-size: 12px; color: var(--text-muted); font-style: italic;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin: 1px 4px;
  font-size: 13px;
  transition: background 0.1s;
  white-space: nowrap;
}
.tree-node:hover {
  background: rgba(128,128,128,0.12);
}
.tree-node.active {
  background: rgba(82,200,160,0.18);
  color: #52c8a0;
}

.node-arrow {
  width: 16px;
  font-size: 9px;
  flex-shrink: 0;
  text-align: center;
  opacity: 0.5;
}
.volume-arrow {
  margin-left: 12px;
}
.node-label {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.node-meta {
  font-size: 10px;
  opacity: 0.35;
  flex-shrink: 0;
}

.work-node {
  font-weight: 600;
  padding: 7px 8px;
}

.volume-node {
  padding-left: 8px;
  font-weight: 500;
  font-size: 12px;
  opacity: 0.75;
}

.chapter-node {
  padding-left: 28px;
  font-weight: 400;
}

.drag-handle {
  cursor: grab;
  opacity: 0.3;
  font-size: 14px;
  flex-shrink: 0;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
  opacity: 0.7;
}
.chapter-ghost {
  opacity: 0.3;
  background: rgba(82,200,160,0.2);
}

.node-inline-input {
  flex: 1;
  padding: 2px 6px;
  font-size: 12px;
  font-family: inherit;
  background: rgba(128,128,128,0.15);
  border: 1px solid rgba(82,200,160,0.5);
  border-radius: 3px;
  color: inherit;
  outline: none;
  min-width: 0;
}
.node-inline-input::placeholder {
  opacity: 0.35;
}
.full-width {
  width: 100%;
}

.new-node {
  padding-left: 28px;
}
.new-btn {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.3;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  font-family: inherit;
  transition: opacity 0.15s;
}
.new-btn:hover {
  opacity: 0.7;
}
.new-btn.primary {
  opacity: 0.5;
  font-size: 12px;
  font-weight: 500;
}
.tree-add-work {
  padding: 4px 8px 8px;
  flex-shrink: 0;
}

.ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #2a2a35;
  border: 1px solid rgba(128,128,128,0.25);
  border-radius: 6px;
  padding: 4px;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.ctx-menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 3px;
  text-align: left;
}
.ctx-menu-item:hover {
  background: rgba(128,128,128,0.2);
}
.ctx-menu-item.danger {
  color: #e06060;
}
.ctx-menu-item.danger:hover {
  background: rgba(224,96,96,0.15);
}
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

:global(html .theme-light .ctx-menu) {
  background: #ffffff;
  border-color: rgba(0,0,0,0.1);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}
:global(html .theme-light .ctx-menu-item) {
  color: #1a1a1a;
}
:global(html .theme-light .ctx-menu-item:hover) {
  background: rgba(0,0,0,0.06);
}

/* ── 多选模式 ── */
.multi-check {
  width: 18px; flex-shrink: 0;
  font-size: 13px; text-align: center;
  cursor: pointer; opacity: 0.4;
  transition: opacity 0.15s;
}
.multi-check:hover { opacity: 0.7; }
.multi-check.checked { opacity: 0.9; color: #52c8a0; }

/* ── 批量操作栏 ── */
.tree-batch-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background: rgba(82,200,160,0.06);
  font-size: 11px;
}
.tree-batch-btn {
  padding: 3px 10px; border: 1px solid rgba(224,96,96,0.4);
  border-radius: 4px; background: transparent;
  color: #e06060; cursor: pointer;
  font-size: 11px; font-family: inherit;
  transition: background 0.15s;
}
.tree-batch-btn:hover { background: rgba(224,96,96,0.12); }

/* ── 工具栏按钮激活态 ── */
.tree-tb-btn.active {
  opacity: 0.85;
  color: #52c8a0;
}

/* ── 回收站计数徽章 ── */
.trash-count {
  display: inline-block;
  margin-left: 2px; padding: 0 5px;
  border-radius: 8px;
  background: #e06060; color: #fff;
  font-size: 9px; line-height: 16px;
  vertical-align: middle;
}

/* ── 回收站面板 ── */
.tree-trash-panel {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  max-height: 200px; overflow-y: auto;
  background: rgba(0,0,0,0.12);
}
.trash-header {
  padding: 6px 10px; font-size: 11px;
  font-weight: 600; opacity: 0.5;
}
.trash-empty {
  padding: 12px 10px; font-size: 11px;
  opacity: 0.3; text-align: center;
}
.trash-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; font-size: 12px;
  border-top: 1px solid rgba(128,128,128,0.08);
}
.trash-item:hover { background: rgba(128,128,128,0.06); }
.trash-type {
  width: 18px; flex-shrink: 0;
  font-size: 13px; text-align: center;
}
.trash-title {
  flex: 1; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.trash-date {
  font-size: 10px; opacity: 0.35; flex-shrink: 0;
}
.trash-restore-btn {
  padding: 1px 8px; border: 1px solid rgba(128,128,128,0.3);
  border-radius: 3px; background: transparent;
  color: inherit; cursor: pointer;
  font-size: 10px; font-family: inherit;
  opacity: 0.5; transition: opacity 0.15s;
}
.trash-restore-btn:hover { opacity: 0.85; }
.trash-clear-btn {
  display: block; width: 100%;
  padding: 5px; border: none;
  border-top: 1px solid rgba(128,128,128,0.12);
  background: transparent; color: #e06060;
  cursor: pointer; font-size: 10px;
  font-family: inherit; opacity: 0.5;
  transition: opacity 0.15s;
}
.trash-clear-btn:hover { opacity: 0.85; }
</style>
