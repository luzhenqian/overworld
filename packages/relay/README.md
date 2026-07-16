# @overworld-engine/relay

`@overworld-engine/net` `createWebSocketTransport` 的参考中继服务器,可发布、可嵌入。
职责只有一件事:把每条消息**原样**广播给同一房间内的**其他**所有 OPEN 连接
(信封 `{ from, data }` 完全不解析),外加心跳剔除死连接与优雅关闭。
线路协议的完整规范见 `@overworld-engine/net` README 的「线路协议规范」。

## 命令行(最快路径)

```bash
npx @overworld-engine/relay        # overworld-relay,默认监听 8787
PORT=9000 npx @overworld-engine/relay
HEARTBEAT_MS=10000 npx @overworld-engine/relay
```

`Ctrl+C`(SIGINT/SIGTERM)会给所有客户端发 close 1001 后退出。

## 编程 API

```ts
import { createRelayServer } from '@overworld-engine/relay'

const relay = createRelayServer({
  port: 8787,             // 0 = 随机端口,ready 之后读 relay.port
  heartbeatMs: 30_000,    // ping 间隔;错过整周期没有 pong 即 terminate;0 关闭心跳
  maxPayloadBytes: 64 * 1024, // 超限的连接以 1009 关闭
  onJoin: (room, n) => console.log(room, n),
  onLeave: (room, n) => console.log(room, n),
  logger: console.log,    // 省略或 false = 静默
})
await relay.ready         // 开始监听(端口被占用时 reject)
relay.port                // 实际端口
relay.rooms()             // Map<房间路径, 人数> 快照
await relay.close()       // 全员 close 1001,拒绝新连接,幂等
```

### 挂到既有 http server

```ts
import { createServer } from 'http'

const server = createServer(app)   // 你的 HTTP 服务
const relay = createRelayServer({ server, path: '/ws' })
server.listen(8080)
// ws://host:8080/ws/lobby → 房间 '/lobby';/ws 本身 → 房间 '/'
// 前缀之外的 WebSocket 升级会被 close 1008;close() 不会关掉你的 server
```

## 房间语义

房间 = 连接时的 URL 路径:`ws://host:8787/room-a` 只与同路径的客户端互转,
省略路径即默认房间 `/`。没有 join/leave 帧——连接即加入、断开即离开,
一台服务器天然承载多个房间 / 多局游戏。

## 与 createWebSocketTransport 对接

```ts
import { createPresenceSync, createWebSocketTransport } from '@overworld-engine/net'

const transport = createWebSocketTransport({
  url: 'ws://localhost:8787/my-room',   // 路径即房间
  // 非浏览器环境注入实现:WebSocketImpl: require('ws').WebSocket
})
const sync = createPresenceSync({
  transport,
  getLocal: () => ({ position: getPlayerPosition() }),
})
sync.start()
```

## 局限(重要)

这是**纯中继**,不是权威服务器:不校验消息、不仲裁冲突、不防作弊、不保存状态,
位置由各客户端自报自播。适合原型、局域网聚会和信任环境;需要权威仲裁(校验移动、
结算交易、防作弊)时,见 `examples/authority-server` 与文档指南「权威多人」。
