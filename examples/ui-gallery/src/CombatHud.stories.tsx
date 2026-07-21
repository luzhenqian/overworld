import { useEffect, useState } from 'react'
import { CastBar } from '@overworld-engine/ui'

export default { title: 'HUD / Combat' }

export const CastBars = () => {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v >= 2.5 ? 0 : v + 0.1)), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 340 }}>
      <CastBar value={t} max={2.5} label="Fireball" icon="🔥" showRemaining />
      <CastBar value={t} max={2.5} label="Channel" icon="🌊" state="channeling" channel showRemaining />
      <CastBar value={1.2} max={2.5} label="Interrupted" icon="💥" state="interrupted" />
    </div>
  )
}
