import { useState } from 'react'
import { Bar, Button } from '@overworld-engine/ui'

export default { title: 'Primitives / Bar' }

export const ResourceBars = () => {
  const [hp, setHp] = useState(80)
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <Bar value={hp} max={100} variant="hp" label="HP" showValue />
      <Bar value={40} max={100} variant="mp" label="MP" showValue />
      <Bar value={65} max={100} variant="xp" label="XP" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="danger" onClick={() => setHp((h) => Math.max(h - 15, 0))}>
          Damage
        </Button>
        <Button onClick={() => setHp(100)}>Heal</Button>
      </div>
    </div>
  )
}
