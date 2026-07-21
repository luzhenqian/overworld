import { createAchievements } from '@overworld-engine/achievements'
import { createTutorial } from '@overworld-engine/tutorial'
import { AchievementPopup, Bar, Button, TutorialOverlay } from '@overworld-engine/ui'

export default { title: 'Engines / Tutorial & Achievements' }

const tutorial = createTutorial()
tutorial.registerTutorials([
  {
    id: 'intro',
    steps: [
      { id: 's1', content: 'This is your health bar.', target: '#story-hp' },
      { id: 's2', content: 'These are your actions.', target: '#story-actions' },
    ],
  },
])

const achievements = createAchievements()
achievements.registerAchievements([
  { id: 'first-steps', title: 'First Steps', icon: '👣', trigger: null },
])

export const TutorialStory = () => (
  <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
    <div id="story-hp" style={{ maxWidth: 280 }}>
      <Bar value={80} max={100} variant="hp" label="HP" showValue />
    </div>
    <div id="story-actions" style={{ display: 'flex', gap: 8 }}>
      <Button onClick={() => tutorial.start('intro')}>Start tutorial</Button>
    </div>
    <TutorialOverlay engine={tutorial} />
  </div>
)
TutorialStory.storyName = 'Tutorial'

export const AchievementStory = () => (
  <>
    <Button onClick={() => achievements.unlock('first-steps')}>Unlock achievement</Button>
    <AchievementPopup engine={achievements} />
  </>
)
AchievementStory.storyName = 'Achievement'
