// ── 全局确认弹窗 composable ──
// 替代 window.confirm，后者在 Tauri WKWebView 中始终返回 false
// 用法：import { showConfirm } from '../composables/useConfirm'
//       showConfirm('确认删除？', () => { /* 执行删除 */ }, '确认删除')

import { reactive } from 'vue'

export const confirmState = reactive({
  visible: false,
  message: '',
  okText: '确认',
  cancelText: '取消',
  onOk: null as (() => void) | null,
})

export function showConfirm(message: string, onOk: () => void, okText = '确认删除') {
  confirmState.message = message
  confirmState.okText = okText
  confirmState.onOk = onOk
  confirmState.visible = true
}

export function onConfirmOk() {
  confirmState.visible = false
  confirmState.onOk?.()
}

export function onConfirmCancel() {
  confirmState.visible = false
}
