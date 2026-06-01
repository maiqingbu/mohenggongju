/**
 * 数据层：使用 Tauri FS 插件读写本地 JSON 文件
 * 每个作品一个目录，包含 volumes.json, chapters.json, settings.json 等
 */

import { BaseDirectory, readTextFile, writeTextFile, mkdir, exists, remove } from '@tauri-apps/plugin-fs'

export interface Work {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface Volume {
  id: number
  work_id: number
  title: string
  sort_order: number
}

export interface Chapter {
  id: number
  volume_id: number
  title: string
  content: string
  word_count: number
  sort_order: number
  created_at: string
  updated_at: string
}

let nextWorkId = 1
let nextVolumeId = 1
let nextChapterId = 1

const DATA_DIR = 'novel-studio'

// ── 章节父卷索引：chapterId → volumeId，避免 findChapter 全盘扫描 ──
const CHAPTER_PARENT_INDEX_PATH = `${DATA_DIR}/chapters/_parent.json`
let _chapterParentIndex: Record<number, number> | null = null

async function loadChapterParentIndex(): Promise<Record<number, number>> {
  if (_chapterParentIndex) return _chapterParentIndex
  _chapterParentIndex = await readJson<Record<number, number>>(CHAPTER_PARENT_INDEX_PATH) || {}
  return _chapterParentIndex!
}

async function saveChapterParentIndex(idx: Record<number, number>) {
  _chapterParentIndex = idx
  await writeJson(CHAPTER_PARENT_INDEX_PATH, idx)
}

// ── 写入串行化：所有 read→mutate→write 操作排队执行 ──
let _writeTail: Promise<void> = Promise.resolve()

export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    // catch 隔离每次操作，单个写失败不会永久阻塞后续写入
    _writeTail = _writeTail.catch(() => {}).then(() => fn().then(resolve, reject))
  })
}

async function ensureDir(path: string) {
  const dirExists = await exists(path, { baseDir: BaseDirectory.AppData })
  if (!dirExists) await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const text = await readTextFile(filePath, { baseDir: BaseDirectory.AppData })
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writeJson(filePath: string, data: unknown) {
  await writeTextFile(filePath, JSON.stringify(data, null, 2), { baseDir: BaseDirectory.AppData })
}

// ── 初始化 ──

export async function initDatabase(): Promise<string> {
  await ensureDir(DATA_DIR)
  await ensureDir(`${DATA_DIR}/works`)

  const state = await readJson<{ nextWorkId: number; nextVolumeId: number; nextChapterId: number }>(`${DATA_DIR}/state.json`)
  if (state) {
    nextWorkId = state.nextWorkId
    nextVolumeId = state.nextVolumeId
    nextChapterId = state.nextChapterId
  }
  return DATA_DIR
}

// ── Works ──

export async function fetchWorks(): Promise<Work[]> {
  const list = await readJson<Record<number, Work>>(`${DATA_DIR}/works/index.json`)
  if (!list) return []
  return Object.values(list).sort((a, b) => b.id - a.id)
}

export function createWork(title: string): Promise<number> {
  return serialized(async () => {
    const id = nextWorkId++
    const list = await readJson<Record<number, Work>>(`${DATA_DIR}/works/index.json`) || {}
    const now = new Date().toISOString()
    list[id] = { id, title, created_at: now, updated_at: now }
    await writeJson(`${DATA_DIR}/works/index.json`, list)
    await saveState()
    return id
  })
}

export function updateWork(id: number, title: string) {
  return serialized(async () => {
    const list = await readJson<Record<number, Work>>(`${DATA_DIR}/works/index.json`) || {}
    if (list[id]) list[id] = { ...list[id], title, updated_at: new Date().toISOString() }
    await writeJson(`${DATA_DIR}/works/index.json`, list)
  })
}

export function deleteWork(id: number) {
  return serialized(async () => {
    // 先清理关联的章节文件和父卷索引
    const vols = await fetchVolumes(id)
    const volIds = new Set(vols.map(v => v.id))
    const parentIdx = await loadChapterParentIndex()
    let idxDirty = false
    for (const vol of vols) {
      await remove(`${DATA_DIR}/chapters/${vol.id}.json`, { baseDir: BaseDirectory.AppData }).catch(() => {})
    }
    for (const chId of Object.keys(parentIdx)) {
      if (volIds.has(parentIdx[Number(chId)])) { delete parentIdx[Number(chId)]; idxDirty = true }
    }
    if (idxDirty) await saveChapterParentIndex(parentIdx)
    // 清理作品目录（volumes.json 等）
    await remove(`${DATA_DIR}/works/${id}`, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {})
    // 从索引中移除
    const list = await readJson<Record<number, Work>>(`${DATA_DIR}/works/index.json`) || {}
    delete list[id]
    await writeJson(`${DATA_DIR}/works/index.json`, list)
  })
}

// ── Volumes ──

export async function fetchVolumes(workId: number): Promise<Volume[]> {
  const vols = await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${workId}/volumes.json`)
  if (!vols) return []
  return Object.values(vols).sort((a, b) => a.sort_order - b.sort_order)
}

export function createVolume(workId: number, title: string, sortOrder: number): Promise<number> {
  return serialized(async () => {
    const id = nextVolumeId++
    await ensureDir(`${DATA_DIR}/works/${workId}`)
    const vols = await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${workId}/volumes.json`) || {}
    vols[id] = { id, work_id: workId, title, sort_order: sortOrder }
    await writeJson(`${DATA_DIR}/works/${workId}/volumes.json`, vols)
    await saveState()
    return id
  })
}

export function updateVolume(id: number, title: string) {
  return serialized(async () => {
    for (const work of await fetchWorks()) {
      const vols = await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${work.id}/volumes.json`)
      if (vols?.[id]) {
        vols[id] = { ...vols[id], title }
        await writeJson(`${DATA_DIR}/works/${work.id}/volumes.json`, vols)
        return
      }
    }
  })
}

export function deleteVolume(id: number) {
  return serialized(async () => {
    for (const work of await fetchWorks()) {
      const vols = await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${work.id}/volumes.json`)
      if (vols?.[id]) {
        delete vols[id]
        await writeJson(`${DATA_DIR}/works/${work.id}/volumes.json`, vols)
        // 清理关联的章节文件
        await remove(`${DATA_DIR}/chapters/${id}.json`, { baseDir: BaseDirectory.AppData }).catch(() => {})
        // 清理 _chapterParentIndex 中属于该卷的章节条目
        const parentIdx = await loadChapterParentIndex()
        let dirty = false
        for (const [chId, volId] of Object.entries(parentIdx)) {
          if (volId === id) { delete parentIdx[Number(chId)]; dirty = true }
        }
        if (dirty) await saveChapterParentIndex(parentIdx)
        return
      }
    }
  })
}

export function reorderVolumes(orderedIds: number[]) {
  return serialized(async () => {
    if (orderedIds.length === 0) return
    const workId = await findVolumeWork(orderedIds[0])
    if (workId === null) return
    const vols = await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${workId}/volumes.json`) || {}
    orderedIds.forEach((id, idx) => { if (vols[id]) vols[id].sort_order = idx })
    await writeJson(`${DATA_DIR}/works/${workId}/volumes.json`, vols)
  })
}

// ── Chapters ──

export async function fetchChapters(volumeId: number): Promise<Chapter[]> {
  const chs = await readJson<Record<number, Chapter>>(`${DATA_DIR}/chapters/${volumeId}.json`)
  if (!chs) return []
  return Object.values(chs).sort((a, b) => a.sort_order - b.sort_order)
}

export function createChapter(volumeId: number, title: string, content: string, sortOrder: number): Promise<number> {
  return serialized(async () => {
    const id = nextChapterId++
    await ensureDir(`${DATA_DIR}/chapters`)
    const chs = await readJson<Record<number, Chapter>>(`${DATA_DIR}/chapters/${volumeId}.json`) || {}
    const now = new Date().toISOString()
    chs[id] = { id, volume_id: volumeId, title, content, word_count: countWords(content), sort_order: sortOrder, created_at: now, updated_at: now }
    await writeJson(`${DATA_DIR}/chapters/${volumeId}.json`, chs)
    // 更新章节父卷索引
    const parentIdx = await loadChapterParentIndex()
    parentIdx[id] = volumeId
    await saveChapterParentIndex(parentIdx)
    await saveState()
    return id
  })
}

export function updateChapterContent(id: number, content: string) {
  return serialized(async () => {
    const { chs, volumeId } = await findChapter(id)
    if (chs?.[id]) {
      chs[id] = { ...chs[id], content, word_count: countWords(content), updated_at: new Date().toISOString() }
      await writeJson(`${DATA_DIR}/chapters/${volumeId}.json`, chs)
    }
  })
}

export function updateChapterTitle(id: number, title: string) {
  return serialized(async () => {
    const { chs, volumeId } = await findChapter(id)
    if (chs?.[id]) {
      chs[id] = { ...chs[id], title, updated_at: new Date().toISOString() }
      await writeJson(`${DATA_DIR}/chapters/${volumeId}.json`, chs)
    }
  })
}

export function deleteChapter(id: number) {
  return serialized(async () => {
    const { chs, volumeId } = await findChapter(id)
    if (chs?.[id]) {
      delete chs[id]
      await writeJson(`${DATA_DIR}/chapters/${volumeId}.json`, chs)
      // 清理父卷索引
      const parentIdx = await loadChapterParentIndex()
      delete parentIdx[id]
      await saveChapterParentIndex(parentIdx)
    }
  })
}

export function reorderChapters(orderedIds: number[]) {
  return serialized(async () => {
    if (orderedIds.length === 0) return
    const { chs, volumeId } = await findChapter(orderedIds[0])
    orderedIds.forEach((id, idx) => { if (chs && chs[id]) chs[id].sort_order = idx })
    if (chs) await writeJson(`${DATA_DIR}/chapters/${volumeId}.json`, chs)
  })
}

async function saveState() {
  await writeJson(`${DATA_DIR}/state.json`, { nextWorkId, nextVolumeId, nextChapterId })
}

// ── Helpers ──

async function findChapter(id: number) {
  const parentIdx = await loadChapterParentIndex()
  const volumeId = parentIdx[id]
  if (volumeId) {
    const chs = await readJson<Record<number, Chapter>>(`${DATA_DIR}/chapters/${volumeId}.json`)
    if (chs?.[id]) return { chs, volumeId }
  }
  return { chs: null, volumeId: 0 }
}

async function findVolumeWork(id: number): Promise<number | null> {
  const works = (await readJson<Record<number, Work>>(`${DATA_DIR}/works/index.json`)) || {}
  for (const workId of Object.keys(works)) {
    const vols = (await readJson<Record<number, Volume>>(`${DATA_DIR}/works/${workId}/volumes.json`)) || {}
    if (vols[id]) return Number(workId)
  }
  return null
}

export function countWords(text: string): number {
  if (!text) return 0
  const cn = (text.match(/\p{Script=Han}/gu) || []).length
  const en = (text.match(/[a-zA-Z]+/g) || []).length
  return cn + en
}
