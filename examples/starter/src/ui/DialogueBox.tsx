import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { KEYBOARD_PRIORITY, useHotkey, useKeyboardLayer } from '@overworld-engine/input'
import { dialogue } from '../game/engines'

/**
 * Dialogue renderer. While mounted it registers a keyboard layer at
 * NPC_DIALOGUE priority, which blocks player movement (the Player's
 * isInputBlocked consults the layer stack).
 */
function DialoguePanel() {
  const { t } = useTranslation()
  const currentNode = useStore(dialogue.store, (s) => s.currentNode)
  const responses = useStore(dialogue.store, (s) => s.availableResponses)

  useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE)
  useHotkey('escape', () => dialogue.end(), {
    priority: KEYBOARD_PRIORITY.NPC_DIALOGUE,
  })
  useHotkey(
    'e',
    () => {
      if (dialogue.getState().availableResponses.length === 0) dialogue.advance()
    },
    { priority: KEYBOARD_PRIORITY.NPC_DIALOGUE }
  )

  if (!currentNode) return null
  const speaker = currentNode.speaker ? t(currentNode.speaker) : ''
  const initial = speaker.slice(0, 1).toUpperCase()

  return (
    <div className="dialogue-layer">
      <section className="dialogue-panel" aria-label={speaker || t('hud.dialogue')}>
        <div className="dialogue-accent" />
        <div className="speaker-portrait" aria-hidden="true">
          <span className="portrait-halo" />
          <span>{initial}</span>
        </div>
        <div className="dialogue-content">
          <header className="dialogue-header">
            <div>
              <small>{t('hud.conversation')}</small>
              {speaker && <h2>{speaker}</h2>}
            </div>
            <span className="dialogue-close-hint"><kbd>ESC</kbd> {t('hud.close')}</span>
          </header>
          <p className="dialogue-copy">{t(currentNode.text)}</p>
          {responses.length > 0 ? (
            <div className="dialogue-responses">
              {responses.map((response, index) => (
                <button
                  className="dialogue-response"
                  key={response.id}
                  onClick={() => dialogue.choose(response.id)}
                  type="button"
                >
                  <span className="response-index">0{index + 1}</span>
                  <span>{t(response.text)}</span>
                  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                    <path
                      d="m9 18 6-6-6-6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <button className="dialogue-continue" onClick={() => dialogue.advance()} type="button">
              <span>{t('dlg.continue')}</span>
              <kbd>E</kbd>
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

export function DialogueBox() {
  const active = useStore(dialogue.store, (s) => s.activeDialogue)
  // 条件挂载:键盘层只在对话进行中注册
  return active ? <DialoguePanel /> : null
}
