/**
 * 最小化 weapp-adapter —— 为 three.js / @react-three/fiber / React scheduler
 * 在微信小游戏环境里补齐它们会触碰的浏览器全局。
 *
 * 这不是官方 weapp-adapter 的拷贝,而是一份「只补真实缺口」的诚实实现:
 * 每一项都有存在性守卫(缺什么补什么),因此它在真实浏览器里(wx-shim
 * 验证环境)几乎全程 no-op,在微信小游戏里则补齐全部缺口。
 *
 * 被 stub 的能力清单(与其消费方):
 *   1.  window / self / globalThis 别名        —— three、React、zustand 的环境探测
 *   2.  document(createElement / createElementNS
 *       仅支持 'canvas' | 'img',其余返回惰性桩)—— three 的离屏 canvas 与图片加载
 *   3.  wx.createCanvas / wx.createImage 结果补
 *       addEventListener 等 DOM 皮毛            —— WebGLRenderer 监听 webglcontextlost
 *   4.  navigator                               —— three / scheduler 的 UA 探测
 *   5.  requestAnimationFrame 透传               —— 小游戏全局自带 RAF,只兜底 setTimeout
 *   6.  performance.now                          —— fiber 帧循环计时
 *   7.  HTMLCanvasElement / HTMLImageElement /
 *       HTMLVideoElement / HTMLElement / Image   —— three 的 typeof/instanceof 守卫。
 *       注意:这些是空类,instanceof 恒为 false;three r1xx 对 canvas 纹理上传
 *       走鸭子类型(直接 texImage2D),SpriteLabel 等 CanvasTexture 不受影响。
 *   8.  TextDecoder(仅 utf-8,BMP 正确)        —— GLTFLoader;本模板不加载 GLTF,兜底而已
 *   9.  URL / location 桩                        —— 个别 loader 的字符串操作
 *   10. window.addEventListener 事件注册表        —— 各库注册 resize/visibilitychange 不炸即可
 *   11. devicePixelRatio / innerWidth / innerHeight —— 从 wx.getSystemInfoSync 映射
 *   12. queueMicrotask 兜底                       —— React 调度
 *
 * 显式不做的事:XMLHttpRequest / fetch(本模板不发请求;需要 GLTF 时请换用
 * 官方 weapp-adapter)、Worker、MessageChannel(React scheduler 会自动退回
 * setTimeout)、CSS 布局相关的一切。
 */
/* eslint-disable */
'use strict'

;(function () {
  // 小游戏的真实全局是 GameGlobal;浏览器里退回 globalThis。
  var G =
    typeof GameGlobal !== 'undefined'
      ? GameGlobal
      : typeof globalThis !== 'undefined'
        ? globalThis
        : typeof window !== 'undefined'
          ? window
          : this

  var hasWx = typeof G.wx !== 'undefined' && G.wx
  var hasRealDOM =
    typeof G.document !== 'undefined' &&
    G.document &&
    typeof G.document.createElement === 'function' &&
    typeof G.document.createTextNode === 'function'

  // ---- 1. 全局别名 ---------------------------------------------------------
  if (typeof G.globalThis === 'undefined') G.globalThis = G
  if (typeof G.window === 'undefined') G.window = G
  if (typeof G.self === 'undefined') G.self = G

  // ---- 12. queueMicrotask --------------------------------------------------
  if (typeof G.queueMicrotask !== 'function') {
    G.queueMicrotask = function (fn) {
      Promise.resolve().then(fn)
    }
  }

  // ---- 6. performance ------------------------------------------------------
  if (!G.performance || typeof G.performance.now !== 'function') {
    var epoch = Date.now()
    G.performance = {
      now: function () {
        return Date.now() - epoch
      },
    }
  }

  // ---- 5. requestAnimationFrame -------------------------------------------
  // 微信小游戏全局自带 RAF(基础库 ≥1.x);这里只为极端环境兜底 60fps 定时器。
  if (typeof G.requestAnimationFrame !== 'function') {
    G.requestAnimationFrame = function (cb) {
      return setTimeout(function () {
        cb(G.performance.now())
      }, 1000 / 60)
    }
    G.cancelAnimationFrame = function (id) {
      clearTimeout(id)
    }
  }

  // ---- 11. 视口指标 ---------------------------------------------------------
  var systemInfo = null
  function getSystemInfo() {
    if (!systemInfo && hasWx && typeof G.wx.getSystemInfoSync === 'function') {
      systemInfo = G.wx.getSystemInfoSync()
    }
    return systemInfo || { windowWidth: 0, windowHeight: 0, pixelRatio: 1 }
  }
  if (typeof G.devicePixelRatio === 'undefined') G.devicePixelRatio = getSystemInfo().pixelRatio || 1
  if (typeof G.innerWidth === 'undefined') G.innerWidth = getSystemInfo().windowWidth || 0
  if (typeof G.innerHeight === 'undefined') G.innerHeight = getSystemInfo().windowHeight || 0

  // ---- 简易 EventTarget(供 window/document/canvas 桩共用)------------------
  function makeEventTarget(obj) {
    if (typeof obj.addEventListener === 'function') return obj
    var listeners = {}
    obj.addEventListener = function (type, fn) {
      ;(listeners[type] || (listeners[type] = [])).push(fn)
    }
    obj.removeEventListener = function (type, fn) {
      var list = listeners[type]
      if (!list) return
      var i = list.indexOf(fn)
      if (i !== -1) list.splice(i, 1)
    }
    obj.dispatchEvent = function (event) {
      var list = listeners[(event && event.type) || '']
      if (list) {
        list.slice().forEach(function (fn) {
          fn.call(obj, event)
        })
      }
      return true
    }
    return obj
  }
  makeEventTarget(G) // resize / visibilitychange 等注册不炸(小游戏内无人派发)

  // ---- 3. 给 wx 画布/图片补 DOM 皮毛 ----------------------------------------
  function patchCanvasLike(el) {
    if (!el) return el
    makeEventTarget(el)
    if (!el.style) {
      el.style = {
        setProperty: function () {},
        removeProperty: function () {},
      }
    }
    if (typeof el.getBoundingClientRect !== 'function') {
      el.getBoundingClientRect = function () {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: el.width || 0,
          bottom: el.height || 0,
          width: el.width || 0,
          height: el.height || 0,
        }
      }
    }
    if (typeof el.focus !== 'function') el.focus = function () {}
    if (typeof el.blur !== 'function') el.blur = function () {}
    if (!el.ownerDocument) el.ownerDocument = G.document
    return el
  }

  // 包一层 wx.createCanvas / wx.createImage:任何来源(适配层直接调用、
  // document.createElement 间接调用)拿到的对象都已被补齐。首个 canvas 即
  // 屏幕主画布的语义由 wx 自身保证,这里不改变调用次序。
  if (hasWx && typeof G.wx.createCanvas === 'function' && !G.wx.__owAdapterWrapped) {
    var rawCreateCanvas = G.wx.createCanvas.bind(G.wx)
    G.wx.createCanvas = function () {
      return patchCanvasLike(rawCreateCanvas())
    }
    if (typeof G.wx.createImage === 'function') {
      var rawCreateImage = G.wx.createImage.bind(G.wx)
      G.wx.createImage = function () {
        var img = patchCanvasLike(rawCreateImage())
        // DOM 风格 load/error 事件 → wx 的 onload/onerror 回调
        var addRaw = img.addEventListener
        img.addEventListener = function (type, fn) {
          if (type === 'load') {
            var prevLoad = img.onload
            img.onload = function (e) {
              if (prevLoad) prevLoad(e)
              fn.call(img, e || { type: 'load' })
            }
            return
          }
          if (type === 'error') {
            var prevError = img.onerror
            img.onerror = function (e) {
              if (prevError) prevError(e)
              fn.call(img, e || { type: 'error' })
            }
            return
          }
          addRaw.call(img, type, fn)
        }
        return img
      }
    }
    G.wx.__owAdapterWrapped = true
  }

  // ---- 2. document 桩 -------------------------------------------------------
  if (!hasRealDOM) {
    var doc = G.document && typeof G.document === 'object' ? G.document : {}
    G.document = doc
    makeEventTarget(doc)
    doc.visibilityState = 'visible'
    doc.hidden = false
    if (!doc.documentElement) {
      doc.documentElement = makeEventTarget({ style: {}, clientWidth: G.innerWidth, clientHeight: G.innerHeight })
    }
    if (!doc.head) doc.head = makeEventTarget({ appendChild: function () {}, removeChild: function () {} })
    if (!doc.body) {
      doc.body = makeEventTarget({
        style: {},
        appendChild: function () {},
        removeChild: function () {},
        clientWidth: G.innerWidth,
        clientHeight: G.innerHeight,
      })
    }
    doc.createElement = function (tag) {
      tag = String(tag).toLowerCase()
      if (tag === 'canvas' && hasWx && typeof G.wx.createCanvas === 'function') {
        return G.wx.createCanvas()
      }
      if (tag === 'img' && hasWx && typeof G.wx.createImage === 'function') {
        return G.wx.createImage()
      }
      // 其余标签给个惰性桩,足够撑过「创建后并不真正使用」的代码路径。
      return patchCanvasLike({ tagName: tag.toUpperCase(), style: {}, appendChild: function () {}, removeChild: function () {} })
    }
    doc.createElementNS = function (_ns, tag) {
      return doc.createElement(tag)
    }
    doc.createTextNode = function (text) {
      return { textContent: String(text) }
    }
    doc.getElementById = function () {
      return null
    }
    doc.querySelector = function () {
      return null
    }
  }

  // ---- 7. 元素构造器桩 ------------------------------------------------------
  // 仅让 typeof X !== 'undefined' 守卫通过;instanceof 恒为 false(见文件头注释)。
  if (typeof G.HTMLElement === 'undefined') G.HTMLElement = function HTMLElement() {}
  if (typeof G.HTMLCanvasElement === 'undefined') G.HTMLCanvasElement = function HTMLCanvasElement() {}
  if (typeof G.HTMLImageElement === 'undefined') G.HTMLImageElement = function HTMLImageElement() {}
  if (typeof G.HTMLVideoElement === 'undefined') G.HTMLVideoElement = function HTMLVideoElement() {}
  if (typeof G.Image === 'undefined') {
    G.Image = function Image() {
      if (hasWx && typeof G.wx.createImage === 'function') return G.wx.createImage()
      throw new Error('[weapp-adapter] Image 不可用:缺少 wx.createImage')
    }
  }

  // ---- 4. navigator ---------------------------------------------------------
  if (typeof G.navigator === 'undefined' || !G.navigator) {
    var info = getSystemInfo()
    G.navigator = {
      userAgent: 'overworld-weapp-adapter (WeChat MiniGame; ' + (info.platform || 'unknown') + ')',
      platform: info.platform || 'WeChat',
      language: 'zh-CN',
      languages: ['zh-CN'],
      onLine: true,
      maxTouchPoints: 10,
    }
  }

  // ---- 8. TextDecoder(utf-8 兜底,BMP 范围正确)----------------------------
  if (typeof G.TextDecoder === 'undefined') {
    G.TextDecoder = function TextDecoder() {}
    G.TextDecoder.prototype.decode = function (buffer) {
      var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
      var out = ''
      for (var i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
      }
      try {
        return decodeURIComponent(escape(out))
      } catch (_e) {
        return out // 非法序列时按 latin1 返回,好过直接抛错
      }
    }
  }

  // ---- 9. URL / location ----------------------------------------------------
  if (typeof G.URL === 'undefined') {
    G.URL = function URL(href) {
      this.href = String(href)
    }
    G.URL.createObjectURL = function () {
      console.warn('[weapp-adapter] URL.createObjectURL 在小游戏内不可用(返回空串)')
      return ''
    }
    G.URL.revokeObjectURL = function () {}
  }
  if (typeof G.location === 'undefined') {
    G.location = {
      href: 'wxgame://index',
      origin: 'wxgame://',
      protocol: 'wxgame:',
      host: '',
      hostname: '',
      pathname: '/index',
      search: '',
      hash: '',
      reload: function () {},
    }
  }
})()
