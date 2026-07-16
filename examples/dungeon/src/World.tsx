import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Float } from '@react-three/drei'
import {
  Player,
  SceneShell,
  playerPositionRef,
  preloadSceneModels,
  teleportPlayer,
  useInteractKey,
  useProximityDetection,
  type NPCConfig,
  type NPCIndicator,
} from '@overworld/scene'
import { DayNightLighting } from '@overworld/environment'
import { findPathHierarchical, tickTreeWithAgent } from '@overworld/ai'
import { useMinimapStore } from '@overworld/minimap'
import { useToastStore } from '@overworld/notifications'
import { gameEvents } from '@overworld/core'
import { useStore } from 'zustand'
import { cellToWorld, isFloorWorld, wallShellCells } from './game/dungeon'
import {
  enemies,
  environment,
  hierarchicalGrid,
  inventory,
  isGameInputBlocked,
  layout,
  movementInput,
  quests,
  type DungeonEnemy,
} from './game/engines'
import { useGameStore } from './game/state'

const WALL_HEIGHT = 2.4
const PICKUP_DISTANCE = 1.4
/** 敌人碰到玩家判定距离。 */
const HIT_DISTANCE = 1.0
/** 受击后的无敌时间(ms),防止一帧连扣多颗心。 */
const HIT_COOLDOWN_MS = 1200

const NPCS: NPCConfig[] = [
  {
    id: 'ghost',
    name: '幽灵向导',
    // 手工打包的 1.5KB GLB(淡蓝发光方块),见 public/models/
    modelPath: '/models/ghost.glb',
    position: [layout.npcPos[0], 0, layout.npcPos[1]],
    rotation: [0, Math.PI, 0],
    scale: 1,
  },
]

// 模块加载时预取模型,useGLTF 首帧即可同步命中缓存
preloadSceneModels({ npcs: NPCS })

/** 墙壳格(与地板相邻的墙)—— 渲染 + 碰撞共用同一份列表。 */
const WALL_CELLS = wallShellCells(layout).map(([cx, cz]) => cellToWorld(layout, cx, cz))

/** 墙与宝箱都走 SceneShell 的 decorationCollisions(圆形碰撞体近似方格)。 */
const DECORATION_COLLISIONS = {
  wall: {
    instances: WALL_CELLS.map(([x, z]) => ({ position: [x, 0, z] as [number, number, number] })),
    radius: 0.55,
  },
  chest: {
    instances: [{ position: [layout.chestPos[0], 0, layout.chestPos[1]] as [number, number, number] }],
    radius: 0.7,
  },
}

/** 实例化墙体:一次 draw call 画完整个墙壳。 */
function DungeonWalls() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(1, WALL_HEIGHT, 1), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2b3454', roughness: 0.95 }),
    []
  )
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    WALL_CELLS.forEach(([x, z], i) => {
      matrix.makeTranslation(x, WALL_HEIGHT / 2, z)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, WALL_CELLS.length]}
      castShadow
      receiveShadow
    />
  )
}

/** 钥匙:走近拾取 → inventory.add → item:added 事件推动任务。 */
function KeyPickup() {
  const [taken, setTaken] = useState(false)
  const takenRef = useRef(false)

  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    registerMarker({
      id: 'pickup:key',
      kind: 'item',
      position: [layout.keyPos[0], 0, layout.keyPos[1]],
      color: '#facc15',
    })
    return () => unregisterMarker('pickup:key')
  }, [])

  useFrame(() => {
    if (takenRef.current) return
    const dx = playerPositionRef.current[0] - layout.keyPos[0]
    const dz = playerPositionRef.current[2] - layout.keyPos[1]
    if (dx * dx + dz * dz < PICKUP_DISTANCE * PICKUP_DISTANCE) {
      takenRef.current = true
      setTaken(true)
      useMinimapStore.getState().unregisterMarker('pickup:key')
      inventory.add('key', 1)
    }
  })

  if (taken) return null
  return (
    <Float speed={3} floatIntensity={0.5} rotationIntensity={2}>
      <mesh position={[layout.keyPos[0], 1, layout.keyPos[1]]} castShadow>
        <octahedronGeometry args={[0.35]} />
        <meshStandardMaterial color="#fde047" emissive="#facc15" emissiveIntensity={1.2} />
      </mesh>
      <pointLight
        position={[layout.keyPos[0], 1.4, layout.keyPos[1]]}
        color="#facc15"
        intensity={4}
        distance={6}
      />
    </Float>
  )
}

/** 金币:走近拾取 → 游戏侧金币账本(与框架无关的玩法系统)。 */
function Coins() {
  const [collected, setCollected] = useState<number[]>([])
  const collectedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    layout.coinSpots.forEach(([x, z], i) => {
      registerMarker({ id: `coin-${i}`, kind: 'item', position: [x, 0, z], color: '#eab308' })
    })
    return () => layout.coinSpots.forEach((_, i) => unregisterMarker(`coin-${i}`))
  }, [])

  useFrame(() => {
    layout.coinSpots.forEach(([x, z], i) => {
      if (collectedRef.current.has(i)) return
      const dx = playerPositionRef.current[0] - x
      const dz = playerPositionRef.current[2] - z
      if (dx * dx + dz * dz < PICKUP_DISTANCE * PICKUP_DISTANCE) {
        collectedRef.current.add(i)
        setCollected([...collectedRef.current])
        useMinimapStore.getState().unregisterMarker(`coin-${i}`)
        useGameStore.getState().addGold(20)
        useToastStore.getState().show({ message: '💰 金币 +20', variant: 'info' })
      }
    })
  })

  return (
    <>
      {layout.coinSpots.map(([x, z], i) =>
        collected.includes(i) ? null : (
          <Float key={i} speed={4} floatIntensity={0.3} rotationIntensity={3}>
            <mesh position={[x, 0.7, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.28, 0.28, 0.07, 20]} />
              <meshStandardMaterial color="#fbbf24" emissive="#b45309" emissiveIntensity={0.7} />
            </mesh>
          </Float>
        )
      )}
    </>
  )
}

/** 宝箱:自建网格 + useProximityDetection 建筑通道 → E 键发 interact 事件。 */
function Chest() {
  const chestOpened = useGameStore((s) => s.chestOpened)
  const [cx, cz] = layout.chestPos

  const proximityBuildings = useMemo(
    () => [{ id: 'chest', position: [cx, 0, cz] as [number, number, number] }],
    [cx, cz]
  )
  useProximityDetection({ buildings: proximityBuildings, buildingRadius: 2.2 })

  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    registerMarker({ id: 'chest', kind: 'building', position: [cx, 0, cz], color: '#fb923c' })
    return () => unregisterMarker('chest')
  }, [cx, cz])

  return (
    <group position={[cx, 0, cz]}>
      {/* 箱体 */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[1.1, 0.7, 0.8]} />
        <meshStandardMaterial color="#7c4a1e" roughness={0.8} />
      </mesh>
      {/* 箱盖:打开后翻起 */}
      <mesh
        position={chestOpened ? [0, 0.78, -0.35] : [0, 0.78, 0]}
        rotation={chestOpened ? [-Math.PI / 2.4, 0, 0] : [0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[1.1, 0.16, 0.8]} />
        <meshStandardMaterial color="#8f5a26" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.45, 0.41]}>
        <boxGeometry args={[0.18, 0.24, 0.06]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.3} />
      </mesh>
      {chestOpened && (
        <>
          <pointLight position={[0, 1, 0]} color="#fde047" intensity={8} distance={7} />
          <mesh position={[0, 0.75, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial color="#fde68a" emissive="#facc15" emissiveIntensity={2} />
          </mesh>
        </>
      )}
    </group>
  )
}

/** 全体守卫共享的受击冷却。 */
const hitState = { until: 0 }

/** 单个骷髅守卫:行为树 + agent 用 tickTreeWithAgent 一起驱动。 */
function Enemy({ enemy }: { enemy: DungeonEnemy }) {
  const groupRef = useRef<THREE.Group>(null)
  const minimapAcc = useRef(0)

  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    registerMarker({
      id: `enemy:${enemy.id}`,
      kind: 'npc',
      position: [enemy.agent.position[0], 0, enemy.agent.position[1]],
      color: '#f87171',
    })
    return () => unregisterMarker(`enemy:${enemy.id}`)
  }, [enemy])

  useFrame((_, delta) => {
    const { agent, tree } = enemy
    // 行为树决策 + agent 位移,一次调用完成(框架约定的驱动顺序)
    tickTreeWithAgent(tree, agent, delta * 1000)

    const group = groupRef.current
    if (group) {
      group.position.set(agent.position[0], 0, agent.position[1])
      const diff = agent.heading - group.rotation.y
      group.rotation.y += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.2
    }

    // 小地图标记(~10Hz)
    minimapAcc.current += delta
    if (minimapAcc.current >= 0.1) {
      minimapAcc.current = 0
      useMinimapStore
        .getState()
        .setMarkerPosition(`enemy:${enemy.id}`, [agent.position[0], 0, agent.position[1]])
    }

    // 触碰伤害:发游戏自定义事件 + 往身后可走格击退
    const px = playerPositionRef.current[0]
    const pz = playerPositionRef.current[2]
    const dx = px - agent.position[0]
    const dz = pz - agent.position[1]
    const distSq = dx * dx + dz * dz
    const now = performance.now()
    const state = useGameStore.getState()
    if (
      distSq < HIT_DISTANCE * HIT_DISTANCE &&
      now >= hitState.until &&
      !state.dead &&
      state.finishedMs === null
    ) {
      hitState.until = now + HIT_COOLDOWN_MS
      gameEvents.emit('dungeon:player-hit', { enemyId: enemy.id, damage: 1 })
      const len = Math.sqrt(distSq) || 1
      const tx = px + (dx / len) * 1.6
      const tz = pz + (dz / len) * 1.6
      if (isFloorWorld(layout, tx, tz)) teleportPlayer([tx, 0, tz])
    }
  })

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.35, 0.9, 4, 8]} />
        <meshStandardMaterial color="#b91c1c" emissive="#7f1d1d" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.13, 1.35, 0.28]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#fecaca" emissive="#ef4444" emissiveIntensity={3} />
      </mesh>
      <mesh position={[0.13, 1.35, 0.28]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#fecaca" emissive="#ef4444" emissiveIntensity={3} />
      </mesh>
      <pointLight position={[0, 1.3, 0]} color="#ef4444" intensity={1.5} distance={3.5} />
    </group>
  )
}

/** 把 HPA* 路径按固定间距铺成点列。 */
function densifyPath(path: [number, number][], spacing: number, cap: number): [number, number][] {
  const dots: [number, number][] = []
  for (let i = 1; i < path.length && dots.length < cap; i++) {
    const [ax, az] = path[i - 1]!
    const [bx, bz] = path[i]!
    const segment = Math.hypot(bx - ax, bz - az)
    const steps = Math.max(1, Math.floor(segment / spacing))
    for (let s = 1; s <= steps && dots.length < cap; s++) {
      const t = s / steps
      dots.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  return dots
}

/** 引导微光:每 0.8s 用 findPathHierarchical 重算玩家 → 当前目标的路径。 */
function GuidePath() {
  const [dots, setDots] = useState<[number, number][]>([])
  const acc = useRef(0.8)

  useFrame((_, delta) => {
    acc.current += delta
    if (acc.current < 0.8) return
    acc.current = 0
    const s = useGameStore.getState()
    const target = s.chestOpened ? null : inventory.has('key') ? layout.chestPos : layout.keyPos
    if (!target || s.dead) {
      setDots((prev) => (prev.length ? [] : prev))
      return
    }
    const path = findPathHierarchical(
      hierarchicalGrid,
      [playerPositionRef.current[0], playerPositionRef.current[2]],
      target
    )
    setDots(path ? densifyPath(path, 1.5, 40) : [])
  })

  return (
    <>
      {dots.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.09, 10]} />
          <meshStandardMaterial
            color="#7dd3fc"
            emissive="#38bdf8"
            emissiveIntensity={1.4}
            transparent
            opacity={0.75}
          />
        </mesh>
      ))}
    </>
  )
}

export function World() {
  useInteractKey('e', { isInputBlocked: isGameInputBlocked })

  // NPC 标到小地图
  useEffect(() => {
    const { registerMarker, unregisterMarker } = useMinimapStore.getState()
    registerMarker({
      id: 'npc:ghost',
      kind: 'npc',
      position: [layout.npcPos[0], 0, layout.npcPos[1]],
      color: '#4ade80',
    })
    return () => unregisterMarker('npc:ghost')
  }, [])

  // 任务状态 → 幽灵头顶指示器
  const active = useStore(quests.store, (s) => s.active)
  const completed = useStore(quests.store, (s) => s.completed)
  const npcIndicators: Record<string, NPCIndicator> = {}
  if (completed.includes('open-chest')) npcIndicators['ghost'] = 'quest-complete'
  else if (active['find-key'] || active['open-chest']) npcIndicators['ghost'] = 'quest-in-progress'

  return (
    <SceneShell
      npcs={NPCS}
      npcIndicators={npcIndicators}
      decorationCollisions={DECORATION_COLLISIONS}
      player={
        <Player
          initialPosition={[layout.spawn[0], 0, layout.spawn[1]]}
          bounds={layout.bounds}
          colliderRadius={0.35}
          cameraOffset={[0, 9, 7]}
          isInputBlocked={isGameInputBlocked}
          externalInput={movementInput}
        >
          {/* 火把:跟随玩家的点光源,黑暗地牢的主要照明 */}
          <pointLight position={[0, 1.8, 0]} color="#ffb066" intensity={14} distance={13} decay={1.6} />
        </Player>
      }
    >
      {/* 永夜光照:environment 引擎锁定在午夜,夜间强度调得比默认更暗 */}
      <DayNightLighting
        engine={environment}
        ambientIntensity={{ day: 0.8, night: 0.09 }}
        sunIntensity={{ day: 1.2, night: 0.03 }}
      />
      <fog attach="fog" args={['#05060d', 10, 26]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[layout.cols, layout.rows]} />
        <meshStandardMaterial color="#161d33" roughness={1} />
      </mesh>
      <DungeonWalls />
      <KeyPickup />
      <Coins />
      <Chest />
      {enemies.map((enemy) => (
        <Enemy key={enemy.id} enemy={enemy} />
      ))}
      <GuidePath />
    </SceneShell>
  )
}
