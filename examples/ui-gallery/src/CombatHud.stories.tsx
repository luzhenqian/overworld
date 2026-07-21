import { useEffect, useState } from 'react'
import { BuffBar, CastBar, TargetFrame } from '@overworld-engine/ui'

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

export const Targets = () => (
  <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
    <TargetFrame
      name="Ancient Dragon"
      level={60}
      hp={82000}
      hpMax={120000}
      resource={40}
      resourceMax={100}
      classification="boss"
      reaction="hostile"
      portrait="🐉"
      buffs={[
        { id: 'enrage', icon: '🔥', remaining: 8, duration: 12, kind: 'buff' },
        { id: 'slow', icon: '🐌', remaining: 3, duration: 6, kind: 'debuff' },
      ]}
    />
    <TargetFrame
      name="Village Elder"
      level={5}
      hp={120}
      hpMax={120}
      classification="normal"
      reaction="friendly"
      portrait="🧙"
    />
  </div>
)
