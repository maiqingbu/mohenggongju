/**
 * E1: 统一数据源 — tauri ? piniaStore : localStore
 *
 * 浏览器模式下接入 useLocalWorkTree 的 localStorage 实现。
 */
import { computed } from 'vue'
import { useWorkStore } from '../stores/workStore'
import {
  isTauri,
  localWorks, localVolumes, localChapterMap,
  localCurrentWorkId, localCurrentChapterId, localDbReady,
  localLoadWorks, localAddWork, localRenameWork, localRemoveWork,
  localSelectWork, localAddVolume, localRenameVolume, localRemoveVolume, localMoveVolume,
  localAddChapter, localRenameChapter, localRemoveChapter,
} from './useLocalWorkTree'
import type { Chapter } from './useDatabase'

const tauri = isTauri()

function getStore() {
  return tauri ? useWorkStore() : null
}

export function useWorkRepo() {
  const pinia = getStore()

  const works = pinia ? computed(() => pinia.works) : localWorks
  const volumes = pinia ? computed(() => pinia.volumes) : localVolumes
  const chapterMap = pinia ? computed(() => pinia.chapterMap) : localChapterMap
  const currentWorkId = pinia
    ? computed({ get: () => pinia.currentWorkId, set: (v) => { pinia.currentWorkId = v } })
    : localCurrentWorkId
  const currentChapterId = pinia
    ? computed({ get: () => pinia.currentChapterId, set: (v) => { pinia.currentChapterId = v } })
    : localCurrentChapterId
  const currentWork = pinia ? computed(() => pinia.currentWork) : computed(() => null)
  const totalWordCount = pinia ? computed(() => pinia.totalWordCount) : computed(() => 0)
  const dbReady = pinia ? computed(() => pinia.dbReady) : localDbReady

  async function loadWorks() { if (pinia) return pinia.loadWorks(); else localLoadWorks() }
  async function addWork(title: string): Promise<number> { return pinia ? pinia.addWork(title) : localAddWork(title) }
  async function renameWork(id: number, title: string) { if (pinia) await pinia.renameWork(id, title); else localRenameWork(id, title) }
  async function removeWork(id: number) { if (pinia) await pinia.removeWork(id); else localRemoveWork(id) }
  async function selectWork(workId: number) { if (pinia) await pinia.selectWork(workId); else localSelectWork(workId) }
  function selectChapter(chapterId: number) { currentChapterId.value = chapterId }
  async function addVolume(workId: number, title: string): Promise<number> { return pinia ? pinia.addVolume(workId, title) : localAddVolume(workId, title) }
  async function renameVolume(id: number, title: string) { if (pinia) await pinia.renameVolume(id, title); else localRenameVolume(id, title) }
  async function removeVolume(id: number) { if (pinia) await pinia.removeVolume(id); else localRemoveVolume(id) }
  async function moveVolume(volumeId: number, direction: 'up' | 'down') { if (pinia) await pinia.moveVolume(volumeId, direction); else await localMoveVolume(volumeId, direction) }
  async function addChapter(volumeId: number, title: string, position?: 'before' | 'after', refId?: number): Promise<number> { return pinia ? pinia.addChapter(volumeId, title, position, refId) : localAddChapter(volumeId, title) }
  async function renameChapter(volumeId: number, id: number, title: string) { if (pinia) await pinia.renameChapter(volumeId, id, title); else localRenameChapter(volumeId, id, title) }
  async function removeChapter(volumeId: number, id: number) { if (pinia) await pinia.removeChapter(volumeId, id); else localRemoveChapter(volumeId, id) }
  async function moveChapter(volumeId: number, chapterId: number, direction: 'up' | 'down') { if (pinia) await pinia.moveChapter(volumeId, chapterId, direction) }
  function updateLocalWordCount(chapterId: number, volumeId: number, wordCount: number) {
    if (pinia) pinia.updateLocalWordCount(chapterId, volumeId, wordCount)
    else { const chs = localChapterMap.value[volumeId]; const ch = chs?.find((c: Chapter) => c.id === chapterId); if (ch) ch.word_count = wordCount }
  }

  return {
    works, volumes, chapterMap,
    currentWorkId, currentChapterId, currentWork, totalWordCount, dbReady,
    loadWorks, addWork, renameWork, removeWork,
    selectWork, selectChapter,
    addVolume, renameVolume, removeVolume, moveVolume,
    addChapter, renameChapter, removeChapter, moveChapter,
    updateLocalWordCount,
  }
}

export function isTauriRepo(): boolean {
  return tauri
}
