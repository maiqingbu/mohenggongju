<template>
  <div class="settings-overlay" :class="{ 'ms-dark': isDark, 'ms-light': !isDark }" @click.self="$emit('close')">
    <div class="settings-panel" :class="{ 'ms-dark': isDark, 'ms-light': !isDark }">
      <div class="settings-header">
        <div class="ms-tabs">
          <button class="ms-tab" :class="{ active: activeTab === 'model' }" @click="activeTab = 'model'">大模型</button>
          <button class="ms-tab" :class="{ active: activeTab === 'editor' }" @click="activeTab = 'editor'">编辑器</button>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- Tab: 大模型 -->
      <div v-show="activeTab === 'model'" class="settings-body">
        <section v-for="p in store.builtInProviders" :key="p.id" class="provider-card" :class="{ enabled: p.enabled }">
          <div class="provider-header">
            <n-switch :value="p.enabled" @update:value="(v: boolean) => store.toggleProvider(p.id, v)" size="small" />
            <span class="provider-name">{{ p.name }}</span>
            <span class="provider-url">{{ p.baseUrl }}</span>
            <n-tag size="tiny" :type="getParamCompat(p.id) === 'anthropic' ? 'warning' : getParamCompat(p.id) === 'gemini' ? 'info' : 'default'" style="margin-left:6px">
              {{ getParamCompat(p.id) === 'anthropic' ? 'Anthropic 协议' : getParamCompat(p.id) === 'gemini' ? 'Gemini 协议' : 'OpenAI 兼容' }}
            </n-tag>
            <n-button v-if="p.enabled" size="tiny" :loading="testingProvider === p.id" :disabled="testingProvider !== null" @click="testConn(p.id)" style="margin-left:auto">测试连通</n-button>
          </div>
          <div v-if="p.enabled" class="provider-body">
            <div class="field-row">
              <label>API Key</label>
              <n-input size="tiny" type="password" placeholder="输入 API Key" style="flex:1"
                :value="store.getBuiltInApiKeySync(p.id)" @update:value="(v: string) => store.setBuiltInApiKey(p.id, v)" />
              <n-tag v-if="store.hasApiKeyConfigured(p.id)" size="tiny" type="success">已配置</n-tag>
            </div>
            <div class="field-row">
              <label>默认模型</label>
              <n-select size="tiny" style="width:200px" :value="p.defaultModelId"
                :options="p.models.map(m => ({ label: `${m.name} (${formatContext(m.contextLength)} ctx${m.supportsThink ? ' 🧠' : ''})`, value: m.id }))"
                @update:value="(v: string) => store.setDefaultModel(p.id, v)" />
            </div>
            <div class="model-versions">
              <div v-for="m in p.models" :key="m.id" class="model-row">
                <span class="model-name">{{ m.name }}</span>
                <span class="model-meta">{{ formatContext(m.contextLength) }} · ¥{{ m.pricing.inputPerKTokens }}/{{ m.pricing.outputPerKTokens }} per K</span>
                <n-tag v-if="m.supportsThink" size="tiny" type="info">🧠 Think</n-tag>
              </div>
            </div>
            <!-- 采样参数 -->
            <div class="sampling-section">
              <div class="sampling-header" @click="toggleSamplingExpand(p.id)">
                <span class="sampling-toggle">{{ expandedSampling.has(p.id) ? '▼' : '▶' }} 采样参数</span>
                <n-button v-if="store.samplingOverrides[p.id]" size="tiny" text type="warning" @click.stop="store.resetSampling(p.id)">重置默认</n-button>
              </div>
              <div v-if="expandedSampling.has(p.id)" class="sampling-body">
                <template v-for="paramKey in getSupportedParams(getParamCompat(p.id))" :key="paramKey">
                  <div v-if="paramKey !== 'stop'" class="sampling-row">
                    <label :title="paramHint(paramKey)">{{ formatParamLabel(paramKey) }}</label>
                    <input type="range" class="eds-range"
                      :min="paramRange(paramKey).min" :max="paramRange(paramKey).max" :step="paramRange(paramKey).step"
                      :value="getSamplingValue(p.id, paramKey) ?? 0"
                      @input="setSamplingSlider(p.id, paramKey, Number(($event.target as HTMLInputElement).value))" />
                    <span class="sampling-val">{{ (getSamplingValue(p.id, paramKey) as number ?? 0).toFixed(paramKey === 'topK' || paramKey === 'maxTokens' ? 0 : 2) }}</span>
                    <button class="param-reset-btn" title="重置为默认值"
                      @click="store.resetSamplingParam(p.id, paramKey)">↺</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>
        <section class="provider-card">
          <div class="provider-header">
            <span class="provider-name" style="opacity:0.6">🔧 自定义模型</span>
            <n-tag size="tiny" type="default" style="margin-left:6px">OpenAI 兼容</n-tag>
            <n-button size="tiny" @click="showAddCustom = true" style="margin-left:auto">+ 添加</n-button>
          </div>
          <div v-for="cp in store.customProviders" :key="cp.id" class="custom-card">
            <div class="custom-row">
              <div class="custom-info">
                <span class="custom-name">{{ cp.name }}</span><span class="custom-url">{{ cp.baseUrl }}</span>
                <span class="custom-model">{{ cp.modelId }}</span>
                <n-tag v-if="cp.supportsThink" size="tiny" type="info">🧠</n-tag>
              </div>
              <n-button size="tiny" :loading="testingProvider === cp.id" :disabled="testingProvider !== null" @click="testConn(cp.id)">测试</n-button>
              <n-switch :value="cp.enabled" @update:value="(v: boolean) => store.toggleCustomProvider(cp.id, v)" size="small" />
              <n-button size="tiny" type="error" text @click="store.removeCustomProvider(cp.id)">删除</n-button>
            </div>
            <!-- 自定义模型采样参数 -->
            <div class="sampling-section" style="margin-left:0">
              <div class="sampling-header" @click="toggleSamplingExpand(cp.id)">
                <span class="sampling-toggle">{{ expandedSampling.has(cp.id) ? '▼' : '▶' }} 采样参数</span>
                <n-button v-if="store.samplingOverrides[cp.id]" size="tiny" text type="warning" @click.stop="store.resetSampling(cp.id)">重置默认</n-button>
              </div>
              <div v-if="expandedSampling.has(cp.id)" class="sampling-body">
                <template v-for="paramKey in getSupportedParams('openai')" :key="paramKey">
                  <div v-if="paramKey !== 'stop'" class="sampling-row">
                    <label :title="paramHint(paramKey)">{{ formatParamLabel(paramKey) }}</label>
                    <input type="range" class="eds-range"
                      :min="paramRange(paramKey).min" :max="paramRange(paramKey).max" :step="paramRange(paramKey).step"
                      :value="getSamplingValue(cp.id, paramKey) ?? 0"
                      @input="setSamplingSlider(cp.id, paramKey, Number(($event.target as HTMLInputElement).value))" />
                    <span class="sampling-val">{{ (getSamplingValue(cp.id, paramKey) as number ?? 0).toFixed(paramKey === 'topK' || paramKey === 'maxTokens' ? 0 : 2) }}</span>
                    <button class="param-reset-btn" title="重置为默认值"
                      @click="store.resetSamplingParam(cp.id, paramKey)">↺</button>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Tab: 编辑器 -->
      <div v-show="activeTab === 'editor'" class="settings-body editor-tab">
        <!-- 左右分栏 -->
        <div class="et-columns">
          <!-- 左栏：字体排版 + 提示音 -->
          <div class="et-left">
            <div class="eds-section">
              <p class="eds-section-title"><span class="et-icon">T</span> 字体与排版</p>
              <div class="eds-preview" :style="{ fontFamily: s.fontFamily, fontSize: s.fontSize + 'px', lineHeight: s.lineHeight }">
                <p>林默低声说："这次我们不退。"</p>
                <p>风掠过窗纸，案上的设定稿与角色卡散成一片，正适合检视字体与夜间阅读效果。</p>
              </div>
              <div class="eds-row"><label>字体</label>
                <select class="eds-select" :value="s.fontFamily" @change="onEdsChange('fontFamily', ($event.target as HTMLSelectElement).value)">
                  <option v-for="f in fontOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
                </select>
              </div>
              <div class="eds-row"><label>正文字号</label><span class="et-val">{{ s.fontSize }}px</span></div>
              <input type="range" class="eds-range" :min="12" :max="24" :value="s.fontSize" @input="onEdsChange('fontSize', Number(($event.target as HTMLInputElement).value))" />
              <div class="eds-row"><label>行间距</label><span class="et-val">{{ s.lineHeight.toFixed(2) }}</span></div>
              <input type="range" class="eds-range" min="1.0" max="2.0" step="0.05" :value="s.lineHeight" @input="onEdsChange('lineHeight', Number(($event.target as HTMLInputElement).value))" />
            </div>

            <!-- 生成提示音 -->
            <div class="eds-section">
              <p class="eds-section-title">🔔 生成提示音</p>
              <div class="eds-row"><label>音量</label><span class="et-val">{{ s.soundVolume }}%</span></div>
              <input type="range" class="eds-range" min="0" max="100" :value="s.soundVolume" @input="onEdsChange('soundVolume', Number(($event.target as HTMLInputElement).value))" />
              <div style="margin-top:8px">
                <n-button size="tiny" @click="testPlaySound">试听</n-button>
              </div>
            </div>
          </div>

          <!-- 右栏：语法高亮 -->
          <div class="et-right">
            <div class="eds-section">
              <p class="eds-section-title">&lt;/&gt; 语法高亮</p>

              <div v-for="rule in syntaxRules" :key="rule.key" class="et-hl-card">
                <div class="et-hl-header">
                  <div>
                    <span class="et-hl-label">{{ rule.label }}</span>
                    <span class="et-hl-badge">预览</span>
                  </div>
                  <button class="eds-switch" :class="{on:rule.enabled}" @click="rule.enabled=!rule.enabled;saveSyntaxRules()"><span class="eds-switch-knob" :class="{on:rule.enabled}"></span></button>
                </div>
                <p class="eds-hint">{{ rule.desc }}</p>
                <div class="et-color-grid">
                  <button v-for="c in syntaxColors" :key="c" class="et-color-btn" :class="{active:rule.color===c}" :style="{background:c}" @click="rule.color=c;saveSyntaxRules()" :title="c">
                    <span v-if="rule.color===c" class="et-check">✓</span>
                  </button>
                </div>
                <div v-if="rule.type === 'regex' && rule.key !== 'custom_regex'" class="et-regex-row">
                  <input class="et-regex-input" :value="rule.pattern" @change="rule.pattern=($event.target as HTMLInputElement).value;saveSyntaxRules()" placeholder="正则表达式" />
                </div>
              </div>

              <!-- 自定义正则 -->
              <div class="et-hl-card">
                <div class="et-hl-header">
                  <span class="et-hl-label">自定义正则</span>
                  <span class="eds-hint">{{ customRegexList.length }} 条</span>
                </div>
                <p class="eds-hint">可用逗号或换行批量添加，和"高频词高亮"分开保存，互不覆盖。</p>
                <div style="display:flex;gap:6px;margin:8px 0">
                  <input class="et-regex-input" v-model="newRegexPattern" placeholder="例如：第\\d+章|灵根|筑基" @keydown.enter="addCustomRegex" style="flex:1" />
                  <button class="et-add-btn" @click="addCustomRegex">添加</button>
                </div>
                <div v-if="!customRegexList.length" class="eds-hint" style="text-align:center;padding:20px">暂无自定义正则</div>
                <div v-for="cr in customRegexList" :key="cr.id" class="et-cr-row">
                  <code class="et-cr-pattern">{{ cr.pattern }}</code>
                  <button v-for="c in syntaxColors" :key="c" class="et-color-dot" :class="{active:cr.color===c}" :style="{background:c}" @click="cr.color=c;saveCustomRegex()" :title="c"></button>
                  <button class="et-cr-del" @click="customRegexList=customRegexList.filter(r=>r.id!==cr.id);saveCustomRegex()">✕</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加自定义模型弹窗 -->
    <div v-if="showAddCustom" class="modal-overlay" @click.self="showAddCustom = false">
      <div class="modal-box"><h3>添加自定义模型</h3>
        <div class="field-row"><label>名称</label><n-input v-model:value="customForm.name" size="tiny" placeholder="我的模型" /></div>
        <div class="field-row"><label>Base URL</label><n-input v-model:value="customForm.baseUrl" size="tiny" placeholder="https://api.example.com/v1" /></div>
        <div class="field-row"><label>API Key</label><n-input v-model:value="customForm.apiKey" size="tiny" type="password" placeholder="sk-..." /></div>
        <div class="field-row"><label>Model ID</label><n-input v-model:value="customForm.modelId" size="tiny" placeholder="model-name" /></div>
        <div class="field-row"><label>上下文长度</label><n-input-number v-model:value="customForm.contextLength" size="tiny" :min="1000" :step="1000" style="width:160px" /></div>
        <div class="field-row"><label>支持 Think</label><n-switch v-model:value="customForm.supportsThink" size="small" /></div>
        <div class="modal-actions"><n-button size="small" @click="showAddCustom = false">取消</n-button><n-button size="small" type="primary" @click="addCustom">确认添加</n-button></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { NSwitch, NInput, NInputNumber, NSelect, NButton, NTag, useMessage } from 'naive-ui'
import { useModelStore, getParamCompat, getSupportedParams } from '../stores/modelStore'
import type { SamplingParams } from '../stores/modelStore'
import { useSyntaxHighlight, HIGHLIGHT_COLORS } from '../composables/useSyntaxHighlight'
import type { SyntaxRule } from '../composables/useSyntaxHighlight'
import { useEditorSettings, playNotifySound } from '../composables/useEditorSettings'

const props = defineProps<{ isDark?: boolean }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'settings-changed', s: any): void
}>()

const store = useModelStore()
const message = useMessage()
const { load: loadRules, save: saveRules, loadCustomRegexRules } = useSyntaxHighlight()
const activeTab = ref<'model' | 'editor'>('model')
const showAddCustom = ref(false)
const expandedSampling = ref<Set<string>>(new Set())

function toggleSamplingExpand(providerId: string) {
  if (expandedSampling.value.has(providerId)) {
    expandedSampling.value.delete(providerId)
  } else {
    expandedSampling.value.add(providerId)
  }
}

function getSamplingValue(providerId: string, key: keyof SamplingParams): number | string[] | undefined {
  return store.getSampling(providerId)[key]
}

function setSamplingSlider(providerId: string, key: keyof SamplingParams, value: number) {
  store.setSamplingOverride(providerId, { [key]: value })
}

function formatParamLabel(key: string): string {
  const labels: Record<string, string> = {
    temperature: '创意温度',
    topP: '核采样',
    topK: 'Top K 采样',
    frequencyPenalty: '频率惩罚',
    presencePenalty: '主题惩罚',
    maxTokens: '最大输出',
    stop: '停止序列',
  }
  return labels[key] || key
}

function paramHint(key: string): string {
  const hints: Record<string, string> = {
    temperature: '低=严谨 高=创意',
    topP: '累积概率阈值',
    topK: '仅取前 K 个候选',
    frequencyPenalty: '抑制重复用词',
    presencePenalty: '鼓励新话题',
    maxTokens: '单次最大输出 token',
  }
  return hints[key] || ''
}

// 连通测试
const testingProvider = ref<string | null>(null)
async function testConn(providerId: string) {
  testingProvider.value = providerId
  const result = await store.testConnection(providerId)
  if (result.ok) {
    message.success(result.message)
  } else {
    message.error(result.message)
  }
  testingProvider.value = null
}

function paramRange(key: string): { min: number; max: number; step: number } {
  switch (key) {
    case 'temperature': return { min: 0, max: 2, step: 0.05 }
    case 'topP': return { min: 0, max: 1, step: 0.05 }
    case 'topK': return { min: 1, max: 100, step: 1 }
    case 'frequencyPenalty': return { min: -2, max: 2, step: 0.1 }
    case 'presencePenalty': return { min: -2, max: 2, step: 0.1 }
    case 'maxTokens': return { min: 256, max: 65536, step: 256 }
    default: return { min: 0, max: 1, step: 0.1 }
  }
}
const syntaxRules = ref<SyntaxRule[]>(loadRules())
const syntaxColors = HIGHLIGHT_COLORS
const customRegexList = ref<{id:string;pattern:string;color:string}[]>(loadCustomRegexRules())
const newRegexPattern = ref('')

function saveSyntaxRules() { saveRules(syntaxRules.value) }
function saveCustomRegex() {
  const rules = customRegexList.value.map(r => ({ id: r.id, pattern: r.pattern, color: r.color }))
  localStorage.setItem('ns:customRegexRules', JSON.stringify(rules))
}
function addCustomRegex() {
  const patterns = newRegexPattern.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  for (const p of patterns) {
    try { new RegExp(p) } catch { message.warning(`无效正则: ${p}`); continue }
    customRegexList.value.push({ id: 'rx-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), pattern: p, color: syntaxRules.value.find(r => r.key === 'custom_regex')?.color || '#fb923c' })
  }
  newRegexPattern.value = ''
  saveCustomRegex()
}

const customForm = reactive({ name: '', baseUrl: '', apiKey: '', modelId: '', supportsThink: false, contextLength: 128000 })
function addCustom() {
  if (!customForm.name || !customForm.baseUrl || !customForm.apiKey || !customForm.modelId) { message.warning('请填写所有必填字段'); return }
  store.addCustomProvider({ ...customForm }); message.success('自定义模型已添加'); showAddCustom.value = false
  Object.assign(customForm, { name: '', baseUrl: '', apiKey: '', modelId: '', supportsThink: false, contextLength: 128000 })
}
function formatContext(n: number): string { if (n >= 1000000) return Math.round(n / 1000000) + 'M'; if (n >= 1000) return Math.round(n / 1000) + 'k'; return String(n) }

// 编辑器设置（composable）
const { settings: s, fontOptions, update: updateEds } = useEditorSettings()

function onEdsChange(key: string, value: any) {
  updateEds({ [key]: value })
  emit('settings-changed', { ...s })
}

function testPlaySound() {
  playNotifySound()
}

defineExpose({ openEditorTab: () => { activeTab.value = 'editor' } })
</script>

<style scoped>
.settings-overlay { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.settings-panel { width: 700px; max-height: 80vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
.ms-dark { background: #1c1c22; color: #d4d4d4; }
.ms-light { background: #f5f5f5; color: #1a1a1a; }
/* overlay 自身保持半透明背景 */
.settings-overlay.ms-dark { background: rgba(0,0,0,0.6); }
.settings-overlay.ms-light { background: rgba(0,0,0,0.3); }
.settings-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; border-bottom: 1px solid rgba(128,128,128,0.1); }
.ms-tabs { display: flex; gap: 4px; background: rgba(128,128,128,0.06); border-radius: 10px; padding: 3px; }
.ms-tab { padding: 5px 18px; border: none; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; font-family: inherit; opacity: 0.5; }
.ms-tab.active { background: rgba(46,168,106,0.15); color: #2ea86a; opacity: 1; font-weight: 600; }
.close-btn { background: none; border: none; cursor: pointer; color: inherit; opacity: 0.5; font-size: 18px; }
.settings-body { flex: 1; overflow-y: auto; padding: 16px 20px; }

.provider-card { margin-bottom: 12px; padding: 12px; border-radius: 8px; background: rgba(128,128,128,0.04); border: 1px solid rgba(128,128,128,0.1); }
.provider-card.enabled { border-color: rgba(82,200,160,0.3); }
.provider-header { display: flex; align-items: center; gap: 10px; }
.provider-name { font-weight: 600; font-size: 14px; min-width: 120px; }
.provider-url { font-size: 11px; opacity: 0.3; }
.provider-body { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(128,128,128,0.06); }
.field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.field-row label { font-size: 12px; opacity: 0.5; min-width: 70px; }
.model-versions { margin-top: 8px; }
.model-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 12px; }
.model-name { font-weight: 600; min-width: 80px; }
.model-meta { opacity: 0.4; flex: 1; }
.custom-card { padding: 8px 0; border-bottom: 1px solid rgba(128,128,128,0.04); }
.custom-row { display: flex; align-items: center; gap: 10px; }
.custom-info { flex: 1; display: flex; gap: 10px; font-size: 12px; }
.custom-name { font-weight: 600; }
.custom-url, .custom-model { opacity: 0.4; }
.modal-overlay { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; }
.modal-box { width: 420px; border-radius: 12px; padding: 24px; }
.ms-dark .modal-box { background: #1c1c22; color: #d4d4d4; }
.ms-light .modal-box { background: #ffffff; color: #1a1a1a; }
.modal-box h3 { margin: 0 0 16px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

/* Editor Settings */
.eds-section { padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(128,128,128,0.08); background: rgba(128,128,128,0.02); margin-bottom: 12px; }
.eds-section-title { font-size: 13px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
.et-icon { color: #2ea86a; font-weight: 700; font-size: 16px; }

.editor-tab { padding: 0; }
.et-columns { display: grid; grid-template-columns: 420px 1fr; gap: 0; min-height: 0; }
.et-left { padding: 20px; border-right: 1px solid rgba(128,128,128,0.08); overflow-y: auto; }
.et-right { padding: 20px; overflow-y: auto; }

.et-val { font-size: 12px; opacity: 0.5; min-width: 48px; text-align: right; }

/* Highlight cards */
.et-hl-card { padding: 14px; border-radius: 12px; border: 1px solid rgba(128,128,128,0.08); margin-bottom: 10px; }
.et-hl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.et-hl-label { font-weight: 600; font-size: 13px; }
.et-hl-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(59,130,246,0.1); color: #3b82f6; margin-left: 6px; }

/* Color grid */
.et-color-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; margin-top: 10px; }
.et-color-btn { width: 100%; aspect-ratio: 1; border-radius: 8px; border: 2px solid transparent; cursor: pointer; transition: all 0.15s; }
.et-color-btn:hover { transform: scale(1.1); }
.et-color-btn.active { border-color: #000; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #000; }
.ms-dark .et-color-btn.active { border-color: #fff; box-shadow: 0 0 0 2px #1c1c22, 0 0 0 4px #fff; }

.et-regex-row { margin-top: 8px; }
.et-regex-input { width: 100%; padding: 4px 8px; font-size: 11px; font-family: monospace; border: 1px solid rgba(128,128,128,0.15); border-radius: 6px; background: transparent; color: inherit; outline: none; }
.et-regex-input:focus { border-color: rgba(46,168,106,0.4); }

.eds-hint-box { padding: 10px 14px; border-radius: 8px; border: 1px dashed rgba(128,128,128,0.2); font-size: 10px; opacity: 0.4; margin-top: 10px; }

.et-color-btn { position: relative; display: flex; align-items: center; justify-content: center; }
.et-check { color: #fff; font-size: 12px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }

.et-add-btn { padding: 4px 14px; border: none; border-radius: 8px; background: #1a1a1a; color: #fff; cursor: pointer; font-size: 12px; font-family: inherit; white-space: nowrap; }
.et-add-btn:hover { background: #333; }
.ms-light .et-add-btn { background: #1a1a1a; }
.ms-dark .et-add-btn { background: #fff; color: #000; }

.et-cr-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.06); margin: 4px 0; }
.et-cr-pattern { flex: 1; font-size: 11px; font-family: monospace; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.et-color-dot { width: 18px; height: 18px; border-radius: 4px; border: 2px solid transparent; cursor: pointer; flex-shrink: 0; }
.et-color-dot.active { border-color: #000; }
.ms-dark .et-color-dot.active { border-color: #fff; }
.et-cr-del { width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: #e06060; cursor: pointer; font-size: 10px; opacity: 0.4; }
.et-cr-del:hover { opacity: 1; }
.eds-preview { padding: 14px; border-radius: 8px; background: rgba(128,128,128,0.04); border: 1px dashed rgba(128,128,128,0.1); margin-bottom: 10px; }
.eds-preview p { margin: 4px 0; }
.eds-row { display: flex; align-items: center; gap: 10px; margin: 4px 0; font-size: 12px; }
.eds-row label { opacity: 0.6; min-width: 70px; flex-shrink: 0; }
.eds-select { flex: 1; padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.15); background: transparent; color: inherit; font-size: 12px; font-family: inherit; cursor: pointer; }
.eds-switch { width: 36px; height: 20px; border-radius: 10px; border: none; background: rgba(128,128,128,0.2); cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0; }
.eds-switch.on { background: #2ea86a; }
.eds-switch-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
.eds-switch-knob.on { left: 18px; }
.eds-hint { font-size: 10px; opacity: 0.35; margin: 2px 0; }
.eds-range { width: 100%; accent-color: #2ea86a; margin: 4px 0 8px; }

/* Sampling params */
.sampling-section { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(128,128,128,0.06); }
.sampling-header { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 4px 0; }
.sampling-toggle { font-size: 12px; font-weight: 600; opacity: 0.7; user-select: none; }
.sampling-toggle:hover { opacity: 1; }
.sampling-body { padding: 8px 0; }
.sampling-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sampling-row label { font-size: 11px; opacity: 0.6; min-width: 90px; flex-shrink: 0; }
.sampling-row .eds-range { flex: 1; margin: 0; }
.sampling-val { font-size: 11px; opacity: 0.5; min-width: 36px; text-align: right; font-family: monospace; }
.param-reset-btn { width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; font-size: 12px; opacity: 0.3; flex-shrink: 0; }
.param-reset-btn:hover { opacity: 0.8; background: rgba(128,128,128,0.1); }
</style>
