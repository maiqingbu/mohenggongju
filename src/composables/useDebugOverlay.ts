/**
 * 调试日志面板 —— 拦截 console 输出，在画面右下角浮层显示
 * 用于独立应用无法开 devtools 时排查问题
 */
import { ref, onMounted, onUnmounted } from 'vue'

export interface LogEntry {
  ts: number
  level: 'log' | 'warn' | 'error'
  msg: string
}

export const logs = ref<LogEntry[]>([])
export const showDebugPanel = ref(false)

const MAX_LOGS = 500

function addLog(level: LogEntry['level'], args: unknown[]) {
  const msg = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack || ''}`
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2) } catch { return String(a) }
    }
    return String(a)
  }).join(' ')
  logs.value.push({ ts: Date.now(), level, msg })
  if (logs.value.length > MAX_LOGS) logs.value.shift()
}

const _orig = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

let _installed = false

export function installDebugOverlay(): () => void {
  if (_installed) return () => {} // 防止重复安装
  _installed = true
  console.log = (...args: unknown[]) => {
    _orig.log(...args)
    addLog('log', args)
  }
  console.warn = (...args: unknown[]) => {
    _orig.warn(...args)
    addLog('warn', args)
  }
  console.error = (...args: unknown[]) => {
    _orig.error(...args)
    addLog('error', args)
  }
  // 快捷键 Cmd+Shift+L / Ctrl+Shift+L 切换面板
  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault()
      showDebugPanel.value = !showDebugPanel.value
    }
  }
  window.addEventListener('keydown', onKey)

  // 返回清理函数，调用方应在 onUnmounted 中执行
  return function cleanup() {
    _installed = false
    window.removeEventListener('keydown', onKey)
    console.log = _orig.log
    console.warn = _orig.warn
    console.error = _orig.error
  }
}

export function useDebugPanelStyle(): Record<string, any> {
  return {
    panel: {
      position: 'fixed',
      bottom: '0',
      right: '0',
      width: '480px',
      maxHeight: '360px',
      background: 'rgba(0,0,0,0.88)',
      color: '#eee',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: 99999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRadius: '6px 0 0 0',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 10px',
      background: '#1a1a2e',
      borderBottom: '1px solid #333',
      fontSize: '12px',
      cursor: 'move',
    },
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: '4px 8px',
    },
    line: (level: string) => ({
      padding: '2px 0',
      borderBottom: '1px solid #222',
      color: level === 'error' ? '#f87171' : level === 'warn' ? '#fbbf24' : '#a5d6a7',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }),
    close: {
      background: 'none',
      border: 'none',
      color: '#aaa',
      cursor: 'pointer',
      fontSize: '14px',
      padding: '0 4px',
    },
  }
}
