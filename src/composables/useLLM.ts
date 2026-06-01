/**
 * LLM 统一接入层 — 供 AiModal 调用
 * 从 modelStore 读取已启用的模型，构建提示词并发送流式请求
 */

import { ref } from 'vue'
import { useModelStore } from '../stores/modelStore'
import { sendAiMessageStream, type AiMessage } from './useAiChat'

export interface LLMGenerateParams {
  systemPrompt: string
  userPrompt?: string
  extraContext?: string
  modelId?: string        // 指定模型，不传则用第一个可用
  providerId?: string     // 指定提供商
  think?: boolean         // 启用深度思考
  maxTokens?: number      // 覆盖默认 max_tokens（用于字数控制）
}

export function useLLM() {
  const generating = ref(false)
  const output = ref('')
  const error = ref('')

  // 防竞态：每次 generate() 递增 generationId，回调中比对避免旧请求污染状态
  let generationId = 0
  // 单独缓冲推理文本，避免 onDone 用 fullText 覆盖时丢失
  let reasoningBuffer = ''
  // 流式中止
  let _activeAbort: (() => void) | null = null

  function abort() {
    if (_activeAbort) {
      _activeAbort()
      _activeAbort = null
    }
    generationId++ // 使旧回调失效
    generating.value = false
  }

  async function generate(params: LLMGenerateParams): Promise<string> {
    const store = useModelStore()
    const providers = store.getEnabledProviders()
    if (!providers.length) {
      error.value = '请先在设置中配置并启用至少一个模型'
      return ''
    }

    // 根据 modelId/providerId 匹配正确的 provider
    let provider = providers[0]
    if (params.providerId) {
      const found = providers.find(p => 'id' in p ? p.id === params.providerId : false)
      if (found) provider = found
    } else if (params.modelId) {
      for (const p of providers) {
        if ('models' in p && p.models.some(m => m.id === params.modelId)) {
          provider = p; break
        }
      }
    }

    const config = store.resolveModelConfig(provider.id, params.modelId)
    if (!config) {
      error.value = '模型配置解析失败'
      return ''
    }

    // 递增 generationId，旧请求的回调将被忽略
    const currentId = ++generationId

    generating.value = true
    output.value = ''
    error.value = ''
    reasoningBuffer = ''

    const messages: AiMessage[] = [
      { role: 'system', content: params.systemPrompt },
    ]
    if (params.extraContext) {
      messages.push({ role: 'system', content: '上下文信息：\n' + params.extraContext })
    }
    messages.push({ role: 'user', content: params.userPrompt || '请开始。' })

    try {
      const { result, abort: streamAbort } = sendAiMessageStream({
        providerId: provider.id,
        modelId: config.modelInfo?.id,
        messages,
        stream: true,
        think: params.think ?? false,
        maxTokens: params.maxTokens,
      }, {
        onChunk(text) {
          if (currentId !== generationId) return
          output.value += text
        },
        onReasoning(text) {
          if (currentId !== generationId) return
          reasoningBuffer += text
        },
        onDone(fullText) {
          if (currentId !== generationId) return
          _activeAbort = null
          generating.value = false
          // 推理内容不混入主输出，避免污染 JSON 等结构化输出
          output.value = fullText || output.value
        },
        onError(err) {
          if (currentId !== generationId) return
          _activeAbort = null
          generating.value = false
          error.value = err
        },
      })
      _activeAbort = streamAbort
      await result
    } catch (e: any) {
      if (currentId !== generationId) return output.value
      generating.value = false
      if (!error.value) error.value = e.message || String(e)
    }

    return output.value
  }

  return { generating, output, error, generate, abort }
}
