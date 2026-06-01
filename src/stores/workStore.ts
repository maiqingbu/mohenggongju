import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  fetchWorks, createWork, updateWork, deleteWork,
  fetchVolumes, createVolume, updateVolume, deleteVolume, reorderVolumes,
  fetchChapters, createChapter, updateChapterTitle, deleteChapter, reorderChapters,
  type Work, type Volume, type Chapter
} from '../composables/useDatabase'

export const useWorkStore = defineStore('work', () => {
  const works = ref<Work[]>([])
  const volumes = ref<Volume[]>([])
  // chapters 按 volume_id 分组存储
  const chapterMap = ref<Record<number, Chapter[]>>({})

  const currentWorkId = ref<number | null>(null)
  const currentChapterId = ref<number | null>(null)
  const dbReady = ref(false)
  const outlineVersion = ref(0)  // 大纲版本号，写入时递增触发刷新
  const settingVersion = ref(0)  // 设定版本号，角色/世界观/伏笔变更时递增触发刷新

  const currentWork = computed(() => works.value.find(w => w.id === currentWorkId.value) ?? null)

  /** 获取当前作品下所有章节的总字数 */
  const totalWordCount = computed(() => {
    let total = 0
    for (const chs of Object.values(chapterMap.value)) {
      for (const ch of chs) total += ch.word_count
    }
    return total
  })

  // ── 作品 ──

  async function loadWorks() {
    works.value = await fetchWorks()
  }

  async function addWork(title: string) {
    const id = await createWork(title)
    await loadWorks()
    return id
  }

  async function renameWork(id: number, title: string) {
    await updateWork(id, title)
    await loadWorks()
  }

  async function removeWork(id: number) {
    await deleteWork(id)
    if (currentWorkId.value === id) {
      currentWorkId.value = null
      volumes.value = []
      chapterMap.value = {}
    }
    await loadWorks()
  }

  // ── 卷 ──

  async function loadVolumes(workId: number) {
    volumes.value = await fetchVolumes(workId)
    const results = await Promise.all(volumes.value.map(vol => fetchChapters(vol.id)))
    volumes.value.forEach((vol, i) => { chapterMap.value[vol.id] = results[i] })
  }

  async function selectWork(workId: number) {
    currentWorkId.value = workId
    currentChapterId.value = null
    await loadVolumes(workId)
  }

  async function addVolume(workId: number, title: string) {
    const maxOrder = Math.max(...volumes.value.map(v => v.sort_order), -1) + 1
    const id = await createVolume(workId, title, maxOrder)
    await loadVolumes(workId)
    return id
  }

  async function renameVolume(id: number, title: string) {
    await updateVolume(id, title)
    const vol = volumes.value.find(v => v.id === id)
    if (vol) vol.title = title
  }

  async function removeVolume(id: number) {
    await deleteVolume(id)
    volumes.value = volumes.value.filter(v => v.id !== id)
    delete chapterMap.value[id]
  }

  async function moveVolume(volumeId: number, direction: 'up' | 'down') {
    const idx = volumes.value.findIndex(v => v.id === volumeId)
    if (direction === 'up' && idx > 0) {
      ;[volumes.value[idx - 1], volumes.value[idx]] = [volumes.value[idx], volumes.value[idx - 1]]
    } else if (direction === 'down' && idx < volumes.value.length - 1) {
      ;[volumes.value[idx], volumes.value[idx + 1]] = [volumes.value[idx + 1], volumes.value[idx]]
    }
    await reorderVolumes(volumes.value.map(v => v.id))
  }

  // ── 章节 ──

  async function addChapter(volumeId: number, title: string, position?: 'before' | 'after', refId?: number) {
    const chs = chapterMap.value[volumeId] ?? []
    let sortOrder = chs.length

    if (refId !== undefined && position !== undefined) {
      const refIdx = chs.findIndex(c => c.id === refId)
      sortOrder = refIdx === -1 ? chs.length : (position === 'after' ? refIdx + 1 : refIdx)
    }

    // 先插入新章节（sortOrder 为目标位置，可能和现有章节冲突）
    const id = await createChapter(volumeId, title, '', sortOrder)

    // 重新加载全部章节（含新章节），按 sort_order 排序
    const allChs = await fetchChapters(volumeId)
    // 把新章节从末尾移到目标位置
    const newIdx = allChs.findIndex(c => c.id === id)
    if (newIdx >= 0 && newIdx !== sortOrder) {
      const [newCh] = allChs.splice(newIdx, 1)
      allChs.splice(sortOrder, 0, newCh)
    }
    // 统一重排 sort_order（0,1,2,3...）
    await reorderChapters(allChs.map(c => c.id))

    chapterMap.value[volumeId] = await fetchChapters(volumeId)
    return id
  }

  async function renameChapter(volumeId: number, id: number, title: string) {
    await updateChapterTitle(id, title)
    const ch = chapterMap.value[volumeId]?.find(c => c.id === id)
    if (ch) ch.title = title
  }

  async function removeChapter(volumeId: number, id: number) {
    await deleteChapter(id)
    chapterMap.value[volumeId] = (chapterMap.value[volumeId] ?? []).filter(c => c.id !== id)
    if (currentChapterId.value === id) currentChapterId.value = null
  }

  async function moveChapter(volumeId: number, chapterId: number, direction: 'up' | 'down') {
    const chs = chapterMap.value[volumeId] ?? []
    const idx = chs.findIndex(c => c.id === chapterId)
    if (direction === 'up' && idx > 0) {
      ;[chs[idx - 1], chs[idx]] = [chs[idx], chs[idx - 1]]
    } else if (direction === 'down' && idx < chs.length - 1) {
      ;[chs[idx], chs[idx + 1]] = [chs[idx + 1], chs[idx]]
    }
    await reorderChapters(chs.map(c => c.id))
  }

  /** 更新本地章节字数（保存后同步） */
  function updateLocalWordCount(chapterId: number, volumeId: number, wordCount: number) {
    const ch = chapterMap.value[volumeId]?.find(c => c.id === chapterId)
    if (ch) ch.word_count = wordCount
  }

  return {
    works, volumes, chapterMap,
    currentWorkId, currentChapterId, currentWork, totalWordCount,
    dbReady, outlineVersion, settingVersion,
    loadWorks, addWork, renameWork, removeWork,
    selectWork, loadVolumes,
    addVolume, renameVolume, removeVolume, moveVolume,
    addChapter, renameChapter, removeChapter, moveChapter,
    updateLocalWordCount,
  }
})
