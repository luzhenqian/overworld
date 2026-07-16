import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import {
  SceneShell,
  Player,
  useInteractKey,
  playerPositionRef,
  type NPCIndicator,
} from '@overworld/scene'
import { DayNightLighting, EnvironmentTick } from '@overworld/environment'
import { useMinimapStore } from '@overworld/minimap'
import { NPCWalker } from '@overworld/ai'
import { RemotePlayers } from '@overworld/net'
import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { CRYSTAL_SPOTS, NPCS } from './game/content'
import {
  environment,
  inventory,
  isGameInputBlocked,
  movementInput,
  presence,
  quests,
  villagerAgent,
} from './game/engines'

const PICKUP_DISTANCE = 1.8
const WORLD_BOUNDS = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 }

/** Collectible crystals — picked up by walking close (game-specific logic). */
function Crystals() {
  const [collected, setCollected] = useState<string[]>([])
  // useFrame 每帧执行多次于 React 重渲染之间;用 ref 立即记账,state 只驱动渲染
  const collectedRef = useRef<Set<string>>(new Set())

  // 水晶标到小地图上,拾取后移除
  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    for (const spot of CRYSTAL_SPOTS) {
      registerMarker({ id: spot.id, kind: 'item', position: spot.position, color: '#38bdf8' })
    }
    return () => CRYSTAL_SPOTS.forEach((s) => unregisterMarker(s.id))
  }, [])

  useFrame(() => {
    for (const spot of CRYSTAL_SPOTS) {
      if (collectedRef.current.has(spot.id)) continue
      const dx = playerPositionRef.current[0] - spot.position[0]
      const dz = playerPositionRef.current[2] - spot.position[2]
      if (dx * dx + dz * dz < PICKUP_DISTANCE * PICKUP_DISTANCE) {
        collectedRef.current.add(spot.id)
        setCollected([...collectedRef.current])
        useMinimapStore.getState().unregisterMarker(spot.id)
        inventory.add('crystal', 1)
      }
    }
  })

  return (
    <>
      {CRYSTAL_SPOTS.filter((s) => !collected.includes(s.id)).map((spot) => (
        <Float key={spot.id} speed={3} floatIntensity={0.6} rotationIntensity={2}>
          <mesh position={spot.position} castShadow>
            <octahedronGeometry args={[0.5]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.9} />
          </mesh>
          <pointLight position={spot.position} color="#38bdf8" intensity={3} distance={5} />
        </Float>
      ))}
    </>
  )
}

/** 巡逻村民:@overworld/ai 驱动移动,视觉与小地图跟踪由游戏提供 */
function Villager() {
  const minimapAcc = useRef(0)

  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    registerMarker({
      id: 'npc:villager',
      kind: 'npc',
      position: [villagerAgent.position[0], 0, villagerAgent.position[1]],
      color: '#4ade80',
    })
    return () => unregisterMarker('npc:villager')
  }, [])

  // 每 ~100ms 同步一次小地图标记位置(NPCWalker 自己驱动 agent.update)
  useFrame((_, delta) => {
    minimapAcc.current += delta
    if (minimapAcc.current < 0.1) return
    minimapAcc.current = 0
    useMinimapStore
      .getState()
      .setMarkerPosition('npc:villager', [villagerAgent.position[0], 0, villagerAgent.position[1]])
  })

  return (
    <NPCWalker agent={villagerAgent}>
      <mesh position={[0, 1, 0]} castShadow>
        <capsuleGeometry args={[0.4, 1.2, 4, 8]} />
        <meshStandardMaterial color="#4ade80" emissive="#166534" emissiveIntensity={0.5} />
      </mesh>
    </NPCWalker>
  )
}

export function World() {
  const { t } = useTranslation()
  useInteractKey('e', { isInputBlocked: isGameInputBlocked })
  // NPC 的 name 字段存的是 i18n key,3D 名牌渲染前翻译
  const localizedNpcs = NPCS.map((npc) => ({ ...npc, name: npc.name ? t(npc.name) : npc.name }))

  // NPC 标到小地图上
  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    for (const npc of NPCS) {
      registerMarker({ id: `npc:${npc.id}`, kind: 'npc', position: npc.position, color: '#facc15' })
    }
    return () => NPCS.forEach((n) => unregisterMarker(`npc:${n.id}`))
  }, [])

  // 任务引擎状态 → NPC 头顶指示器(游戏侧推导,场景包不认识任务系统)
  const active = useStore(quests, (s) => s.active)
  const completed = useStore(quests, (s) => s.completed)
  const npcIndicators: Record<string, NPCIndicator> = {}
  if (active['welcome'] && !active['welcome'].objectives['talk']?.completed) {
    npcIndicators['guide'] = 'quest-available'
  } else if (active['gather-crystals']) {
    npcIndicators['guide'] = 'quest-in-progress'
  } else if (completed.includes('gather-crystals')) {
    npcIndicators['guide'] = 'quest-complete'
  }

  return (
    <SceneShell
      npcs={localizedNpcs}
      npcIndicators={npcIndicators}
      player={
        <Player
          bounds={WORLD_BOUNDS}
          cameraOffset={[0, 9, 14]}
          isInputBlocked={isGameInputBlocked}
          externalInput={movementInput}
        />
      }
    >
      {/* 昼夜循环驱动的灯光 —— 场景专属内容作为 children 传入 */}
      <EnvironmentTick engine={environment} />
      <DayNightLighting engine={environment} castShadow sunPosition={[12, 20, 8]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[40, 40, '#334155', '#334155']} position={[0, 0.01, 0]} />
      <fog attach="fog" args={['#0b0e1a', 30, 60]} />
      <Crystals />
      <Villager />
      {/* 其他标签页的玩家(幽灵胶囊) */}
      {presence && <RemotePlayers sync={presence} />}
    </SceneShell>
  )
}
