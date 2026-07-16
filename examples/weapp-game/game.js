/**
 * 微信小游戏入口(会随构建原样拷贝进 dist/)。
 *
 * 顺序至关重要:必须先加载 weapp-adapter(补齐 window/document/navigator 等
 * 浏览器全局),再加载打包产物 —— three.js / React 的模块级代码在加载瞬间
 * 就会触碰这些全局。
 */
require('./vendor/weapp-adapter.js')
require('./bundle.js')
