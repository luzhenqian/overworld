import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/react-three-fiber-rpg-starter';
const title = 'React Three Fiber RPG Starter in TypeScript';
const description =
  'Run a tested React Three Fiber RPG starter with movement, dialogue, quests, inventory, rewards, HUD, AI, multiplayer presence, and deterministic TypeScript tests.';

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
      about: ['React Three Fiber', 'TypeScript', 'RPG starter', 'Three.js'],
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

export default function ReactThreeFiberRpgStarter() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>R3F RPG starter</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Runnable starter · Tested vertical slice</p>
          <h1>A React Three Fiber RPG starter that begins with gameplay, not a spinning cube.</h1>
          <p className="ow-en-deck">
            Run a complete interaction → dialogue → quest → collection → reward → HUD loop.
            The starter uses geometric fallbacks, so you can verify the architecture before
            downloading art or committing to a production world.
          </p>
          <div className="ow-en-actions">
            <a href={`${siteConfig.repositoryUrl}/tree/main/examples/starter`}>View starter source →</a>
            <Link href="/docs/starter">Read the file-by-file guide</Link>
          </div>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Run it</div>
          <div className="ow-en-copy">
            <h2>Clone, build, and play the vertical slice.</h2>
            <pre className="ow-en-code"><code>{`git clone https://github.com/luzhenqian/overworld.git
cd overworld
corepack enable
pnpm install
pnpm build
pnpm --filter starter dev`}</code></pre>
            <p>
              Walk with WASD or the virtual joystick, talk to the guide with E, accept the crystal
              quest, collect three items, receive the reward, and return for a condition-gated
              dialogue choice. The same scene also demonstrates a minimap, day/night state, AI
              navigation, localization, an editor, and cross-tab multiplayer presence.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Composition root</div>
          <div className="ow-en-copy">
            <h2>Create systems together, but keep their state separate.</h2>
            <p>
              The starter&apos;s engine module is the one place where content, registries, stores,
              and events meet. A factory creates isolated instances for tests; the production
              application passes the shared event bus explicitly.
            </p>
            <pre className="ow-en-code"><code>{`export function createEngines(overrides = {}) {
  const events = overrides.events ?? new EventBus()
  const rng = overrides.rng ?? { next: Math.random }
  const conditions = createConditionRegistry()
  const effects = createEffectRegistry()

  const quests = createQuestEngine({
    quests: QUESTS, conditions, effects, events, persist: false,
  })
  const inventory = createInventory({ items: ITEMS, effects, events })
  const loot = createLootTable(LOOT_POOL, { rng })

  effects.register('loot.random', () => inventory.add(loot.roll(), 1))
  return { events, conditions, effects, quests, inventory, loot }
}`}</code></pre>
            <p>
              Content refers to effects such as <code>quest.start</code> and{' '}
              <code>wallet.add</code> by identifier. It does not import the wallet, quest engine,
              React UI, or scene. That makes content serializable and statically validatable.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Scene boundary</div>
          <div className="ow-en-copy">
            <h2>Let the scene report facts instead of owning RPG rules.</h2>
            <p>
              R3F owns frames, transforms, cameras, materials, and pointer hits. When a player
              reaches an item, the scene emits a typed gameplay fact. Domain systems update their
              own state, and the HUD renders projections from those stores.
            </p>
            <pre className="ow-en-code"><code>{`function Crystal({ id, position }) {
  const collect = () => {
    inventory.add('energy_crystal', 1)
    gameEvents.emit('item:collected', {
      itemId: 'energy_crystal',
      quantity: 1,
    })
  }

  return (
    <mesh position={position} onClick={collect}>
      <octahedronGeometry />
      <meshStandardMaterial color="#62d6ff" />
    </mesh>
  )
}`}</code></pre>
            <p>
              In the full starter, proximity collection and input arbitration add production detail.
              The important boundary stays the same: a mesh does not mutate quest internals, and a
              quest does not know that the item was rendered by R3F.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Read the source</div>
          <div className="ow-en-copy">
            <h2>Trace one flow through six small files.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card"><h3>content.ts</h3><p>NPCs, dialogue, quests, items, achievements, and declarative references.</p></article>
              <article className="ow-en-card"><h3>engines.ts</h3><p>Composition root, registries, systems, event wiring, AI, and presence.</p></article>
              <article className="ow-en-card"><h3>World.tsx</h3><p>Player, NPCs, lighting, collection checks, and minimap markers.</p></article>
              <article className="ow-en-card"><h3>HUD.tsx</h3><p>Quest tracking, dialogue, inventory, notifications, and touch controls.</p></article>
              <article className="ow-en-card"><h3>loot.ts</h3><p>A game-specific random mechanic with an injected random source.</p></article>
              <article className="ow-en-card"><h3>__tests__</h3><p>Engine wiring, input lifecycle, seeded loot, and state snapshots.</p></article>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Verify and extend</div>
          <div className="ow-en-copy">
            <h2>Protect the architecture before adding production art.</h2>
            <pre className="ow-en-code"><code>{`pnpm --filter starter test
pnpm --filter starter typecheck
pnpm --filter starter build`}</code></pre>
            <p>
              Extend the slice one seam at a time: replace geometric fallbacks with GLB assets,
              replace in-memory persistence with a platform adapter, or replace BroadcastChannel
              presence with WebSocket transport. Avoid moving domain rules back into frame callbacks
              as the scene becomes more detailed.
            </p>
            <div className="ow-en-next">
              <h2>Decide which layer you actually need</h2>
              <p>Compare renderers, RPG system layers, full frameworks, and multiplayer backends by responsibility.</p>
              <Link className="ow-en-link" href="/en/typescript-rpg-framework-comparison">
                Read the TypeScript RPG framework comparison →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
