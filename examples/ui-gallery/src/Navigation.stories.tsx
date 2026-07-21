import { useEffect, useRef, useState } from 'react'
import type { Vec3 } from '@overworld-engine/core'
import { computeOffscreenIndicator, MiniMap, useMinimapStore } from '@overworld-engine/minimap'
import { Compass, MinimapFrame, WaypointIndicator } from '@overworld-engine/ui'

export default { title: 'HUD / Navigation' }

const store = useMinimapStore.getState()
store.registerMarker({ id: 'shop', kind: 'shop', position: [18, 0, -10] })
store.registerMarker({ id: 'npc', kind: 'npc', position: [-14, 0, 8] })
store.registerMarker({ id: 'quest', kind: 'quest', position: [6, 0, 22] })

export const Framed = () => {
  const playerPosition = useRef<Vec3>([0, 0, 0])
  return (
    <MinimapFrame label="Verdant Hollow" coords={{ x: 0, z: 0 }}>
      <MiniMap
        worldBounds={{ minX: -50, maxX: 50, minZ: -50, maxZ: 50 }}
        playerPosition={playerPosition}
        markerColors={{ npc: '#60a5fa', shop: '#f472b6', quest: '#facc15' }}
      />
    </MinimapFrame>
  )
}

export const CompassStrip = () => {
  const [heading, setHeading] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setHeading((h) => (h + 0.02) % (Math.PI * 2)), 50)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ maxWidth: 360 }}>
      <Compass
        heading={heading}
        markers={[
          { id: 'quest', bearing: 0.6, icon: '❗', color: '#facc15' },
          { id: 'shop', bearing: 2.4, icon: '🛒', color: '#f472b6' },
          { id: 'home', bearing: 4.7, icon: '🏠' },
        ]}
      />
    </div>
  )
}

export const Waypoints = () => {
  // End-to-end proof: a real off-screen-indicator angle feeds WaypointIndicator directly.
  const objective = computeOffscreenIndicator([80, 0, 30], [0, 0, 0], 0, 40)
  return (
    <div
      style={{
        position: 'relative',
        height: '70vh',
        border: '1px dashed var(--ow-color-border)',
        borderRadius: 8,
      }}
    >
      <WaypointIndicator angle={objective.angle} label="Objective" icon="🎯" distance="42m" color="#facc15" />
      <WaypointIndicator angle={2.5} label="Shop" icon="🛒" distance="120m" />
      <WaypointIndicator angle={-1.8} label="Ally" icon="🤝" distance="18m" color="#60a5fa" />
    </div>
  )
}
