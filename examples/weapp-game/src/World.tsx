/**
 * 3D 场景(渲染进 createWeappCanvasRoot 建立的 R3F 根)。
 *
 * 组成:灯光 + 地面、两个胶囊体 NPC(SpriteLabel 名牌)、可拾取水晶、
 * Player(externalInput 接摇杆 + 跟随相机)与头顶 HUD。
 *
 * HUD 方案(小游戏无 DOM,任务进度必须在场景内呈现):把 SpriteLabel 挂为
 * Player 的子节点 —— 跟随相机始终对准玩家,标签因此永远在画面里,比
 * 「固定世界坐标的告示牌」稳健,也比「相机子节点 HUD」少一层矩阵心智负担。
 * 三行标签:任务进度(常驻)、对话文本(对话中)、完成祝贺(3 秒吐司)。
 *
 * 标签一律 labelMode='sprite'/SpriteLabel:troika 文字在小游戏不可用。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from 'zustand'
import type { Group } from 'three'
import { gameEvents, type Vec3 } from '@overworld-engine/core'
import {
  BaseNPC,
  CollisionRegistration,
  Player,
  SpriteLabel,
  defaultSceneTheme,
  playerPositionRef,
  useProximityDetection,
  type NPCConfig,
  type NPCIndicator,
} from '@overworld-engine/scene'
import { CRYSTAL_SPOTS, NPCS, WORLD_BOUNDS } from './content'
import { dialogue, gold, inventory, isDialogueActive, movementInput, quests } from './engines'

const PICKUP_DISTANCE = 1.8

/** 单颗水晶:自转 + 上下浮动(不引 drei 的 Float,免去额外依赖)。 */
function Crystal({ position, phase }: { position: Vec3; phase: number }) {
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.position.y = position[1] + Math.sin(clock.elapsedTime * 2.4 + phase) * 0.18
    g.rotation.y = clock.elapsedTime * 1.6 + phase
  })
  return (
    <group ref={group} position={[position[0], position[1], position[2]]}>
      <mesh>
        <octahedronGeometry args={[0.5]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#38bdf8" emissiveIntensity={0.9} />
      </mesh>
      <pointLight color="#38bdf8" intensity={3} distance={5} />
    </group>
  )
}

/** 可拾取水晶 —— 走近即拾取(与 starter 相同的游戏侧逻辑,减去小地图)。 */
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
      {CRYSTAL_SPOTS.filter((s) => !collected.includes(s.id)).map((spot, i) => (
        <Crystal key={spot.id} position={spot.position} phase={i * 2.1} />
      ))}
    </>
  )
}

/** 头顶 HUD:任务进度 + 对话文本 + 完成吐司,全部 SpriteLabel。 */
function QuestHud() {
  const active = useStore(quests.store, (s) => s.active)
  const completed = useStore(quests.store, (s) => s.completed)
  const slots = useStore(inventory.store, (s) => s.slots)
  const currentNode = useStore(dialogue.store, (s) => s.currentNode)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = gameEvents.on('quest:completed', ({ questId }) => {
      const title = quests.getState().definitions[questId]?.title ?? questId
      setToast(`任务完成:${title}`)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setToast(null), 3000)
    })
    return () => {
      off()
      if (timer) clearTimeout(timer)
    }
  }, [])

  const crystalCount = useMemo(() => inventory.count('crystal'), [slots]) // eslint-disable-line react-hooks/exhaustive-deps

  let status: string
  if (completed.includes('gather-crystals')) {
    status = `探索完成!金币 ${gold.value}`
  } else if (active['gather-crystals']) {
    status = `收集水晶 ${crystalCount}/3`
  } else if (active['welcome']) {
    const walk = active['welcome'].objectives['walk']
    const talk = active['welcome'].objectives['talk']
    status = `步行 ${Math.floor(walk?.current ?? 0)}/20 · ${talk?.completed ? '已交谈 ✓' : '找艾拉交谈'}`
  } else {
    status = '四处看看吧'
  }

  return (
    <>
      <SpriteLabel
        text={status}
        position={[0, 3.3, 0]}
        fontSize={0.34}
        color="#e2e8f0"
        background="rgba(15, 23, 42, 0.75)"
        maxWidth={7}
      />
      {currentNode && (
        <SpriteLabel
          text={`${currentNode.speaker ?? ''}:${currentNode.text}(点右侧继续)`}
          position={[0, 4.0, 0]}
          fontSize={0.3}
          color="#fef3c7"
          background="rgba(69, 26, 3, 0.8)"
          maxWidth={7.5}
        />
      )}
      {toast && (
        <SpriteLabel
          text={toast}
          position={[0, 4.7, 0]}
          fontSize={0.4}
          color="#fde047"
          background="rgba(15, 23, 42, 0.75)"
          maxWidth={8}
        />
      )}
    </>
  )
}

/** 调试帧计数:e2e 用它断言渲染循环在跑(release 构建整段剔除)。 */
function DebugTicker() {
  useFrame(() => {
    const handle = (globalThis as Record<string, unknown>).__game as
      | { frames: number }
      | undefined
    if (handle) handle.frames += 1
  })
  return null
}

export function World() {
  // CollisionRegistration/useProximityDetection 消费 NPCConfig 形状;本模板的
  // NPC 没有模型,补上空 modelPath(BaseNPC 处仍不传,让它渲染胶囊体)。
  const npcConfigs: NPCConfig[] = useMemo(
    () =>
      NPCS.map((npc) => ({
        id: npc.id,
        name: npc.name,
        modelPath: '',
        position: npc.position,
        rotation: npc.rotation ?? [0, 0, 0],
      })),
    []
  )

  // SceneShell 尚未透传 labelMode,直接组合它的组成件(全部公开 API):
  // 碰撞注册 + 邻近检测 + BaseNPC(labelMode='sprite')。
  useProximityDetection({ npcs: npcConfigs })

  // 任务状态 → NPC 头顶指示器(游戏侧推导)
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
    <>
      <color attach="background" args={['#0b0e1a']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[12, 20, 8]} intensity={1.3} />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <gridHelper args={[40, 40, '#334155', '#334155']} position={[0, 0.01, 0]} />

      <CollisionRegistration npcs={npcConfigs} />

      {NPCS.map((npc) => (
        <BaseNPC
          key={npc.id}
          npcId={npc.id}
          name={npc.name}
          position={npc.position}
          rotation={npc.rotation}
          scale={1.2}
          theme={defaultSceneTheme.npc}
          labelMode="sprite"
          interactLabel="点击"
          indicator={npcIndicators[npc.id]}
        />
      ))}

      <Crystals />

      <Player
        externalInput={movementInput}
        isInputBlocked={isDialogueActive}
        bounds={WORLD_BOUNDS}
        cameraOffset={[0, 12, 18]}
      >
        <QuestHud />
      </Player>

      {__DEBUG__ && <DebugTicker />}
    </>
  )
}
