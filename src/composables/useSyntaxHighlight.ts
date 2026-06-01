/**
 * 语法高亮规则管理 — 持久化 + 计算
 *
 * 内置规则 5 条，覆盖小说创作核心维度：
 *   1. 角色 — 自动匹配设定中的角色名
 *   2. 物品 — 自动匹配设定中的物品名
 *   3. 设定 — 自动匹配世界设定中的专有名词
 *   4. 对话 — 匹配引号/书名号包裹的对话
 *   5. 数字 — 匹配中文数字+量词
 *
 * 前 3 条的 pattern 由外部注入（从 SettingsManager 实体列表动态生成），
 * 对话/数字为静态正则。
 */

export interface SyntaxRule {
  key: string
  label: string
  desc: string
  type: 'regex' | 'keyword'
  pattern: string
  enabled: boolean
  color: string
}

export interface HighlightSpan {
  start: number
  end: number
  color: string
  rule: string
}

export const HIGHLIGHT_COLORS = [
  '#f97316', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6',
  '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#e11d48',
]

const LS_RULES_KEY = 'ns:syntaxRules'
const LS_CUSTOM_REGEX_KEY = 'ns:customRegexRules'
const LS_MANUAL_COLOR_KEY = 'ns:manualHighlightColor'
const DEFAULT_MANUAL_COLOR = '#ffeb3b'

/** 手动高亮默认色（用户可自定义，持久化到 localStorage） */
export function getManualHighlightColor(): string {
  try {
    const raw = localStorage.getItem(LS_MANUAL_COLOR_KEY)
    return raw || DEFAULT_MANUAL_COLOR
  } catch { return DEFAULT_MANUAL_COLOR }
}

export function setManualHighlightColor(color: string) {
  try { localStorage.setItem(LS_MANUAL_COLOR_KEY, color) } catch {}
}

// ── 内置规则（角色/物品/设定 的 pattern 为占位符，由 injectEntityPatterns 注入）──

const BUILT_IN_RULES: SyntaxRule[] = [
  { key: 'character', label: '角色', desc: '匹配设定中的角色名',         type: 'regex', pattern: '', enabled: true,  color: '#3b82f6' },
  { key: 'item',      label: '物品', desc: '匹配设定中的物品名',         type: 'regex', pattern: '', enabled: true,  color: '#f59e0b' },
  { key: 'setting',   label: '设定', desc: '匹配世界设定中的专有名词',    type: 'regex', pattern: '', enabled: true,  color: '#8b5cf6' },
  { key: 'dialogue',  label: '对话', desc: '引号/括号包裹的对话片段',     type: 'regex', pattern: '[\\u201c][^\\u201c]{2,200}[\\u201d]|[\\u2018][^\\u2018]{2,200}[\\u2019]|[\\u300c][^\\u300c]{2,200}[\\u300d]|[\\u300e][^\\u300e]{2,200}[\\u300f]', enabled: true,  color: '#10b981' },
  { key: 'number',    label: '数字', desc: '中/阿数字+量词（如三百年、300年、五万两）', type: 'regex', pattern: '[\\d零一二三四五六七八九十百千万亿两]+[岁月天日时年代纪元章节回篇部首条款项个只件把张条根颗粒片块座间栋艘辆匹头峰尾口位名次遍趟回番顿里丈尺寸分厘毫石斗升合斤两钱文贯锭枚]|[\\d零一二三四五六七八九十百千万亿两]{2,}', enabled: true,  color: '#ec4899' },
]

// ── 动态 pattern 注入 ──

/** 从实体名列表构建正则 alternation（长名优先，转义特殊字符，过滤过短/过常见的词） */
export function buildEntityPattern(names: string[]): string {
  if (!names.length) return ''
  const MIN_NAME_LEN = 2
  const REJECT_SET = new Set([
    '的', '是', '在', '了', '我', '你', '他', '她', '它', '们', '这', '那',
    '有', '不', '和', '就', '也', '都', '要', '会', '能', '一', '个', '人',
    '大', '来', '上', '中', '下', '说', '看', '去', '出', '到', '着', '得',
    '过', '没', '把', '被', '对', '从', '很', '之', '与', '而', '但', '或',
    '所', '为', '以', '及',
  ])
  const unique = [...new Set(names)]
    .filter(n => n && n.length >= MIN_NAME_LEN && !REJECT_SET.has(n))
  if (!unique.length) return ''
  const escaped = unique
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return escaped.join('|')
}

/** 要注入的实体名集合 */
export interface EntityNames {
  characters: string[]
  items: string[]
  settings: string[]
}

/** 将实体名注入到规则的 pattern 字段，返回新数组（不修改原数组） */
export function injectEntityPatterns(rules: SyntaxRule[], entities: EntityNames): SyntaxRule[] {
  return rules.map(r => {
    if (r.key === 'character' && entities.characters.length) {
      const p = buildEntityPattern(entities.characters)
      if (p) return { ...r, pattern: p }
    }
    if (r.key === 'item' && entities.items.length) {
      const p = buildEntityPattern(entities.items)
      if (p) return { ...r, pattern: p }
    }
    if (r.key === 'setting' && entities.settings.length) {
      const p = buildEntityPattern(entities.settings)
      if (p) return { ...r, pattern: p }
    }
    return r
  })
}

// ── 持久化 ──

export function loadRules(): SyntaxRule[] {
  try {
    const raw = localStorage.getItem(LS_RULES_KEY)
    if (!raw) return BUILT_IN_RULES.map(r => ({ ...r }))
    const saved = JSON.parse(raw) as Record<string, { enabled: boolean; color: string; pattern?: string }>
    return BUILT_IN_RULES.map(r => ({
      ...r,
      enabled: saved[r.key]?.enabled ?? r.enabled,
      color: saved[r.key]?.color ?? r.color,
      pattern: saved[r.key]?.pattern ?? r.pattern,
    }))
  } catch { return BUILT_IN_RULES.map(r => ({ ...r })) }
}

function saveRules(rules: SyntaxRule[]) {
  const data: Record<string, { enabled: boolean; color: string; pattern?: string }> = {}
  for (const r of rules) {
    data[r.key] = { enabled: r.enabled, color: r.color }
    if (r.key === 'custom_regex') data[r.key].pattern = r.pattern
  }
  try { localStorage.setItem(LS_RULES_KEY, JSON.stringify(data)) } catch {}
}

export interface CustomRegexRule {
  id: string
  pattern: string
  color: string
}

function loadCustomRegexRules(): CustomRegexRule[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_REGEX_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveCustomRegexRules(rules: CustomRegexRule[]) {
  try { localStorage.setItem(LS_CUSTOM_REGEX_KEY, JSON.stringify(rules)) } catch {}
}

// ── 计算高亮 ──

export function computeHighlights(text: string, rules: SyntaxRule[], customRules: CustomRegexRule[]): HighlightSpan[] {
  if (!text) return []
  const spans: HighlightSpan[] = []
  const MAX_SPANS = 200

  // 内置规则
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern || spans.length >= MAX_SPANS) continue
    try {
      const re = new RegExp(rule.pattern, 'gu')
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null && spans.length < MAX_SPANS) {
        const len = m[0].length
        if (len > 0 && len < 200) {
          spans.push({ start: m.index, end: m.index + len, color: rule.color, rule: rule.key })
        }
      }
    } catch { /* 非法正则跳过 */ }
  }

  // 自定义正则
  for (const cr of customRules) {
    if (!cr.pattern || spans.length >= MAX_SPANS) continue
    try {
      const re = new RegExp(cr.pattern, 'gu')
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null && spans.length < MAX_SPANS) {
        const len = m[0].length
        if (len > 0 && len < 200) {
          spans.push({ start: m.index, end: m.index + len, color: cr.color, rule: 'custom' })
        }
      }
    } catch {}
  }

  // 按起始位置排序
  spans.sort((a, b) => a.start - b.start || a.end - b.end)
  return spans
}

/** 用于 UI 层：载入/保存/自定义正则 */
export function useSyntaxHighlight() {
  return {
    load: loadRules,
    save: saveRules,
    loadCustomRegexRules,
    saveCustomRegexRules,
    addCustomRegexRule(id: string, pattern: string, color: string) {
      const rules = loadCustomRegexRules()
      rules.push({ id, pattern, color })
      saveCustomRegexRules(rules)
    },
    removeCustomRegexRule(id: string) {
      const rules = loadCustomRegexRules().filter(r => r.id !== id)
      saveCustomRegexRules(rules)
    },
  }
}
