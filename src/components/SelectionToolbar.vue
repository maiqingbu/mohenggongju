<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="st-root"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      :class="isDark ? 'st-dark' : 'st-light'"
      @mousedown.prevent
    >
      <button class="st-btn" @click="$emit('copy')" title="复制">📋</button>
      <button class="st-btn" @click="$emit('highlight')" title="高亮">🖍</button>
      <button class="st-btn" :class="{ disabled: !hasHighlight }" @click="hasHighlight && $emit('unhighlight')" title="取消高亮">✂</button>
      <span class="st-sep"></span>
      <button class="st-btn st-label" @click="$emit('rewrite')" title="改写">改写</button>
      <button class="st-btn st-label" @click="$emit('expand')" title="扩写">扩写</button>
      <button class="st-btn st-label" @click="$emit('continue')" title="续写">续写</button>
      <button class="st-btn st-label" @click="$emit('summarize')" title="总结">总结</button>
      <span class="st-sep"></span>
      <button class="st-btn st-label" :class="{ disabled: true }" title="添加到对话（即将接入）">+对话</button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

defineProps<{ isDark?: boolean }>()
defineEmits<{
  (e: 'copy'): void
  (e: 'highlight'): void
  (e: 'unhighlight'): void
  (e: 'rewrite'): void
  (e: 'expand'): void
  (e: 'continue'): void
  (e: 'summarize'): void
  (e: 'addToChat'): void
}>()

const visible = ref(false)
const pos = ref({ x: 0, y: 0 })
const hasHighlight = ref(false)

function show(x: number, y: number, highlighted: boolean) {
  pos.value = { x: Math.min(x, window.innerWidth - 360), y: Math.max(y - 48, 8) }
  hasHighlight.value = highlighted
  visible.value = true
}

function hide() { visible.value = false }

// F10: 滚动/窗口大小变化时隐藏工具栏（fixed 定位坐标已失效）
function onScrollOrResize() {
  if (visible.value) hide()
}

onMounted(() => {
  window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true })
  window.addEventListener('resize', onScrollOrResize)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScrollOrResize, { capture: true })
  window.removeEventListener('resize', onScrollOrResize)
})

defineExpose({ show, hide })
</script>

<style scoped>
.st-root {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  backdrop-filter: blur(12px);
  user-select: none;
  font-size: 12px;
}
.st-dark { background: rgba(30,30,40,0.92); color: #d4d4d4; border: 1px solid rgba(255,255,255,0.08); }
.st-light { background: rgba(255,255,255,0.92); color: #333; border: 1px solid rgba(0,0,0,0.08); }
.st-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 28px; height: 28px; padding: 0 6px;
  border: none; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer;
  font-size: 13px; font-family: inherit;
  transition: background 0.15s;
}
.st-btn:hover { background: rgba(128,128,128,0.12); }
.st-btn.disabled { opacity: 0.25; pointer-events: none; }
.st-label { font-size: 11px; font-weight: 500; }
.st-sep { width: 1px; height: 18px; background: rgba(128,128,128,0.2); margin: 0 4px; }
</style>
