import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateCost, actualCost, ConcurrencyLimiter, CostTracker } from '../agents/budget'

describe('estimateTokens', () => {
  it('counts Chinese at 1.5x', () => {
    expect(estimateTokens('你好世界')).toBe(6) // 4 chars × 1.5
  })

  it('handles mixed content', () => {
    const result = estimateTokens('hello 世界')
    expect(result).toBeGreaterThan(0)
  })

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('estimateCost', () => {
  const pricing = { inputPerKTokens: 0.03, outputPerKTokens: 0.06 }

  it('calculates cost from input text and output estimate', () => {
    const result = estimateCost('你好世界', 100, pricing)
    expect(result.estimatedTokens).toBeGreaterThan(0)
    expect(result.estimatedCostCents).toBeGreaterThanOrEqual(0)
  })
})

describe('actualCost', () => {
  const pricing = { inputPerKTokens: 0.01, outputPerKTokens: 0.03 }

  it('returns positive cost for real text', () => {
    const cost = actualCost('你好', '世界', pricing)
    expect(cost).toBeGreaterThanOrEqual(0)
  })
})

describe('ConcurrencyLimiter', () => {
  it('limits to max 3 concurrent', async () => {
    const limiter = new ConcurrencyLimiter(3)
    const active: number[] = []

    const tasks = Array.from({ length: 10 }, async () => {
      await limiter.acquire()
      active.push(limiter.active)
      await new Promise(r => setTimeout(r, 10))
      limiter.release()
    })

    await Promise.all(tasks)
    // 最多同时 3 个活跃
    expect(Math.max(...active)).toBeLessThanOrEqual(3)
  })

  it('tracks waiting count', async () => {
    const limiter = new ConcurrencyLimiter(1)
    await limiter.acquire() // 占用唯一槽位
    expect(limiter.active).toBe(1)

    // 启动一个等待任务
    const p = limiter.acquire().then(() => { limiter.release() })
    expect(limiter.waiting).toBe(1)

    limiter.release()
    await p
    expect(limiter.active).toBe(0)
  })
})

describe('CostTracker', () => {
  it('accumulates step costs', () => {
    const tracker = new CostTracker()
    tracker.add('s1', 120)
    tracker.add('s2', 80)
    expect(tracker.total).toBe(200)
    expect(tracker.display).toBe('$2.00')
    expect(tracker.breakdown).toHaveLength(2)
  })

  it('displays cents under $1', () => {
    const tracker = new CostTracker()
    tracker.add('s1', 50)
    expect(tracker.display).toBe('50¢')
  })

  it('resets correctly', () => {
    const tracker = new CostTracker()
    tracker.add('s1', 100)
    tracker.reset()
    expect(tracker.total).toBe(0)
  })
})
