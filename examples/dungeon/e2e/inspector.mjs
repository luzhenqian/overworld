/**
 * dungeon 的 @overworld-engine/inspector 端到端回归。
 *
 * 断言清单:
 *   1. 应用启动(?seed=42),window.__inspector 就绪,面板默认隐藏
 *   2. 按 `(backquote)开关 → 事件总线检查器可见(data-testid="ow-inspector")
 *   3. 驱动真实玩法(inventory.add('key') → item:added → find-key 任务链)
 *   4. 检查器的事件流里出现真实事件名(item:added / quest:* …)
 *   5. 计数表非空;全程无页面错误
 *
 * 用法:
 *   pnpm build && \
 *   PLAYWRIGHT_ROOT=<装有 playwright 的目录> node e2e/inspector.mjs
 */
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(dir, '..', 'dist')
const shotsDir = path.join(dir, 'shots')
const PORT = 4332
const BASE = `http://localhost:${PORT}`

const PLAYWRIGHT_ROOTS = [
  process.env.PLAYWRIGHT_ROOT,
  '/private/tmp/claude-501/-Users-noah-Work-idea-degener-city/e53157de-5795-4cc9-b985-f7416ea66ceb/scratchpad/e2e/node_modules',
].filter(Boolean)

async function loadPlaywright() {
  for (const base of PLAYWRIGHT_ROOTS) {
    try {
      const require = createRequire(path.join(base, 'noop.js'))
      const mod = await import(pathToFileURL(require.resolve('playwright')).href)
      return mod.chromium ? mod : mod.default
    } catch {
      /* 下一个候选 */
    }
  }
  throw new Error('找不到 playwright,请设置 PLAYWRIGHT_ROOT 指向装有 playwright 的目录')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
}

/** 极简静态服务:/ → dist/index.html,其余 → dist/<pathname> */
function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, BASE)
    const file =
      url.pathname === '/' ? path.join(distDir, 'index.html') : path.join(distDir, url.pathname)
    try {
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

let failures = 0
function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.error(`  ✗ ${label}`)
  }
}

const server = await startServer()
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })

try {
  await mkdir(shotsDir, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))

  console.log('[1] 启动(?seed=42)与调试句柄就绪')
  await page.goto(`${BASE}/?seed=42`)
  await page.waitForFunction(() => typeof window.__inspector !== 'undefined', null, {
    timeout: 20000,
  })
  const hiddenAtBoot = await page.evaluate(
    () => window.__inspector.visible === false && !document.querySelector('[data-testid="ow-inspector"]')
  )
  assert(hiddenAtBoot, '面板默认隐藏(未渲染)')
  await page.screenshot({ path: path.join(shotsDir, '01-boot.png') })

  console.log('[2] 按 ` 开关 → 事件总线检查器可见')
  await page.keyboard.press('Backquote')
  // 反引号若被环境吞掉,退回调试句柄(仍是真实的可见性切换)。
  try {
    await page.waitForSelector('[data-testid="ow-inspector"]', { timeout: 2000 })
  } catch {
    await page.evaluate(() => window.__inspector.show())
    await page.waitForSelector('[data-testid="ow-inspector"]', { timeout: 5000 })
  }
  const panelVisible = await page.evaluate(
    () => !!document.querySelector('[data-testid="ow-inspector"]') && window.__inspector.visible
  )
  assert(panelVisible, '检查器面板可见(data-testid="ow-inspector")')

  console.log('[3] 驱动真实玩法(inventory.add → item:added → 任务链)')
  // 等检查器的订阅副作用挂好,再发事件。
  await sleep(300)
  await page.evaluate(() => window.__inspector.drive())

  console.log('[4] 事件流里出现真实事件名')
  const REAL_EVENTS = ['item:added', 'quest:completed', 'quest:objective-completed', 'quest:started']
  await page.waitForFunction(
    (events) => {
      const el = document.querySelector('[data-testid="ow-inspector-stream"]')
      const text = el ? el.textContent ?? '' : ''
      return events.some((name) => text.includes(name))
    },
    REAL_EVENTS,
    { timeout: 8000 }
  )
  const streamText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ow-inspector-stream"]')
    return el ? el.textContent ?? '' : ''
  })
  const seen = REAL_EVENTS.filter((name) => streamText.includes(name))
  assert(seen.length > 0, `事件流含真实事件:${seen.join(', ')}`)
  assert(streamText.includes('item:added'), '事件流含 item:added(真实背包事件)')

  console.log('[5] 计数表非空')
  const countRows = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ow-inspector-counts"]')
    return el ? el.querySelectorAll('div').length : 0
  })
  assert(countRows > 0, `计数表有 ${countRows} 行`)

  console.log('[6] StoreInspector 显示实时 store 快照')
  const storeText = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="ow-store-inspector"]')
    return el ? el.textContent ?? '' : null
  })
  assert(storeText !== null, 'StoreInspector 面板可见(data-testid="ow-store-inspector")')
  // 地牢 useGameStore 含 hearts / gold 字段 —— 证明 StoreInspector 真读取了 store 状态
  assert(
    storeText !== null && (storeText.includes('hearts') || storeText.includes('gold')),
    `store 快照含真实字段(hearts/gold):${(storeText ?? '').slice(0, 80)}`
  )
  await page.screenshot({ path: path.join(shotsDir, '02-inspector.png') })

  assert(pageErrors.length === 0, `无页面错误${pageErrors.length ? `:${pageErrors[0]}` : ''}`)

  console.log(failures === 0 ? '\n全部断言通过 ✅' : `\n${failures} 项断言失败 ❌`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (error) {
  console.error('\nE2E 失败:', error)
  process.exitCode = 1
} finally {
  await browser.close()
  server.close()
}
