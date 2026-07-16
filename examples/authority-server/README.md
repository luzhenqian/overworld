# authority-server —— @overworld/net 权威移动服务器参考

`examples/ws-server` 是纯中继(不解析、不裁决);本示例则是**权威服务器**:
服务端持有每位玩家位置 `{ x, z }` 的唯一真相,接收客户端输入
`{ t: 'input', seq, input: { dx, dz }, dtMs }`,校验后用与客户端**完全相同**的
确定性 step 推进,并以 `{ t: 'state', state, lastSeq }`(20Hz,发给本人)确认,
`{ t: 'world', players }`(10Hz,广播全员)同步整个世界。约 120 行,仅依赖 `ws`。

## 用法

```bash
pnpm install       # 或 npm install
node server.mjs    # 默认监听 8788;PORT=9000 node server.mjs 换端口
```

## 共享的 step(必须逐字一致)

```
方向归一化(|dir| > 1 时)× SPEED(5 单位/秒)× dtMs/1000,坐标钳制到 ±50
```

客户端预测与服务端推进跑的是**同一个纯函数**:同样的状态 + 同样的输入 +
同样的 dt 必须得到同样的结果。任何不确定性(随机数、读本地时钟、浮点路径
不一致)都会让每次对账变成一次纠偏。

## 与 createPredictedState / createInputChannel 对接

```ts
import {
  createPredictedState, createInputChannel, createWebSocketTransport,
} from '@overworld/net'

const step = (s, { dx, dz }, dtMs) => { /* 与 server.mjs 完全相同 */ }

const transport = createWebSocketTransport({ url: 'ws://localhost:8788' })
const channel = createInputChannel(transport)
const predicted = createPredictedState({
  initialState: { x: 0, z: 0 },
  step,
  onCorrection: (before, after) => console.log('被服务器纠正', before, after),
})
channel.onServerState((state, lastSeq) => predicted.onServerState(state, lastSeq))

// 每帧:本地立即预测 + 上报输入,渲染直接用 predicted.state(零感知延迟)
const seq = predicted.applyInput({ dx, dz }, dtMs)
channel.sendInput(seq, { dx, dz }, dtMs)
```

## 服务端钳制在演示什么(防作弊)

服务器绝不信任客户端:`|dx|, |dz|` 钳到 ≤ 1,`dtMs` 钳到 ≤ 100ms。
外挂客户端发 `dx: 50` 或 `dtMs: 10000` 也只能按老实人的速度移动——
而它本地按原始值做的预测会和权威状态出现偏差,下一次对账即被拉回原位
(客户端侧 `onCorrection` 触发)。这就是"客户端预测负责手感、服务器负责
真相"的分工:预测错了没关系,权威状态永远赢。
