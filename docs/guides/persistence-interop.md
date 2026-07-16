# 持久化互操作:引擎本地持久化与服务端权威存档共存

很多游戏(尤其带经济系统的)采用**服务端权威**存档:金钱、资产、交易由后端
以重放日志/事务形式记录,客户端只是视图。Overworld 的持久化
(`persistOptions` / `createSaveSlots` / `createRestStorage`)是**客户端状态
快照**式的 —— 两者定位不同,按下面的组合模式使用即可共存不冲突。

## 守则:权威数据永远不进 zustand persist

一条硬规则:凡是服务端说了算的数据(余额、持仓、交易记录),**不要**出现在
任何 `persist` 的 `partialize` 结果里。客户端快照落后、被清、被篡改都不能
影响权威状态;权威数据只走你自己的 API,进普通(非 persist)store 作为视图
缓存。违反这条会造成双写:刷新后 zustand rehydrate 出旧余额,再被服务端
推送覆盖 —— 界面闪烁只是最轻的后果。

## 模式 A:引擎系统只持久化非权威切片(推荐)

引擎系统(quest / tutorial / achievements / inventory)的 `persist` 选项是
**逐系统开关**(缺省关闭)。只对"丢了也无所谓、纯本地体验"的系统开:

```ts
// 教程进度、成就解锁、UI 偏好:本地快照,丢失可接受
const tutorial = createTutorial({ steps, persist: true })
const achievements = createAchievements({ definitions, persist: true })

// 任务进度若参与经济结算 → 关掉本地持久化(persist 缺省即关),
// 由服务端存档恢复:quests.store.setState(saved) 后 quests.resubscribe()
const quests = createQuestEngine({ quests: QUESTS, conditions, effects })

// 游戏自己的 UI 局部状态(音量、图设、面板开合)用 core 的 persistOptions
const useSettings = create<Settings>()(
  persist(initializer, persistOptions({ name: 'settings', version: 1 }))
)
```

### key 前缀隔离

引擎持久化 key 一律是 `overworld:<name>`(`persistOptions` 的 `prefix` 可改,
各引擎的 `persist: { name }` 可改后缀)。你的服务端存档、你自己的
localStorage key 不要用 `overworld:` 前缀,双方即在 key 空间上完全隔离;
清引擎本地状态 = 按前缀删 key,不会碰到你的数据。

## 模式 B:`createRestStorage` 对接自有后端

想让引擎的**非权威**切片也落到你的服务器(跨设备同步教程/成就),用
`createRestStorage` 把 zustand persist 的后端换成你的 REST 端点:

```ts
import { createRestStorage, flushRestStorage } from '@overworld-engine/core'

const cloud = createRestStorage({
  baseUrl: 'https://api.yourgame.com/saves',
  // 鉴权:传函数则每个请求现取,token 刷新无感
  headers: () => ({ authorization: `Bearer ${getAccessToken()}` }),
  onError: (err, op, key) => report(err, { op, key }),
})

const tutorial = createTutorial({ steps, persist: { storage: () => cloud } })

// 冲突策略约定:last-write-wins。写入按 key 去抖(300ms,可调),
// 离开页面前 flush,保证最后一批写入到达服务器:
window.addEventListener('beforeunload', () => {
  void flushRestStorage(cloud)
})
```

服务端只需实现三个动作(详见 core 包文档):`GET`(200 返回原文 / 404 表示
无)、`PUT`(body 为原文快照)、`DELETE`(404 视为成功)。约定要点:

- **冲突策略是 last-write-wins**:快照式持久化没有合并语义,后写覆盖先写。
  这正是它只适合非权威数据的原因 —— 权威数据需要你的重放日志/事务端点,
  不要试图用 RestStorage 承载它。
- 网络失败**永不抛出**(`onError` 上报后吞掉),存档服务器挂了游戏照跑;
  代价是可能丢最后一批写入 —— 又一次印证"只放丢得起的数据"。
- 每个 key 一个资源路径(`${baseUrl}/${encodeURIComponent(key)}`),按用户
  隔离放在你的鉴权层做(token → 用户名下的 key 空间)。

## 组合小抄

| 数据 | 归属 | 通道 |
|---|---|---|
| 余额 / 资产 / 交易 | 服务端权威 | 你的 API + 重放日志;客户端仅普通 store |
| 任务进度(影响经济) | 服务端权威 | 引擎不开 persist;恢复用 `store.setState` + `resubscribe()` |
| 教程 / 成就 / 图鉴 | 客户端 | 引擎 `persist: true`(本地)或 RestStorage(跨设备) |
| UI 偏好(音量/画质) | 客户端 | `persistOptions` + localStorage |
| 多人 presence | 谁都不存 | net 包,内存态 |
