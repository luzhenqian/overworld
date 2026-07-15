/**
 * Keyboard-driven player controller with circular collision, optional GLTF
 * model + animation crossfades, follow camera and throttled `player:moved`
 * events. Everything game-specific from the source controller (model path,
 * world bounds, quest hooks, keyboard priority store) is parameterized.
 */
import { useRef, useEffect, useState, useMemo } from 'react'
import { Vector3 } from 'three'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { gameEvents, type Vec3 } from '@overworld/core'
import { useCollisionStore } from './collisionStore'
import { playerPositionRef, playerRotationRef, consumePlayerTeleport } from './playerStore'
import { FollowCamera } from './FollowCamera'

const DEFAULT_SPEED = 0.15
const DEFAULT_PLAYER_RADIUS = 0.5
/** Accumulated movement (world units) between `player:moved` emissions. */
const DEFAULT_MOVE_EVENT_THRESHOLD = 0.5

const MOVEMENT_KEYS = [
  'w',
  'a',
  's',
  'd',
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'shift',
]

type MovementState = 'idle' | 'walk' | 'run'

/** Animation clip names for the player model. */
export interface PlayerAnimationMap {
  idle?: string
  walk?: string
  run?: string
}

/**
 * A mutable ref-like movement source written by an external control (virtual
 * joystick, gamepad adapter, autopilot, ...). `x`/`z` form a movement vector
 * in world axes matching WASD semantics (x: −1 left … +1 right, z: −1
 * forward/up-screen … +1 backward/down-screen) with magnitude ≤ 1; `running`
 * requests run speed.
 *
 * Structurally compatible with `MovementInputRef` from `@overworld/input`
 * (e.g. the value returned by its `createMovementInput()` and driven by
 * `<VirtualJoystick>`) — the two packages deliberately do not import each
 * other, so either side's declaration satisfies the other.
 */
export interface MovementInputRef {
  current: { x: number; z: number; running: boolean }
}

/** Axis-aligned rectangular world bounds on the X/Z plane. */
export interface PlayerBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface PlayerProps {
  /** GLTF/GLB model URL. When omitted, a capsule placeholder is rendered. */
  modelUrl?: string
  /**
   * Animation clip names in the model. When omitted, clips are picked by the
   * source game's index convention: 0 = run, 1 = idle, 2 = walk.
   */
  animationMap?: PlayerAnimationMap
  /** Uniform scale applied to the model. Default: 1. */
  modelScale?: number
  /** Walk speed in world units per frame. Default: 0.15. */
  speed?: number
  /** Run speed (Shift held). Default: `speed * 2`. */
  runSpeed?: number
  /** Clamp the player inside these X/Z bounds. Unbounded when omitted. */
  bounds?: PlayerBounds
  /** Player collision radius. Default: 0.5. */
  colliderRadius?: number
  /** Spawn position. Default: [0, 0, 0]. */
  initialPosition?: Vec3
  /** Enable the built-in follow camera. Default: true. */
  cameraFollow?: boolean
  /** Follow-camera offset. Default: [0, 10, 30]. */
  cameraOffset?: Vec3
  /** Follow-camera lerp factor per frame. Default: 0.05. */
  cameraLerp?: number
  /**
   * Return true to ignore movement input (e.g. while a dialogue or modal is
   * open). Wire this to your input-priority system — the scene package does
   * not depend on one.
   */
  isInputBlocked?: () => boolean
  /**
   * Optional external movement source (virtual joystick, gamepad, ...) read
   * every frame and merged with the keyboard: directions are added, then the
   * combined vector is normalized. `running` is Shift OR
   * `externalInput.current.running`. An analog magnitude < 1 scales speed
   * proportionally (keyboard-only input keeps full speed). Gated by
   * `isInputBlocked`, like the keyboard.
   */
  externalInput?: MovementInputRef
  /** Distance (world units) accumulated between `player:moved` emissions. Default: 0.5. */
  moveEventThreshold?: number
  /** Extra nodes attached to the player group (lights, trails, ...). */
  children?: React.ReactNode
}

function resolveAction(
  actions: Record<string, THREE.AnimationAction | null>,
  names: string[],
  mappedName: string | undefined,
  fallbackIndex: number
): THREE.AnimationAction | null {
  if (mappedName) return actions[mappedName] ?? null
  const name = names[fallbackIndex]
  return name ? (actions[name] ?? null) : null
}

/** Skinned player model with idle/walk/run crossfades. */
function PlayerModel({
  modelUrl,
  animationMap,
  movement,
  scale,
}: {
  modelUrl: string
  animationMap: PlayerAnimationMap | undefined
  movement: MovementState
  scale: number
}) {
  const { scene, animations } = useGLTF(modelUrl)

  // Clone via SkeletonUtils to properly handle skinned meshes
  const clonedScene = useMemo(() => {
    const cloned = cloneSkeleton(scene)
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return cloned
  }, [scene])

  const { actions, names } = useAnimations(animations, clonedScene)
  const currentAction = useRef<THREE.AnimationAction | null>(null)

  // Crossfade between idle / walk / run
  useEffect(() => {
    if (names.length === 0) return

    const idle = resolveAction(actions, names, animationMap?.idle, 1)
    const walk = resolveAction(actions, names, animationMap?.walk, 2)
    const run = resolveAction(actions, names, animationMap?.run, 0)

    const next =
      movement === 'run' ? (run ?? walk ?? idle) : movement === 'walk' ? (walk ?? run ?? idle) : idle
    if (!next || next === currentAction.current) return

    next.setLoop(THREE.LoopRepeat, Infinity)
    next.reset().fadeIn(0.2).play()
    currentAction.current?.fadeOut(0.2)
    currentAction.current = next
  }, [movement, actions, names, animationMap])

  return <primitive object={clonedScene} scale={scale} />
}

/** Neutral capsule placeholder used when no model URL is provided. */
function PlayerFallback({ isMoving }: { isMoving: boolean }) {
  return (
    <mesh position={[0, 1, 0]} castShadow receiveShadow>
      <capsuleGeometry args={[0.4, 1.2, 4, 8]} />
      <meshStandardMaterial
        color="#94a3b8"
        emissive="#475569"
        emissiveIntensity={isMoving ? 0.6 : 0.3}
      />
    </mesh>
  )
}

/**
 * The player. WASD/arrow keys to move, Shift to run; an optional
 * `externalInput` source (e.g. a virtual joystick) is merged with the
 * keyboard every frame. Movement is resolved
 * against the collision store, clamped to `bounds`, mirrored into
 * `playerPositionRef`/`playerRotationRef` every frame and emitted as
 * `player:moved` events roughly every `moveEventThreshold` world units.
 */
export function Player({
  modelUrl,
  animationMap,
  modelScale = 1,
  speed = DEFAULT_SPEED,
  runSpeed = speed * 2,
  bounds,
  colliderRadius = DEFAULT_PLAYER_RADIUS,
  initialPosition = [0, 0, 0],
  cameraFollow = true,
  cameraOffset,
  cameraLerp,
  isInputBlocked,
  externalInput,
  moveEventThreshold = DEFAULT_MOVE_EVENT_THRESHOLD,
  children,
}: PlayerProps) {
  const characterRef = useRef<THREE.Group>(null)
  const resolveCollision = useCollisionStore((state) => state.resolveCollision)
  const velocity = useRef(new Vector3())
  const [movement, setMovement] = useState<MovementState>('idle')

  // Per-instance pressed-key map
  const keys = useRef<Record<string, boolean>>({})
  const isInputBlockedRef = useRef(isInputBlocked)
  isInputBlockedRef.current = isInputBlocked

  // Track previous position for distance calculation + throttled emission
  const previousPosition = useRef(new Vector3())
  const positionInitialized = useRef(false)
  const emitAccumulator = useRef(0)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputBlockedRef.current?.()) return

      const key = e.key.toLowerCase()
      if (MOVEMENT_KEYS.includes(key)) {
        keys.current[key] = true
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (MOVEMENT_KEYS.includes(key)) {
        keys.current[key] = false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useFrame(() => {
    const character = characterRef.current
    if (!character) return

    // Initialize position once
    if (!positionInitialized.current) {
      character.position.set(initialPosition[0], initialPosition[1], initialPosition[2])
      previousPosition.current.copy(character.position)
      positionInitialized.current = true
    }

    // Apply pending teleport (scene change, cutscene, ...)
    const teleport = consumePlayerTeleport()
    if (teleport) {
      character.position.set(teleport[0], teleport[1], teleport[2])
      previousPosition.current.copy(character.position)
    }

    velocity.current.set(0, 0, 0)

    // WASD or arrow keys movement
    if (keys.current['w'] || keys.current['arrowup']) velocity.current.z -= 1
    if (keys.current['s'] || keys.current['arrowdown']) velocity.current.z += 1
    if (keys.current['a'] || keys.current['arrowleft']) velocity.current.x -= 1
    if (keys.current['d'] || keys.current['arrowright']) velocity.current.x += 1

    // Merge the external movement source (virtual joystick, gamepad, ...),
    // gated by isInputBlocked just like the keyboard path.
    const external =
      externalInput && !isInputBlockedRef.current?.() ? externalInput.current : undefined
    if (external) {
      velocity.current.x += external.x
      velocity.current.z += external.z
    }

    if (velocity.current.length() > 0) {
      const isRunning = Boolean(keys.current['shift']) || Boolean(external?.running)

      // Normalize the combined direction (also evens out diagonal keyboard
      // movement). Keyboard vectors always have magnitude >= 1, so
      // keyboard-only input keeps full speed; a partially deflected analog
      // stick (magnitude < 1) scales speed proportionally.
      const intensity = Math.min(1, velocity.current.length())
      velocity.current.normalize().multiplyScalar((isRunning ? runSpeed : speed) * intensity)

      const currentPos = new Vector3(character.position.x, 0, character.position.z)
      const targetPos = new Vector3(
        character.position.x + velocity.current.x,
        0,
        character.position.z + velocity.current.z
      )

      // Resolve collisions - push player out of obstacles
      const resolvedPos = resolveCollision(currentPos, targetPos, colliderRadius)
      character.position.x = resolvedPos.x
      character.position.z = resolvedPos.z

      // Clamp to world bounds
      if (bounds) {
        character.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, character.position.x))
        character.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, character.position.z))
      }

      // Rotate character to face movement direction
      const angle = Math.atan2(velocity.current.x, velocity.current.z)
      const targetRotation = angle - Math.PI / 2
      const currentRot = character.rotation.y
      const diff = targetRotation - currentRot
      const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff))
      character.rotation.y += normalizedDiff * 0.15

      // Accumulate distance and emit `player:moved` at a throttled cadence
      const distance = previousPosition.current.distanceTo(character.position)
      if (distance > 0.01) {
        emitAccumulator.current += distance
        if (emitAccumulator.current >= moveEventThreshold) {
          gameEvents.emit('player:moved', {
            position: [character.position.x, character.position.y, character.position.z],
            distance: emitAccumulator.current,
          })
          emitAccumulator.current = 0
        }
      }
      previousPosition.current.copy(character.position)

      setMovement(isRunning ? 'run' : 'walk')
    } else {
      setMovement('idle')
    }

    // Mirror the transform into the shared refs for per-frame consumers
    playerPositionRef.current[0] = character.position.x
    playerPositionRef.current[1] = character.position.y
    playerPositionRef.current[2] = character.position.z
    playerRotationRef.current = character.rotation.y
  })

  return (
    <>
      <group ref={characterRef} position={initialPosition}>
        {modelUrl ? (
          <PlayerModel
            modelUrl={modelUrl}
            animationMap={animationMap}
            movement={movement}
            scale={modelScale}
          />
        ) : (
          <PlayerFallback isMoving={movement !== 'idle'} />
        )}
        {children}
      </group>

      {cameraFollow && (
        <FollowCamera targetRef={characterRef} offset={cameraOffset} lerp={cameraLerp} />
      )}
    </>
  )
}
