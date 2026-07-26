import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/headless-typescript-inventory-system';
const title = 'Headless TypeScript Inventory System Guide';
const description =
  'Design a headless TypeScript inventory system with item definitions, stacking, capacity, overflow, effects, persistence, game events, and React UI projections.';

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
      ...articleStructuredDataFields(path),
      headline: title,
      description,
      url: absoluteUrl(path),
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'Overworld Engine contributors' },
      about: ['TypeScript', 'inventory system', 'item system', 'RPG architecture'],
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

export default function HeadlessInventorySystemGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Headless inventory system</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Implementation guide · TypeScript item state</p>
          <h1>A headless TypeScript inventory system with explicit stacking and capacity.</h1>
          <p className="ow-en-deck">
            Separate immutable item definitions from mutable slot state. Then inventory rules can
            run in React, a Three.js client, tests, save migrations, or an authoritative server
            without depending on a grid component.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Model</div>
          <div className="ow-en-copy">
            <h2>Definitions describe items; slots describe ownership.</h2>
            <p>
              Item definitions belong to content and ship with the current build. Inventory slots
              are player state and belong in saves or server snapshots. Mixing them duplicates item
              metadata in every save and makes balance changes difficult to migrate.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Item definition</h3>
                <p>ID, localization keys, category, icon hint, stack rules, use effects, and metadata.</p>
              </article>
              <article className="ow-en-card">
                <h3>Inventory slot</h3>
                <p>An item ID and mutable quantity, constrained by max stack and container capacity.</p>
              </article>
              <article className="ow-en-card">
                <h3>Aggregated entry</h3>
                <p>A query view that combines quantities across slots for counts, filters, and UI.</p>
              </article>
              <article className="ow-en-card">
                <h3>Effect reference</h3>
                <p>A serializable instruction resolved by game-owned behavior when an item is used.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Definitions</div>
          <div className="ow-en-copy">
            <h2>Keep item behavior declarative and game-specific.</h2>
            <pre className="ow-en-code"><code>{`const items = [
  {
    id: 'potion',
    name: 'item.potion.name',
    description: 'item.potion.description',
    category: 'consumable',
    icon: 'potion-red',
    stackable: true,
    maxStack: 99,
    consumable: true,
    useEffects: [
      { type: 'player.heal', params: { amount: 25 } },
    ],
  },
  {
    id: 'bronze-sword',
    name: 'item.bronzeSword.name',
    category: 'weapon',
    stackable: false,
    metadata: { equipmentSlot: 'main-hand' },
  },
]`}</code></pre>
            <p>
              The inventory engine does not know what healing or equipment means. It enforces item
              and container mechanics, then asks the game&apos;s effect registry to perform a use
              effect. Equipment, crafting, durability, and trading can remain separate systems that
              consume inventory facts.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Transactions</div>
          <div className="ow-en-copy">
            <h2>Make overflow and failure visible to callers.</h2>
            <p>
              Adding an item should fill compatible stacks before opening new slots. If capacity is
              exhausted, callers need the exact amount added and the overflow so a world pickup,
              mailbox, trade, or reward system can decide what happens next.
            </p>
            <pre className="ow-en-code"><code>{`import { createEffectRegistry } from '@overworld-engine/core'
import { createInventory } from '@overworld-engine/inventory'

const effects = createEffectRegistry<GameContext>()
effects.register('player.heal', ({ amount }, ctx) =>
  ctx.player.heal(Number(amount))
)

const inventory = createInventory({
  items,
  capacity: 20,
  effects,
  context: () => gameContext,
  persist: { name: 'inventory' },
})

const result = inventory.add('potion', 120)
// { success: true, added: 120, overflow: 0 } when slots permit

inventory.remove('potion', 5) // all-or-nothing boolean
inventory.use('potion')       // run heal effect, then consume one
inventory.count('potion')     // aggregate quantity across slots`}</code></pre>
            <p>
              Overworld removal is atomic: requesting more than the owned quantity fails instead of
              partially removing items. Use explicit return values rather than inferring success
              from a UI animation or a later store read.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Events and UI</div>
          <div className="ow-en-copy">
            <h2>Broadcast inventory facts; render state through selectors.</h2>
            <p>
              Inventory changes emit <code>item:added</code>, <code>item:removed</code>, and{' '}
              <code>item:used</code>. A collection quest or analytics pipeline can observe those
              events without the inventory package importing either system.
            </p>
            <pre className="ow-en-code"><code>{`gameEvents.on('item:added', ({ itemId, total }) => {
  // quest, achievement, analytics, audio, or replication adapter
})

function InventoryGrid() {
  const slots = useStore(inventory.store, (state) => state.slots)

  return (
    <ul>
      {slots.map((slot, index) => (
        <li key={index}>
          {translate(inventory.getDefinition(slot.itemId)?.name)}
          <span>{slot.quantity}</span>
        </li>
      ))}
    </ul>
  )
}`}</code></pre>
            <p>
              Drag-and-drop, focus management, tooltips, gamepad navigation, and responsive layout
              belong in the UI. The store remains usable from React, another renderer, or no
              renderer.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Authority</div>
          <div className="ow-en-copy">
            <h2>Persist slots locally—or validate mutations on the server.</h2>
            <p>
              In a single-player game, persist only slot state and reload definitions from the
              current content version. Add migrations for renamed item IDs and changed capacity.
              Never rely on a saved display name or effect function.
            </p>
            <p>
              In a competitive multiplayer game, clients should request inventory operations rather
              than writing authoritative slots directly. The server validates ownership, capacity,
              trade rules, and reward provenance, applies the mutation, then sends a snapshot or
              accepted event back to the client.
            </p>
            <div className="ow-en-next">
              <h2>Move shared inventory rules to the server</h2>
              <p>
                Use the same deterministic mutation code behind validated inputs and reconcile the
                client with authoritative state.
              </p>
              <Link className="ow-en-link" href="/en/authoritative-multiplayer-typescript">
                Read the authoritative multiplayer guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
