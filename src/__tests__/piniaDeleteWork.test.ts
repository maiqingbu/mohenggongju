/**
 * 测试 Pinia store removeWork 响应式行为
 * 模拟 Tauri FS，验证删除后 works.value 是否更新
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// ── 模拟 Tauri FS ──
const mockFiles: Record<string, string> = {}

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 18 },
  readTextFile: async (path: string) => {
    if (mockFiles[path] !== undefined) return mockFiles[path]
    // Simulate file-not-found
    const err = new Error('file not found') as any
    err.code = 'ENOENT'
    throw err
  },
  writeTextFile: async (path: string, content: string) => {
    mockFiles[path] = content
  },
  mkdir: async () => {},
  exists: async () => false,
  remove: async () => {},
}))

describe('Pinia workStore.removeWork', () => {
  beforeEach(() => {
    // Reset mock files
    Object.keys(mockFiles).forEach(k => delete mockFiles[k])
    // Reset Pinia
    setActivePinia(createPinia())
    // Reset the module-level state in useDatabase
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function setupStore() {
    // Must dynamically import after mock setup
    const { initDatabase } = await import('../composables/useDatabase')
    const { useWorkStore } = await import('../stores/workStore')

    // Set up initial state
    mockFiles['novel-studio/state.json'] = JSON.stringify({
      nextWorkId: 3, nextVolumeId: 3, nextChapterId: 3
    })
    mockFiles['novel-studio/works/index.json'] = JSON.stringify({})

    await initDatabase()
    const store = useWorkStore()

    // Add 3 works (matching the user's data)
    const id1 = await store.addWork('fanfic_open - 2026/5/25')
    const id2 = await store.addWork('family - 2026/5/25')
    const id3 = await store.addWork('纯文学短篇 · 豆瓣阅读 · 2026/5/25')

    return { store, ids: [id1, id2, id3] }
  }

  it('should remove work from works ref after deleteWork', async () => {
    const { store, ids } = await setupStore()
    const [id1, id2, id3] = ids

    expect(store.works.length).toBe(3)

    // Remove the short story work
    await store.removeWork(id3)
    await nextTick()

    // Verify store state
    expect(store.works.length).toBe(2)
    expect(store.works.find(w => w.id === id3)).toBeUndefined()
    expect(store.works.find(w => w.id === id1)).toBeDefined()
    expect(store.works.find(w => w.id === id2)).toBeDefined()
  })

  it('should remove work and update works ref reactively', async () => {
    const { store, ids } = await setupStore()

    const beforeLen = store.works.length
    expect(beforeLen).toBe(3)

    await store.removeWork(ids[0])
    await nextTick()

    const afterLen = store.works.length
    expect(afterLen).toBe(2)
    expect(store.works.some(w => w.id === ids[0])).toBe(false)
  })

  it('should persist removal to disk', async () => {
    const { store, ids } = await setupStore()
    const [id1] = ids

    await store.removeWork(id1)
    await nextTick()

    // Check disk state via mock files
    const diskJson = JSON.parse(mockFiles['novel-studio/works/index.json'])
    expect(diskJson[id1]).toBeUndefined()
    expect(Object.keys(diskJson).length).toBe(2)
  })

  it('should clean up currentWorkId if deleted work was selected', async () => {
    const { store, ids } = await setupStore()
    const [id1] = ids

    // Select the work first
    store.currentWorkId = id1
    expect(store.currentWorkId).toBe(id1)

    await store.removeWork(id1)
    await nextTick()

    expect(store.currentWorkId).toBeNull()
  })
})
