/**
 * weapp-game 的 wx-shim E2E(微信小游戏 3D 的正式回归验证,可进 CI)。
 *
 * 断言清单:
 *   1. 渲染循环在跑(__game.frames 递增)且 WebGL 真在出图(读像素非空白)
 *   1b. useGLTF 加载包内 ghost.glb(vendor 的 wx.request → XHR/fetch polyfill 路径),
 *       模型网格进入场景图 ★新增
 *   2. 左半屏真实指针拖拽(→ wx 触摸 → createWeappTouchJoystick)驱动玩家移动,
 *      「步行」任务目标随之推进;松手后摇杆归零
 *   3. 走近 NPC → 邻近检测命中;合成点按落在 NPC 模型网格上 → 射线拾取 →
 *      onClick → 对话开启(createWeappPointerBridge,取代旧的右半屏 hack)★新增
 *   4. 连续点按 NPC 走完对话(自动选第一回应)→ gather-crystals 任务被对话效果启动
 *   5. 依次走到 3 颗水晶 → 背包 +3 → 任务链(welcome + gather-crystals)全部完成
 *   6. 金币奖励到账(50 + 200)
 *   7. 任务进度持久化到存储(wx 存储 → localStorage 的 overworld:quest)
 *
 * 用法:pnpm build && node e2e/run.mjs
 * playwright 解析顺序:$PLAYWRIGHT_ROOT/node_modules → 本仓库约定的 scratchpad 路径。
 */
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { wxShimSource } from './wx-shim.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(dir, '..', 'dist')
const shotsDir = path.join(dir, 'shots')
const PORT = 4319
const BASE = `http://localhost:${PORT}`

const PLAYWRIGHT_ROOTS = [
  process.env.PLAYWRIGHT_ROOT,
  '/private/tmp/claude-501/-Users-noah-Work-idea-degener-city/e53157de-5795-4cc9-b985-f7416ea66ceb/scratchpad/e2e',
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
}

/** 极简静态服务:/ → e2e/index.html,其余 → dist/ */
function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, BASE)
    const file =
      url.pathname === '/' ? path.join(dir, 'index.html') : path.join(distDir, url.pathname)
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

/** 通过 __game.movementInput 驾驶玩家到 (x, z)(摇杆本身另有真实拖拽断言)。 */
async function navigateTo(page, x, z, stopWithin, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const done = await page.evaluate(
      ([tx, tz, stop]) => {
        const g = window.__game
        const [px, , pz] = g.playerPositionRef.current
        const dx = tx - px
        const dz = tz - pz
        const dist = Math.hypot(dx, dz)
        const input = g.movementInput.current
        if (dist < stop) {
          input.x = 0
          input.z = 0
          input.running = false
          return true
        }
        input.x = dx / dist
        input.z = dz / dist
        input.running = true
        return false
      },
      [x, z, stopWithin]
    )
    if (done) return
    await sleep(80)
  }
  const pos = await page.evaluate(() => window.__game.playerPositionRef.current.slice())
  throw new Error(`导航超时:目标 (${x}, ${z}),当前 ${JSON.stringify(pos)}`)
}

const server = await startServer()
const { chromium } = await loadPlaywright()
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })

try {
  await mkdir(shotsDir, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => pageErrors.push(err))
  await page.addInitScript(wxShimSource)

  console.log('[1] 启动与渲染')
  await page.goto(BASE)
  await page.waitForFunction(() => window.__game && window.__game.frames > 10, null, {
    timeout: 20000,
  })
  assert(true, '游戏启动,R3F 帧循环在跑(frames > 10)')

  const glReport = await page.evaluate(() => {
    const g = window.__game
    const ctx = g.gl && g.gl.getContext()
    const probe = document.createElement('canvas')
    probe.width = 64
    probe.height = 64
    const c2d = probe.getContext('2d')
    c2d.drawImage(g.canvas, 0, 0, 64, 64)
    const data = c2d.getImageData(0, 0, 64, 64).data
    const colors = new Set()
    let nonBlack = 0
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`
      colors.add(key)
      if (data[i] + data[i + 1] + data[i + 2] > 24) nonBlack += 1
    }
    return {
      isMainCanvas: g.canvas === window.__wxShim.canvases[0],
      hasGL: !!ctx && ctx.drawingBufferWidth > 0,
      distinctColors: colors.size,
      nonBlack,
    }
  })
  assert(glReport.isMainCanvas, '渲染目标 = 首个 wx.createCanvas()(上屏主画布)')
  assert(glReport.hasGL, `WebGL 上下文已创建(drawingBuffer 有效)`)
  assert(
    glReport.distinctColors >= 3 && glReport.nonBlack > 40,
    `画面非空白(采样 ${glReport.distinctColors} 种颜色,${glReport.nonBlack} 个非黑像素)`
  )
  await page.screenshot({ path: path.join(shotsDir, '01-boot.png') })

  console.log('[1b] useGLTF 加载包内 GLB(wx.request → XHR/fetch polyfill → GLTFLoader)')
  // 等 ghost 节点(GLB 的根节点名)进入场景图 —— 证明整条加载链走通了。
  await page.waitForFunction(
    () => {
      const g = window.__game
      if (!g || !g.scene) return false
      let found = false
      g.scene.traverse((o) => {
        if (o.name === 'ghost') found = true
      })
      return found
    },
    null,
    { timeout: 15000 }
  )
  const glb = await page.evaluate(() => {
    const g = window.__game
    const THREE = g.three
    let ghost = null
    g.scene.traverse((o) => {
      if (o.name === 'ghost') ghost = o
    })
    let meshCount = 0
    ghost.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('position')) {
        meshCount += 1
      }
    })
    const box = new THREE.Box3().setFromObject(ghost)
    const size = box.getSize(new THREE.Vector3())
    return { meshCount, empty: box.isEmpty(), size: [size.x, size.y, size.z] }
  })
  assert(
    glb.meshCount >= 1 && !glb.empty,
    `ghost.glb 已加载:场景图含 ${glb.meshCount} 个模型网格(世界包围盒 ${glb.size
      .map((n) => n.toFixed(2))
      .join('×')})`
  )
  // 证明走的是「真机同款」链路,而非被浏览器原生 fetch/XHR 绕过:
  const xhrPath = await page.evaluate(() => ({
    fetchName: window.fetch && window.fetch.name,
    xhrName: window.XMLHttpRequest && window.XMLHttpRequest.name,
    glbRequests: (window.__wxShim.requests || []).filter((u) => /ghost\.glb/.test(u)),
  }))
  assert(
    xhrPath.fetchName === 'fetchPolyfill' && xhrPath.xhrName === 'XHR',
    `vendor polyfill 已强制覆盖宿主 fetch/XMLHttpRequest(fetch=${xhrPath.fetchName}, XHR=${xhrPath.xhrName})`
  )
  assert(
    xhrPath.glbRequests.length >= 1,
    `GLB 经 wx.request 传输(而非原生 fetch 绕过):${JSON.stringify(xhrPath.glbRequests)}`
  )

  console.log('[2] 摇杆(左半屏真实指针拖拽 → wx 触摸 → Player 移动)')
  const before = await page.evaluate(() => window.__game.playerPositionRef.current.slice())
  await page.mouse.move(97, 550)
  await page.mouse.down()
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(97 + i * 5, 550 - i * 3)
    await sleep(30)
  }
  await sleep(1200) // 保持满偏移
  const duringDrag = await page.evaluate(() => ({
    input: { ...window.__game.movementInput.current },
    pos: window.__game.playerPositionRef.current.slice(),
  }))
  await page.mouse.up()
  await sleep(150)
  const afterUp = await page.evaluate(() => ({ ...window.__game.movementInput.current }))

  const moved = Math.hypot(duringDrag.pos[0] - before[0], duringDrag.pos[2] - before[2])
  assert(
    Math.abs(duringDrag.input.x) > 0.3 && duringDrag.input.z < -0.2,
    `拖拽期间摇杆向量已写入 movementInput(${duringDrag.input.x.toFixed(2)}, ${duringDrag.input.z.toFixed(2)})`
  )
  assert(moved > 1, `玩家随拖拽移动了 ${moved.toFixed(2)} 世界单位`)
  assert(afterUp.x === 0 && afterUp.z === 0 && !afterUp.running, '松手后摇杆归零')
  const walkProgress = await page.evaluate(
    () => window.__game.quests.getState().active['welcome']?.objectives['walk']?.current ?? 0
  )
  assert(walkProgress > 0, `「步行」任务目标已推进(${walkProgress.toFixed(1)}/20)`)

  console.log('[3] 邻近交互与射线拾取(合成点按落在 NPC 模型网格上 → onClick → 对话)')
  await navigateTo(page, 6, 6, 2.4)
  await page.waitForFunction(
    () => window.__game.sceneStore.getState().nearbyNpcId === 'guide',
    null,
    { timeout: 5000 }
  )
  assert(true, '走近向导 → nearbyNpcId = guide')
  await page.screenshot({ path: path.join(shotsDir, '02-near-npc.png') })

  // ghost 是一个实心盒网格:把它的世界包围盒中心投影到屏幕,从该点合成点按 —— 透视
  // 投影保证从该屏幕点发出的射线正穿过盒心,必命中,从而验证真射线拾取。玩家在对话
  // 期间被 isInputBlocked 冻结,相机静止,该屏幕坐标全程有效。
  const npcScreen = await page.evaluate(() => {
    const g = window.__game
    const THREE = g.three
    let ghost = null
    g.scene.traverse((o) => {
      if (o.name === 'ghost') ghost = o
    })
    const center = new THREE.Box3().setFromObject(ghost).getCenter(new THREE.Vector3())
    const ndc = center.clone().project(g.camera)
    return {
      x: (ndc.x * 0.5 + 0.5) * g.size.width,
      y: (-ndc.y * 0.5 + 0.5) * g.size.height,
      inFront: ndc.z < 1,
    }
  })
  assert(
    npcScreen.inFront && npcScreen.x >= 0 && npcScreen.y >= 0,
    `NPC 模型在相机前方,屏幕坐标 (${npcScreen.x.toFixed(0)}, ${npcScreen.y.toFixed(0)})`
  )

  await page.mouse.click(npcScreen.x, npcScreen.y) // tap 落在 ghost 网格 → 射线拾取
  await page.waitForFunction(
    () => window.__game.dialogue.getState().activeDialogue?.dialogueId === 'guide-intro',
    null,
    { timeout: 5000 }
  )
  assert(true, '射线拾取:点中 NPC 模型网格 → onClick → 对话 guide-intro 开启')
  await page.screenshot({ path: path.join(shotsDir, '03-dialogue.png') })

  // 连续点按 NPC 走完对话:hello →(自动选「问水晶」)→ explain →(自动选「接任务」)→ 结束。
  // 每次都点在同一 NPC 屏幕点上,onClick 按当下对话状态推进(单入口,不会关闭后又重开)。
  for (let i = 0; i < 8; i += 1) {
    const open = await page.evaluate(() => !!window.__game.dialogue.getState().activeDialogue)
    if (!open) break
    await page.mouse.click(npcScreen.x, npcScreen.y)
    await sleep(250)
  }
  const afterDialogue = await page.evaluate(() => {
    const g = window.__game
    const q = g.quests.getState()
    return {
      dialogueClosed: g.dialogue.getState().activeDialogue === null,
      gatherActive: !!q.active['gather-crystals'],
      talkDone: q.active['welcome']?.objectives['talk']?.completed ?? q.completed.includes('welcome'),
    }
  })
  assert(afterDialogue.dialogueClosed, '点按推进(自动选第一回应)走完整段对话')
  assert(afterDialogue.gatherActive, '对话效果启动了 gather-crystals 任务')
  assert(afterDialogue.talkDone, '「与艾拉交谈」任务目标完成(dialogue:ended 触发)')

  console.log('[4] 水晶收集 → 任务链完成')
  const spots = [
    [-8, -6],
    [10, -10],
    [-12, 10],
  ]
  for (let i = 0; i < spots.length; i += 1) {
    await navigateTo(page, spots[i][0], spots[i][1], 1.2)
    await page.waitForFunction((n) => window.__game.inventory.count('crystal') >= n, i + 1, {
      timeout: 5000,
    })
    console.log(`  ✓ 拾取水晶 ${i + 1}/3`)
  }
  await page.waitForFunction(
    () =>
      window.__game.quests.isCompleted('gather-crystals') &&
      window.__game.quests.isCompleted('welcome'),
    null,
    { timeout: 10000 }
  )
  assert(true, '任务链全部完成(welcome + gather-crystals)')

  const finalState = await page.evaluate(() => {
    const g = window.__game
    const raw = localStorage.getItem('overworld:quest')
    return {
      crystals: g.inventory.count('crystal'),
      gold: g.gold.value,
      persisted: raw ? JSON.parse(raw) : null,
    }
  })
  assert(finalState.crystals === 3, `背包水晶 ${finalState.crystals}/3`)
  assert(finalState.gold === 250, `金币奖励到账(${finalState.gold} = 50 + 200)`)
  assert(
    finalState.persisted?.state?.completed?.includes('gather-crystals') &&
      finalState.persisted?.state?.completed?.includes('welcome'),
    '任务进度已持久化(wx 存储 → overworld:quest)'
  )
  await page.screenshot({ path: path.join(shotsDir, '04-complete.png') })

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
