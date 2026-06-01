/**
 * 测试作品删除全链路
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'

describe('delete work flow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('localRemoveWork removes work from localWorks ref', async () => {
    const { localAddWork, localRemoveWork, localWorks } = await import('../composables/useLocalWorkTree')

    const id1 = await localAddWork('作品A')
    const id2 = await localAddWork('作品B')

    expect(localWorks.value.length).toBe(2)
    expect(localWorks.value.map(w => w.id)).toContain(id1)
    expect(localWorks.value.map(w => w.id)).toContain(id2)

    await localRemoveWork(id1)
    await nextTick()

    expect(localWorks.value.length).toBe(1)
    expect(localWorks.value.map(w => w.id)).not.toContain(id1)
    expect(localWorks.value.map(w => w.id)).toContain(id2)
  })

  it('localRemoveWork persists to localStorage', async () => {
    const { localAddWork, localRemoveWork, localWorks } = await import('../composables/useLocalWorkTree')

    const id = await localAddWork('测试作品')
    await localRemoveWork(id)

    // 检查 localStorage 是否已更新
    const raw = localStorage.getItem('ns:local:tree')
    expect(raw).not.toBeNull()
    const data = JSON.parse(raw!)
    expect(data.works.length).toBe(0)
  })

  it('useWorkRepo.removeWork delegates correctly in browser mode', async () => {
    const { localAddWork, localWorks } = await import('../composables/useLocalWorkTree')
    const { useWorkRepo } = await import('../composables/useWorkRepo')

    const id = await localAddWork('测试作品')
    const repo = useWorkRepo()

    expect(repo.works.value.length).toBe(1)

    await repo.removeWork(id)
    await nextTick()

    expect(repo.works.value.length).toBe(0)
    expect(localWorks.value.length).toBe(0)
  })

  it('removeWork and re-add work does not resurrect deleted work', async () => {
    const { localAddWork, localRemoveWork, localWorks } = await import('../composables/useLocalWorkTree')

    const idA = await localAddWork('作品A')
    await localRemoveWork(idA)
    expect(localWorks.value.length).toBe(0)

    const idB = await localAddWork('作品B')
    expect(localWorks.value.length).toBe(1)
    expect(localWorks.value[0].id).toBe(idB)
    // 确认 idA 没被复活
    expect(localWorks.value.map(w => w.id)).not.toContain(idA)
  })
})
