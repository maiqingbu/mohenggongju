<template>
  <Teleport to="body">
    <div v-if="visible" class="wcp-overlay" @click.self="visible = false">
      <div class="wcp-root" :class="isDark ? 'wcp-dark' : 'wcp-light'">
        <div class="wcp-header">
          <div>
            <h2 class="wcp-title">设置目标字数</h2>
            <p class="wcp-desc">根据您的目标字数，系统将自动规划分卷结构</p>
          </div>
          <button class="wcp-close" @click="visible = false">✕</button>
        </div>

        <div class="wcp-body">
          <div class="wcp-row">
            <label class="wcp-label">目标字数</label>
            <input type="number" v-model.number="targetWords"
              class="wcp-input" :class="{ highlight: targetWords > 0 }"
              placeholder="请输入目标字数" />
          </div>
          <div class="wcp-row">
            <label class="wcp-label">每章字数</label>
            <input type="number" v-model.number="wordsPerChapter"
              class="wcp-input" placeholder="2000" />
          </div>
          <div class="wcp-row">
            <label class="wcp-label">每卷章节数</label>
            <input type="number" v-model.number="chaptersPerVolume"
              class="wcp-input" placeholder="50" />
          </div>

          <div class="wcp-preview">
            <div class="wcp-preview-title">📊 规划预览</div>
            <ul class="wcp-preview-list">
              <li>总字数：{{ fmt(targetWords) }} 字</li>
              <li>预计分卷：{{ estimatedVolumes }} 卷</li>
              <li>每卷：{{ chaptersPerVolume }} 章 × {{ fmt(wordsPerChapter) }} 字 = {{ fmt(wordsPerVolume) }} 字</li>
              <li>总章节数：{{ totalChapters }} 章</li>
            </ul>
          </div>
        </div>

        <div class="wcp-footer">
          <button class="wcp-btn-cancel" @click="visible = false">取消</button>
          <button class="wcp-btn-confirm" @click="apply">确认</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ isDark?: boolean }>()
const emit = defineEmits<{ (e: 'apply', data: { targetWords: number; wordsPerChapter: number; chaptersPerVolume: number }): void }>()

const visible = ref(false)
const targetWords = ref(1000000)
const wordsPerChapter = ref(2000)
const chaptersPerVolume = ref(50)

const wordsPerVolume = computed(() => wordsPerChapter.value * chaptersPerVolume.value)
const estimatedVolumes = computed(() => wordsPerVolume.value === 0 ? 0 : Math.ceil(targetWords.value / wordsPerVolume.value))
const totalChapters = computed(() => wordsPerChapter.value === 0 ? 0 : Math.ceil(targetWords.value / wordsPerChapter.value))

function fmt(n: number): string {
  return n ? n.toLocaleString() : '0'
}

function apply() {
  emit('apply', {
    targetWords: targetWords.value,
    wordsPerChapter: wordsPerChapter.value,
    chaptersPerVolume: chaptersPerVolume.value,
  })
  visible.value = false
}

function open(existing?: { targetWords?: number; wordsPerChapter?: number; chaptersPerVolume?: number }) {
  if (existing?.targetWords) targetWords.value = existing.targetWords
  if (existing?.wordsPerChapter) wordsPerChapter.value = existing.wordsPerChapter
  if (existing?.chaptersPerVolume) chaptersPerVolume.value = existing.chaptersPerVolume
  visible.value = true
}

defineExpose({ open })
</script>

<style scoped>
.wcp-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; }
.wcp-root { width: 500px; max-width: calc(100vw - 40px); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); }
.wcp-dark { background: #1c1c22; color: #d4d4d4; }
.wcp-light { background: #fff; color: #1a1a1a; }
.wcp-header { padding: 18px 22px; border-bottom: 1px solid rgba(128,128,128,0.1); display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0; }
.wcp-title { font-size: 18px; font-weight: 700; margin: 0; }
.wcp-desc { font-size: 12px; opacity: 0.45; margin: 4px 0 0; }
.wcp-close { width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 16px; opacity: 0.4; }
.wcp-close:hover { opacity: 1; }
.wcp-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.wcp-row { display: flex; align-items: center; gap: 12px; }
.wcp-label { width: 88px; text-align: right; font-size: 13px; font-weight: 500; opacity: 0.7; flex-shrink: 0; }
.wcp-input { flex: 1; padding: 7px 12px; border: 1px solid rgba(128,128,128,0.15); border-radius: 8px; background: transparent; color: inherit; font-size: 13px; font-family: inherit; outline: none; }
.wcp-input:focus { border-color: rgba(46,168,106,0.4); }
.wcp-input.highlight { border-color: rgba(46,168,106,0.4); background: rgba(46,168,106,0.03); }
.wcp-preview { padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(128,128,128,0.1); background: rgba(128,128,128,0.03); font-size: 13px; }
.wcp-preview-title { font-weight: 600; margin-bottom: 8px; }
.wcp-preview-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.wcp-preview-list li { opacity: 0.7; }
.wcp-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px; border-top: 1px solid rgba(128,128,128,0.1); flex-shrink: 0; }
.wcp-btn-cancel { padding: 8px 20px; border: 1px solid rgba(128,128,128,0.15); border-radius: 10px; background: transparent; color: inherit; cursor: pointer; font-size: 13px; font-family: inherit; }
.wcp-btn-cancel:hover { background: rgba(128,128,128,0.04); }
.wcp-btn-confirm { padding: 8px 24px; border: none; border-radius: 10px; background: #1a1a1a; color: #fff; cursor: pointer; font-size: 13px; font-family: inherit; font-weight: 500; }
.wcp-btn-confirm:hover { background: #333; }
.wcp-dark .wcp-btn-confirm { background: #fff; color: #000; }
.wcp-dark .wcp-btn-confirm:hover { background: #e5e5e5; }
</style>
