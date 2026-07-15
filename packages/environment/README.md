# @overworld/environment

昼夜循环 + 天气系统。无头引擎(zustand store 工厂)+ 可选的 R3F 渲染组件,
内容全部注入 —— 引擎不含任何硬编码的天气名称或美术参数。

## 安装

```bash
pnpm add @overworld/environment @overworld/core
# peers: react zustand three @react-three/fiber
```

## 快速开始

```tsx
import {
  createEnvironment, DEFAULT_WEATHERS,
  EnvironmentTick, DayNightLighting, WeatherVisuals,
  RainParticles, SnowParticles,
} from '@overworld/environment'

const environment = createEnvironment({
  dayLengthMs: 10 * 60 * 1000,     // 一个游戏日 = 现实 10 分钟(默认)
  weathers: DEFAULT_WEATHERS,      // 或注入你自己的 WeatherDefinition[]
  persist: true,                   // 省略/false=关闭;true=默认;对象=自定义
})

function World() {
  return (
    <>
      <EnvironmentTick engine={environment} />
      <DayNightLighting engine={environment} />
      <WeatherVisuals
        engine={environment}
        weatherEffects={{ rain: <RainParticles />, snow: <SnowParticles /> }}
      />
    </>
  )
}
```

## 无头引擎

`createEnvironment(config)` 返回 `Environment`:

- `store` — zustand vanilla store,状态含 `timeOfDay`(0–1,0=午夜)、
  `phase`(`'dawn' | 'day' | 'dusk' | 'night'`)、`paused`、`currentWeather`、
  `weatherElapsedMs` / `weatherDurationMs`。React 中用 `useStore(engine.store, selector)` 订阅。
- `tick(deltaMs)` — 推进时间(过 1 自动回绕)与天气计时;`paused` 时为空操作。
- `setTimeOfDay(t)` / `setPaused(p)` / `setWeather(id)` / `registerWeathers(defs)`
- `getPhase()` / `getWeather()` / `phases`(合并默认值后的阶段边界)

### 配置

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `dayLengthMs` | 一个游戏日的现实时长 | `600000` |
| `initialTimeOfDay` | 起始时间(0–1) | `0.5` |
| `phases` | 阶段边界覆写 `{ dawn, day, dusk, night }`(各阶段起点,需递增) | `0.2 / 0.3 / 0.7 / 0.8` |
| `weathers` | `{ id, weight?, minDurationMs?, maxDurationMs? }[]`,省略则无天气 | — |
| `initialWeather` | 起始天气 id | 列表第一项 |
| `events` | 事件总线,测试时注入独立 `EventBus` | 全局 `gameEvents` |
| `random` | 随机源,注入可获得确定性(每次时长掷 1 次、加权抽取掷 1 次) | `Math.random` |
| `persist` | `boolean \| EnvironmentPersistConfig`,仅保存 `timeOfDay` + `currentWeather` | 关闭 |

天气到期后按 `weight` 加权抽取下一种;抽中当前天气时只重掷时长、不发事件。

### 事件(经 declaration merging 并入框架事件表)

- `environment:phase-changed` — `{ phase, timeOfDay }`,仅在阶段切换时发出。
- `environment:weather-changed` — `{ from: string | null, to: string }`。

```ts
gameEvents.on('environment:phase-changed', ({ phase }) => { /* 完全类型化 */ })
```

## R3F 组件

- `<EnvironmentTick engine />` — 用 `useFrame` 驱动 `tick(delta)`,Canvas 内挂一次。
- `<DayNightLighting engine ambientIntensity? ambientColor? sunIntensity? sunColor? sunPosition? castShadow? />`
  — ambient + directional 光,强度/颜色随平滑日光曲线在 `{ day, night }` 两组值之间插值
  (黎明/黄昏渐变,曲线由 `getDaylightFactor(timeOfDay, phases)` 导出,可复用于天空色、雾等)。
- `<RainParticles count? area? position? color? speed? size? opacity? />` /
  `<SnowParticles ... drift? />` — 基于 `THREE.Points` 的通用粒子;雪带按粒子相位的横向摆动。
- `<WeatherVisuals engine weatherEffects={{ rain: <RainParticles/>, ... }} />`
  — 天气 id → 节点的映射(内容注入),无映射的 id(如 `clear`)不渲染。

## 纯函数导出

`derivePhase` / `getDaylightFactor` / `wrapTimeOfDay` / `validatePhaseBoundaries` /
`DEFAULT_PHASES` / `DEFAULT_WEATHERS` / `DEFAULT_WEATHER_MIN_DURATION_MS`。

## 测试

```bash
pnpm test        # vitest,21 个用例覆盖时间回绕/阶段事件/天气轮换/持久化
```
