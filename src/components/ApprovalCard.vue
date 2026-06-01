<template>
  <div class="ac-card" :class="{ 'ac-decided': card.status === 'decided', 'ac-superseded': card.status === 'superseded' }">
    <!-- 已决策：折叠态 -->
    <div v-if="card.status === 'decided'" class="ac-collapsed" @click="expanded = !expanded">
      <span class="ac-collapsed-badge">{{ decisionBadge }}</span>
      <span class="ac-collapsed-text">{{ card.agentName }} · {{ stepSummary }}</span>
      <span class="ac-collapsed-meta" v-if="card.decision?.diffSummary">{{ card.decision.diffSummary }}</span>
      <span class="ac-expand-hint">{{ expanded ? '收起' : '展开' }}</span>
    </div>

    <!-- 展开态 -->
    <div v-if="card.status !== 'decided' || expanded">
      <div class="ac-header">
        <span class="ac-icon">📋</span>
        <div>
          <div class="ac-agent">{{ card.agentName }} · {{ stepLabel }}</div>
          <div class="ac-hint" v-if="card.warnings?.length">
            ⚠️ {{ card.warnings.length }} 条提醒
          </div>
        </div>
        <span v-if="card.status === 'streaming'" class="ac-badge streaming">生成中</span>
        <span v-else-if="card.status === 'pending'" class="ac-badge pending">待审阅</span>
      </div>

      <!-- 重做次数警告 -->
      <div v-if="card.attemptCount >= card.maxAttempts - 1 && card.status === 'pending'" class="ac-warn-banner">
        ⚠️ 重做次数即将达到上限（{{ card.attemptCount }}/{{ card.maxAttempts }}），建议修改提示词或更换 Agent
      </div>

      <!-- 输出内容区 -->
      <div class="ac-output" v-if="!editing">
        <pre class="ac-pre">{{ outputText }}</pre>
        <button class="ac-expand-btn" v-if="outputText.length > 500 && !outputExpanded" @click="outputExpanded = true">展开全部 ({{ outputText.length }} 字)</button>
        <button class="ac-expand-btn" v-else-if="outputText.length > 500" @click="outputExpanded = false">收起</button>
      </div>

      <!-- 编辑模式 -->
      <textarea v-if="editing" v-model="editText" class="ac-textarea" rows="8"></textarea>

      <!-- 设定 Diff 视图 (R8) -->
      <div v-if="(card.output as any)?.diffs" class="ac-diff-section">
        <SettingsDiffView :diffs="(card.output as any).diffs" />
      </div>

      <!-- 一致性警告 -->
      <div v-if="card.warnings?.length" class="ac-warnings">
        <div v-for="(w, i) in card.warnings" :key="i" class="ac-warning-item" :class="'ac-' + w.level.toLowerCase()">
          <span class="ac-warn-level">{{ w.level === 'ERROR' ? '❌' : '⚠️' }}</span>
          <span>{{ w.message }}</span>
        </div>
      </div>

      <!-- 操作按钮（pending 状态） -->
      <div v-if="card.status === 'pending'" class="ac-actions">
        <button class="ac-btn approve" @click="$emit('decide', { type: 'approve' })">✓ 通过</button>
        <button class="ac-btn edit" v-if="!editing" @click="startEdit">✎ 编辑</button>
        <button class="ac-btn approve" v-if="editing" @click="submitEdit">✓ 编辑后通过</button>
        <button class="ac-btn cancel" v-if="editing" @click="editing = false">取消编辑</button>
        <button class="ac-btn redo" v-if="!editing" @click="$emit('decide', { type: 'redo' })">↻ 重做</button>
        <div class="ac-redo-feedback" v-if="!editing">
          <input class="ac-feedback-input" v-model="feedback" placeholder="加一句反馈再重做（可选）" @keydown.enter="submitEditRedo" />
          <button class="ac-btn redo" v-if="feedback" @click="submitEditRedo">✎ 改后重做</button>
        </div>
        <button v-if="card.options.includes('skip')" class="ac-btn skip" @click="$emit('decide', { type: 'skip' })">⤼ 跳过</button>
        <button class="ac-btn abort" @click="$emit('decide', { type: 'abort' })">⊘ 中止</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ApprovalCardData, Decision } from '../agents/types'
import SettingsDiffView from './SettingsDiffView.vue'

const props = defineProps<{ card: ApprovalCardData }>()
const emit = defineEmits<{ (e: 'decide', d: Decision): void }>()

const expanded = ref(false)
const editing = ref(false)
const editText = ref('')
const feedback = ref('')
const outputExpanded = ref(false)

const outputText = computed(() => {
  if (typeof props.card.output === 'string') return props.card.output
  return JSON.stringify(props.card.output, null, 2)
})

const stepLabel = computed(() => {
  const raw = props.card.output
  if (raw?.chapterTitle) return `章纲：${raw.chapterTitle}`
  if (raw?.content) return `正文 (${String(raw.content).length} 字)`
  return ''
})

const stepSummary = computed(() => {
  const raw = props.card.output
  if (raw?.chapterTitle) return raw.chapterTitle as string
  if (raw?.content) return (raw.content as string).slice(0, 50) + '…'
  return '已处理'
})

const decisionIcon = computed(() => {
  switch (props.card.decision?.type) {
    case 'approve': return '✓'
    case 'edit_approve': return '✓✎'
    case 'redo': return '↻'
    case 'skip': return '⤼'
    case 'abort': return '⊘'
    default: return '✓'
  }
})

const decisionBadge = computed(() => {
  switch (props.card.decision?.type) {
    case 'approve': return '已完成'
    case 'edit_approve': return '已编辑通过'
    case 'redo': return '已重做'
    case 'edit_redo': return '已反馈重做'
    case 'skip': return '已跳过'
    case 'abort': return '已中止'
    default: return '已完成'
  }
})

function startEdit() {
  editText.value = outputText.value
  editing.value = true
}

function submitEdit() {
  const diff = editText.value.length - outputText.value.length
  const diffSummary = diff > 0 ? `用户编辑后通过 · 增加了 ${diff} 字` : diff < 0 ? `用户编辑后通过 · 删减了 ${-diff} 字` : '用户编辑后通过 · 未改动'
  emit('decide', {
    type: 'edit_approve',
    editedContent: editText.value,
    diffSummary,
  })
  editing.value = false
}

function submitEditRedo() {
  emit('decide', {
    type: 'edit_redo',
    feedback: feedback.value,
  })
  feedback.value = ''
}
</script>

<style scoped>
.ac-card {
  background: #fffbf2;
  border: 1px solid #f3e8d6;
  border-radius: 14px;
  padding: 14px;
  margin: 8px 0;
  font-size: 13px;
}
.ac-decided { opacity: 0.7; background: #fafaf5; }
.ac-superseded { opacity: 0.4; }

.ac-collapsed { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ac-collapsed-icon { font-size: 14px; }
.ac-collapsed-badge {
  font-size: 10px; padding: 1px 7px; border-radius: 8px;
  background: #d1fae5; color: #065f46; font-weight: 600; white-space: nowrap;
}
.ac-collapsed-text { font-weight: 600; flex: 1; }
.ac-collapsed-meta { font-size: 11px; color: #9ca3af; }
.ac-expand-hint { font-size: 11px; color: #d1d5db; }

.ac-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; }
.ac-icon { font-size: 18px; }
.ac-agent { font-weight: 700; }
.ac-hint { font-size: 11px; color: #f59e0b; margin-top: 2px; }
.ac-badge { font-size: 10px; padding: 2px 8px; border-radius: 8px; margin-left: auto; }
.ac-badge.pending { background: #fef3c7; color: #92400e; }
.ac-badge.streaming { background: #dbeafe; color: #1e40af; }

.ac-warn-banner {
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
  padding: 6px 10px; font-size: 11px; color: #991b1b; margin-bottom: 8px;
}

.ac-pre {
  white-space: pre-wrap; word-break: break-word;
  max-height: 300px; overflow-y: auto;
  background: #fff; padding: 10px; border-radius: 8px;
  font-size: 12px; line-height: 1.7; margin: 0;
  color: #4a4a4a; border: 1px solid #f3e8d6;
}
.ac-expand-btn {
  display: block; margin: 4px auto 0;
  border: none; background: none; color: #d97706;
  cursor: pointer; font-size: 11px; font-family: inherit;
}

.ac-textarea {
  width: 100%; padding: 10px; border: 1px solid #f3e8d6; border-radius: 8px;
  background: #fff; color: #4a4a4a; font-size: 12px; font-family: inherit;
  resize: vertical; box-sizing: border-box;
}

.ac-warnings { margin: 8px 0; display: flex; flex-direction: column; gap: 4px; }
.ac-warning-item { font-size: 11px; padding: 4px 8px; border-radius: 6px; display: flex; gap: 6px; align-items: flex-start; }
.ac-warning-item.ac-error { background: #fef2f2; color: #991b1b; }
.ac-warning-item.ac-warning { background: #fffbeb; color: #92400e; }

.ac-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; align-items: center; }
.ac-btn { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; color: #4b5563; cursor: pointer; font-size: 12px; font-family: inherit; }
.ac-btn:hover { background: #f9fafb; }
.ac-btn.approve { background: #10b981; color: #fff; border-color: #10b981; }
.ac-btn.approve:hover { background: #059669; }
.ac-btn.edit { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.ac-btn.redo { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }
.ac-btn.skip { color: #6b7280; }
.ac-btn.abort { color: #ef4444; border-color: #fecaca; }
.ac-btn.abort:hover { background: #fef2f2; }
.ac-btn.cancel { color: #6b7280; }

.ac-redo-feedback { display: flex; gap: 4px; flex: 1; min-width: 200px; }
.ac-feedback-input {
  flex: 1; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 8px;
  font-size: 11px; font-family: inherit; outline: none;
}
.ac-feedback-input:focus { border-color: #93c5fd; }
</style>
