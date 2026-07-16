# weapp-game —— 微信小游戏完整 3D 模板

Overworld v1.1 的正式交付物之一:在**微信小游戏**里跑完整 3D(设计文档 §4.1 / §6.4)。
技术路径:`vendor/weapp-adapter.js`(浏览器全局补齐)+ `@overworld-engine/adapters-weapp`
的 `createWeappCanvasRoot`(R3F 底层 `createRoot`,不依赖 react-dom)。

玩法移植自 `examples/starter` 的水晶收集流程:左半屏浮动摇杆移动,走近 NPC 后
点右半屏交谈接任务,收集 3 颗水晶完成任务链;任务进度经 `createWeappStorage`
持久化到 wx 存储,重进游戏自动恢复。

## 目录结构

```
game.js / game.json / project.config.json   小游戏工程三件套(构建时拷入 dist/)
vendor/weapp-adapter.js                     最小适配器(补 window/document/navigator 等,逐项有注释)
src/game.ts                                 启动序列:extend(THREE) → 桥注册 → 画布根 → 摇杆 → 渲染
src/World.tsx                               3D 场景:NPC(sprite 名牌)+ 水晶 + Player + 头顶 SpriteLabel HUD
src/content.ts / src/engines.ts             内容数据与无头引擎接线(任务/对话/背包)
build.mjs                                   esbuild 打包(dist/ 即可打开的小游戏项目)
e2e/                                        wx-shim 浏览器验证 harness(见下)
```

## 构建与在微信开发者工具中打开

```bash
pnpm build              # 调试构建(不压缩,含 __game 调试句柄),产出 dist/
node build.mjs --minify # 发布构建:bundle.js ≈ 1.0 MB(调试构建约 2.0 MB)
```

1. 安装并打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html),微信扫码登录;
2. 「导入项目」→ 目录选择本模板的 **`dist/`**;
3. AppID:有小游戏 AppID 就填自己的(同时改 `project.config.json` 的 `appid`),
   没有则选「游客模式」(模板占位 `touristappid`);
4. 项目类型确认为**小游戏**(`compileType: "game"` 已配好),编译即可看到 3D 场景。

## 真机预览

1. 开发者工具工具栏点「预览」,等待上传完成生成二维码;
2. 手机微信扫码(游客模式仅登录者本人可预览);
3. 真机确认点:摇杆移动、走近 NPC 点右半屏对话、拾取水晶、杀进程重进后任务进度仍在。

## 已知约束(设计文档 §4.1)

- **无射线拾取**:适配层不接 R3F pointer 事件(`events: undefined`),mesh 的
  `onClick` 等不会触发。本模板的交互 = 邻近检测 + 右半屏点按 `interact()`;
  对话推进为「点按自动选第一个可选回应」——刻意简化,演示引擎的效果/条件链,
  正式游戏请自行渲染回应列表。
- **文字标签只用 SpriteLabel**:drei `<Text>`(troika)在小游戏不可用。本模板
  绕过 `SceneShell` 直接组合 `BaseNPC labelMode="sprite"` + `useProximityDetection`
  + `CollisionRegistration`(SceneShell 暂未透传 labelMode)。
- **包体**:发布构建约 1.0 MB(three.js 占大头),距主包 4 MB 上限尚有余量;
  引入模型/贴图后若超限,用 `game.json` 的 `subpackages` 分包或把资源放
  CDN(域名需加业务域名白名单,经 adapter 的 XHR 加载)。
- **基础库 ≥ 2.19**(`project.config.json` 已锁 2.19.4);three r170 需要
  WebGL2,低端旧机型不支持时无法降级 WebGL1(three 已移除 WebGL1 路径)。
- `vendor/weapp-adapter.js` 是**最小实现**(文件头列明全部 stub 项),没有
  XHR/fetch polyfill;需要 `useGLTF` 加载模型时请换官方 weapp-adapter。

## wx-shim 验证 harness(CI 用)

微信开发者工具无法进 CI,本模板的正式回归验证是 `e2e/`:在真实浏览器(playwright)
里于页面脚本执行前注入模拟 `wx` 全局(`e2e/wx-shim.mjs`),canvas/触摸/存储由
**真实浏览器能力**支撑 —— 适配层与游戏代码 100% 在真 WebGL 上跑通:

```bash
pnpm build
node e2e/run.mjs        # playwright 解析顺序:$PLAYWRIGHT_ROOT/node_modules → 内置 scratchpad 路径
```

断言:渲染循环 + 读像素非空白、真实指针拖拽驱动摇杆与「步行」目标、邻近检测
→ 点按开启对话 → 任务链(welcome + gather-crystals)全部完成、金币奖励、
`overworld:quest` 持久化落盘;截图存 `e2e/shots/`。全部无头通过。

开发者工具真机预览作为最终人工确认(上节步骤),不进 CI。
