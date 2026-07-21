import { useState } from 'react'
import { Slot, SlotGrid } from '@overworld-engine/ui'
import { Focusable, FocusProvider, useGamepadFocus } from '@overworld-engine/ui/focus'

export default { title: 'HUD / Focus' }

const ITEMS = ['🗡️', '🛡️', '🧪', '🍞', '🔑', '💰', '📜', '🏹', '💎', '🪓']

export const SpatialGrid = () => {
  const [picked, setPicked] = useState<string | null>(null)
  useGamepadFocus()
  return (
    <FocusProvider>
      <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          Arrow keys / gamepad move focus · Enter / A selects{picked ? ` · picked ${picked}` : ''}
        </p>
        <SlotGrid columns={5}>
          {ITEMS.map((icon, i) => (
            <Focusable<HTMLButtonElement> key={i} onEnterPress={() => setPicked(icon)}>
              {({ ref, focused }) => (
                <Slot ref={ref} icon={icon} selected={focused} onClick={() => setPicked(icon)} />
              )}
            </Focusable>
          ))}
        </SlotGrid>
      </div>
    </FocusProvider>
  )
}
