import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/react-three-fiber-npc-interaction';
const title = 'React Three Fiber NPC Interaction System';
const description =
  'Build a React Three Fiber NPC interaction system with proximity detection, keyboard and touch actions, typed events, dialogue, quest indicators, input locks, and tests.';

export const metadata: Metadata = {
  title: { absolute: `${title} | Overworld Engine` },
  description,
  alternates: { canonical: path },
  openGraph: {
    type: 'article',
    url: path,
    title,
    description,
    locale: 'en_US',
    siteName: siteConfig.name,
    images: [{ url: '/og/home', width: 1200, height: 630, alt: title }],
  },
};

const faq = [
  {
    question: 'Should an NPC interaction use raycasting or proximity?',
    answer:
      'Use the intent that fits the game. Proximity plus an explicit action works well for controller, keyboard, and touch RPGs. Raycasting fits pointer-led selection. A game may use raycasting to select a target and still require distance and authority checks before acting.',
  },
  {
    question: 'Where should dialogue start in a React Three Fiber game?',
    answer:
      'Start dialogue in an application-level handler for a typed interaction event. The scene reports which entity was used; the application maps that entity to dialogue content without making the scene package import the dialogue engine.',
  },
  {
    question: 'How do I stop repeated interaction while a dialogue is open?',
    answer:
      'Ignore keyboard repeat, acquire a named gameplay input lock when the dialogue opens, release it on every close or scene-change path, and make movement, camera, keyboard, and touch sources consult the same lock.',
  },
  {
    question: 'Can the same NPC interaction run on mobile?',
    answer:
      'Yes. The visible touch button can call the same interact function used by the keyboard binding. Target selection and the emitted typed event remain identical, so dialogue and quest systems do not need a mobile-specific branch.',
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'TechArticle',
      '@id': `${absoluteUrl(path)}#article`,
      ...articleStructuredDataFields(path),
      headline: title,
      description,
      url: absoluteUrl(path),
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'Overworld Engine contributors' },
      about: [
        'React Three Fiber interaction',
        'NPC interaction system',
        'TypeScript game events',
        'dialogue system',
        'game input handling',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${absoluteUrl(path)}#faq`,
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Overworld Engine', item: absoluteUrl('/en') },
        { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl(path) },
      ],
    },
  ],
};

export default function ReactThreeFiberNpcInteractionGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>R3F NPC interaction</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">System guide · React Three Fiber + TypeScript</p>
          <h1>Build one NPC interaction pipeline for keyboard, touch, dialogue, and quests.</h1>
          <p className="ow-en-deck">
            Treat interaction as a small protocol: select an eligible target, receive an explicit
            player action, emit one typed fact, let application systems react, and suspend gameplay
            input while the resulting UI owns focus.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Pipeline</div>
          <div className="ow-en-copy">
            <h2>Separate targeting, intent, gameplay response, and presentation.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>1. Eligible target</h3>
                <p>Choose the nearest in-range NPC, a pointer-selected entity, or a server-approved target.</p>
              </article>
              <article className="ow-en-card">
                <h3>2. Player intent</h3>
                <p>Translate E, a controller action, or a touch button into the same interact command.</p>
              </article>
              <article className="ow-en-card">
                <h3>3. Typed fact</h3>
                <p>Emit an entity id and kind instead of importing dialogue, quest, shop, and analytics code.</p>
              </article>
              <article className="ow-en-card">
                <h3>4. Focus ownership</h3>
                <p>Open the appropriate UI and lock conflicting movement, camera, and interaction sources.</p>
              </article>
            </div>
            <p>
              R3F pointer events are useful for object selection, and the{' '}
              <a href="https://r3f.docs.pmnd.rs/tutorials/events-and-interaction">
                official interaction tutorial
              </a>{' '}
              documents that surface. An RPG interaction still needs product rules around distance,
              input modality, focus, dialogue, quests, multiplayer validation, and testability.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Proximity</div>
          <div className="ow-en-copy">
            <h2>Track one stable in-range target at scene level.</h2>
            <pre className="ow-en-code"><code>{`import {
  SceneShell,
  type NPCConfig,
} from '@overworld-engine/scene'

const npcs: NPCConfig[] = [{
  id: 'guide',
  name: 'Village guide',
  modelPath: '/models/guide.glb',
  position: [4, 0, 2],
  rotation: [0, Math.PI, 0],
}]

function Village() {
  return (
    <SceneShell
      npcs={npcs}
      npcProximityRadius={3}
      interactHint={(id) => <TalkHint npcId={id} />}
    >
      <VillageEnvironment />
    </SceneShell>
  )
}`}</code></pre>
            <p>
              <code>SceneShell</code> runs one proximity pass for the scene. It reads the player
              position every frame, selects the nearest NPC inside the configured radius, updates{' '}
              <code>nearbyNpcId</code>, and emits <code>proximity:enter</code> or{' '}
              <code>proximity:leave</code> only when the selected target changes.
            </p>
            <p>
              Moving NPCs can provide live position refs so the visual, collider, selection ring,
              and proximity query share the same current position. Avoid mounting one global scan
              inside every NPC: one scene-level query makes ownership and transition behavior
              explicit.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Actions</div>
          <div className="ow-en-copy">
            <h2>Map every input device to one interaction command.</h2>
            <pre className="ow-en-code"><code>{`import {
  interact,
  useInteractKey,
  useSceneStore,
} from '@overworld-engine/scene'

function GameInput() {
  useInteractKey('e') // ignores key repeat and the shared input lock
  return null
}

function TouchInteractButton() {
  const target = useSceneStore((state) => state.nearbyNpcId)
  return (
    <button
      type="button"
      disabled={!target}
      aria-label={target ? \`Talk to \${target}\` : 'No character nearby'}
      onClick={() => interact()}
    >
      Talk
    </button>
  )
}`}</code></pre>
            <p>
              <code>interact()</code> reads the current target and emits one event; it returns false
              when nothing is eligible. NPCs take precedence over buildings when both are in range.
              A gamepad action can call the same function, so input adapters do not duplicate
              dialogue or quest logic.
            </p>
            <p>
              Do not make proximity alone start a conversation. Entering a radius is useful for
              hints, ambient barks, highlighting, and preloading, but an explicit action preserves
              player intent and works predictably with controllers and touch screens.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / System wiring</div>
          <div className="ow-en-copy">
            <h2>Let the application decide what each entity interaction means.</h2>
            <pre className="ow-en-code"><code>{`import { gameEvents } from '@overworld-engine/core'

const npcDialogues: Record<string, string> = {
  guide: 'village-welcome',
  merchant: 'merchant-shop',
}

const stopInteraction = gameEvents.on(
  'entity:interact',
  ({ kind, id }) => {
    if (kind === 'npc') {
      const dialogueId = npcDialogues[id]
      if (dialogueId) dialogue.getState().start(dialogueId, id)
      return
    }

    if (kind === 'building' && id === 'forge') {
      forgePanel.open()
    }
  },
)

// Dispose when this application/room composition root is destroyed.
stopInteraction()`}</code></pre>
            <p>
              The scene reports a fact; it does not know which dialogue tree, shop, quest reward,
              audio cue, analytics event, or network command should follow. Optional systems can
              observe the same typed event without creating import chains between them.
            </p>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/typescript-dialogue-system">
                <h3>Dialogue state machine</h3>
                <p>Serializable trees, conditional choices, typed effects, localization, and UI.</p>
              </Link>
              <Link className="ow-en-card" href="/en/headless-typescript-quest-system">
                <h3>Quest reactions</h3>
                <p>Advance objectives and derive NPC indicators from event-driven quest state.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Input ownership</div>
          <div className="ow-en-copy">
            <h2>Acquire one named lock while dialogue or a modal owns focus.</h2>
            <pre className="ow-en-code"><code>{`import { inputLock } from '@overworld-engine/core'

function openDialogue(dialogueId: string, npcId: string) {
  inputLock.acquire('dialogue')
  dialogue.getState().start(dialogueId, npcId)
}

function closeDialogue() {
  try {
    dialogue.getState().close()
  } finally {
    inputLock.release('dialogue')
  }
}

// Scene transitions and test cleanup may release every abandoned owner.
function leaveScene() {
  dialogue.getState().close()
  inputLock.releaseAll()
}`}</code></pre>
            <p>
              Overworld movement, interact-key, and orbit-camera primitives consult the shared lock
              by default. A virtual joystick or custom controller should check the same source. Named
              idempotent locks allow nested owners—dialogue, inventory, pause—to release themselves
              without accidentally unlocking another active layer.
            </p>
            <p>
              Release locks on normal close, cancellation, error, route change, scene change, and
              unmount. A focus system is only reliable when its exceptional paths are as explicit as
              its happy path.
            </p>
            <Link className="ow-en-link" href="/en/react-game-hud-ui-library">
              See keyboard layers, window z-order, and gamepad focus in the HUD guide →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Feedback</div>
          <div className="ow-en-copy">
            <h2>Project interaction state into accessible, replaceable UI.</h2>
            <pre className="ow-en-code"><code>{`const active = useStore(quests.store, (state) => state.active)
const completed = useStore(quests.store, (state) => state.completed)

const indicators = {
  guide: completed.includes('gather-crystals')
    ? 'quest-complete'
    : active['gather-crystals']
      ? 'quest-in-progress'
      : 'quest-available',
} satisfies Record<string, NPCIndicator>

<SceneShell
  npcs={npcs}
  npcIndicators={indicators}
  interactHint={(id) => <TalkHint npcId={id} />}
/>`}</code></pre>
            <p>
              Quest indicators and interaction hints are props supplied by the application. The
              scene package does not read quest or localization stores. Keep critical instructions
              in DOM UI with readable labels, keyboard focus, sufficient contrast, and a touch
              target; a 3D “E” bubble can remain supplementary feedback.
            </p>
            <ul>
              <li>Show the action only when an eligible target exists.</li>
              <li>Name the action and target instead of exposing only an unexplained icon.</li>
              <li>Support keyboard, controller, and touch without changing gameplay semantics.</li>
              <li>Move focus into modal dialogue and restore it when the modal closes.</li>
              <li>Do not encode quest state only by color or a tiny 3D marker.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Authority</div>
          <div className="ow-en-copy">
            <h2>Revalidate competitive or economic interactions on the server.</h2>
            <p>
              Client proximity is a presentation and prediction signal, not proof. For multiplayer
              shops, rewards, doors, trades, or shared quest state, send an interaction command with
              the entity id and client sequence. The server checks room membership, entity
              existence, distance, cooldowns, permissions, and current authoritative state before
              producing a result.
            </p>
            <p>
              Cosmetic dialogue may remain local when it changes no authoritative facts. The{' '}
              <Link href="/en/authoritative-multiplayer-typescript">
                authoritative multiplayer guide
              </Link>{' '}
              covers validated inputs, snapshots, prediction, and reconciliation boundaries.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / Tests</div>
          <div className="ow-en-copy">
            <h2>Test the action-to-event seam without mounting WebGL.</h2>
            <pre className="ow-en-code"><code>{`it('emits one interaction for E near an NPC', () => {
  useSceneStore.setState({
    nearbyNpcId: 'guide',
    nearbyBuildingId: null,
  })
  const recorder = createEventRecorder(gameEvents)
  const { unmount } = renderHook(
    useInteractKey,
    'e',
    { isInputBlocked: () => false },
  )

  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))

  expect(recorder.events).toContainEqual(
    expect.objectContaining({
      event: 'entity:interact',
      payload: { kind: 'npc', id: 'guide' },
    }),
  )

  unmount()
  recorder.stop()
})`}</code></pre>
            <p>
              Add negative tests for no target, held-key repeat, active input locks, unmounted
              bindings, and removed listeners. Test proximity selection separately as spatial
              behavior, then keep one end-to-end scene test for the rendered hint and dialogue
              transition.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">09 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>React Three Fiber NPC interaction questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>Run this interaction as a complete vertical slice</h2>
              <p>Try movement, NPC dialogue, quest progression, rewards, inventory, HUD, and tests together.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-starter">
                Open the runnable React Three Fiber RPG starter →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
