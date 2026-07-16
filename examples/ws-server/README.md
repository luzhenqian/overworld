# ws-server —— @overworld-engine/net 参考中继服务器

`@overworld-engine/net` 的 WebSocket transport 只要求服务端做一件事:把每条消息
**原样**广播给同一房间内的**其他**所有客户端。这份契约的实现现在住在可发布的
**`@overworld-engine/relay`** 包里(含心跳保活、payload 上限与优雅退出);
本示例只是它的一层薄包装,方便在仓库里找到并一键跑起来。完整的消息信封 /
房间语义规范见 net 包 README 的「线路协议规范」。

## 用法

```bash
node server.mjs                 # 默认监听 8787
PORT=9000 node server.mjs
HEARTBEAT_MS=10000 node server.mjs

# 等价地,不用本示例、直接跑发布包:
npx @overworld-engine/relay
```

启动后每次连接 / 断开都会带房间与人数打日志;`Ctrl+C`(SIGINT)会通知所有
客户端(close code 1001)后退出。嵌入自己的后端(挂到既有 `http.Server`、
`onJoin`/`onLeave` 回调等)见 `packages/relay` 的 README。

## 与 createWebSocketTransport 对接

```ts
import { createPresenceSync, createWebSocketTransport } from '@overworld-engine/net'

const transport = createWebSocketTransport({
  url: 'ws://localhost:8787/my-room',   // 路径即房间;省略路径 = 默认房间 '/'
})
const sync = createPresenceSync({
  transport,
  getLocal: () => ({ position: getPlayerPosition() }),
})
sync.start()
```

连接到同一路径的客户端互相可见;不同路径互不打扰,方便一台服务器承载多个
房间 / 多局游戏。Node 环境(非浏览器)用 `WebSocketImpl` 注入 `ws` 即可。

## 行为细节

- 消息不做任何解析:信封(`{ from, data }`)对服务器完全不透明,文本或
  二进制都按原样转发。
- 每 30 秒(`HEARTBEAT_MS` 可调)ping 一次;错过整个周期没有 pong 的连接会被
  `terminate()` 清理,这样掉线的客户端不会一直占着房间。
- 单条消息超过 64 KiB 时,发送方连接以 close code 1009 被关闭。

## 局限(重要)

这是**纯中继**,不是权威服务器:它不校验消息、不仲裁冲突、不防作弊、也不
保存任何状态。位置由各客户端自报自播,任何客户端都可以伪造。适合原型、
局域网聚会和信任环境;需要权威仲裁(校验移动、结算交易、防作弊)时,这类
逻辑属于你自己的游戏服务器——见 `examples/authority-server` 与文档指南
「权威多人」。
