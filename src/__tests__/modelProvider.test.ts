import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '../stores/modelStore'

function freshStore() {
  setActivePinia(createPinia())
  const store = useModelStore()
  store.$reset()
  return store
}

describe('模型配置管理', () => {
  it('应内置 5 家预设模型提供商', () => {
    const store = freshStore()
    const providers = store.builtInProviders
    expect(providers.length).toBeGreaterThanOrEqual(5)
    expect(providers.some(p => p.id === 'deepseek')).toBe(true)
    expect(providers.some(p => p.id === 'anthropic')).toBe(true)
    expect(providers.some(p => p.id === 'openai')).toBe(true)
    expect(providers.some(p => p.id === 'gemini')).toBe(true)
    expect(providers.some(p => p.id === 'ollama')).toBe(true)
  })

  it('每家有版本分支可选择', () => {
    const store = freshStore()
    const ds = store.builtInProviders.find(p => p.id === 'deepseek')!
    expect(ds.models.length).toBeGreaterThanOrEqual(2)
    expect(ds.models.some(m => m.id === 'deepseek-v4-flash')).toBe(true)
    expect(ds.models.some(m => m.id === 'deepseek-v4-pro')).toBe(true)
  })

  it('Think 开关仅对有 thinking 能力的模型启用', () => {
    const store = freshStore()
    const ds = store.builtInProviders.find(p => p.id === 'deepseek')!
    const chatModel = ds.models.find(m => m.id === 'deepseek-v4-flash')!
    const reasonerModel = ds.models.find(m => m.id === 'deepseek-v4-pro')!

    expect(chatModel.supportsThink).toBe(true)    // V4 Flash 支持思考
    expect(reasonerModel.supportsThink).toBe(true) // V4 Pro 支持思考
  })

  it('每个模型有上下文长度和定价信息', () => {
    const store = freshStore()
    for (const provider of store.builtInProviders) {
      for (const model of provider.models) {
        expect(model.contextLength).toBeGreaterThan(0)
        expect(model.pricing.inputPerKTokens).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('用户可启用/禁用提供商', () => {
    const store = freshStore()
    store.toggleProvider('deepseek', false)
    expect(store.isProviderEnabled('deepseek')).toBe(false)

    store.toggleProvider('deepseek', true)
    expect(store.isProviderEnabled('deepseek')).toBe(true)
  })

  it('用户可选择默认模型', () => {
    const store = freshStore()
    store.setDefaultModel('deepseek', 'deepseek-v4-flash')
    expect(store.getDefaultModelId('deepseek')).toBe('deepseek-v4-flash')
  })

  it('全局默认模型偏好', () => {
    const store = freshStore()
    store.setGlobalDefault('deepseek', 'deepseek-v4-flash')
    expect(store.globalDefaultProviderId).toBe('deepseek')
    expect(store.globalDefaultModelId).toBe('deepseek-v4-flash')
  })
})

describe('自定义模型', () => {
  it('用户可添加自定义 OpenAI 兼容模型', () => {
    const store = freshStore()
    const id = store.addCustomProvider({
      name: '我的中转站',
      baseUrl: 'https://my-proxy.com/v1',
      apiKey: 'sk-test-123',
      modelId: 'gpt-4-custom',
      supportsThink: false,
      contextLength: 128000,
    })
    const cp = store.getCustomProvider(id)
    expect(cp).toBeTruthy()
    expect(cp!.name).toBe('我的中转站')
    expect(cp!.baseUrl).toBe('https://my-proxy.com/v1')
  })

  it('用户可删除自定义模型', () => {
    const store = freshStore()
    const id = store.addCustomProvider({
      name: '临时', baseUrl: 'http://localhost/v1',
      apiKey: 'k', modelId: 'm', supportsThink: false, contextLength: 8000,
    })
    store.removeCustomProvider(id)
    expect(store.getCustomProvider(id)).toBeUndefined()
  })

  it('apiKey 不直接暴露在明文', () => {
    const store = freshStore()
    store.addCustomProvider({
      name: 'test', baseUrl: 'http://x',
      apiKey: 'secret-key-12345',
      modelId: 'm1', supportsThink: false, contextLength: 8000,
    })
    const providers = store.customProviders
    const last = providers[providers.length - 1]
    // 存储的 key 应经过混淆
    expect(last.apiKey).not.toBe('secret-key-12345')
  })
})

describe('内置模型 API Key 管理', () => {
  it('应能设置和读取 API Key', async () => {
    const store = freshStore()
    await store.setBuiltInApiKey('deepseek', 'sk-test-ds-123')
    expect(store.getBuiltInApiKeySync('deepseek')).toBe('sk-test-ds-123')
  })

  it('未设置时返回空字符串', () => {
    const store = freshStore()
    expect(store.getBuiltInApiKeySync('deepseek')).toBe('')
  })

  it('hasApiKeyConfigured 应正确判断', async () => {
    const store = freshStore()
    expect(store.hasApiKeyConfigured('deepseek')).toBe(false)
    await store.setBuiltInApiKey('deepseek', 'sk-xxx')
    expect(store.hasApiKeyConfigured('deepseek')).toBe(true)
  })

  it('getDecryptedKey 应同时支持内置和自定义', async () => {
    const store = freshStore()
    await store.setBuiltInApiKey('deepseek', 'sk-builtin')
    const customId = store.addCustomProvider({
      name: '中转', baseUrl: 'http://x', apiKey: 'sk-custom',
      modelId: 'm', supportsThink: false, contextLength: 8000,
    })
    expect(await store.getDecryptedKey('deepseek')).toBe('sk-builtin')
    expect(await store.getDecryptedKey(customId)).toBe('sk-custom')
  })

  it('$reset 应清空所有 API Key', async () => {
    const store = freshStore()
    await store.setBuiltInApiKey('deepseek', 'sk-test')
    store.$reset()
    expect(store.getBuiltInApiKeySync('deepseek')).toBe('')
  })
})
