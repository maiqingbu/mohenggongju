/**
 * useHighlights 单元测试 — 高亮 CRUD + 位置重对齐
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useHighlights, getHighlightLinePosition, type Highlight } from '../composables/useHighlights'

function fresh(chapterId = '1') {
  const mgr = useHighlights(chapterId)
  mgr.clearAll()
  return mgr
}

// ── 辅助函数：创建高亮后手动修改 localStorage，模拟位置陈旧 ──

/** 创建一条高亮，返回 hl */
function addHl(mgr: ReturnType<typeof useHighlights>, start: number, end: number, text: string): Highlight {
  return mgr.add(start, end, text)
}

/** 模拟文本编辑后 localStorage 中的高亮位置未更新的场景 */
function corruptPosition(mgr: ReturnType<typeof useHighlights>, hlId: string, delta: number) {
  const raw = localStorage.getItem('ns:highlights')!
  const all = JSON.parse(raw) as Highlight[]
  const h = all.find(h => h.id === hlId)
  if (h) {
    h.start += delta
    h.end += delta
  }
  localStorage.setItem('ns:highlights', JSON.stringify(all))
}

describe('useHighlights CRUD', () => {
  beforeEach(() => localStorage.clear())

  it('add() → list() 往返', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 10, 15, '测试')
    const list = mgr.list()
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('测试')
    expect(list[0].start).toBe(10)
    expect(list[0].end).toBe(15)
    expect(list[0].color).toBeTruthy()
  })

  it('remove() 按 ID 删除', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 0, 5, 'abc')
    expect(mgr.list()).toHaveLength(1)
    mgr.remove(hl.id)
    expect(mgr.list()).toHaveLength(0)
  })

  it('removeAt() 按位置删除', () => {
    const mgr = fresh()
    addHl(mgr, 0, 3, 'abc')
    const removed = mgr.removeAt(0, 3)
    expect(removed).toBeTruthy()
    expect(removed!.text).toBe('abc')
    expect(mgr.list()).toHaveLength(0)
  })

  it('update() 更新颜色和备注', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 0, 2, 'ab')
    mgr.update(hl.id, { color: '#ff0000', note: '重要' })
    const updated = mgr.list()[0]
    expect(updated.color).toBe('#ff0000')
    expect(updated.note).toBe('重要')
  })

  it('list() 按 start 排序', () => {
    const mgr = fresh()
    addHl(mgr, 30, 35, '后半')
    addHl(mgr, 5, 10, '前半')
    const list = mgr.list()
    expect(list[0].start).toBe(5)
    expect(list[1].start).toBe(30)
  })

  it('clearAll() 只清当前章节', () => {
    const mgr1 = useHighlights('ch1')
    const mgr2 = useHighlights('ch2')
    mgr1.add(0, 3, 'a')
    mgr2.add(0, 3, 'b')
    mgr1.clearAll()
    expect(mgr1.list()).toHaveLength(0)
    expect(mgr2.list()).toHaveLength(1)
  })
})

describe('realignHighlights — 位置重对齐', () => {
  beforeEach(() => localStorage.clear())

  const originalText = '第一章　山雨欲来\n\n清朝末年，天下大乱。苏婉站在城墙上，看着远方的烽火，心中波涛汹涌。\n\n她转身对陆景行说："我们该走了。"'

  it('位置精确匹配时不应修改', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 20, 22, '苏婉')
    expect(mgr.list()[0].start).toBe(20)

    const realigned = mgr.realignHighlights(originalText)
    expect(realigned).toBe(0) // 没变化
    expect(mgr.list()[0].start).toBe(20) // 位置不变
    expect(mgr.list()[0].end).toBe(22)
  })

  it('插入文字后应自动找到高亮文字的新位置', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 20, 22, '苏婉')
    const oldStart = hl.start

    // 模拟在文本前插入了 50 个字符
    const newText = '　　' + '前言：这是一段新增的序言文字，描述了故事背景。'.repeat(2) + originalText

    const realigned = mgr.realignHighlights(newText)
    expect(realigned).toBe(1)
    const updated = mgr.list()[0]
    // 新位置应该 > 旧位置
    expect(updated.start).toBeGreaterThan(oldStart)
    // 高亮文字本身没变
    expect(newText.slice(updated.start, updated.end)).toBe('苏婉')
  })

  it('删除文字后应自动找到高亮文字的新位置', () => {
    const mgr = fresh()
    // 找 "苏婉" 在 originalText 中的位置
    const idx = originalText.indexOf('苏婉')
    const hl = addHl(mgr, idx, idx + 2, '苏婉')
    const oldStart = hl.start

    // 模拟删除了开头 16 个字符
    const deleted = originalText.slice(16)
    const realigned = mgr.realignHighlights(deleted)
    expect(realigned).toBe(1)
    const updated = mgr.list()[0]
    expect(updated.start).toBeLessThan(oldStart)
    expect(deleted.slice(updated.start, updated.end)).toBe('苏婉')
  })

  it('多处匹配时选离原位置最近的那个', () => {
    const mgr = fresh()
    const repeatedText = '苏婉，苏婉，又是苏婉。' + originalText + '\n苏婉再次出现。'
    // "苏婉" 在文本中出现多次

    // 先找到 originalText 中 "苏婉" 的位置
    const idx = originalText.indexOf('苏婉')
    // 在 repeatedText 中，originalText 的偏移量
    const prefix = '苏婉，苏婉，又是苏婉。'
    const prefixLen = prefix.length

    // 把高亮位置设在 originalText 中 "苏婉" 的位置（此时已偏移 prefixLen）
    const hl = addHl(mgr, prefixLen + idx, prefixLen + idx + 2, '苏婉')

    // 模拟插入 prefix 后位置没更新的场景
    // corruptPosition 把位置改回 originalText 中的偏移（没加 prefix）
    const raw = localStorage.getItem('ns:highlights')!
    const all = JSON.parse(raw) as Highlight[]
    const h = all.find(h => h.id === hl.id)
    if (h) { h.start = idx; h.end = idx + 2 }
    localStorage.setItem('ns:highlights', JSON.stringify(all))

    const realigned = mgr.realignHighlights(repeatedText)
    expect(realigned).toBe(1)
    const updated = mgr.list()[0]
    // 应该对齐到 originalText 中的 "苏婉"（即 prefixLen + idx），
    // 而不是 prefix 中的那几个
    expect(updated.start).toBe(prefixLen + idx)
    expect(repeatedText.slice(updated.start, updated.end)).toBe('苏婉')
  })

  it('高亮文字完全被删除时保留旧位置（不崩溃）', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 20, 22, '苏婉')

    // 全文替换为不包含 "苏婉" 的文本
    const newText = '这本书讲的是一段全新的故事，没有原来的角色。'
    const realigned = mgr.realignHighlights(newText)
    expect(realigned).toBe(0) // 一条也没对齐成功
    // 不崩溃，位置不变
    expect(mgr.list()[0].start).toBe(20)
  })

  it('短文本（<4字）不在全文回退搜索，避免误匹配', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 5, 6, '的')

    // 正文大变，邻近窗口找不到 "的"（实际上到处都是）
    // 但因为 hl.text.length < 4，不会触发全文回退
    const newText = '不同的文本内容在这里'
    // 把高亮移到一个不存在的区域，模拟位置完全漂移
    corruptPosition(mgr, hl.id, 1000)

    const realigned = mgr.realignHighlights(newText)
    expect(realigned).toBe(0)
  })

  it('空高亮文本应跳过不处理', () => {
    const mgr = fresh()
    const hl = addHl(mgr, 0, 0, '')

    const realigned = mgr.realignHighlights('任意文本')
    expect(realigned).toBe(0)
  })

  it('多章节互不干扰', () => {
    const mgr1 = useHighlights('ch1')
    const mgr2 = useHighlights('ch2')
    addHl(mgr1, 5, 8, '角色A')
    addHl(mgr2, 10, 13, '角色B')

    const newText = '前言前言前言' + '角色A在远方'
    const r1 = mgr1.realignHighlights(newText)
    const r2 = mgr2.realignHighlights('完全不相关的章节内容')

    expect(r1).toBe(1) // ch1 的对齐了
    expect(r2).toBe(0) // ch2 的没找到（文本变了）
    // ch1 的高亮没被 ch2 影响
    expect(mgr1.list()).toHaveLength(1)
    expect(mgr1.list()[0].text).toBe('角色A')
  })

  it('批量高亮全部需要重对齐', () => {
    const mgr = fresh()
    const h1 = addHl(mgr, 20, 22, '苏婉')
    const h2 = addHl(mgr, 45, 48, '陆景行')

    const newText = '　　（序）' + '\n\n' + originalText
    const realigned = mgr.realignHighlights(newText)
    expect(realigned).toBe(2)
    const list = mgr.list()
    expect(newText.slice(list[0].start, list[0].end)).toBe('苏婉')
    expect(newText.slice(list[1].start, list[1].end)).toBe('陆景行')
  })
})

describe('getHighlightLinePosition', () => {
  it('单行文本起始位置应为 0', () => {
    expect(getHighlightLinePosition(0, '只有一行')).toBe(0)
  })

  it('两行文本中第二行的位置应接近 100', () => {
    const text = '第一行\n第二行'
    const pos = getHighlightLinePosition(text.indexOf('第'), text)
    expect(pos).toBe(0)
    const pos2 = getHighlightLinePosition(text.indexOf('二'), text)
    // 1 个换行符，totalLines = 2，beforeLines = 1，ratio = 1/1 * 100 = 100
    expect(pos2).toBe(100)
  })

  it('多行文本中中间行的位置应在 50% 左右', () => {
    const text = 'a\nb\nc\nd\ne'
    const pos = getHighlightLinePosition(text.indexOf('c'), text)
    // totalLines = 5, beforeLines = 2 (两个 \n 在 c 之前), ratio = 2/(5-1)*100 = 50
    expect(pos).toBe(50)
  })

  it('start 超过文本长度时截断到末尾', () => {
    const text = '短文本'
    const pos = getHighlightLinePosition(999, text)
    // clamped = 3 (text.length), beforeLines=0, totalLines=1 -> 0
    expect(pos).toBe(0)
  })

  it('空文本返回 0', () => {
    expect(getHighlightLinePosition(0, '')).toBe(0)
    expect(getHighlightLinePosition(5, '')).toBe(0)
  })
})
