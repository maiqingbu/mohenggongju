<template>
  <!-- 弹窗模式：Teleport 遮罩 -->
  <Teleport v-if="!embedded" to="body">
    <div v-if="visible" class="hp-overlay" @click.self="visible = false">
      <div class="hp-root" :class="isDark ? 'hp-dark' : 'hp-light'">
        <div class="hp-header">
          <span class="hp-title">高亮管理</span>
          <span class="hp-count">{{ list.length }} 条</span>
          <button class="hp-close" @click="visible = false">✕</button>
        </div>
        <div class="hp-body">
          <aside class="hp-sidebar" :style="{ width: sidebarWidth + 'px' }">
            <div v-for="cat in categoryDefs" :key="cat.key" class="hp-cat-item"
              :class="{ active: activeCat === cat.key }" @click="activeCat = cat.key">
              <span class="hp-cat-icon">{{ cat.icon }}</span>
              <span class="hp-cat-label">{{ cat.label }}</span>
              <span class="hp-cat-count">{{ catCount(cat.key) }}</span>
            </div>
            <div class="hp-cat-divider"></div>
            <div class="hp-cat-item" :class="{ active: activeCat === 'regex' }" @click="activeCat = 'regex'">
              <span class="hp-cat-icon">🧩</span>
              <span class="hp-cat-label">正则规则</span>
              <span class="hp-cat-count">{{ regexRules.length }}</span>
            </div>
            <div class="hp-cat-item" :class="{ active: activeCat === 'syntax' }" @click="activeCat = 'syntax'">
              <span class="hp-cat-icon">🎨</span>
              <span class="hp-cat-label">语法规则</span>
              <span class="hp-cat-count">{{ enabledSyntaxCount }}</span>
            </div>
            <button class="hp-add-regex-btn" @click="addRegexRule">+ 添加</button>
          </aside>
          <div class="hp-resizer" @mousedown="startResize"></div>
          <section class="hp-content">
            <!-- 正则规则面板 -->
            <template v-if="activeCat === 'regex'">
              <div v-if="!regexRules.length" class="hp-empty">
                <p>暂无正则规则</p>
                <p class="hp-hint">点击左侧「+ 添加」创建正则匹配规则</p>
              </div>
              <div v-for="(rule, i) in regexRules" :key="rule.id" class="hp-regex-item">
                <div class="hp-regex-row">
                  <input class="hp-regex-input" :value="rule.pattern" placeholder="正则表达式，如：他{0,2}想"
                    @change="updateRegexRule(i, 'pattern', ($event.target as HTMLInputElement).value)" />
                  <select class="hp-regex-cat" :value="rule.category"
                    @change="updateRegexRule(i, 'category', ($event.target as HTMLSelectElement).value)">
                    <option value="character">角色</option>
                    <option value="setting">设定</option>
                    <option value="item">物品</option>
                    <option value="dialogue">对话</option>
                    <option value="number">数字</option>
                  </select>
                  <span class="hp-colors-row sm">
                    <span v-for="c in colors" :key="c" class="hp-color-swatch sm"
                      :class="{ active: rule.color === c }"
                      :style="{ background: c }"
                      @click="updateRegexRule(i, 'color', c)"
                    ></span>
                  </span>
                  <button class="hp-toggle-btn" :class="{ on: rule.enabled }" @click="toggleRule(rule.id)">
                    {{ rule.enabled ? 'ON' : 'OFF' }}
                  </button>
                  <button class="hp-btn danger" @click="removeRegexRule(i)">✕</button>
                </div>
                <div v-if="rule.enabled && chapterText" class="hp-regex-match-info">
                  匹配 {{ computeRegexMatchCount(rule) }} 处
                </div>
              </div>
            </template>
            <!-- 语法规则面板 -->
            <template v-else-if="activeCat === 'syntax'">
              <div class="hp-syntax-desc">内置语法高亮规则，启用后自动着色到编辑器覆盖层</div>
              <div v-for="rule in syntaxRules" :key="rule.key" class="hp-syntax-item">
                <span class="hp-syntax-label">{{ rule.label }}</span>
                <span class="hp-colors-row">
                  <span v-for="c in syntaxColors" :key="c" class="hp-color-swatch"
                    :class="{ active: rule.color === c }"
                    :style="{ background: c }"
                    @click="updateSyntaxColor(rule.key, c)"
                  ></span>
                </span>
                <button class="hp-toggle-btn" :class="{ on: rule.enabled }" @click="toggleSyntax(rule.key)">
                  {{ rule.enabled ? 'ON' : 'OFF' }}
                </button>
              </div>
            </template>
            <!-- 分类高亮列表 -->
            <template v-else>
              <div v-if="!filteredHighlights.length && !regexMatches.length" class="hp-empty">
                <p>该分类暂无高亮</p>
              </div>
              <div v-for="hl in filteredHighlights" :key="hl.id" class="hp-item">
                <span class="hp-dot" :style="{ background: hl.color }"></span>
                <div class="hp-info">
                  <span class="hp-text">{{ hl.text.slice(0, 60) }}</span>
                  <span class="hp-pos">位置 {{ hl.start }}-{{ hl.end }}{{ hl.note ? ' · ' + hl.note : '' }}</span>
                </div>
                <div class="hp-actions">
                  <select class="hp-cat-sel" :value="hl.category || ''"
                    @change="changeCategory(hl.id, ($event.target as HTMLSelectElement).value)">
                    <option value="">未分类</option>
                    <option value="character">角色</option>
                    <option value="setting">设定</option>
                    <option value="item">物品</option>
                    <option value="dialogue">对话</option>
                    <option value="number">数字</option>
                  </select>
                  <span class="hp-colors-row">
                    <span v-for="c in colors" :key="c" class="hp-color-swatch"
                      :class="{ active: hl.color === c }"
                      :style="{ background: c }"
                      @click="changeColor(hl.id, c)"
                    ></span>
                  </span>
                  <button class="hp-btn" @click="goToHighlight(hl)">📍</button>
                  <button class="hp-btn danger" @click="removeHighlight(hl.id)">✕</button>
                </div>
              </div>
              <div v-if="regexMatches.length" class="hp-regex-section">
                <div class="hp-regex-section-label">正则匹配 ({{ regexMatches.length }})</div>
                <div v-for="(rm, i) in regexMatches" :key="'rm'+i" class="hp-item hp-regex-match">
                  <span class="hp-dot" :style="{ background: rm.color }"></span>
                  <div class="hp-info">
                    <span class="hp-text">{{ rm.text.slice(0, 60) }}</span>
                    <span class="hp-pos">匹配位置 {{ rm.start }}-{{ rm.end }} · {{ rm.rulePattern }}</span>
                  </div>
                </div>
              </div>
            </template>
          </section>
        </div>
        <div class="hp-footer" v-if="list.length">
          <button class="hp-btn danger" @click="clearAll">清除全部</button>
          <button class="hp-btn" @click="exportHighlights">导出JSON</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 嵌入模式：直接内联渲染 -->
  <div v-else class="hp-embedded-root" :class="isDark ? 'hp-dark' : 'hp-light'">
    <div class="hp-embedded-header">
      <span class="hp-title">高亮管理</span>
      <span class="hp-count">{{ list.length }} 条</span>
      <button class="hp-close" style="margin-left:auto" @click="$emit('close')">✕</button>
    </div>
    <div class="hp-body">
      <aside class="hp-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div v-for="cat in categoryDefs" :key="cat.key" class="hp-cat-item"
          :class="{ active: activeCat === cat.key }" @click="activeCat = cat.key">
          <span class="hp-cat-icon">{{ cat.icon }}</span>
          <span class="hp-cat-label">{{ cat.label }}</span>
          <span class="hp-cat-count">{{ catCount(cat.key) }}</span>
        </div>
        <div class="hp-cat-divider"></div>
        <div class="hp-cat-item" :class="{ active: activeCat === 'regex' }" @click="activeCat = 'regex'">
          <span class="hp-cat-icon">🧩</span>
          <span class="hp-cat-label">正则规则</span>
          <span class="hp-cat-count">{{ regexRules.length }}</span>
        </div>
        <div class="hp-cat-item" :class="{ active: activeCat === 'syntax' }" @click="activeCat = 'syntax'">
          <span class="hp-cat-icon">🎨</span>
          <span class="hp-cat-label">语法规则</span>
          <span class="hp-cat-count">{{ enabledSyntaxCount }}</span>
        </div>
        <button class="hp-add-regex-btn" @click="addRegexRule">+ 添加</button>
      </aside>
      <div class="hp-resizer" @mousedown="startResize"></div>
      <section class="hp-content">
        <template v-if="activeCat === 'regex'">
          <div v-if="!regexRules.length" class="hp-empty">
            <p>暂无正则规则</p>
            <p class="hp-hint">点击左侧「+ 添加」创建正则匹配规则</p>
          </div>
          <div v-for="(rule, i) in regexRules" :key="rule.id" class="hp-regex-item">
            <div class="hp-regex-row">
              <input class="hp-regex-input" :value="rule.pattern" placeholder="正则表达式，如：他{0,2}想"
                @change="updateRegexRule(i, 'pattern', ($event.target as HTMLInputElement).value)" />
              <select class="hp-regex-cat" :value="rule.category"
                @change="updateRegexRule(i, 'category', ($event.target as HTMLSelectElement).value)">
                <option value="character">角色</option>
                <option value="setting">设定</option>
                <option value="item">物品</option>
                <option value="dialogue">对话</option>
                <option value="number">数字</option>
              </select>
              <span class="hp-colors-row sm">
                <span v-for="c in colors" :key="c" class="hp-color-swatch sm"
                  :class="{ active: rule.color === c }"
                  :style="{ background: c }"
                  @click="updateRegexRule(i, 'color', c)"
                ></span>
              </span>
              <button class="hp-toggle-btn" :class="{ on: rule.enabled }" @click="toggleRule(rule.id)">
                {{ rule.enabled ? 'ON' : 'OFF' }}
              </button>
              <button class="hp-btn danger" @click="removeRegexRule(i)">✕</button>
            </div>
            <div v-if="rule.enabled && chapterText" class="hp-regex-match-info">
              匹配 {{ computeRegexMatchCount(rule) }} 处
            </div>
          </div>
        </template>
        <template v-else-if="activeCat === 'syntax'">
          <div class="hp-syntax-desc">内置语法高亮规则，启用后自动着色到编辑器覆盖层</div>
          <div v-for="rule in syntaxRules" :key="rule.key" class="hp-syntax-item">
            <span class="hp-syntax-label">{{ rule.label }}</span>
            <span class="hp-colors-row">
              <span v-for="c in syntaxColors" :key="c" class="hp-color-swatch"
                :class="{ active: rule.color === c }"
                :style="{ background: c }"
                @click="updateSyntaxColor(rule.key, c)"
              ></span>
            </span>
            <button class="hp-toggle-btn" :class="{ on: rule.enabled }" @click="toggleSyntax(rule.key)">
              {{ rule.enabled ? 'ON' : 'OFF' }}
            </button>
          </div>
        </template>
        <template v-else>
          <div v-if="!filteredHighlights.length && !regexMatches.length" class="hp-empty">
            <p>该分类暂无高亮</p>
          </div>
          <div v-for="hl in filteredHighlights" :key="hl.id" class="hp-item">
            <span class="hp-dot" :style="{ background: hl.color }"></span>
            <div class="hp-info">
              <span class="hp-text">{{ hl.text.slice(0, 60) }}</span>
              <span class="hp-pos">位置 {{ hl.start }}-{{ hl.end }}{{ hl.note ? ' · ' + hl.note : '' }}</span>
            </div>
            <div class="hp-actions">
              <select class="hp-cat-sel" :value="hl.category || ''"
                @change="changeCategory(hl.id, ($event.target as HTMLSelectElement).value)">
                <option value="">未分类</option>
                <option value="character">角色</option>
                <option value="setting">设定</option>
                <option value="item">物品</option>
                <option value="dialogue">对话</option>
                <option value="number">数字</option>
              </select>
              <span class="hp-colors-row">
                <span v-for="c in colors" :key="c" class="hp-color-swatch"
                  :class="{ active: hl.color === c }"
                  :style="{ background: c }"
                  @click="changeColor(hl.id, c)"
                ></span>
              </span>
              <button class="hp-btn" @click="goToHighlight(hl)">📍</button>
              <button class="hp-btn danger" @click="removeHighlight(hl.id)">✕</button>
            </div>
          </div>
          <div v-if="regexMatches.length" class="hp-regex-section">
            <div class="hp-regex-section-label">正则匹配 ({{ regexMatches.length }})</div>
            <div v-for="(rm, i) in regexMatches" :key="'rm'+i" class="hp-item hp-regex-match">
              <span class="hp-dot" :style="{ background: rm.color }"></span>
              <div class="hp-info">
                <span class="hp-text">{{ rm.text.slice(0, 60) }}</span>
                <span class="hp-pos">匹配位置 {{ rm.start }}-{{ rm.end }} · {{ rm.rulePattern }}</span>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
    <div class="hp-footer" v-if="list.length">
      <button class="hp-btn danger" @click="clearAll">清除全部</button>
      <button class="hp-btn" @click="exportHighlights">导出JSON</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { Highlight, HighlightRegexRule } from '../composables/useHighlights'
import { loadHighlightRegexRules, saveHighlightRegexRules } from '../composables/useHighlights'
import { showConfirm } from '../composables/useConfirm'

const msg = useMessage()

const props = defineProps<{
  isDark?: boolean
  embedded?: boolean
  highlights?: Highlight[]
  chapterBody?: string
}>()

const emit = defineEmits<{
  (e: 'go-to', hl: Highlight): void
  (e: 'remove', id: string): void
  (e: 'change-color', id: string, color: string): void
  (e: 'clear-all'): void
  (e: 'update-category', id: string, category: string): void
  (e: 'regex-rules-changed', rules: HighlightRegexRule[]): void
  (e: 'syntax-rules-changed'): void
  (e: 'close'): void
}>()

// ── 分类定义 ──
const categoryDefs = [
  { key: 'all',       label: '全部', icon: '📋' },
  { key: 'character', label: '角色', icon: '👤' },
  { key: 'setting',   label: '设定', icon: '🌍' },
  { key: 'item',      label: '物品', icon: '📦' },
  { key: 'dialogue',  label: '对话', icon: '💬' },
  { key: 'number',    label: '数字', icon: '🔢' },
]

// ── 颜色 ──
const colors = ['#ffeb3b', '#ff9800', '#4caf50', '#2196f3', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722']
const syntaxColors = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#e11d48', '#84cc16']

// ── 状态 ──
const visible = ref(false)
const _modalList = ref<Highlight[]>([])
const _modalText = ref('')
const sidebarWidth = ref(160)
const activeCat = ref('all')

const list = computed(() => props.embedded ? (props.highlights || []) : _modalList.value)
const chapterText = computed(() => props.embedded ? (props.chapterBody || '') : _modalText.value)

// ── 正则规则 ──
const regexRules = ref<HighlightRegexRule[]>(loadHighlightRegexRules())

watch(regexRules, (val) => {
  saveHighlightRegexRules(val)
  emit('regex-rules-changed', val)
}, { deep: true })

	// ── 语法规则（内置 5 条：角色/物品/设定/对话/数字）──
	interface SyntaxRuleItem { key: string; label: string; enabled: boolean; color: string }
	const BUILT_IN_SYNTAX: SyntaxRuleItem[] = [
	  { key: 'character', label: '角色', enabled: true,  color: '#3b82f6' },
	  { key: 'item',      label: '物品', enabled: true,  color: '#f59e0b' },
	  { key: 'setting',   label: '设定', enabled: true,  color: '#8b5cf6' },
	  { key: 'dialogue',  label: '对话', enabled: true,  color: '#10b981' },
	  { key: 'number',    label: '数字', enabled: true,  color: '#ec4899' },
	]

function loadSyntaxRules(): SyntaxRuleItem[] {
  try {
    const raw = localStorage.getItem('ns:syntaxRules')
    if (!raw) return BUILT_IN_SYNTAX.map(r => ({ ...r }))
    const saved = JSON.parse(raw) as Record<string, { enabled?: boolean; color?: string }>
    return BUILT_IN_SYNTAX.map(r => ({
      ...r,
      enabled: saved[r.key]?.enabled ?? r.enabled,
      color: saved[r.key]?.color ?? r.color,
    }))
  } catch { return BUILT_IN_SYNTAX.map(r => ({ ...r })) }
}

function saveSyntaxRules(rules: SyntaxRuleItem[]) {
  const data: Record<string, { enabled: boolean; color: string }> = {}
  for (const r of rules) data[r.key] = { enabled: r.enabled, color: r.color }
  localStorage.setItem('ns:syntaxRules', JSON.stringify(data))
}

const syntaxRules = ref<SyntaxRuleItem[]>(loadSyntaxRules())
const enabledSyntaxCount = computed(() => syntaxRules.value.filter(r => r.enabled).length)

function toggleSyntax(key: string) {
  const r = syntaxRules.value.find(s => s.key === key)
  if (r) { r.enabled = !r.enabled; saveSyntaxRules(syntaxRules.value); emit('syntax-rules-changed') }
}
function updateSyntaxColor(key: string, color: string) {
  const r = syntaxRules.value.find(s => s.key === key)
  if (r) { r.color = color; saveSyntaxRules(syntaxRules.value); emit('syntax-rules-changed') }
}

// ── 分类计数 ──
function catCount(catKey: string): number {
  if (catKey === 'all') return list.value.length
  return list.value.filter(h => (h.category || '') === catKey).length
}

// ── 筛选 ──
const filteredHighlights = computed(() => {
  if (activeCat.value === 'all') return [...list.value].sort((a, b) => a.start - b.start)
  return list.value.filter(h => (h.category || '') === activeCat.value).sort((a, b) => a.start - b.start)
})

// ── 正则匹配 ──
interface RegexMatchItem {
  start: number; end: number; text: string; color: string; rulePattern: string
}

const regexMatches = computed<RegexMatchItem[]>(() => {
  if (!chapterText.value || activeCat.value === 'all' || activeCat.value === 'regex' || activeCat.value === 'syntax') return []
  const results: RegexMatchItem[] = []
  for (const rule of regexRules.value) {
    if (!rule.enabled) continue
    if (rule.category !== activeCat.value) continue
    try {
      const re = new RegExp(rule.pattern, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(chapterText.value)) !== null) {
        results.push({ start: m.index, end: m.index + m[0].length, text: m[0], color: rule.color, rulePattern: rule.pattern })
      }
    } catch { /* skip */ }
  }
  return results.sort((a, b) => a.start - b.start)
})

function computeRegexMatchCount(rule: HighlightRegexRule): number {
  if (!chapterText.value) return 0
  try {
    const re = new RegExp(rule.pattern, 'g')
    return (chapterText.value.match(re) || []).length
  } catch { return 0 }
}

// ── 正则规则管理 ──
function addRegexRule() {
  regexRules.value.push({
    id: 'rx-' + Date.now(),
    pattern: '',
    color: colors[regexRules.value.length % colors.length],
    category: 'character',
    enabled: true,
  })
}
function removeRegexRule(idx: number) { regexRules.value.splice(idx, 1) }
function updateRegexRule(idx: number, field: string, value: string) {
  (regexRules.value[idx] as any)[field] = value
  regexRules.value = [...regexRules.value]
}
function toggleRule(id: string) {
  const rule = regexRules.value.find(r => r.id === id)
  if (rule) { rule.enabled = !rule.enabled; regexRules.value = [...regexRules.value] }
}

// ── 分割线拖拽 ──
function startResize(e: MouseEvent) {
  const startX = e.clientX; const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent) => { sidebarWidth.value = Math.max(120, Math.min(280, startW + ev.clientX - startX)) }
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// ── 操作函数 ──
function changeColor(id: string, color: string) {
  emit('change-color', id, color)
  const h = list.value.find(h => h.id === id)
  if (h) h.color = color
}
function changeCategory(id: string, category: string) {
  emit('update-category', id, category)
  const h = list.value.find(h => h.id === id)
  if (h) h.category = category
}
function removeHighlight(id: string) {
  emit('remove', id)
  if (!props.embedded) _modalList.value = _modalList.value.filter(h => h.id !== id)
}
function goToHighlight(hl: Highlight) { emit('go-to', hl); visible.value = false }
function clearAll() {
  showConfirm('确认清除当前章节所有高亮？', () => { emit('clear-all'); if (!props.embedded) _modalList.value = [] })
}
function exportHighlights() {
  const data = JSON.stringify(list.value, null, 2)
  navigator.clipboard.writeText(data).then(() => msg.success('高亮数据已复制到剪贴板')).catch(() => {})
}

function open(highlights: Highlight[], chapterBody?: string) {
  _modalList.value = highlights
  _modalText.value = chapterBody || ''
  visible.value = true
}
function close() { visible.value = false }

defineExpose({ open, close, regexRules })
</script>

<style scoped>
/* ═══ 弹窗模式 ═══ */
.hp-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
.hp-root { width: 700px; max-height: 75vh; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }

/* ═══ 嵌入模式 ═══ */
.hp-embedded-root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.hp-embedded-header { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }

/* ═══ 主题 ═══ */
.hp-dark { background: #1c1c22; color: #d4d4d4; border: 1px solid rgba(255,255,255,0.08); }
.hp-light { background: #fff; color: #1a1a1a; border: 1px solid rgba(0,0,0,0.08); }
.hp-embedded-root.hp-dark { background: transparent; border: none; border-left: 1px solid rgba(255,255,255,0.06); }
.hp-embedded-root.hp-light { background: transparent; border: none; border-left: 1px solid rgba(0,0,0,0.06); }

/* ═══ Header ═══ */
.hp-header { display: flex; align-items: center; gap: 8px; padding: 14px 18px; border-bottom: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }
.hp-title { font-size: 13px; font-weight: 600; flex: 1; display: flex; align-items: center; gap: 6px; }
.hp-count { font-size: 11px; opacity: 0.4; }
.hp-close { width: 26px; height: 26px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 14px; opacity: 0.4; }
.hp-close:hover { opacity: 1; }

/* ═══ Body ═══ */
.hp-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* ═══ Sidebar ═══ */
.hp-sidebar {
  flex-shrink: 0; border-right: 1px solid rgba(128,128,128,0.08);
  display: flex; flex-direction: column; padding: 6px 4px; gap: 1px;
  overflow-y: auto; user-select: none;
}
.hp-cat-item {
  display: flex; align-items: center; gap: 6px; padding: 5px 6px;
  border-radius: 5px; cursor: pointer; font-size: 11px; transition: background 0.1s;
}
.hp-cat-item:hover { background: rgba(128,128,128,0.06); }
.hp-cat-item.active { background: rgba(40,140,100,0.15); color: #52c8a0; font-weight: 600; }
.hp-cat-icon { font-size: 13px; flex-shrink: 0; }
.hp-cat-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-cat-count { font-size: 9px; opacity: 0.4; flex-shrink: 0; min-width: 14px; text-align: right; }
.hp-cat-divider { height: 1px; background: rgba(128,128,128,0.08); margin: 3px 0; }
.hp-add-regex-btn {
  margin-top: 3px; padding: 3px 6px; border: 1px dashed rgba(128,128,128,0.2);
  border-radius: 4px; background: transparent; color: inherit; cursor: pointer;
  font-size: 10px; font-family: inherit; opacity: 0.5;
}
.hp-add-regex-btn:hover { opacity: 1; border-color: rgba(128,128,128,0.4); }

/* ═══ Resizer ═══ */
.hp-resizer { width: 4px; cursor: col-resize; flex-shrink: 0; background: transparent; transition: background 0.2s; }
.hp-resizer:hover { background: rgba(128,128,128,0.2); }

/* ═══ Content ═══ */
.hp-content { flex: 1; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }

/* ═══ Color swatches ═══ */
.hp-colors-row { display: flex; gap: 2px; flex-wrap: wrap; }
.hp-colors-row.sm { gap: 1px; }
.hp-color-swatch {
  width: 14px; height: 14px; border-radius: 3px; cursor: pointer;
  border: 2px solid transparent; flex-shrink: 0;
  transition: border-color 0.15s, transform 0.1s;
}
.hp-color-swatch.sm { width: 11px; height: 11px; }
.hp-color-swatch:hover { transform: scale(1.2); }
.hp-color-swatch.active { border-color: currentColor; box-shadow: 0 0 0 1px rgba(255,255,255,0.3); }

/* ═══ Items ═══ */
.hp-empty { text-align: center; padding: 30px 0; opacity: 0.4; font-size: 12px; }
.hp-hint { font-size: 10px; opacity: 0.5; margin-top: 3px; }
.hp-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  border-radius: 6px; border: 1px solid rgba(128,128,128,0.05);
}
.hp-item:hover { background: rgba(128,128,128,0.03); }
.hp-regex-match { opacity: 0.75; border-left: 2px solid rgba(128,128,128,0.15); }
.hp-regex-section { margin-top: 5px; }
.hp-regex-section-label { font-size: 9px; opacity: 0.4; padding: 3px 0 2px; font-weight: 600; }
.hp-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.hp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }
.hp-text { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-pos { font-size: 8px; opacity: 0.3; }
.hp-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.hp-cat-sel {
  font-size: 8px; padding: 1px 3px; border-radius: 3px;
  background: rgba(128,128,128,0.06); border: 1px solid rgba(128,128,128,0.12);
  color: inherit; font-family: inherit; cursor: pointer; max-width: 48px;
}
.hp-btn {
  width: 20px; height: 20px; border: none; border-radius: 3px;
  background: transparent; color: inherit; cursor: pointer; font-size: 10px;
  opacity: 0.5; display: flex; align-items: center; justify-content: center;
}
.hp-btn:hover { opacity: 1; background: rgba(128,128,128,0.1); }
.hp-btn.danger { color: #e06060; }
.hp-btn.danger:hover { background: rgba(224,96,96,0.1); }

/* ═══ Regex rules ═══ */
.hp-regex-item { padding: 5px 0; border-bottom: 1px solid rgba(128,128,128,0.05); }
.hp-regex-row { display: flex; align-items: center; gap: 3px; }
.hp-regex-input {
  flex: 1; padding: 3px 6px; font-size: 10px; font-family: monospace;
  background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.1);
  border-radius: 3px; color: inherit; outline: none; min-width: 0;
}
.hp-regex-input:focus { border-color: rgba(46,168,106,0.4); }
.hp-regex-cat {
  font-size: 9px; padding: 2px 3px; border-radius: 3px;
  background: rgba(128,128,128,0.06); border: 1px solid rgba(128,128,128,0.12);
  color: inherit; font-family: inherit; cursor: pointer;
}
.hp-toggle-btn {
  padding: 1px 6px; font-size: 8px; font-weight: 600;
  border: 1px solid rgba(128,128,128,0.2); border-radius: 3px;
  background: transparent; color: inherit; cursor: pointer; font-family: inherit;
}
.hp-toggle-btn.on { background: rgba(46,168,106,0.12); color: #2ea86a; border-color: rgba(46,168,106,0.3); }
.hp-regex-match-info { font-size: 8px; opacity: 0.3; padding: 1px 0 0 3px; }

/* ═══ Syntax rules ═══ */
.hp-syntax-desc { font-size: 9px; opacity: 0.4; padding: 2px 0 6px; }
.hp-syntax-item {
  display: flex; align-items: center; gap: 6px; padding: 5px 6px;
  border-radius: 6px; border: 1px solid rgba(128,128,128,0.05);
}
.hp-syntax-item:hover { background: rgba(128,128,128,0.03); }
.hp-syntax-label { font-size: 11px; flex: 1; }

/* ═══ Footer ═══ */
.hp-footer { display: flex; gap: 6px; padding: 6px 10px; border-top: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }
.hp-footer .hp-btn { width: auto; padding: 3px 8px; font-size: 10px; }
</style>
