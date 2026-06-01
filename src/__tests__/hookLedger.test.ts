/**
 * useHookLedger 伏笔账本系统 — 深度测试
 */
import { describe, it, expect } from 'vitest'
import {
  describeHookLifecycle,
  filterActiveHooks,
  filterResolvedHooks,
  detectStaleHooks,
  analyzeHookHealth,
  parseHookLedger,
  validateHookLedger,
  createHook,
  advanceHook,
  resolveHook,
  deferHook,
  getHookStats,
  formatHookContext,
  type HookEntry,
} from '../composables/useHookLedger'

// ── 测试数据 ──

function makeSampleHooks(): HookEntry[] {
  return [
    {
      hookId: 'h1', name: '神秘来信', type: 'mystery', status: 'progressing',
      startChapter: 1, lastAdvancedChapter: 3, expectedPayoff: '揭晓寄信人',
      payoffTiming: 'near-term', notes: '', advancedCount: 2, coreHook: true,
    },
    {
      hookId: 'h2', name: '主角身世', type: 'secret', status: 'open',
      startChapter: 1, lastAdvancedChapter: 1, expectedPayoff: '揭晓真实身份',
      payoffTiming: 'slow-burn', notes: '', advancedCount: 0, coreHook: true,
    },
    {
      hookId: 'h3', name: '青梅竹马', type: 'relationship', status: 'resolved',
      startChapter: 2, lastAdvancedChapter: 5, expectedPayoff: '两人在一起',
      payoffTiming: 'mid-arc', notes: '', advancedCount: 3,
    },
    {
      hookId: 'h4', name: '反派动机', type: 'mystery', status: 'deferred',
      startChapter: 3, lastAdvancedChapter: 3, expectedPayoff: '揭晓为何背叛',
      payoffTiming: 'endgame', notes: '', advancedCount: 0,
    },
    {
      hookId: 'h5', name: '灵力失控', type: 'power-up', status: 'progressing',
      startChapter: 4, lastAdvancedChapter: 6, expectedPayoff: '控制灵力',
      payoffTiming: 'near-term', notes: '', advancedCount: 2, dependsOn: ['h2'],
    },
  ]
}

// ── 生命周期描述 ──

describe('describeHookLifecycle', () => {
  it('新种伏笔应在 opening 阶段', () => {
    const hook = makeSampleHooks()[1] // 主角身世，startChapter=1
    const life = describeHookLifecycle(hook, 5, 100)
    expect(life.phase).toBe('opening')
    expect(life.age).toBe(4)
    expect(life.dormancy).toBe(4)
  })

  it('slow-burn 伏笔不应过早 stale', () => {
    const hook = makeSampleHooks()[1] // slow-burn, halfLife=80
    const life = describeHookLifecycle(hook, 30, 100)
    expect(life.stale).toBe(false) // dormancy=29 < halfLife=80
  })

  it('near-term 伏笔应检测 stale', () => {
    const hook = makeSampleHooks()[0] // near-term, halfLife=10, lastAdvanced=3
    const life = describeHookLifecycle(hook, 20, 100)
    expect(life.dormancy).toBe(17)
    expect(life.stale).toBe(true) // dormancy=17 > halfLife=10
  })

  it('已回收伏笔应被正确标记', () => {
    const hook = makeSampleHooks()[2] // resolved
    const life = describeHookLifecycle(hook, 10, 100)
    // 即使生命期数值仍在，状态应为 resolved
    expect(hook.status).toBe('resolved')
  })

  it('应正确计算紧迫度', () => {
    const hook = makeSampleHooks()[0]
    const life = describeHookLifecycle(hook, 20, 100)
    expect(life.advancePressure).toBeGreaterThan(50)
    expect(life.resolvePressure).toBeGreaterThan(0)
  })
})

// ── 过滤 ──

describe('filterActiveHooks / filterResolvedHooks', () => {
  it('filterActiveHooks 应排除已回收', () => {
    const hooks = makeSampleHooks()
    const active = filterActiveHooks(hooks)
    expect(active).toHaveLength(4)
    expect(active.find(h => h.hookId === 'h3')).toBeUndefined()
  })

  it('filterResolvedHooks 应只返回已回收', () => {
    const hooks = makeSampleHooks()
    const resolved = filterResolvedHooks(hooks)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].hookId).toBe('h3')
  })
})

// ── 陈腐检测 ──

describe('detectStaleHooks', () => {
  it('应检测到休眠过久的伏笔', () => {
    const hooks = makeSampleHooks()
    const stale = detectStaleHooks(hooks, 25, 100)
    expect(stale.length).toBeGreaterThan(0)
  })
})

// ── 健康审计 ──

describe('analyzeHookHealth', () => {
  it('应检测活跃伏笔过多', () => {
    // 造 15 条活跃伏笔
    const manyHooks: HookEntry[] = Array.from({ length: 15 }, (_, i) => ({
      hookId: `h${i}`,
      name: `伏笔${i}`,
      type: 'mystery',
      status: 'open' as const,
      startChapter: 1,
      lastAdvancedChapter: 1,
      expectedPayoff: '',
      notes: '',
      advancedCount: 0,
    }))
    const issues = analyzeHookHealth(manyHooks, 5)
    const burstIssue = issues.find(i => i.category === 'burst')
    expect(burstIssue).toBeDefined()
  })

  it('应检测阻塞依赖', () => {
    const hooks = makeSampleHooks()
    const issues = analyzeHookHealth(hooks, 7)
    // h5 依赖 h2（open 状态），应被标记为 blocked
    const blocked = issues.filter(i => i.category === 'blocked')
    expect(blocked.length).toBeGreaterThan(0)
  })

  it('空伏笔列表应无问题', () => {
    const issues = analyzeHookHealth([], 1)
    expect(issues).toHaveLength(0)
  })
})

// ── 账本解析 ──

describe('parseHookLedger', () => {
  it('应解析中文格式', () => {
    const memo = [
      '新种：神秘来信, 灵力失控',
      '推进：主角身世',
      '回收：青梅竹马',
      '延后：反派动机',
    ].join('\n')

    const ledger = parseHookLedger(memo)
    expect(ledger.open).toEqual(['神秘来信', '灵力失控'])
    expect(ledger.advance).toEqual(['主角身世'])
    expect(ledger.resolve).toEqual(['青梅竹马'])
    expect(ledger.defer).toEqual(['反派动机'])
  })

  it('应解析英文格式', () => {
    const memo = [
      'open: hookA, hookB',
      'advance: hookC',
      'resolve: hookD',
      'defer: hookE',
    ].join('\n')

    const ledger = parseHookLedger(memo)
    expect(ledger.open).toEqual(['hookA', 'hookB'])
    expect(ledger.advance).toEqual(['hookC'])
    expect(ledger.resolve).toEqual(['hookD'])
    expect(ledger.defer).toEqual(['hookE'])
  })

  it('空备忘录应返回空账本', () => {
    const ledger = parseHookLedger('')
    expect(ledger.open).toHaveLength(0)
    expect(ledger.advance).toHaveLength(0)
    expect(ledger.resolve).toHaveLength(0)
    expect(ledger.defer).toHaveLength(0)
  })
})

// ── 账本验证 ──

describe('validateHookLedger', () => {
  it('回收超过新种应违规', () => {
    const ledger = { open: [], advance: [], resolve: ['伏笔A', '伏笔B'], defer: [] }
    const violations = validateHookLedger(ledger, [])
    expect(violations.some(v => v.rule === 'unearth-1-bury-1')).toBe(true)
  })

  it('不存在伏笔的推进应违规', () => {
    const ledger = { open: ['新伏笔'], advance: ['不存在的伏笔'], resolve: [], defer: [] }
    const violations = validateHookLedger(ledger, [])
    expect(violations.some(v => v.rule === 'unknown-hook')).toBe(true)
  })

  it('合规账本应无违规', () => {
    const ledger = { open: ['新伏笔'], advance: ['神秘来信'], resolve: ['神秘来信'], defer: [] }
    const activeHooks: HookEntry[] = [{
      hookId: 'h1', name: '神秘来信', type: 'mystery', status: 'progressing',
      startChapter: 1, lastAdvancedChapter: 3, expectedPayoff: '',
      notes: '', advancedCount: 2,
    }]
    const violations = validateHookLedger(ledger, activeHooks)
    // open=1, resolve=1 — 合规 (resolve <= open)
    const hardViolation = violations.find(v => v.rule === 'unearth-1-bury-1')
    expect(hardViolation).toBeUndefined()
  })
})

// ── CRUD ──

describe('Hook CRUD', () => {
  it('createHook 应创建新伏笔', () => {
    const { hooks, newHook } = createHook([], {
      name: '新伏笔', type: 'mystery', expectedPayoff: '揭晓真相',
      chapterNumber: 5,
    })
    expect(hooks).toHaveLength(1)
    expect(newHook.status).toBe('open')
    expect(newHook.startChapter).toBe(5)
    expect(newHook.hookId).toMatch(/^hook_/)
  })

  it('advanceHook 应推进伏笔', () => {
    const hooks = makeSampleHooks()
    const updated = advanceHook(hooks, 'h1', 10)
    const advanced = updated.find(h => h.hookId === 'h1')!
    expect(advanced.status).toBe('progressing')
    expect(advanced.lastAdvancedChapter).toBe(10)
    expect(advanced.advancedCount).toBe(3)
  })

  it('resolveHook 应回收伏笔', () => {
    const hooks = makeSampleHooks()
    const updated = resolveHook(hooks, 'h1', 12)
    expect(updated.find(h => h.hookId === 'h1')!.status).toBe('resolved')
  })

  it('deferHook 应延后伏笔', () => {
    const hooks = makeSampleHooks()
    const updated = deferHook(hooks, 'h1')
    expect(updated.find(h => h.hookId === 'h1')!.status).toBe('deferred')
  })
})

// ── 统计与摘要 ──

describe('getHookStats / formatHookContext', () => {
  it('getHookStats 应统计各状态数量', () => {
    const stats = getHookStats(makeSampleHooks())
    expect(stats.total).toBe(5)
    expect(stats.active).toBe(4)
    expect(stats.resolved).toBe(1)
    expect(stats.coreHooks).toBe(2)
  })

  it('formatHookContext 应生成摘要', () => {
    const ctx = formatHookContext(makeSampleHooks())
    expect(ctx).toContain('神秘来信')
    expect(ctx).toContain('主线')
  })

  it('空列表应返回提示', () => {
    const ctx = formatHookContext([])
    expect(ctx).toContain('暂无活跃伏笔')
  })
})
