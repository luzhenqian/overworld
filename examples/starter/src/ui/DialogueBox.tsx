import { useStore } from 'zustand'
import { useTranslation } from 'react-i18next'
import { KEYBOARD_PRIORITY, useHotkey, useKeyboardLayer } from '@overworld/input'
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
  useHotkey('e', () => {
    if (dialogue.getState().availableResponses.length === 0) dialogue.advance()
  }, { priority: KEYBOARD_PRIORITY.NPC_DIALOGUE })

  if (!currentNode) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        maxWidth: '90vw',
        background: 'rgba(10, 14, 26, 0.92)',
        border: '1px solid #3b4a72',
        borderRadius: 12,
        padding: 18,
        color: '#e8eeff',
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {currentNode.speaker && (
        <div style={{ color: '#facc15', fontWeight: 700, marginBottom: 6 }}>
          {t(currentNode.speaker)}
        </div>
      )}
      <div style={{ lineHeight: 1.6, marginBottom: 12 }}>{t(currentNode.text)}</div>
      {responses.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {responses.map((response) => (
            <button
              key={response.id}
              onClick={() => dialogue.choose(response.id)}
              style={{
                textAlign: 'left',
                background: '#1c2740',
                color: '#cfe0ff',
                border: '1px solid #35548f',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              ▸ {t(response.text)}
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => dialogue.advance()}
          style={{
            background: '#1c2740',
            color: '#cfe0ff',
            border: '1px solid #35548f',
            borderRadius: 8,
            padding: '8px 16px',
            cursor: 'pointer',
          }}
        >
          {t('dlg.continue')}
        </button>
      )}
    </div>
  )
}

export function DialogueBox() {
  const active = useStore(dialogue.store, (s) => s.activeDialogue)
  // 条件挂载:键盘层只在对话进行中注册
  return active ? <DialoguePanel /> : null
}
