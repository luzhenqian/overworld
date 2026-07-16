/**
 * esbuild 打包:src/game.ts → dist/bundle.js,并把小游戏工程文件
 * (game.js / game.json / project.config.json / vendor/)拷进 dist/,
 * 使 dist/ 成为可被微信开发者工具直接打开的小游戏项目。
 *
 * 用法:
 *   node build.mjs             # 调试构建:不压缩(可读栈帧)+ __DEBUG__=true(暴露 __game 句柄)
 *   node build.mjs --minify    # 发布构建:压缩 + __DEBUG__=false
 *
 * 产物格式 iife:小游戏的 require() 与浏览器 <script> 都能直接执行。
 */
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const minify = process.argv.includes('--minify')

/**
 * 单实例别名:pnpm 下同版本的 fiber/zustand 会因 peer 组合不同存在多份实例
 * (packages/scene、adapters-weapp 与本模板各链一份)。React context 要求
 * 全局唯一,esbuild alias 对所有 importer 生效,统一指到本模板的实例。
 */
const local = (name) => path.join(dir, 'node_modules', name)
const alias = {
  react: local('react'),
  three: local('three'),
  // 注意:不 alias zustand —— fiber v8 内部依赖 zustand@3(default 导出),
  // 引擎侧用 v5;zustand 无全局状态,多副本无害,强行统一反而会炸。
  '@react-three/fiber': local('@react-three/fiber'),
}

const outDir = path.join(dir, 'dist')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [path.join(dir, 'src/game.ts')],
  outfile: path.join(outDir, 'bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2017',
  jsx: 'automatic',
  minify,
  legalComments: 'none',
  alias,
  define: {
    __DEBUG__: minify ? 'false' : 'true',
    // React 一律走生产路径(开发版体积与告警对小游戏无益);
    // 调试性由「不压缩」保障。
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
})

// 小游戏工程文件 → dist/
cpSync(path.join(dir, 'game.js'), path.join(outDir, 'game.js'))
cpSync(path.join(dir, 'game.json'), path.join(outDir, 'game.json'))
cpSync(path.join(dir, 'project.config.json'), path.join(outDir, 'project.config.json'))
cpSync(path.join(dir, 'vendor'), path.join(outDir, 'vendor'), { recursive: true })

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2)
const bundleSize = statSync(path.join(outDir, 'bundle.js')).size
console.log(`\n[weapp-game] dist/bundle.js: ${mb(bundleSize)} MB(${minify ? '--minify' : '未压缩,调试构建'})`)
if (bundleSize > 4 * 1024 * 1024) {
  console.log(
    '[weapp-game] 注意:超过小游戏主包 4MB 上限 —— 上传前请用 `node build.mjs --minify`,' +
      '仍超限时考虑分包(game.json subpackages)或把资源挪到 CDN。'
  )
}
