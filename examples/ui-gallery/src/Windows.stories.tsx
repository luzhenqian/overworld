import { Button, GameWindow, useUiStore } from '@overworld-engine/ui'

export default { title: 'Primitives / GameWindow' }

export const Windows = () => {
  const toggleWindow = useUiStore((s) => s.toggleWindow)
  return (
    <div style={{ position: 'relative', height: '60vh' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => toggleWindow('story-a')}>Toggle A</Button>
        <Button onClick={() => toggleWindow('story-b')}>Toggle B</Button>
      </div>
      <GameWindow id="story-a" title="Window A">
        Click a window to focus it.
      </GameWindow>
      <GameWindow id="story-b" title="Window B">
        Z-order comes from useUiStore.
      </GameWindow>
    </div>
  )
}
