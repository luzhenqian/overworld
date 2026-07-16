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

生产可用的参考实现是 **`@overworld-engine/relay`** 包(`npx overworld-relay`,
或编程 API 挂到既有 http server):按 URL 路径分房间、心跳剔除死连接、
payload 上限、优雅关闭。

## 线路协议规范(wire protocol)

以下规范精确到可以用**任何语言**实现兼容的中继或权威服务器。协议随 net 1.x
发布;**2.0 之前只做加法**(新增 `t` 种类),已有信封的字段与语义保持稳定,
实现方对未知 `t` 应当忽略。

### 传输层信封

- 每条 WebSocket 消息 = 一个 **JSON 文本帧**:`{ "from": string, "data": unknown }`。
- `from` 是发送方 peerId,**由客户端自行生成**(优先 `crypto.randomUUID()`,
  否则"计数器 + 时间戳"兜底)。没有握手、没有服务器分配 id:peer 通过第一条
  消息的 `from` 隐式宣告自己,中继不参与 id 分配。
- 中继 **MUST**:把每条消息**原样**转发给同一房间内所有**其他** OPEN 连接;
  **MUST NOT** 回送给发送者(客户端虽有 `msg.from === peerId` 的兜底过滤,
  但事件中继的防回声依赖"不回送",不能指望兜底)。
- 中继**不得解析或改写** `data` —— 信封对服务器完全不透明。客户端会静默忽略
  非文本帧、无法解析的 JSON、以及缺 `from` 的消息。

### 房间

- 房间 = 连接时的 URL 路径:`wss://host/room-a`;省略路径 = 默认房间 `/`。
- **没有 join/leave 帧**:连接即加入、断开即离开。同房间互转,不同房间隔离。

### 应用层信封(按 `data.t` 多路复用)

`data` 是带判别字段 `t` 的对象;内建种类可共用同一个 transport,自定义信封
只需选一个不冲突的 `t`(未知 `t` 被各订阅者忽略):

| `t` | 方向 | 其余字段 | 语义 |
|---|---|---|---|
| `presence` | peer → 全房间 | `position: [x,y,z]`,`rotationY?: number`(弧度),`meta?: object` | 本地玩家 transform 心跳 |
| `bye` | peer → 全房间 | — | 优雅离开,接收方立即剔除该 peer |
| `event` | peer → 全房间 | `event: string`,`payload: unknown` | 总线事件中继,接收方本地 re-emit |
| `input` | 客户端 → 权威端 | `seq: number`,`input: unknown`,`dtMs: number` | 预测输入上报 |
| `state` | 权威端 → 客户端 | `state: unknown`,`lastSeq: number` | 权威状态 ack |

**presence 节奏**(以下均为默认值,可配):发送方每 `intervalMs = 100ms` 读一次
本地 transform,**有变化才发送**,静止时每第 **5** 拍强制发一次 keepalive(即每
500ms 一包);接收方每收到一个 presence 包刷新该 peer 的 `lastSeenAt`,静默超过
`staleAfterMs = 3000ms` 即剔除(视同离线);收到 `bye` 立即剔除。首个 presence
包即宣告加入 —— 没有显式 join。

**event 语义**:emit → 广播 → 各对端 re-emit;re-emit 期间以重入标记抑制转发
(echo suppression),因此一次 emit 在每个 peer **恰好出现一次**,不放大——
其前提正是中继不回送给发送者。

**input/state(prediction 通道)语义**:`seq` 由客户端从 1 起单调递增;权威端
处理输入后以 `lastSeq` =「已处理的最高 seq」回 `state`;客户端收到
`lastSeq <= 已确认 seq` 的过期/乱序 ack 时整体忽略,否则回退到 `state` 并按序
重放所有 `seq > lastSeq` 的未确认输入。权威端自定义的额外广播(如
examples/authority-server 的 `{ t: 'world', players }`)就是"自定义 `t`"的例子。

### 自建兼容中继的最小要求

- [ ] WebSocket 端点,按 URL 路径分房间(至少支持默认房间 `/`)
- [ ] 把每个文本帧**原样**转发给同房间所有其他 OPEN 连接
- [ ] **绝不**回送给发送者
- [ ] 不解析、不改写消息;同一连接的消息保持到达顺序
- [ ] 连接断开即离开房间;建议 ping/pong 心跳(参考 30s)剔除死连接
- [ ] 不需要:握手、id 分配、房间管理帧、持久化 —— 协议里都不存在

### 版本与稳定性承诺

信封结构 `{ from, data }`、房间语义与上表内建 `t` 是稳定接口:2.0 之前只会
**新增** `t` 种类,不改字段、不改语义。

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
  // clock: () => number,默认 Date.now;lastSeenAt、超时剔除与插值缓冲共用这一个时基
})
sync.start()
```

> **确定性**:同 seed 重放/确定性测试需注入 `clock`;引擎值层面无 `Math.random`
> (peer id 的 `crypto.randomUUID` 兜底可通过各 Transport 配置的 `peerId` 显式指定绕开)。

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
