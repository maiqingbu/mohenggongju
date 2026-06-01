/**
 * 编辑器设置 composable
 *
 * 管理字体、排版、提示音等编辑器偏好，通过 CSS 变量注入 ChapterEditor。
 * 存储：localStorage key `ns:editorSettings`
 */
import { reactive, computed, watchEffect } from 'vue'

export interface EditorSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  soundVolume: number
}

const FONT_OPTIONS = [
  { value: 'ui-serif, Georgia, Cambria, "Songti SC", STSong, "Noto Serif SC", serif', label: '宋体衬线（小说排版感）' },
  { value: 'system-ui, -apple-system, "PingFang SC", sans-serif', label: '苹方 / PingFang（现代感）' },
  { value: '"Microsoft YaHei", "微软雅黑", sans-serif', label: '微软雅黑（Windows 友好）' },
  { value: '"SimHei", "黑体", sans-serif', label: '黑体（更利落）' },
  { value: '"Source Han Serif SC", "思源宋体", serif', label: '思源宋体（书卷感）' },
  { value: '"KaiTi", "楷体", serif', label: '楷体（文气更强）' },
  { value: '"Times New Roman", Times, serif', label: 'Times / 西文衬线' },
  { value: '"SF Mono", "Cascadia Code", "Fira Code", monospace', label: '等宽字体（结构清晰）' },
]

const DEFAULTS: EditorSettings = {
  fontFamily: FONT_OPTIONS[0].value,
  fontSize: 16,
  lineHeight: 1.8,
  soundVolume: 50,
}

const STORAGE_KEY = 'ns:editorSettings'

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
}

function save(settings: EditorSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

// 全局单例状态
const state = reactive<EditorSettings>(load())

// CSS 变量注入到 :root
function applyCssVars() {
  const root = document.documentElement
  root.style.setProperty('--ce-font', state.fontFamily)
  root.style.setProperty('--ce-font-size', state.fontSize + 'px')
  root.style.setProperty('--ce-line-height', String(state.lineHeight))
}

// 自动同步 CSS 变量
watchEffect(() => {
  applyCssVars()
})

// ── 提示音 ──

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

/**
 * 播放生成完成提示音（双音叮咚）
 */
export function playNotifySound() {
  if (state.soundVolume === 0) return
  try {
    const ctx = getAudioCtx()
    const vol = state.soundVolume / 100

    // 第一个音
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.value = 880
    gain1.gain.setValueAtTime(vol * 0.3, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc1.connect(gain1).connect(ctx.destination)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.3)

    // 第二个音（更高）
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.value = 1320
    gain2.gain.setValueAtTime(vol * 0.25, ctx.currentTime + 0.15)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc2.connect(gain2).connect(ctx.destination)
    osc2.start(ctx.currentTime + 0.15)
    osc2.stop(ctx.currentTime + 0.5)
  } catch {
    // 静默失败（浏览器可能阻止自动播放）
  }
}

/**
 * 播放简短点击音（用于交互反馈）
 */
export function playClickSound() {
  if (state.soundVolume === 0) return
  try {
    const ctx = getAudioCtx()
    const vol = state.soundVolume / 100
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 660
    gain.gain.setValueAtTime(vol * 0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.1)
  } catch {}
}

/**
 * 导出 composable（响应式设置 + 更新方法）
 */
export function useEditorSettings() {
  function update(partial: Partial<EditorSettings>) {
    Object.assign(state, partial)
    save(state)
  }

  function reset() {
    Object.assign(state, DEFAULTS)
    save(state)
  }

  return {
    settings: state,
    fontOptions: FONT_OPTIONS,
    defaults: DEFAULTS,
    update,
    reset,
    applyCssVars,
  }
}
