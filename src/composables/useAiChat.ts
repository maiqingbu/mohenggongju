/**
 * AI 聊天 / 生成接口
 *
 * 支持 3 种 API 格式：
 *   - OpenAI 兼容（DeepSeek / GPT / 小米 / Ollama / 自定义）
 *   - Anthropic Messages API（Claude）
 *   - Google Gemini API
 *
 * 双模式运行：
 *   - Tauri 模式：通过 Rust proxy_fetch / proxy_fetch_stream 调用
 *   - 浏览器模式：直接 fetch（开发时 pnpm dev 使用）
 */

import { useModelStore } from '../stores/modelStore'
import type { BuiltInProvider, CustomProvider, ModelInfo, SamplingParams } from '../stores/modelStore'

// ── Tauri API 懒加载（浏览器 dev 模式不触发导入）──
let _tauriInvoke: any = null
let _tauriListen: any = null
let _tauriChecked = false

async function ensureTauri() {
  if (_tauriChecked) return _tauriInvoke !== null
  _tauriChecked = true
  const { isTauri } = await import('./useLocalWorkTree')
  if (!isTauri()) return false
  try {
    const core = await import('@tauri-apps/api/core')
    const event = await import('@tauri-apps/api/event')
    _tauriInvoke = core.invoke
    _tauriListen = event.listen
    return true
  } catch {
    return false
  }
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  providerId: string       // modelStore provider ID
  modelId?: string         // 不传则用 provider 默认
  messages: AiMessage[]
  stream?: boolean
  think?: boolean          // 启用深度思考模式
  maxTokens?: number       // 覆盖默认 max_tokens（用于字数控制）
  thinkingBudget?: number  // 覆盖默认 thinking budget（默认 1600，短篇可降到 1000 腾出输出空间）
  sampling?: SamplingParams // 覆盖采样参数
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onReasoning?: (text: string) => void
  onDone: (fullText: string) => void
  onError: (err: string) => void
}

// ── 解析配置 ──

async function resolveConfig(providerId: string, modelId?: string) {
  const store = useModelStore()
  const config = store.resolveModelConfig(providerId, modelId)
  if (!config || !config.provider) {
    throw new Error(`AI 服务商未配置或未启用: ${providerId}`)
  }
  const apiKey = await store.getDecryptedKey(providerId)
  if (!apiKey && providerId !== 'ollama') {
    throw new Error(`请先在模型设置中配置 ${config.provider.name} 的 API Key`)
  }
  return { ...config, apiKey, provider: config.provider, modelInfo: config.modelInfo }
}

// ── 非流式请求 ──

export async function sendAiMessage(req: AiChatRequest): Promise<string> {
  const { provider, modelInfo, apiKey } = await resolveConfig(req.providerId, req.modelId)
  const model = modelInfo?.id || (provider as any).defaultModelId || ''
  const think = req.think ?? false
  const store = useModelStore()
  const sampling = { ...store.getSampling(req.providerId, req.modelId), ...req.sampling }

  if (provider.id === 'anthropic') {
    return callAnthropic(provider, model, apiKey, req.messages, think, false, undefined, undefined, req.maxTokens, req.thinkingBudget, sampling)
  }
  if (provider.id === 'gemini') {
    return callGemini(provider, model, apiKey, req.messages, think, false, undefined, undefined, req.maxTokens, sampling)
  }
  return callOpenAiCompat(provider, model, apiKey, req.messages, think, false, modelInfo, undefined, undefined, req.maxTokens, sampling)
}

// ── 流式请求 ──

export function sendAiMessageStream(
  req: AiChatRequest,
  callbacks: StreamCallbacks,
): { abort: () => void; result: Promise<void> } {
  let aborted = false

  function abort() {
    aborted = true
  }

  const result = (async () => {
    const { provider, modelInfo, apiKey } = await resolveConfig(req.providerId, req.modelId)
    const model = modelInfo?.id || (provider as any).defaultModelId || ''
    const think = req.think ?? false
    const store = useModelStore()
    const sampling = { ...store.getSampling(req.providerId, req.modelId), ...req.sampling }

    const isAborted = () => aborted

    if (provider.id === 'anthropic') {
      await callAnthropic(provider, model, apiKey, req.messages, think, true, callbacks, isAborted, req.maxTokens, req.thinkingBudget, sampling)
    } else if (provider.id === 'gemini') {
      await callGemini(provider, model, apiKey, req.messages, think, true, callbacks, isAborted, req.maxTokens, sampling)
    } else {
      await callOpenAiCompat(provider, model, apiKey, req.messages, think, true, modelInfo, callbacks, isAborted, req.maxTokens, sampling)
    }
  })()

  return { abort, result }
}

// ── OpenAI 兼容 API ──

async function callOpenAiCompat(
  provider: BuiltInProvider | CustomProvider,
  model: string,
  apiKey: string,
  messages: AiMessage[],
  think: boolean,
  stream: boolean,
  modelInfo?: ModelInfo,
  callbacks?: StreamCallbacks,
  isAborted?: () => boolean,
  maxTokensOverride?: number,
  sampling?: SamplingParams,
): Promise<string> {
  const url = provider.baseUrl.replace(/\/$/, '') + '/chat/completions'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }

  const maxTokens = maxTokensOverride ?? sampling?.maxTokens ?? modelInfo?.maxOutputTokens ?? 4096

  const body: Record<string, any> = {
    model,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    stream,
  }

  // DeepSeek 思考模式
  if (provider.id === 'deepseek') {
    body.thinking = think ? { type: 'enabled' } : { type: 'disabled' }
  }

  // 采样参数：DeepSeek thinking 模式不兼容 temperature/top_p 等参数
  if (!(provider.id === 'deepseek' && think)) {
    if (sampling?.temperature != null) body.temperature = sampling.temperature
    if (sampling?.topP != null && sampling.topP !== 1.0) body.top_p = sampling.topP
    if (sampling?.frequencyPenalty != null && sampling.frequencyPenalty !== 0) body.frequency_penalty = sampling.frequencyPenalty
    if (sampling?.presencePenalty != null && sampling.presencePenalty !== 0) body.presence_penalty = sampling.presencePenalty
  }
  if (sampling?.stop?.length) body.stop = sampling.stop

  const bodyStr = JSON.stringify(body)

  if (stream && callbacks) {
    return streamRequest(url, headers, bodyStr, callbacks, 'openai', isAborted)
  }

  const result = await rawRequest(url, 'POST', headers, bodyStr)
  const data = JSON.parse(result)
  return data.choices?.[0]?.message?.content || ''
}

// ── Anthropic Messages API ──

async function callAnthropic(
  provider: BuiltInProvider | CustomProvider,
  model: string,
  apiKey: string,
  messages: AiMessage[],
  think: boolean,
  stream: boolean,
  callbacks?: StreamCallbacks,
  isAborted?: () => boolean,
  maxTokensOverride?: number,
  thinkingBudgetOverride?: number,
  sampling?: SamplingParams,
): Promise<string> {
  const url = provider.baseUrl.replace(/\/$/, '') + '/v1/messages'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }

  // 分离 system 消息
  const systemMsg = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }))

  const modelInfo2 = 'models' in provider
    ? provider.models.find((m: any) => m.id === model)
    : null
  const maxTokens = maxTokensOverride ?? sampling?.maxTokens ?? modelInfo2?.maxOutputTokens ?? 4096
  const budgetTokens = think
    ? (thinkingBudgetOverride ?? Math.min(1600, Math.max(800, Math.floor(maxTokens * 0.4))))
    : 0

  const body: Record<string, any> = {
    model,
    messages: chatMessages,
    max_tokens: maxTokens,
    stream,
  }

  if (systemMsg) {
    body.system = systemMsg
  }

  // 采样参数（thinking 模式下 temperature 固定为 1，不可设置）
  if (!think) {
    if (sampling?.temperature != null) body.temperature = sampling.temperature
    if (sampling?.topP != null && sampling.topP !== 1.0) body.top_p = sampling.topP
  }
  if (sampling?.topK != null) body.top_k = sampling.topK
  if (sampling?.stop?.length) body.stop_sequences = sampling.stop

  if (think) {
    body.thinking = { type: 'enabled', budget_tokens: budgetTokens }
  }

  const bodyStr = JSON.stringify(body)

  if (stream && callbacks) {
    return streamRequest(url, headers, bodyStr, callbacks, 'anthropic', isAborted)
  }

  const result = await rawRequest(url, 'POST', headers, bodyStr)
  const data = JSON.parse(result)
  return data.content?.[0]?.text || ''
}

// ── Google Gemini API ──

async function callGemini(
  provider: BuiltInProvider | CustomProvider,
  model: string,
  apiKey: string,
  messages: AiMessage[],
  think: boolean,
  stream: boolean,
  callbacks?: StreamCallbacks,
  isAborted?: () => boolean,
  maxTokensOverride?: number,
  sampling?: SamplingParams,
): Promise<string> {
  const baseUrl = provider.baseUrl.replace(/\/$/, '')
  const action = stream ? 'streamGenerateContent' : 'generateContent'
  const url = `${baseUrl}/v1beta/models/${model}:${action}${stream ? '?alt=sse' : ''}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  }

  // 转换消息格式
  const systemMsg = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const body: Record<string, any> = { contents }

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] }
  }

  const genConfig: Record<string, any> = {}
  if (think) genConfig.thinkingConfig = { thinkingBudget: 1600 }
  const effectiveMaxTokens = maxTokensOverride ?? sampling?.maxTokens
  if (effectiveMaxTokens) genConfig.maxOutputTokens = effectiveMaxTokens
  // 采样参数（thinking 模式下 temperature 固定为 1）
  if (!think && sampling?.temperature != null) genConfig.temperature = sampling.temperature
  if (sampling?.topP != null && sampling.topP !== 1.0) genConfig.topP = sampling.topP
  if (sampling?.topK != null) genConfig.topK = sampling.topK
  if (sampling?.stop?.length) genConfig.stopSequences = sampling.stop
  if (Object.keys(genConfig).length > 0) {
    body.generationConfig = genConfig
  }

  const bodyStr = JSON.stringify(body)

  if (stream && callbacks) {
    return streamRequest(url, headers, bodyStr, callbacks, 'gemini', isAborted)
  }

  const result = await rawRequest(url, 'POST', headers, bodyStr)
  const data = JSON.parse(result)
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ── 底层 HTTP 请求（Tauri 或 fetch）──

async function rawRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
): Promise<string> {
  // B1: Tauri 模式下走 Rust proxy，绕过浏览器 CORS 限制
  if (await ensureTauri()) {
    const result = await _tauriInvoke('proxy_fetch', {
      url,
      method,
      headers,
      body: body || null,
    })
    if (!result.ok) {
      throw new Error(`API 错误 (${result.status}): ${(result.body || '').slice(0, 300)}`)
    }
    return result.body || ''
  }

  // 浏览器 dev 模式：直接 fetch
  // AbortSignal.timeout 在旧版 WebKit 不支持，用 AbortController + setTimeout 回退
  let signal: AbortSignal
  try {
    signal = AbortSignal.timeout(120_000)
  } catch {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 120_000)
    signal = ctrl.signal
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`API 错误 (${response.status}): ${text.slice(0, 300)}`)
  }
  return text
}

// ── 流式请求 ──

async function streamRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  callbacks: StreamCallbacks,
  format: 'openai' | 'anthropic' | 'gemini' = 'openai',
  isAborted?: () => boolean,
): Promise<string> {
  let fullText = ''

  // B1: Tauri 模式下走 Rust proxy
  if (await ensureTauri()) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const sseFormat = format === 'anthropic' ? 'anthropic' : format === 'gemini' ? 'gemini' : 'openai'

    // B4: 注册 abort handler + 等待 done/error 事件再 unlisten，防止竞态丢失 onDone
    let streamFinished: (() => void) | null = null
    const donePromise = new Promise<void>(resolve => { streamFinished = resolve })

    const unlisten = await _tauriListen(`stream:${requestId}`, (event: any) => {
      if (isAborted?.()) { callbacks.onDone(fullText); streamFinished?.(); return }
      const payload = event.payload
      switch (payload.type) {
        case 'chunk':
          fullText += payload.data
          callbacks.onChunk(payload.data)
          break
        case 'reasoning':
          callbacks.onReasoning?.(payload.data)
          break
        case 'done':
          callbacks.onDone(payload.full_text || fullText)
          streamFinished?.()
          break
        case 'error':
          callbacks.onError(payload.message)
          streamFinished?.()
          break
      }
    })

    try {
      await _tauriInvoke('proxy_fetch_stream', {
        requestId,
        request: { url, method: 'POST', headers, body },
        sseFormat,
      })
      // 等待 Rust 端 emit 的 done/error 事件被 listener 接收后再 unlisten
      // 安全超时 30s：正常情况 done 事件在 invoke 返回后毫秒级到达
      await Promise.race([
        donePromise,
        new Promise(resolve => setTimeout(resolve, 30_000)),
      ])
    } catch (e: any) {
      if (!isAborted?.()) {
        callbacks.onError(`流式请求失败: ${e.message || e}`)
      }
    } finally {
      unlisten()
    }

    return fullText
  }

  // 浏览器 dev 模式：直接 fetch + SSE 解析
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errText = await response.text()
      callbacks.onError(`API 错误 (${response.status}): ${errText.slice(0, 300)}`)
      return ''
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('响应体为空')
      return ''
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        if (isAborted?.()) {
          callbacks.onDone(fullText)
          return fullText
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const json = JSON.parse(data)

            if (format === 'openai') {
              const delta = json.choices?.[0]?.delta
              if (delta?.reasoning_content) {
                callbacks.onReasoning?.(delta.reasoning_content)
              }
              if (delta?.content) {
                fullText += delta.content
                callbacks.onChunk(delta.content)
              }
            } else if (format === 'anthropic') {
              if (json.type === 'content_block_delta' && json.delta?.text) {
                fullText += json.delta.text
                callbacks.onChunk(json.delta.text)
              }
              if (json.type === 'thinking_delta' && json.delta?.thinking) {
                callbacks.onReasoning?.(json.delta.thinking)
              }
            } else if (format === 'gemini') {
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                fullText += text
                callbacks.onChunk(text)
              }
              const thought = json.candidates?.[0]?.content?.parts?.[0]?.thought
              if (thought) {
                callbacks.onReasoning?.(thought)
              }
            }
          } catch {
            // 非 JSON 行，跳过
          }
        }
      }

      callbacks.onDone(fullText)
      return fullText
    } finally {
      try { reader.cancel() } catch { /* already closed */ }
      reader.releaseLock()
    }
  } catch (e: any) {
    if (!isAborted?.()) {
      callbacks.onError(`请求失败: ${e.message || e}`)
    }
    return ''
  }
}
