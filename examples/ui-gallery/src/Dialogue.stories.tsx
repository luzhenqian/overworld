import { createConditionRegistry, createEffectRegistry } from '@overworld-engine/core'
import { createDialogueEngine } from '@overworld-engine/dialogue'
import { Button, DialogueBox } from '@overworld-engine/ui'

export default { title: 'Engines / Dialogue' }

const dialogue = createDialogueEngine({
  dialogues: [],
  conditions: createConditionRegistry(),
  effects: createEffectRegistry(),
})
dialogue.registerDialogues({
  id: 'elder',
  startNodeId: 'hello',
  nodes: [
    {
      id: 'hello',
      speaker: 'Village Elder',
      text: 'Welcome, traveler! Our village needs help with the herb harvest.',
      next: 'ask',
    },
    {
      id: 'ask',
      speaker: 'Village Elder',
      text: 'Will you gather 3 moon herbs for us?',
      responses: [
        { id: 'yes', text: 'Of course!', next: 'thanks' },
        { id: 'no', text: 'Maybe later.' },
      ],
    },
    { id: 'thanks', speaker: 'Village Elder', text: 'Bless you! Come back soon.' },
  ],
})

export const Dialogue = () => (
  <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
    <Button onClick={() => dialogue.start('elder')}>Talk to elder</Button>
    <DialogueBox engine={dialogue} portrait={() => <span>🧓</span>} />
  </div>
)
