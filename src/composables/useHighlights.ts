/**
 * 高亮管理系统：持久化存储、CRUD、章节关联
 * 支持分类体系和正则规则
 *
 * 包含 realignHighlights() 解决文本编辑后高亮位置偏移问题。
 * 包含 getHighlightLinePosition() 改善侧边栏标记的定位精度。
 */

// ── 类型 ──

export interface Highlight {
  id: string
  chapterId: string
  start: number
  end: number
  text: string
  color: string
  note: string
  category: string
  createdAt: string
}

export interface HighlightRegexRule {
  id: string
  pattern: string
  color: string
  category: string
  enabled: boolean
}

// ── 常量 ──

const STORAGE_KEY = 'ns:highlights'
const REGEX_RULES_KEY = 'ns:highlightRegexRules'
const COLORS = ['#ffeb3b', '#ff9800', '#4caf50', '#2196f3', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722']

// ── 正则规则持久化（模块级，不依赖 chapterId）──

export function loadHighlightRegexRules(): HighlightRegexRule[] {
  try {
    const raw = localStorage.getItem(REGEX_RULES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveHighlightRegexRules(rules: HighlightRegexRule[]) {
  try { localStorage.setItem(REGEX_RULES_KEY, JSON.stringify(rules)) } catch { /* storage quota or private mode */ }
}

// ── Composables ──

export function useHighlights(chapterId: string) {
  function loadAll(): Highlight[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      // 向后兼容：旧数据无 category 字段，默认 ''
      const parsed = JSON.parse(raw) as Highlight[]
      return parsed.map(h => h.category === undefined ? { ...h, category: '' } : h)
    } catch { return [] }
  }

  function saveAll(hl: Highlight[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hl)) } catch { /* storage quota or private mode */ }
  }

  function list(): Highlight[] {
    return loadAll().filter(h => h.chapterId === chapterId).sort((a, b) => a.start - b.start)
  }

  function add(start: number, end: number, text: string, note: string = '', category: string = '', color?: string): Highlight {
    const all = loadAll()
    const assignedColor = color || COLORS[all.filter(h => h.chapterId === chapterId).length % COLORS.length]
    const hl: Highlight = {
      id: 'hl-' + Date.now(),
      chapterId,
      start, end, text,
      color: assignedColor,
      note,
      category,
      createdAt: new Date().toISOString(),
    }
    all.push(hl)
    saveAll(all)
    return hl
  }

  function remove(id: string) {
    const all = loadAll().filter(h => h.id !== id)
    saveAll(all)
  }

  function removeAt(start: number, end: number): Highlight | null {
    const all = loadAll()
    const idx = all.findIndex(h => h.chapterId === chapterId && h.start === start && h.end === end)
    if (idx >= 0) {
      const removed = all[idx]
      all.splice(idx, 1)
      saveAll(all)
      return removed
    }
    return null
  }

  function update(id: string, patch: Partial<Pick<Highlight, 'color' | 'note' | 'category'>>) {
    const all = loadAll()
    const h = all.find(h => h.id === id)
    if (h) { Object.assign(h, patch); saveAll(all) }
  }

  function clearAll() {
    const all = loadAll().filter(h => h.chapterId !== chapterId)
    saveAll(all)
  }

  /**
   * 文本变更后重对齐高亮位置。
   *
   * 当正文被编辑（手动输入或 AI 生成）后，已存储的高亮偏移量可能不再指向正确的文字。
   * 此函数逐条检查高亮，在当前正文中按以下策略定位正确位置：
   *
   *   1. 位置精确匹配：若 newText[hl.start:hl.end] 仍等于 hl.text，保留不动
   *   2. 邻近搜索：在原始位置 ±searchWindow 范围内查找 hl.text
   *   3. 全文搜索（回退）：若邻近未找到且 hl.text 长度 ≥ 4，尝试全文搜索
   *      （采用"最近优先"策略：多匹配时选离原位置最近的那个）
   *   4. 无法定位：保留旧位置不变（渲染层会因 text mismatch 跳过该 span）
   *
   * @param newText 当前正文全文
   * @returns 成功重对齐的高亮数量
   */
  function realignHighlights(newText: string): number {
    const all = loadAll()
    let realigned = 0
    const searchWindow = 800 // 邻近搜索窗口（字符数）

    for (const hl of all) {
      if (hl.chapterId !== chapterId) continue
      if (!hl.text || hl.text.length === 0) continue

      // 1. 位置精确匹配：当前位置的文本是否仍是 hl.text
      if (hl.start >= 0 && hl.end <= newText.length && hl.start < hl.end) {
        const currentSlice = newText.slice(hl.start, hl.end)
        if (currentSlice === hl.text) continue
      }

      // 2. 邻近搜索
      const searchStart = Math.max(0, hl.start - searchWindow)
      const searchEnd = Math.min(newText.length, hl.end + searchWindow)
      const nearbyText = newText.slice(searchStart, searchEnd)

      // 收集邻近区域所有匹配位置
      const nearbyMatches: number[] = []
      let idx = nearbyText.indexOf(hl.text)
      while (idx !== -1) {
        nearbyMatches.push(searchStart + idx)
        idx = nearbyText.indexOf(hl.text, idx + 1)
      }

      let bestPos = -1
      if (nearbyMatches.length === 1) {
        bestPos = nearbyMatches[0]
      } else if (nearbyMatches.length > 1) {
        // 多匹配：选离原位置最近的
        bestPos = nearbyMatches.reduce((best, pos) =>
          Math.abs(pos - hl.start) < Math.abs(best - hl.start) ? pos : best,
        )
      }

      // 3. 全文回退（仅在 hl.text 足够长时，避免短词误匹配）
      if (bestPos < 0 && hl.text.length >= 4) {
        const globalIdx = newText.indexOf(hl.text)
        if (globalIdx >= 0) bestPos = globalIdx
      }

      // 4. 更新位置
      if (bestPos >= 0) {
        hl.start = bestPos
        hl.end = bestPos + hl.text.length
        realigned++
      }
      // 未找到：保留旧位置（渲染层会因 text mismatch 跳过该 span）
    }

    if (realigned > 0) {
      saveAll(all)
      console.log(`[useHighlights] realignHighlights: ${realigned} 条高亮已重对齐, chapterId=${chapterId}`)
    }
    return realigned
  }

  function getColors() { return COLORS }

  return { list, add, remove, removeAt, update, clearAll, getColors, realignHighlights }
}

/**
 * 按行号计算高亮在编辑器侧边栏中的百分比位置。
 *
 * 替代原始的 hl.start / textLength * 100（基于字符数的线性插值），
 * 改用硬换行数计算行位置，避免中英文混排时字符宽度差异导致的错位。
 *
 * 注意：此函数仅使用硬换行（\n）计数，不计算 textarea 内的自动折行。
 * 对于长段落自动折行的场景，返回值仍然是近似值——但比字符插值更接近真实位置。
 *
 * @param start 高亮起始字符偏移量
 * @param text  全文
 * @returns 0~100 的百分比值
 */
export function getHighlightLinePosition(start: number, text: string): number {
  if (!text || start <= 0) return 0
  const clamped = Math.min(start, text.length)
  const beforeLines = (text.slice(0, clamped).match(/\n/g) || []).length
  const totalLines = (text.match(/\n/g) || []).length + 1
  return totalLines > 1 ? (beforeLines / (totalLines - 1)) * 100 : 0
}
