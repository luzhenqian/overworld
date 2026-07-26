import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/react-three-fiber-game-state-management';
const title = 'React Three Fiber Game State Management';
const description =
  'Structure React Three Fiber game state with TypeScript and Zustand: separate durable domain stores, frame-by-frame refs, typed events, React selectors, saves, and server authority.';

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
    question: 'Should every Three.js object live in a Zustand store?',
    answer:
      'No. Store durable game facts and low-frequency goals. Keep meshes, materials, animation mixers, interpolated transforms, and other frame-local objects in refs or the scene layer.',
  },
  {
    question: 'Can a Zustand game store live outside the R3F Canvas?',
    answer:
      'Yes. A vanilla Zustand store is independent of React and Canvas. React components can subscribe with useStore while tests and server code use getState and subscribe directly.',
  },
  {
    question: 'When should game systems use an event bus instead of a store?',
    answer:
      'Use a typed event for a fact that happened and a store for state that must be queried later. Events coordinate systems; stores answer what is true now.',
  },
  {
    question: 'Should multiplayer authoritative state use the same client store?',
    answer:
      'The client may project authoritative snapshots into a local store, but the server remains the source of truth. Client persistence must not grant authority over competitive or economic state.',
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
        'React Three Fiber',
        'Zustand',
        'TypeScript game state',
        'game architecture',
        'state management',
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

export default function ReactThreeFiberGameStateManagementGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>R3F game state</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · React Three Fiber + Zustand</p>
          <h1>React Three Fiber game state management without rerendering every frame.</h1>
          <p className="ow-en-deck">
            A 3D game has several kinds of state with different lifetimes and update rates. Put
            durable gameplay facts in headless stores, transient motion in refs, cross-system facts
            on a typed event bus, and React UI behind narrow selectors.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / State classes</div>
          <div className="ow-en-copy">
            <h2>Classify state before choosing where it lives.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Durable domain state</h3>
                <p>Quest progress, inventory slots, dialogue position, unlocks, and save metadata belong in serializable stores.</p>
              </article>
              <article className="ow-en-card">
                <h3>Frame-local state</h3>
                <p>Interpolated transforms, animation time, camera smoothing, and reusable vectors belong in refs or Three.js objects.</p>
              </article>
              <article className="ow-en-card">
                <h3>UI state</h3>
                <p>Hovered controls and local panels can stay in React; shared HUD and modal state may use a focused UI store.</p>
              </article>
              <article className="ow-en-card">
                <h3>Authoritative state</h3>
                <p>Competitive movement, shared worlds, and economic facts remain server-owned even when the client renders a projection.</p>
              </article>
            </div>
            <p>
              Update frequency is the useful dividing line. If a value changes sixty times per
              second only to move a mesh, routing it through React state creates work without adding
              meaning. If a value must survive a reload, drive a HUD, or be validated on a server,
              keeping it only inside a component ref makes it invisible to the rest of the game.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Headless stores</div>
          <div className="ow-en-copy">
            <h2>Make gameplay stores usable without React or Canvas.</h2>
            <p>
              Overworld systems expose vanilla Zustand stores. React can subscribe to them, but the
              store itself does not depend on hooks, a DOM, or WebGL.
            </p>
            <pre className="ow-en-code"><code>{`import { useStore } from 'zustand'
import { createQuestEngine } from '@overworld-engine/quest'

export const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  events,
  persist: true,
})

// React HUD: subscribe only to the projection this component renders.
function QuestCounter() {
  const activeCount = useStore(
    quests.store,
    (state) => Object.keys(state.active).length,
  )
  return <span>{activeCount} active quests</span>
}

// Test, server, command handler, or composition root:
quests.getState().startQuest('welcome')`}</code></pre>
            <p>
              Keep actions beside the state they protect. A component should ask the inventory to
              add an item rather than replacing its slot array directly, because the engine owns
              stacking, capacity, effects, persistence, and emitted events.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Frame loop</div>
          <div className="ow-en-copy">
            <h2>Read goals from stores; mutate visual objects inside useFrame.</h2>
            <pre className="ow-en-code"><code>{`const targetRef = useRef(new THREE.Vector3())
const meshRef = useRef<THREE.Group>(null)

useEffect(() => {
  return movementStore.subscribe((state) => {
    targetRef.current.set(
      state.target.x,
      state.target.y,
      state.target.z,
    )
  })
}, [])

useFrame((_, delta) => {
  if (!meshRef.current) return
  const alpha = 1 - Math.exp(-12 * delta)
  meshRef.current.position.lerp(targetRef.current, alpha)
})`}</code></pre>
            <p>
              The store carries a meaningful target that changes when gameplay changes. The ref
              carries the continuously interpolated presentation. Use the frame delta so movement
              does not depend on display refresh rate, and reuse vectors instead of allocating
              Three.js objects in the hot path.
            </p>
            <p>
              Avoid calling React <code>setState</code> or a broad Zustand action on every frame
              merely to feed the same value back into one mesh. When a frame-level threshold becomes
              a durable fact—an item was collected or a region was entered—emit that transition
              once and let domain systems update.
            </p>
            <p>
              The{' '}
              <Link href="/en/type-safe-event-bus-games-typescript">
                type-safe TypeScript game event bus guide
              </Link>{' '}
              covers payload contracts, synchronous ordering, cleanup, testing, and which events may
              cross a multiplayer boundary.
            </p>
            <p>
              For draw calls, instancing, LOD, adaptive quality, and loading budgets, continue with
              the <Link href="/en/react-three-fiber-game-performance">R3F game performance guide</Link>.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Events</div>
          <div className="ow-en-copy">
            <h2>Use typed events for facts, not as a hidden state database.</h2>
            <pre className="ow-en-code"><code>{`import {
  EventBus,
  type OverworldEventMap,
} from '@overworld-engine/core'

declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'combat:enemy-defeated': {
      enemyId: string
      xp: number
    }
  }
}

const events = new EventBus<OverworldEventMap>()

events.emit('combat:enemy-defeated', {
  enemyId: 'slime-7',
  xp: 25,
})

// Quests, achievements, audio, analytics, and UI may observe it
// without importing one another.`}</code></pre>
            <p>
              An event answers “what happened?” A store answers “what is true now?” Do not replay
              an event log every time a component needs the current inventory, and do not make the
              combat system import quest, achievement, audio, and analytics stores just to notify
              them.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Composition</div>
          <div className="ow-en-copy">
            <h2>Create stores and connections in one application composition root.</h2>
            <pre className="ow-en-code"><code>{`const events = new EventBus<OverworldEventMap>()

export const game = {
  inventory: createInventory({
    items: ITEMS,
    effects,
    context,
    events,
    persist: true,
  }),
  quests: createQuestEngine({
    quests: QUESTS,
    conditions,
    effects,
    context,
    events,
    persist: true,
  }),
  dialogue: createDialogueEngine({
    dialogues: DIALOGUES,
    conditions,
    effects,
    context,
    events,
  }),
}

export function disposeGame() {
  game.quests.dispose()
  events.clear()
}`}</code></pre>
            <p>
              Explicit construction makes test isolation, multiplayer rooms, editor previews, and
              hot reload easier. It also exposes lifecycle ownership: the application that creates
              subscriptions is responsible for disposing them.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Persistence and authority</div>
          <div className="ow-en-copy">
            <h2>Persist a selected schema, not the entire runtime.</h2>
            <p>
              Persist only serializable facts that a future build can migrate. Content definitions,
              React elements, Three.js instances, sockets, caches, and derived indexes should be
              reconstructed. Version the stored shape and test every supported migration path.
            </p>
            <p>
              Client persistence is appropriate for settings and permitted single-player progress.
              In an authoritative multiplayer game, a client store is a local projection and
              prediction workspace. The server validates commands and owns canonical shared or
              economic state.
            </p>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/typescript-game-save-system">
                <h3>Save-system architecture</h3>
                <p>Versioned migrations, named slots, atomic files, backups, and cloud boundaries.</p>
              </Link>
              <Link className="ow-en-card" href="/en/authoritative-multiplayer-typescript">
                <h3>Authoritative multiplayer</h3>
                <p>Validated inputs, prediction, reconciliation, and server-owned snapshots.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Verification</div>
          <div className="ow-en-copy">
            <h2>Test state transitions without mounting a 3D renderer.</h2>
            <ul>
              <li>Create a fresh event bus and fresh stores for each test.</li>
              <li>Drive public actions or typed events, then assert plain store snapshots.</li>
              <li>Inject storage, clocks, and random sources when behavior must be reproducible.</li>
              <li>Test React selectors separately from frame interpolation and visual regression.</li>
              <li>Record event streams when diagnosing coordination without treating them as durable state.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>React Three Fiber state-management questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>Place the state boundary inside a complete R3F architecture</h2>
              <p>Connect stores, events, domain engines, the scene, platform adapters, and tests.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-framework">
                Read the React Three Fiber RPG architecture guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
