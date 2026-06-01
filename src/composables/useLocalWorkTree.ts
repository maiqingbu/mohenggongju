/**
 * 浏览器 dev 模式的 localStorage 作品存储
 *
 * 在 Tauri FS 不可用时作为 workStore 的降级替代。
 * 提供与 workStore 兼容的响应式接口。
 */

import { ref } from 'vue'
import type { Work, Volume, Chapter } from './useDatabase'

const LS_KEY = 'ns:local:tree'

interface LocalTreeData {
  works: Work[]
  volumes: Volume[]
  chapters: Record<number, Chapter[]>
  nextId: number
}

function loadData(): LocalTreeData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { works: [], volumes: [], chapters: {}, nextId: 1 }
}

function saveData(data: LocalTreeData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

// ── 全局单例状态 ──
const data = loadData()

export const localWorks = ref<Work[]>(data.works)
export const localVolumes = ref<Volume[]>(data.volumes)
export const localChapterMap = ref<Record<number, Chapter[]>>(data.chapters)
// 检测 localStorage 是否可用（隐私模式可能禁用）
function checkLocalStorageAvailable(): boolean {
  try {
    const key = '__ls_test__'
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export const localDbReady = ref(checkLocalStorageAvailable())
// 页面刷新时从 localStorage 恢复上次选中的作品
function restoreCurrentWorkId(): number | null {
  try {
    const saved = localStorage.getItem('ns:currentWorkId')
    if (!saved) return null
    const num = Number(saved)
    return isNaN(num) || num <= 0 ? null : num
  } catch { return null }
}

export const localCurrentWorkId = ref<number | null>(restoreCurrentWorkId())
export const localCurrentChapterId = ref<number | null>(null)

function nextId(): number {
  return data.nextId++
}

function persist() {
  data.works = localWorks.value
  data.volumes = localVolumes.value
  data.chapters = localChapterMap.value
  saveData(data)
}

export function localLoadWorks() {
  localWorks.value = data.works
}

export async function localAddWork(title: string): Promise<number> {
  const id = nextId()
  const now = new Date().toISOString()
  localWorks.value.push({ id, title, created_at: now, updated_at: now })
  persist()
  return id
}

export async function localRenameWork(id: number, title: string) {
  const w = localWorks.value.find(x => x.id === id)
  if (w) { w.title = title; w.updated_at = new Date().toISOString() }
  persist()
}

export async function localRemoveWork(id: number) {
  // 先清理 chapters，再删 volumes，否则 filter 后条件永不匹配
  for (const v of localVolumes.value) {
    if (v.work_id === id) delete localChapterMap.value[v.id]
  }
  localWorks.value = localWorks.value.filter(w => w.id !== id)
  localVolumes.value = localVolumes.value.filter(v => v.work_id !== id)
  if (localCurrentWorkId.value === id) localCurrentWorkId.value = null
  persist()
}

export async function localSelectWork(workId: number) {
  localCurrentWorkId.value = workId
  localCurrentChapterId.value = null
  try { localStorage.setItem('ns:currentWorkId', String(workId)) } catch (e) { console.warn('[useLocalWorkTree] persist currentWorkId failed:', e) }
  // ensure volumes are loaded
  const vols = localVolumes.value.filter(v => v.work_id === workId)
  vols.sort((a, b) => a.sort_order - b.sort_order)
}

export async function localAddVolume(workId: number, title: string): Promise<number> {
  const id = nextId()
  const sortOrder = localVolumes.value.filter(v => v.work_id === workId).length
  localVolumes.value.push({ id, work_id: workId, title, sort_order: sortOrder })
  if (!localChapterMap.value[id]) localChapterMap.value[id] = []
  persist()
  return id
}

export async function localRenameVolume(id: number, title: string) {
  const v = localVolumes.value.find(x => x.id === id)
  if (v) v.title = title
  persist()
}

export async function localRemoveVolume(id: number) {
  localVolumes.value = localVolumes.value.filter(v => v.id !== id)
  delete localChapterMap.value[id]
  persist()
}

export async function localMoveVolume(volumeId: number, direction: 'up' | 'down') {
  const workId = localVolumes.value.find(v => v.id === volumeId)?.work_id
  if (!workId) return
  const vols = localVolumes.value.filter(v => v.work_id === workId).sort((a, b) => a.sort_order - b.sort_order)
  const idx = vols.findIndex(v => v.id === volumeId)
  if (direction === 'up' && idx > 0) {
    ;[vols[idx - 1], vols[idx]] = [vols[idx], vols[idx - 1]]
  } else if (direction === 'down' && idx < vols.length - 1) {
    ;[vols[idx], vols[idx + 1]] = [vols[idx + 1], vols[idx]]
  }
  vols.forEach((v, i) => { v.sort_order = i })
  persist()
}

export async function localAddChapter(volumeId: number, title: string): Promise<number> {
  const id = nextId()
  const chs = localChapterMap.value[volumeId] ?? []
  const now = new Date().toISOString()
  chs.push({ id, volume_id: volumeId, title, content: '', word_count: 0, sort_order: chs.length, created_at: now, updated_at: now })
  localChapterMap.value[volumeId] = chs
  persist()
  return id
}

export async function localRenameChapter(volumeId: number, id: number, title: string) {
  const ch = localChapterMap.value[volumeId]?.find(c => c.id === id)
  if (ch) { ch.title = title; ch.updated_at = new Date().toISOString() }
  persist()
}

export async function localRemoveChapter(volumeId: number, id: number) {
  localChapterMap.value[volumeId] = (localChapterMap.value[volumeId] ?? []).filter(c => c.id !== id)
  if (localCurrentChapterId.value === id) localCurrentChapterId.value = null
  persist()
}

/** 拖拽后直接持久化当前数组顺序（不移动元素，仅写 sort_order + 落盘） */
export function localPersistChapterOrder(volumeId: number) {
  const chs = localChapterMap.value[volumeId] ?? []
  chs.forEach((c, i) => { c.sort_order = i })
  persist()
}

export async function localMoveChapter(
  volumeId: number,
  chapterId: number,
  direction: 'up' | 'down',
) {
  const chs = localChapterMap.value[volumeId] ?? []
  const idx = chs.findIndex(c => c.id === chapterId)
  if (direction === 'up' && idx > 0) {
    ;[chs[idx - 1], chs[idx]] = [chs[idx], chs[idx - 1]]
  } else if (direction === 'down' && idx < chs.length - 1) {
    ;[chs[idx], chs[idx + 1]] = [chs[idx + 1], chs[idx]]
  }
  chs.forEach((c, i) => { c.sort_order = i })
  persist()
}

/** 更新章节内容（保存后同步） */
export function localUpdateChapterContent(chapterId: number, volumeId: number, content: string, wordCount: number) {
  const ch = localChapterMap.value[volumeId]?.find(c => c.id === chapterId)
  if (ch) { ch.content = content; ch.word_count = wordCount; ch.updated_at = new Date().toISOString() }
  persist()
}

/** 检测 Tauri 运行时是否可用 */
/** 统一 Tauri 运行时检测。全项目唯一入口，避免散落 (window as any).__TAURI_INTERNALS__ */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

/** @deprecated 使用 isTauri() */
export const isTauriAvailable = isTauri
