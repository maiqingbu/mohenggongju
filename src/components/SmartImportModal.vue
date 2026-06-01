<template>
  <Teleport to="body">
    <div v-if="visible" class="sim-overlay" @click.self="close()">
      <div class="sim-root" :class="isDark !== false ? 'sim-theme-dark' : 'sim-theme-light'">
        <!-- Header -->
        <div class="sim-header">
          <div class="sim-header-left">
            <h2 class="sim-title">智能导入立项</h2>
          </div>
          <button class="sim-close" @click="close()">✕</button>
        </div>
        <p class="sim-desc">我有完整想法 → 一键整理成立项书 → 确认写入笔记</p>

        <!-- Body -->
        <div class="sim-body">
          <!-- Step 1: Input form -->
          <template v-if="!resultText">
            <div class="sim-field">
              <label class="sim-label">书名（可选）</label>
              <input
                v-model="bookTitle"
                class="sim-input"
                placeholder="例如：退婚后，我靠金手指封神"
              />
            </div>

            <div class="sim-field">
              <label class="sim-label">类型 / 赛道（可选）</label>
              <input
                v-model="genre"
                class="sim-input"
                placeholder="例如：都市日常 / 年代重生"
              />
            </div>

            <div class="sim-field">
              <label class="sim-label">原始信息（建议粘贴：基础信息 + 核心构架）</label>
              <textarea
                v-model="rawText"
                class="sim-textarea"
                rows="10"
                placeholder="可以直接粘贴任何笔记 / 设定表 / 大纲 / 聊天记录，例如：

书名：……
赛道/类型：……
一句话核心：……
世界观：……
主角：……
金手指：……
力量体系：……
核心冲突 / 爽点：……"
              ></textarea>
              <div class="sim-char-bar">
                <span class="sim-char-count">字符数：{{ rawText.length }}</span>
                <span class="sim-char-hint">建议 500-3000 字；越具体越贴合。</span>
              </div>
            </div>

            <!-- Progress -->
            <div class="sim-progress-wrap">
              <div class="sim-progress-bar">
                <div class="sim-progress-fill" :style="{ width: progressPct + '%' }"></div>
              </div>
              <span class="sim-progress-label">整体进度 {{ progressPct }}%</span>
            </div>

            <!-- Hint -->
            <p class="sim-hint">你粘贴的内容越接近"原始信息"格式，AI 越能保持你的设定与措辞；未提供的字段会自动补齐为可执行的立项书。</p>
          </template>

          <!-- Step 2: Result preview -->
          <template v-else>
            <div class="sim-section-label">📋 立项书预览</div>
            <pre class="sim-result">{{ resultText }}</pre>

            <!-- Error -->
            <div v-if="generateError" class="sim-error">{{ generateError }}</div>
          </template>
        </div>

        <!-- Footer -->
        <div class="sim-footer">
          <div class="sim-footer-left">
            <span v-if="generating" class="sim-gen-status">
              <span class="sim-spinner"></span> AI 正在整理立项书…
            </span>
          </div>
          <div class="sim-footer-right">
            <button v-if="resultText" class="sim-back-btn" @click="resetForm">重新整理</button>
            <button class="sim-cancel-btn" @click="close()">关闭</button>
            <button
              v-if="!resultText"
              class="sim-apply-btn"
              :disabled="!canGenerate || generating"
              @click="doGenerate"
            >
              <span v-if="generating" class="sim-spinner"></span>
              <span v-else>📝</span>
              {{ generating ? '整理中…' : '一键整理成立项书' }}
            </button>
            <button
              v-else
              class="sim-apply-btn"
              :disabled="applying"
              @click="doApply"
            >
              {{ applying ? '写入中…' : '📥 写入笔记' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useModelStore } from '../stores/modelStore'
import { NotesManager } from '../composables/useNotes'
import type { SettingsManager } from '../composables/useSettings'

const props = defineProps<{
  manager: SettingsManager
  isDark?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'settings-changed'): void
}>()

const visible = ref(false)
const msg = useMessage()

function open() { visible.value = true; resetForm() }
function close() { visible.value = false; emit('close') }
defineExpose({ open })

// ── Form state ──
const bookTitle = ref('')
const genre = ref('')
const rawText = ref('')

// ── Generation state ──
const generating = ref(false)
const generateError = ref('')
const resultText = ref('')
const applying = ref(false)

const canGenerate = computed(() => rawText.value.trim().length > 0)

const progressPct = computed(() => {
  let score = 0
  if (bookTitle.value.trim()) score += 20
  if (genre.value.trim()) score += 20
  if (rawText.value.trim().length > 100) score += 30
  if (rawText.value.trim().length > 500) score += 30
  return Math.min(100, score)
})

function resetForm() {
  resultText.value = ''
  generateError.value = ''
}

// ── AI Generation ──
async function doGenerate() {
  if (!canGenerate.value) return
  generating.value = true
  generateError.value = ''
  resultText.value = ''

  const store = useModelStore()
  const providers = store.getEnabledProviders()
  if (!providers.length) {
    generateError.value = '请先在设置中启用 AI 模型'
    generating.value = false
    return
  }

  const firstProvider = providers[0]
  const modelId = 'models' in firstProvider
    ? firstProvider.models[0]?.id
    : (firstProvider as any).modelId
  if (!modelId) {
    generateError.value = '未选择模型'
    generating.value = false
    return
  }

  const titleLine = bookTitle.value.trim() ? `已有书名：${bookTitle.value.trim()}` : '书名未定'
  const genreLine = genre.value.trim() ? `已有类型/赛道：${genre.value.trim()}` : '类型/赛道未定'

  const prompt = `你是一个专业的小说立项顾问。请根据用户提供的原始想法，整理成一份完整的小说立项书。

${titleLine}
${genreLine}

【用户原始信息】
${rawText.value.slice(0, 6000)}

请生成一份结构化的立项书，包含以下板块（缺失的信息由你合理补全，标注"AI 建议"）：

## 书名
## 类型 / 赛道
## 一句话核心
## 世界观设定
## 主角人设
## 金手指 / 核心能力
## 力量体系
## 核心冲突 / 爽点
## 目标读者与平台建议
## 前三章剧情方向

要求：
1. 保持用户原文的措辞和设定，不擅自改动用户明确提供的信息
2. 补全的内容要合理、有创意、符合网文市场趋势
3. 格式清晰，每个板块之间有空行
4. 直接输出立项书正文，不要加"好的，以下是…"这类开头语`

  try {
    const { sendAiMessageStream } = await import('../composables/useAiChat')
    let full = ''
    const { result } = sendAiMessageStream({
      providerId: ('id' in firstProvider ? firstProvider.id : (firstProvider as any).id) || '',
      modelId,
      messages: [
        { role: 'system', content: '你是专业的小说立项顾问，擅长从碎片化想法中整理出完整的立项书。直接输出立项书，不输出解释性开头。' },
        { role: 'user', content: prompt },
      ],
      stream: true,
    }, {
      onChunk(t: string) { full += t },
      onDone() {},
      onError(err: string) { throw new Error(err) },
    })
    await result

    const cleaned = full.replace(/^好的[，,].*\n/gm, '').replace(/^以下是.*\n/gm, '').trim()
    resultText.value = cleaned || full.trim()
    if (!resultText.value) generateError.value = 'AI 未生成内容，请重试'
  } catch (e: any) {
    generateError.value = '生成失败: ' + (e.message || '请重试')
  } finally {
    generating.value = false
  }
}

// ── Write to Notes ──
async function doApply() {
  if (!resultText.value) return
  applying.value = true

  try {
    const notes = new NotesManager()
    const title = bookTitle.value.trim() || '未命名立项书'
    const note = notes.create(title, '立项书')
    notes.update(note.id, { content: resultText.value })

    msg.success('立项书已写入笔记')
    visible.value = false
    emit('close')
    emit('settings-changed')
  } catch (e: any) {
    msg.error('写入失败: ' + (e.message || ''))
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
/* ── Overlay ── */
.sim-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }

.sim-root { width: 640px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); border: 1px solid rgba(128,128,128,0.15); }

/* ── Themes ── */
.sim-theme-dark { background: #1c1c22; color: #e0e0e0; }
.sim-theme-light { background: #f8f8fa; color: #1a1a1a; }
.sim-theme-light .sim-textarea,
.sim-theme-light .sim-input { background: #fff; color: #1a1a1a; border-color: rgba(0,0,0,0.1); }
.sim-theme-light .sim-result { background: #fff; border-color: rgba(0,0,0,0.08); }

/* ── Header ── */
.sim-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px 4px; flex-shrink: 0; }
.sim-header-left { display: flex; align-items: center; gap: 10px; }
.sim-title { font-size: 18px; font-weight: 700; margin: 0; }
.sim-close { width: 28px; height: 28px; border: none; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; flex-shrink: 0; }
.sim-close:hover { opacity: 1; }
.sim-desc { font-size: 12px; opacity: 0.5; margin: 6px 20px 0; line-height: 1.5; flex-shrink: 0; }

/* ── Body ── */
.sim-body { flex: 1; padding: 16px 20px; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: 14px; }

/* ── Fields ── */
.sim-field { display: flex; flex-direction: column; gap: 6px; }
.sim-label { font-size: 12px; font-weight: 600; opacity: 0.7; }
.sim-input { padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.15); background: rgba(128,128,128,0.04); color: inherit; font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s; }
.sim-input:focus { border-color: rgba(46,168,106,0.4); }
.sim-input::placeholder { opacity: 0.3; }

/* ── Textarea ── */
.sim-textarea { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid rgba(128,128,128,0.12); background: rgba(128,128,128,0.04); color: inherit; font-size: 12px; font-family: inherit; line-height: 1.7; resize: vertical; outline: none; }
.sim-textarea:focus { border-color: rgba(46,168,106,0.3); }
.sim-textarea::placeholder { opacity: 0.3; }
.sim-char-bar { display: flex; justify-content: space-between; font-size: 10px; opacity: 0.4; margin-top: 4px; }
.sim-char-hint { font-style: italic; }

/* ── Progress ── */
.sim-progress-wrap { display: flex; align-items: center; gap: 10px; }
.sim-progress-bar { flex: 1; height: 4px; border-radius: 2px; background: rgba(128,128,128,0.1); overflow: hidden; }
.sim-progress-fill { height: 100%; border-radius: 2px; background: #2ea86a; transition: width 0.3s; }
.sim-progress-label { font-size: 11px; opacity: 0.4; white-space: nowrap; }

/* ── Hint ── */
.sim-hint { font-size: 11px; opacity: 0.35; line-height: 1.5; margin: 0; }

/* ── Section label ── */
.sim-section-label { font-size: 13px; font-weight: 600; opacity: 0.7; }

/* ── Result ── */
.sim-result { padding: 14px; border-radius: 10px; border: 1px solid rgba(128,128,128,0.08); background: rgba(128,128,128,0.03); color: inherit; font-size: 12px; line-height: 1.8; white-space: pre-wrap; font-family: inherit; max-height: 360px; overflow-y: auto; margin: 0; }

/* ── Spinner ── */
.sim-spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(128,128,128,0.15); border-top-color: #2ea86a; border-radius: 50%; animation: sim-spin 0.6s linear infinite; flex-shrink: 0; vertical-align: middle; }
@keyframes sim-spin { to { transform: rotate(360deg); } }
.sim-error { font-size: 11px; color: #e06060; padding: 4px 0; }

/* ── Footer ── */
.sim-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px 16px; border-top: 1px solid rgba(128,128,128,0.06); flex-shrink: 0; }
.sim-footer-left { flex: 1; min-width: 0; }
.sim-gen-status { font-size: 12px; opacity: 0.5; display: flex; align-items: center; gap: 8px; }
.sim-footer-right { display: flex; gap: 8px; flex-shrink: 0; }
.sim-cancel-btn { padding: 8px 20px; border-radius: 10px; border: 1px solid rgba(128,128,128,0.12); background: transparent; color: inherit; font-size: 13px; cursor: pointer; font-family: inherit; opacity: 0.6; }
.sim-cancel-btn:hover { opacity: 1; }
.sim-back-btn { padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(128,128,128,0.12); background: transparent; color: inherit; font-size: 12px; cursor: pointer; font-family: inherit; opacity: 0.5; }
.sim-back-btn:hover { opacity: 1; }
.sim-apply-btn { display: flex; align-items: center; gap: 6px; padding: 8px 22px; border-radius: 10px; border: none; background: #2ea86a; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
.sim-apply-btn:hover:not(:disabled) { opacity: 0.9; }
.sim-apply-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
