import { Button, IconButton } from '@overworld-engine/ui'

export default { title: 'Primitives / Button' }

export const Variants = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Button>Primary</Button>
    <Button variant="ghost">Ghost</Button>
    <Button variant="danger">Danger</Button>
    <Button disabled>Disabled</Button>
    <IconButton label="Settings">⚙️</IconButton>
  </div>
)

export const AsChild = () => (
  <div style={{ display: 'flex', gap: 8 }}>
    <Button asChild>
      <a href="https://github.com/luzhenqian/overworld" target="_blank" rel="noreferrer">
        Renders an &lt;a&gt;
      </a>
    </Button>
  </div>
)
AsChild.storyName = 'asChild'
