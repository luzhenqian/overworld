# @overworld-engine/net

Transport 无关的多人同步抽象:统一的 `Transport` 接口 + 三个参考实现,
加上在此之上的**在线状态复制**(presence,把每个远端玩家镜像进 zustand store)
与**事件中继**(relay,把总线事件广播给所有对端)。这是接口层,不是完整 netcode
—— 没有权威服务器、回滚或插值缓冲,只有简单的渲染平滑。

## 安装

```bash
pnpm add @overworld-engine/net @overworld-engine/core
# peers: react zustand three @react-three/fiber
```

## Transport 接口

```ts
interface Transport {
  readonly peerId: string                              // 本地 peer 的稳定 id
  send(data: unknown): void                            // 广播给所有其他 peer
  subscribe(cb: (msg: { from: string; data: unknown }) => void): () => void
  close(): void
}
```

三个参考实现(payload 必须可 JSON 序列化):

- `createLocalTransportHub()` —— 进程内 hub,`hub.createTransport(peerId?)`
  创建互联的 transport,**同步投递**(测试确定性)。用于单测与本地演示。
- `createBroadcastChannelTransport({ channelName, peerId? })` —— 同源多标签页
  互联,零服务器。环境不支持时抛出明确错误;先用 `isBroadcastChannelAvailable()` 探测。
- `createWebSocketTransport({ url, peerId?, protocols?, reconnect?, WebSocketImpl? })`
  —— 每条消息一个 JSON 信封 `{ from, data }`。CONNECTING 期间的 send 会缓冲、
  open 后按序冲刷;意外断线后按 `reconnect`(默认 3 次 / 1000ms,成功后重置)
  重连;`close()` 停止一切。非浏览器环境通过 `WebSocketImpl` 注入实现(如 `ws`)。

### WebSocket 服务端契约

服务端唯一职责:把收到的消息原样广播给**其他**所有客户端。Node `ws` 示例:

```js
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 8080 })
wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    const text = raw.toString()
    for (const client of wss.clients) {
      if (client !== socket && client.readyState === 1) client.send(text)
    }
  })
})
```

## 在线状态复制(presence)

```ts
import { createPresenceSync, createBroadcastChannelTransport } from '@overworld-engine/net'
import { getPlayerPosition, playerRotationRef } from '@overworld-engine/scene'

const sync = createPresenceSync({
  transport: createBroadcastChannelTransport({ channelName: 'my-game' }),
  getLocal: () => ({
    position: getPlayerPosition(),
    rotationY: playerRotationRef.current,
    meta: { name: '玩家甲' },
  }),
  intervalMs: 100,      // 心跳间隔(默认)
  staleAfterMs: 3000,   // 超时剔除(默认)
})
sync.start()
```

机制:

- 每个心跳读取 `getLocal()`,**有变化才发送**;静止时每第 5 拍发一次 keepalive
  (默认即每 500ms 一包),既省带宽又保证不被误判超时,迟到的 peer 也能在
  500ms 内看到你。
- `sync.store` 是 zustand vanilla store,状态就是 `Record<peerId, RemotePeer>`
  (`{ peerId, position, rotationY, meta?, lastSeenAt }`)。`sync.peers()` 取数组快照。
- 首次收到某 peer 的消息 → 入库并在事件总线(默认 `gameEvents`,可注入)上发
  `net:peer-joined { peerId }`;静默超过 `staleAfterMs` → 剔除并发
  `net:peer-left { peerId }`;`stop()` 会广播 `bye`,让对端立即剔除而不必等超时。
- 事件表通过 declaration merging 扩展,`net:*` 事件在任何 bus 上都有完整类型。

## 事件中继(relay)

```ts
import { gameEvents } from '@overworld-engine/core'
import { relayEvents } from '@overworld-engine/net'

const unbind = relayEvents(gameEvents, transport, {
  events: ['quest:started', 'market:trade'],
})
```

列出的事件在本地 emit 后广播给所有对端并在对端重放。防回声:重放期间置
重入标记、不再转发,因此一次 emit 在每个 peer 恰好出现一次,绝不放大。
payload 必须可 JSON 序列化。presence 与 relay 的信封用 `t` 字段区分
(`'presence' | 'bye' | 'event'`),可以共用同一个 transport。

## 渲染远端玩家

```tsx
import { RemotePlayers } from '@overworld-engine/net'

<Canvas>
  <RemotePlayers sync={sync} lerp={0.15} />
  {/* 或自定义外观(仅在 peer 加入/离开时重渲染): */}
  <RemotePlayers sync={sync} renderPeer={(peer) => <Avatar name={peer.meta?.name} />} />
</Canvas>
```

每个远端 peer 一个 `<group>`,位置/朝向在 `useFrame` 中向最新数据做指数平滑
(最短弧旋转),心跳不触发 React 重渲染,无逐帧分配。默认外观是半透明胶囊体。

## 分层约定

本包只依赖 `@overworld-engine/core`;与 scene 包通过结构化类型协作
(`getLocal` 的形状即 `playerStore` 的形状),不 import 其他系统包。
