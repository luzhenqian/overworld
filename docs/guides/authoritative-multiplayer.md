# 权威多人:把外部确定性内核接入 net

`@overworld-engine/net` 刻意不内置"游戏状态仲裁"——引擎提供**原语**
(Transport、presence、事件中继、`createPredictedState` + `createInputChannel`)
和**参考实现**(`@overworld-engine/relay`、`examples/authority-server`),
权威模拟本身属于你的游戏服务器。本指南给出推荐接法:**你的确定性内核
(经济内核、战斗内核……)就是那个共享的 `step`,服务器权威地跑它,客户端
预测它。**

## 何时用哪一层

| 需求 | 用什么 | 服务端 |
|---|---|---|
| 看到彼此走动、广播成就/事件 toast,各玩各的模拟 | presence + `relayEvents` | 纯中继(`@overworld-engine/relay`,零逻辑) |
| 每个玩家一份服务端校验的状态(防作弊、云存档) | 上一行 + 你后端按用户重放内核 | 中继 + 你的账号/存档服务,互不耦合 |
| 多名玩家在**同一个世界/市场**里博弈、操作互相影响 | `createPredictedState` + `createInputChannel` | **权威服务器**:解析信封、跑内核、下发状态 |

社交/临场层永远值得先做:纯 presence 不需要任何服务端逻辑,升级到权威层时
它也不用改——两类信封(`presence`/`bye`/`event` 与 `input`/`state`)靠 `t`
字段多路复用,可共用同一个 transport,也可以分开连(presence 走中继房间、
权威通道单独一条连接),互不干扰。

## 推荐接法:内核即 step

前提只有一条:你的内核是**确定性纯函数**——`同状态 + 同输入 + 同 dt ⇒ 同结果`
(经济内核的 `seed + 操作序列 ⇒ 唯一结果` 正是这个性质)。把"应用一个操作"
收敛成一个签名:

```ts
// 双端逐字共享(同一个 npm 包 / 同一份源码),不允许分叉实现
export function step(state: EconState, op: EconOp, dtMs: number): EconState
```

### 服务端:权威循环(参考 examples/authority-server)

服务器是普通 WebSocket 服务(不是中继——它**解析**信封):收 `{ t: 'input',
seq, input, dtMs }`,**先校验/钳制再进内核**,记录每个 peer 已处理的最高
`seq`,按固定频率把权威状态 `{ t: 'state', state, lastSeq }` 发回。骨架:

```js
socket.on('message', (raw) => {
  const { from, data } = JSON.parse(raw)          // 信封:{ from: peerId, data }
  if (data?.t !== 'input') return
  const safeOp = validate(data.input)             // 防作弊:绝不信任客户端
  world = step(world, safeOp, clamp(data.dtMs, 0, 100))
  lastSeq[from] = Math.max(lastSeq[from] ?? 0, data.seq)
})
setInterval(() => {
  for (const [peerId, s] of sockets)
    send(s, { t: 'state', state: viewFor(peerId, world), lastSeq: lastSeq[peerId] ?? 0 })
}, 50)                                            // 20Hz ack
```

`examples/authority-server`(约 120 行,仅依赖 `ws`)是这个模式的完整可跑
版本:移动内核 + `|dx|,|dz|` 与 `dtMs` 钳制 + 20Hz 逐人 ack + 10Hz 全员
`{ t: 'world', players }` 广播(自定义 `t` 的例子)。把它的 `step` 换成你的
内核、`validate` 换成你的规则,就是你的权威服务器。

### 客户端:预测 + 对账

```ts
import {
  createPredictedState, createInputChannel, createWebSocketTransport,
} from '@overworld-engine/net'
import { step } from 'shared-kernel'    // 与服务器同一份

const transport = createWebSocketTransport({ url: 'wss://game.example/authority' })
const channel = createInputChannel(transport)
const predicted = createPredictedState({
  initialState,
  step,
  onCorrection: (before, after) => {},  // 服务器不同意时触发(被钳制/纠正)
})
channel.onServerState((state, lastSeq) => predicted.onServerState(state, lastSeq))

// 每次玩家操作:本地立即生效(零感知延迟),同时上报
const seq = predicted.applyInput(op, dtMs)
channel.sendInput(seq, op, dtMs)
render(predicted.state)                 // 渲染永远用预测态
```

循环语义(预测 → 上报 → ack → 回退 → 重放)与信封格式见 net 文档的
「输入预测与服务器对账」与「线路协议规范」。要点:

- **确定性是硬前提**:内核里不许 `Math.random`、不许读墙钟;时间一律来自
  `dtMs` / 显式注入的 clock。这与重放式云存档的要求完全同源——满足其一,
  另一个免费获得。
- **校验在服务端**:客户端用原始输入预测,服务器用钳制后的输入推进;二者
  分歧会在下一次对账被权威状态覆盖(`onCorrection` 触发)。外挂只能骗自己
  的屏幕一帧。
- **逐人视角**:`sendState` 是广播原语;各玩家状态不同时,按 peer 单独连接
  /单独房间,或像 authority-server 一样服务端逐 socket 定向发送。

## 与"每用户权威后端"的关系

"重放式云存档"(客户端只发操作日志、服务端用同一内核重放校验)本质上就是
上面的权威循环去掉实时 ack:同一个 `step`、同一份操作序列、更宽的时间窗。
两者可以共存——在线共享世界走 `input`/`state` 实时通道,单人进度走你的
重放存档;presence 社交层在两种模式下原样复用。

## 路线图表态

共享世界的权威模拟 = **已有原语 + 参考示例**,引擎**不会内置**游戏状态仲裁
(锁步调度、冲突合并、兴趣管理等属于具体游戏的服务器)。net 的承诺是:
Transport/信封协议保持稳定(2.0 前只加新 `t` 种类),`createPredictedState`
/`createInputChannel` 作为权威接入的标准客户端原语长期维护。
