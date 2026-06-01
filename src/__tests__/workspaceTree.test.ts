import { describe, it, expect } from 'vitest'
import type { Work, Volume, Chapter } from '../composables/useDatabase'

// ── 树节点类型 ──
export interface TreeNode {
  type: 'work' | 'volume' | 'chapter'
  id: number
  parentId: number | null
  title: string
  wordCount: number
  children: TreeNode[]
  expanded: boolean
}

// ── 纯函数：构建树结构 ──

export function buildTree(
  works: Work[],
  volumes: Volume[],
  chapterMap: Record<number, Chapter[]>,
  expandedWorkIds: Set<number>,
  expandedVolumeIds: Set<number>,
): TreeNode[] {
  return works.map(w => {
    const workVolumes = volumes.filter(v => v.work_id === w.id)
    const expanded = expandedWorkIds.has(w.id)
    return {
      type: 'work' as const,
      id: w.id,
      parentId: null,
      title: w.title,
      wordCount: 0,
      expanded,
      children: expanded
        ? workVolumes
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(v => {
              const chs = (chapterMap[v.id] ?? []).sort((a, b) => a.sort_order - b.sort_order)
              const volExpanded = expandedVolumeIds.has(v.id)
              return {
                type: 'volume' as const,
                id: v.id,
                parentId: w.id,
                title: v.title,
                wordCount: chs.reduce((sum, c) => sum + c.word_count, 0),
                expanded: volExpanded,
                children: volExpanded ? chs.map(c => ({
                  type: 'chapter' as const,
                  id: c.id,
                  parentId: v.id,
                  title: c.title,
                  wordCount: c.word_count,
                  children: [],
                  expanded: false,
                })) : [],
              }
            })
        : [],
    }
  })
}

// ── 纯函数：重排序 ID 数组 ──

export function reorderIds(ids: number[], fromIndex: number, toIndex: number): number[] {
  if (fromIndex < 0 || fromIndex >= ids.length) return ids
  if (toIndex < 0 || toIndex >= ids.length) return ids
  if (fromIndex === toIndex) return ids
  const result = [...ids]
  const [item] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, item)
  return result
}

// ── 纯函数：找下一个/上一个章节 ──

export function findAdjacentChapter(
  chapterMap: Record<number, Chapter[]>,
  volumes: Volume[],
  workId: number,
  currentChapterId: number,
  direction: 'next' | 'prev',
): number | null {
  const workVolumes = volumes.filter(v => v.work_id === workId).sort((a, b) => a.sort_order - b.sort_order)
  const allChapters: Chapter[] = []
  for (const v of workVolumes) {
    allChapters.push(...(chapterMap[v.id] ?? []).sort((a, b) => a.sort_order - b.sort_order))
  }
  const idx = allChapters.findIndex(c => c.id === currentChapterId)
  if (idx === -1) return null
  const target = direction === 'next' ? idx + 1 : idx - 1
  return allChapters[target]?.id ?? null
}

// ── 纯函数：统计作品总字数 ──

export function countWorkWords(
  workId: number,
  volumes: Volume[],
  chapterMap: Record<number, Chapter[]>,
): number {
  return volumes
    .filter(v => v.work_id === workId)
    .reduce((sum, v) => {
      const chs = chapterMap[v.id] ?? []
      return sum + chs.reduce((s, c) => s + c.word_count, 0)
    }, 0)
}

// ── 测试 ──

function makeWork(id: number, title: string, updatedAt = '2024-01-01'): Work {
  return { id, title, created_at: '2024-01-01', updated_at: updatedAt }
}

function makeVolume(id: number, workId: number, title: string, sortOrder = 0): Volume {
  return { id, work_id: workId, title, sort_order: sortOrder }
}

function makeChapter(id: number, volumeId: number, title: string, wordCount = 0, sortOrder = 0): Chapter {
  return { id, volume_id: volumeId, title, content: '', word_count: wordCount, sort_order: sortOrder, created_at: '', updated_at: '' }
}

describe('buildTree', () => {
  it('should return works as top-level nodes', () => {
    const works = [makeWork(1, '作品A')]
    const tree = buildTree(works, [], {}, new Set(), new Set())
    expect(tree).toHaveLength(1)
    expect(tree[0].type).toBe('work')
    expect(tree[0].title).toBe('作品A')
  })

  it('should return empty array when no works', () => {
    expect(buildTree([], [], {}, new Set(), new Set())).toEqual([])
  })

  it('should show volumes as children when work is expanded', () => {
    const works = [makeWork(1, '作品A')]
    const volumes = [makeVolume(10, 1, '第一卷')]
    const tree = buildTree(works, volumes, {}, new Set([1]), new Set())
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].type).toBe('volume')
  })

  it('should hide volumes when work is collapsed', () => {
    const works = [makeWork(1, '作品A')]
    const volumes = [makeVolume(10, 1, '第一卷')]
    const tree = buildTree(works, volumes, {}, new Set(), new Set())
    expect(tree[0].children).toEqual([])
  })

  it('should show chapters as children when volume is expanded', () => {
    const works = [makeWork(1, '作品A')]
    const volumes = [makeVolume(10, 1, '第一卷')]
    const chapterMap = { 10: [makeChapter(100, 10, '第一章')] }
    const tree = buildTree(works, volumes, chapterMap, new Set([1]), new Set([10]))
    expect(tree[0].children[0].children).toHaveLength(1)
    expect(tree[0].children[0].children[0].type).toBe('chapter')
  })

  it('should sort volumes by sort_order', () => {
    const works = [makeWork(1, '作品A')]
    const volumes = [
      makeVolume(20, 1, '第二卷', 1),
      makeVolume(10, 1, '第一卷', 0),
    ]
    const tree = buildTree(works, volumes, {}, new Set([1]), new Set())
    expect(tree[0].children[0].id).toBe(10)
    expect(tree[0].children[1].id).toBe(20)
  })

  it('should sort chapters by sort_order', () => {
    const works = [makeWork(1, '作品A')]
    const volumes = [makeVolume(10, 1, '第一卷')]
    const chapterMap = {
      10: [
        makeChapter(200, 10, '第二章', 0, 1),
        makeChapter(100, 10, '第一章', 0, 0),
      ],
    }
    const tree = buildTree(works, volumes, chapterMap, new Set([1]), new Set([10]))
    expect(tree[0].children[0].children[0].id).toBe(100)
    expect(tree[0].children[0].children[1].id).toBe(200)
  })
})

describe('reorderIds', () => {
  it('should move item from index 0 to index 2', () => {
    expect(reorderIds([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
  })

  it('should move item from index 3 to index 1', () => {
    expect(reorderIds([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3])
  })

  it('should return same array when fromIndex equals toIndex', () => {
    expect(reorderIds([1, 2, 3], 1, 1)).toEqual([1, 2, 3])
  })

  it('should return same array for out-of-bounds indices', () => {
    expect(reorderIds([1, 2, 3], -1, 1)).toEqual([1, 2, 3])
    expect(reorderIds([1, 2, 3], 0, 10)).toEqual([1, 2, 3])
  })

  it('should handle single-element array', () => {
    expect(reorderIds([1], 0, 0)).toEqual([1])
  })
})

describe('findAdjacentChapter', () => {
  const volumes = [makeVolume(10, 1, '第一卷', 0)]
  const chapterMap = {
    10: [
      makeChapter(100, 10, '第一章', 0, 0),
      makeChapter(200, 10, '第二章', 0, 1),
      makeChapter(300, 10, '第三章', 0, 2),
    ],
  }

  it('should find next chapter', () => {
    expect(findAdjacentChapter(chapterMap, volumes, 1, 100, 'next')).toBe(200)
    expect(findAdjacentChapter(chapterMap, volumes, 1, 200, 'next')).toBe(300)
  })

  it('should return null for last chapter next', () => {
    expect(findAdjacentChapter(chapterMap, volumes, 1, 300, 'next')).toBeNull()
  })

  it('should find previous chapter', () => {
    expect(findAdjacentChapter(chapterMap, volumes, 1, 300, 'prev')).toBe(200)
    expect(findAdjacentChapter(chapterMap, volumes, 1, 200, 'prev')).toBe(100)
  })

  it('should return null for first chapter prev', () => {
    expect(findAdjacentChapter(chapterMap, volumes, 1, 100, 'prev')).toBeNull()
  })

  it('should return null when chapter not found', () => {
    expect(findAdjacentChapter(chapterMap, volumes, 1, 999, 'next')).toBeNull()
  })
})

describe('countWorkWords', () => {
  it('should sum word counts across all volumes', () => {
    const volumes = [
      makeVolume(10, 1, '第一卷'),
      makeVolume(20, 1, '第二卷'),
    ]
    const chapterMap = {
      10: [makeChapter(100, 10, '第一章', 1500), makeChapter(101, 10, '第二章', 2000)],
      20: [makeChapter(200, 20, '第一章', 800)],
    }
    expect(countWorkWords(1, volumes, chapterMap)).toBe(4300)
  })

  it('should return 0 for work with no chapters', () => {
    expect(countWorkWords(1, [], {})).toBe(0)
  })
})
