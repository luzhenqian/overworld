import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/type-safe-event-bus-games-typescript';
const title = 'Type-Safe Event Bus for Games in TypeScript';
const description =
  'Build a type-safe event bus for TypeScript games: define payload contracts, separate events from commands and state, test order, and relay approved events.';

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
    question: 'Should a TypeScript game use a global event bus?',
    answer:
      'A global bus is convenient for a single application instance, but isolated buses are safer for tests, multiplayer rooms, editor previews, and hot reload. Create the bus in the composition root and inject it into systems that share that lifecycle.',
  },
  {
    question: 'What is the difference between a game event and a command?',
    answer:
      'A command asks one owner to attempt work and may return a result. An event reports a fact that already happened and may have zero or many observers. Use a store for facts that must be queried later.',
  },
  {
    question: 'Should event handlers be synchronous or asynchronous?',
    answer:
      'Overworld dispatches listeners synchronously so ordering is explicit. A listener may start asynchronous work, but the bus does not await it. Model completion or failure as another event or a direct command result instead of assuming emit waits.',
  },
  {
    question: 'Can I send every local game event over multiplayer transport?',
    answer:
      'No. Relay an explicit allowlist of JSON-serializable, protocol-owned events. Validate authoritative commands on the server, and do not expose local UI, analytics, debug, or trusted economic events to arbitrary peers.',
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
        'TypeScript event bus',
        'event-driven game architecture',
        'type-safe events',
        'publish subscribe',
        'game system decoupling',
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

export default function TypeSafeEventBusGamesGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Type-safe game event bus</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · TypeScript · renderer independent</p>
          <h1>Use a type-safe event bus without turning your game into invisible spaghetti.</h1>
          <p className="ow-en-deck">
            Events are useful when one gameplay fact has optional, one-to-many reactions. They are
            harmful when they replace every direct call or become a hidden state database. Define a
            typed contract, keep delivery semantics small, own subscription lifecycles, and make
            event flow observable.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Vocabulary</div>
          <div className="ow-en-copy">
            <h2>Choose an event, command, or store by the question being asked.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Event: what happened?</h3>
                <p><code>enemy:defeated</code> reports a completed fact. Quests, audio, analytics, achievements, and UI may observe it.</p>
              </article>
              <article className="ow-en-card">
                <h3>Command: please attempt this</h3>
                <p><code>inventory.addItem()</code> has one owner, validates rules, and can return success, overflow, or failure.</p>
              </article>
              <article className="ow-en-card">
                <h3>State: what is true now?</h3>
                <p>A quest store answers which objectives are active. Do not reconstruct current state by replaying incidental UI events.</p>
              </article>
              <article className="ow-en-card">
                <h3>Effect reference: run registered behavior</h3>
                <p>Serializable content can name an effect, while a registry resolves the game-owned implementation explicitly.</p>
              </article>
            </div>
            <p>
              Event-driven architecture decouples producers from consumers, but ordering, error
              handling, observability, and consistency still require design. The{' '}
              <a href="https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven">
                Microsoft architecture overview
              </a>{' '}
              distinguishes broker and mediator topologies. A local game bus is much smaller than a
              distributed broker: it coordinates one process and must not pretend to provide durable
              delivery, retries, or transactions.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Typed contract</div>
          <div className="ow-en-copy">
            <h2>Map each event name to exactly one payload shape.</h2>
            <pre className="ow-en-code"><code>{`import { EventBus } from '@overworld-engine/core'

interface GameEventMap {
  'combat:enemy-defeated': {
    enemyId: string
    byPlayerId: string
    xp: number
  }
  'door:opened': {
    doorId: string
    actorId: string
  }
  'player:level-changed': {
    playerId: string
    previous: number
    current: number
  }
}

const events = new EventBus<GameEventMap>()

events.on('combat:enemy-defeated', ({ enemyId, xp }) => {
  console.log(enemyId, xp)
})

events.emit('combat:enemy-defeated', {
  enemyId: 'slime-7',
  byPlayerId: 'player-1',
  xp: 25,
})`}</code></pre>
            <p>
              The event name selects the payload type for both emitters and listeners. Prefer
              serializable identifiers and values over React elements, Three.js objects, sockets,
              stores, or mutable class instances. A stable payload is easier to inspect, record,
              test, and selectively send across a protocol.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Extension</div>
          <div className="ow-en-copy">
            <h2>Extend the framework contract without editing framework source.</h2>
            <pre className="ow-en-code"><code>{`import {
  gameEvents,
  type OverworldEventMap,
} from '@overworld-engine/core'

declare module '@overworld-engine/core' {
  interface OverworldEventMap {
    'combat:enemy-defeated': {
      enemyId: string
      xp: number
    }
    'crafting:recipe-completed': {
      recipeId: string
      quantity: number
    }
  }
}

gameEvents.emit('crafting:recipe-completed', {
  recipeId: 'iron-sword',
  quantity: 1,
})

type EventName = keyof OverworldEventMap`}</code></pre>
            <p>
              TypeScript declaration merging lets a product add domain events while preserving one
              typed map. Keep ownership visible: define combat events beside the combat boundary,
              export the augmentation once, and avoid several modules declaring incompatible
              payloads for the same name.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Scope</div>
          <div className="ow-en-copy">
            <h2>Create buses and systems in the same composition root.</h2>
            <pre className="ow-en-code"><code>{`import {
  EventBus,
  type OverworldEventMap,
} from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'
import { createDialogueEngine } from '@overworld-engine/dialogue'

export function createGameSession() {
  const events = new EventBus<OverworldEventMap>()

  const quests = createQuestEngine({
    quests: QUESTS,
    conditions,
    effects,
    context,
    events,
  })
  const dialogue = createDialogueEngine({
    dialogues: DIALOGUES,
    conditions,
    effects,
    context,
    events,
  })

  return {
    events,
    quests,
    dialogue,
    dispose() {
      quests.dispose()
      events.clear()
    },
  }
}`}</code></pre>
            <p>
              The global <code>gameEvents</code> singleton is a convenient default for one game
              instance. A factory-owned bus gives tests, multiplayer rooms, editor previews, and
              server sessions independent listeners and cleanup. Systems that accept an injected bus
              remain usable in either model.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Delivery</div>
          <div className="ow-en-copy">
            <h2>Know exactly what emit means before gameplay depends on it.</h2>
            <p>
              Overworld delivery is synchronous and registration-ordered. <code>emit</code> returns
              after all current event-specific listeners and <code>onAny</code> observers have been
              called. Each listener collection is copied for the emission, so subscribing or
              unsubscribing during a handler does not change which event-specific listeners receive
              that same emission.
            </p>
            <ul>
              <li>A thrown listener error is logged and does not prevent later listeners from running.</li>
              <li><code>once</code> unsubscribes itself before invoking its handler.</li>
              <li>Async work started by a listener is not awaited by <code>emit</code>.</li>
              <li>A nested emit runs immediately; avoid deep event chains and accidental recursion.</li>
              <li>Emit only effective state transitions, not every no-op setter or render frame.</li>
            </ul>
            <p>
              If one operation requires validation, a return value, or transactional sequencing,
              call its owning method directly. Emit a fact after the owner commits the change.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Lifecycle</div>
          <div className="ow-en-copy">
            <h2>Treat every subscription as a resource that must be released.</h2>
            <pre className="ow-en-code"><code>{`function bindQuestNotifications(events: EventBus<OverworldEventMap>) {
  const stopStarted = events.on('quest:started', ({ questId }) => {
    notifications.show({ kind: 'quest-started', questId })
  })
  const stopCompleted = events.on('quest:completed', ({ questId }) => {
    notifications.show({ kind: 'quest-completed', questId })
  })

  return () => {
    stopCompleted()
    stopStarted()
  }
}

const unbind = bindQuestNotifications(events)
// route, room, preview, hot-reload, or test teardown:
unbind()`}</code></pre>
            <p>
              Ghost listeners cause duplicate rewards, stale UI updates, retained objects, and
              confusing hot-reload behavior. The component or session that creates a subscription
              owns its unsubscribe function. Reserve <code>clear()</code> for a bus whose entire
              lifecycle is ending; do not use it to erase listeners owned by unrelated modules on a
              shared bus.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Tests and observability</div>
          <div className="ow-en-copy">
            <h2>Record order and profile synchronous listener cost.</h2>
            <pre className="ow-en-code"><code>{`import { createEventRecorder } from '@overworld-engine/test-kit'
import { profileBus } from '@overworld-engine/devtools'

const recorder = createEventRecorder(events)
const profiler = profileBus(events)

events.emit('combat:enemy-defeated', {
  enemyId: 'slime-7',
  byPlayerId: 'player-1',
  xp: 25,
})

expect(recorder.events.map(({ event }) => event)).toEqual([
  'combat:enemy-defeated',
])

console.log(profiler.top(5, 'totalMs'))
profiler.stop()
recorder.stop()`}</code></pre>
            <p>
              The recorder assigns deterministic sequence numbers rather than timestamps. The
              profiler measures synchronous dispatch only; promises started by handlers are outside
              its duration. In development, <code>EventBusInspector</code> provides a bounded live
              stream and per-event counts without changing domain code.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / Network boundary</div>
          <div className="ow-en-copy">
            <h2>Relay an explicit protocol allowlist, never the whole local bus.</h2>
            <pre className="ow-en-code"><code>{`import { relayEvents } from '@overworld-engine/net'

const stopRelay = relayEvents(events, transport, {
  events: [
    'door:opened',
    'weather:changed',
  ],
})

// Stops both outbound forwarding and inbound re-emission.
stopRelay()`}</code></pre>
            <p>
              Relayed payloads must be JSON-serializable. The relay suppresses echo loops and ignores
              events outside its allowlist, but it is not an authority system. A peer must not be
              allowed to manufacture trusted events such as currency granted or inventory changed.
              Send validated commands to the authoritative server and let that server emit accepted
              results.
            </p>
            <Link className="ow-en-link" href="/en/authoritative-multiplayer-typescript">
              Read the authoritative TypeScript multiplayer guide →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">09 / Boundaries</div>
          <div className="ow-en-copy">
            <h2>Use events selectively enough that dependencies stay understandable.</h2>
            <ul>
              <li>Do not use events for a request with exactly one required owner and result.</li>
              <li>Do not store mutable current state only inside past event payloads.</li>
              <li>Do not create long chains where handlers emit handlers emit handlers.</li>
              <li>Do not name events after UI implementation details when they represent domain facts.</li>
              <li>Do not put per-frame transforms on a broad application bus.</li>
              <li>Do document producers, payload meaning, expected consumers, and delivery scope.</li>
            </ul>
            <p>
              The bus is a coordination seam, not the architecture itself. Stores own queryable
              state, engines own invariants, registries resolve content behavior, renderers own
              presentation, and transports own protocol validation.
            </p>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/react-three-fiber-game-state-management">
                <h3>State boundaries</h3>
                <p>Separate durable stores, frame-local refs, React selectors, events, saves, and server authority.</p>
              </Link>
              <Link className="ow-en-card" href="/en/react-three-fiber-rpg-framework">
                <h3>Complete architecture</h3>
                <p>Compose renderers, domain systems, events, platform adapters, persistence, and tests.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">10 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>TypeScript game event-bus questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>See events coordinate a complete gameplay slice</h2>
              <p>Run movement, interaction, dialogue, quest progress, rewards, inventory, UI, analytics, and tests.</p>
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
