# Overworld · Capacitor 移动端模板(iOS + Android)

把 [starter](../starter) 的玩法裁剪版装进 Capacitor 壳:同一份 web 构建,
生成 Xcode / Android Studio 原生工程。演示安全区适配(刘海屏)、
虚拟摇杆默认开启、Android 返回键与状态栏悬浮配置。

保留玩法:场景 + 玩家移动 + 任务链(含持久化存档)+ 对话 + 背包 + HUD
(触屏加"💬 交谈"按钮)。相比 starter 裁剪掉:i18n(文案内联中文)、
场景编辑器、跨标签页联机、AI 村民、成就、昼夜循环、小地图。

## 平台接线一览

| 能力 | 用法 |
|---|---|
| 平台检测 | `detectPlatform()` → 壳内为 `'capacitor'`(识别 `window.Capacitor`),浏览器直开为 `'web'` |
| 生命周期 | capacitorBridge 监听 App 插件 `pause/resume/backButton` → 总线 `app:paused/resumed/back`(main.tsx 顶部 `import '@capacitor/app'` 完成插件 JS 注册,不能省) |
| 返回键约定 | `app:back`(Android 返回键):对话打开时 `dialogue.end()`,否则不处理 |
| 安全区 | `index.html` 的 `viewport-fit=cover` + HUD 各角 `calc(16px + env(safe-area-inset-*))`(src/ui/HUD.tsx) |
| 状态栏 | main.tsx 动态探测 `@capacitor/status-bar`:`setOverlaysWebView({ overlay: true })`,3D 画面全面屏 |
| 存档 | `bridge.storage()`(WebView localStorage)喂给任务引擎 `persist.storage` |
| 画质 | `recommendedQualityPreset()` 对 capacitor 封顶 medium(低端机兜底) |
| 触控 | 手机上 `shouldShowTouchControls()` 为 true → 虚拟摇杆默认挂载 |

## 前置工具

- Node.js ≥ 20、pnpm ≥ 9(仓库根目录 `pnpm install` 已装好 JS 依赖)
- **iOS**:macOS + Xcode ≥ 16(App Store 下载),Capacitor 8 用 Swift Package
  Manager 管插件,**不需要 CocoaPods**;真机部署需要 Apple 开发者账号
- **Android**:Android Studio(含 SDK Platform 及 Build-Tools),
  `ANDROID_HOME` 指向 SDK;真机打开开发者模式 + USB 调试

## 从零到真机

```bash
# 仓库根目录
pnpm install
pnpm build                    # 构建 workspace 内的 @overworld-engine/* 包

cd examples/mobile-capacitor
pnpm dev                      # 纯浏览器调玩法(桌面浏览器,web 回退模式)
pnpm build                    # 产出 dist/(cap 的 webDir)

# 生成原生工程(ios/ 与 android/ 已 gitignore,克隆后需要重新生成)
pnpm exec cap add ios
pnpm exec cap add android

# 每次改完 web 代码后:构建 + 同步进原生工程
pnpm cap:sync                 # = pnpm build && cap sync

# 打开原生 IDE 跑真机/模拟器
pnpm cap:ios                  # = cap open ios(Xcode:选团队签名后 Run)
pnpm cap:android              # = cap open android(Android Studio:直接 Run)
```

- iOS 真机:Xcode 里 Signing & Capabilities 选择你的 Team(免费账号可真机
  调试 7 天有效期),Bundle Identifier 已配为 `com.overworld.mobile`。
- Android 真机:插线后 Android Studio 设备列表直接选真机 Run,无需账号。

## 与 web 版的差异点

- **安全区**:浏览器里 `env(safe-area-inset-*)` 全为 0,HUD 布局不变;
  真机刘海/手势条区域会自动让位(状态栏悬浮由 main.tsx 配置)。
- **返回键**:Android 物理/手势返回不再走浏览器 history,而是
  `app:back` 事件,由游戏决定行为(本模板:关对话,否则交还系统默认)。
- **交互方式**:无键盘,移动靠虚拟摇杆,NPC 交谈用 HUD 的"💬 交谈"按钮
  (调用 scene 的 `interact()`,等价于桌面端 E 键)。
- **切后台**:App 插件的 pause/resume 比浏览器 visibilitychange 更可靠,
  游戏可订阅 `app:paused` 做自动暂停/静音。
- **画质**:默认压到 medium,可在游戏内再让玩家上调。

## 上架/审核注意事项

- **App Store(iOS)**:
  - 纯 WebView 包网页的应用有 4.2(最低功能性)拒审风险 —— 游戏本体
    在包内(`webDir` 打进 ipa)、离线可玩,属于合规形态;不要做远程加载
    整包代码的"热更新"(违反 3.3.2)。
  - 需要 1024 图标、各尺寸截图、隐私清单(本模板不采集数据,可声明
    "不收集");上传用 Xcode Organizer 或 Transporter。
- **Google Play(Android)**:
  - 生成签名密钥(`keytool`)并在 Android Studio 里 Build > Generate Signed
    App Bundle 产 .aab;Play 要求 target SDK 跟随年度政策更新。
  - WebView 游戏合规,同样避免下发可执行代码的热更新。
- **图标/启动屏**:`cap add` 生成的是 Capacitor 默认图标,发布前用
  `@capacitor/assets` 从一张 1024 图生成全套:
  `pnpm dlx @capacitor/assets generate`。
- **版本锁定**:模板锁 Capacitor 8 大版本;升级大版本时按官方迁移指南
  重新 `cap sync` 并 diff 原生工程。
