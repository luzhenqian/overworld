# @overworld/analytics

Provider 无关的埋点抽象:游戏代码只调用 `track` / `trackPage`,事件自动扇出
(fan out)到所有已配置的 Provider。内置 GA4、Microsoft Clarity(均为纯脚本
注入实现,零第三方依赖)与 console Provider;也可以实现自己的 Provider 接入
任意后端。所有浏览器 API 均有守卫,Node / SSR 下安全降级为 no-op。

## 快速开始

```ts
import { configureAnalytics, ga4Provider, clarityProvider, consoleProvider, track, trackPage } from '@overworld/analytics'

configureAnalytics({
  providers: [
    ga4Provider('G-XXXXXXX'),
    clarityProvider('clarity-project-id'),
    consoleProvider(), // 开发期调试
  ],
})

track('quest_completed', { questId: 'q1' })
trackPage('/town')
```

要点:

- **懒初始化**:Provider 的 `init()` 在首次 `track`/`trackPage` 时才执行。
- **错误隔离**:任一 Provider 的 `init`/`trackEvent`/`trackPage` 抛错只会被
  记录日志,不影响其他 Provider,更不会影响游戏;`init` 抛错的 Provider 会被
  跳过,不再重试。
- `resetAnalytics()` 清空配置与初始化状态(主要用于测试)。

## Provider 接口

```ts
interface AnalyticsProvider {
  name: string
  init(): void | Promise<void>
  trackEvent(name: string, params?: Record<string, unknown>): void
  trackPage(path: string): void
}
```

内置实现:

- `ga4Provider(measurementId, options?)` — 注入 gtag.js;事件名自动规范化为
  GA4 允许的字符(如 `quest:completed` → `quest_completed`);默认关闭自动
  page_view 并开启 IP 匿名化。
- `clarityProvider(projectId)` — 注入 Clarity 标准队列片段;`trackPage` 以
  session tag 记录路径。
- `consoleProvider(options?)` — 输出到控制台。

## 自动追踪框架事件

```ts
import { gameEvents } from '@overworld/core'
import { bindAnalyticsToBus } from '@overworld/analytics'

const unbind = bindAnalyticsToBus(gameEvents, {
  events: ['quest:completed', 'achievement:unlocked'], // 省略则转发全部事件
})
```

基于 `bus.onAny` 把总线事件转发为 `track(事件名, payload)`,返回退订函数。

## React

```tsx
const { track, trackPage } = useAnalytics() // 引用稳定,可放入依赖数组
```

## 依赖

依赖 `@overworld/core`(仅类型:`EventBus`);peerDependency 为 `react`。
