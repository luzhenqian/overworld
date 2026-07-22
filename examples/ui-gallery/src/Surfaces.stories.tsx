import { useState } from 'react'
import { Button, Modal, Panel, Tooltip } from '@overworld-engine/ui'

export default { title: 'Primitives / Surfaces' }

export const PanelWithTitle = () => (
  <Panel title="Character" onClose={() => {}} style={{ maxWidth: 280 }}>
    Panel body content.
  </Panel>
)

export const ModalStory = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal.Root open={open} onDismiss={() => setOpen(false)}>
        <Modal.Content>
          <Panel title="Confirm">
            Backdrop click dismisses.
            <footer style={{ marginTop: 12 }}>
              <Modal.Close asChild>
                <Button variant="ghost">Close</Button>
              </Modal.Close>
            </footer>
          </Panel>
        </Modal.Content>
      </Modal.Root>
    </>
  )
}
ModalStory.storyName = 'Modal'

export const TooltipStory = () => (
  <Tooltip content="A dependable blade.">
    <Button variant="ghost">Hover me</Button>
  </Tooltip>
)
TooltipStory.storyName = 'Tooltip'
