import { useEffect, useState } from 'react'
import { BuffBar, CastBar } from '@overworld-engine/ui'

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

export const Buffs = () => {
  const [t, setT] = useState(12)
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v <= 0 ? 12 : v - 0.2)), 200)
    return () => clearInterval(id)
  }, [])
  return (
    <BuffBar
      buffs={[
        { id: 'might', icon: '⚔️', remaining: t, duration: 12, stacks: 3, kind: 'buff' },
        { id: 'shield', icon: '🛡️', remaining: t * 5, duration: 60, kind: 'buff' },
        { id: 'poison', icon: '☠️', remaining: t / 2, duration: 6, kind: 'debuff' },
        { id: 'blessing', icon: '✨', kind: 'buff' },
      ]}
    />
  )
}
