import { useCollisionStore } from '@overworld-engine/scene'
import * as THREE from 'three'
import { bench, mulberry32 } from '../lib.mjs'

export function run() {
  const results = []
  const store = useCollisionStore.getState()
  useCollisionStore.setState({ colliders: new Map() })

  // Register 200 colliders spread over a 100×100 area (deterministic).
  const rng = mulberry32(2024)
  const colliders = new Map()
  for (let i = 0; i < 200; i++) {
    const id = `building-${i}`
    colliders.set(id, {
      id,
      position: new THREE.Vector3(rng() * 100, 0, rng() * 100),
      radius: 0.5 + rng() * 2,
      type: 'building',
    })
  }
  useCollisionStore.setState({ colliders })

  const { resolveCollision, checkCollision } = useCollisionStore.getState()

  // 1k resolves per run: random player movement targets across the map.
  {
    const targetRng = mulberry32(555)
    const targets = Array.from({ length: 1000 }, () =>
      new THREE.Vector3(targetRng() * 100, 0, targetRng() * 100)
    )
    const current = new THREE.Vector3(50, 0, 50)
    results.push(
      bench('resolveCollision, 200 colliders', (i) => {
        resolveCollision(current, targets[i % targets.length], 0.5)
      }, { iterations: 1000, meta: { colliders: 200, resolvesPerRun: 1000 } })
    )
  }

  // First-overlap query (interaction checks).
  {
    const probeRng = mulberry32(777)
    const probes = Array.from({ length: 1000 }, () =>
      new THREE.Vector3(probeRng() * 100, 0, probeRng() * 100)
    )
    results.push(
      bench('checkCollision, 200 colliders', (i) => {
        checkCollision(probes[i % probes.length], 0.5)
      }, { iterations: 1000, meta: { colliders: 200 } })
    )
  }

  // Register/unregister churn (dynamic scene objects). Map is copied per op.
  results.push(
    bench('registerCollider + unregisterCollider (200 existing)', (i) => {
      const state = useCollisionStore.getState()
      state.registerCollider({
        id: 'dynamic',
        position: new THREE.Vector3(0, 0, 0),
        radius: 1,
        type: 'npc',
      })
      state.unregisterCollider('dynamic')
    }, { iterations: 500, meta: { colliders: 200 } })
  )

  store.clearColliders()
  return { name: 'collision', results }
}
