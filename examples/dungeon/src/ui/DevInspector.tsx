/**
 * 开发调试覆盖层:按 `(backquote / 反引号)开关 @overworld-engine/inspector 的
 * 事件总线面板,默认隐藏。面板挂上后即观察地牢的真实事件
 * (item:added / quest:* / dungeon:* / entity:interact 等)。
 *
 * 同时暴露 window.__inspector 调试句柄(始终可用,便于 E2E 与手动调试):
 *   - show() / hide() / toggle() / visible —— 控制面板可见性
 *   - drive() —— 跑一段真实玩法(捡钥匙),让总线亮起来
 *   - bus —— 面板观察的事件总线(全局 gameEvents 单例)
 */
import { useEffect, useRef, useState } from 'react'
import { gameEvents } from '@overworld-engine/core'
import { EventBusInspector, StoreInspector } from '@overworld-engine/inspector'
import { inventory } from '../game/engines'
import { useGameStore } from '../game/state'

declare global {
  interface Window {
    __inspector?: {
      show: () => void
      hide: () => void
      toggle: () => void
      readonly visible: boolean
      /** 触发一段真实玩法(向背包加钥匙 → item:added → 任务链)供调试/E2E。 */
      drive: () => void
      bus: typeof gameEvents
    }
  }
}

/** 反引号(键盘左上角,数字 1 左边),不与 WASD / E 冲突。 */
const TOGGLE_KEY = '`'

export function DevInspector() {
  const [visible, setVisible] = useState(false)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // 反引号开关(在输入框里打字时不劫持)。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (event.key === TOGGLE_KEY) {
        event.preventDefault()
        setVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 始终可用的调试句柄(生产构建也保留,供 E2E 驱动)。
  useEffect(() => {
    window.__inspector = {
      show: () => setVisible(true),
      hide: () => setVisible(false),
      toggle: () => setVisible((v) => !v),
      get visible() {
        return visibleRef.current
      },
      drive: () => {
        // 真实玩法:背包引擎收下钥匙 → 发 item:added → find-key 任务推进/完成
        // → 链式启动 open-chest。整条链都会被上面的面板记录下来。
        inventory.add('key', 1)
      },
      bus: gameEvents,
    }
    return () => {
      delete window.__inspector
    }
  }, [])

  if (!visible) return null
  return (
    <>
      <EventBusInspector position="top-left" />
      {/* 实时窥视地牢游戏状态 store(❤️/💰/通关计时) */}
      <StoreInspector store={useGameStore} label="游戏状态" style={{ top: 12, right: 12 }} />
    </>
  )
}
