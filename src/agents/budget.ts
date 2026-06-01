/**
 * D7: 成本与速率控制
 *
 * 功能：
 *  - 调用前估算 token 成本
 *  - 调用后累计实际成本
 *  - 全局信号量限制并发数（默认 3）
 */

export interface CostEstimate {
  estimatedTokens: number
  estimatedCostCents: number
}

export interface PricingInfo {
  inputPerKTokens: number   // 美元/千 token
  outputPerKTokens: number  // 美元/千 token
}

/** 粗估 token 数：中文 ~1.5 token/字，英文 ~1.3 token/字 */
export function estimateTokens(text: string): number {
  const cnChars = (text.match(/[一-鿿]/g) || []).length
  const other = text.length - cnChars
  return Math.ceil(cnChars * 1.5 + other * 1.3)
}

/** 根据定价估算成本（美分） */
export function estimateCost(inputText: string, outputEstimate: number, pricing: PricingInfo): CostEstimate {
  const inputTokens = estimateTokens(inputText)
  const outputTokens = outputEstimate
  const totalTokens = inputTokens + outputTokens
  const costCents = (inputTokens / 1000) * (pricing.inputPerKTokens * 100)
    + (outputTokens / 1000) * (pricing.outputPerKTokens * 100)
  return {
    estimatedTokens: totalTokens,
    estimatedCostCents: Math.ceil(costCents),
  }
}

/** 计算实际成本（根据实际输入+输出文本） */
export function actualCost(inputText: string, outputText: string, pricing: PricingInfo): number {
  const inTokens = estimateTokens(inputText)
  const outTokens = estimateTokens(outputText)
  return Math.ceil(
    (inTokens / 1000) * (pricing.inputPerKTokens * 100) +
    (outTokens / 1000) * (pricing.outputPerKTokens * 100)
  )
}

// ── 全局并发限制 ──

export class ConcurrencyLimiter {
  private running = 0
  private queue: Array<() => void> = []

  constructor(public maxConcurrency: number = 3) {}

  /** 获取执行槽位，超过并发数则排队 */
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++
      return
    }
    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  /** 释放槽位，触发下一个等待者 */
  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }

  /** 当前活跃数 */
  get active(): number { return this.running }

  /** 等待队列长度 */
  get waiting(): number { return this.queue.length }
}

// 全局单例
export const globalLimiter = new ConcurrencyLimiter(3)

// ── 运行累计成本追踪 ──

export class CostTracker {
  private totalCents = 0
  private steps: Array<{ stepId: string; costCents: number }> = []

  /** 记录一步的成本 */
  add(stepId: string, costCents: number) {
    this.totalCents += costCents
    this.steps.push({ stepId, costCents })
  }

  /** 累计成本（美分） */
  get total(): number { return this.totalCents }

  /** 格式化显示 */
  get display(): string {
    if (this.totalCents < 100) return `${this.totalCents}¢`
    return `$${(this.totalCents / 100).toFixed(2)}`
  }

  /** 步骤明细 */
  get breakdown(): ReadonlyArray<{ stepId: string; costCents: number }> {
    return this.steps
  }

  reset() {
    this.totalCents = 0
    this.steps = []
  }
}
