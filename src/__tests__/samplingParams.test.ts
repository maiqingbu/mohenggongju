/**
 * 采样参数测试
 *
 * 测试场景：
 * 1. 默认采样参数正确返回
 * 2. 用户自定义覆盖生效
 * 3. 重置后恢复默认
 * 4. 各平台参数兼容性
 * 5. 请求级覆盖优先级最高
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useModelStore, getParamCompat, getSupportedParams } from '../stores/modelStore'

// Mock localStorage
const storageMock: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((k: string) => storageMock[k] || null),
    setItem: vi.fn((k: string, v: string) => { storageMock[k] = v }),
    removeItem: vi.fn((k: string) => { delete storageMock[k] }),
    clear: vi.fn(() => { Object.keys(storageMock).forEach(k => delete storageMock[k]) }),
  },
})

describe('采样参数系统', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.keys(storageMock).forEach(k => delete storageMock[k])
  })

  it('默认采样参数：DeepSeek 使用 OpenAI 兼容默认值', () => {
    const store = useModelStore()
    const sampling = store.getSampling('deepseek', 'deepseek-v4-flash')
    expect(sampling.temperature).toBe(0.7)
    expect(sampling.topP).toBe(1.0)
    expect(sampling.frequencyPenalty).toBe(0)
    expect(sampling.presencePenalty).toBe(0)
  })

  it('默认采样参数：Anthropic 无 frequencyPenalty/presencePenalty', () => {
    const store = useModelStore()
    const sampling = store.getSampling('anthropic', 'claude-sonnet-4-20250514')
    expect(sampling.temperature).toBe(0.7)
    expect(sampling.topP).toBe(1.0)
    expect(sampling.frequencyPenalty).toBeUndefined()
    expect(sampling.presencePenalty).toBeUndefined()
  })

  it('默认采样参数：Gemini 无 frequencyPenalty/presencePenalty', () => {
    const store = useModelStore()
    const sampling = store.getSampling('gemini', 'gemini-2.5-flash')
    expect(sampling.temperature).toBe(0.7)
    expect(sampling.topP).toBe(1.0)
    expect(sampling.frequencyPenalty).toBeUndefined()
  })

  it('用户自定义覆盖生效', () => {
    const store = useModelStore()
    store.setSamplingOverride('deepseek', { temperature: 1.2, frequencyPenalty: 0.5 })
    const sampling = store.getSampling('deepseek', 'deepseek-v4-flash')
    expect(sampling.temperature).toBe(1.2)
    expect(sampling.frequencyPenalty).toBe(0.5)
    // 未覆盖的字段保持默认
    expect(sampling.topP).toBe(1.0)
    expect(sampling.presencePenalty).toBe(0)
  })

  it('重置后恢复默认', () => {
    const store = useModelStore()
    store.setSamplingOverride('deepseek', { temperature: 1.5 })
    expect(store.getSampling('deepseek').temperature).toBe(1.5)

    store.resetSampling('deepseek')
    expect(store.getSampling('deepseek').temperature).toBe(0.7)
  })

  it('持久化：自定义参数写入 localStorage', () => {
    const store = useModelStore()
    store.setSamplingOverride('deepseek', { temperature: 0.9 })

    // 验证 localStorage 被写入
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'ns:sampling_overrides',
      expect.stringContaining('"temperature":0.9'),
    )
  })

  it('请求级覆盖优先级最高', () => {
    const store = useModelStore()
    store.setSamplingOverride('deepseek', { temperature: 0.9 })

    // 模拟 sendAiMessage 中的合并逻辑
    const storeSampling = store.getSampling('deepseek', 'deepseek-v4-flash')
    const requestSampling = { temperature: 1.5 }
    const merged = { ...storeSampling, ...requestSampling }

    expect(merged.temperature).toBe(1.5)  // 请求级覆盖
    expect(merged.topP).toBe(1.0)         // store 级保持
  })

  it('各平台参数兼容性', () => {
    // OpenAI 兼容
    expect(getParamCompat('deepseek')).toBe('openai')
    expect(getParamCompat('openai')).toBe('openai')
    expect(getParamCompat('ollama')).toBe('openai')
    expect(getParamCompat('custom_123')).toBe('openai')

    // Anthropic
    expect(getParamCompat('anthropic')).toBe('anthropic')

    // Gemini
    expect(getParamCompat('gemini')).toBe('gemini')

    // 支持的参数
    const openaiParams = getSupportedParams('openai')
    expect(openaiParams).toContain('temperature')
    expect(openaiParams).toContain('frequencyPenalty')
    expect(openaiParams).toContain('presencePenalty')
    expect(openaiParams).not.toContain('topK')

    const anthropicParams = getSupportedParams('anthropic')
    expect(anthropicParams).toContain('temperature')
    expect(anthropicParams).toContain('topK')
    expect(anthropicParams).not.toContain('frequencyPenalty')
    expect(anthropicParams).not.toContain('presencePenalty')

    const geminiParams = getSupportedParams('gemini')
    expect(geminiParams).toContain('topK')
    expect(geminiParams).not.toContain('frequencyPenalty')
  })

  it('未知 provider 返回 OpenAI 兼容默认值', () => {
    const store = useModelStore()
    const sampling = store.getSampling('nonexistent')
    expect(sampling.temperature).toBe(0.7)
    expect(sampling.topP).toBe(1.0)
  })

  it('$reset 清空采样参数', () => {
    const store = useModelStore()
    store.setSamplingOverride('deepseek', { temperature: 1.5 })
    expect(store.getSampling('deepseek').temperature).toBe(1.5)

    store.$reset()
    expect(store.getSampling('deepseek').temperature).toBe(0.7)
  })
})
