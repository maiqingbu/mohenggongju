<template>
  <Teleport to="body">
    <div v-if="visible" class="rm-overlay" @click.self="() => {}">
      <div class="rm-root" :class="isDark ? 'rm-dark' : 'rm-light'">
        <!-- Header -->
        <div class="rm-header">
          <div class="rm-header-left">
            <span class="rm-title-icon">📱</span>
            <div>
              <h2 class="rm-title">短篇创作 · {{ platformLabel }}</h2>
              <p class="rm-subtitle">
                {{ genreLabel }} · {{ wordCountLabel }}
                <span v-if="state === 'generating' && !content"> · 生成中...</span>
                <span v-else-if="state === 'generating'"> · 流式输出中...</span>
                <span v-else-if="state === 'review'"> · 请审阅修改</span>
              </p>
            </div>
          </div>
          <button class="rm-close" @click="handleDiscard" :disabled="state === 'generating' && !content">✕</button>
        </div>

        <!-- Body -->
        <div class="rm-body">
          <!-- Idle / Generating: spinner -->
          <div v-if="state === 'generating' && !content" class="rm-loading">
            <div class="rm-spinner"></div>
            <p class="rm-loading-text">AI 正在构思创作中，请稍候...</p>
            <p class="rm-loading-hint">分层指令：平台策略 → 标签配置 → 写作规范</p>
          </div>

          <!-- Streaming content -->
          <div v-if="(state === 'generating' && content) || state === 'review'">
            <textarea
              ref="editorEl"
              class="rm-editor"
              :value="content"
              @input="onContentInput"
              :readonly="state === 'generating'"
              :placeholder="state === 'generating' ? 'AI 正在写作...' : '生成完成后可直接修改'"
            ></textarea>
            <span v-if="state === 'generating'" class="rm-cursor">|</span>
          </div>

          <!-- Error -->
          <div v-if="state === 'error'" class="rm-error-state">
            <p class="rm-error-icon">❌</p>
            <p class="rm-error-msg">生成失败</p>
            <p class="rm-error-detail">{{ errorMsg }}</p>
          </div>
        </div>

        <!-- Footer -->
        <div class="rm-footer">
          <div class="rm-footer-left">
            <span class="rm-word-count">{{ content.length }} 字</span>
            <span class="rm-target">目标 {{ wordCount.toLocaleString() }} 字</span>
          </div>
          <div class="rm-footer-right">
            <button v-if="state !== 'generating'" class="rm-btn rm-btn-discard" @click="handleDiscard">放弃</button>
            <button
              v-if="state === 'error' || state === 'review'"
              class="rm-btn rm-btn-retry"
              @click="handleRetry"
            >🔄 重新生成</button>
            <button
              v-if="state === 'review'"
              class="rm-btn rm-btn-approve"
              @click="handleApprove"
              :disabled="!content.trim()"
            >✅ 保存作品</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { useModelStore } from '../stores/modelStore'
import { sendAiMessageStream } from '../composables/useAiChat'
import { buildLayeredSystemPrompt, getPlatformLabel } from '../composables/usePlatformTags'
import { GENRE_LABELS } from '../composables/usePlatformTags'
import type { TagSet } from '../composables/usePlatformTags'

const props = defineProps<{
  visible: boolean
  platformId: string
  tagSet: TagSet
  wordCount: number
  extra?: string
  isDark?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'approve', content: string): void
}>()

type ModalState = 'idle' | 'generating' | 'review' | 'error'
const state = ref<ModalState>('idle')
const content = ref('')
const errorMsg = ref('')
const editorEl = ref<HTMLTextAreaElement | null>(null)
let abortStream: (() => void) | null = null

const platformLabel = computed(() => getPlatformLabel(props.platformId))
const genreLabel = computed(() => GENRE_LABELS[props.tagSet.genre] || props.tagSet.genre || '未选')
const wordCountLabel = computed(() => {
  const wc = props.wordCount
  return wc >= 10000 ? (wc / 10000) + '万字' : wc + '字'
})

// 当弹窗打开时，开始生成
watch(() => props.visible, async (v) => {
  if (v) {
    await startGeneration()
  } else {
    abortStream?.()
    abortStream = null
    state.value = 'idle'
    content.value = ''
    errorMsg.value = ''
  }
})

async function startGeneration() {
  // 中止上一个未完成的请求
  abortStream?.()
  abortStream = null

  state.value = 'generating'
  content.value = ''
  errorMsg.value = ''

  const modelStore = useModelStore()
  const providers = modelStore.getEnabledProviders()
  if (!providers.length) {
    state.value = 'error'
    errorMsg.value = '未配置 AI 模型，请先在设置中配置并启用模型'
    return
  }

  const provider = providers[0]
  const modelId = 'models' in provider ? provider.models[0]?.id : undefined
  const config = modelStore.resolveModelConfig(provider.id, modelId)
  if (!config) {
    state.value = 'error'
    errorMsg.value = '模型配置解析失败'
    return
  }

  // 构建分层系统指令
  const systemPrompt = buildLayeredSystemPrompt(
    props.platformId,
    props.tagSet,
    props.wordCount,
    props.extra,
  )

  const userPrompt = `请根据以上分层指令，一次性生成完整短篇故事。目标字数：${props.wordCount}字，平台：${platformLabel.value}。`

  try {
    const { result, abort } = sendAiMessageStream({
      providerId: provider.id,
      modelId: config.modelInfo?.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      think: false,
      maxTokens: Math.max(4096, props.wordCount * 3),
    }, {
      onChunk(text: string) {
        if (state.value !== 'generating') return
        content.value += text
      },
      onDone(fullText: string) {
        if (state.value !== 'generating') return
        if (!content.value.trim() && !fullText.trim()) {
          state.value = 'error'
          errorMsg.value = 'AI 返回内容为空，请重试'
        } else {
          state.value = 'review'
        }
      },
      onError(err: string) {
        state.value = 'error'
        errorMsg.value = err
      },
    })
    abortStream = abort
    await result
  } catch (e: any) {
    if (state.value === 'generating') {
      state.value = 'error'
      if (!errorMsg.value) errorMsg.value = e.message || String(e)
    }
  } finally {
    abortStream = null
  }
}

function onContentInput(e: Event) {
  content.value = (e.target as HTMLTextAreaElement).value
}

function handleRetry() {
  startGeneration()
}

function handleApprove() {
  const text = content.value.trim()
  if (!text) return
  emit('approve', text)
}

function handleDiscard() {
  abortStream?.()
  abortStream = null
  emit('close')
}
</script>

<style scoped>
/* ── Overlay ── */
.rm-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
}

.rm-root {
  width: min(900px, 92vw);
  height: min(700px, 85vh);
  border-radius: 14px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.rm-light { background: #fff; color: #1a1a2e; border: 1px solid #e5e7eb; }
.rm-dark { background: #1a1a2e; color: #e5e7eb; border: 1px solid #2d2d44; }

/* ── Header ── */
.rm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid;
  flex-shrink: 0;
}
.rm-light .rm-header { border-color: #e5e7eb; }
.rm-dark .rm-header { border-color: #2d2d44; }

.rm-header-left { display: flex; align-items: center; gap: 12px; }
.rm-title-icon { font-size: 24px; }
.rm-title { margin: 0; font-size: 16px; font-weight: 600; }
.rm-subtitle { margin: 2px 0 0; font-size: 12px; opacity: 0.55; }

.rm-close {
  width: 32px; height: 32px; border-radius: 8px; border: none;
  cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
  background: transparent; opacity: 0.5; transition: all .15s;
}
.rm-light .rm-close { color: #333; }
.rm-dark .rm-close { color: #ccc; }
.rm-close:hover { opacity: 1; background: rgba(128,128,128,.12); }

/* ── Body ── */
.rm-body {
  flex: 1; overflow: hidden; padding: 16px 20px;
  display: flex; flex-direction: column;
}

.rm-loading {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
}
.rm-spinner {
  width: 40px; height: 40px; border-radius: 50%;
  border: 3px solid #e5e7eb;
  border-top-color: #7c3aed;
  animation: spin .8s linear infinite;
}
.rm-dark .rm-spinner { border-color: #2d2d44; border-top-color: #a78bfa; }
@keyframes spin { to { transform: rotate(360deg); } }

.rm-loading-text { margin: 0; font-size: 15px; font-weight: 500; }
.rm-loading-hint { margin: 0; font-size: 12px; opacity: 0.4; }

/* ── Editor ── */
.rm-editor {
  width: 100%; height: 100%;
  border: 1px solid; border-radius: 10px;
  padding: 14px 16px; font-size: 14px; line-height: 1.75;
  resize: none; outline: none; font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  box-sizing: border-box;
  transition: border-color .2s;
}
.rm-light .rm-editor {
  background: #fafbfc; border-color: #e5e7eb; color: #1a1a2e;
}
.rm-dark .rm-editor {
  background: #12122a; border-color: #2d2d44; color: #e5e7eb;
}
.rm-editor:focus { border-color: #7c3aed; }
.rm-editor[readonly] { cursor: default; }

.rm-cursor {
  display: none; /* cursor shown via blinking text in streaming mode, remove standalone cursor */
}

/* ── Error ── */
.rm-error-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rm-error-icon { font-size: 36px; margin: 0 0 8px; }
.rm-error-msg { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
.rm-error-detail { font-size: 13px; opacity: 0.5; }

/* ── Footer ── */
.rm-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid;
  flex-shrink: 0;
}
.rm-light .rm-footer { border-color: #e5e7eb; }
.rm-dark .rm-footer { border-color: #2d2d44; }

.rm-footer-left { display: flex; gap: 12px; font-size: 13px; }
.rm-word-count { font-weight: 600; }
.rm-target { opacity: 0.45; }

.rm-footer-right { display: flex; gap: 8px; }

.rm-btn {
  padding: 8px 18px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all .15s;
}
.rm-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rm-btn-discard {
  background: transparent; opacity: 0.5;
}
.rm-light .rm-btn-discard { color: #666; }
.rm-dark .rm-btn-discard { color: #aaa; }
.rm-btn-discard:hover:not(:disabled) { opacity: 1; }

.rm-btn-retry {
  background: #f0f0f0; color: #333;
}
.rm-dark .rm-btn-retry { background: #2d2d44; color: #ccc; }
.rm-btn-retry:hover { background: #e0e0e0; }
.rm-dark .rm-btn-retry:hover { background: #3d3d55; }

.rm-btn-approve {
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
  color: #fff;
}
.rm-btn-approve:hover:not(:disabled) {
  background: linear-gradient(135deg, #6d28d9, #8b5cf6);
  box-shadow: 0 2px 8px rgba(124,58,237,.3);
}
</style>
