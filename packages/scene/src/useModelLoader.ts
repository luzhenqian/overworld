/**
 * Hook for loading and configuring GLB 3D models.
 * Wraps the shared useGLTF + clone + shadow setup used by scene entities.
 */
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

export interface UseModelLoaderOptions {
  /** GLTF/GLB model URL. */
  modelPath: string
  enableCastShadow?: boolean
  enableReceiveShadow?: boolean
  /** Optional callback to customize each mesh's material after cloning. */
  modifyMaterial?: (child: THREE.Mesh) => void
}

/**
 * Load a GLTF model and return a shadow-configured clone, or null when the
 * model failed to load (callers render a themed fallback in that case).
 *
 * Note: models should be preloaded (see `preloadSceneModels`) so `useGLTF`
 * resolves synchronously from cache.
 */
export function useModelLoader({
  modelPath,
  enableCastShadow = true,
  enableReceiveShadow = true,
  modifyMaterial,
}: UseModelLoaderOptions): THREE.Group | null {
  let gltf: { scene: THREE.Group } | null = null
  try {
    gltf = useGLTF(modelPath)
  } catch (error) {
    console.error(`Failed to load model: ${modelPath}`, error)
  }

  const model = useMemo(() => {
    if (!gltf?.scene) return null
    const cloned = gltf.scene.clone()
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = enableCastShadow
        child.receiveShadow = enableReceiveShadow
        if (modifyMaterial) {
          modifyMaterial(child as THREE.Mesh)
        }
      }
    })
    return cloned
  }, [gltf, enableCastShadow, enableReceiveShadow, modifyMaterial])

  return model
}
