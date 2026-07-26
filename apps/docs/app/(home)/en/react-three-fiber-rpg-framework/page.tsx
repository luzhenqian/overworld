import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/react-three-fiber-rpg-framework';
const title = 'React Three Fiber RPG Architecture Guide';
const description =
  'Learn how to structure a React Three Fiber RPG with renderer-independent TypeScript systems, typed events, stores, server-safe rules, and a clean composition root.';

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

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'TechArticle',
      '@id': `${absoluteUrl(path)}#article`,
      headline: title,
      description,
      url: absoluteUrl(path),
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'Overworld Engine contributors' },
      about: ['React Three Fiber', 'Three.js', 'TypeScript', 'RPG architecture'],
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

export default function ReactThreeFiberRpgGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>R3F RPG architecture</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · React Three Fiber + TypeScript</p>
          <h1>Build RPG systems around React Three Fiber—not inside the scene graph.</h1>
          <p className="ow-en-deck">
            React Three Fiber is an excellent rendering boundary. A maintainable RPG keeps quests,
            inventory, dialogue, saves, and multiplayer rules in headless systems that can run with
            or without React and WebGL.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Boundary</div>
          <div className="ow-en-copy">
            <h2>Let R3F own presentation and the frame.</h2>
            <p>
              R3F should own components that express the visual scene: meshes, lights, cameras,
              effects, animation playback, and input hit targets. Domain systems should own facts
              that remain true when no frame is rendering: a quest is active, an item was acquired,
              a dialogue node was visited, or a save version was migrated.
            </p>
            <p>
              The practical test is simple: <strong>could this rule execute in a Node.js process?</strong>{' '}
              If yes, it should not depend on a React hook, a Three.js object, or the browser DOM.
              This separation is what makes the same rules usable by tests, authoritative servers,
              editor previews, and different clients.
            </p>
            <ul>
              <li><strong>Scene layer:</strong> transforms, raycasts, animation, particles, camera behavior.</li>
              <li><strong>Domain layer:</strong> objectives, dialogue transitions, inventory rules, rewards, progression.</li>
              <li><strong>Application layer:</strong> creates systems, registers game-specific behavior, and binds UI.</li>
              <li><strong>Platform layer:</strong> storage, lifecycle, input, commerce, notifications, and native APIs.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Data flow</div>
          <div className="ow-en-copy">
            <h2>Use facts for coordination and stores for durable state.</h2>
            <p>
              A typed event says that something happened. A store answers what is true now. Keeping
              those roles separate prevents an event bus from becoming hidden state and prevents
              React components from becoming the only place where game logic can run.
            </p>
            <pre className="ow-en-code"><code>{`// R3F scene adapter: translate a visual interaction into a domain fact
function Chest({ id }: { id: string }) {
  return (
    <mesh onClick={() => gameEvents.emit('entity:interact', {
      kind: 'building',
      id,
    })}>
      {/* geometry and material */}
    </mesh>
  )
}

// Application composition root
const quests = createQuestEngine({ quests: QUESTS, effects, conditions, events: gameEvents })

// React HUD is a projection of durable state
const activeQuests = useStore(quests.store, (state) => state.active)`}</code></pre>
            <p>
              This produces a one-way flow: scene interaction becomes a fact; domain engines update
              their own state; UI renders a projection. Audio, achievements, analytics, and network
              replication may observe the same fact without the scene importing any of them.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Frame loop</div>
          <div className="ow-en-copy">
            <h2>Do not turn every RPG system into a useFrame callback.</h2>
            <p>
              Per-frame work is appropriate for interpolation, camera motion, animation, and spatial
              queries that truly change each frame. Most RPG rules are event-driven or clock-driven.
              Updating them only when relevant input arrives reduces work and makes behavior easier
              to replay.
            </p>
            <ol>
              <li>Sample device input and translate it into stable game actions.</li>
              <li>Advance movement or simulation using an explicit delta or fixed step.</li>
              <li>Emit domain facts such as movement, interaction, damage, or time-of-day changes.</li>
              <li>Let domain engines react synchronously or through a controlled scheduler.</li>
              <li>Render current state through React subscriptions with narrow selectors.</li>
            </ol>
            <p>
              For multiplayer games, the server can run steps 2–4 without R3F. The client keeps the
              renderer and interpolation while the protocol carries commands, snapshots, or events.
            </p>
            <p>
              For the concrete store, ref, selector, and event boundaries, read the{' '}
              <Link href="/en/react-three-fiber-game-state-management">
                React Three Fiber game state management guide
              </Link>.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Composition</div>
          <div className="ow-en-copy">
            <h2>Keep game-specific behavior in one visible composition root.</h2>
            <p>
              Generic packages cannot know what “grant gold,” “has reputation,” or “unlock recipe”
              means in your game. Store those references as serializable content and register the
              actual behavior when the app starts. This keeps content editable while avoiding direct
              imports between systems.
            </p>
            <pre className="ow-en-code"><code>{`const conditions = createConditionRegistry<GameContext>()
const effects = createEffectRegistry<GameContext>()

conditions.register('player.minLevel', ({ level }, ctx) =>
  ctx.player.level >= Number(level)
)

effects.register('wallet.addGold', ({ amount }, ctx) =>
  ctx.wallet.add(Number(amount))
)

export const game = {
  quests: createQuestEngine({ quests: QUESTS, conditions, effects, context, events }),
  dialogue: createDialogueEngine({ dialogues: DIALOGUES, conditions, effects, context, events }),
}`}</code></pre>
            <p>
              The composition root is also the right place to choose platform storage, create a room-
              scoped event bus, attach development tools, and decide which packages the product
              actually needs.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Adoption</div>
          <div className="ow-en-copy">
            <h2>Migrate one vertical slice at a time.</h2>
            <p>
              Begin with a flow that crosses the architecture: interact with an entity, progress a
              quest, grant a reward, and update the HUD. Once that flow works, the boundary is proven.
              You can then move the next system without pausing rendering work or rewriting the game.
            </p>
            <div className="ow-en-next">
              <h2>Next: decouple quest progression</h2>
              <p>
                See how event-driven objectives and registered rewards create a quest engine that
                runs in R3F, tests, and authoritative servers.
              </p>
              <Link className="ow-en-link" href="/en/headless-typescript-quest-system">
                Read the headless quest system guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
