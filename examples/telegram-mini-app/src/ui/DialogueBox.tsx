import { useStore } from 'zustand'
import { KEYBOARD_PRIORITY, useHotkey, useKeyboardLayer } from '@overworld-engine/input'
import { dialogue } from '../game/engines'

/**
 * 对话渲染器。挂载期间注册一个 NPC_DIALOGUE 优先级的键盘层,
 * 从而屏蔽玩家移动(Player 的 isInputBlocked 会查询层栈)。
 */
function DialoguePanel() {
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
      id="dialogue-box"
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        maxWidth: '90vw',
        background: 'var(--hud-panel-bg, rgba(10, 14, 26, 0.92))',
        border: '1px solid var(--hud-panel-border, #3b4a72)',
        borderRadius: 12,
        padding: 18,
        color: 'var(--hud-text, #e8eeff)',
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {currentNode.speaker && (
        <div style={{ color: 'var(--hud-accent, #facc15)', fontWeight: 700, marginBottom: 6 }}>
          {currentNode.speaker}
        </div>
      )}
      <div style={{ lineHeight: 1.6, marginBottom: 12 }}>{currentNode.text}</div>
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
              ▸ {response.text}
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
          继续(E)
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
