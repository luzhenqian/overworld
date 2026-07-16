/**
 * Telegram Mini App 模板 E2E(Telegram mock 验证)。
 *
 * 在真实浏览器里于页面脚本执行前注入 window.Telegram.WebApp mock,验证:
 *   1. platform 桥检测到 'telegram'
 *   2. ready() + expand() 被调用
 *   3. BackButton 处理器已注册(桥的生命周期接线)
 *   4. BackButton 点击(app:back)能关闭打开中的对话
 *   5. themeParams 已映射到 HUD 的 CSS 变量
 *
 * 用法:
 *   pnpm build            # 先产出 dist/
 *   node e2e.mjs          # 自动起 vite preview 并跑断言
 *
 * playwright 不是模板依赖:脚本按 本地可解析 → $PLAYWRIGHT_ROOT/node_modules
 * 的顺序查找(例如 PLAYWRIGHT_ROOT=~/somewhere/e2e node e2e.mjs)。
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const PORT = 4173
// vite preview 默认只绑 localhost(可能是 ::1),统一用 localhost 访问
const BASE = `http://localhost:${PORT}`

async function loadPlaywright() {
  const bases = [dir, process.env.PLAYWRIGHT_ROOT].filter(Boolean)
  for (const base of bases) {
    try {
      const require = createRequire(path.join(base, 'noop.js'))
      const mod = await import(pathToFileURL(require.resolve('playwright')).href)
      // CJS 入口经动态 import 后命名导出可能都在 default 上
      return mod.chromium ? mod : mod.default
    } catch {
      /* 下一个候选 */
    }
  }
  throw new Error('找不到 playwright,请设置 PLAYWRIGHT_ROOT 指向装有 playwright 的目录')
}

/** 必须在任何页面脚本(包括 telegram-web-app.js)之前注入的 mock */
const TELEGRAM_MOCK = `(() => {
  const calls = { ready: 0, expand: 0 }
  const backHandlers = []
  window.__tgMock = { calls, backHandlers }
  window.Telegram = {
    WebApp: {
      initData: 'query_id=e2e&user=%7B%22id%22%3A1%7D&auth_date=0&hash=e2e',
      initDataUnsafe: { query_id: 'e2e' },
      version: '8.0',
      platform: 'ios',
      colorScheme: 'dark',
      themeParams: {
        bg_color: '#1c2733',
        secondary_bg_color: '#232e3c',
        text_color: '#f5f5f5',
        hint_color: '#708499',
        button_color: '#5288c1',
        accent_text_color: '#6ab2f2',
      },
      isExpanded: false,
      viewportHeight: 700,
      viewportStableHeight: 700,
      safeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
      contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
      ready() { calls.ready += 1 },
      expand() { calls.expand += 1; this.isExpanded = true },
      close() {},
      openLink() {},
      onEvent() {},
      offEvent() {},
      HapticFeedback: {
        impactOccurred() {},
        notificationOccurred() {},
        selectionChanged() {},
      },
      BackButton: {
        isVisible: false,
        show() { this.isVisible = true },
        hide() { this.isVisible = false },
        onClick(fn) { backHandlers.push(fn) },
        offClick(fn) {
          const i = backHandlers.indexOf(fn)
          if (i >= 0) backHandlers.splice(i, 1)
        },
      },
    },
  }
})()`

let failures = 0
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* 未就绪 */
    }
    await delay(250)
  }
  throw new Error(`preview 服务 ${url} 在 ${timeoutMs}ms 内未就绪`)
}

async function main() {
  if (!existsSync(path.join(dir, 'dist', 'index.html'))) {
    throw new Error('缺少 dist/,请先执行 pnpm build')
  }
  const { chromium } = await loadPlaywright()

  // detached + 进程组 kill:pnpm exec 会再起 vite 孙进程,退出时要一并带走
  const preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: dir,
    stdio: 'ignore',
    detached: true,
  })
  let browser
  try {
    await waitForServer(BASE)
    browser = await chromium.launch()

    const context = await browser.newContext({ viewport: { width: 420, height: 780 } })
    // mock 必须先于页面脚本执行
    await context.addInitScript(TELEGRAM_MOCK)
    // 拦掉官方 SDK,防止真脚本覆盖 mock
    await context.route('**/telegram-web-app.js', (route) => route.abort())

    const page = await context.newPage()
    page.on('pageerror', (err) => console.error('  [pageerror]', err.message))
    await page.goto(BASE)
    await page.waitForFunction(() => Boolean(window.__overworld), null, { timeout: 15_000 })

    console.log('Telegram Mini App E2E:')

    const platform = await page.evaluate(() => window.__overworld.platform)
    check("detectPlatform() === 'telegram'", platform === 'telegram', `got '${platform}'`)

    const calls = await page.evaluate(() => window.__tgMock.calls)
    check('WebApp.ready() 已调用', calls.ready >= 1, `ready=${calls.ready}`)
    check('WebApp.expand() 已调用', calls.expand >= 1, `expand=${calls.expand}`)

    const handlerCount = await page.evaluate(() => window.__tgMock.backHandlers.length)
    check('BackButton.onClick 处理器已注册', handlerCount >= 1, `handlers=${handlerCount}`)

    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hud-accent').trim()
    )
    check('themeParams → --hud-accent CSS 变量', accent === '#6ab2f2', `got '${accent}'`)
    const panelBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--hud-panel-bg').trim()
    )
    check('themeParams → --hud-panel-bg CSS 变量', panelBg.startsWith('rgba(35, 46, 60'), `got '${panelBg}'`)

    // 打开对话 → BackButton 显示 → 触发 BackButton(app:back)→ 对话关闭
    await page.evaluate(() => {
      window.__overworld.dialogue.getState().start('guide-intro', 'guide')
    })
    await page.waitForSelector('#dialogue-box', { timeout: 5_000 })
    const backVisible = await page.evaluate(() => window.Telegram.WebApp.BackButton.isVisible)
    check('对话打开时 BackButton.show()', backVisible === true)

    await page.evaluate(() => {
      for (const fn of window.__tgMock.backHandlers) fn()
    })
    await page.waitForSelector('#dialogue-box', { state: 'detached', timeout: 5_000 })
    const activeAfterBack = await page.evaluate(
      () => window.__overworld.dialogue.getState().activeDialogue
    )
    check('app:back 关闭了打开中的对话', activeAfterBack === null)

    if (failures > 0) throw new Error(`${failures} 项断言失败`)
    console.log('全部通过 ✔')
  } finally {
    await browser?.close()
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      preview.kill('SIGTERM')
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err)
    process.exit(1)
  })
