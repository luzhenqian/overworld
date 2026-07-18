/**
 * content-packs 的端到端回归:验证「校验后应用 → 热更 → 门禁拒绝」完整闭环。
 *
 * 断言清单:
 *   1. 应用启动,基础包 town@1 已应用 —— window.__cp 就绪,quests.definitions 含 welcome
 *   2. applyV2():从 /packs/v2.json 拉取 town@2,校验通过后注册 ——
 *      新任务 harvest-festival 出现在 quests.getState().definitions,
 *      新对话 merchant-intro 出现在 dialogue.getState().dialogues
 *   3. applyInvalid():非法包被校验门禁拒绝 —— ok:false、report 有 error,
 *      引擎保持不变(broken-quest 未注册,任务定义数量不变)
 *
 * 用法:pnpm build && PLAYWRIGHT_ROOT=<装有 playwright 的目录> node e2e/run.mjs
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
  dir, // resolve playwright from this package (or set PLAYWRIGHT_ROOT)
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

  console.log('[1] 启动与基础包 town@1 应用')
  await page.goto(BASE)
  await page.waitForFunction(
    () => window.__cp && Object.keys(window.__cp.quests.getState().definitions).length > 0,
    null,
    { timeout: 20000 }
  )
  const base = await page.evaluate(() => {
    const defs = window.__cp.quests.getState().definitions
    return {
      questIds: Object.keys(defs),
      hasWelcome: 'welcome' in defs,
      lastApplyOk: window.__cp.lastApply?.ok,
      applied: window.__cp.lastApply?.applied ?? [],
      trackerVersion: window.__cp.tracker.version('town'),
    }
  })
  assert(base.hasWelcome, `基础包任务 welcome 已注册(定义:${base.questIds.join(', ')})`)
  assert(base.lastApplyOk === true, '基础包 applyContentPack ok:true')
  assert(
    base.applied.includes('quests') && base.applied.includes('dialogues'),
    `基础包 applied 覆盖各段(${base.applied.join(', ')})`
  )
  assert(base.trackerVersion === 1, `版本追踪器记录 town@1(实到 ${base.trackerVersion})`)
  await page.screenshot({ path: path.join(shotsDir, '01-base.png') })

  console.log('[2] 热更 v2:拉取 /packs/v2.json,校验后注册')
  const v2 = await page.evaluate(async () => {
    const result = await window.__cp.applyV2()
    const quests = window.__cp.quests.getState().definitions
    const dialogues = window.__cp.dialogue.getState().dialogues
    return {
      ok: result.ok,
      applied: result.applied,
      errors: result.report.errors.length,
      hasNewQuest: 'harvest-festival' in quests,
      hasNewDialogue: 'merchant-intro' in dialogues,
      questCount: Object.keys(quests).length,
      trackerVersion: window.__cp.tracker.version('town'),
    }
  })
  assert(v2.ok, `v2 校验通过并应用(${v2.errors} 错误)`)
  assert(v2.hasNewQuest, 'v2 新任务 harvest-festival 已注册进 quests.definitions')
  assert(v2.hasNewDialogue, 'v2 新对话 merchant-intro 已注册进 dialogue.dialogues')
  assert(
    v2.applied.includes('quests') && v2.applied.includes('dialogues'),
    `v2 applied 含 quests + dialogues(${v2.applied.join(', ')})`
  )
  assert(v2.trackerVersion === 2, `版本追踪器升级到 town@2(实到 ${v2.trackerVersion})`)
  await sleep(200)
  await page.screenshot({ path: path.join(shotsDir, '02-v2.png') })

  console.log('[3] 应用非法内容:校验门禁拒绝,引擎不变')
  const before = v2.questCount
  const invalid = await page.evaluate(() => {
    const result = window.__cp.applyInvalid()
    const quests = window.__cp.quests.getState().definitions
    return {
      ok: result.ok,
      errors: result.report.errors.length,
      applied: result.applied,
      hasBrokenQuest: 'broken-quest' in quests,
      questCount: Object.keys(quests).length,
    }
  })
  assert(invalid.ok === false, '非法包被拒绝(ok:false)')
  assert(invalid.errors > 0, `report 含 error(${invalid.errors} 个)`)
  assert(invalid.applied.length === 0, 'applied 为空(未注册任何段)')
  assert(!invalid.hasBrokenQuest, '非法任务 broken-quest 未进入引擎')
  assert(invalid.questCount === before, `任务定义数量不变(${before} → ${invalid.questCount},引擎未受影响)`)

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
