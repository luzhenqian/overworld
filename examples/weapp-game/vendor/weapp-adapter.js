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
 *   8.  TextDecoder(仅 utf-8,BMP 正确)        —— GLTFLoader 解析 glTF JSON 块
 *   9.  URL / location 桩                        —— 个别 loader 的字符串操作
 *   10. window.addEventListener 事件注册表        —— 各库注册 resize/visibilitychange 不炸即可
 *   11. devicePixelRatio / innerWidth / innerHeight —— 从 wx.getSystemInfoSync 映射
 *   12. queueMicrotask 兜底                       —— React 调度
 *   13. XMLHttpRequest + fetch / Request / Headers(由 wx.request 支撑)
 *       —— three 的 FileLoader → GLTFLoader → useGLTF 加载 GLB。three r0.170
 *       的 FileLoader 走 fetch();小游戏与 WebGL1 真机都没有 fetch/XHR,故这里
 *       同时补齐:XMLHttpRequest 直连 wx.request(+ getFileSystemManager /
 *       downloadFile 读包内文件),fetch/Request/Headers 只是它上面的薄封装。
 *       仅当 wx.request 存在时安装,并会覆盖宿主的原生实现 —— 这样 wx-shim
 *       (真实浏览器)里跑的与真机同一条链路,不被原生 fetch/XHR 绕过。
 *
 * 显式不做的事:Worker、MessageChannel(React scheduler 会自动退回
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

  // ---- 13. XMLHttpRequest + fetch / Request / Headers(wx.request 支撑)------
  // three r0.170 的 FileLoader 用 fetch();小游戏与老基础库都没有 fetch/XHR。
  // 这里补齐一条完整链路:GLTFLoader → FileLoader → fetch → XMLHttpRequest →
  // wx.request(网络)/ wx.getFileSystemManager().readFile(包内文件)。仅当
  // wx.request 存在时安装,并覆盖宿主原生实现,使 wx-shim 与真机同路。
  if (hasWx && typeof G.wx.request === 'function') {
    var UNSENT = 0,
      OPENED = 1,
      HEADERS_RECEIVED = 2,
      LOADING = 3,
      DONE = 4

    function decodeUtf8(buffer) {
      if (typeof buffer === 'string') return buffer
      var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
      return new G.TextDecoder('utf-8').decode(bytes)
    }

    function XHR() {
      this.readyState = UNSENT
      this.status = 0
      this.statusText = ''
      this.response = null
      this.responseText = ''
      this.responseType = ''
      this.responseURL = ''
      this.timeout = 0
      this.withCredentials = false
      this._method = 'GET'
      this._url = ''
      this._reqHeaders = {}
      this._respHeaders = {}
      this._listeners = {}
      this._task = null
      this._aborted = false
      this.onreadystatechange = null
      this.onloadstart = null
      this.onprogress = null
      this.onload = null
      this.onerror = null
      this.onabort = null
      this.ontimeout = null
      this.onloadend = null
    }
    XHR.UNSENT = UNSENT
    XHR.OPENED = OPENED
    XHR.HEADERS_RECEIVED = HEADERS_RECEIVED
    XHR.LOADING = LOADING
    XHR.DONE = DONE

    XHR.prototype.addEventListener = function (type, fn) {
      ;(this._listeners[type] || (this._listeners[type] = [])).push(fn)
    }
    XHR.prototype.removeEventListener = function (type, fn) {
      var list = this._listeners[type]
      if (!list) return
      var i = list.indexOf(fn)
      if (i !== -1) list.splice(i, 1)
    }
    XHR.prototype._emit = function (type, extra) {
      var event = { type: type, target: this, currentTarget: this }
      if (extra) for (var key in extra) event[key] = extra[key]
      var on = this['on' + type]
      if (typeof on === 'function') on.call(this, event)
      var list = this._listeners[type]
      if (list)
        list.slice().forEach(function (fn) {
          fn.call(this, event)
        }, this)
    }
    XHR.prototype._setReadyState = function (rs) {
      this.readyState = rs
      this._emit('readystatechange')
    }
    XHR.prototype.open = function (method, url) {
      this._method = String(method || 'GET').toUpperCase()
      this._url = String(url)
      this.responseURL = this._url
      this._reqHeaders = {}
      this._setReadyState(OPENED)
    }
    XHR.prototype.setRequestHeader = function (k, v) {
      this._reqHeaders[k] = v
    }
    XHR.prototype.getAllResponseHeaders = function () {
      var h = this._respHeaders
      var out = ''
      for (var k in h)
        if (Object.prototype.hasOwnProperty.call(h, k)) out += k.toLowerCase() + ': ' + h[k] + '\r\n'
      return out
    }
    XHR.prototype.getResponseHeader = function (name) {
      var lower = String(name).toLowerCase()
      var h = this._respHeaders
      for (var k in h) if (k.toLowerCase() === lower) return h[k]
      return null
    }
    XHR.prototype.abort = function () {
      this._aborted = true
      if (this._task && typeof this._task.abort === 'function') {
        try {
          this._task.abort()
        } catch (_e) {}
      }
      this._emit('abort')
      this._emit('loadend')
    }
    XHR.prototype._succeed = function (status, headers, rawData) {
      if (this._aborted) return
      this.status = status
      this.statusText = status === 200 ? 'OK' : String(status)
      this._respHeaders = headers || {}
      var rt = this.responseType
      if (rt === 'arraybuffer') {
        this.response = rawData
      } else if (rt === 'json') {
        try {
          this.response = JSON.parse(decodeUtf8(rawData))
        } catch (_e) {
          this.response = null
        }
      } else {
        var text = decodeUtf8(rawData)
        this.responseText = text
        this.response = text
      }
      this._setReadyState(HEADERS_RECEIVED)
      this._setReadyState(LOADING)
      this._emit('progress', { lengthComputable: false, loaded: 0, total: 0 })
      this._setReadyState(DONE)
      this._emit('load')
      this._emit('loadend')
    }
    XHR.prototype._fail = function (err) {
      if (this._aborted) return
      this.status = 0
      this._setReadyState(DONE)
      this._emit('error', { error: err })
      this._emit('loadend')
    }
    XHR.prototype.send = function (body) {
      var self = this
      this._emit('loadstart')
      var wantsBuffer = this.responseType === 'arraybuffer'
      var isNetwork = /^(https?:|wxfile:|http:)/i.test(this._url)
      var fs =
        typeof G.wx.getFileSystemManager === 'function' ? G.wx.getFileSystemManager() : null
      if (!isNetwork && fs && typeof fs.readFile === 'function') {
        // 包内/本地文件:走文件系统(真机上模型资源随包内置)。
        var filePath = self._url.charAt(0) === '/' ? self._url.slice(1) : self._url
        fs.readFile({
          filePath: filePath,
          encoding: wantsBuffer ? undefined : 'utf8',
          success: function (res) {
            self._succeed(200, {}, res.data)
          },
          fail: function (err) {
            self._fail(err)
          },
        })
        return
      }
      // 网络请求(以及 wx-shim 里的相对路径)→ wx.request
      this._task = G.wx.request({
        url: this._url,
        method: this._method,
        header: this._reqHeaders,
        data: body,
        responseType: wantsBuffer ? 'arraybuffer' : 'text',
        dataType: '其他', // 原样返回,不让 wx 擅自 JSON.parse
        success: function (res) {
          self._succeed(res.statusCode || 200, res.header || {}, res.data)
        },
        fail: function (err) {
          self._fail(err)
        },
      })
    }

    // --- fetch / Request / Headers:XHR 之上的薄封装 -------------------------
    function Hdrs(init) {
      this._map = {}
      if (init) {
        if (typeof init.forEach === 'function') {
          init.forEach(function (v, k) {
            this._map[String(k).toLowerCase()] = v
          }, this)
        } else {
          for (var k in init)
            if (Object.prototype.hasOwnProperty.call(init, k))
              this._map[String(k).toLowerCase()] = init[k]
        }
      }
    }
    Hdrs.prototype.get = function (name) {
      var v = this._map[String(name).toLowerCase()]
      return v == null ? null : v
    }
    Hdrs.prototype.has = function (name) {
      return Object.prototype.hasOwnProperty.call(this._map, String(name).toLowerCase())
    }
    Hdrs.prototype.set = function (name, value) {
      this._map[String(name).toLowerCase()] = value
    }
    Hdrs.prototype.append = Hdrs.prototype.set
    Hdrs.prototype.forEach = function (cb, thisArg) {
      var m = this._map
      for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) cb.call(thisArg, m[k], k, this)
    }

    function Req(input, init) {
      init = init || {}
      if (input && typeof input === 'object' && 'url' in input) {
        this.url = input.url
        this.method = init.method || input.method || 'GET'
        this.headers = init.headers ? new Hdrs(init.headers) : input.headers || new Hdrs()
      } else {
        this.url = String(input)
        this.method = init.method || 'GET'
        this.headers = new Hdrs(init.headers)
      }
      this.credentials = init.credentials || 'same-origin'
      this.body = init.body
    }

    function makeResponse(url, status, statusText, buffer, xhr) {
      return {
        url: url,
        status: status,
        statusText: statusText,
        ok: (status >= 200 && status < 300) || status === 0,
        redirected: false,
        type: 'basic',
        bodyUsed: false,
        // body 恒为 undefined:让 three 的 FileLoader 走非流式(response.arrayBuffer())分支。
        body: undefined,
        headers: {
          get: function (n) {
            return xhr.getResponseHeader(n)
          },
        },
        arrayBuffer: function () {
          return Promise.resolve(buffer)
        },
        text: function () {
          return Promise.resolve(decodeUtf8(buffer))
        },
        json: function () {
          return Promise.resolve(JSON.parse(decodeUtf8(buffer)))
        },
        clone: function () {
          return makeResponse(url, status, statusText, buffer, xhr)
        },
      }
    }

    function fetchPolyfill(input, init) {
      init = init || {}
      var isReq = input && typeof input === 'object' && 'url' in input
      var url = isReq ? input.url : String(input)
      var method = init.method || (isReq && input.method) || 'GET'
      var rawHeaders = init.headers || (isReq && input.headers) || {}
      var headers = rawHeaders instanceof Hdrs ? rawHeaders : new Hdrs(rawHeaders)
      var body = init.body != null ? init.body : isReq ? input.body : undefined
      return new Promise(function (resolve, reject) {
        var xhr = new XHR()
        xhr.open(method, url)
        xhr.responseType = 'arraybuffer'
        headers.forEach(function (v, k) {
          try {
            xhr.setRequestHeader(k, v)
          } catch (_e) {}
        })
        xhr.onload = function () {
          resolve(makeResponse(url, xhr.status || 200, xhr.statusText || 'OK', xhr.response, xhr))
        }
        xhr.onerror = function () {
          reject(new TypeError('Network request failed: ' + url))
        }
        xhr.onabort = function () {
          reject(new TypeError('Request aborted: ' + url))
        }
        xhr.send(body)
      })
    }

    G.XMLHttpRequest = XHR
    G.fetch = fetchPolyfill
    G.Request = Req
    G.Headers = Hdrs
  }
})()
