/**
 * scene-authoring 的端到端回归:验证「编辑器多关卡 ↔ SceneShell 授权往返」完整闭环。
 *
 * 断言清单(v1.4 单场景 + v1.5 多关卡):
 *   1. 应用启动,编辑器载入初始场景(2 NPC + 1 建筑),window.__authoring 就绪
 *   2. 通过编辑器 store 再放置一个实体(驱动无头 API)
 *   3. 点「导出并校验」→ 对 exportScene() 跑 validateScene → 校验通过(ok)
 *   4. 点「从 JSON 渲染」→ <SceneFromJson> 独立画布挂载,renderedMeshCount() > 0
 *      (证明 export → validate → render 真的出图)
 *   5. 把 lastExport 重新导入编辑器 → 实体数量与导出内容一致(往返无损)
 *   6. 新建第 2 个关卡、切换、放置实体;切回验证各关卡实体独立(switch 持久化)
 *   7. exportProject() 汇总 2 个关卡,各关卡实体数正确
 *   8. 点「导出项目」→ 对 exportProject() 跑 validateSceneProject → ok
 *   9. 选中某关卡点「预览关卡」→ pickScene + <SceneFromJson> 出图(canvas + mesh > 0)
 *  10. importProject(exportProject()) → 2 个关卡且各关卡实体数一致(项目往返无损)
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
const PORT = 4331
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

  console.log('[1] 启动与初始场景载入')
  await page.goto(BASE)
  // 等 window.__authoring 就绪且编辑器已载入初始场景(2 NPC + 1 建筑 = 3 实体)。
  await page.waitForFunction(
    () => window.__authoring && window.__authoring.editorStore.getState().entities.length >= 3,
    null,
    { timeout: 20000 }
  )
  const seeded = await page.evaluate(() => {
    const entities = window.__authoring.editorStore.getState().entities
    return {
      total: entities.length,
      npcs: entities.filter((e) => e.kind === 'npc').length,
      buildings: entities.filter((e) => e.kind === 'building').length,
      enabled: window.__authoring.editorStore.getState().enabled,
    }
  })
  assert(seeded.enabled, '编辑器已启用')
  assert(
    seeded.npcs === 2 && seeded.buildings === 1,
    `初始场景 = 2 NPC + 1 建筑(实到 ${seeded.npcs} NPC / ${seeded.buildings} 建筑)`
  )
  await page.screenshot({ path: path.join(shotsDir, '01-editor.png') })

  console.log('[2] 通过编辑器 store 再放置一个实体')
  const afterPlace = await page.evaluate(() => {
    const store = window.__authoring.editorStore
    const before = store.getState().entities.length
    store.getState().addEntity({ kind: 'npc', position: [8, 0, -5], name: '测试NPC' })
    return { before, after: store.getState().entities.length }
  })
  assert(
    afterPlace.after === afterPlace.before + 1,
    `放置实体后工作集 ${afterPlace.before} → ${afterPlace.after}`
  )

  console.log('[3] 导出并校验(validateScene(exportScene()) → ok)')
  await page.click('[data-testid="export-btn"]')
  await page.waitForFunction(() => window.__authoring.lastReport !== null, null, { timeout: 5000 })
  const exportReport = await page.evaluate(() => {
    const r = window.__authoring.lastReport
    const j = window.__authoring.lastExport
    return {
      ok: r.ok,
      errors: r.errors.length,
      warnings: r.warnings.length,
      npcs: j.npcs.length,
      buildings: j.buildings ? j.buildings.length : 0,
    }
  })
  assert(exportReport.ok, `校验通过(${exportReport.errors} 错误 / ${exportReport.warnings} 警告)`)
  assert(
    exportReport.npcs === 3 && exportReport.buildings === 1,
    `导出 JSON = 3 NPC + 1 建筑(实到 ${exportReport.npcs} / ${exportReport.buildings})`
  )

  console.log('[4] 从 JSON 渲染(<SceneFromJson> 出图)')
  await page.click('[data-testid="render-toggle"]')
  await page.waitForSelector('[data-testid="render-canvas"] canvas', { timeout: 5000 })
  assert(true, '渲染画布已挂载(<SceneFromJson> canvas 存在)')
  // 等场景图里出现网格(NPC 回退胶囊 + 建筑回退盒体 + 选中环等)。
  await page.waitForFunction(() => window.__authoring.renderedMeshCount() > 0, null, {
    timeout: 8000,
  })
  const meshCount = await page.evaluate(() => window.__authoring.renderedMeshCount())
  assert(meshCount > 0, `renderedMeshCount() = ${meshCount}(> 0,证明真的出图)`)
  await sleep(300)
  await page.screenshot({ path: path.join(shotsDir, '02-render.png') })

  console.log('[5] 把 lastExport 重新导入编辑器(往返无损)')
  const roundTrip = await page.evaluate(() => {
    const store = window.__authoring.editorStore
    const json = window.__authoring.lastExport
    const decoCount = Object.values(json.decorations || {}).reduce(
      (n, g) => n + g.instances.length,
      0
    )
    const expected = json.npcs.length + (json.buildings ? json.buildings.length : 0) + decoCount
    store.getState().importScene(json)
    return { expected, actual: store.getState().entities.length }
  })
  assert(
    roundTrip.actual === roundTrip.expected,
    `重新导入后实体数量一致(期望 ${roundTrip.expected},实到 ${roundTrip.actual})`
  )

  console.log('[6] 新建第 2 个关卡、切换、放置实体(每关卡独立实体集)')
  const multi = await page.evaluate(() => {
    const store = window.__authoring.editorStore
    const firstSceneId = store.getState().activeSceneId
    const firstCount = store.getState().entities.length
    // 新建关卡二并切到它(newScene 会先持久化当前关卡再切换)。
    const created = store.getState().newScene('关卡二')
    const emptyOnCreate = store.getState().entities.length // 应为 0(新关卡空)
    store.getState().addEntity({ kind: 'npc', position: [10, 0, -8], name: '关卡二NPC' })
    store.getState().addEntity({ kind: 'building', position: [-10, 0, -10], name: '关卡二建筑' })
    const secondCount = store.getState().entities.length
    // 切回关卡一:其实体应原样保留。
    store.getState().switchScene(firstSceneId)
    const firstAfterSwitch = store.getState().entities.length
    // 再切到关卡二:其 2 个实体应原样保留。
    store.getState().switchScene(created.id)
    const secondAfterSwitch = store.getState().entities.length
    return {
      total: store.getState().scenes.length,
      firstSceneId,
      secondSceneId: created.id,
      firstCount,
      emptyOnCreate,
      secondCount,
      firstAfterSwitch,
      secondAfterSwitch,
    }
  })
  assert(multi.total === 2, `项目含 2 个关卡(实到 ${multi.total})`)
  assert(multi.emptyOnCreate === 0, `新建关卡初始为空(实到 ${multi.emptyOnCreate})`)
  assert(multi.secondCount === 2, `关卡二放置 2 个实体(实到 ${multi.secondCount})`)
  assert(
    multi.firstAfterSwitch === multi.firstCount,
    `切回关卡一实体不变(期望 ${multi.firstCount},实到 ${multi.firstAfterSwitch})`
  )
  assert(
    multi.secondAfterSwitch === 2,
    `切回关卡二实体保留(期望 2,实到 ${multi.secondAfterSwitch})`
  )

  console.log('[7] exportProject() 汇总全部关卡')
  const project = await page.evaluate(() => {
    const p = window.__authoring.exportProject()
    const count = (s) =>
      s.npcs.length +
      (s.buildings ? s.buildings.length : 0) +
      Object.values(s.decorations || {}).reduce((n, g) => n + g.instances.length, 0)
    return {
      scenes: p.scenes.length,
      activeSceneId: p.activeSceneId,
      counts: p.scenes.map((entry) => ({ id: entry.id, name: entry.name, n: count(entry.scene) })),
    }
  })
  assert(project.scenes === 2, `exportProject() 含 2 个关卡(实到 ${project.scenes})`)
  const level2 = project.counts.find((c) => c.id === multi.secondSceneId)
  assert(level2 && level2.n === 2, `关卡二导出 2 个实体(实到 ${level2 ? level2.n : 'n/a'})`)

  console.log('[8] 导出项目(validateSceneProject(exportProject()) → ok)')
  await page.click('[data-testid="export-project-btn"]')
  await page.waitForFunction(() => window.__authoring.lastProjectReport !== null, null, {
    timeout: 5000,
  })
  const projectReport = await page.evaluate(() => {
    const r = window.__authoring.lastProjectReport
    return { ok: r.ok, errors: r.errors.length, warnings: r.warnings.length }
  })
  assert(
    projectReport.ok,
    `项目校验通过(${projectReport.errors} 错误 / ${projectReport.warnings} 警告)`
  )

  console.log('[9] 预览选中关卡(pickScene + <SceneFromJson> 出图)')
  await page.selectOption('[data-testid="level-select"]', multi.secondSceneId)
  await page.click('[data-testid="preview-level"]')
  await page.waitForSelector('[data-testid="render-canvas"] canvas', { timeout: 5000 })
  await page.waitForFunction(() => window.__authoring.renderedMeshCount() > 0, null, {
    timeout: 8000,
  })
  const previewMeshCount = await page.evaluate(() => window.__authoring.renderedMeshCount())
  assert(previewMeshCount > 0, `预览关卡 renderedMeshCount() = ${previewMeshCount}(> 0)`)
  await sleep(300)
  await page.screenshot({ path: path.join(shotsDir, '03-levels.png') })

  console.log('[10] importProject(exportProject()) 项目往返无损')
  const projectRoundTrip = await page.evaluate(() => {
    const store = window.__authoring.editorStore
    const count = (s) =>
      s.npcs.length +
      (s.buildings ? s.buildings.length : 0) +
      Object.values(s.decorations || {}).reduce((n, g) => n + g.instances.length, 0)
    const before = window.__authoring.exportProject()
    const beforeCounts = before.scenes.map((e) => ({ id: e.id, n: count(e.scene) }))
    store.getState().importProject(before)
    const after = window.__authoring.exportProject()
    const afterCounts = after.scenes.map((e) => ({ id: e.id, n: count(e.scene) }))
    return { scenes: after.scenes.length, beforeCounts, afterCounts }
  })
  assert(projectRoundTrip.scenes === 2, `重新导入项目仍含 2 个关卡(实到 ${projectRoundTrip.scenes})`)
  const countsMatch =
    JSON.stringify(projectRoundTrip.beforeCounts) === JSON.stringify(projectRoundTrip.afterCounts)
  assert(
    countsMatch,
    `各关卡实体数一致(前 ${JSON.stringify(projectRoundTrip.beforeCounts)} / 后 ${JSON.stringify(
      projectRoundTrip.afterCounts
    )})`
  )

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
