import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'

export interface SamplingParams {
  temperature?: number       // 0.0 ~ 2.0
  topP?: number              // 0.0 ~ 1.0
  topK?: number              // 1 ~ 100（仅 Anthropic/Gemini）
  frequencyPenalty?: number  // -2.0 ~ 2.0（仅 OpenAI 兼容）
  presencePenalty?: number   // -2.0 ~ 2.0（仅 OpenAI 兼容）
  maxTokens?: number         // 最大输出 token
  stop?: string[]            // 停止序列
}

export interface ModelInfo {
  id: string
  name: string
  supportsThink: boolean
  contextLength: number
  maxOutputTokens: number
  pricing: {
    inputPerKTokens: number
    outputPerKTokens: number
    thinkingPerKTokens?: number
  }
  defaultSampling?: SamplingParams
}

export interface BuiltInProvider {
  id: string
  name: string
  baseUrl: string
  models: ModelInfo[]
  enabled: boolean
  defaultModelId: string
}

export interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  modelId: string
  supportsThink: boolean
  contextLength: number
  maxOutputTokens?: number
  enabled: boolean
}

// ── 各平台采样参数兼容性 ──

export type ParamCompat = 'openai' | 'anthropic' | 'gemini'

/** 根据 provider ID 判断参数兼容模式 */
export function getParamCompat(providerId: string): ParamCompat {
  if (providerId === 'anthropic') return 'anthropic'
  if (providerId === 'gemini') return 'gemini'
  return 'openai' // deepseek, openai, ollama, custom
}

/** 该兼容模式支持的采样参数 */
export function getSupportedParams(compat: ParamCompat): (keyof SamplingParams)[] {
  if (compat === 'openai') return ['temperature', 'topP', 'frequencyPenalty', 'presencePenalty', 'maxTokens', 'stop']
  if (compat === 'anthropic') return ['temperature', 'topP', 'topK', 'maxTokens', 'stop']
  // gemini
  return ['temperature', 'topP', 'topK', 'maxTokens', 'stop']
}

// ── 内置 6 家模型 ──

const DEFAULT_SAMPLING: SamplingParams = { temperature: 0.7, topP: 1.0, frequencyPenalty: 0, presencePenalty: 0 }
const DEFAULT_OPENAI_SAMPLING: SamplingParams = { temperature: 0.7, topP: 1.0, frequencyPenalty: 0, presencePenalty: 0 }
const DEFAULT_ANTHROPIC_SAMPLING: SamplingParams = { temperature: 0.7, topP: 1.0 }
const DEFAULT_GEMINI_SAMPLING: SamplingParams = { temperature: 0.7, topP: 1.0 }

const BUILT_IN: BuiltInProvider[] = [
  {
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-v4-flash', name: 'V4 Flash', supportsThink: true, contextLength: 131072, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.00027, outputPerKTokens: 0.0011 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'deepseek-v4-pro', name: 'V4 Pro', supportsThink: true, contextLength: 131072, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.00055, outputPerKTokens: 0.00219 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: true, defaultModelId: 'deepseek-v4-flash',
  },
  {
    id: 'anthropic', name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', supportsThink: true, contextLength: 200000, maxOutputTokens: 16000, pricing: { inputPerKTokens: 0.003, outputPerKTokens: 0.015, thinkingPerKTokens: 0.015 }, defaultSampling: { ...DEFAULT_ANTHROPIC_SAMPLING } },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', supportsThink: true, contextLength: 200000, maxOutputTokens: 16000, pricing: { inputPerKTokens: 0.015, outputPerKTokens: 0.075, thinkingPerKTokens: 0.075 }, defaultSampling: { ...DEFAULT_ANTHROPIC_SAMPLING } },
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', supportsThink: false, contextLength: 200000, maxOutputTokens: 8192, pricing: { inputPerKTokens: 0.0008, outputPerKTokens: 0.004 }, defaultSampling: { ...DEFAULT_ANTHROPIC_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai', name: 'OpenAI GPT', baseUrl: 'https://api.openai.com',
    models: [
      { id: 'gpt-5', name: 'GPT-5', supportsThink: true, contextLength: 128000, maxOutputTokens: 16000, pricing: { inputPerKTokens: 0.005, outputPerKTokens: 0.015 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'gpt-4o', name: 'GPT-4o', supportsThink: false, contextLength: 128000, maxOutputTokens: 16000, pricing: { inputPerKTokens: 0.0025, outputPerKTokens: 0.01 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'o4-mini', name: 'o4 Mini', supportsThink: true, contextLength: 200000, maxOutputTokens: 100000, pricing: { inputPerKTokens: 0.0011, outputPerKTokens: 0.0044 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'gpt-4o',
  },
  {
    id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com',
    models: [
      { id: 'gemini-2.5-pro', name: '2.5 Pro', supportsThink: true, contextLength: 1000000, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.0035, outputPerKTokens: 0.0105, thinkingPerKTokens: 0.0035 }, defaultSampling: { ...DEFAULT_GEMINI_SAMPLING } },
      { id: 'gemini-2.5-flash', name: '2.5 Flash', supportsThink: true, contextLength: 1000000, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.00015, outputPerKTokens: 0.0006 }, defaultSampling: { ...DEFAULT_GEMINI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'gemini-2.5-flash',
  },
  {
    id: 'qwen', name: '通义千问 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', supportsThink: false, contextLength: 131072, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.004, outputPerKTokens: 0.012 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'qwen-plus', name: 'Qwen Plus', supportsThink: false, contextLength: 131072, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.0008, outputPerKTokens: 0.002 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'qwen-turbo', name: 'Qwen Turbo', supportsThink: false, contextLength: 131072, maxOutputTokens: 16384, pricing: { inputPerKTokens: 0.0002, outputPerKTokens: 0.0006 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'qwen-plus',
  },
  {
    id: 'moonshot', name: '月之暗面 Moonshot', baseUrl: 'https://api.moonshot.cn',
    models: [
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', supportsThink: false, contextLength: 131072, maxOutputTokens: 8192, pricing: { inputPerKTokens: 0.006, outputPerKTokens: 0.018 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32K', supportsThink: false, contextLength: 32768, maxOutputTokens: 8192, pricing: { inputPerKTokens: 0.004, outputPerKTokens: 0.012 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'moonshot-v1-128k',
  },
  {
    id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', supportsThink: false, contextLength: 128000, maxOutputTokens: 4096, pricing: { inputPerKTokens: 0.005, outputPerKTokens: 0.005 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', supportsThink: false, contextLength: 128000, maxOutputTokens: 4096, pricing: { inputPerKTokens: 0, outputPerKTokens: 0 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'glm-4-flash',
  },
  {
    id: 'baichuan', name: '百川智能', baseUrl: 'https://api.baichuan-ai.com',
    models: [
      { id: 'Baichuan4', name: '百川 4', supportsThink: false, contextLength: 32000, maxOutputTokens: 4096, pricing: { inputPerKTokens: 0.003, outputPerKTokens: 0.009 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'Baichuan4',
  },
  {
    id: 'ollama', name: 'Ollama 本地', baseUrl: 'http://localhost:11434',
    models: [
      { id: 'qwen3', name: 'Qwen3 (本地)', supportsThink: true, contextLength: 32000, maxOutputTokens: 8192, pricing: { inputPerKTokens: 0, outputPerKTokens: 0 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
      { id: 'deepseek-r1-local', name: 'DeepSeek-R1 (本地)', supportsThink: true, contextLength: 32000, maxOutputTokens: 8192, pricing: { inputPerKTokens: 0, outputPerKTokens: 0 }, defaultSampling: { ...DEFAULT_OPENAI_SAMPLING } },
    ],
    enabled: false, defaultModelId: 'qwen3',
  },
]

// ── API Key 存储：Tauri 模式走 OS 钥匙串，浏览器 dev 走 localStorage ──

// 同步检测（modelStore 方法需同步调用）。全项目统一逻辑见 useLocalWorkTree.isTauri()
function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__
}

const _keycache: Record<string, string> = reactive({})

async function invokeKeychain(op: string, params?: Record<string, unknown>): Promise<any> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(op, params)
}

// localStorage 兼容（测试环境可能不存在）
const storage = {
  get(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch {} },
  remove(k: string) { try { localStorage.removeItem(k) } catch {} },
}

const KEYSTORE_KEY = 'ns:api_keys'

export const useModelStore = defineStore('model', () => {
  const builtInProviders = ref<BuiltInProvider[]>(loadBuiltIn())
  const customProviders = ref<CustomProvider[]>(loadCustom())
  const globalDefaultProviderId = ref<string | null>(null)
  const globalDefaultModelId = ref<string | null>(null)

  // 恢复全局默认模型设置
  try {
    const raw = storage.get('ns:global_default_model')
    if (raw) {
      const saved = JSON.parse(raw) as { providerId: string; modelId: string }
      globalDefaultProviderId.value = saved.providerId
      globalDefaultModelId.value = saved.modelId
    }
  } catch {}

  // ── 采样参数（用户自定义，按 provider 存储）──
  const samplingOverrides = ref<Record<string, SamplingParams>>(loadSamplingOverrides())

  function getSampling(providerId: string, modelId?: string): SamplingParams {
    // 用户自定义 > 模型默认 > 兜底默认
    const override = samplingOverrides.value[providerId]
    const bp = builtInProviders.value.find(p => p.id === providerId)
    if (bp) {
      const mid = modelId || bp.defaultModelId
      const model = bp.models.find(m => m.id === mid)
      const merged = { ...DEFAULT_SAMPLING, ...model?.defaultSampling, ...override }
      // 过滤掉当前平台不支持的参数
      const supported = new Set(getSupportedParams(getParamCompat(providerId)))
      const filtered: SamplingParams = {}
      for (const [k, v] of Object.entries(merged)) {
        if (supported.has(k as keyof SamplingParams)) {
          (filtered as any)[k] = v
        }
      }
      return filtered
    }
    const cp = customProviders.value.find(p => p.id === providerId)
    if (cp) {
      return { ...DEFAULT_SAMPLING, ...override }
    }
    return { ...DEFAULT_SAMPLING, ...override }
  }

  function setSamplingOverride(providerId: string, params: SamplingParams) {
    samplingOverrides.value[providerId] = { ...samplingOverrides.value[providerId], ...params }
    saveSamplingOverrides()
  }

  function resetSampling(providerId: string) {
    delete samplingOverrides.value[providerId]
    saveSamplingOverrides()
  }

  function resetSamplingParam(providerId: string, key: keyof SamplingParams) {
    if (samplingOverrides.value[providerId]) {
      delete samplingOverrides.value[providerId][key]
      if (Object.keys(samplingOverrides.value[providerId]).length === 0) {
        delete samplingOverrides.value[providerId]
      }
      saveSamplingOverrides()
    }
  }

  // ── 连通测试 ──

  async function testConnection(providerId: string): Promise<{ ok: boolean; message: string }> {
    const bp = builtInProviders.value.find(p => p.id === providerId)
    const cp = customProviders.value.find(p => p.id === providerId)
    const provider = bp || cp
    if (!provider) return { ok: false, message: '服务商未找到' }

    const apiKey = await getDecryptedKey(providerId)
    if (!apiKey && providerId !== 'ollama') return { ok: false, message: '请先配置 API Key' }

    const modelId = bp?.defaultModelId || (cp as any)?.modelId || ''
    const baseUrl = provider.baseUrl.replace(/\/$/, '')

    try {
      if (providerId === 'anthropic') {
        const resp = await fetch(baseUrl + '/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: modelId, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
        })
        if (!resp.ok) { const t = await resp.text(); return { ok: false, message: `HTTP ${resp.status}: ${t.slice(0, 200)}` } }
        return { ok: true, message: '连通成功' }
      }
      if (providerId === 'gemini') {
        const resp = await fetch(`${baseUrl}/v1beta/models/${modelId}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
        })
        if (!resp.ok) { const t = await resp.text(); return { ok: false, message: `HTTP ${resp.status}: ${t.slice(0, 200)}` } }
        return { ok: true, message: '连通成功' }
      }
      // OpenAI 兼容
      const resp = await fetch(baseUrl + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: modelId, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
      })
      if (!resp.ok) { const t = await resp.text(); return { ok: false, message: `HTTP ${resp.status}: ${t.slice(0, 200)}` } }
      return { ok: true, message: '连通成功' }
    } catch (e: any) {
      return { ok: false, message: `网络错误: ${e.message}` }
    }
  }

  // ── 内置模型操作 ──

  function toggleProvider(id: string, enabled: boolean) {
    const p = builtInProviders.value.find(x => x.id === id)
    if (p) p.enabled = enabled
    saveBuiltIn()
  }

  function isProviderEnabled(id: string): boolean {
    return builtInProviders.value.find(x => x.id === id)?.enabled ?? false
  }

  function setDefaultModel(providerId: string, modelId: string) {
    const p = builtInProviders.value.find(x => x.id === providerId)
    if (p && p.models.some(m => m.id === modelId)) {
      p.defaultModelId = modelId
    }
    saveBuiltIn()
  }

  function getDefaultModelId(providerId: string): string | undefined {
    return builtInProviders.value.find(x => x.id === providerId)?.defaultModelId
  }

  function setGlobalDefault(providerId: string, modelId: string) {
    globalDefaultProviderId.value = providerId
    globalDefaultModelId.value = modelId
    storage.set('ns:global_default_model', JSON.stringify({ providerId, modelId }))
  }

  // ── 自定义模型操作 ──

  function addCustomProvider(cfg: Omit<CustomProvider, 'id' | 'enabled'>): string {
    const id = `custom_${Date.now()}`
    if (isTauri()) {
      invokeKeychain('keychain_set', { key: `custom:${id}`, value: cfg.apiKey })
        .catch(e => console.error('写入钥匙串失败:', e))
      _keycache[`custom:${id}`] = cfg.apiKey
    }
    customProviders.value.push({
      ...cfg,
      id,
      enabled: true,
      apiKey: isTauri() ? '' : obfuscateLocal(cfg.apiKey),
    })
    saveCustom()
    return id
  }

  function getCustomProvider(id: string): CustomProvider | undefined {
    return customProviders.value.find(x => x.id === id)
  }

  function toggleCustomProvider(id: string, enabled: boolean) {
    const cp = customProviders.value.find(x => x.id === id)
    if (cp) cp.enabled = enabled
    saveCustom()
  }

  function removeCustomProvider(id: string) {
    if (isTauri()) {
      invokeKeychain('keychain_delete', { key: `custom:${id}` }).catch(() => {})
      delete _keycache[`custom:${id}`]
    }
    customProviders.value = customProviders.value.filter(x => x.id !== id)
    saveCustom()
  }

  // ── 查询 ──

  function getEnabledProviders(): (BuiltInProvider | CustomProvider)[] {
    return [
      ...builtInProviders.value.filter(p => p.enabled),
      ...customProviders.value.filter(p => p.enabled),
    ]
  }

  function resolveModelConfig(providerId: string, modelId?: string): {
    provider: BuiltInProvider | CustomProvider | undefined
    modelInfo: ModelInfo | undefined
  } | null {
    const bp = builtInProviders.value.find(p => p.id === providerId && p.enabled)
    if (bp) {
      const mid = modelId || bp.defaultModelId
      return { provider: bp, modelInfo: bp.models.find(m => m.id === mid) }
    }
    const cp = customProviders.value.find(p => p.id === providerId && p.enabled)
    if (cp) {
      return {
        provider: cp,
        modelInfo: {
          id: cp.modelId, name: cp.name,
          supportsThink: cp.supportsThink, contextLength: cp.contextLength,
          maxOutputTokens: cp.maxOutputTokens || 8192, pricing: { inputPerKTokens: 0, outputPerKTokens: 0 },
        },
      }
    }
    return null
  }

  // ── 本地混淆（浏览器 dev 模式 + 自定义提供商）──
  function obfuscateLocal(plain: string): string {
    const k = 'mohe-novel-studio-2024'
    let r = ''; for (let i = 0; i < plain.length; i++) r += String.fromCharCode((plain.charCodeAt(i) ^ k.charCodeAt(i % k.length)) & 0xFF)
    return btoa(r)
  }
  function deobfuscateLocal(encoded: string): string {
    try { const k = 'mohe-novel-studio-2024'; const d = atob(encoded); let r = ''; for (let i = 0; i < d.length; i++) r += String.fromCharCode(d.charCodeAt(i) ^ k.charCodeAt(i % k.length)); return r } catch { return '' }
  }

  // 浏览器 dev 模式的 key store（localStorage 存混淆后的 key）
  const _browserKeyStore = ref<Record<string, string>>(loadBrowserKeyStore())
  function loadBrowserKeyStore(): Record<string, string> {
    try { const r = storage.get(KEYSTORE_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
  }
  function saveBrowserKeyStore() {
    storage.set(KEYSTORE_KEY, JSON.stringify(_browserKeyStore.value))
  }

  // ── API Key 管理 ──

  async function setBuiltInApiKey(providerId: string, plainKey: string) {
    // 先更新内存缓存，让 UI 即时反映
    _keycache[providerId] = plainKey
    if (isTauri()) {
      try {
        await invokeKeychain('keychain_set', { key: `provider:${providerId}`, value: plainKey })
      } catch (e) {
        // keychain 失败（未签名 App / 权限拒绝）→ 回退到 localStorage
        console.warn('[modelStore] keychain_set 失败，回退 localStorage:', e)
        _browserKeyStore.value[providerId] = obfuscateLocal(plainKey)
        saveBrowserKeyStore()
      }
    } else {
      _browserKeyStore.value[providerId] = obfuscateLocal(plainKey)
      saveBrowserKeyStore()
    }
  }

  function getBuiltInApiKeySync(providerId: string): string {
    if (isTauri()) {
      return _keycache[providerId] || ''
    } else {
      const encoded = _browserKeyStore.value[providerId]
      return encoded ? deobfuscateLocal(encoded) : ''
    }
  }

  // 冷启动时从 keychain 预载所有已配置的 key 到内存缓存（失败时回退 localStorage）
  async function preloadKeys(providerIds: string[]) {
    if (!isTauri()) return
    for (const pid of providerIds) {
      try {
        const val = await invokeKeychain('keychain_get', { key: `provider:${pid}` })
        if (val) _keycache[pid] = val
      } catch {
        // keychain 失败 → 尝试 localStorage 回退
        const encoded = _browserKeyStore.value[pid]
        if (encoded) _keycache[pid] = deobfuscateLocal(encoded)
      }
    }
  }

  async function getDecryptedKey(providerOrCustomId: string): Promise<string> {
    // 自定义提供商
    const cp = customProviders.value.find(x => x.id === providerOrCustomId)
    if (cp) {
      if (isTauri()) {
        if (_keycache[`custom:${cp.id}`]) return _keycache[`custom:${cp.id}`]
        try {
          const val = await invokeKeychain('keychain_get', { key: `custom:${cp.id}` })
          _keycache[`custom:${cp.id}`] = val || ''
          return val || ''
        } catch { return '' }
      }
      return deobfuscateLocal(cp.apiKey)
    }
    // Tauri 模式：从 keychain 取值（首次会 invoke）
    if (isTauri() && _keycache[providerOrCustomId] === undefined) {
      try {
        const val = await invokeKeychain('keychain_get', { key: `provider:${providerOrCustomId}` })
        _keycache[providerOrCustomId] = val || ''
        return val || ''
      } catch { return '' }
    }
    return getBuiltInApiKeySync(providerOrCustomId)
  }

  function hasApiKeyConfigured(providerId: string): boolean {
    return getBuiltInApiKeySync(providerId).length > 0
  }

  // ── 持久化 ──

  function loadBuiltIn(): BuiltInProvider[] {
    try {
      const raw = storage.get('ns:builtin_models')
      if (!raw) return BUILT_IN
      const saved = JSON.parse(raw) as Record<string, { enabled: boolean; defaultModelId: string }>
      return BUILT_IN.map(p => ({
        ...p,
        enabled: saved[p.id]?.enabled ?? p.enabled,
        defaultModelId: saved[p.id]?.defaultModelId ?? p.defaultModelId,
      }))
    } catch { return BUILT_IN }
  }

  function saveBuiltIn() {
    const data: Record<string, { enabled: boolean; defaultModelId: string }> = {}
    for (const p of builtInProviders.value) {
      data[p.id] = { enabled: p.enabled, defaultModelId: p.defaultModelId }
    }
    storage.set('ns:builtin_models', JSON.stringify(data))
  }

  function loadCustom(): CustomProvider[] {
    try {
      const raw = storage.get('ns:custom_models')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function saveCustom() {
    storage.set('ns:custom_models', JSON.stringify(customProviders.value))
  }

  function loadSamplingOverrides(): Record<string, SamplingParams> {
    try { const r = storage.get('ns:sampling_overrides'); return r ? JSON.parse(r) : {} } catch { return {} }
  }

  function saveSamplingOverrides() {
    storage.set('ns:sampling_overrides', JSON.stringify(samplingOverrides.value))
  }

  return {
    builtInProviders, customProviders,
    globalDefaultProviderId, globalDefaultModelId,
    samplingOverrides,
    toggleProvider, isProviderEnabled, setDefaultModel, getDefaultModelId,
    setGlobalDefault,
    addCustomProvider, getCustomProvider, removeCustomProvider, toggleCustomProvider, getDecryptedKey,
    getEnabledProviders, resolveModelConfig, preloadKeys,
    setBuiltInApiKey, getBuiltInApiKeySync, hasApiKeyConfigured,
    getSampling, setSamplingOverride, resetSampling, resetSamplingParam, testConnection,
    $reset: () => {
      builtInProviders.value = BUILT_IN.map(p => ({ ...p }))
      customProviders.value = []
      globalDefaultProviderId.value = null
      globalDefaultModelId.value = null
      samplingOverrides.value = {}
      _browserKeyStore.value = {}
      for (const k of Object.keys(_keycache)) delete _keycache[k]
      storage.remove('ns:builtin_models')
      storage.remove('ns:custom_models')
      storage.remove('ns:api_keys')
      storage.remove('ns:sampling_overrides')
    },
  }
})
