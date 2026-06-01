/**
 * 伏笔账本系统 — 对标 InkOS hook-lifecycle + hook-health + hook-governance
 *
 * 追踪每条伏笔从种下到回收的完整生命周期。
 * 纯函数设计，不依赖 LLM，零成本运行。
 */

// ── 数据模型 ──

export type HookStatus = 'open' | 'progressing' | 'deferred' | 'resolved'

export type HookPayoffTiming = 'immediate' | 'near-term' | 'mid-arc' | 'slow-burn' | 'endgame'

export interface HookEntry {
  hookId: string
  name: string
  type: string               // 叙事类别: mystery / relationship / power-up / conflict / secret
  status: HookStatus
  startChapter: number       // 种下章节
  lastAdvancedChapter: number
  expectedPayoff: string
  payoffTiming?: HookPayoffTiming
  notes: string
  dependsOn?: string[]       // 上游伏笔 ID
  coreHook?: boolean         // 主线伏笔
  halfLifeChapters?: number  // 自定义半衰期
  advancedCount: number      // 已推进次数
  secret?: string            // 伏笔真相（作者可见，AI 不可见）
}

export interface HookLedger {
  open: string[]       // 新种伏笔名
  advance: string[]    // 推进的伏笔名
  resolve: string[]    // 回收的伏笔名
  defer: string[]      // 延后的伏笔名
}

export interface HookHealthIssue {
  hookId: string
  name: string
  severity: 'error' | 'warning' | 'info'
  category: 'stale' | 'overdue' | 'silent' | 'burst' | 'blocked'
  description: string
  suggestion: string
}

export interface HookLifecycle {
  phase: 'opening' | 'middle' | 'late'
  age: number                // 种下后的章节数
  dormancy: number           // 上次推进后的章节数
  stale: boolean
  overdue: boolean
  readyToResolve: boolean
  advancePressure: number    // 0-100 推进紧迫度
  resolvePressure: number    // 0-100 回收紧迫度
}

// ── 默认半衰期（按 payoffTiming）──

const DEFAULT_HALF_LIFE: Record<HookPayoffTiming, number> = {
  immediate: 5,
  'near-term': 10,
  'mid-arc': 20,
  'slow-burn': 40,
  endgame: 80,
}

// ── 生命周期描述 ──

export function describeHookLifecycle(
  hook: HookEntry,
  currentChapter: number,
  targetChapters?: number,
): HookLifecycle {
  const age = currentChapter - hook.startChapter
  const dormancy = currentChapter - hook.lastAdvancedChapter
  const totalChapters = targetChapters || 100
  const progressRatio = currentChapter / totalChapters

  // 阶段判定
  let phase: HookLifecycle['phase']
  if (progressRatio < 0.25) phase = 'opening'
  else if (progressRatio < 0.75) phase = 'middle'
  else phase = 'late'

  // 半衰期
  const halfLife = hook.halfLifeChapters
    || DEFAULT_HALF_LIFE[hook.payoffTiming || 'mid-arc']

  // 过期判定：超过 3 倍半衰期
  const overdue = age > halfLife * 3
  // 陈腐判定：休眠超过半衰期
  const stale = dormancy > halfLife && hook.status !== 'resolved' && hook.status !== 'deferred'
  // 可回收判定：接近半衰期 + 有推进记录
  const readyToResolve =
    age >= halfLife * 0.7 &&
    hook.advancedCount >= 2 &&
    hook.status !== 'resolved' &&
    hook.status !== 'deferred'

  // 紧迫度（0-100）
  const advancePressure = Math.min(100, Math.round((dormancy / halfLife) * 100))
  const resolvePressure = Math.min(100, Math.round((age / (halfLife * 2)) * 100))

  return {
    phase,
    age,
    dormancy,
    stale,
    overdue,
    readyToResolve,
    advancePressure,
    resolvePressure,
  }
}

// ── 活跃伏笔过滤 ──

export function filterActiveHooks(hooks: HookEntry[]): HookEntry[] {
  return hooks.filter(h => h.status !== 'resolved')
}

export function filterResolvedHooks(hooks: HookEntry[]): HookEntry[] {
  return hooks.filter(h => h.status === 'resolved')
}

// ── 陈腐检测 ──

export function detectStaleHooks(
  hooks: HookEntry[],
  currentChapter: number,
  targetChapters?: number,
): HookEntry[] {
  return filterActiveHooks(hooks).filter(h => {
    const life = describeHookLifecycle(h, currentChapter, targetChapters)
    return life.stale
  })
}

// ── 健康审计 ──

export function analyzeHookHealth(
  hooks: HookEntry[],
  currentChapter: number,
  targetChapters?: number,
): HookHealthIssue[] {
  const issues: HookHealthIssue[] = []
  const active = filterActiveHooks(hooks)

  // 1. 陈腐检测
  const stale = detectStaleHooks(hooks, currentChapter, targetChapters)
  for (const h of stale) {
    const life = describeHookLifecycle(h, currentChapter, targetChapters)
    issues.push({
      hookId: h.hookId,
      name: h.name,
      severity: life.overdue ? 'error' : 'warning',
      category: life.overdue ? 'overdue' : 'stale',
      description: life.overdue
        ? `伏笔「${h.name}」已过期 ${life.age} 章未回收（半衰期 ${h.halfLifeChapters || DEFAULT_HALF_LIFE[h.payoffTiming || 'mid-arc']} 章）`
        : `伏笔「${h.name}」休眠 ${life.dormancy} 章未推进`,
      suggestion: life.overdue
        ? `建议在第 ${currentChapter + 1} 章回收或标记为废弃`
        : `建议在第 ${currentChapter + 1} 章推进此伏笔`,
    })
  }

  // 2. 活跃伏笔过多
  if (active.length > 12) {
    issues.push({
      hookId: '',
      name: '',
      severity: 'warning',
      category: 'burst',
      description: `活跃伏笔 ${active.length} 条，超过 12 条上限`,
      suggestion: '建议回收低优先级伏笔或将部分标记为 deferred',
    })
  }

  // 3. 长期无推进
  const anyAdvancedRecently = active.some(
    h => currentChapter - h.lastAdvancedChapter <= 5,
  )
  if (active.length > 0 && !anyAdvancedRecently && currentChapter > 5) {
    issues.push({
      hookId: '',
      name: '',
      severity: 'info',
      category: 'silent',
      description: `最近 5 章内无任何伏笔推进`,
      suggestion: '请在第下一章中至少推进 1 条伏笔',
    })
  }

  // 4. 阻塞检测：依赖未解决
  for (const h of active) {
    if (h.dependsOn && h.dependsOn.length > 0) {
      const unresolvedDeps = h.dependsOn.filter(depId => {
        const dep = hooks.find(x => x.hookId === depId)
        return !dep || dep.status !== 'resolved'
      })
      if (unresolvedDeps.length > 0) {
        issues.push({
          hookId: h.hookId,
          name: h.name,
          severity: 'info',
          category: 'blocked',
          description: `伏笔「${h.name}」依赖的 ${unresolvedDeps.length} 条上游伏笔尚未回收`,
          suggestion: `先回收：${unresolvedDeps.map(id => hooks.find(x => x.hookId === id)?.name || id).join('、')}`,
        })
      }
    }
  }

  return issues
}

// ── 章纲备忘录解析 ──

/**
 * 从章纲备忘录中解析伏笔账本。
 * 期望格式（InkOS 风格）：
 *   open: 伏笔A, 伏笔B
 *   advance: 伏笔C
 *   resolve: 伏笔D
 *   defer: 伏笔E
 */
export function parseHookLedger(memoBody: string): HookLedger {
  const ledger: HookLedger = { open: [], advance: [], resolve: [], defer: [] }

  const openMatch = memoBody.match(/(?:open|新种|种下)[：:]\s*(.+)/i)
  if (openMatch) {
    ledger.open = openMatch[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }

  const advanceMatch = memoBody.match(/(?:advance|推进|触及)[：:]\s*(.+)/i)
  if (advanceMatch) {
    ledger.advance = advanceMatch[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }

  const resolveMatch = memoBody.match(/(?:resolve|回收|结算)[：:]\s*(.+)/i)
  if (resolveMatch) {
    ledger.resolve = resolveMatch[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }

  const deferMatch = memoBody.match(/(?:defer|延后|搁置)[：:]\s*(.+)/i)
  if (deferMatch) {
    ledger.defer = deferMatch[1].split(/[,，、]/).map(s => s.trim()).filter(Boolean)
  }

  return ledger
}

// ── 账本验证 ──

export interface HookLedgerViolation {
  hookId: string
  name: string
  rule: string
  description: string
}

/**
 * 验证伏笔账本与实际正文的一致性。
 * "unearth 1, bury 1" 硬底线：回收数 <= 新种数
 */
export function validateHookLedger(
  ledger: HookLedger,
  activeHooks: HookEntry[],
  _draftContent?: string,
): HookLedgerViolation[] {
  const violations: HookLedgerViolation[] = []

  // 硬底线：回收不能多于新种
  if (ledger.resolve.length > ledger.open.length) {
    violations.push({
      hookId: '',
      name: '',
      rule: 'unearth-1-bury-1',
      description: `回收 ${ledger.resolve.length} 条但仅新种 ${ledger.open.length} 条，违反"埋一收一"底线`,
    })
  }

  // 推进/回收的伏笔必须存在于活跃伏笔中
  const activeNames = new Set(activeHooks.map(h => h.name))
  for (const name of [...ledger.advance, ...ledger.resolve]) {
    if (!activeNames.has(name)) {
      violations.push({
        hookId: '',
        name,
        rule: 'unknown-hook',
        description: `账本引用了不存在的伏笔「${name}」`,
      })
    }
  }

  return violations
}

// ── CRUD 操作 ──

export function createHook(
  hooks: HookEntry[],
  params: {
    name: string
    type: string
    expectedPayoff: string
    payoffTiming?: HookPayoffTiming
    notes?: string
    dependsOn?: string[]
    coreHook?: boolean
    secret?: string
    chapterNumber: number
  },
): { hooks: HookEntry[]; newHook: HookEntry } {
  const id = `hook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const newHook: HookEntry = {
    hookId: id,
    name: params.name,
    type: params.type,
    status: 'open',
    startChapter: params.chapterNumber,
    lastAdvancedChapter: params.chapterNumber,
    expectedPayoff: params.expectedPayoff,
    payoffTiming: params.payoffTiming || 'mid-arc',
    notes: params.notes || '',
    dependsOn: params.dependsOn,
    coreHook: params.coreHook || false,
    advancedCount: 0,
    secret: params.secret,
  }
  return { hooks: [...hooks, newHook], newHook }
}

export function advanceHook(
  hooks: HookEntry[],
  hookId: string,
  chapterNumber: number,
): HookEntry[] {
  return hooks.map(h =>
    h.hookId === hookId
      ? {
          ...h,
          status: 'progressing' as HookStatus,
          lastAdvancedChapter: chapterNumber,
          advancedCount: h.advancedCount + 1,
        }
      : h,
  )
}

export function resolveHook(
  hooks: HookEntry[],
  hookId: string,
  chapterNumber: number,
): HookEntry[] {
  return hooks.map(h =>
    h.hookId === hookId
      ? { ...h, status: 'resolved' as HookStatus, lastAdvancedChapter: chapterNumber }
      : h,
  )
}

export function deferHook(
  hooks: HookEntry[],
  hookId: string,
): HookEntry[] {
  return hooks.map(h =>
    h.hookId === hookId ? { ...h, status: 'deferred' as HookStatus } : h,
  )
}

// ── 统计 ──

export function getHookStats(hooks: HookEntry[]) {
  const active = filterActiveHooks(hooks)
  const resolved = filterResolvedHooks(hooks)
  return {
    total: hooks.length,
    active: active.length,
    open: active.filter(h => h.status === 'open').length,
    progressing: active.filter(h => h.status === 'progressing').length,
    deferred: active.filter(h => h.status === 'deferred').length,
    resolved: resolved.length,
    coreHooks: active.filter(h => h.coreHook).length,
    totalAdvances: hooks.reduce((sum, h) => sum + h.advancedCount, 0),
  }
}

/** 生成伏笔摘要（用于注入 LLM prompt） */
export function formatHookContext(hooks: HookEntry[], maxItems = 8): string {
  const active = filterActiveHooks(hooks)
    .sort((a, b) => (b.coreHook ? 1 : 0) - (a.coreHook ? 1 : 0))
    .slice(0, maxItems)

  if (!active.length) return '（暂无活跃伏笔）'

  const lines = active.map(h => {
    const statusLabel = { open: '新种', progressing: '推进中', deferred: '延后', resolved: '已回收' }[h.status]
    const core = h.coreHook ? '【主线】' : ''
    return `- ${core}${h.name} (${statusLabel}, 第${h.startChapter}章种下, 已推进${h.advancedCount}次)`
  })

  return lines.join('\n')
}
