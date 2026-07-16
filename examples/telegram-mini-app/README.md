# Overworld · Telegram Mini App 模板

把 [starter](../starter) 的玩法裁剪版包进 Telegram Mini App:同一份 web 代码,
在浏览器直开时按普通网页运行,在 Telegram 里自动接上 BackButton、主题色与生命周期。

保留玩法:场景 + 玩家移动 + 任务链(含持久化存档)+ 对话 + 背包 + HUD。
相比 starter 裁剪掉:i18n(文案内联中文)、场景编辑器、跨标签页联机、AI 村民、
成就、昼夜循环、小地图 —— 让模板聚焦"如何接平台"。

## 平台接线一览(src/game/platform.ts / main.tsx)

| 能力 | 用法 |
|---|---|
| 平台检测 | `detectPlatform()` → 在 TG 内为 `'telegram'`,浏览器直开为 `'web'` |
| 生命周期 | `createBridge().bindLifecycle(gameEvents)`:切后台 → `app:paused/resumed`,BackButton → `app:back` |
| 返回键约定 | `app:back`:对话打开时 `dialogue.end()` 关闭对话,否则不处理(交还 Telegram 默认收起行为) |
| 初始化 | `ready()` + `expand()` 由 telegramBridge 在装配时自动调用 |
| 主题 | `themeParams` → `--hud-panel-bg / --hud-accent / --hud-text / --hud-panel-border` CSS 变量(main.tsx `applyTelegramTheme`) |
| 存档 | `bridge.storage()` 喂给任务引擎的 `persist.storage` —— 刷新后任务进度仍在 |
| 画质 | `useQualityStore.setPreset(recommendedQualityPreset())`(telegram 端最多 medium) |
| 触控 | `shouldShowTouchControls()` 为 true 时挂载 `<VirtualJoystick>` |

## 前置工具

- Node.js ≥ 20、pnpm ≥ 9(仓库根目录 `pnpm install` 已装好全部依赖)
- 一个 Telegram 账号(创建 bot 用)
- 上线需要一个 **HTTPS** 可访问的静态站(Telegram 强制 HTTPS,本地调试见下)

## 从零到跑起来

```bash
# 仓库根目录
pnpm install
pnpm build            # 先构建 workspace 内的 @overworld-engine/* 包

# 本模板
cd examples/telegram-mini-app
pnpm dev              # 浏览器直开 http://localhost:5173(web 回退模式,无 TG 能力)
pnpm build            # 产出 dist/(部署物)
```

浏览器直开时 `window.Telegram` 不存在,platform 桥自动回退 web 行为,可正常开发玩法。

## 在 Telegram 里跑(从零到真机)

1. **创建 bot**:Telegram 里找 [@BotFather](https://t.me/BotFather) → `/newbot`,
   按提示取名,拿到 bot token(本模板纯前端,不需要用 token 调 Bot API)。
2. **部署 dist/ 到 HTTPS**:任意静态托管都行。本仓库约定用 Ship Dock:
   `pnpm build` 后把 `dist/` 部署为静态站点,拿到 `https://<你的域名>/`。
3. **注册 Mini App**:对 @BotFather 发 `/newapp` → 选择上一步的 bot →
   填标题/描述/图片 → **Web App URL 填第 2 步的 HTTPS 地址** → 设置短名称。
   完成后得到 `https://t.me/<bot名>/<短名称>` 直达链接。
4. **真机打开**:手机 Telegram 打开直达链接即进入游戏;`ready()/expand()`
   自动执行,进对话后左上角出现 BackButton,点击即关闭对话。

### 本地调试的两条路

- **web 直开(mock 思路)**:`pnpm dev` 直接调玩法;需要验证 TG 接线时跑
  `node e2e.mjs`(见下),它注入官方 `window.Telegram.WebApp` 的 mock。
- **BotFather test environment**:@BotFather 支持 test env
  (Telegram 客户端切 test 服,test env 里的 Mini App **允许 http 地址**,
  可直接填 `http://<局域网IP>:5173`),适合真机联调。步骤:客户端多次点击
  设置里的版本号进入 debug 菜单切换 test 服 → 在 test 服里重新走 /newbot + /newapp。

## E2E 验证

```bash
pnpm build
# playwright 不是模板依赖;指向任意装有 playwright 的目录
PLAYWRIGHT_ROOT=/path/to/dir-with-playwright node e2e.mjs
```

脚本自动起 `vite preview`,在页面脚本执行前注入 TG mock 并断言:
平台检测 = telegram、`ready/expand` 已调用、BackButton 处理器已注册、
`app:back` 能关闭打开中的对话、主题色已写入 CSS 变量。

## 与 web 版的差异点

- **返回键**:web 没有 BackButton;TG 里 BackButton 显示/隐藏由游戏控制
  (对话打开才显示),点击走 `app:back` 事件而不是浏览器 history。
- **视口**:TG 的 WebView 高度会随键盘/手势变化,模板用 `expand()` 撑满,
  并禁用页面滚动(`overflow: hidden` + `user-scalable=no`)。
- **主题**:UI 底色/强调色跟随用户的 Telegram 主题,而不是写死的深色。
- **存档**:仍是 localStorage(TG WebView 持久);进阶可把 TG 的
  `CloudStorage` 包成 `EnumerableStorage` 适配器喂给 `persist.storage`,
  或用 `createRestStorage` 指向游戏后端做云存档。
- **画质**:`recommendedQualityPreset()` 对 telegram 封顶 medium(移动端 WebView)。

## 上架/审核注意事项

- **HTTPS 强制**:正式环境 Web App URL 必须是有效证书的 HTTPS。
- **外链**:站内跳外部链接用 `bridge.openExternal()`(内部走 `openLink`),
  不要 `window.location` 直跳,否则会把 Mini App 导航走。
- **支付红线**:数字商品必须走 Telegram Stars(Bot Payments API),
  不允许绕过的第三方支付。
- **包体**:首屏资源尽量精简(移动网络);three.js 场景建议开启
  构建分包与资源懒加载。
- **隐私**:`initData` 含用户信息,校验要放在你自己的后端做
  (校验 hash),前端不要信任它。
