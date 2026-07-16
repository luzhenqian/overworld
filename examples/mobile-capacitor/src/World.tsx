import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import {
  SceneShell,
  Player,
  useInteractKey,
  playerPositionRef,
  type NPCIndicator,
} from '@overworld-engine/scene'
import { useStore } from 'zustand'
import { CRYSTAL_SPOTS, NPCS } from './game/content'
import { inventory, isGameInputBlocked, movementInput, quests } from './game/engines'

const PICKUP_DISTANCE = 1.8
const WORLD_BOUNDS = { minX: -18, maxX: 18, minZ: -18, maxZ: 18 }

/** 可拾取水晶 —— 走近即拾取(游戏专属逻辑) */
function Crystals() {
  const [collected, setCollected] = useState<string[]>([])
  // useFrame 在 React 重渲染之间每帧执行;用 ref 立即记账,state 只驱动渲染
  const collectedRef = useRef<Set<string>>(new Set())

  useFrame(() => {
    for (const spot of CRYSTAL_SPOTS) {
      if (collectedRef.current.has(spot.id)) continue
      const dx = playerPositionRef.current[0] - spot.position[0]
      const dz = playerPositionRef.current[2] - spot.position[2]
      if (dx * dx + dz * dz < PICKUP_DISTANCE * PICKUP_DISTANCE) {
        collectedRef.current.add(spot.id)
        setCollected([...collectedRef.current])
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

export function World() {
  useInteractKey('e', { isInputBlocked: isGameInputBlocked })

  // 任务引擎状态 → NPC 头顶指示器(游戏侧推导,场景包不认识任务系统)
  const active = useStore(quests.store, (s) => s.active)
  const completed = useStore(quests.store, (s) => s.completed)
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
      npcs={NPCS}
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
      {/* 灯光/地面/雾等场景专属内容作为 children 传入(starter 的昼夜循环已裁剪) */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[12, 20, 8]} intensity={1.4} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[40, 40, '#334155', '#334155']} position={[0, 0.01, 0]} />
      <fog attach="fog" args={['#0b0e1a', 30, 60]} />
      <Crystals />
    </SceneShell>
  )
}
