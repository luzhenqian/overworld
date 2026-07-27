import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/react-game-hud-ui-library';
const title = 'Build a Game HUD in React with Headless TypeScript UI';
const description =
  'Build a React game HUD with headless TypeScript UI: pointer-transparent overlays, pure HUD math, engine-bound components, window z-order, gamepad focus, and CSS themes.';

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
    question: 'What does “headless” mean for a game UI library?',
    answer:
      'Headless means the layout math, selectors, and state machines are exported as plain functions and stores that render nothing. A cast bar is a number pair turned into a fill percentage; a tooltip is a rectangle solver; a quest tracker is a join between definitions and progress. Styled components are a thin optional layer on top, so a project can keep the logic and replace every element.',
  },
  {
    question: 'Should HUD state live in the same store as game state?',
    answer:
      'No. Which windows are open, which panel is on top, and which element has focus are presentation state that no simulation should depend on. Keep them in a UI store, keep quests, inventory, and dialogue in their engines, and let the HUD subscribe to engine stores through selectors.',
  },
  {
    question: 'Why not use a general React component library for a game HUD?',
    answer:
      'Application component libraries assume a document that owns the pointer, scrolls, and takes keyboard focus. A HUD is an overlay above a running canvas: it must stay pointer-transparent except where widgets sit, arbitrate keys with gameplay controls, survive controller-only navigation, and reskin per art direction. Those constraints, not the button markup, are the hard part.',
  },
  {
    question: 'How do you make a React HUD usable with a gamepad?',
    answer:
      'Wrap the navigable region in a spatial-navigation provider, register each interactive element as focusable, and bridge stick and D-pad input to directional focus moves with a dead zone and a repeat interval. The same focus model then serves keyboard players, and modal surfaces trap focus while they are open.',
  },
  {
    question: 'Does a DOM overlay hurt frame rate?',
    answer:
      'Only if it re-renders like game state. Subscribe with narrow selectors so a health bar does not re-render the quest log, keep per-frame values such as cast timers in the component that displays them, and drive continuous motion with CSS transitions instead of React state updates every frame.',
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
        'React game HUD',
        'headless game UI library',
        'TypeScript game interface',
        'React Three Fiber overlay UI',
        'gamepad focus navigation',
        'game UI theming',
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

export default function ReactGameHudUiLibraryGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>React game HUD UI</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Game UI · React · TypeScript · renderer independent</p>
          <h1>A game HUD is an overlay, an input arbiter, and a pile of math — not a web page.</h1>
          <p className="ow-en-deck">
            The markup for a health bar is trivial. What breaks projects is everything around it:
            clicks leaking into the canvas, the inventory hotkey firing while a text field is
            focused, a controller that cannot reach the close button, and an art pass that requires
            rewriting components. Separate the overlay, the pure math, the engine bindings, and the
            skin, and each of those problems stays solved.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Boundary</div>
          <div className="ow-en-copy">
            <h2>Game interface state is not simulation state.</h2>
            <p>
              A quest exists whether or not a tracker is mounted. An item stack exists whether or not
              the bag window is open. Keep three layers apart and the HUD stops being the place where
              gameplay bugs hide:
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Engine state</h3>
                <p>Quests, dialogue, inventory, achievements — owned by headless engines and persisted in saves.</p>
              </article>
              <article className="ow-en-card">
                <h3>Chrome state</h3>
                <p>Which windows are open, stacking order, focus, and toasts — owned by a UI store, never saved as progress.</p>
              </article>
              <article className="ow-en-card">
                <h3>Frame state</h3>
                <p>Cast timers, damage numbers, and nameplate positions — recomputed per frame, not stored globally.</p>
              </article>
              <article className="ow-en-card">
                <h3>Presentation</h3>
                <p>Tokens, skins, and layout — swappable CSS, so art direction never forces a logic rewrite.</p>
              </article>
            </div>
            <p>
              This split is what makes the UI layer reusable. <code>@overworld-engine/ui</code> ships
              with zero runtime dependencies on other engine packages: components that display quests
              or inventories accept structurally typed props instead of importing those packages, and
              a dependency rule in CI keeps it that way.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Overlay</div>
          <div className="ow-en-copy">
            <h2>Mount one pointer-transparent overlay above the canvas, then anchor widgets into it.</h2>
            <pre className="ow-en-code"><code>{`import { Hud, Bar, Hotbar, QuestTracker } from '@overworld-engine/ui'
import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/hextech.css'

<div style={{ position: 'relative', inset: 0 }}>
  <Canvas>{/* React Three Fiber scene */}</Canvas>

  <Hud theme="hextech">
    <Hud.Anchor anchor="top-left">
      <Bar value={hp} max={100} variant="hp" label="HP" showValue />
      <QuestTracker engine={quests} max={3} />
    </Hud.Anchor>
    <Hud.Anchor anchor="bottom">
      <Hotbar>{slots}</Hotbar>
    </Hud.Anchor>
  </Hud>
</div>`}</code></pre>
            <p>
              The overlay itself does not receive pointer events; only the widgets inside an anchor
              do. That single rule prevents the most common HUD defect in canvas games, where a
              full-screen interface div silently swallows every click meant for the world. Nine
              anchor positions cover the standard screen regions, and the overlay sits above the
              canvas inside one relatively positioned container instead of relying on ad-hoc
              z-index values scattered across the app.
            </p>
            <Link className="ow-en-link" href="/en/react-three-fiber-rpg-framework">
              See how the overlay fits the wider React Three Fiber architecture →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Pure math</div>
          <div className="ow-en-copy">
            <h2>Export the hard parts as functions that render nothing.</h2>
            <pre className="ow-en-code"><code>{`import {
  castProgress,
  buffSweepPct,
  formatBuffTime,
  positionTooltip,
  edgeAnchor,
} from '@overworld-engine/ui'

// Normal casts fill 0 → 100%; channels drain 100 → 0%.
castProgress(1.2, 2, { channel: true })
// → { fillPct: 40, remainingSeconds: 0.8 }

// Compact countdowns: "1:23", "45s", "3.2".
formatBuffTime(83)   // '1:23'
formatBuffTime(9.97) // '10s'

// Flip above → below when the tooltip would clip the viewport.
positionTooltip(anchorRect, tipSize, viewport)
// → { x: 312, y: 84, placement: 'above' }

// Pin an off-screen objective arrow to the screen edge.
edgeAnchor(bearingRadians)
// → { xPct, yPct, rotationDeg }`}</code></pre>
            <p>
              Every one of these is a pure function of numbers. They can be unit tested without a
              DOM, a renderer, or a test-library harness, and they stay correct when the markup
              around them is replaced. Boundary behavior is the reason to centralize them: rounding
              a countdown at 59.5 seconds should produce <code>1:00</code> rather than{' '}
              <code>60s</code>, and a tooltip near the top edge should flip rather than clip. Those
              are the details every project re-implements slightly wrong.
            </p>
            <p>
              The same approach covers selectors. <code>trackerRows</code> joins quest definitions
              with active progress, drops hidden objectives, skips actives with no definition,
              defaults missing progress to zero, and sorts oldest quest first — as a function you can
              assert on directly.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Engine binding</div>
          <div className="ow-en-copy">
            <h2>Bind components to engines by shape, not by import.</h2>
            <pre className="ow-en-code"><code>{`// The UI package declares only what it reads.
export interface ReadableStore<T> {
  getState(): T
  getInitialState(): T
  subscribe(listener: (s: T, prev: T) => void): () => void
}

export interface QuestEngineLike {
  store: ReadableStore<{
    definitions: Record<string, QuestDefinitionLike>
    active: Record<string, ActiveQuestLike>
    completed: readonly string[]
  }>
}

// A real engine satisfies it structurally — no import required.
const quests = createQuestEngine({ quests: [], conditions, effects })

<QuestTracker engine={quests} />
<InventoryWindow engine={inventory} />
<DialogueBox engine={dialogue} />
<ToastViewport store={useToastStore} anchor="top-right" />`}</code></pre>
            <p>
              Structural typing keeps the UI package installable on its own and keeps the coupling
              honest: a component that only reads quest definitions and progress declares exactly
              that, so any store of the same shape — a mock, a replay harness, a networked mirror —
              works in its place. Components subscribe through selectors, so a health change does not
              re-render the quest log.
            </p>
            <Link className="ow-en-link" href="/en/react-three-fiber-game-state-management">
              Compare the store, selector, and frame-loop boundaries in detail →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Windows</div>
          <div className="ow-en-copy">
            <h2>Give windows one registry with real z-order instead of scattered booleans.</h2>
            <pre className="ow-en-code"><code>{`import {
  GameWindow,
  useUiStore,
  selectAnyWindowOpen,
} from '@overworld-engine/ui'

const toggleWindow = useUiStore((s) => s.toggleWindow)
const anyOpen = useUiStore(selectAnyWindowOpen)

<button onClick={() => toggleWindow('inventory')}>Bag</button>

<GameWindow id="inventory" title="Inventory">
  <SlotGrid columns={5}>{slots}</SlotGrid>
</GameWindow>`}</code></pre>
            <p>
              Opening a window assigns it the next topmost z value; clicking an already-open window
              raises it again; closing is a no-op for unknown ids. The registry is keyed by string,
              so a game adds a map, a skill tree, or a settings panel without touching the store's
              shape. Because the reducers are pure functions over{' '}
              <code>{'{ windows, topZ }'}</code>, stacking rules are testable without rendering
              anything.
            </p>
            <p>
              <code>selectAnyWindowOpen</code> is the hook that connects interface state back to
              gameplay: when any window is open, the host can mute movement input, pause ambient
              interaction prompts, or dim the world.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Input arbitration</div>
          <div className="ow-en-copy">
            <h2>Decide who owns a key press before the HUD grows a third overlay.</h2>
            <pre className="ow-en-code"><code>{`import {
  KEYBOARD_PRIORITY,
  useKeyboardLayer,
  useHotkey,
} from '@overworld-engine/input'

function DialogueOverlay() {
  // Blocks lower-priority handlers and acquires the shared input lock.
  useKeyboardLayer('dialogue', KEYBOARD_PRIORITY.NPC_DIALOGUE, {
    lockInput: true,
  })
  ...
}

function GameControls() {
  useHotkey('i', () => toggleWindow('inventory'), {
    priority: KEYBOARD_PRIORITY.GAME_CONTROLS,
  })
}`}</code></pre>
            <p>
              Layers are registered by id with a numeric priority; a higher layer blocks lower
              handlers, optionally only for named keys. Registration is tied to component lifetime,
              so an overlay that unmounts cannot leave the game deaf. Hotkeys ignore key presses that
              originate in editable elements by default, which removes the classic bug where typing a
              character name opens the inventory.
            </p>
            <p>
              The shared input lock covers non-keyboard surfaces too — a cutscene that acquires it
              also suppresses the virtual joystick on touch builds.
            </p>
            <Link className="ow-en-link" href="/en/react-three-fiber-npc-interaction">
              See input locks applied to proximity interaction and dialogue →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Focus</div>
          <div className="ow-en-copy">
            <h2>Controller navigation and accessibility are the same problem.</h2>
            <pre className="ow-en-code"><code>{`import {
  FocusProvider,
  Focusable,
  useGamepadFocus,
  useSpatialFocus,
} from '@overworld-engine/ui/focus'

function PauseMenu() {
  // Left stick / D-pad move focus; A dispatches Enter.
  useGamepadFocus({ deadZone: 0.5, repeatMs: 180 })
  const { setFocus } = useSpatialFocus()

  return (
    <FocusProvider>
      <Focusable focusKey="resume" onEnterPress={resume}>
        {({ ref, focused }) => (
          <Button ref={ref} data-focused={focused}>
            Resume
          </Button>
        )}
      </Focusable>
      <Focusable focusKey="quit" onEnterPress={quit}>
        {({ ref, focused }) => (
          <Button ref={ref} data-focused={focused}>
            Quit
          </Button>
        )}
      </Focusable>
    </FocusProvider>
  )
}`}</code></pre>
            <p>
              Spatial navigation ships on a separate entry point with an optional peer dependency, so
              a mouse-and-keyboard-only game never pays for it. The gamepad bridge polls with a dead
              zone and a repeat interval and no-ops when no pad is connected, so the same build runs
              on desktop and console-style input without branching.
            </p>
            <p>
              Standard semantics carry the rest. Resource and cast bars expose{' '}
              <code>role=&quot;progressbar&quot;</code> with value bounds; modal surfaces own the
              backdrop, trap Tab, dismiss on Escape, and restore focus on close; decorative icons are
              marked <code>aria-hidden</code>; dismiss controls carry labels. A HUD that a screen
              reader can describe is usually the same HUD a controller can traverse.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / Theming</div>
          <div className="ow-en-copy">
            <h2>Reskin with CSS variables, and escape the markup with one prop.</h2>
            <pre className="ow-en-code"><code>{`import '@overworld-engine/ui/styles.css'
import '@overworld-engine/ui/themes/xianxia.css'

// Switch the whole HUD's skin from one attribute.
<Hud theme="xianxia">...</Hud>

// Render your own element while keeping behavior.
<Button asChild>
  <a href="/inventory">Open inventory</a>
</Button>

<Modal.Close asChild>
  <Button variant="ghost">Cancel</Button>
</Modal.Close>`}</code></pre>
            <p>
              A base stylesheet defines <code>--ow-*</code> tokens; each skin overrides them under a{' '}
              <code>data-ow-theme</code> attribute. Four skins ship as examples — hextech, pixel,
              tactical, and xianxia — but the contract that matters is the token set, because a game
              with its own art direction overrides tokens rather than forking components.
            </p>
            <p>
              When markup itself must change, <code>asChild</code> merges a component&apos;s props
              and ref onto a single child element you provide. The underlying slot primitive is
              exported, so your own components can offer the same escape hatch instead of accreting
              <code>as</code> props and wrapper divs.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">09 / World anchors</div>
          <div className="ow-en-copy">
            <h2>Keep world-to-screen projection out of the widgets.</h2>
            <pre className="ow-en-code"><code>{`import { Nameplate, WaypointIndicator } from '@overworld-engine/ui'

// The host projects world → screen each frame and positions the plate.
<div style={{ position: 'absolute', left: x, top: y }}>
  <Nameplate name="Bandit" hp={62} hpMax={100} level={7} showLevel />
</div>

// Bearing in radians, 0 = up, clockwise — the same value the
// minimap package's computeOffscreenIndicator() returns.
<WaypointIndicator angle={bearing} label="Elder" distance="42m" />`}</code></pre>
            <p>
              Nameplates, waypoint arrows, and compass strips are the seam where 3D and DOM meet, and
              the seam is where coupling accumulates. Components here accept plain screen-space
              numbers: a nameplate renders a name and a health bar and lets the host decide where it
              sits; a waypoint arrow converts a bearing into an edge position and rotation with the
              same pure function you can test in isolation. Projection stays in the frame loop, where
              it belongs, and the widgets stay renderer independent.
            </p>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/headless-typescript-quest-system">
                <h3>Quest data behind the tracker</h3>
                <p>Event-driven objectives, prerequisites, rewards, chains, persistence, and tests.</p>
              </Link>
              <Link className="ow-en-card" href="/en/headless-typescript-inventory-system">
                <h3>Inventory behind the bag window</h3>
                <p>Item definitions, stacking, capacity, overflow, use effects, events, and saves.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-dialogue-system">
                <h3>Dialogue behind the dialogue box</h3>
                <p>Serializable trees, conditional choices, declarative effects, and localization.</p>
              </Link>
              <Link className="ow-en-card" href="/en/react-three-fiber-game-performance">
                <h3>Frame cost of the overlay</h3>
                <p>Profiling, frame loops, selector churn, adaptive quality, and staged loading.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">10 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>React game HUD and headless UI questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>See the HUD wired to real engines in a complete slice</h2>
              <p>Movement, dialogue, quests, inventory, rewards, HUD, windows, and tests together.</p>
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
