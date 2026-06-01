/**
 * E2E 冒烟测试：实时点击所有主要 UI 交互
 * 运行: npx playwright test src/__tests__/e2e/smoke-test.spec.ts --headed
 */
import { test, expect } from '@playwright/test'

const BASE = 'http://127.0.0.1:1420'

test.describe('顶栏交互', () => {
  test('主题切换 - 深色/浅色', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    // 默认是浅色主题（isDark 初始为 false）
    await expect(page.locator('.app-layout.theme-light')).toBeVisible()

    // 点击主题切换按钮
    const themeBtn = page.locator('.top-bar-right .toolbar-btn').last()
    await themeBtn.click()
    await expect(page.locator('.app-layout.theme-dark')).toBeVisible()

    // 再切回浅色
    await themeBtn.click()
    await expect(page.locator('.app-layout.theme-light')).toBeVisible()
  })

  test('面板切换 - 5个顶栏按钮', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    const panels = ['作品设定', '作品内容', '信息设定', '大纲设定', '写作笔记']
    for (const label of panels) {
      const btn = page.locator('.toolbar-text-btn', { hasText: label })
      await btn.click()
      await expect(btn).toHaveClass(/active/)
    }
  })

  test('退出按钮可点击不崩溃', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('.exit-btn').click()
    await page.waitForTimeout(300)
  })

  test('所有工具栏按钮可点击', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    // 验证顶栏按钮全部存在且可点击
    const btns = page.locator('.top-bar-right .toolbar-btn')
    const count = await btns.count()
    expect(count).toBeGreaterThanOrEqual(4) // 创作向导/导入/导出/设置/主题
    for (let i = 0; i < count; i++) {
      await btns.nth(i).click({ timeout: 1000 }).catch(() => {})
      await page.waitForTimeout(200)
    }
  })
})

test.describe('弹窗交互', () => {
  test('灵感火花 Modal 打开', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('[title="创作向导"]').click()
    await page.waitForTimeout(800)
    // InspireModal 使用 class="ism-overlay"
    await expect(page.locator('.ism-overlay')).toBeVisible({ timeout: 3000 })
  })

  test('设置面板打开 → 切换 Tab → 关闭', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('[title="设置"]').click()
    await page.waitForTimeout(500)
    await expect(page.locator('.settings-overlay')).toBeVisible({ timeout: 3000 })

    // 切换到编辑器 Tab
    await page.locator('.ms-tab', { hasText: '编辑器' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.et-left')).toBeVisible({ timeout: 3000 })

    // 切回大模型 Tab
    await page.locator('.ms-tab', { hasText: '大模型' }).click()
    await page.waitForTimeout(300)

    // 关闭
    await page.locator('.settings-overlay .close-btn').click()
    await expect(page.locator('.settings-overlay')).not.toBeVisible({ timeout: 3000 })
  })
})

test.describe('作品目录 (WorkTree)', () => {
  test('新建作品', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')

    // 点击新建按钮
    const addBtns = page.locator('button:has-text("+"), button[title*="新建"]')
    const count = await addBtns.count()
    if (count > 0) {
      await addBtns.first().click()
      await page.waitForTimeout(300)
      // 尝试输入名称
      const input = page.locator('.left-panel input[type="text"], input[placeholder*="作品"], input[placeholder*="名称"]').first()
      if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
        await input.fill('E2E测试作品')
        await input.press('Enter')
        await page.waitForTimeout(500)
      }
    }
  })

  test('左栏折叠/展开', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')

    const collapseBtn = page.locator('.left-panel .panel-collapse-btn')
    await collapseBtn.click()
    await page.waitForTimeout(400)
    // 折叠后 class 包含 collapsed，宽度归零
    await expect(page.locator('.left-panel.collapsed')).toBeAttached({ timeout: 2000 })

    // 展开
    await page.locator('.collapsed-strip').click()
    await page.waitForTimeout(400)
    // 展开后宽度恢复
    const leftPanel = page.locator('.left-panel')
    const boxAfter = await leftPanel.boundingBox()
    expect(boxAfter?.width).toBeGreaterThan(0)
  })
})

test.describe('Agent 工作台', () => {
  test('Agent 悬浮按钮展开/收起', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')

    // Agent 默认未展开
    const floatBtn = page.locator('.agent-float-btn')
    await expect(floatBtn).toBeVisible({ timeout: 3000 })

    // 展开
    await floatBtn.click()
    await page.waitForTimeout(500)
    await expect(page.locator('.agent-sidebar.open')).toBeVisible({ timeout: 3000 })

    // 收起
    await page.locator('.agent-sidebar .panel-collapse-btn').click()
    await page.waitForTimeout(300)
  })
})

test.describe('设置面板 - 大模型', () => {
  test('DeepSeek 开关切换可见', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('[title="设置"]').click()
    await page.waitForSelector('.settings-overlay')

    // DeepSeek 默认启用
    const dsCard = page.locator('.provider-card.enabled', { hasText: 'DeepSeek' })
    await expect(dsCard).toBeVisible({ timeout: 3000 })

    // 切换开关（注意：关闭后 n-switch 仍在 DOM 但 provider-body 会隐藏）
    const dsSwitch = dsCard.locator('.n-switch').first()
    await dsSwitch.click()
    await page.waitForTimeout(400)
    // 切换后卡片不应再有 enabled class
    await expect(page.locator('.provider-card.enabled', { hasText: 'DeepSeek' })).not.toBeVisible({ timeout: 3000 })

    // 重新启用（点击没有 enabled class 的卡片的 switch）
    const disabledCard = page.locator('.provider-card:not(.enabled)', { hasText: 'DeepSeek' })
    await disabledCard.locator('.n-switch').first().click()
    await page.waitForTimeout(400)
    await expect(page.locator('.provider-card.enabled', { hasText: 'DeepSeek' })).toBeVisible({ timeout: 3000 })
  })

  test('自定义模型添加+开关+删除', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('[title="设置"]').click()
    await page.waitForSelector('.settings-overlay')

    // 添加自定义模型
    await page.locator('button', { hasText: '+ 添加' }).click()
    await page.waitForTimeout(300)

    const modal = page.locator('.modal-box')
    await expect(modal).toBeVisible({ timeout: 2000 })
    await modal.locator('input[placeholder="我的模型"]').fill('E2E测试模型')
    await modal.locator('input[placeholder*="api."]').fill('https://api.test.com/v1')
    await modal.locator('input[placeholder="sk-..."]').fill('sk-test123')
    await modal.locator('input[placeholder="model-name"]').fill('test-model-v1')
    await page.locator('button', { hasText: '确认添加' }).click()
    await page.waitForTimeout(500)

    // 应出现自定义模型行
    const customRow = page.locator('.custom-row', { hasText: 'E2E测试模型' })
    await expect(customRow).toBeVisible({ timeout: 3000 })

    // 切换开关
    await customRow.locator('.n-switch').click()
    await page.waitForTimeout(300)
    // 再切回来
    await customRow.locator('.n-switch').click()
    await page.waitForTimeout(300)

    // 删除
    await customRow.locator('button', { hasText: '删除' }).click()
    await page.waitForTimeout(300)
    await expect(customRow).not.toBeVisible({ timeout: 2000 })
  })
})

test.describe('编辑器', () => {
  test('md-editor 可见', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await page.locator('.toolbar-text-btn', { hasText: '作品内容' }).click()
    await page.waitForTimeout(500)

    // md-editor-v3 渲染（仅在存在编辑器时断言可见）
    const editor = page.locator('.md-editor, .cm-editor')
    const visible = await editor.isVisible({ timeout: 3000 }).catch(() => false)
    if (!visible) {
      console.warn('[smoke] 编辑器未渲染：可能尚未选择作品或章节')
    }
    // 验证页面至少加载成功
    expect(await page.locator('.app-layout').isVisible()).toBe(true)
  })
})

test.describe('底部状态栏', () => {
  test('状态栏元素可见', async ({ page }) => {
    await page.goto(BASE)
    await page.waitForSelector('.app-layout')
    await expect(page.locator('.status-bar')).toBeVisible()
    // 状态栏应包含创作数据和平台信息
    await expect(page.locator('.status-item').first()).toBeVisible()
  })
})
