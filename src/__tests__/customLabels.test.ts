import { describe, it, expect, beforeEach } from 'vitest'
import {
  addCustomLabel, getCustomLabels, removeCustomLabel, resetAllLabels,
  type LabelCategory,
} from '../composables/useCustomLabels'

beforeEach(() => resetAllLabels())

describe('useCustomLabels', () => {
  it('addCustomLabel 应新增自定义标签', () => {
    const l = addCustomLabel('genre', 'custom_genre_1', '我的自定义题材')
    expect(l.id).toMatch(/^cl_/)
    expect(l.category).toBe('genre')
    expect(l.value).toBe('custom_genre_1')
    expect(l.label).toBe('我的自定义题材')

    const genres = getCustomLabels('genre')
    expect(genres.some(g => g.value === 'custom_genre_1')).toBe(true)
  })

  it('addCustomLabel 同类别同 value 应去重', () => {
    addCustomLabel('element', 'dup', '重复元素')
    addCustomLabel('element', 'dup', '重复元素2')
    const list = getCustomLabels('element')
    expect(list.filter(l => l.value === 'dup')).toHaveLength(1)
    expect(list.find(l => l.value === 'dup')!.label).toBe('重复元素') // 保留第一次
  })

  it('getCustomLabels 应按类别过滤', () => {
    addCustomLabel('genre', 'g1', '题材A')
    addCustomLabel('subgenre', 's1', '子标签B')
    addCustomLabel('element', 'e1', '元素C')

    expect(getCustomLabels('genre')).toHaveLength(1)
    expect(getCustomLabels('subgenre')).toHaveLength(1)
    expect(getCustomLabels('element')).toHaveLength(1)
    expect(getCustomLabels('cool_point')).toHaveLength(0)
  })

  it('removeCustomLabel 应删除指定标签', () => {
    const l = addCustomLabel('cool_point', 'cp1', '我的爽点')
    expect(getCustomLabels('cool_point')).toHaveLength(1)

    expect(removeCustomLabel(l.id)).toBe(true)
    expect(getCustomLabels('cool_point')).toHaveLength(0)
  })

  it('removeCustomLabel 不存在的 ID 返回 false', () => {
    expect(removeCustomLabel('nonexistent')).toBe(false)
  })

  it('自定义标签应与内置标签共存', () => {
    addCustomLabel('genre', 'custom_1', '科幻推理')
    addCustomLabel('genre', 'custom_2', '东方玄幻+')

    const list = getCustomLabels('genre')
    expect(list).toHaveLength(2)
    expect(list.map(l => l.label)).toContain('科幻推理')
    expect(list.map(l => l.label)).toContain('东方玄幻+')
  })
})
