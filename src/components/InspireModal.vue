<template>
  <Teleport to="body">
    <div v-if="visible" class="ism-overlay" @click.self="visible = false">
      <div class="ism-root" :class="isDark ? 'ism-dark' : 'ism-light'">
        <!-- Header -->
        <div class="ism-header">
          <div>
            <h2 class="ism-title">创作向导</h2>
            <p class="ism-subtitle">选择一种方式开始你的下一部作品</p>
          </div>
          <button class="ism-close" @click="visible = false">✕</button>
        </div>

        <!-- 双卡片 -->
        <div class="ism-cards">
          <!-- 灵感火花 -->
          <div class="ism-card ism-card-spark" :class="{ 'ism-card-disabled': !hasModel }" @click="startAction('spark')">
            <div class="ism-card-glow spark"></div>
            <div class="ism-card-inner">
              <div class="ism-card-icon-wrap spark">
                <span class="ism-card-icon">💡</span>
              </div>
              <h3 class="ism-card-title">灵感火花</h3>
              <p class="ism-card-desc">一步步抽卡式创作：选频道 → 选赛道 → 抽世界观 → 挑人设 → 选金手指 → 生成立项书</p>
              <div class="ism-card-features">
                <span class="ism-card-feat"><i>✦</i> 男频 / 女频定调</span>
                <span class="ism-card-feat"><i>✦</i> AI 抽卡生成方案</span>
                <span class="ism-card-feat"><i>✦</i> 自动写入立项书</span>
              </div>
              <div class="ism-card-action">
                <span v-if="hasModel" class="ism-card-btn spark">开始抽卡 →</span>
                <span v-else class="ism-card-btn-disabled">请先配置 AI 模型</span>
              </div>
            </div>
          </div>

          <!-- 智能导入 -->
          <div class="ism-card ism-card-import" @click="startAction('import')">
            <div class="ism-card-glow import"></div>
            <div class="ism-card-inner">
              <div class="ism-card-icon-wrap import">
                <span class="ism-card-icon">📥</span>
              </div>
              <h3 class="ism-card-title">智能导入立项</h3>
              <p class="ism-card-desc">已有完整想法？直接粘贴你的构思，AI 自动整理成结构化立项书并写入设定</p>
              <div class="ism-card-features">
                <span class="ism-card-feat"><i>✦</i> 粘贴原始灵感文本</span>
                <span class="ism-card-feat"><i>✦</i> 自动补全缺失设定</span>
                <span class="ism-card-feat"><i>✦</i> 一键写入作品数据</span>
              </div>
              <div class="ism-card-action">
                <span class="ism-card-btn import">导入构思 →</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部设置折叠 -->
        <div class="ism-bottom">
          <button class="ism-toggle-settings" @click="showSettings = !showSettings">
            <span class="ism-toggle-arrow" :class="{ open: showSettings }">▸</span>
            创作参数设置
            <span class="ism-toggle-hint" v-if="form.wordCount !== 100 || form.inspiration.trim()">
              （已自定义）
            </span>
          </button>
          <div v-if="showSettings" class="ism-settings-panel">
            <div class="ism-settings-row">
              <label>目标字数</label>
              <div class="ism-counter">
                <button @click="form.wordCount = Math.max(1, form.wordCount - 10)">−</button>
                <input type="number" v-model.number="form.wordCount" class="ism-count-input" />
                <button @click="form.wordCount = Math.min(10000, form.wordCount + 10)">+</button>
                <span class="ism-unit">万字</span>
              </div>
            </div>
            <div class="ism-settings-row">
              <label>创作灵感（可选，会作为上下文参考）</label>
              <textarea class="ism-textarea" v-model="form.inspiration" rows="2" placeholder="随便写点想法，AI 会参考这些内容…"></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useModelStore } from '../stores/modelStore'

defineProps<{ isDark?: boolean }>()
const emit = defineEmits<{
  (e: 'open-wizard', payload: { wordCount: number; inspiration: string }): void
  (e: 'open-smart-import'): void
}>()
const msg = useMessage()
const visible = ref(false)
const showSettings = ref(false)
const hasModel = computed(() => useModelStore().getEnabledProviders().length > 0)

const form = reactive({
  wordCount: 100,
  inspiration: '',
})

function startAction(type: string) {
  if (type === 'spark' && !hasModel.value) {
    msg.warning('灵感火花依赖 AI 生成方案，请先在设置中配置至少一个模型')
    return
  }
  visible.value = false
  if (type === 'spark') {
    emit('open-wizard', { wordCount: form.wordCount, inspiration: form.inspiration })
  } else if (type === 'import') {
    emit('open-smart-import')
  }
}

function open() { visible.value = true }
defineExpose({ open })
</script>

<style scoped>
/* ── 弹窗外壳 ── */
.ism-overlay { position: fixed; inset: 0; z-index: 10010; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px); }
.ism-root { width: 720px; max-width: calc(100vw - 48px); border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 16px 64px rgba(0,0,0,0.35); }
.ism-dark { background: #16161c; color: #d4d4d4; }
.ism-light { background: #f8f8fa; color: #1a1a1a; }

/* ── Header ── */
.ism-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 28px 32px 20px; flex-shrink: 0; }
.ism-title { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.3px; }
.ism-subtitle { font-size: 13px; opacity: 0.35; margin: 6px 0 0; }
.ism-close { width: 36px; height: 36px; border: none; border-radius: 12px; background: transparent; color: inherit; cursor: pointer; font-size: 18px; opacity: 0.25; flex-shrink: 0; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
.ism-close:hover { opacity: 0.7; background: rgba(128,128,128,0.08); }

/* ── 双卡片 ── */
.ism-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 0 32px; }

.ism-card {
  position: relative; border-radius: 18px; cursor: pointer;
  border: 1.5px solid rgba(128,128,128,0.06);
  transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  overflow: hidden;
}
.ism-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.12);
}
.ism-card-spark:hover { border-color: rgba(250,204,21,0.3); }
.ism-card-disabled { opacity: 0.5; cursor: not-allowed; }
.ism-card-disabled:hover { transform: none; box-shadow: none; border-color: rgba(128,128,128,0.06); }
.ism-card-import:hover { border-color: rgba(16,185,129,0.3); }

.ism-card-glow {
  position: absolute; top: -40px; right: -40px;
  width: 160px; height: 160px; border-radius: 50%;
  filter: blur(60px); opacity: 0.15; pointer-events: none;
  transition: opacity 0.3s;
}
.ism-card:hover .ism-card-glow { opacity: 0.25; }
.ism-card-glow.spark { background: #facc15; }
.ism-card-glow.import { background: #10b981; }

.ism-card-inner { position: relative; padding: 28px 24px 24px; display: flex; flex-direction: column; min-height: 260px; }

.ism-card-icon-wrap {
  width: 52px; height: 52px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 16px;
}
.ism-card-icon-wrap.spark { background: rgba(250,204,21,0.1); }
.ism-card-icon-wrap.import { background: rgba(16,185,129,0.1); }
.ism-card-icon { font-size: 26px; }

.ism-card-title { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
.ism-card-desc { font-size: 12.5px; opacity: 0.45; line-height: 1.7; margin: 0 0 18px; flex: 1; }

.ism-card-features { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
.ism-card-feat { font-size: 11.5px; opacity: 0.5; display: flex; align-items: center; gap: 6px; }
.ism-card-feat i { font-style: normal; font-size: 8px; opacity: 0.4; }
.ism-card-spark .ism-card-feat i { color: #f59e0b; }
.ism-card-import .ism-card-feat i { color: #10b981; }

.ism-card-action { margin-top: auto; }
.ism-card-btn {
  display: inline-block; padding: 10px 28px; border-radius: 12px;
  font-size: 14px; font-weight: 600; font-family: inherit;
  color: #fff; transition: all 0.15s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}
.ism-card-btn.spark { background: linear-gradient(135deg, #f59e0b, #d97706); }
.ism-card-btn.spark:hover { box-shadow: 0 4px 20px rgba(245,158,11,0.3); transform: translateY(-1px); }
.ism-card-btn.import { background: linear-gradient(135deg, #10b981, #059669); }
.ism-card-btn.import:hover { box-shadow: 0 4px 20px rgba(16,185,129,0.3); transform: translateY(-1px); }
.ism-card-btn-disabled {
  display: inline-block; padding: 10px 28px; border-radius: 12px;
  font-size: 13px; font-weight: 500; font-family: inherit;
  background: rgba(128,128,128,0.1); color: rgba(128,128,128,0.5);
  cursor: not-allowed;
}

/* ── 底部设置 ── */
.ism-bottom { padding: 16px 32px 24px; }

.ism-toggle-settings {
  display: flex; align-items: center; gap: 6px;
  padding: 0; border: none; background: none;
  color: inherit; cursor: pointer; font-size: 12px;
  font-family: inherit; opacity: 0.35; transition: opacity 0.15s;
}
.ism-toggle-settings:hover { opacity: 0.6; }
.ism-toggle-arrow { font-size: 10px; transition: transform 0.2s; display: inline-block; }
.ism-toggle-arrow.open { transform: rotate(90deg); }
.ism-toggle-hint { opacity: 0.6; }

.ism-settings-panel {
  margin-top: 12px; padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(128,128,128,0.06);
  background: rgba(128,128,128,0.02);
}
.ism-settings-row { margin-bottom: 12px; }
.ism-settings-row:last-child { margin-bottom: 0; }
.ism-settings-row label { display: block; font-size: 12px; font-weight: 500; opacity: 0.5; margin-bottom: 8px; }

.ism-counter { display: flex; align-items: center; gap: 8px; }
.ism-counter button {
  width: 30px; height: 30px; border: 1px solid rgba(128,128,128,0.12); border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; transition: all 0.15s;
}
.ism-counter button:hover { background: rgba(128,128,128,0.06); border-color: rgba(128,128,128,0.2); }
.ism-count-input {
  width: 72px; padding: 6px 8px; border: 1px solid rgba(128,128,128,0.12); border-radius: 8px;
  background: transparent; color: inherit; font-size: 14px; font-family: inherit;
  text-align: center; outline: none;
}
.ism-count-input:focus { border-color: rgba(46,168,106,0.3); }
.ism-unit { font-size: 12px; opacity: 0.4; }

.ism-textarea {
  width: 100%; padding: 10px 12px;
  border: 1px solid rgba(128,128,128,0.08); border-radius: 10px;
  background: rgba(128,128,128,0.02); color: inherit;
  font-size: 12.5px; font-family: inherit; outline: none;
  resize: vertical; min-height: 48px; box-sizing: border-box;
}
.ism-textarea:focus { border-color: rgba(46,168,106,0.3); }
.ism-textarea::placeholder { opacity: 0.2; }
</style>
