/**
 * wx-shim:在真实浏览器里模拟 `wx` 全局,但一切能力由真实浏览器支撑 ——
 * canvas 是真 <canvas>(真 WebGL),触摸来自真实指针事件,存储落在
 * localStorage,音频是 HTMLAudio,socket 是真 WebSocket。
 *
 * 这让 adapters-weapp 的适配层代码(canvasRoot/joystick/storage/bridge)
 * 100% 跑在真渲染、真输入之上被验证;微信开发者工具真机预览只剩人工确认。
 *
 * 用法:page.addInitScript(wxShimSource) —— 必须先于任何页面脚本执行。
 */
export const wxShimSource = String.raw`(() => {
  if (window.wx) return

  // 抓住原生 fetch/Headers —— vendor/weapp-adapter.js 之后会用 wx.request 支撑的
  // polyfill 覆盖全局 fetch,wx.request 必须用这份原生实现,否则自我递归。
  const pageFetch = window.fetch.bind(window)

  const touchListeners = { touchstart: [], touchmove: [], touchend: [], touchcancel: [] }
  const remove = (list, fn) => {
    const i = list.indexOf(fn)
    if (i !== -1) list.splice(i, 1)
  }

  let mainCanvas = null
  // requests: 每次 wx.request 的 URL —— e2e 据此断言 GLB 走的是
  // wx.request(→ adapter 的 XHR/fetch polyfill)而非被原生 fetch 绕过。
  const shim = { canvases: [], requests: [] }
  window.__wxShim = shim

  const appendMain = (canvas) => {
    canvas.style.cssText =
      'position:fixed;left:0;top:0;width:' +
      window.innerWidth +
      'px;height:' +
      window.innerHeight +
      'px;'
    const attach = () => (document.body || document.documentElement).appendChild(canvas)
    if (document.body) attach()
    else window.addEventListener('DOMContentLoaded', attach)
  }

  /** wx.createInnerAudioContext → HTMLAudio */
  class InnerAudioContextShim {
    constructor() {
      this._a = new Audio()
    }
    get src() { return this._a.src }
    set src(v) { this._a.src = v }
    get loop() { return this._a.loop }
    set loop(v) { this._a.loop = v }
    get volume() { return this._a.volume }
    set volume(v) { this._a.volume = v }
    get paused() { return this._a.paused }
    play() { this._a.play().catch(() => {}) }
    pause() { this._a.pause() }
    stop() { this._a.pause(); this._a.currentTime = 0 }
    destroy() { this._a.pause(); this._a.removeAttribute('src') }
    onEnded(cb) { this._a.addEventListener('ended', cb) }
    offEnded(cb) { this._a.removeEventListener('ended', cb) }
  }

  window.wx = {
    // --- 小游戏画布/图片:首个 createCanvas = 上屏主画布 ---
    createCanvas() {
      const c = document.createElement('canvas')
      shim.canvases.push(c)
      if (!mainCanvas) {
        mainCanvas = c
        appendMain(c)
      }
      return c
    },
    createImage: () => new Image(),

    // --- 系统信息:取自真实视口 ---
    getSystemInfoSync: () => ({
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio,
      platform: 'devtools',
      safeArea: {
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      },
    }),

    // --- 存储 → localStorage(保留 wx 语义:缺失键返回 '')---
    getStorageSync: (key) => {
      const v = localStorage.getItem(key)
      return v === null ? '' : v
    },
    setStorageSync: (key, value) =>
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)),
    removeStorageSync: (key) => localStorage.removeItem(key),
    getStorageInfoSync: () => ({ keys: Object.keys(localStorage) }),

    // --- 全局触摸事件(由下方真实指针事件桥派发)---
    onTouchStart: (fn) => touchListeners.touchstart.push(fn),
    onTouchMove: (fn) => touchListeners.touchmove.push(fn),
    onTouchEnd: (fn) => touchListeners.touchend.push(fn),
    onTouchCancel: (fn) => touchListeners.touchcancel.push(fn),
    offTouchStart: (fn) => remove(touchListeners.touchstart, fn),
    offTouchMove: (fn) => remove(touchListeners.touchmove, fn),
    offTouchEnd: (fn) => remove(touchListeners.touchend, fn),
    offTouchCancel: (fn) => remove(touchListeners.touchcancel, fn),

    // --- 生命周期 → visibilitychange ---
    onShow(cb) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) cb()
      })
    },
    onHide(cb) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) cb()
      })
    },

    // --- 网络请求 → 原生 fetch(支撑 adapter 的 XMLHttpRequest/fetch polyfill)---
    // GLTFLoader → FileLoader → fetch(polyfill)→ XMLHttpRequest(polyfill)→
    // 这里的 wx.request → pageFetch。真机同路,只是最底层换成 wx 自己的网络栈。
    request({ url, method = 'GET', header = {}, data, responseType = 'text', success, fail }) {
      shim.requests.push(url)
      let aborted = false
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      const upper = String(method).toUpperCase()
      pageFetch(url, {
        method: upper,
        headers: header,
        body: upper === 'GET' || upper === 'HEAD' ? undefined : data,
        signal: controller ? controller.signal : undefined,
      })
        .then(async (res) => {
          const respHeader = {}
          res.headers.forEach((v, k) => {
            respHeader[k] = v
          })
          const payload = responseType === 'arraybuffer' ? await res.arrayBuffer() : await res.text()
          if (!aborted && success) success({ data: payload, statusCode: res.status, header: respHeader })
        })
        .catch((err) => {
          if (!aborted && fail) fail({ errMsg: String(err && err.message ? err.message : err) })
        })
      return {
        abort() {
          aborted = true
          if (controller) controller.abort()
        },
      }
    },

    // --- socket → 真 WebSocket ---
    connectSocket({ url, protocols }) {
      const ws = new WebSocket(url, protocols)
      return {
        send: ({ data }) => ws.send(data),
        close: (opts) => ws.close(opts && opts.code, opts && opts.reason),
        onOpen: (cb) => ws.addEventListener('open', () => cb()),
        onMessage: (cb) => ws.addEventListener('message', (e) => cb({ data: e.data })),
        onClose: (cb) => ws.addEventListener('close', () => cb()),
        onError: (cb) => ws.addEventListener('error', (e) => cb(e)),
      }
    },

    // --- 音频 ---
    createInnerAudioContext: () => new InnerAudioContextShim(),

    setPreferredFramesPerSecond() {},
    env: { USER_DATA_PATH: 'wxfile://usr' },
  }

  // --- 真实指针事件 → wx 风格触摸载荷 --------------------------------------
  const active = new Map()
  const fire = (type, changed) => {
    const payload = { touches: [...active.values()], changedTouches: changed }
    touchListeners[type].slice().forEach((fn) => fn(payload))
  }
  window.addEventListener(
    'pointerdown',
    (e) => {
      const t = { identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }
      active.set(e.pointerId, t)
      fire('touchstart', [t])
    },
    true
  )
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!active.has(e.pointerId)) return
      const t = { identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY }
      active.set(e.pointerId, t)
      fire('touchmove', [t])
    },
    true
  )
  const pointerUp = (e) => {
    if (!active.has(e.pointerId)) return
    active.delete(e.pointerId)
    fire(e.type === 'pointercancel' ? 'touchcancel' : 'touchend', [
      { identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY },
    ])
  }
  window.addEventListener('pointerup', pointerUp, true)
  window.addEventListener('pointercancel', pointerUp, true)
})()`
