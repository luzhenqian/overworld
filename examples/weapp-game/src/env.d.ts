/**
 * 构建期常量:由 build.mjs 的 esbuild define 注入。
 * 默认构建为 true(暴露 __game 调试句柄、开启 preserveDrawingBuffer 供 e2e
 * 读像素);`node build.mjs --minify` 时为 false。
 */
declare const __DEBUG__: boolean
