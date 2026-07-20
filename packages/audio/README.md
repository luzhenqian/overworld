# @overworld-engine/audio

BGM / 音效管理器:单例 HTMLAudio 池、切曲淡入淡出、浏览器自动播放策略处理
(首次用户交互后自动重试)、可选的音量与静音设置持久化(经 `persist` 显式开启),
并可订阅事件总线上的 `scene:changed` 事件自动切换场景 BGM。

包内**零游戏内容**:曲目表、场景映射全部由配置注入。所有浏览器 API 均有守卫,
在 Node / SSR / 测试环境中导入和创建不会崩溃(仅记录状态、不实际播放)。

## 快速开始

```ts
import { createAudioManager } from '@overworld-engine/audio'

const audio = createAudioManager({
  tracks: {
    town: '/bgm/town.mp3',
    dungeon: '/bgm/dungeon.mp3',
    pickup: '/sfx/pickup.mp3',
  },
  sceneTracks: { plaza: 'town', crypt: 'dungeon' }, // 场景 id → 曲目 id
})

// 之后每次 gameEvents.emit('scene:changed', ...) 都会自动切换 BGM
audio.playSfx('pickup') // 一次性音效
```

## 配置(`AudioManagerConfig`)

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `tracks` | 必填 | 曲目 id → 音频 URL(BGM 与音效共用) |
| `sceneTracks` | — | 场景 id → 曲目 id;未映射的场景会停止当前 BGM |
| `autoSubscribeSceneChanges` | `true` | 订阅总线 `scene:changed` 自动换曲 |
| `events` | 全局 `gameEvents` | 自定义事件总线(测试时传入新实例);`bus` 是保留的旧别名,两者同传时 `events` 优先 |
| `volume` / `sfxVolume` | `0.7` | 初始 BGM / 音效音量(0–1) |
| `fadeDuration` | `1000` | 切曲淡入淡出时长(ms),`0` 表示立即切换 |
| `loop` | `true` | BGM 是否循环 |
| `persist` | 省略(关闭) | 框架统一约定:省略或 `false` 不持久化;`true` 用默认配置持久化音量/静音(键 `overworld:audio`);可传对象自定义。v0.9 起省略即关闭(此前默认开启),依赖持久化请显式传 `persist: true` |

## Manager API

- `store` — 底层 zustand vanilla store(`StoreApi<AudioState>`),状态为
  `{ volume, sfxVolume, muted, currentTrackId, unlocked }`;`getState()` 取快照,
  React 里用 zustand 的 `useStore`:

  ```tsx
  import { useStore } from 'zustand'

  const muted = useStore(audio.store, (s) => s.muted)
  ```

- `playTrack(trackId)` / `stopTrack()` — 播放 / 停止 BGM(带淡入淡出)
- `playSceneTrack(sceneId)` — 按场景映射播放;`resolveSceneTrack(sceneId)` 仅做解析
- `playSfx(trackId)` — 一次性音效
- `setVolume(v)` / `setSfxVolume(v)` — 音量(自动钳制到 0–1)
- `setMuted(muted)` / `toggleMute()` — 静音;静音期间仍记录目标曲目,取消静音后恢复播放
- `dispose()` — 退订总线、移除解锁监听并停止播放

## 自动播放策略

浏览器通常禁止无交互时自动播放。当 `audio.play()` 被拒绝时,管理器会在
`window` 上注册一次性的 `pointerdown` / `keydown` 监听,首次用户交互后自动
重试当前曲目;成功后 `unlocked` 置为 `true`。

## 依赖

依赖 `@overworld-engine/core`(事件总线与持久化辅助);peerDependency 为 `zustand`。

## 本版本新增:分总线音量 + 环境音区(ambient zones)

```ts
audio.setBusVolume('ambience', 0.5)          // 单独调环境音总线,不影响 BGM/SFX

audio.setAmbientZones([
  { id: 'waterfall', trackId: 'waterfall-loop', center: [10, 0, -20], innerRadius: 5, outerRadius: 25 },
])
audio.updateListener(playerPositionRef.current)   // 每帧/每次移动调用,按距离交叉淡入淡出
audio.playCue('footstep', { listener: playerPositionRef.current, at: [10, 0, -20] })
```

- `setBusVolume(bus, volume)` / `getBusVolume(bus)` — 四条具名总线
  (`master`/`music`/`ambience`/`sfx`),`master` 与其余三条相乘生效
  (`mixBuses` 纯函数)。
- `setAmbientZones(zones)` / `updateListener(position)` — 环境音区按
  `zoneWeight`(内圈满音量、外圈静音、之间线性衰减)在 `ambience` 总线上
  交叉淡入淡出;每个 zone 惰性创建一个循环播放句柄。
- `playCue(sfxId, { listener?, at? })` — 一次性音效,传入监听者与音源
  位置时按 30 单位内线性衰减(否则等价于 `playSfx`)。
- `silentBackend` — 零播放的 `AudioBackend`,用于测试/无音频环境显式屏蔽播放。
